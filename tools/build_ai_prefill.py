#!/usr/bin/env python3
"""Build the AI pre-filled answers of the audit page (data/ai_prefill.js) from K runs of one LLM.

    python tools/build_ai_prefill.py RUN1.json RUN2.json RUN3.json [--data web/data] [--guidelines web/guidelines.js]
                                     [--out <data>/ai_prefill.js] [--model <name>] [--check]

Each run is an export file of the page (or of agent/llm_annotate.py): {"manifest_version", "rater", "run",
"annotations": {case_id: {q1_ophthalmic .. q7_pii, note, ...}}}. The runs must be of the same case list as
<data>/manifest.js and of one model. Per case and question:

- the answer given by more than half of the K runs (2 of 3) is the AI's answer, and "agree" records how many runs
  gave it;
- without such a majority, the answer of the first run given that has a valid answer (run 1 first) is used, "agree"
  is the number of runs that gave that answer, and the question is listed in "no_majority";
- skip logic as on the page: when the AI's q1_ophthalmic is "no", q2-q6 are "na". Otherwise a run that answered
  q1 "no" (and so q2-q6 "na") casts no vote on q2-q6, and the majority is still counted over all K runs;
- an answer that is not one of the question's codes (rubric: guidelines.js) is no vote; a question without any vote
  is "" (the page then shows no AI answer for it);
- "note" is the note of the run whose answers agree with the AI's answers on the most questions (run 1 first on ties).

Writes window.AUDIT_AI = {model, runs, created, manifest_version, answers: {case_id: {q1_ophthalmic, ..., q7_pii,
agree: {question: n of K}, no_majority: [questions], note}}}, loaded by the page with a <script> tag (so it works
from file:// too). "created" is the latest export time of the runs, so the same runs give the same file byte for byte
(--check: exit 1 when the file differs from what the runs give). Standard library only, Python 3.9+.
"""
import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build_agent_spec import parse_js_assignment  # noqa: E402

QIDS = ["q1_ophthalmic", "q2_modality", "q3_crop", "q4_image_text", "q5_faithful", "q6_clinical", "q7_pii"]
SKIPPED = QIDS[1:6]          # "na" when q1_ophthalmic is "no"
MAX_NOTE = 2000


def model_of(run: dict) -> str:
    r = run.get("run") or {}
    if r.get("provider") and r.get("model"):
        return "%s/%s" % (r["provider"], r["model"])
    name = str((run.get("rater") or {}).get("name") or "")
    return re.sub(r"#\d+$", "", name).strip() or "unknown model"


def pick(values: list, k: int):
    """values: the K runs' answers in run order ("" = no vote). -> (answer, agree, majority)."""
    votes = [v for v in values if v]
    if not votes:
        return "", 0, False
    counts = {}
    for v in votes:
        counts[v] = counts.get(v, 0) + 1
    best = max(counts, key=lambda v: (counts[v], -votes.index(v)))
    if counts[best] * 2 > k:
        return best, counts[best], True
    return votes[0], counts[votes[0]], False


def build(runs: list, codes: dict, manifest: dict, model: str = "") -> dict:
    k = len(runs)
    ids = [c["id"] for c in manifest["cases"]]
    answers = {}
    for cid in ids:
        recs = [(r.get("annotations") or {}).get(cid) or {} for r in runs]
        val = lambda rec, q: str(rec.get(q) or "").strip().lower()   # noqa: E731
        out, agree, nomaj = {}, {}, []
        q1, n1, ok1 = pick([val(r, "q1_ophthalmic") if val(r, "q1_ophthalmic") in codes["q1_ophthalmic"] else "" for r in recs], k)
        out["q1_ophthalmic"], agree["q1_ophthalmic"] = q1, n1
        if q1 and not ok1:
            nomaj.append("q1_ophthalmic")
        for q in QIDS[1:]:
            if q in SKIPPED and q1 == "no":
                out[q], agree[q] = "na", n1
                continue
            v, n, ok = pick([val(r, q) if val(r, q) in codes[q] else "" for r in recs], k)
            out[q], agree[q] = v, n
            if v and not ok:
                nomaj.append(q)
        if not any(out[q] for q in QIDS):
            continue                                 # no run answered this case
        score = [sum(1 for q in QIDS if out[q] and val(r, q) == out[q]) for r in recs]
        best = max(range(k), key=lambda i: (score[i], -i))
        note = str(recs[best].get("note") or "").strip()[:MAX_NOTE]
        answers[cid] = {**out, "agree": agree, "no_majority": nomaj, "note": note}
    created = max((str(r.get("exported_at") or "") for r in runs), default="")
    return {"model": model or model_of(runs[0]), "runs": k, "created": created,
            "manifest_version": manifest["manifest_version"], "answers": answers}


def render(doc: dict) -> str:
    return ("// AI pre-filled answers of the audit page, written by tools/build_ai_prefill.py: do not edit by hand.\n"
            "// The majority answer of " + str(doc["runs"]) + " runs of one model per case and question (README, "
            "\"AI pre-filled answers\").\n"
            "window.AUDIT_AI = " + json.dumps(doc, ensure_ascii=False, indent=1) + ";\n")


def main(argv=None) -> int:
    root = HERE.parent
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("runs", nargs="+", help="the K run files (exports of the page or of agent/llm_annotate.py)")
    ap.add_argument("--data", default=str(root / "web" / "data"), help="the data folder with manifest.js (default web/data)")
    ap.add_argument("--guidelines", default=str(root / "web" / "guidelines.js"))
    ap.add_argument("--out", help="default: <data>/ai_prefill.js")
    ap.add_argument("--model", default="", help="the model name shown on the page (default: from the run files)")
    ap.add_argument("--check", action="store_true", help="do not write; exit 1 when the file differs")
    a = ap.parse_args(argv)
    data = Path(a.data)
    manifest = parse_js_assignment(data / "manifest.js", "AUDIT_MANIFEST")
    g = parse_js_assignment(Path(a.guidelines), "AUDIT_GUIDELINES")
    if [q["id"] for q in g["questions"]] != QIDS:
        sys.exit("the rubric does not have the questions " + ", ".join(QIDS))
    codes = {q["id"]: {str(o["code"]) for o in q["options"]} for q in g["questions"]}
    runs = []
    for p in a.runs:
        r = json.loads(Path(p).read_text(encoding="utf-8-sig"))
        if r.get("manifest_version") != manifest["manifest_version"]:
            sys.exit("%s: manifest_version %r, but the case list is %r" % (Path(p).name, r.get("manifest_version"), manifest["manifest_version"]))
        if not isinstance(r.get("annotations"), dict):
            sys.exit("%s has no annotations" % Path(p).name)
        runs.append(r)
    models = {model_of(r) for r in runs}
    if len(models) > 1 and not a.model:
        sys.exit("the runs are of different models (%s); name the model with --model" % ", ".join(sorted(models)))
    doc = build(runs, codes, manifest, a.model)
    text = render(doc)
    out = Path(a.out) if a.out else data / "ai_prefill.js"
    n_nomaj = sum(1 for x in doc["answers"].values() if x["no_majority"])
    if a.check:
        same = out.exists() and out.read_text(encoding="utf-8") == text
        print("%s is %s" % (out.name, "up to date" if same else "out of date"))
        return 0 if same else 1
    out.write_text(text, encoding="utf-8", newline="\n")
    print("wrote %s: %d of %d cases, %d runs of %s, %d cases with a question without a majority"
          % (out.name, len(doc["answers"]), len(manifest["cases"]), len(runs), doc["model"], n_nomaj))
    return 0


if __name__ == "__main__":
    sys.exit(main())
