"""Unit tests of tools/build_ai_prefill.py: the majority of K runs, ties (run 1), skip logic, the note, and that the
fixture's data/ai_prefill.js is what tests/fixture/ai_runs give. Python 3.9 or later, standard library only.

    python tests/test_ai_prefill.py
"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import build_ai_prefill as b  # noqa: E402

G = b.parse_js_assignment(ROOT / "web" / "guidelines.js", "AUDIT_GUIDELINES")
CODES = {q["id"]: {o["code"] for o in q["options"]} for q in G["questions"]}
MANIFEST = {"manifest_version": "m1", "cases": [{"id": "X1"}, {"id": "X2"}, {"id": "X3"}]}


def run(k, cases):
    return {"manifest_version": "m1", "exported_at": "2026-11-18T01:0%d:00-07:00" % k, "rater": {"name": "lab/m#%d" % k},
            "annotations": {cid: dict(zip(b.QIDS, codes.split()), note="run %d %s" % (k, cid)) for cid, codes in cases.items()}}


class PrefillTest(unittest.TestCase):
    def test_majority_ties_skip_and_note(self):
        runs = [run(1, {"X1": "yes oct good full full correct no", "X2": "no na na na na na no", "X3": "unsure angio bad none unsupported major yes"}),
                run(2, {"X1": "yes cfp good full partial correct no", "X2": "yes oct good full full correct yes", "X3": "yes oct bad none xx major yes"}),
                run(3, {"X1": "yes uwf good partial partial correct no", "X2": "no na na na na na yes"})]
        d = b.build(runs, CODES, MANIFEST)
        x1, x2, x3 = d["answers"]["X1"], d["answers"]["X2"], d["answers"]["X3"]
        self.assertEqual((d["model"], d["runs"], d["created"]), ("lab/m", 3, "2026-11-18T01:03:00-07:00"))
        self.assertEqual([x1[q] for q in b.QIDS], ["yes", "oct", "good", "full", "partial", "correct", "no"])  # q2: a tie -> run 1
        self.assertEqual((x1["agree"]["q2_modality"], x1["agree"]["q5_faithful"], x1["no_majority"]), (1, 2, ["q2_modality"]))
        self.assertEqual([x2[q] for q in b.QIDS], ["no", "na", "na", "na", "na", "na", "yes"])  # skip logic
        self.assertEqual(x2["note"], "run 3 X2")                     # the run that agrees on the most questions
        # X3: run 3 has no answer; q1 unsure vs yes is a tie (1 of 3) -> run 1; q5 "xx" is no vote
        self.assertEqual((x3["q1_ophthalmic"], x3["q2_modality"], x3["q5_faithful"]), ("unsure", "angio", "unsupported"))
        self.assertEqual((x3["agree"]["q3_crop"], x3["agree"]["q5_faithful"]), (2, 1))
        self.assertIn("q1_ophthalmic", x3["no_majority"])

    def test_fixture_is_up_to_date(self):
        runs = sorted(str(p) for p in (ROOT / "tests" / "fixture" / "ai_runs").glob("run*.json"))
        self.assertEqual(len(runs), 3)
        self.assertEqual(b.main(runs + ["--data", str(ROOT / "tests" / "fixture" / "data"), "--check"]), 0)


if __name__ == "__main__":
    unittest.main(verbosity=1)
