#!/usr/bin/env python3
"""Check rater exports (JSON / CSV / XLSX) against the export contract in README.md ("Exports").

    python tests/check_exports.py <folder with exports> [--expect expected.json] [--manifest path/to/manifest.js]

Independent of the page: the option codes are the rubric table, not guidelines.js. Reads the files the way an
analysis script would (json, pandas.read_csv with dtype=str, pandas.read_excel). Exit status 1 on any failed check.
--expect: {"manifest_version": ..., "rater": {...}, "answers": {case_id: {field: value, ...}}, "timed": [case_id]},
written by tests/e2e.mjs. Needs pandas and openpyxl.
"""
import argparse
import datetime
import json
import os
import re
import sys

import pandas as pd

TOOL, TOOL_VERSION = "ophth-audit", "1.0"
QIDS = ["q1_ophthalmic", "q2_modality", "q3_crop", "q4_image_text", "q5_faithful", "q6_clinical", "q7_pii"]
CODES = {  # the rubric (rubric-v1)
    "q1_ophthalmic": {"yes", "no", "unsure"},
    "q2_modality": {"oct", "cfp", "uwf", "angio", "other", "multi", "unsure"},
    "q3_crop": {"good", "partial", "bad"},
    "q4_image_text": {"full", "partial", "none"},
    "q5_faithful": {"full", "partial", "unsupported", "cant_judge"},
    "q6_clinical": {"correct", "minor", "major", "cant_judge"},
    "q7_pii": {"no", "yes"},
}
SKIPPABLE = QIDS[1:6]
COLS = ["no", "case_id"] + QIDS + ["note", "annotated_at", "time_spent_s"]
REC_FIELDS = QIDS + ["note", "annotated_at", "time_spent_s"]
TOP = ["tool", "tool_version", "rubric_version", "manifest_version", "exported_at", "rater", "annotations"]
RATER_ROWS = ["name", "role", "years_experience", "manifest_version", "rubric_version", "exported_at"]
ROLES = {"ophthalmologist", "optometrist", "resident_fellow", "trained_grader", "researcher", "other", "llm"}
NAME_RE = re.compile(r"^ophth_audit_(?P<slug>[a-z0-9-]{1,40})_(?P<stamp>\d{8}-\d{4})\.(?P<ext>json|csv|xlsx)$")

failed = 0


def slugify(name):
    """The rater slug rule (identical to slugify() in web/app.js): lowercase, every run of characters outside
    [a-z0-9] -> "-", strip leading/trailing "-", truncate to 40 characters; empty -> "rater"."""
    s = re.sub(r"[^a-z0-9]+", "-", str(name if name is not None else "").lower()).strip("-")[:40]
    return s or "rater"


def check(name, ok, got=None):
    global failed
    print(("ok   " if ok else "FAIL ") + name + ("" if got is None else "  (%s)" % (got,)))
    if not ok:
        failed += 1
    return ok


def iso_ok(s):
    try:
        datetime.datetime.fromisoformat(s)
        return True
    except (TypeError, ValueError):
        return False


def load_manifest(path):
    s = open(path, encoding="utf-8").read()
    return json.loads(s[s.index("{"): s.rindex("}") + 1])


def check_record(cid, r, where):
    ok = True
    for q in QIDS:
        v = r[q]
        allowed = CODES[q] | ({"na"} if q in SKIPPABLE else set()) | {""}
        if v not in allowed:
            ok = check("%s %s %s is a rubric code" % (where, cid, q), False, v)
    if r["q1_ophthalmic"] == "no":
        ok &= check("%s %s skip logic: q1=no -> q2..q6 na" % (where, cid), all(r[q] == "na" for q in SKIPPABLE),
                    [r[q] for q in SKIPPABLE]) or False
    elif any(r[q] == "na" for q in SKIPPABLE):
        ok = check("%s %s na only when q1=no" % (where, cid), False, [r[q] for q in QIDS])
    if r["annotated_at"] and not iso_ok(r["annotated_at"]):
        ok = check("%s %s annotated_at is ISO-8601" % (where, cid), False, r["annotated_at"])
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--expect")
    ap.add_argument("--manifest")
    a = ap.parse_args()
    exp = json.load(open(a.expect, encoding="utf-8")) if a.expect else None
    ids = [c["id"] for c in load_manifest(a.manifest)["cases"]] if a.manifest else None

    files = sorted(f for f in os.listdir(a.folder) if f.startswith("ophth_audit_"))
    check("export files found", bool(files), files)
    by_ext = {}
    for f in files:
        m = NAME_RE.match(f)
        check("file name pattern ophth_audit_<slug>_<YYYYMMDD-HHMM>.<ext>: " + f, bool(m))
        if m:
            by_ext.setdefault(m.group("ext"), []).append((f, m.group("slug")))
    for ext in ("json", "csv", "xlsx"):
        check("a %s export exists" % ext, ext in by_ext)

    js = None
    for f, slug in by_ext.get("json", []):
        d = json.load(open(os.path.join(a.folder, f), encoding="utf-8"))
        js = d
        check("JSON top-level keys (in order; an LLM batch may add a trailing \"run\" block)", [k for k in d.keys() if k != "run"] == TOP, list(d.keys()))
        check("JSON tool / tool_version", d["tool"] == TOOL and d["tool_version"] == TOOL_VERSION, (d["tool"], d["tool_version"]))
        check("JSON rubric_version", d["rubric_version"] == "rubric-v1", d["rubric_version"])
        check("JSON exported_at ISO-8601", iso_ok(d["exported_at"]), d["exported_at"])
        r = d["rater"]
        check("JSON rater keys", list(r.keys()) == ["name", "role", "years_experience"], list(r.keys()))
        check("JSON rater role is empty or a known role", r["role"] in ROLES or r["role"] == "", r["role"])
        check("JSON years_experience is empty or a number", r["years_experience"] is None or (isinstance(r["years_experience"], (int, float)) and not isinstance(r["years_experience"], bool)), r["years_experience"])
        check("file-name slug == slugify(rater.name) (Python rule)", slug == slugify(r["name"]), (slug, slugify(r["name"])))
        ann = d["annotations"]
        if ids is not None:
            check("JSON annotations: one entry per manifest case, in manifest order", list(ann.keys()) == ids, len(ann))
        allok = True
        for cid, rec in ann.items():
            if list(rec.keys()) != REC_FIELDS:
                allok = check("JSON %s fields" % cid, False, list(rec.keys()))
                continue
            if not isinstance(rec["time_spent_s"], (int, float)) or rec["time_spent_s"] < 0:
                allok = check("JSON %s time_spent_s number >= 0" % cid, False, rec["time_spent_s"])
            if not all(isinstance(rec[k], str) for k in QIDS + ["note", "annotated_at"]):
                allok = check("JSON %s string fields" % cid, False, rec)
            allok &= bool(check_record(cid, rec, "JSON"))
        check("JSON every annotation has the expected fields, codes and skip logic", allok)
        if exp:
            check("JSON manifest_version as expected", d["manifest_version"] == exp["manifest_version"], d["manifest_version"])
            check("JSON rater as expected", r == exp["rater"], r)
            for cid, want in exp["answers"].items():
                got = {k: ann[cid][k] for k in want}
                check("JSON %s answers as expected" % cid, got == want, got if got != want else None)
            for cid in exp.get("timed", []):
                check("JSON %s time_spent_s > 0" % cid, ann[cid]["time_spent_s"] > 0, ann[cid]["time_spent_s"])
                check("JSON %s annotated_at set" % cid, iso_ok(ann[cid]["annotated_at"]), ann[cid]["annotated_at"])

    for f, slug in by_ext.get("csv", []):
        p = os.path.join(a.folder, f)
        raw = open(p, "rb").read()
        check("CSV is UTF-8 without BOM", not raw.startswith(b"\xef\xbb\xbf"))
        df = pd.read_csv(p, dtype=str, keep_default_na=False)
        check("CSV columns exactly as documented", list(df.columns) == COLS, list(df.columns))
        if ids is not None:
            check("CSV one row per case, in order", list(df["case_id"]) == ids, len(df))
            check("CSV no = 1..N", list(df["no"]) == [str(k + 1) for k in range(len(ids))])
        if js is not None:
            same = True
            for _, row in df.iterrows():
                rec = js["annotations"][row["case_id"]]
                for k in QIDS + ["note", "annotated_at"]:
                    if row[k] != rec[k]:
                        same = check("CSV %s %s equals JSON" % (row["case_id"], k), False, (row[k], rec[k]))
                if abs(float(row["time_spent_s"]) - rec["time_spent_s"]) > 60:
                    same = check("CSV %s time close to JSON" % row["case_id"], False, (row["time_spent_s"], rec["time_spent_s"]))
            check("CSV answers and notes equal the JSON export", same)
        for _, row in df.iterrows():
            check_record(row["case_id"], row, "CSV")

    for f, slug in by_ext.get("xlsx", []):
        p = os.path.join(a.folder, f)
        sheets = pd.read_excel(p, sheet_name=None, dtype=str, keep_default_na=False)
        check("XLSX sheets: annotations first, rater second", list(sheets.keys())[:2] == ["annotations", "rater"], list(sheets.keys()))
        df = sheets["annotations"]
        check("XLSX annotation columns exactly as documented", list(df.columns) == COLS, list(df.columns))
        if ids is not None:
            check("XLSX one row per case, in order", list(df["case_id"]) == ids, len(df))
        rs = sheets["rater"]
        check("XLSX rater sheet columns field, value", list(rs.columns) == ["field", "value"], list(rs.columns))
        check("XLSX rater sheet rows in the documented order", list(rs["field"]) == RATER_ROWS, list(rs["field"]))
        kv = dict(zip(rs["field"], rs["value"]))
        check("XLSX file-name slug == slugify(rater name)", slug == slugify(kv.get("name", "")), (slug, kv.get("name")))
        check("XLSX rubric_version / exported_at", kv.get("rubric_version") == "rubric-v1" and iso_ok(kv.get("exported_at")), kv)
        if exp:
            ye, want_y = str(kv.get("years_experience") or "").strip(), exp["rater"]["years_experience"]
            check("XLSX rater as expected", kv.get("name") == exp["rater"]["name"] and (kv.get("role") or "") == exp["rater"]["role"]
                  and ((want_y is None and ye in ("", "nan", "None")) or (want_y is not None and ye and float(ye) == want_y)), kv)
            for cid, want in exp["answers"].items():
                row = df[df["case_id"] == cid].iloc[0]
                got = {k: row[k] for k in want}
                check("XLSX %s answers as expected" % cid, got == want, got if got != want else None)
        dn = pd.read_excel(p, sheet_name="annotations")    # numbers stay numbers for a typed reader
        check("XLSX no and time_spent_s are numeric cells", pd.api.types.is_numeric_dtype(dn["no"]) and pd.api.types.is_numeric_dtype(dn["time_spent_s"]))
        for _, row in df.iterrows():
            check_record(row["case_id"], row, "XLSX")

    print("\n%s: %d failed check(s)" % ("FAILED" if failed else "ALL OK", failed))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
