# Agent instructions: ophthalmic image-description audit

You are going to act as one automated rater of an audit that clinicians do on the same cases. Follow these steps.
Everything you need is in this folder; paths are relative to it. Rubric `rubric-v1`, case list
`v1-2026-11-18`, 100 cases.

1. **Read `index.json`.** It gives the versions, the links below and the export contract (`export`).
2. **Read `rubric.json`.** `intro` and `notes` are what the human raters read; `agent_notes` are the extra rules for
   you. Each of the 7 questions has an `id`, a `title`, a `help` text and `options` (`code`, `label`,
   `help`). Answer with option **codes** only. `skip_if: {"q1_ophthalmic": ["no"]}` means: when Q1 is `no`, that
   question is answered `na`.
3. **Read `tasks.jsonl`**, one case per line, in order: `id`, `image` / `image_url`, `audio` / `audio_url`,
   `caption` (the description to judge), `transcript` (original language `lang`), `transcript_en` (English).
4. **Answer each case independently.** Look at the image, read the description and the transcript (the narration),
   and answer all 7 questions. Return for each case one JSON object that validates against
   `output_schema.json#/$defs/case_answer`:

   ```json
   {"q1_ophthalmic": "yes", "q2_modality": "oct", "q3_crop": "good", "q4_image_text": "partial",
    "q5_faithful": "unsupported", "q6_clinical": "minor", "q7_pii": "no", "note": "short reason"}
   ```

   Rules: if `q1_ophthalmic` is `no`, then `q2_modality`, `q3_crop`, `q4_image_text`, `q5_faithful`, `q6_clinical` are `na`; never use `na` otherwise. The audio is not available to you: judge Q5 from the transcript (`cant_judge` when it is
   missing or unintelligible). Keep the note short and in English; it is required when `q7_pii` is `yes` (say what
   and where).
5. **Assemble the export file** `ophth_audit_<rater-slug>_<YYYYMMDD-HHMM>.json` exactly as `index.json` → `export`
   describes (root of `output_schema.json`):
   - top-level keys in this order: `tool`, `tool_version`, `rubric_version`, `manifest_version`, `exported_at`, `rater`, `annotations`, then optionally `run`;
   - `tool` = `ophth-audit`, `tool_version` = `1.0`, `rubric_version` = `rubric-v1`,
     `manifest_version` = `v1-2026-11-18`, `exported_at` = now (ISO-8601 with UTC offset);
   - `rater` = `{"name": "<provider>/<model>", "role": "llm", "years_experience": null}` (repeated runs of the
     same model: `<provider>/<model>#1`, `#2`, ...; one file per run);
   - `annotations`: one entry per case, in task order, with exactly the keys
     `q1_ophthalmic, q2_modality, q3_crop, q4_image_text, q5_faithful, q6_clinical, q7_pii, note, annotated_at, time_spent_s`; `annotated_at` = when you answered (ISO-8601), `time_spent_s` = seconds spent;
     unanswered cases: every field `""` and `time_spent_s` 0;
   - `run` (optional): provider, model, settings, prompt version, cases sent, failures, and
     `"note": "audio clips were not sent to the model"`.
   - Rater slug: lowercase the name, replace every run of characters outside `[a-z0-9]` with one `-`, strip leading/trailing `-`, at most 40 characters (`anthropic/claude-opus-5-5#2` → `anthropic-claude-opus-5-5-2`).
6. **Hand the file to the study team** (it can also be opened in the page with *Load annotations*). Do not
   publish it. LLM ratings are reported separately from the clinicians' audit.

A ready-made client that does steps 1 to 5 with the Anthropic API or any OpenAI-compatible endpoint (for example a
local vLLM server) is `agent/llm_annotate.py` in the source repository.
