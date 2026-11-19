"""Audit relay: keeps every reviewer's annotations on the lab machine, so they are not only in one browser.

    python relay/relay.py [settings.json]                      run the relay (default settings: relay/relay.local.json)
    python relay/relay.py [settings.json] --export <folder>    write each reviewer's annotations as the page's JSON export

Python 3.9 or later, standard library only; the backup to a private Hugging Face dataset also needs huggingface_hub,
and is skipped (with a note in the log) without it or without a token.

The audit page (GitHub Pages) calls it through the lab's tunnel, under the URL prefix of the settings
(default /api/ophth-audit). It follows the lab's Retify relay:

Reviewers come in by name: the page sends what the reviewer typed, the relay lists the sessions whose name shares a
word with it, and the reviewer enters one or makes a new one. Entering gives that browser a key; the relay keeps only
its hash. Annotations are accepted only with a key of their session, so one reviewer's browser cannot write into
another's session by accident. Anyone who types another reviewer's name can still enter that session; every
annotation is therefore appended to a log that is never rewritten, with the time and a salted hash of the caller's
IP, so a change can be traced and undone.

An annotation is one case of the page's export: {case_id, q1_ophthalmic .. q7_pii, note, annotated_at,
time_spent_s}, and, when the page pre-fills the AI's answers, ai ({q1_ophthalmic .. q7_pii: the AI's answer the case
showed}) and ai_model. Answers (and the AI's answers) are checked against the rubric (the page's guidelines.js) and the case ids against the case
list (data/manifest.js), both read from guidelines_url and manifest_url (a URL or a file) and read again every hour;
skip logic as in the page: when q1_ophthalmic is "no", q2-q6 are "na". The later annotated_at wins.

Everyone may see everyone's progress (how many cases each session completed), never the annotations and never
session ids (an id is enough to enter a session). Names in it are masked ("Tina" -> "Ti*a", "Sai" -> "S*i").

Files in data_dir (outside the repository):
  sessions.json                         sessions: id, name, created, hashes of their keys
  log/<manifest_version>/<session>.jsonl     every accepted annotation, appended
  current/<manifest_version>/<session>.json  the latest annotation per case
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sys
import threading
import time
import unicodedata
import urllib.request
from collections import defaultdict, deque
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

VERSION = 1
HERE = Path(__file__).resolve().parent
MAX_BODY = 1024 * 1024
MAX_BATCH = 200
MAX_NOTE = 2000
MAX_NAME = 80
MAX_MODEL = 200
MAX_TIME_SPENT = 10 ** 6
SESSION = re.compile(r"^s[0-9a-f]{8}$")
SET_ID = re.compile(r"^[A-Za-z0-9._-]{1,80}$")
ISO = re.compile(r"^(\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?)(\.\d{1,9})?(Z|[+-]\d\d:\d\d)?$")
QIDS = ["q1_ophthalmic", "q2_modality", "q3_crop", "q4_image_text", "q5_faithful", "q6_clinical", "q7_pii"]
TOOL, TOOL_VERSION = "ophth-audit", "1.0"

DEFAULTS = {
    "manifest_url": "",                 # the page's data/manifest.js (URL or file): the case ids
    "guidelines_url": "",               # the page's guidelines.js (URL or file): the questions and answer codes
    "data_dir": "",                     # where the annotations are kept, outside the repository
    "host": "127.0.0.1",
    "port": 8097,
    "prefix": "/api/ophth-audit",       # the URL path the tunnel sends to the relay
    "origins": [],                      # pages that may call the relay, e.g. "https://<owner>.github.io"; "http://127.0.0.1:*" for tests
    "per_second": 10,                   # requests per IP, averaged over 10 s
    "annotations_per_day": 20000,       # per IP (every answer of the 7 questions is one)
    "sessions_per_day": 50,             # new sessions per IP
    "hf": {"repo": "", "token_env": "AUDIT_HF_TOKEN", "token_file": "", "every_minutes": 5},
}


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def when(s) -> float | None:
    """An ISO-8601 time ("2026-11-18T09:41:07-07:00", "...Z", "....123Z") -> seconds since 1970; None if it is not one.
    A time without an offset is taken as UTC."""
    if not isinstance(s, str):
        return None
    m = ISO.match(s.strip())
    if not m:
        return None
    base, frac, off = m.group(1), m.group(2) or "", m.group(3) or "+00:00"
    if len(base) == 16:
        base += ":00"
    if off == "Z":
        off = "+00:00"
    frac = (frac + "000000")[:7] if frac else ""          # Python 3.9 reads 3 or 6 digits only
    try:
        return datetime.fromisoformat(base + frac + off).timestamp()
    except ValueError:
        return None


def masked(name: str) -> str:
    """A name with the middle of each word hidden: the first half and the last letter stay. "Tina" -> "Ti*a",
    "Sai" -> "S*i", "Vascullensky" -> "Vascul*****y", "Wang," -> "Wa*g,"."""
    def one(w: str) -> str:
        core = w.rstrip(",.;")
        tail = w[len(core):]
        n = len(core)
        if n <= 1:
            return w
        if n == 2:
            return core[0] + "*" + tail
        keep = n // 2
        return core[:keep] + "*" * (n - keep - 1) + core[-1] + tail
    return " ".join(one(w) for w in name.split())


def words(name: str) -> set:
    """The words of a name, without case, accents or punctuation: "Wang, Yalin" -> {"wang", "yalin"}."""
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    found = {w for w in re.split(r"[^a-z0-9]+", plain) if len(w) >= 2}
    # names in other scripts have no ASCII letters: keep them whole
    return found or {name.strip().lower()} - {""}


def slugify(name: str) -> str:
    """The rater slug of the export contract (the page and analyze_audit.py use the same rule)."""
    s = re.sub(r"[^a-z0-9]+", "-", str(name or "").lower()).strip("-")[:40]
    return s or "rater"


def js_value(text: str, var: str):
    """The object literal assigned to window.<var> in one of the page's .js data files."""
    m = re.search(r"(?:window\.)?" + re.escape(var) + r"\s*=\s*", text)
    if not m:
        raise ValueError("no assignment to " + var)
    body = text[m.end():]
    try:
        return json.loads(body[: body.rstrip().rstrip(";").rstrip().rfind("}") + 1])
    except ValueError:  # comments or unquoted keys: the repository's full parser
        sys.path.insert(0, str(HERE.parent / "tools"))
        from build_agent_spec import _js_literal_to_json  # noqa: E402
        return json.loads(_js_literal_to_json(text, m.end()))


def read_source(src: str) -> str:
    if src.startswith(("http://", "https://", "file:")):
        with urllib.request.urlopen(src, timeout=20) as r:
            return r.read().decode("utf-8-sig")
    return Path(src).expanduser().read_text(encoding="utf-8-sig")


class HttpError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


class Store:
    """Sessions and annotations on disk, behind one lock."""

    def __init__(self, s: dict):
        self.s = s
        self.dir = Path(s["data_dir"]).expanduser()
        self.dir.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()
        self.sessions = {}
        p = self.dir / "sessions.json"
        if p.exists():
            self.sessions = json.loads(p.read_text(encoding="utf-8"))
        salt = self.dir / ".salt"
        if not salt.exists():
            salt.write_text(secrets.token_hex(16))
            os.chmod(salt, 0o600)
        self.salt = salt.read_text().strip()
        self.current = {}
        self.dirty = set()
        self._manifest = None
        self._manifest_at = 0.0
        self._rubric = None
        self._rubric_at = 0.0

    # ---------------------------------------------------------------- the case list and the rubric
    def _fetch(self, key: str, var: str, cache_name: str):
        cache = self.dir / cache_name
        try:
            v = js_value(read_source(str(self.s[key])), var)
            cache.write_text(json.dumps(v, ensure_ascii=False), encoding="utf-8")
        except Exception as e:  # offline: the last copy will do
            if not cache.exists():
                raise HttpError(503, "the %s is not reachable (%s)" % ("case list" if var == "AUDIT_MANIFEST" else "rubric", e))
            v = json.loads(cache.read_text(encoding="utf-8"))
        return v

    def manifest(self) -> dict:
        """{"set": manifest_version, "order": [case ids], "ids": set} from manifest_url, read again every hour."""
        if self._manifest is None or time.time() - self._manifest_at > 3600:
            m = self._fetch("manifest_url", "AUDIT_MANIFEST", "manifest.json")
            order = [str(c["id"]) for c in m.get("cases", []) if isinstance(c, dict) and c.get("id")]
            mv = str(m.get("manifest_version") or "")
            if not SET_ID.match(mv) or not order:
                raise HttpError(503, "the case list has no valid manifest_version or no cases")
            self._manifest = {"set": mv, "order": order, "ids": set(order)}
            self._manifest_at = time.time()
        return self._manifest

    def rubric(self) -> dict:
        """{"version", "questions": [{id, codes, required, skip_if}]} from guidelines_url, read again every hour."""
        if self._rubric is None or time.time() - self._rubric_at > 3600:
            g = self._fetch("guidelines_url", "AUDIT_GUIDELINES", "guidelines.json")
            qs = [{"id": q["id"], "codes": {str(o["code"]) for o in q.get("options", [])}, "required": bool(q.get("required")),
                   "skip_if": {k: list(v) for k, v in (q.get("skip_if") or {}).items()}} for q in g.get("questions", [])]
            if [q["id"] for q in qs] != QIDS:
                raise HttpError(503, "the rubric does not have the questions " + ", ".join(QIDS))
            self._rubric = {"version": str(g.get("version") or ""), "questions": qs}
            self._rubric_at = time.time()
        return self._rubric

    def check_set(self, set_id: str) -> dict:
        m = self.manifest()
        if set_id != m["set"]:
            raise HttpError(400, "these annotations are for another version of the cases (%r; now %r)" % (set_id, m["set"]))
        return m

    def complete(self, a: dict) -> bool:
        for q in self.rubric()["questions"]:
            if q["required"] and not a.get(q["id"]):
                return False
        return True

    def clean(self, a, ids: set) -> dict:
        """One annotation as the page sends it -> the stored form; HttpError(400) if it is not valid."""
        if not isinstance(a, dict) or a.get("case_id") not in ids:
            raise HttpError(400, "every annotation names a case of the case list")
        out = {"case_id": a["case_id"]}
        for q in self.rubric()["questions"]:
            v = a.get(q["id"], "")
            if v is None:
                v = ""
            if not isinstance(v, str):
                raise HttpError(400, "%s is a text code" % q["id"])
            out[q["id"]] = v.strip().lower()
        for q in self.rubric()["questions"]:
            v = out[q["id"]]
            skipped = any(out.get(k) in vals for k, vals in q["skip_if"].items())
            if skipped:
                if v not in ("", "na"):
                    raise HttpError(400, "%s is \"na\" when %s" % (q["id"], " or ".join(q["skip_if"])))
                out[q["id"]] = "na"
            elif v not in q["codes"] and v != "":
                raise HttpError(400, "%s: %r is not one of its answers" % (q["id"], v))
        note = a.get("note") or ""
        if not isinstance(note, str) or len(note) > MAX_NOTE:
            raise HttpError(400, "a note of at most %d characters" % MAX_NOTE)
        t = a.get("annotated_at")
        if when(t) is None:
            raise HttpError(400, "annotated_at is an ISO date and time")
        spent = a.get("time_spent_s", 0)
        if spent is None:
            spent = 0
        if isinstance(spent, bool) or not isinstance(spent, (int, float)) or not 0 <= spent <= MAX_TIME_SPENT:
            raise HttpError(400, "time_spent_s is a number of seconds")
        out.update(note=note, annotated_at=t.strip(), time_spent_s=round(float(spent), 1))
        ai = a.get("ai")
        if ai is not None:  # the AI's pre-filled answers the case showed (optional): rubric codes, "na" where skippable
            if not isinstance(ai, dict) or set(ai) - set(QIDS):
                raise HttpError(400, "ai is an object of the questions' AI answers")
            out["ai"] = {}
            for q in self.rubric()["questions"]:
                v = ai.get(q["id"], "")
                if v is None:
                    v = ""
                if not isinstance(v, str):
                    raise HttpError(400, "ai.%s is a text code" % q["id"])
                v = v.strip().lower()
                if v and v not in q["codes"] and not (v == "na" and q["skip_if"]):
                    raise HttpError(400, "ai.%s: %r is not one of its answers" % (q["id"], v))
                out["ai"][q["id"]] = v
            model = a.get("ai_model") or ""
            if not isinstance(model, str) or len(model) > MAX_MODEL:
                raise HttpError(400, "ai_model is a text of at most %d characters" % MAX_MODEL)
            out["ai_model"] = model.strip()
        elif a.get("ai_model"):
            raise HttpError(400, "ai_model comes with ai")
        return out

    # ---------------------------------------------------------------- sessions
    def _save_sessions(self):
        p = self.dir / "sessions.json"
        tmp = p.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.sessions, indent=1, ensure_ascii=False), encoding="utf-8")
        tmp.replace(p)
        self.dirty.add(p)

    def find(self, name: str) -> list:
        want = words(name)
        set_id = self.manifest()["set"]
        with self.lock:
            hits = [(len(want & set(x["words"])), sid, x) for sid, x in self.sessions.items() if want & set(x["words"])]
            hits.sort(key=lambda h: (-h[0], h[2]["name"].lower()))
            return [{"id": sid, "name": x["name"], "annotated": self.annotated(sid, set_id), "created": x["created"]}
                    for _, sid, x in hits[:10]]

    def _key(self, sid: str) -> str:
        key = secrets.token_hex(16)
        self.sessions[sid]["keys"].append(hashlib.sha256(key.encode()).hexdigest())
        self.sessions[sid]["keys"] = self.sessions[sid]["keys"][-20:]  # the browsers it was entered from lately
        return key

    def create(self, name: str) -> dict:
        name = " ".join(name.split())
        if not name or len(name) > MAX_NAME or not words(name):
            raise HttpError(400, "a name of 1 to %d characters" % MAX_NAME)
        with self.lock:
            sid = "s" + secrets.token_hex(4)
            while sid in self.sessions:
                sid = "s" + secrets.token_hex(4)
            self.sessions[sid] = {"name": name, "words": sorted(words(name)), "created": now(), "keys": []}
            key = self._key(sid)
            self._save_sessions()
        return {"id": sid, "name": name, "key": key}

    def enter(self, sid: str) -> dict:
        with self.lock:
            if sid not in self.sessions:
                raise HttpError(404, "no such session")
            key = self._key(sid)
            self._save_sessions()
            return {"id": sid, "name": self.sessions[sid]["name"], "key": key}

    def check(self, sid, key):
        x = self.sessions.get(sid) if isinstance(sid, str) else None
        h = hashlib.sha256(str(key).encode()).hexdigest()
        if not x or not any(hmac.compare_digest(h, k) for k in x["keys"]):
            raise HttpError(403, "this browser has not entered that session; enter it again by name")

    # ---------------------------------------------------------------- annotations
    def _current(self, set_id: str, sid: str) -> dict:
        k = (set_id, sid)
        if k not in self.current:
            p = self.dir / "current" / set_id / ("%s.json" % sid)
            self.current[k] = json.loads(p.read_text(encoding="utf-8"))["annotations"] if p.exists() else {}
        return self.current[k]

    def annotated(self, sid: str, set_id: str) -> int:
        """The cases a session completed (every required question answered, or "na" by skip logic)."""
        return sum(1 for a in self._current(set_id, sid).values() if self.complete(a))

    def annotations(self, set_id: str, sid: str) -> dict:
        with self.lock:
            return {k: dict(v) for k, v in self._current(set_id, sid).items()}

    def put(self, set_id: str, sid: str, items: list, ip: str) -> int:
        ids = self.check_set(set_id)["ids"]
        clean = [self.clean(a, ids) for a in items]   # one bad item rejects the batch
        who = hashlib.sha256((self.salt + ip).encode()).hexdigest()[:16]
        received = now()
        with self.lock:
            cur = self._current(set_id, sid)
            log = self.dir / "log" / set_id / ("%s.jsonl" % sid)
            log.parent.mkdir(parents=True, exist_ok=True)
            with log.open("a", encoding="utf-8") as f:
                for a in clean:
                    f.write(json.dumps({**a, "received": received, "ip": who}, ensure_ascii=False) + "\n")
                    rec = {k: v for k, v in a.items() if k != "case_id"}
                    old = cur.get(a["case_id"])
                    t_new, t_old = when(rec["annotated_at"]), when(old["annotated_at"]) if old else None
                    if old is None or t_old is None or t_new > t_old:
                        cur[a["case_id"]] = rec
                    elif t_new == t_old:  # the same annotation again, with more time spent on the case
                        rec["time_spent_s"] = max(rec["time_spent_s"], old.get("time_spent_s") or 0)
                        cur[a["case_id"]] = rec
            p = self.dir / "current" / set_id / ("%s.json" % sid)
            p.parent.mkdir(parents=True, exist_ok=True)
            tmp = p.with_suffix(".tmp")
            tmp.write_text(json.dumps({"set": set_id, "session": sid, "name": self.sessions[sid]["name"], "annotations": cur},
                                      indent=1, ensure_ascii=False), encoding="utf-8")
            tmp.replace(p)
            self.dirty.update({p, log})
        return len(clean)

    def _first(self, set_id: str, sid: str) -> str:
        """When the session first annotated in the set: the first line of its log, which is never rewritten."""
        k = ("first", set_id, sid)
        if k not in self.current:
            log = self.dir / "log" / set_id / ("%s.jsonl" % sid)
            first = ""
            if log.exists():
                with log.open(encoding="utf-8") as f:
                    line = f.readline()
                first = json.loads(line)["received"] if line.strip() else ""
            if not first:
                return ""
            self.current[k] = first
        return self.current[k]

    def progress(self, set_id: str, me: str = "") -> dict:
        """Each reviewer's count with the masked name, in the order they first annotated; the caller's marked "you"."""
        m = self.check_set(set_id)
        with self.lock:
            rows = []
            for sid in self.sessions:
                n = self.annotated(sid, set_id)
                if n:  # sessions without a completed case (a mistyped name, say) are left out
                    rows.append({"sid": sid, "first": self._first(set_id, sid), "annotated": n})
        rows.sort(key=lambda r: (r["first"], r["sid"]))
        out = [dict({"annotator": i + 1, "name": masked(self.sessions[r["sid"]]["name"]), "annotated": r["annotated"]},
                    **({"you": True} if r["sid"] == me else {})) for i, r in enumerate(rows)]
        return {"set": set_id, "cases": len(m["order"]), "annotators": out}

    # ---------------------------------------------------------------- the export the analysis reads
    def export(self, out: Path, set_id: str = "") -> list:
        """Each reviewer's annotations as the page's JSON export (SPEC), ophth_audit_<slug>_<YYYYMMDD-HHMM>.json.
        Sessions with the same rater slug (the same name typed twice) go into one file, the later annotation per case."""
        m = self.manifest()
        set_id = set_id or m["set"]
        order = m["order"] if set_id == m["set"] else None
        g = self.rubric()
        by_slug = {}
        with self.lock:
            for sid, x in self.sessions.items():
                ann = self._current(set_id, sid)
                if not ann:
                    continue
                e = by_slug.setdefault(slugify(x["name"]), {"name": x["name"], "ann": {}})
                for cid, a in ann.items():
                    old = e["ann"].get(cid)
                    if old is None or (when(a["annotated_at"]) or 0) > (when(old["annotated_at"]) or 0):
                        e["ann"][cid] = a
        out.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().astimezone()
        written = []
        for slug, e in sorted(by_slug.items()):
            blank = {**{q: "" for q in QIDS}, "note": "", "annotated_at": "", "time_spent_s": 0}
            if any("ai" in x for x in e["ann"].values()):  # AI pre-filled answers: every case has the fields, as on the page
                blank.update(ai={q: "" for q in QIDS}, ai_model="")
            ids = order if order is not None else sorted(e["ann"])
            doc = {"tool": TOOL, "tool_version": TOOL_VERSION, "rubric_version": g["version"], "manifest_version": set_id,
                   "exported_at": stamp.isoformat(timespec="seconds"),
                   "rater": {"name": e["name"], "role": "", "years_experience": None},
                   "annotations": {cid: {**blank, **e["ann"].get(cid, {})} for cid in ids}}
            p = out / ("ophth_audit_%s_%s.json" % (slug, stamp.strftime("%Y%m%d-%H%M")))
            p.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            written.append(p)
        return written


class Limiter:
    def __init__(self, s: dict):
        self.s = s
        self.hits = defaultdict(deque)
        self.day = ""
        self.count = defaultdict(int)
        self.lock = threading.Lock()

    def take(self, ip: str, what: str = "", n: int = 0, limit: int = 0):
        with self.lock:
            t = time.time()
            q = self.hits[ip]
            while q and q[0] < t - 10:
                q.popleft()
            if len(q) >= self.s["per_second"] * 10:
                raise HttpError(429, "too many requests; wait a few seconds")
            q.append(t)
            if what:
                today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
                if today != self.day:
                    self.day, self.count = today, defaultdict(int)
                if self.count[(ip, what)] + n > limit:
                    raise HttpError(429, "the daily limit of %s from this address is reached" % what)
                self.count[(ip, what)] += n


class Backup(threading.Thread):
    """Copies changed files to a private Hugging Face dataset, one commit every few minutes at most."""

    def __init__(self, store: Store, s: dict):
        super().__init__(daemon=True)
        self.store, self.s = store, s["hf"]

    def token(self) -> str:
        if self.s.get("token_env") and os.environ.get(self.s["token_env"]):
            return os.environ[self.s["token_env"]]
        if self.s.get("token_file"):
            return Path(self.s["token_file"]).expanduser().read_text().strip()
        return ""

    def run(self):
        try:
            from huggingface_hub import CommitOperationAdd, HfApi
        except ImportError:
            print("backup off: huggingface_hub is not installed", flush=True)
            return
        api, every = HfApi(), max(1, int(self.s.get("every_minutes", 5))) * 60
        while True:
            time.sleep(every)
            with self.store.lock:
                changed, self.store.dirty = set(self.store.dirty), set()
                public = {sid: {k: v for k, v in x.items() if k != "keys"} for sid, x in self.store.sessions.items()}
            if not changed:
                continue
            try:
                ops = []
                for p in sorted(changed):
                    rel = p.relative_to(self.store.dir).as_posix()
                    if rel == "sessions.json":  # the keys stay on this machine
                        ops.append(CommitOperationAdd(rel, json.dumps(public, indent=1, ensure_ascii=False).encode()))
                    else:
                        ops.append(CommitOperationAdd(rel, p.read_bytes()))
                api.create_commit(self.s["repo"], ops, repo_type="dataset", token=self.token(),
                                  commit_message="annotations up to %s" % now())
                print("backup: %d files to %s" % (len(ops), self.s["repo"]), flush=True)
            except Exception as e:  # the files here are the record; try again next time
                with self.store.lock:
                    self.store.dirty |= changed
                print("backup failed, will retry: %s: %s" % (type(e).__name__, e), flush=True)


def make_handler(store: Store, limiter: Limiter, s: dict):
    prefix = "/" + str(s.get("prefix") or DEFAULTS["prefix"]).strip("/")

    def allowed(origin: str) -> bool:
        for o in s["origins"]:
            if o.endswith(":*") and re.fullmatch(re.escape(o[:-2]) + r":\d+", origin):
                return True
            if origin == o:
                return True
        return False

    class Handler(BaseHTTPRequestHandler):
        server_version = "ophth-audit-relay"

        def log_message(self, *a):
            pass

        def ip(self) -> str:
            host = self.client_address[0]
            # through the tunnel every request comes from this machine; the tunnel names the visitor
            if host in ("127.0.0.1", "::1") and self.headers.get("CF-Connecting-IP"):
                return self.headers["CF-Connecting-IP"]
            return host

        def send(self, status: int, body: dict):
            data = json.dumps(body, ensure_ascii=False).encode()
            self.send_response(status)
            origin = self.headers.get("Origin", "")
            if origin and allowed(origin):
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def body(self) -> dict:
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_BODY:
                raise HttpError(413, "the request is too large")
            try:
                v = json.loads(self.rfile.read(n) or b"{}")
            except ValueError:
                raise HttpError(400, "the body is not JSON")
            if not isinstance(v, dict):
                raise HttpError(400, "the body is a JSON object")
            return v

        def key(self) -> str:
            return self.headers.get("X-Audit-Key", "")

        def handle_one(self, method: str):
            origin = self.headers.get("Origin")
            if origin and not allowed(origin):
                raise HttpError(403, "this page may not use the relay")
            u = urlparse(self.path)
            path, q = u.path, {k: v[0] for k, v in parse_qs(u.query).items()}
            if not path.startswith(prefix + "/"):
                raise HttpError(404, "not found")
            path = path[len(prefix):]
            ip = self.ip()
            limiter.take(ip)
            if method == "GET" and path == "/status":
                m = store.manifest()
                store.rubric()
                return {"ok": True, "version": VERSION, "set": m["set"], "cases": len(m["order"])}
            if method == "GET" and path == "/progress":
                sid = q.get("session", "")
                if sid:  # only a browser holding that session's key learns which row is its own
                    try:
                        store.check(sid, self.key())
                    except HttpError:
                        sid = ""
                return store.progress(q.get("set", ""), sid)
            if method == "POST" and path == "/sessions/find":
                name = str(self.body().get("name", ""))[:MAX_NAME]
                return {"matches": store.find(name)}
            if method == "POST" and path == "/sessions":
                b = self.body()
                limiter.take(ip, "new sessions", 1, s["sessions_per_day"])
                return store.create(str(b.get("name", "")))
            if method == "POST" and path == "/sessions/enter":
                sid = str(self.body().get("id", ""))
                if not SESSION.match(sid):
                    raise HttpError(400, "a session id")
                return store.enter(sid)
            if method == "GET" and path == "/annotations":
                sid = q.get("session", "")
                store.check(sid, self.key())
                store.check_set(q.get("set", ""))
                return {"set": q["set"], "annotations": store.annotations(q["set"], sid)}
            if method == "POST" and path == "/annotations":
                b = self.body()
                sid, items = b.get("session"), b.get("annotations")
                store.check(sid, self.key())
                if not isinstance(items, list) or not 1 <= len(items) <= MAX_BATCH:
                    raise HttpError(400, "annotations: a list of 1 to %d" % MAX_BATCH)
                limiter.take(ip, "annotations", len(items), s["annotations_per_day"])
                return {"stored": store.put(str(b.get("set", "")), sid, items, ip), "server_time": now()}
            raise HttpError(404, "not found")

        def run(self, method: str):
            try:
                self.send(200, self.handle_one(method))
            except HttpError as e:
                self.send(e.status, {"error": str(e)})
            except Exception as e:
                print("error: %s: %s" % (type(e).__name__, e), flush=True)
                self.send(500, {"error": "the relay failed; your annotations are still in your browser"})

        def do_GET(self):
            self.run("GET")

        def do_POST(self):
            self.run("POST")

        def do_OPTIONS(self):
            origin = self.headers.get("Origin", "")
            self.send_response(204 if allowed(origin) else 403)
            if allowed(origin):
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Access-Control-Allow-Methods", "GET, POST")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Audit-Key")
                self.send_header("Access-Control-Max-Age", "600")
                self.send_header("Vary", "Origin")
            self.end_headers()

    return Handler


def settings(path: Path) -> dict:
    s = {**DEFAULTS, **json.loads(path.read_text(encoding="utf-8"))}
    s["hf"] = {**DEFAULTS["hf"], **s.get("hf", {})}
    if not s["manifest_url"] or not s["guidelines_url"] or not s["data_dir"]:
        sys.exit("%s: manifest_url, guidelines_url and data_dir are required" % path)
    return s


def main(argv=None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    export_to = ""
    if "--export" in args:
        k = args.index("--export")
        if k + 1 >= len(args):
            sys.exit("--export needs a folder")
        export_to = args[k + 1]
        del args[k:k + 2]
    path = Path(args[0]) if args else HERE / "relay.local.json"
    s = settings(path)
    store = Store(s)
    if export_to:
        for p in store.export(Path(export_to).expanduser()):
            print(p)
        return 0
    if s["hf"]["repo"]:
        Backup(store, s).start()
    else:
        print("backup off: no hf.repo in the settings", flush=True)
    server = ThreadingHTTPServer((s["host"], s["port"]), make_handler(store, Limiter(s), s))
    print("audit relay on http://%s:%d/%s/status, annotations in %s" % (s["host"], s["port"], str(s["prefix"]).strip("/"), store.dir), flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
