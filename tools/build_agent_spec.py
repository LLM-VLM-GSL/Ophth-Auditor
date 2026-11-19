#!/usr/bin/env python3
"""Build the machine-readable "agent entry" of the audit site (web/agent/) from the page's own sources.

    python tools/build_agent_spec.py            # (re)write web/agent/
    python tools/build_agent_spec.py --check    # exit 1 when web/agent/ is stale (for CI)

Single source of truth: web/guidelines.js (rubric) and web/data/manifest.js (cases). Both are parsed as the
JavaScript object literal assigned to window.AUDIT_GUIDELINES / window.AUDIT_MANIFEST (comments, unquoted keys,
single-quoted strings and trailing commas are accepted). Output, all deterministic (no time stamps), so that
--check can compare byte for byte:

  web/agent/index.json          what this is, versions, links, the export contract and the rules for automated raters
  web/agent/rubric.json         the 7 questions (ids, titles, help, options, skip_if), intro, notes, agent_notes
  web/agent/tasks.jsonl         one case per line, in presentation order, with relative and absolute media URLs
  web/agent/output_schema.json  JSON Schema: one case's answer, one export record, the whole export file
  web/agent/AGENT.md            step-by-step instructions an external agent can follow end to end

Python 3.10+, standard library only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
WEB = REPO / "web"
DEFAULT_SITE = "https://llm-vlm-gsl.github.io/Ophth-Auditor/"
AGENT_SPEC_VERSION = "agent-spec-v1"
TOOL, TOOL_VERSION = "ophth-audit", "1.0"
EXPORT_KEYS = ["tool", "tool_version", "rubric_version", "manifest_version", "exported_at", "rater", "annotations"]
RECORD_EXTRA = ["note", "annotated_at", "time_spent_s"]
HUMAN_ROLES = ["ophthalmologist", "optometrist", "resident_fellow", "trained_grader", "researcher", "other"]
LLM_ROLE = "llm"
NOTE_MAX = 2000

# Instructions for automated raters, added to the rubric (rubric.json "agent_notes"). The human rubric stays as it is.
AGENT_NOTES = [
    "You are an automated rater. Your answers are kept separate from the clinicians' audit and compared with it.",
    "You cannot hear the audio clip. The transcript is the narration: judge Q5 against it. If the transcript is "
    "missing, empty or too garbled to compare, answer Q5 = cant_judge.",
    "Answer all 7 questions for every case with the option codes of the rubric. If q1_ophthalmic is \"no\", "
    "q2_modality to q6_clinical must be \"na\"; never use \"na\" otherwise.",
    "Write a short note in English (at most about 40 words) with the observation that decided your least obvious "
    "answer. When q7_pii is \"yes\", the note must say what is identifying and where it is. Mention visible logos, "
    "watermarks, age or sex in the note (they are not patient-identifying).",
    "Judge each case on its own. Do not use outside sources, and do not try to identify the source video, the "
    "presenter or the patient.",
]


# ----------------------------------------------------------------------------- JS literal -> Python
class JSParseError(ValueError):
    pass


def _js_literal_to_json(text: str, start: int) -> str:
    """Convert the JS object/array literal starting at text[start] ('{' or '[') to JSON text."""
    out, i, n, depth = [], start, len(text), 0
    ident = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*")

    def skip_ws_comments(j):
        while j < n:
            if text[j].isspace():
                j += 1
            elif text.startswith("//", j):
                k = text.find("\n", j)
                j = n if k < 0 else k + 1
            elif text.startswith("/*", j):
                k = text.find("*/", j + 2)
                if k < 0:
                    raise JSParseError("unterminated comment")
                j = k + 2
            else:
                break
        return j

    while i < n:
        c = text[i]
        if c in "\"'":
            q, j, buf = c, i + 1, []
            while True:
                if j >= n:
                    raise JSParseError("unterminated string")
                ch = text[j]
                if ch == "\\":
                    nxt = text[j + 1]
                    if nxt == "'":
                        buf.append("'")
                    elif nxt == "\n":
                        pass                                   # line continuation
                    else:
                        buf.append("\\" + nxt)
                    j += 2
                    continue
                if ch == q:
                    break
                if ch == '"':
                    buf.append('\\"')
                elif ch == "\n":
                    raise JSParseError("newline in string")
                else:
                    buf.append(ch)
                j += 1
            out.append('"' + "".join(buf) + '"')
            i = j + 1
        elif c == "`":
            raise JSParseError("template literals are not supported")
        elif text.startswith("//", i) or text.startswith("/*", i) or c.isspace():
            i = skip_ws_comments(i)
            out.append(" ")
        elif c in "{[":
            depth += 1
            out.append(c)
            i += 1
        elif c in "}]":
            depth -= 1
            out.append(c)
            i += 1
            if depth == 0:
                return "".join(out)
        elif c == ",":
            j = skip_ws_comments(i + 1)
            if j < n and text[j] in "}]":                       # trailing comma
                i = j
            else:
                out.append(",")
                i += 1
        else:
            m = ident.match(text, i)
            if m:
                word = m.group(0)
                j = skip_ws_comments(m.end())
                if j < n and text[j] == ":" and word not in ("true", "false", "null"):
                    out.append(json.dumps(word))               # unquoted key
                else:
                    out.append(word)
                i = m.end()
            else:
                out.append(c)
                i += 1
    raise JSParseError("unbalanced braces")


def parse_js_assignment(path: Path, var: str):
    """Return the value assigned to window.<var> (or <var>) in a .js file."""
    text = Path(path).read_text(encoding="utf-8-sig")
    m = re.search(r"(?:window\.)?" + re.escape(var) + r"\s*=\s*", text)
    if not m:
        raise JSParseError(f"{path}: no assignment to {var}")
    j = m.end()
    if j >= len(text) or text[j] not in "{[":
        raise JSParseError(f"{path}: {var} is not assigned an object literal")
    try:
        return json.loads(_js_literal_to_json(text, j))
    except json.JSONDecodeError as e:
        raise JSParseError(f"{path}: cannot parse {var}: {e}") from e


# ----------------------------------------------------------------------------- builders
def dumps(obj) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def build_rubric(g: dict) -> dict:
    qs = []
    for q in g["questions"]:
        opts = []
        for o in q["options"]:
            e = {"code": o["code"], "label": o.get("label", o["code"]), "help": o.get("help", "")}
            if o.get("issue"):
                e["reports_problem"] = True
            if o.get("ask_note"):
                e["note_required"] = True
            opts.append(e)
        qs.append({"id": q["id"], "title": q.get("title", ""), "short": q.get("short", ""), "help": q.get("help", ""),
                   "required": bool(q.get("required", True)), "skip_if": q.get("skip_if"), "na_code": "na" if q.get("skip_if") else None,
                   "options": opts})
    return {"rubric_version": g["version"], "intro": g.get("intro", ""), "notes": list(g.get("notes", [])),
            "agent_notes": AGENT_NOTES, "questions": qs,
            "markup": "Text may contain **two stars** around words to mark emphasis."}


def build_tasks(m: dict, site: str) -> list[dict]:
    rows = []
    for k, c in enumerate(m["cases"], 1):
        img, aud = c.get("image"), c.get("audio")
        rows.append({"n": k, "id": c["id"], "image": img, "image_url": site + img if img else None,
                     "audio": aud, "audio_url": site + aud if aud else None, "duration_s": c.get("duration_s"),
                     "caption": c.get("caption", ""), "transcript": c.get("transcript", ""),
                     "transcript_en": c.get("transcript_en") or c.get("transcript", ""), "lang": c.get("lang", "")})
    return rows


def build_schema(rubric: dict, manifest_version: str) -> dict:
    qids = [q["id"] for q in rubric["questions"]]
    skippable = [q["id"] for q in rubric["questions"] if q["skip_if"]]
    codes = {q["id"]: [o["code"] for o in q["options"]] for q in rubric["questions"]}
    trigger = {}
    for q in rubric["questions"]:
        for k, v in (q["skip_if"] or {}).items():
            trigger.setdefault(k, set()).update(v)
    if len(trigger) != 1:
        raise ValueError(f"expected one skip_if trigger question, got {sorted(trigger)}")
    skip_q, skip_vals = next(iter(trigger.items()))
    skip_vals = sorted(skip_vals)
    answer_props = {q: {"type": "string", "enum": codes[q] + (["na"] if q in skippable else [])} for q in qids}
    answer_props["note"] = {"type": "string", "maxLength": NOTE_MAX}
    skip_rule = {
        "if": {"properties": {skip_q: {"enum": skip_vals}}, "required": [skip_q]},
        "then": {"properties": {q: {"const": "na"} for q in skippable}},
        "else": {"properties": {q: {"enum": codes[q]} for q in skippable}},
    }
    note_rules = [{"if": {"properties": {q["id"]: {"enum": [o["code"]]}}, "required": [q["id"]]},
                   "then": {"properties": {"note": {"minLength": 1}}}}
                  for q in rubric["questions"] for o in q["options"] if o.get("note_required")]
    case_answer = {
        "title": "One case's answer (what a model returns for one case)",
        "type": "object", "properties": answer_props, "required": qids + ["note"], "additionalProperties": False,
        "allOf": [skip_rule] + note_rules,
    }
    rec_props = {q: {"type": "string", "enum": [""] + answer_props[q]["enum"]} for q in qids}
    rec_props.update({"note": {"type": "string", "maxLength": NOTE_MAX},
                      "annotated_at": {"type": "string", "description": "ISO-8601 with UTC offset, or '' when unanswered"},
                      "time_spent_s": {"type": "number", "minimum": 0}})
    record = {
        "title": "One annotation in the export file ('' = unanswered)",
        "type": "object", "properties": rec_props, "required": qids + RECORD_EXTRA, "additionalProperties": False,
        "allOf": [{"if": {"properties": {skip_q: {"enum": skip_vals}}, "required": [skip_q]},
                   "then": {"properties": {q: {"const": "na"} for q in skippable}},
                   "else": {"properties": {q: {"enum": [""] + codes[q]} for q in skippable}}}],
    }
    export = {
        "title": "The export file ophth_audit_<rater-slug>_<YYYYMMDD-HHMM>.json",
        "type": "object",
        "properties": {
            "tool": {"const": TOOL}, "tool_version": {"const": TOOL_VERSION},
            "rubric_version": {"const": rubric["rubric_version"]},
            "manifest_version": {"type": "string", "description": f"the manifest_version of the case list ({manifest_version})"},
            "exported_at": {"type": "string", "description": "ISO-8601 with UTC offset"},
            "rater": {"type": "object", "properties": {
                "name": {"type": "string", "minLength": 1},
                "role": {"enum": HUMAN_ROLES + [LLM_ROLE, ""]},
                "years_experience": {"type": ["number", "null"]}},
                "required": ["name", "role", "years_experience"], "additionalProperties": False},
            "annotations": {"type": "object", "additionalProperties": {"$ref": "#/$defs/annotation"}},
            "run": {"type": "object", "description": "optional, automated raters only: run metadata (provider, model, "
                                                     "prompt hash, settings, failures); readers ignore it"},
        },
        "required": EXPORT_KEYS, "additionalProperties": False,
        "allOf": [{"if": {"properties": {"rater": {"properties": {"role": {"const": LLM_ROLE}}}}},
                   "then": {"properties": {"rater": {"properties": {
                       "name": {"pattern": "^[^/\\s]+/[^\\s]+$"}, "years_experience": {"const": None}}}}}}],
    }
    return {"$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "output_schema.json",
            "title": "Ophthalmic image-description audit: answers and export file",
            "description": "Root = the export file. $defs/case_answer = one case's answer; $defs/annotation = one entry "
                           "of 'annotations'.",
            "$ref": "#/$defs/export", "$defs": {"case_answer": case_answer, "annotation": record, "export": export}}


def build_index(rubric, manifest, tasks, files, site):
    qids = [q["id"] for q in rubric["questions"]]
    skippable = [q["id"] for q in rubric["questions"] if q["skip_if"]]
    return {
        "name": "Ophthalmic image-description audit: agent entry",
        "what": ("Machine-readable entry to the static audit page. Human raters judge, for each case, one ophthalmic "
                 "image, the text description paired with it, and the narration (transcript) it was derived from, "
                 "answering 7 questions. An automated rater (an LLM through an API) can answer the same cases and "
                 "produce the same export file. There is no server: fetch these files, answer locally, and send the "
                 "export file to the study team. LLM ratings are a pilot comparison and are analysed separately from "
                 "the clinicians' audit."),
        "agent_spec_version": AGENT_SPEC_VERSION,
        "rubric_version": rubric["rubric_version"],
        "manifest_version": manifest["manifest_version"],
        "n_cases": len(tasks),
        "site": site,
        "links": {"rubric": "rubric.json", "tasks": "tasks.jsonl", "output_schema": "output_schema.json",
                  "instructions": "AGENT.md", "page": "../index.html"},
        "sha256": files,
        "media": ("Relative media paths in tasks.jsonl ('image', 'audio') are relative to the site root (the folder of "
                  "index.html, one level above this file); 'image_url' / 'audio_url' are absolute."),
        "export": {
            "format": "JSON, UTF-8",
            "file_name": "ophth_audit_<rater-slug>_<YYYYMMDD-HHMM>.json",
            "file_name_time": "local time when the file was first written",
            "rater_slug_rule": ("lowercase the rater name, replace every run of characters outside [a-z0-9] with one "
                                "'-', strip leading and trailing '-', keep at most 40 characters; empty gives 'rater'. "
                                "Example: 'anthropic/claude-opus-5-5#2' -> 'anthropic-claude-opus-5-5-2'."),
            "top_level_keys": EXPORT_KEYS + ["run (optional, automated raters)"],
            "constants": {"tool": TOOL, "tool_version": TOOL_VERSION, "rubric_version": rubric["rubric_version"],
                          "manifest_version": manifest["manifest_version"]},
            "rater": {"name": "for an LLM: '<provider>/<model>' (with '#<k>' for repeated runs of the same model)",
                      "role": f"'{LLM_ROLE}' for any automated rater (humans: {', '.join(HUMAN_ROLES)})",
                      "years_experience": "null for an LLM"},
            "annotations": ("object keyed by case id, one entry per case of tasks.jsonl in the same order; each entry "
                            "has exactly the keys " + ", ".join(qids + RECORD_EXTRA) +
                            ". Unanswered = '' (time_spent_s 0)."),
            "annotated_at": "ISO-8601 with UTC offset, e.g. 2026-11-18T10:31:05-07:00",
            "time_spent_s": "seconds spent on the case (for an LLM: wall time of the API call(s)), one decimal",
            "skip_logic": (f"if q1_ophthalmic == 'no', then {', '.join(skippable)} are 'na'; 'na' is never used "
                           "otherwise; q7_pii is always answered."),
            "note_rule": "when q7_pii == 'yes' the note must say what is identifying and where",
            "run": ("optional extra top-level object written by automated raters: provider, model, settings, prompt "
                    "hash, cases sent, failures, and a statement that audio was not sent. The page and the analysis "
                    "ignore it."),
            "example": {
                "tool": TOOL, "tool_version": TOOL_VERSION, "rubric_version": rubric["rubric_version"],
                "manifest_version": manifest["manifest_version"], "exported_at": "2026-11-18T10:31:05-07:00",
                "rater": {"name": "anthropic/claude-opus-5-5", "role": LLM_ROLE, "years_experience": None},
                "annotations": {tasks[0]["id"] if tasks else "A001": {
                    "q1_ophthalmic": "yes", "q2_modality": "oct", "q3_crop": "good", "q4_image_text": "full",
                    "q5_faithful": "partial", "q6_clinical": "correct", "q7_pii": "no",
                    "note": "Foveal elevation visible; narration mentions the RPE scroll only.",
                    "annotated_at": "2026-11-18T10:30:58-07:00", "time_spent_s": 6.4}},
                "run": {"provider": "anthropic", "model": "claude-opus-5-5", "audio_sent": False},
            },
        },
        "llm_rules": [
            f"Set rater.role = '{LLM_ROLE}', rater.name = '<provider>/<model>' and rater.years_experience = null.",
            "Do not send the export file anywhere public: return it to the study team.",
            "Report in run.note that the audio clips were not given to the model (if they were not).",
        ] + AGENT_NOTES,
        "client": "agent/llm_annotate.py in the source repository implements all of this (Anthropic or any "
                  "OpenAI-compatible endpoint).",
    }


AGENT_MD = """\
# Agent instructions: ophthalmic image-description audit

You are one automated rater in an audit of {n_cases} ophthalmic image-description pairs. Use your own model to judge
every case, then write one JSON file and give it to the person who asked you. A panel of several models does the
same task independently; clinicians only review the panel's result at the end. Rubric `{rubric_version}`, case list
`{manifest_version}`.

Everything is public and needs no account. Base URL: {site}agent/ (the files below; paths are relative to it).

## What one case is

An image (a frame from an expert ophthalmology lecture video), a **description** (one sentence that a text-only model
wrote from the lecturer's narration; this is what you judge) and the **narration** (an automatic transcript of what
the lecturer said around that frame; English translation in `transcript_en`, original in `transcript`). Each
description was meant to restate what the expert said about the image. Your job: check the image, the description
and the narration against each other, and against your clinical knowledge.

## Steps

1. **Read `index.json`** (versions, links, the export contract) and **`rubric.json`** (the {n_questions} questions:
   `id`, `title`, `help`, `options` with `code`, `label`, `help`; plus `intro`, `notes` and `agent_notes`, which
   are rules for you). Answer with option **codes** only.
2. **Read `tasks.jsonl`**, one case per line: `id`, `image_url`, `caption` (the description), `transcript`,
   `transcript_en`, `lang`. Download each `image_url` and look at the image yourself; do not judge from the text
   alone. Audio is not needed.
3. **Judge each case on its own.** Do not look at other raters' answers, at the page's pre-filled AI answers
   (`data/ai_prefill.js`) or at earlier runs: the panel is only useful if each model judges independently. For each
   case produce one object that validates against `output_schema.json#/$defs/case_answer`:

   ```json
   {{"q1_ophthalmic": "yes", "q2_modality": "cfp", "q3_crop": "good", "q4_image_text": "partial",
    "q5_faithful": "unsupported", "q6_clinical": "minor", "q7_pii": "no", "note": "short reason"}}
   ```

   Rules: {skip_rule} Judge Q5 from the transcript (`cant_judge` when it is missing or unintelligible). The note is
   one or two short English sentences giving your main reason; it is required when `q7_pii` is `yes` (say what and
   where).
4. **Work in batches and keep going.** {n_cases} cases is long: save your answers to the output file after every
   batch (for example every 10 cases), and if you are interrupted, reload the file and continue with the cases that
   are still empty. Never stop with cases silently missing: an unanswered case keeps every field `""`.
5. **Write the file** `ophth_audit_<rater-slug>_<YYYYMMDD-HHMM>.json`, exactly as `index.json` → `export` and the root
   of `output_schema.json` describe:
   - top-level keys in this order: `{top_keys}`, then `run`;
   - `tool` = `{tool}`, `tool_version` = `{tool_version}`, `rubric_version` = `{rubric_version}`,
     `manifest_version` = `{manifest_version}`, `exported_at` = now (ISO-8601 with UTC offset);
   - `rater` = `{{"name": "<provider>/<model>", "role": "llm", "years_experience": null}}`: name the model that
     actually made the judgements, as precisely as you know it (for example `anthropic/claude-opus-5-5`,
     `openai/gpt-6-luna`, `google/gemini-3-pro`); if you are not sure of the exact version, say so in `run`;
   - `annotations`: one entry per case, in task order, with exactly the keys `{record_keys}`; `annotated_at` = when
     you answered (ISO-8601), `time_spent_s` = seconds spent (0 if unknown);
   - `run`: `{{"agent": "<the agent or tool you run in>", "model": "...", "how": "how you looked at the images and
     answered (one line)", "cases_answered": n, "failures": [case ids], "note": "audio not used"}}`;
   - rater slug: {slug_rule}
6. **Check before you hand it over:** {n_cases} entries; every answered entry has all {n_questions} codes from the
   rubric (or `na` where the skip rule applies); the file parses as JSON. Then give the file to the person who asked
   you. Do not publish it anywhere.

A ready-made client that does steps 1 to 6 through the Anthropic API or any OpenAI-compatible endpoint (for example
a local vLLM server) is `agent/llm_annotate.py` in the source repository.
"""


def build_all(web: Path, site: str) -> dict[str, str]:
    g = parse_js_assignment(web / "guidelines.js", "AUDIT_GUIDELINES")
    mpath = web / "data" / "manifest.js"
    if not mpath.exists():
        raise FileNotFoundError(f"{mpath} not found (the agent entry needs the plaintext case list)")
    m = parse_js_assignment(mpath, "AUDIT_MANIFEST")
    rubric = build_rubric(g)
    tasks = build_tasks(m, site)
    ids = [t["id"] for t in tasks]
    if len(set(ids)) != len(ids):
        raise ValueError("duplicate case ids in the manifest")
    files = {"rubric.json": dumps(rubric),
             "tasks.jsonl": "".join(json.dumps(t, ensure_ascii=False) + "\n" for t in tasks),
             "output_schema.json": dumps(build_schema(rubric, m["manifest_version"]))}
    sha = {k: hashlib.sha256(v.encode("utf-8")).hexdigest() for k, v in files.items()}
    files["index.json"] = dumps(build_index(rubric, m, tasks, sha, site))
    skippable = [q["id"] for q in rubric["questions"] if q["skip_if"]]
    files["AGENT.md"] = AGENT_MD.format(
        site=site.rstrip("/") + "/", rubric_version=rubric["rubric_version"], manifest_version=m["manifest_version"], n_cases=len(tasks),
        n_questions=len(rubric["questions"]), tool=TOOL, tool_version=TOOL_VERSION,
        skip_rule=f"if `q1_ophthalmic` is `no`, then {', '.join('`%s`' % q for q in skippable)} are `na`; "
                  "never use `na` otherwise.",
        top_keys="`, `".join(EXPORT_KEYS),
        record_keys=", ".join([q["id"] for q in rubric["questions"]] + RECORD_EXTRA),
        slug_rule=("lowercase the name, replace every run of characters outside `[a-z0-9]` with one `-`, strip "
                   "leading/trailing `-`, at most 40 characters (`anthropic/claude-opus-5-5#2` → "
                   "`anthropic-claude-opus-5-5-2`)."))
    return files


def _norm(s: str) -> str:
    return s.replace("\r\n", "\n")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--web", default=str(WEB), help="the site folder (default: %(default)s)")
    ap.add_argument("--site", default=DEFAULT_SITE, help="absolute URL of the published site (default: %(default)s)")
    ap.add_argument("--check", action="store_true", help="do not write; exit 1 if web/agent/ differs from the sources")
    a = ap.parse_args(argv)
    site = a.site if a.site.endswith("/") else a.site + "/"
    web = Path(a.web)
    try:
        files = build_all(web, site)
    except (OSError, ValueError, KeyError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    out = web / "agent"
    if a.check:
        stale = []
        for name, content in files.items():
            p = out / name
            if not p.exists() or _norm(p.read_text(encoding="utf-8")) != content:
                stale.append(name)
        if stale:
            print("web/agent/ is stale: " + ", ".join(stale) + ". Run: python tools/build_agent_spec.py", file=sys.stderr)
            return 1
        print(f"web/agent/ is up to date ({len(files)} files)")
        return 0
    out.mkdir(parents=True, exist_ok=True)
    for name, content in files.items():
        with open(out / name, "w", encoding="utf-8", newline="\n") as f:
            f.write(content)
    print(f"wrote {len(files)} files to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
