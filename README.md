# Ophth-Auditor

A static web page for a human audit of ophthalmic image–description samples. Each case shows one image, the text
description paired with it, and the narration it was derived from (an automatic transcript and the audio clip).
Raters answer a 7-question rubric with the keyboard or the mouse; their annotations are saved in their own browser,
and they download a file at the end of each sitting. There is no server and no account.

The audit cases (images, descriptions, narration transcripts and audio) are in `web/data/` (`manifest.js`,
`images/`, `audio/`), in plaintext. Raters identify themselves by name only when they start; their annotations are
stored per name.

The page follows the review tool Retify in what reviewers see and
do; see "How the page behaves" below.

## For raters

1. **Open https://llm-vlm-gsl.github.io/Ophth-Auditor/** in Chrome or Edge, not in a private window (it would forget
   your annotations).
2. **Type your name.** The page finds your session (any word of the name finds it); a new session needs your full
   name, first and last. When the page is connected to the lab, your annotations are saved there as you make them
   (the top bar says "Saved to the lab"), and you can continue on any computer by typing the same name. Otherwise
   they are kept in this browser: to continue later, open the page again on the same computer and browser.
3. **Answer the 7 questions** of each case: click an answer or press its number (`1`–`7`); the next question is
   highlighted, and when all 7 are answered the next case still to do opens. When the answers are **pre-filled by an
   AI** (marked **AI**, lighter and dashed, with the AI's short reasoning under the questions), check each one, change
   any that is wrong (click it or press its number), then press `Enter` or **Confirm** to keep the rest; a case is done
   only once you confirm it. **How to** (top right) has the full guidelines and every key: `←` `→` change the case,
   `Space` plays the audio, `F` shows the image full size (`Enter` too when nothing is pre-filled).
4. **Unless the top bar says "Saved to the lab": at the end of each sitting, and when you finish, click Download
   annotations → JSON** and send the downloaded
   file (`ophth_audit_<your-name>_<date-time>.json`) to the study team, the way they asked. Excel and CSV are copies
   for your own use. **Load annotations** brings annotations from a downloaded file back (for example on another
   computer).

The **eye** at the top left switches the page between bright and dark.

Please do not share, copy, upload or screenshot the images and texts, and do not forward the link.

## How the page works

`web/` is the whole site: static files, no build step. GitHub Pages publishes it.

| File | Role |
|---|---|
| `index.html`, `style.css`, `app.js` | the page |
| `guidelines.js` | the words of the task (headline, the sentence under it, welcome, guidelines in short, introduction, notes) and the rubric: questions, answer codes, help texts (`rubric-v1`) |
| `config.js` | settings: `server: false` (the page never calls a server API), `encrypted: false` (the data is plaintext) and `relay` (the lab's relay, see below; empty: none) |
| `vendor/xlsx.full.min.js` | SheetJS Community Edition (Apache-2.0), for the Excel download and load |
| `data/` | the audit cases: `manifest.js`, `images/`, `audio/`; optional `ai_prefill.js`, the AI pre-filled answers (below) |

The page loads `data/manifest.js` with a `<script>` tag, so the same code also runs offline, opened from disk
(`file://`); `?data=<folder>` (relative to `index.html`) loads another data folder. With `encrypted: true` in
`config.js`, the page served over http(s) instead looks for encrypted data (`data/meta.json`, see "Encrypted data
format" below), asks for the access code and decrypts each file in the browser. Annotations are kept in the
browser's `localStorage` under `ophth-audit:ann:<manifest_version>:<rater-slug>`; the theme choice under
`ophth-audit:theme`. The page requests nothing from other origins and is marked `noindex, nofollow`.

### How the page behaves (as in Retify)

- **Bright and dark.** Bright by default, whatever the computer's setting. The eye at the top left is the switch: it
  stands out, with a moon or sun badge and a line under it naming the theme it switches to ("Switch to dark" /
  "Switch to bright"). The choice is kept in the browser and applied before the page draws. Colors are tokens on
  `:root`, in both themes.
- **The top bar.** The task in plain words is the headline, with one sentence under it (`question`, `task` in
  `guidelines.js`). On the right: who is annotating over whether it is saved; **How to** (accent, gently floating),
  with the guidelines, the rubric and every key; **Load annotations** over **Download annotations**. Download opens one
  dialog with Excel, CSV and JSON and how many cases are annotated.
- **Plain words.** "Annotations" and "download"; no technical terms (server, slug, manifest, export) on the page.
- **A short welcome for someone new**: after the name, when that name has no annotations yet, once per name in a
  browser. Help otherwise only from How to (or `?`).
- **The image is a small canvas**: scroll zooms at the pointer, drag moves, never smaller than it fits (up to 8×);
  double-click, **Reset view** or `0` shows it whole; each case opens whole; `F` shows it full size (`Enter` too when no answers are pre-filled; with them `Enter` confirms the case).
- **The queue**: orange = to do, blue = started, green = done, red = flagged (an answer that reports a problem).
  "Go to": a number within range is a case number, otherwise a case ID or part of one. After the last question of a
  case, the next case still to do opens.
- **Narrow screens**: below 1100 px the texts and questions go under the image and the page scrolls; below 900 px
  the top bar wraps and the queue moves below the case.
- What differs from Retify on purpose: 7 questions per case (with keyboard answering) instead of Yes/No, the
  description, transcript and audio next to the image, no disagreement tab, the JSON file is the one to send when
  there is no relay, and three columns so that all 7 questions stay visible on a 1366×768 laptop.
- **The right column** sizes each card to its content: the description, then the narration (a long transcript
  scrolls inside it, up to about a third of the screen), then the 7 questions, whose help panel (the answer
  definitions of the highlighted question) and note take the rest. When the column is short the texts give way
  first; the 7 questions and the note always stay whole.

## AI pre-filled answers

When the data folder has `ai_prefill.js`, every case opens with the 7 answers of an LLM already chosen, and the
reviewer confirms or changes them (the owner's choice for this audit). Build it from K runs of one model on all cases
(export files of `agent/llm_annotate.py`):

```bash
python tools/build_ai_prefill.py run1.json run2.json run3.json            # writes web/data/ai_prefill.js
python tools/build_ai_prefill.py run1.json run2.json run3.json --check    # exit 1 when it is out of date
```

Per case and question: the answer of more than half of the runs (2 of 3), else the first run's answer (the question
is listed in `no_majority`); `agree` counts the runs that gave it. Skip logic as on the page: when the AI's q1 is `no`,
q2–q6 are `na`. The note shown as "AI's reasoning" is that of the run agreeing most with these answers. The file is
`window.AUDIT_AI = {model, runs, created, manifest_version, answers: {case_id: {q1_ophthalmic … q7_pii, agree,
no_majority, note}}}`, loaded with a `<script>` tag after `manifest.js` (so `file://` works); a file for another
`manifest_version` is ignored, and encrypted data never loads one.

On the page, every question the reviewer has not answered shows the AI's answer, marked **AI**, lighter and dashed;
the number keys and clicks answer as before (an answer is then the reviewer's, and the AI badge stays on the AI's
option); `Enter` or **Confirm** turns the AI's answers that are left into the reviewer's and opens the next case
(`F` is then full size). Skip logic follows what the case shows: the AI's q1 `no` skips q2–q6 until the reviewer
changes q1. An untouched pre-fill is not an annotation: the case stays "to do" until it is confirmed. The annotation
of a case keeps the AI's answers it showed (`ai`, `ai_model`; see "Exports"), so the analysis can tell a kept answer
(answer = `ai`) from a changed one. Without `ai_prefill.js` the page, its keys and its files are as before.

## The lab's relay: annotations saved as they are made (as in Retify)

`relay/relay.py` (Python 3.9+, standard library; the backup also needs `huggingface_hub`) runs on a lab machine
behind a tunnel. With its address in `config.js` (`relay`, written by the Pages workflow from the repository variable
`AUDIT_RELAY_URL`) or in `?relay=<url>`, the page works as Retify does with its relay:

- **Sessions by name.** "Who is annotating?": the sessions whose name shares a word with the typed name are offered
  ("We found these sessions … Is one of them yours?"), otherwise a new session with the full name. Entering gives the
  browser a key (the relay keeps only its hash); the session is remembered in the browser. **Continue without saving
  to the lab** keeps the browser-only behaviour (name, then annotations in this browser and Download).
- **Save as you go.** Every change of a case goes to an outbox in the browser and is sent in batches; on failure it is
  retried with back-off (up to a minute) and when the browser is back online. The top bar says "Saved to the lab",
  "Saving…", or in red "Not yet saved (n waiting)". On entering, the relay's and the browser's annotations are merged
  (the later `annotated_at` wins), so a reviewer can continue on another computer.
- **Everyone's progress** under the top bar: one card per annotator (masked name, `Tina` → `Ti*a`, completed cases,
  bar; the reviewer's own card says "(you)"), refreshed every 15 s. Never anyone's annotations.
- **Download annotations** still gives the same JSON, CSV and Excel files (a copy).

The relay checks every annotation (and the AI's answers it carries, `ai`, `ai_model`) against the rubric (`guidelines_url`, the page's `guidelines.js`) and the case ids
against the case list (`manifest_url`, `data/manifest.js`), both read again every hour (the last copy offline);
skip logic as on the page. It allows only the `origins` of its settings (CORS; `http://127.0.0.1:*` for tests),
limits requests per IP (10 a second, 20000 annotations and 50 new sessions a day) and request size (1 MB), keeps an
append-only log per session and the current state in `data_dir` (outside the repository), and every
`hf.every_minutes` commits the changed files to a private Hugging Face dataset when `hf.repo` is set (token from
`hf.token_env` or `hf.token_file`, never printed; the key hashes stay on the machine).

```bash
cp relay/relay.local.example.json relay/relay.local.json      # then fill in the URLs, data_dir, origins, hf
python relay/relay.py                                         # http://127.0.0.1:8097/api/ophth-audit/status
python relay/relay.py relay/relay.local.json --export <folder>   # one ophth_audit_<slug>_<YYYYMMDD-HHMM>.json per reviewer
```

The export is the page's JSON export, so `analyze_audit.py` reads it unchanged (sessions under the same name are
merged, the later annotation per case). API, under the prefix (`/api/ophth-audit`): `GET /status`,
`POST /sessions/find {name}`, `POST /sessions {name}`, `POST /sessions/enter {id}`,
`GET /annotations?set=<manifest_version>&session=<id>` and `POST /annotations {set, session, annotations: [...]}`
(header `X-Audit-Key`), `GET /progress?set=<manifest_version>[&session=<id>]`.

**On a Mac** (once, with the owner's go-ahead): `sudo relay/deploy/install.sh <user>` makes `relay/.venv` from
`/usr/bin/python3`, installs the LaunchDaemon `org.ophthaudit.relay` (`relay/deploy/org.ophthaudit.relay.plist`, runs
as `<user>`, restarts on failure, log in `~/Library/Logs/ophth-audit-relay.log`) and checks `/status`. Then the
tunnel's public hostname gets a path rule `^/api/ophth-audit/` to `http://localhost:8097`, and
`gh variable set AUDIT_RELAY_URL --body "https://<lab host>/api/ophth-audit"` before the next Pages run.

## For LLM agents

The same cases can be annotated by a language model through an API, for a pilot or for comparison with the human
raters. `web/agent/` (published at `https://llm-vlm-gsl.github.io/Ophth-Auditor/agent/`) holds a machine-readable
entry: `AGENT.md` (instructions), `index.json`, `rubric.json`, `tasks.jsonl` and `output_schema.json`, generated from
`web/guidelines.js` and `web/data/manifest.js` by `tools/build_agent_spec.py` (the Pages workflow checks that they are
up to date). `agent/llm_annotate.py` runs a batch against Anthropic or any OpenAI-compatible endpoint and writes the
same JSON file a person downloads, with `rater.role = "llm"`; see `agent/README.md`. LLM annotations are reported
separately from the human audit.

## Exports

Download annotations offers three files with the same content. **JSON** (the file to send back), named `ophth_audit_<rater-slug>_<YYYYMMDD-HHMM>.json`:

```json
{
  "tool": "ophth-audit", "tool_version": "1.0", "rubric_version": "rubric-v1",
  "manifest_version": "v1-2026-11-18", "exported_at": "2026-11-18T10:31:05-07:00",
  "rater": {"name": "Full Name", "role": "", "years_experience": null},
  "annotations": {
    "A001": {"q1_ophthalmic": "yes", "q2_modality": "oct", "q3_crop": "good", "q4_image_text": "full",
             "q5_faithful": "partial", "q6_clinical": "correct", "q7_pii": "no", "note": "",
             "annotated_at": "2026-11-18T09:41:07-07:00", "time_spent_s": 41.2}
  }
}
```

The page asks for the name only, so `role` is always `""` and `years_experience` always `null` (the fields stay for
the analysis script; earlier files may have a role: `ophthalmologist`, `optometrist`, `resident_fellow`,
`trained_grader`, `researcher`, `other`). Answer codes:

| Question | Codes |
|---|---|
| `q1_ophthalmic` ophthalmic clinical image? | `yes` `no` `unsure` |
| `q2_modality` imaging modality | `oct` `cfp` `uwf` `angio` `other` `multi` `unsure` |
| `q3_crop` relevant region preserved in the crop? | `good` `partial` `bad` |
| `q4_image_text` description matches the image? | `full` `partial` `none` |
| `q5_faithful` description supported by the narration? | `full` `partial` `unsupported` `cant_judge` |
| `q6_clinical` description clinically accurate? | `correct` `minor` `major` `cant_judge` |
| `q7_pii` patient-identifying information visible? | `no` `yes` |

When `q1_ophthalmic` is `no`, `q2`–`q6` are recorded as `na`. Unanswered is an empty string.

**With AI pre-filled answers** each record also has, after `time_spent_s`, `"ai": {"q1_ophthalmic": …, …,
"q7_pii": …}` (the AI's answer the case showed for each question; all `""` for a case never opened) and
`"ai_model"` (e.g. `"openai/gpt-6-luna"`). A question's answer equal to `ai[q]` is a kept AI answer, any other a
changed one. A case counts as annotated only once every answer is the reviewer's.

**CSV and Excel**: one row per case, columns `no, case_id, q1_ophthalmic, q2_modality, q3_crop, q4_image_text,
q5_faithful, q6_clinical, q7_pii, note, annotated_at, time_spent_s`; the Excel file has a second sheet `rater`
(`field, value`: `name, role, years_experience, manifest_version, rubric_version, exported_at`). A CSV file has no
rater block, so its rater is the slug in the file name. With AI pre-filled answers the columns `ai_q1_ophthalmic, …,
ai_q7_pii, ai_model` follow `time_spent_s`.

**Rater slug**: lowercase the full name, replace every run of characters outside `[a-z0-9]` with one `-`, strip
leading and trailing `-`, keep at most 40 characters; empty gives `rater`. Example: `Dr. Jane O'Neil` →
`dr-jane-o-neil`.

**Load annotations** reads JSON, CSV and Excel files downloaded from this page, and also files exported by earlier
versions of the offline package (another file-name prefix before `_audit_<slug>_<date>`, another `tool` id). For each
case, the answer with the later `annotated_at` wins.

## Encrypted data format (`ophth-audit-enc-v1`)

Not used by the site now (its data is plaintext); kept for later use. The page reads it only when `config.js` says
`encrypted: true`. Written by `tools/encrypt_data.py` (its docstring is the reference):

- `meta.json`, plaintext, exactly these keys: `{"format": "ophth-audit-enc-v1", "dataset": <manifest_version>,
  "created": <ISO time>, "kdf": {"name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": <base64, 16 bytes>},
  "cipher": "AES-256-GCM", "manifest": "manifest.bin", "n_cases": <number of cases>}`.
- `manifest.bin`: the case list (the same object as the plaintext `manifest.js`), except that media paths point to
  `data/images/<id>.bin` and `data/audio/<id>.bin` and each case has `image_type` and `audio_type` (MIME types).
- `images/<id>.bin`, `audio/<id>.bin`: the media files, byte for byte.
- Every `.bin` file is a 12-byte random IV, then the AES-256-GCM ciphertext with its 128-bit tag. The additional
  authenticated data is the UTF-8 path of the file relative to `data/` (for example `images/A001.bin`), so files
  cannot be swapped.
- The key is PBKDF2-HMAC-SHA256 of the access code after normalization (lowercase; every character outside `[a-z0-9]`
  dropped), with the salt and iteration count of `meta.json`, 32 bytes.

## For maintainers

Rebuild the encrypted data from the plaintext data folder (`manifest.js`, `images/`, `audio/`):

```bash
python tools/encrypt_data.py --src <plaintext data folder> --out web/data --code-file <file outside this repository>
```

- The first run creates the code file with a new random code (6 groups of 4 characters from
  `23456789abcdefghjkmnpqrstuvwxyz`, 119 bits) and prints only its path. The code file must never be in this
  repository; the tool refuses a code file inside it.
- To rebuild later (for example with a second batch of cases), add `--keep-salt` and use the same code file: keys that
  raters' browsers remember stay valid, and files whose content did not change stay byte-identical.
- The tool only writes `meta.json` and `.bin` files into `--out`, removes anything else there, refuses an output
  folder that holds other data, then decrypts every file again and compares it (SHA-256) with its source; it exits
  non-zero on any mismatch. `--verify-only` repeats that check without writing.
- Send raters the address of the site followed by `#key=<code>`, or the code on its own, through a private channel.
- A new code: replace the code file and rebuild without `--keep-salt`; every rater then needs the new code.

Requirements: Python 3.9+ with `cryptography` (and `pandas`, `openpyxl` for the export checks); Node 22+ and Chrome
or Edge for the browser tests.

## Tests

```bash
python tests/test_encrypt.py                       # round trip of the encryption tool on the dummy fixture
python tests/test_ai_prefill.py                    # tools/build_ai_prefill.py: majority, ties, skip logic, fixture
python tests/test_relay.py                         # the relay: sessions, keys, validation, later wins, log, progress,
                                                   #   CORS and limits, backup, export (Python 3.9+)
node tests/e2e_relay.mjs [outdir]                  # the page with a local relay: sessions by name, save as you go,
                                                   #   resume in a fresh browser, progress strip, outbox while the
                                                   #   relay is down, Continue without saving, export
node tests/e2e.mjs plain [outdir]                  # file:// with the plaintext fixture: the whole flow (name, welcome,
                                                   #   keys, skip logic, timing, downloads, load/merge, AI pre-filled
                                                   #   answers: shown, changed, confirmed, in the files), the Retify
                                                   #   behaviour (eye switch, How to, plain words), layout at
                                                   #   1366x657 bright and dark, 1000, 820 and 420 px
node tests/e2e.mjs real <outdir> [code file]       # serves web/ as it is on http://127.0.0.1 (like GitHub Pages) and
                                                   #   walks every case of data/: image and audio load; layout and
                                                   #   screenshots (the code file only for encrypted data)
node tests/e2e.mjs encrypted [outdir]              # an encrypted copy of the fixture, served with a config.js that
                                                   #   says encrypted: true: access code, remembered key, Lock, #key=
python tests/serve.py                              # this site at http://127.0.0.1:8790/ (or --data <folder>,
                                                   #   --config <file> for another config.js)
```

Environment variables: `PYTHON` (a Python with the packages above), `CHROME` (browser path). Keep every `<outdir>`
outside the repository: it receives downloads and screenshots. `tests/fixture/data`
holds six dummy cases (drawn images, silent audio) made by `tests/make_fixture.py`, and `ai_prefill.js` built from
three made-up LLM runs in `tests/fixture/ai_runs/` (`python tests/make_fixture.py --ai-only` rebuilds only these).

## Security model and its limits

The site's data is now **plaintext** (`config.js`: `encrypted: false`): anyone who has the link, or looks at this
repository, can see the cases. The page is marked `noindex, nofollow`, does not name the dataset, and requests
nothing from other origins; raters are asked not to forward the link. What follows applies only when the data is
encrypted again (`encrypted: true` and data built by `tools/encrypt_data.py`).

What encryption protects:

- The data in the repository and on the site is encrypted with AES-256-GCM under a key derived from the
  access code with PBKDF2-HMAC-SHA256 (600,000 iterations, random 16-byte salt). The code has 119 bits of randomness,
  far beyond guessing. Without it, one can see only the page code, the number and sizes of the files, and the
  dataset version label and build time in `meta.json`.
- Every file is authenticated: a damaged or swapped file is refused, never shown.
- The code never reaches a server: decryption happens in the browser, and the `#key=` part of an address is not sent
  in requests; the page removes it from the address bar as soon as it loads.

Its limits:

- Anyone who has the code, or the link, can decrypt and copy everything. The encryption keeps the data from the
  public, not from the people who have the code.
- A `#key=` link can remain in the browser's history list, in e-mail or chat archives, and is visible to browser
  extensions. Send it privately, and do not post it anywhere.
- **Remember on this computer** stores the derived key (not the code) unencrypted in the browser's `localStorage`:
  anyone who can use that browser profile can open the data. On shared computers, uncheck it or use
  **Lock / forget code**.
- Answers and notes are stored unencrypted in the browser and in the exported files.
- The repository history keeps every encrypted file ever committed. If the code leaks, a new code does not protect
  those old files: the history and the published site must be removed or rewritten as well.
- The page code is public and is what decrypts the data: whoever can push to this repository could change it to
  capture codes. Keep write access limited.
- Decryption needs a secure context: https, or http://127.0.0.1 / http://localhost.
- The encryption tool never writes plaintext into its output folder. (While the site publishes plaintext data, the
  Pages workflow and `.gitignore` allow it; restore their checks before switching back to encrypted data.)

## Licence and acknowledgements

The code is MIT-licensed (`LICENSE`); the study data is not covered by that licence and may not be reused.
`web/vendor/xlsx.full.min.js` is SheetJS Community Edition (Apache-2.0). Interaction patterns, the image viewer and
the CSV reader are adapted from an earlier MIT-licensed annotation tool by the same authors.
