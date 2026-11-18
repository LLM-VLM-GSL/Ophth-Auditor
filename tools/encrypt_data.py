#!/usr/bin/env python3
"""Encrypt an audit data folder for the public copy of the audit page (format "ophth-audit-enc-v1").

    python tools/encrypt_data.py --src <plaintext data folder> --out <encrypted data folder> --code-file <path>
    python tools/encrypt_data.py ... --keep-salt      # rebuild; codes remembered in raters' browsers stay valid
    python tools/encrypt_data.py ... --verify-only    # decrypt <out> and compare it with <src>; writes nothing

Needs the Python package "cryptography".

Input, --src: the plaintext data folder of the offline package: manifest.js (window.AUDIT_MANIFEST = {...}) and the
media files it names (paths relative to index.html, e.g. "data/images/A001.jpg", "data/audio/A001.mp3"; the audio
of a case may be null).

Output, --out (the page's data/ folder), format "ophth-audit-enc-v1":
  meta.json        plaintext, exactly these keys:
                   {"format": "ophth-audit-enc-v1", "dataset": <manifest_version>, "created": <ISO-8601 time>,
                    "kdf": {"name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": <base64, 16 bytes>},
                    "cipher": "AES-256-GCM", "manifest": "manifest.bin", "n_cases": <number of cases>}
  manifest.bin     the manifest object as UTF-8 JSON, unchanged except that the media paths of every case become
                   "data/images/<id>.bin" and "data/audio/<id>.bin" (audio stays null when there is none) and every
                   case gains "image_type" and "audio_type", the MIME types of its media (audio_type null without audio)
  images/<id>.bin  the image, byte for byte; audio/<id>.bin: the audio clip, byte for byte
Every .bin file is a 12-byte random IV followed by the AES-256-GCM ciphertext and its 128-bit tag. The additional
authenticated data is the UTF-8 path of the file relative to the data folder ("manifest.bin", "images/A001.bin"), so
encrypted files cannot be swapped for one another. The key (32 bytes) is PBKDF2-HMAC-SHA256(access code, salt,
iterations), after normalizing the code: lowercase, every character outside [a-z0-9] dropped. web/app.js derives the
same key with Web Crypto.

The access code is read from --code-file. When that file does not exist, a random code is generated (--groups groups
of 4 characters from 23456789abcdefghjkmnpqrstuvwxyz, joined by "-"; 6 groups = 119 bits by default) and written
there; only the path is printed, never the code. The code file must be outside the repository that holds --out.

--keep-salt reuses the salt and iteration count of <out>/meta.json, so that keys remembered in raters' browsers stay
valid when the data is rebuilt (for example with a second batch of cases); the code must stay the same. Files whose
content did not change are kept as they are, so a rebuild only changes what changed.

Safety: --out must not overlap --src. Its contents are replaced only when it is empty, already holds encrypted data
of this format, or holds nothing but files of this layout; otherwise the script refuses. Only meta.json and .bin
files are written into it, and every other file found there is removed. After writing, every file is decrypted again
with the code read back from --code-file and compared (SHA-256) with its source, and the folder must hold exactly the
expected files. Exit status: 0 verified, 1 a check failed, 2 refused (bad arguments, unsafe paths).
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import hashlib
import json
import math
import os
import re
import secrets
import sys
import time
from pathlib import Path

try:
    from cryptography.exceptions import InvalidTag
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
except ImportError:  # pragma: no cover
    sys.exit("encrypt_data.py needs the Python package 'cryptography' (pip install cryptography)")

FORMAT = "ophth-audit-enc-v1"
CIPHER = "AES-256-GCM"
ITERATIONS = 600_000
SALT_BYTES, IV_BYTES, TAG_BYTES = 16, 12, 16
ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"          # no 0/o, 1/l/i
GROUP_LEN, DEFAULT_GROUPS, MIN_GROUPS = 4, 6, 5
MANIFEST_BIN = "manifest.bin"
META_KEYS = ["format", "dataset", "created", "kdf", "cipher", "manifest", "n_cases"]
MEDIA_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
               ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".ogg": "audio/ogg"}
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
# what may be found in --out: this layout, plus temporary files of an interrupted run
LAYOUT_RE = re.compile(r"^(?:meta\.json|manifest\.bin|(?:images|audio)/[A-Za-z0-9_-]{1,40}\.bin)(?:\.[0-9a-f]{8}\.part)?$")


class Refused(Exception):
    """Bad arguments or unsafe paths (exit status 2)."""


# ----------------------------------------------------------------------------- the code and the key
def normalize_code(code: str) -> str:
    """Lowercase, every character outside [a-z0-9] dropped (the page does the same)."""
    return re.sub(r"[^a-z0-9]", "", str(code).lower())


def generate_code(groups: int = DEFAULT_GROUPS) -> str:
    return "-".join("".join(secrets.choice(ALPHABET) for _ in range(GROUP_LEN)) for _ in range(groups))


def code_bits(groups: int) -> float:
    return groups * GROUP_LEN * math.log2(len(ALPHABET))


def derive_key(code: str, salt: bytes, iterations: int) -> bytes:
    norm = normalize_code(code)
    if not norm:
        raise Refused("the access code is empty")
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iterations).derive(norm.encode("ascii"))


def seal(key: bytes, rel: str, data: bytes) -> bytes:
    """Encrypt one file: IV | ciphertext | tag, with its data-relative path as additional authenticated data."""
    iv = secrets.token_bytes(IV_BYTES)
    return iv + AESGCM(key).encrypt(iv, data, rel.encode("utf-8"))


def unseal(key: bytes, rel: str, blob: bytes) -> bytes:
    """Decrypt one file; raises InvalidTag when the key, the path or the bytes do not match."""
    if len(blob) < IV_BYTES + TAG_BYTES:
        raise InvalidTag()
    return AESGCM(key).decrypt(blob[:IV_BYTES], blob[IV_BYTES:], rel.encode("utf-8"))


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


# ----------------------------------------------------------------------------- the plaintext source
def read_manifest(src: Path) -> dict:
    p = src / "manifest.js"
    if not p.is_file():
        raise Refused(f"{p} not found (--src must be the plaintext data folder that holds manifest.js)")
    text = p.read_text(encoding="utf-8-sig")
    try:
        m = json.loads(text[text.index("{"): text.rindex("}") + 1])
    except ValueError as e:
        raise Refused(f"{p} is not a valid manifest ({e})")
    if not isinstance(m, dict) or not isinstance(m.get("manifest_version"), str) or not m["manifest_version"]:
        raise Refused(f"{p} has no manifest_version")
    if not isinstance(m.get("cases"), list) or not m["cases"]:
        raise Refused(f"{p} has no cases")
    seen = set()
    for k, c in enumerate(m["cases"]):
        if not isinstance(c, dict) or not isinstance(c.get("id"), str) or not ID_RE.match(c["id"]):
            raise Refused(f"{p}: case {k + 1} has no valid id")
        if c["id"] in seen:
            raise Refused(f"{p}: the case id {c['id']} appears twice")
        seen.add(c["id"])
    return m


def source_file(src: Path, path, kind: str, cid: str):
    """A media path of the manifest (relative to index.html, "data/images/A001.jpg") -> (file in --src, MIME type)."""
    if not isinstance(path, str) or not path.strip():
        raise Refused(f"case {cid}: no {kind} path")
    p = path.strip().replace("\\", "/")
    if p.startswith("./"):
        p = p[2:]
    parts = p.split("/")
    if parts[0] != "data" or len(parts) < 2 or any(x in ("", ".", "..") for x in parts[1:]):
        raise Refused(f"case {cid}: the {kind} path {path!r} is not a file inside data/")
    f = src.joinpath(*parts[1:])
    if not f.is_file():
        raise Refused(f"case {cid}: the {kind} file {f} was not found")
    mime = MEDIA_TYPES.get(f.suffix.lower(), "")
    if not mime.startswith(kind + "/"):
        raise Refused(f"case {cid}: the {kind} file {f.name} has an unsupported type")
    return f, mime


def plan(src: Path, manifest: dict):
    """-> (the manifest object that goes into manifest.bin, {data-relative output path: source file})."""
    files, cases = {}, []
    for c in manifest["cases"]:
        cid = c["id"]
        img, img_type = source_file(src, c.get("image"), "image", cid)
        aud, aud_type = source_file(src, c["audio"], "audio", cid) if c.get("audio") else (None, None)
        out = {}
        for k, v in c.items():
            if k in ("image_type", "audio_type"):
                continue
            if k == "image":
                out["image"], out["image_type"] = f"data/images/{cid}.bin", img_type
            elif k == "audio":
                out["audio"], out["audio_type"] = (f"data/audio/{cid}.bin" if aud else None), aud_type
            else:
                out[k] = v
        if "audio" not in out:
            out["audio"], out["audio_type"] = None, None
        files[f"images/{cid}.bin"] = img
        if aud:
            files[f"audio/{cid}.bin"] = aud
        cases.append(out)
    return {k: (cases if k == "cases" else v) for k, v in manifest.items()}, files


def manifest_bytes(enc_manifest: dict) -> bytes:
    return json.dumps(enc_manifest, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


# ----------------------------------------------------------------------------- the output folder
def is_within(p: Path, root: Path) -> bool:
    try:
        p.relative_to(root)
        return True
    except ValueError:
        return False


def repo_root(p: Path):
    for d in (p, *p.parents):
        if (d / ".git").exists():
            return d
    return None


def check_paths(src: Path, out: Path, code_file: Path):
    if not src.is_dir():
        raise Refused(f"--src {src} is not a folder")
    if out == src or is_within(out, src) or is_within(src, out):
        raise Refused("--out must not be --src, be inside it, or contain it")
    if is_within(code_file, out) or is_within(code_file, src):
        raise Refused("the code file must not be inside --out or --src")
    repo = repo_root(out)
    if repo is not None and is_within(code_file, repo):
        raise Refused(f"the code file must not be inside the repository {repo}: it would be published")


def out_files(out: Path) -> dict:
    return {p.relative_to(out).as_posix(): p for p in out.rglob("*") if p.is_file()} if out.is_dir() else {}


def read_meta(out: Path):
    p = out / "meta.json"
    try:
        m = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return m if isinstance(m, dict) and m.get("format") == FORMAT else None


def check_out(out: Path):
    """--out may be replaced only when it is missing, empty, encrypted data of this format, or only this layout."""
    if out.exists() and not out.is_dir():
        raise Refused(f"--out {out} is not a folder")
    files = out_files(out)
    if not files or read_meta(out) is not None or all(LAYOUT_RE.match(r) for r in files):
        return
    first = sorted(r for r in files if not LAYOUT_RE.match(r))[0]
    raise Refused(f"--out {out} holds files that are not encrypted audit data (e.g. {first}) and no {FORMAT} "
                  "meta.json; refusing to remove them. Empty the folder, or choose another --out.")


def atomic_write(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.{secrets.token_hex(4)}.part")
    with open(tmp, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    for k in range(60):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:                     # Windows: another program holds the file for a moment
            if k == 59:
                tmp.unlink(missing_ok=True)
                raise
            time.sleep(0.05)


def remove_stale(out: Path, keep: set) -> list:
    removed = []
    for rel, p in sorted(out_files(out).items()):
        if rel not in keep:
            p.unlink()
            removed.append(rel)
    for d in sorted((d for d in out.rglob("*") if d.is_dir()), key=lambda d: len(d.parts), reverse=True):
        if not any(d.iterdir()):
            d.rmdir()
    return removed


def load_or_create_code(code_file: Path, groups: int):
    """-> (code, created). A new code is written with owner-only permissions where the OS supports them."""
    if code_file.exists():
        code = code_file.read_text(encoding="utf-8-sig").strip()
        if not normalize_code(code):
            raise Refused(f"the code file {code_file} holds no code")
        return code, False
    code = generate_code(groups)
    code_file.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(code_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
        f.write(code + "\n")
    return code, True


def read_code(code_file: Path) -> str:
    if not code_file.is_file():
        raise Refused(f"the code file {code_file} does not exist")
    code = code_file.read_text(encoding="utf-8-sig").strip()
    if not normalize_code(code):
        raise Refused(f"the code file {code_file} holds no code")
    return code


# ----------------------------------------------------------------------------- build and verify
def build(src: Path, out: Path, code: str, keep_salt: bool) -> dict:
    manifest = read_manifest(src)
    enc_manifest, files = plan(src, manifest)
    old = read_meta(out)
    if keep_salt:
        if old is None:
            raise Refused("--keep-salt needs encrypted data in --out (its meta.json) to take the salt from")
        try:
            salt = base64.b64decode(old["kdf"]["salt"], validate=True)
            iterations = int(old["kdf"]["iterations"])
        except (KeyError, TypeError, ValueError):
            raise Refused("--keep-salt: the kdf block of the existing meta.json is not valid")
    else:
        salt, iterations = secrets.token_bytes(SALT_BYTES), ITERATIONS
    key = derive_key(code, salt, iterations)
    if keep_salt:
        rel = old.get("manifest", MANIFEST_BIN)
        if isinstance(rel, str) and (out / rel).is_file():
            try:
                unseal(key, rel, (out / rel).read_bytes())
            except InvalidTag:
                raise Refused("--keep-salt: the data in --out was encrypted with another access code. Use the code "
                              "file of that build, or leave out --keep-salt (raters then need the new code).")
    out.mkdir(parents=True, exist_ok=True)
    stats = {"written": 0, "kept": 0}

    def put(rel: str, plain: bytes):
        assert LAYOUT_RE.match(rel) and rel.endswith(".bin"), rel      # only ciphertext goes into --out
        target = out / rel
        if target.is_file():                        # unchanged content under the same key: keep the file as it is
            try:
                if unseal(key, rel, target.read_bytes()) == plain:
                    stats["kept"] += 1
                    return
            except InvalidTag:
                pass
        blob = seal(key, rel, plain)
        assert blob[IV_BYTES:IV_BYTES + 64] != plain[:64]
        atomic_write(target, blob)
        stats["written"] += 1

    for rel, f in files.items():
        put(rel, f.read_bytes())
    put(MANIFEST_BIN, manifest_bytes(enc_manifest))
    meta = {"format": FORMAT, "dataset": manifest["manifest_version"],
            "created": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
            "kdf": {"name": "PBKDF2", "hash": "SHA-256", "iterations": iterations,
                    "salt": base64.b64encode(salt).decode("ascii")},
            "cipher": CIPHER, "manifest": MANIFEST_BIN, "n_cases": len(manifest["cases"])}
    same = old is not None and list(old) == META_KEYS and all(old[k] == meta[k] for k in META_KEYS if k != "created")
    if stats["written"] or not same:                # unchanged data keeps its meta.json (and its "created")
        try:                                        # "created" versions the media URLs in the page: always newer
            before = dt.datetime.fromisoformat(old["created"]) if old else None
        except (TypeError, ValueError):
            before = None
        if before is not None and before.tzinfo is not None and dt.datetime.fromisoformat(meta["created"]) <= before:
            meta["created"] = (before + dt.timedelta(seconds=1)).astimezone(dt.timezone.utc).isoformat()
        atomic_write(out / "meta.json", (json.dumps(meta, indent=2) + "\n").encode("utf-8"))
    stats["removed"] = remove_stale(out, set(files) | {MANIFEST_BIN, "meta.json"})
    stats["files"] = len(files)
    return stats


def verify(src: Path, out: Path, code: str):
    """Decrypt everything in --out and compare it with --src. -> (problems, number of media files verified)."""
    problems = []
    manifest = read_manifest(src)
    enc_manifest, files = plan(src, manifest)
    meta = read_meta(out)
    if meta is None:
        return [f"{out / 'meta.json'} is missing or is not {FORMAT}"], 0
    if list(meta) != META_KEYS:
        problems.append(f"meta.json keys {list(meta)} are not exactly {META_KEYS}")
    kdf = meta.get("kdf") if isinstance(meta.get("kdf"), dict) else {}
    try:
        salt = base64.b64decode(kdf.get("salt", ""), validate=True)
    except (TypeError, ValueError):
        salt = b""
    checks = [("dataset", meta.get("dataset") == manifest["manifest_version"]), ("cipher", meta.get("cipher") == CIPHER),
              ("manifest", meta.get("manifest") == MANIFEST_BIN), ("n_cases", meta.get("n_cases") == len(manifest["cases"])),
              ("kdf", list(kdf) == ["name", "hash", "iterations", "salt"] and kdf.get("name") == "PBKDF2"
               and kdf.get("hash") == "SHA-256" and isinstance(kdf.get("iterations"), int) and kdf["iterations"] >= 100_000
               and len(salt) == SALT_BYTES),
              ("created", isinstance(meta.get("created"), str) and bool(meta.get("created")))]
    problems += [f"meta.json: {k} is not as expected" for k, ok in checks if not ok]
    if problems:
        return problems, 0
    key = derive_key(code, salt, kdf["iterations"])
    present = out_files(out)
    expected = set(files) | {MANIFEST_BIN, "meta.json"}
    extra, missing = sorted(set(present) - expected), sorted(expected - set(present))
    if extra:
        problems.append(f"{len(extra)} unexpected file(s) in {out}, e.g. {extra[:3]}")
    if missing:
        problems.append(f"{len(missing)} missing file(s) in {out}, e.g. {missing[:3]}")
    want = manifest_bytes(enc_manifest)
    if MANIFEST_BIN in present:
        try:
            got = unseal(key, MANIFEST_BIN, present[MANIFEST_BIN].read_bytes())
            if sha256(got) != sha256(want) or json.loads(got.decode("utf-8")) != enc_manifest:
                problems.append("manifest.bin does not decrypt to the expected manifest")
        except InvalidTag:
            problems.append("manifest.bin does not decrypt with the access code")
    n_ok = 0
    plain_hashes = {sha256((src / "manifest.js").read_bytes()), sha256(want)}
    for rel, f in files.items():
        source = f.read_bytes()
        plain_hashes.add(sha256(source))
        if rel not in present:
            continue
        try:
            got = unseal(key, rel, present[rel].read_bytes())
        except InvalidTag:
            problems.append(f"{rel} does not decrypt with the access code")
            continue
        if sha256(got) != sha256(source):
            problems.append(f"{rel}: SHA-256 differs from its source {f.name}")
            continue
        n_ok += 1
    for rel, p in present.items():                  # belt and braces: no plaintext copy of any source
        if sha256(p.read_bytes()) in plain_hashes:
            problems.append(f"{rel} is a plaintext copy of a source file")
    return problems, n_ok


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Encrypt the audit data folder for the public page (ophth-audit-enc-v1).")
    ap.add_argument("--src", required=True, type=Path, help="plaintext data folder (manifest.js, images/, audio/)")
    ap.add_argument("--out", required=True, type=Path, help="encrypted data folder to write (the site's web/data)")
    ap.add_argument("--code-file", required=True, type=Path,
                    help="file with the access code; created with a new random code when missing (keep it outside the repository)")
    ap.add_argument("--keep-salt", action="store_true", help="reuse the salt and iterations of <out>/meta.json")
    ap.add_argument("--verify-only", action="store_true", help="only decrypt <out> and compare it with <src>")
    ap.add_argument("--groups", type=int, default=DEFAULT_GROUPS,
                    help=f"groups of {GROUP_LEN} characters in a new code (default %(default)s = "
                         f"{code_bits(DEFAULT_GROUPS):.0f} bits; at least {MIN_GROUPS})")
    a = ap.parse_args(argv)
    src, out, code_file = (p.expanduser().resolve() for p in (a.src, a.out, a.code_file))
    try:
        check_paths(src, out, code_file)
        plan(src, read_manifest(src))               # the whole source is checked before anything is written
        if not a.verify_only:
            if a.groups < MIN_GROUPS:
                raise Refused(f"--groups must be at least {MIN_GROUPS}")
            check_out(out)
            code, created = load_or_create_code(code_file, a.groups)
            if created:
                print(f"new access code ({a.groups} groups of {GROUP_LEN} characters, {code_bits(a.groups):.0f} bits) "
                      f"written to {code_file}")
            elif len(normalize_code(code)) < 20:
                print(f"warning: the access code in {code_file} is short ({len(normalize_code(code))} characters)")
            st = build(src, out, code, a.keep_salt)
            print(f"{out}: {st['files']} media files and manifest.bin; {st['written']} written, {st['kept']} unchanged; "
                  f"{len(st['removed'])} stale file(s) removed" + (f" (e.g. {st['removed'][:3]})" if st["removed"] else ""))
        problems, n_ok = verify(src, out, read_code(code_file))
    except Refused as e:
        print(f"refused: {e}", file=sys.stderr)
        return 2
    if problems:
        print("VERIFICATION FAILED:", file=sys.stderr)
        for p in problems:
            print("  " + p, file=sys.stderr)
        return 1
    print(f"verified: meta.json, manifest.bin and {n_ok} media files decrypt to their sources (SHA-256 identical); "
          f"nothing else is in {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
