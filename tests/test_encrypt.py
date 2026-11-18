#!/usr/bin/env python3
"""Round-trip tests of tools/encrypt_data.py on the dummy fixture (tests/fixture/data).

    python tests/test_encrypt.py          (or: python -m pytest tests/test_encrypt.py)

Needs the Python package "cryptography". Decryption here is written independently of the tool (AESGCM and
PBKDF2HMAC directly), so the tests check the documented format, not only the tool against itself.
"""
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools" / "encrypt_data.py"
FIXTURE = ROOT / "tests" / "fixture" / "data"
CODE = "2345-6789-abcd-efgh-jkmn-pqrs"            # a dummy code for dummy data
META_KEYS = ["format", "dataset", "created", "kdf", "cipher", "manifest", "n_cases"]
sys.path.insert(0, str(ROOT / "tools"))
import encrypt_data as ed  # noqa: E402


def run(*args):
    return subprocess.run([sys.executable, "-B", str(TOOL), *map(str, args)], capture_output=True, text=True, timeout=300)


def key_for(code, meta):
    norm = re.sub(r"[^a-z0-9]", "", code.lower())
    k = meta["kdf"]
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=base64.b64decode(k["salt"]),
                      iterations=k["iterations"]).derive(norm.encode())


def open_file(key, out, rel):
    blob = (out / rel).read_bytes()
    return AESGCM(key).decrypt(blob[:12], blob[12:], rel.encode("utf-8"))


def source_manifest(src):
    s = (src / "manifest.js").read_text(encoding="utf-8")
    return json.loads(s[s.index("{"): s.rindex("}") + 1])


def sha(b):
    return hashlib.sha256(b).hexdigest()


def tree(out):
    return {p.relative_to(out).as_posix(): p.read_bytes() for p in sorted(out.rglob("*")) if p.is_file()}


class EncryptDataTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="enc-test-"))
        self.code_file = self.tmp / "code.txt"
        self.code_file.write_text(CODE + "\n", encoding="utf-8")
        self.out = self.tmp / "out" / "data"

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def build(self, *extra, src=FIXTURE, out=None, code_file=None):
        r = run("--src", src, "--out", out or self.out, "--code-file", code_file or self.code_file, *extra)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return r

    def test_round_trip_and_format(self):
        self.build()
        meta = json.loads((self.out / "meta.json").read_text(encoding="utf-8"))
        self.assertEqual(list(meta), META_KEYS)
        src = source_manifest(FIXTURE)
        self.assertEqual(meta["format"], "ophth-audit-enc-v1")
        self.assertEqual(meta["dataset"], src["manifest_version"])
        self.assertEqual(meta["cipher"], "AES-256-GCM")
        self.assertEqual(meta["manifest"], "manifest.bin")
        self.assertEqual(meta["n_cases"], len(src["cases"]))
        self.assertEqual(meta["kdf"]["name"], "PBKDF2")
        self.assertEqual(meta["kdf"]["hash"], "SHA-256")
        self.assertEqual(meta["kdf"]["iterations"], 600000)
        self.assertEqual(len(base64.b64decode(meta["kdf"]["salt"])), 16)
        key = key_for(CODE, meta)
        man = json.loads(open_file(key, self.out, "manifest.bin").decode("utf-8"))
        self.assertEqual(man["manifest_version"], src["manifest_version"])
        self.assertEqual([c["id"] for c in man["cases"]], [c["id"] for c in src["cases"]])
        expected_files = {"meta.json", "manifest.bin"}
        for c, s in zip(man["cases"], src["cases"]):
            for k in s:                             # every field kept, except the media paths
                if k not in ("image", "audio"):
                    self.assertEqual(c[k], s[k], (c["id"], k))
            self.assertEqual(c["image"], "data/images/%s.bin" % c["id"])
            self.assertEqual(c["image_type"], "image/jpeg")
            rel = "images/%s.bin" % c["id"]
            expected_files.add(rel)
            self.assertEqual(sha(open_file(key, self.out, rel)), sha((FIXTURE / "images" / (c["id"] + ".jpg")).read_bytes()))
            if s["audio"]:
                self.assertEqual((c["audio"], c["audio_type"]), ("data/audio/%s.bin" % c["id"], "audio/mpeg"))
                rel = "audio/%s.bin" % c["id"]
                expected_files.add(rel)
                self.assertEqual(sha(open_file(key, self.out, rel)), sha((FIXTURE / "audio" / (c["id"] + ".mp3")).read_bytes()))
            else:
                self.assertIsNone(c["audio"])
                self.assertIsNone(c["audio_type"])
        self.assertEqual(set(tree(self.out)), expected_files)
        for rel, b in tree(self.out).items():    # IVs are random and never repeat; nothing is plaintext
            if rel.endswith(".bin"):
                self.assertNotIn(b[12:40], (FIXTURE / "manifest.js").read_bytes())
        ivs = [b[:12] for rel, b in tree(self.out).items() if rel.endswith(".bin")]
        self.assertEqual(len(ivs), len(set(ivs)))

    def test_wrong_code_and_swapped_files_fail(self):
        self.build()
        meta = json.loads((self.out / "meta.json").read_text(encoding="utf-8"))
        with self.assertRaises(InvalidTag):
            open_file(key_for("2345-6789-abcd-efgh-jkmn-pqrz", meta), self.out, "manifest.bin")
        key = key_for(CODE, meta)
        blob = (self.out / "images" / "T001.bin").read_bytes()
        with self.assertRaises(InvalidTag):        # the path is authenticated: a file cannot pose as another
            AESGCM(key).decrypt(blob[:12], blob[12:], b"images/T002.bin")
        # the code is normalized: capitals, spaces and dashes do not matter
        self.assertEqual(key_for(" 2345 6789 ABCD-efgh jkmn PQRS ", meta), key)

    def test_code_generation(self):
        for groups in (5, 6, 8):
            code = ed.generate_code(groups)
            self.assertRegex(code, r"^[23456789abcdefghjkmnpqrstuvwxyz]{4}(-[23456789abcdefghjkmnpqrstuvwxyz]{4}){%d}$" % (groups - 1))
        self.assertGreaterEqual(ed.code_bits(ed.DEFAULT_GROUPS), 100)
        self.assertEqual(len(ed.ALPHABET), 31)
        self.assertEqual(len({ed.generate_code() for _ in range(200)}), 200)
        self.assertEqual(ed.normalize_code(" AbC-12 x_Y!"), "abc12xy")

    def test_new_code_is_written_and_never_printed(self):
        code_file = self.tmp / "secret" / "code.txt"
        r = self.build(code_file=code_file)
        code = code_file.read_text(encoding="utf-8").strip()
        self.assertRegex(code, r"^([23456789abcdefghjkmnpqrstuvwxyz]{4}-){5}[23456789abcdefghjkmnpqrstuvwxyz]{4}$")
        printed = r.stdout + r.stderr
        self.assertIn(str(code_file), printed)
        for form in (code, code.replace("-", ""), code[:9]):
            self.assertNotIn(form, printed)
        r2 = self.build(code_file=code_file)       # the code file exists now: read, not replaced
        self.assertEqual(code_file.read_text(encoding="utf-8").strip(), code)
        self.assertNotIn("new access code", r2.stdout)

    def test_keep_salt_keeps_keys_and_unchanged_files(self):
        self.build()
        first = tree(self.out)
        self.build("--keep-salt")                  # nothing changed: nothing is rewritten
        self.assertEqual(tree(self.out), first)
        src = self.tmp / "src"                     # a changed caption: only manifest.bin and meta.json change
        shutil.copytree(FIXTURE, src)
        m = (src / "manifest.js").read_text(encoding="utf-8").replace("intact RPE.", "intact RPE (changed).")
        (src / "manifest.js").write_text(m, encoding="utf-8")
        self.build("--keep-salt", src=src)
        second = tree(self.out)
        changed = sorted(k for k in first if first[k] != second.get(k))
        self.assertEqual(changed, ["manifest.bin", "meta.json"])
        m1, m2 = json.loads(first["meta.json"]), json.loads(second["meta.json"])
        self.assertEqual(m1["kdf"], m2["kdf"])     # the same salt: remembered keys stay valid
        self.build(src=src)                       # without --keep-salt: a new salt, every file new
        third = tree(self.out)
        self.assertNotEqual(json.loads(third["meta.json"])["kdf"]["salt"], m2["kdf"]["salt"])
        self.assertTrue(all(third[k] != second[k] for k in third if k.endswith(".bin")))

    def test_keep_salt_with_another_code_is_refused(self):
        self.build()
        other = self.tmp / "other.txt"
        other.write_text("9999-8888-7777-6666-5555-4444\n", encoding="utf-8")
        before = tree(self.out)
        r = run("--src", FIXTURE, "--out", self.out, "--code-file", other, "--keep-salt")
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertIn("another access code", r.stderr)
        self.assertEqual(tree(self.out), before)

    def test_stale_and_plaintext_files_are_removed(self):
        self.build()
        shutil.copy(FIXTURE / "manifest.js", self.out / "manifest.js")
        shutil.copy(FIXTURE / "images" / "T001.jpg", self.out / "images" / "T001.jpg")
        (self.out / "audio" / "OLD9.bin").write_bytes(os.urandom(64))
        (self.out / "extra").mkdir()
        (self.out / "extra" / "notes.txt").write_text("x", encoding="utf-8")
        r = run("--src", FIXTURE, "--out", self.out, "--code-file", self.code_file, "--verify-only")
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("plaintext copy", r.stderr)
        r = self.build()
        self.assertIn("4 stale file(s) removed", r.stdout)
        files = set(tree(self.out))
        self.assertFalse({"manifest.js", "images/T001.jpg", "audio/OLD9.bin", "extra/notes.txt"} & files)
        self.assertFalse((self.out / "extra").exists())
        self.assertTrue(all(f == "meta.json" or f.endswith(".bin") for f in files))

    def test_unsafe_paths_are_refused(self):
        src = self.tmp / "src"
        shutil.copytree(FIXTURE, src)
        for out in (src, src / "enc", self.tmp):   # --out is --src, inside it, or contains it
            r = run("--src", src, "--out", out, "--code-file", self.code_file)
            self.assertEqual(r.returncode, 2, (out, r.stdout + r.stderr))
        foreign = self.tmp / "foreign"             # a folder with other content is never emptied
        foreign.mkdir()
        (foreign / "thesis.docx").write_bytes(b"x")
        r = run("--src", src, "--out", foreign, "--code-file", self.code_file)
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertEqual(sorted(p.name for p in foreign.iterdir()), ["thesis.docx"])
        repo = self.tmp / "repo"                   # the code file must not end up in the repository
        (repo / ".git").mkdir(parents=True)
        r = run("--src", src, "--out", repo / "web" / "data", "--code-file", repo / "code.txt")
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertIn("inside the repository", r.stderr)
        self.assertFalse((repo / "code.txt").exists())
        self.assertFalse((repo / "web").exists())
        r = run("--src", src, "--out", repo / "web" / "data", "--code-file", self.tmp / "outside.txt")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_verify_only_detects_damage(self):
        self.build()
        r = run("--src", FIXTURE, "--out", self.out, "--code-file", self.code_file, "--verify-only")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        img = self.out / "images" / "T003.bin"
        good = img.read_bytes()
        bad = bytearray(good)
        bad[200] ^= 1
        img.write_bytes(bytes(bad))
        r = run("--src", FIXTURE, "--out", self.out, "--code-file", self.code_file, "--verify-only")
        self.assertEqual(r.returncode, 1)
        self.assertIn("images/T003.bin does not decrypt", r.stderr)
        img.write_bytes(good)
        (self.out / "audio" / "T001.bin").unlink()
        r = run("--src", FIXTURE, "--out", self.out, "--code-file", self.code_file, "--verify-only")
        self.assertEqual(r.returncode, 1)
        self.assertIn("missing", r.stderr)
        r = run("--src", FIXTURE, "--out", self.out, "--code-file", self.tmp / "nope.txt", "--verify-only")
        self.assertEqual(r.returncode, 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
