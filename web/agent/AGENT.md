# Agent instructions: ophthalmic image-description audit

You are one automated rater in an audit of 100 ophthalmic image-description pairs. Use your own model to judge
every case, then write one JSON file and give it to the person who asked you. A panel of several models does the
same task independently; clinicians only review the panel's result at the end. Rubric `rubric-v1-table`, case list
`test100-hq-2026-11-26`.

Everything is public and needs no account. Base URL: https://llm-vlm-gsl.github.io/Ophth-Auditor/agent/ (the files below; paths are relative to it).

## What one case is

An image (a frame from an expert ophthalmology lecture video), a **description** (one sentence that a text-only model
wrote from the lecturer's narration; this is what you judge) and the **narration** (an automatic transcript of what
the lecturer said around that frame; English translation in `transcript_en`, original in `transcript`). Each
description was meant to restate what the expert said about the image. Your job: check the image, the description
and the narration against each other, and against your clinical knowledge.

## Steps

1. **Read `index.json`** (versions, links, the export contract) and **`rubric.json`** (the 7 questions:
   `id`, `title`, `help`, `options` with `code`, `label`, `help`; plus `intro`, `notes` and `agent_notes`, which
   are rules for you). Answer with option **codes** only.
2. **Read `tasks.jsonl`**, one case per line: `id`, `image_url`, `caption` (the description), `transcript`,
   `transcript_en`, `lang`. Download each `image_url` and look at the image yourself; do not judge from the text
   alone. Audio is not needed.
3. **Judge each case on its own.** Do not look at other raters' answers, at the page's pre-filled AI answers
   (`data/ai_prefill.js`) or at earlier runs: the panel is only useful if each model judges independently. For each
   case produce one object that validates against `output_schema.json#/$defs/case_answer`:

   ```json
   {"q1_ophthalmic": "yes", "q2_modality": "cfp", "q3_crop": "good", "q4_image_text": "partial",
    "q5_faithful": "unsupported", "q6_clinical": "minor", "q7_pii": "no", "note": "short reason"}
   ```

   Rules: if `q1_ophthalmic` is `no`, then `q2_modality`, `q3_crop`, `q4_image_text`, `q5_faithful`, `q6_clinical` are `na`; never use `na` otherwise. Judge Q5 from the transcript (`cant_judge` when it is missing or unintelligible). The note is
   one or two short English sentences giving your main reason; it is required when `q7_pii` is `yes` (say what and
   where).
4. **Work in batches and keep going.** 100 cases is long: save your answers to the output file after every
   batch (for example every 10 cases), and if you are interrupted, reload the file and continue with the cases that
   are still empty. Never stop with cases silently missing: an unanswered case keeps every field `""`.
5. **Write the file** `ophth_audit_<rater-slug>_<YYYYMMDD-HHMM>.json`, exactly as `index.json` → `export` and the root
   of `output_schema.json` describe:
   - top-level keys in this order: `tool`, `tool_version`, `rubric_version`, `manifest_version`, `exported_at`, `rater`, `annotations`, then `run`;
   - `tool` = `ophth-audit`, `tool_version` = `1.0`, `rubric_version` = `rubric-v1-table`,
     `manifest_version` = `test100-hq-2026-11-26`, `exported_at` = now (ISO-8601 with UTC offset);
   - `rater` = `{"name": "<provider>/<model>", "role": "llm", "years_experience": null}`: name the model that
     actually made the judgements, as precisely as you know it (for example `anthropic/claude-opus-5-5`,
     `openai/gpt-6-luna`, `google/gemini-3-pro`); if you are not sure of the exact version, say so in `run`;
   - `annotations`: one entry per case, in task order, with exactly the keys `q1_ophthalmic, q2_modality, q3_crop, q4_image_text, q5_faithful, q6_clinical, q7_pii, note, annotated_at, time_spent_s`; `annotated_at` = when
     you answered (ISO-8601), `time_spent_s` = seconds spent (0 if unknown);
   - `run`: `{"agent": "<the agent or tool you run in>", "model": "...", "how": "how you looked at the images and
     answered (one line)", "cases_answered": n, "failures": [case ids], "note": "audio not used"}`;
   - rater slug: lowercase the name, replace every run of characters outside `[a-z0-9]` with one `-`, strip leading/trailing `-`, at most 40 characters (`anthropic/claude-opus-5-5#2` → `anthropic-claude-opus-5-5-2`).
6. **Check before you hand it over:** 100 entries; every answered entry has all 7 codes from the
   rubric (or `na` where the skip rule applies); the file parses as JSON. Then give the file to the person who asked
   you. Do not publish it anywhere.

A ready-made client that does steps 1 to 6 through the Anthropic API or any OpenAI-compatible endpoint (for example
a local vLLM server) is `agent/llm_annotate.py` in the source repository.
