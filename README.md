# Ophth-Auditor

A static web page for a human audit of ophthalmic image–description samples. Each case shows one image, the text
description paired with it, and the narration it was derived from (an automatic transcript and the audio clip).
Raters answer a 7-question rubric with the keyboard or the mouse; their answers are saved in their own browser, and
they export a file at the end of each sitting. There is no server and no account.

The audit cases (images, descriptions, narration transcripts and audio) are in `web/data/` (`manifest.js`,
`images/`, `audio/`). Raters identify themselves by name, role and years of experience when they start; their
answers are stored per rater.

## For raters

1. **Open https://llm-vlm-gsl.github.io/Ophth-Auditor/** in Chrome or Edge, not in a private window (it would forget
   your answers).
2. **Enter your full name**, your role and your years of experience. Your answers are saved in this browser under
   that name: to continue later, open the page again on the same computer and browser and type the same name.
3. **Answer the 7 questions** of each case. **Guide** (top right) has the full rubric and `?` lists the keyboard
   shortcuts: `1`–`7` answer the highlighted question, `←` `→` change the case, `Space` plays the audio, `F` shows
   the image full size. A complete case opens the next one.
4. **At the end of each sitting, and when you finish, click Export JSON** and send the downloaded file
   (`ophth_audit_<your-name>_<date-time>.json`) to the study team, the way they asked. CSV and Excel are copies for
   your own use. **Load annotations** brings answers from an exported file back (for example on another computer).

Please do not share, copy, upload or screenshot the images and texts, and do not forward the link or the code.

## How the page works

`web/` is the whole site: static files, no build step. GitHub Pages publishes it.

| File | Role |
|---|---|
| `index.html`, `style.css`, `app.js` | the page |
| `guidelines.js` | the rubric: questions, answer codes, help texts (`rubric-v1`) |
| `config.js` | settings: `server: false` here, so the page never calls a server API |
| `vendor/xlsx.full.min.js` | SheetJS Community Edition (Apache-2.0), for the Excel export and import |
| `data/` | the encrypted data (see below) |

The same code also runs offline: opened from disk (`file://`), it loads a plaintext `data/manifest.js` with a
`<script>` tag. Served over http(s), it first fetches `data/meta.json`; when that file describes encrypted data, the
page asks for the access code, decrypts `data/manifest.bin`, then decrypts each image and audio clip when its case
is shown (the neighbouring cases in advance) and keeps only a few of them in memory. Answers are kept in the
browser's `localStorage` under `ophth-audit:ann:<manifest_version>:<rater-slug>`. The page requests nothing from
other origins and is marked `noindex, nofollow`.

## Exports

**JSON** (the file to send back), named `ophth_audit_<rater-slug>_<YYYYMMDD-HHMM>.json`:

```json
{
  "tool": "ophth-audit", "tool_version": "1.0", "rubric_version": "rubric-v1",
  "manifest_version": "v1-2026-11-18", "exported_at": "2026-11-18T10:31:05-07:00",
  "rater": {"name": "Full Name", "role": "ophthalmologist", "years_experience": 5},
  "annotations": {
    "A001": {"q1_ophthalmic": "yes", "q2_modality": "oct", "q3_crop": "good", "q4_image_text": "full",
             "q5_faithful": "partial", "q6_clinical": "correct", "q7_pii": "no", "note": "",
             "annotated_at": "2026-11-18T09:41:07-07:00", "time_spent_s": 41.2}
  }
}
```

Roles: `ophthalmologist`, `optometrist`, `resident_fellow`, `trained_grader`, `researcher`, `other`. Answer codes:

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

**CSV and Excel**: one row per case, columns `no, case_id, q1_ophthalmic, q2_modality, q3_crop, q4_image_text,
q5_faithful, q6_clinical, q7_pii, note, annotated_at, time_spent_s`; the Excel file has a second sheet `rater`
(`field, value`: `name, role, years_experience, manifest_version, rubric_version, exported_at`). A CSV file has no
rater block, so its rater is the slug in the file name.

**Rater slug**: lowercase the full name, replace every run of characters outside `[a-z0-9]` with one `-`, strip
leading and trailing `-`, keep at most 40 characters; empty gives `rater`. Example: `Dr. Jane O'Neil` →
`dr-jane-o-neil`.

**Load annotations** reads JSON, CSV and Excel files exported by this page, and also files exported by earlier
versions of the offline package (another file-name prefix before `_audit_<slug>_<date>`, another `tool` id). For each
case, the answer with the later `annotated_at` wins.

## Encrypted data format (`ophth-audit-enc-v1`)

Written by `tools/encrypt_data.py` (its docstring is the reference):

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
node tests/e2e.mjs plain                           # file:// with the plaintext fixture: rating, exports, load/merge
node tests/e2e.mjs encrypted                       # http://127.0.0.1 with an encrypted copy of the fixture: access
                                                   #   code, remembered key, Lock, #key= links, decryption, errors
node tests/e2e.mjs real <outdir> <code file>       # the site's own data/: every case decrypts (keep <outdir> outside
                                                   #   the repository: it receives screenshots)
python tests/serve.py                              # this site at http://127.0.0.1:8790/ (or --data <folder>)
```

Environment variables: `PYTHON` (a Python with the packages above), `CHROME` (browser path). `tests/fixture/data`
holds six dummy cases (drawn images, silent audio) made by `tests/make_fixture.py`.

## Security model and its limits

What it protects:

- The data in this public repository and on the site is encrypted with AES-256-GCM under a key derived from the
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
- Plaintext must never be committed: `.gitignore` excludes plaintext media and manifests under `web/data/`, the Pages
  workflow refuses to publish them, and the encryption tool never writes them into its output folder.

## Licence and acknowledgements

The code is MIT-licensed (`LICENSE`); the study data is not covered by that licence and may not be reused.
`web/vendor/xlsx.full.min.js` is SheetJS Community Edition (Apache-2.0). Interaction patterns, the image viewer and
the CSV reader are adapted from an earlier MIT-licensed annotation tool by the same authors.
