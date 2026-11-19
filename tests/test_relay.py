"""Unit tests of the relay: sessions by name, keys, validation against the rubric and the case list, skip logic,
later-annotated_at-wins, the append-only log, progress without annotations, CORS and limits, the backup with a fake
uploader, and the export that analyze_audit.py reads. Python 3.9 or later, standard library only.

    python tests/test_relay.py
"""
import json
import sys
import tempfile
import threading
import time
import types
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "relay"))
import relay  # noqa: E402

PAGE = "https://example.github.io"
FIXTURE = ROOT / "tests" / "fixture" / "data" / "manifest.js"
GUIDE = ROOT / "web" / "guidelines.js"
MV = relay.js_value(FIXTURE.read_text(encoding="utf-8"), "AUDIT_MANIFEST")["manifest_version"]
PREFIX = "/api/ophth-audit"


def rec(case, t="2026-11-18T10:00:00-07:00", **kw):
    a = {"case_id": case, "q1_ophthalmic": "yes", "q2_modality": "oct", "q3_crop": "good", "q4_image_text": "full",
         "q5_faithful": "full", "q6_clinical": "correct", "q7_pii": "no", "note": "", "annotated_at": t, "time_spent_s": 12.5}
    a.update(kw)
    return a


class Base(unittest.TestCase):
    extra = {}

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.s = {**relay.DEFAULTS, "manifest_url": str(FIXTURE), "guidelines_url": str(GUIDE),
                  "data_dir": str(self.tmp / "answers"), "origins": [PAGE, "http://127.0.0.1:*"], "port": 0,
                  "sessions_per_day": 3, **self.extra}
        self.store = relay.Store(self.s)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), relay.make_handler(self.store, relay.Limiter(self.s), self.s))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.base = "http://127.0.0.1:%d%s" % (self.server.server_address[1], PREFIX)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def call(self, method, path, body=None, key="", origin=PAGE):
        req = urllib.request.Request(self.base + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json", "Origin": origin, "X-Audit-Key": key})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read()), r.headers
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}"), e.headers

    def session(self, name):
        st, a, _ = self.call("POST", "/sessions", {"name": name})
        self.assertEqual(st, 200, a)
        return a

    def post(self, a, *items, set_id=MV):
        return self.call("POST", "/annotations", {"set": set_id, "session": a["id"], "annotations": list(items)}, key=a["key"])


class RelayTest(Base):
    def test_status(self):
        st, s, _ = self.call("GET", "/status")
        self.assertEqual((st, s["ok"], s["set"], s["cases"]), (200, True, MV, 6))
        self.assertEqual(self.call("GET", "/elsewhere")[0], 404)

    def test_sessions_by_name(self):
        a = self.session("Wang, Yalin")
        self.assertTrue(relay.SESSION.match(a["id"]) and len(a["key"]) == 32)
        for typed in ("wang", "YALIN", "Yalin Wang", "wáng"):
            _, f, _ = self.call("POST", "/sessions/find", {"name": typed})
            self.assertEqual([m["id"] for m in f["matches"]], [a["id"]], typed)
        _, f, _ = self.call("POST", "/sessions/find", {"name": "Smith"})
        self.assertEqual(f["matches"], [])
        _, b, _ = self.call("POST", "/sessions/enter", {"id": a["id"]})
        for k in (a["key"], b["key"]):
            self.assertEqual(self.call("GET", "/annotations?set=%s&session=%s" % (MV, a["id"]), key=k)[0], 200)
        self.assertEqual(self.call("POST", "/sessions/enter", {"id": "s00000000"})[0], 404)
        self.assertNotIn(a["key"], (self.tmp / "answers" / "sessions.json").read_text())

    def test_keys_separate_sessions(self):
        a, b = self.session("Reviewer One"), self.session("Reviewer Two")
        st, _, _ = self.call("POST", "/annotations", {"set": MV, "session": a["id"], "annotations": [rec("T001")]}, key=b["key"])
        self.assertEqual(st, 403)
        st, r, _ = self.post(a, rec("T001"))
        self.assertEqual((st, r["stored"]), (200, 1))
        self.assertEqual(self.call("GET", "/annotations?set=%s&session=%s" % (MV, a["id"]), key=b["key"])[0], 403)

    def test_validation(self):
        a = self.session("Val Idator")
        bad = [
            [rec("T999")],                                  # not a case
            [rec("T001", q2_modality="xray")],              # not an answer of q2
            [rec("T001", q1_ophthalmic="na")],              # na only by skip logic
            [rec("T001", q1_ophthalmic="no", q2_modality="oct")],   # q2-q6 are na when q1 is no
            [rec("T001", q3_crop=3)],
            [rec("T001", note="x" * 2001)],
            [rec("T001", annotated_at="yesterday")],
            [rec("T001", annotated_at="")],
            [rec("T001", time_spent_s=-1)],
            [rec("T001", time_spent_s=True)],
            [],
            [rec("T001"), rec("T999")],                    # one bad item rejects the batch
        ]
        for items in bad:
            st, r, _ = self.post(a, *items)
            self.assertEqual(st, 400, (items, r))
        self.assertEqual(self.post(a, rec("T001"), set_id="v0-old")[0], 400)
        self.assertEqual(self.store.annotations(MV, a["id"]), {})
        big = {"set": MV, "session": a["id"], "annotations": [rec("T001", note="x" * 2000)] * 600}
        self.assertEqual(self.call("POST", "/annotations", big, key=a["key"])[0], 413)
        self.assertEqual(self.call("POST", "/sessions", {"name": "   "})[0], 400)

    def test_skip_logic_and_partial(self):
        a = self.session("Skip Logic")
        skip = {q: "" for q in relay.QIDS[1:6]}
        st, _, _ = self.post(a, rec("T001", q1_ophthalmic="no", **skip), rec("T002", q3_crop="", q7_pii="", note="half done"),
                             rec("T003", annotated_at="2026-11-18T17:00:00.123Z", q2_modality="OCT"))
        self.assertEqual(st, 200)
        got = self.store.annotations(MV, a["id"])
        self.assertEqual([got["T001"][q] for q in relay.QIDS], ["no", "na", "na", "na", "na", "na", "no"])
        self.assertEqual(got["T003"]["q2_modality"], "oct")
        self.assertEqual(self.store.annotated(a["id"], MV), 2)   # T002 is not complete

    def test_ai_prefill_fields(self):
        a = self.session("Pre Filled")
        ai = {"q1_ophthalmic": "yes", "q2_modality": "cfp", "q3_crop": "good", "q4_image_text": "partial",
              "q5_faithful": "full", "q6_clinical": "minor", "q7_pii": "no"}
        ai_no = {"q1_ophthalmic": "no", **{q: "na" for q in relay.QIDS[1:6]}, "q7_pii": "yes"}
        bad = [
            rec("T001", ai={**ai, "q2_modality": "xray"}),     # not an answer of q2
            rec("T001", ai={**ai, "q1_ophthalmic": "na"}),     # na only where skip logic allows it
            rec("T001", ai={**ai, "q9": "yes"}),               # not a question
            rec("T001", ai=["yes"]),
            rec("T001", ai={**ai, "q3_crop": 1}),
            rec("T001", ai=ai, ai_model="m" * 201),
            rec("T001", ai_model="some/model"),                # ai_model without ai
        ]
        for item in bad:
            self.assertEqual(self.post(a, item)[0], 400, item)
        st, _, _ = self.post(a, rec("T001", ai=ai, ai_model="lab/model"), rec("T002", ai=ai_no, ai_model="lab/model",
                             **{"q1_ophthalmic": "no", **{q: "na" for q in relay.QIDS[1:6]}}), rec("T003"))
        self.assertEqual(st, 200)
        got = self.store.annotations(MV, a["id"])
        self.assertEqual((got["T001"]["ai"], got["T001"]["ai_model"]), (ai, "lab/model"))
        self.assertEqual(got["T002"]["ai"], ai_no)
        self.assertNotIn("ai", got["T003"])                    # optional: a record without it stays as it was
        # the answers stay the reviewer's: kept (T001 q2 oct != cfp is a change) or confirmed, as the analysis reads them
        self.assertEqual(got["T001"]["q2_modality"], "oct")
        doc = json.loads(self.store.export(self.tmp / "export")[0].read_text(encoding="utf-8"))
        self.assertEqual(list(doc["annotations"]["T001"]), relay.QIDS + ["note", "annotated_at", "time_spent_s", "ai", "ai_model"])
        self.assertEqual(doc["annotations"]["T004"]["ai"], {q: "" for q in relay.QIDS})
        self.assertEqual(doc["annotations"]["T001"]["ai"]["q2_modality"], "cfp")

    def test_later_time_wins_and_log_is_kept(self):
        a = self.session("Time Keeper")
        self.post(a, rec("T001", "2026-11-18T10:00:05-07:00", q3_crop="bad"))
        self.post(a, rec("T001", "2026-11-18T16:59:00Z", q3_crop="partial"))    # earlier in UTC: an old one arriving late
        self.post(a, rec("T002", "2026-11-18T10:00:02-07:00", q3_crop="partial"), rec("T002", "2026-11-18T10:00:09-07:00", q3_crop="bad"))
        self.post(a, rec("T002", "2026-11-18T10:00:09-07:00", q3_crop="bad", time_spent_s=3))   # same time: more time spent stays
        _, got, _ = self.call("GET", "/annotations?set=%s&session=%s" % (MV, a["id"]), key=a["key"])
        self.assertEqual(got["annotations"]["T001"]["q3_crop"], "bad")
        self.assertEqual(got["annotations"]["T002"]["q3_crop"], "bad")
        self.assertEqual(got["annotations"]["T002"]["time_spent_s"], 12.5)
        log = (self.tmp / "answers" / "log" / MV / ("%s.jsonl" % a["id"])).read_text().splitlines()
        self.assertEqual(len(log), 5)
        self.assertTrue(all(len(json.loads(x)["ip"]) == 16 and "127.0.0.1" not in x for x in log))
        self.assertEqual(relay.Store(self.s).annotations(MV, a["id"]), got["annotations"])

    def test_progress_shows_counts_not_annotations_or_names(self):
        a, b = self.session("Alpha Reviewer"), self.session("Beta Reviewer")
        self.session("Typo Nobody")  # never annotates: not listed
        self.post(b, rec("T002"))
        time.sleep(1.1)  # the log keeps whole seconds
        self.post(a, rec("T001"), rec("T003"), rec("T004", q7_pii=""))
        st, p, _ = self.call("GET", "/progress?set=" + MV)
        self.assertEqual((st, p["cases"]), (200, 6))
        self.assertEqual([(r["name"], r["annotated"]) for r in p["annotators"]], [("Be*a Revi***r", 1), ("Al**a Revi***r", 2)])
        text = json.dumps(p)
        for secret in ("q1_", "oct", "Alpha", "Beta", "Reviewer", a["id"], b["id"]):
            self.assertNotIn(secret, text)
        _, mine, _ = self.call("GET", "/progress?set=%s&session=%s" % (MV, a["id"]), key=a["key"])
        self.assertEqual([r.get("you", False) for r in mine["annotators"]], [False, True])
        _, forged, _ = self.call("GET", "/progress?set=%s&session=%s" % (MV, a["id"]), key=b["key"])
        self.assertFalse(any(r.get("you") for r in forged["annotators"]))

    def test_masked_names(self):
        for name, want in [("Tina", "Ti*a"), ("Sai", "S*i"), ("Tina Vascullensky", "Ti*a Vascul*****y"), ("Wang, Yalin", "Wa*g, Ya**n"),
                           ("Al", "A*"), ("J", "J")]:
            self.assertEqual(relay.masked(name), want, name)

    def test_times(self):
        self.assertEqual(relay.when("2026-11-18T10:00:00-07:00"), relay.when("2026-11-18T17:00:00Z"))
        self.assertEqual(relay.when("2026-11-18T17:00:00"), relay.when("2026-11-18T17:00:00.000Z"))
        self.assertAlmostEqual(relay.when("2026-11-18T17:00:00.5Z") - relay.when("2026-11-18T17:00:00Z"), 0.5)
        for bad in ("", "2026-11-18", "17:00", None, 5, "2026-13-40T10:00:00Z"):
            self.assertIsNone(relay.when(bad), bad)

    def test_cors_and_limits(self):
        st, _, h = self.call("GET", "/status")
        self.assertEqual((st, h["Access-Control-Allow-Origin"]), (200, PAGE))
        self.assertEqual(self.call("GET", "/status", origin="https://evil.example")[0], 403)
        self.assertEqual(self.call("GET", "/status", origin="http://127.0.0.1:8811")[0], 200)
        req = urllib.request.Request(self.base + "/annotations", method="OPTIONS", headers={"Origin": PAGE, "Access-Control-Request-Method": "POST"})
        with urllib.request.urlopen(req) as r:
            self.assertIn("X-Audit-Key", r.headers["Access-Control-Allow-Headers"])
        codes = [self.call("POST", "/sessions", {"name": "Many Names%d" % i})[0] for i in range(5)]
        self.assertEqual(codes, [200, 200, 200, 429, 429])  # sessions_per_day = 3

    def test_backup_batches_and_hides_keys(self):
        a = self.session("Backup Person")
        self.post(a, rec("T001"))
        commits = []

        class FakeApi:
            def create_commit(self, repo, ops, **kw):
                commits.append({o.path_in_repo: o.data for o in ops})

        class Op:
            def __init__(self, path, data):
                self.path_in_repo, self.data = path, data

        sys.modules["huggingface_hub"] = types.SimpleNamespace(HfApi=FakeApi, CommitOperationAdd=Op)
        real_sleep = relay.time.sleep
        relay.time.sleep = lambda s: real_sleep(0.05)
        try:
            b = relay.Backup(self.store, {**self.s, "hf": {**self.s["hf"], "repo": "x/y", "every_minutes": 1}})
            b.start()
            real_sleep(0.5)
        finally:
            relay.time.sleep = real_sleep
            del sys.modules["huggingface_hub"]
        self.assertEqual(len(commits), 1)
        files = commits[0]
        self.assertEqual(sorted(files), ["current/%s/%s.json" % (MV, a["id"]), "log/%s/%s.jsonl" % (MV, a["id"]), "sessions.json"])
        self.assertNotIn("keys", json.loads(files["sessions.json"])[a["id"]])

    def test_export_is_the_page_export(self):
        a, b = self.session("Jane O'Neil"), self.session("Jane O Neil")    # the same slug: one file
        self.post(a, rec("T001", "2026-11-18T10:00:00-07:00", q3_crop="bad"), rec("T002"))
        self.post(b, rec("T001", "2026-11-18T11:00:00-07:00", q3_crop="partial"))
        c = self.session("Other Person")
        self.post(c, rec("T003", q1_ophthalmic="no", **{q: "na" for q in relay.QIDS[1:6]}))
        out = self.tmp / "export"
        files = self.store.export(out)
        names = sorted(p.name for p in files)
        self.assertEqual(len(names), 2)
        self.assertRegex(names[0], r"^ophth_audit_jane-o-neil_\d{8}-\d{4}\.json$")
        self.assertRegex(names[1], r"^ophth_audit_other-person_\d{8}-\d{4}\.json$")
        doc = json.loads((out / names[0]).read_text(encoding="utf-8"))
        self.assertEqual((doc["tool"], doc["manifest_version"], doc["rubric_version"]), ("ophth-audit", MV, "rubric-v1"))
        self.assertEqual(list(doc["rater"]), ["name", "role", "years_experience"])
        self.assertEqual(list(doc["annotations"]), ["T001", "T002", "T003", "T004", "T005", "T006"])
        self.assertEqual(doc["annotations"]["T001"]["q3_crop"], "partial")
        self.assertEqual(list(doc["annotations"]["T002"]), relay.QIDS + ["note", "annotated_at", "time_spent_s"])
        self.assertEqual(doc["annotations"]["T004"]["q1_ophthalmic"], "")
        # the analysis reads it unchanged (when its dependencies are installed here)
        tools = ROOT.parent / "audit_tool" / "tools"
        if (tools / "analyze_audit.py").exists():
            sys.path.insert(0, str(tools))
            try:
                import analyze_audit
            except ImportError:
                return
            r = analyze_audit.read_export(out / names[1])
            self.assertEqual(r["slug"], "other-person")


if __name__ == "__main__":
    unittest.main(verbosity=1)
