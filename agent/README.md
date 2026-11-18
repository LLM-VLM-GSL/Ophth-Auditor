# LLM raters: agent entry and batch client

Large language models with vision can answer the same audit cases as the human raters and produce the same export
file. **LLM ratings are a pilot comparison.** The analysis reports them in their own section, apart from the
clinicians' audit, and never counts them as human raters. They are not part of the audit's headline numbers.

## What the site exposes

The published site has a machine-readable entry in `web/agent/`
(<https://llm-vlm-gsl.github.io/Ophth-Auditor/agent/index.json>). It is generated from `web/guidelines.js` and
`web/data/manifest.js` by `tools/build_agent_spec.py`. Do not edit these files by hand:

| File | Content |
|---|---|
| `index.json` | versions, number of cases, links, the export contract (file name, slug rule, skip logic, LLM rater fields) |
| `rubric.json` | the 7 questions (ids, titles, help, option codes and help, `skip_if`), the intro and notes, and `agent_notes` (extra rules for automated raters) |
| `tasks.jsonl` | one case per line in presentation order: id, image and audio (relative path and absolute URL), description, transcript, English transcript, language |
| `output_schema.json` | JSON Schema: `$defs/case_answer` (one answer), `$defs/annotation` (one export entry), root = the export file |
| `AGENT.md` | step-by-step instructions that any agent can follow, from fetching the entry to writing the export |

After any change to the rubric or the case list, run `python tools/build_agent_spec.py`.
`python tools/build_agent_spec.py --check` exits with status 1 when `web/agent/` is out of date, so CI can run it.

## Running a batch

`agent/llm_annotate.py` needs Python 3.10 or later. Install `anthropic` to use Claude. For OpenAI-compatible
endpoints the client uses `openai` when it is installed and plain HTTP (`requests`) when it is not. `Pillow` is
optional and only needed to shrink large images. API keys are read from the environment (`ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`) and are never written to any file.

```bash
# 1. Check first: prints the first prompt and a token estimate, makes no API call
python agent/llm_annotate.py --dry-run --cases A001-A010

# 2. Claude (default model claude-opus-5-5), first 10 cases, then the rest (the run resumes)
export ANTHROPIC_API_KEY=...
python agent/llm_annotate.py --provider anthropic --cases A001-A010 --out llm_runs/
python agent/llm_annotate.py --provider anthropic --out llm_runs/

# 3. Self-consistency: 3 independent runs, so 3 files (raters anthropic/claude-opus-5-5#1..#3)
python agent/llm_annotate.py --provider anthropic --repeats 3 --out llm_runs/

# 4. A local open model served by vLLM (OpenAI-compatible API)
vllm serve Qwen/Qwen2.5-VL-7B-Instruct --max-model-len 16384
python agent/llm_annotate.py --provider openai --base-url http://localhost:8000/v1 \
    --model Qwen/Qwen2.5-VL-7B-Instruct --concurrency 8 --out llm_runs/
```

By default the client reads the live site. `--local web` reads a local copy of the repository instead.
`--cases` takes ids, ranges or prefixes (`A001-A010,A015`, `A`), and `--limit N` takes the first N cases.

For each case the model receives:

- the image (base64; downscaled when its long side is over 1568 px);
- the description;
- the transcript: the English translation, plus the original when the clip is not in English (`--transcript-lang
  original` sends only the original);
- the full rubric.

The model must return strict JSON. The client uses structured output with the answer schema (`--json-mode object`
or `none` for endpoints without it) and checks the reply against the option codes and the rules. If Q1 is `no`, the
client fills Q2 to Q6 with `na`, as the page does. `na` anywhere else is invalid, and Q7 = `yes` needs a note. An
invalid reply goes back to the model with the error, up to 2 times. **The audio is not sent**, because most APIs
cannot take it. Every export says so in `run.note`, and the model judges Q5 from the transcript only.

The output is `ophth_audit_<rater-slug>_<YYYYMMDD-HHMM>.json` in `--out`. It follows the same contract as the page's
export, with these differences:

- `rater` is `{"name": "<provider>/<model>", "role": "llm", "years_experience": null}`;
- an extra top-level `run` object records the provider, model and settings, the prompt version and hash, the cases
  sent, any failures, token usage and the models that served the run.

The file is rewritten after every case. Rerunning the same command resumes it: cases already answered are skipped,
and failed cases are retried. `--fresh` starts a new file. `--formats json,csv,xlsx` also writes the page's CSV and
Excel layouts. `annotated_at` is when the answer arrived, and `time_spent_s` is the wall time of the API call(s) for
that case.

Rate limits: the SDKs retry 429 and 5xx responses with exponential backoff (`--max-retries`, default 8). The
plain-HTTP path does the same and honours `Retry-After`. Lower `--concurrency` if requests keep failing. A case that
still fails is listed in `run.failures` and is retried on the next run.

## Costs and limits

- One case uses about 2,800 input tokens (rubric about 2,500, case text about 100, image about 150 to 300) plus the
  JSON answer. Claude models also spend thinking tokens, which `--effort` controls (default `medium`). Run
  `--dry-run` to get the estimate for your selection.
- At the time of writing, Claude Opus 5.5 costs $4 per million input tokens and $20 per million output tokens, so a
  100-case run costs a few dollars. Check the provider's current prices before a large batch, and multiply by
  `--repeats`.
- Recent Claude models reject `temperature`, so the client sends it only when you set it. For OpenAI-compatible
  endpoints it defaults to 0.
- A model that declines a case (`stop_reason` `refusal`) is recorded as a failure. The client never switches the case
  to another model, so each export file has exactly one rater.

## Analysis

Put the export files with the human exports. The study team's analysis script keeps raters with `role == "llm"` out
of every human statistic. It reports them in a section called "LLM raters":

- per question, each LLM's agreement with the human majority (% agreement, Cohen's κ, AC1, and
  sensitivity/specificity for the problem answers);
- self-consistency across the repeats of one model;
- each LLM's own rates next to the human majority rates.

`--include-llm` pools the LLMs with the human raters, which is not recommended. The page's **Load annotations** reads
these files too. It asks for confirmation because the rater name differs from yours.

## Tests

```bash
python -m pytest agent/tests -q
```

The tests make no network or API calls. The client runs against `web/` with a mocked API client. The tests cover:

- the generator: round trip and `--check`;
- the export contract (JSON Schema and `tests/check_exports.py`);
- skip logic, retry on invalid answers, resume, repeats and refusals;
- the analysis integration, when the analysis script is next to the repository.
