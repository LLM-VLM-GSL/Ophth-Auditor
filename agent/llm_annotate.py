#!/usr/bin/env python3
"""Batch-annotate the audit cases with an LLM and write the same export file as the audit page.

    # Anthropic (key in ANTHROPIC_API_KEY)
    python agent/llm_annotate.py --provider anthropic --cases A001-A010 --out runs/
    # any OpenAI-compatible endpoint, e.g. a local vLLM server (key, if any, in OPENAI_API_KEY)
    python agent/llm_annotate.py --provider openai --base-url http://localhost:8000/v1 \\
        --model Qwen/Qwen2.5-VL-72B-Instruct --out runs/
    # show the first prompt and a token estimate, no API call
    python agent/llm_annotate.py --local web --dry-run

Inputs come from the published agent entry (web/agent/ on the site, or --local web/ from disk): index.json,
rubric.json, tasks.jsonl. Per case the model gets the image (base64, long side at most --image-max-side px), the
description, the transcript (English translation by default, plus the original when the clip is not in English) and
the full rubric, and must return strict JSON {q1_ophthalmic..q7_pii, note}. The answer is checked against the option
codes, the skip rule (q1 = no -> q2..q6 = na, filled in as the page does) and the note rule (q7 = yes needs a note);
an invalid answer is sent back with the error (at most --max-fix retries). Audio is not sent.

Output: ophth_audit_<rater-slug>_<YYYYMMDD-HHMM>.json in --out, exactly the page's export contract, with
rater = {name: "<provider>/<model>" (+ "#k" with --repeats), role: "llm", years_experience: null} and an extra
top-level "run" object (settings, prompt hash, cases sent, failures, token usage). The file is rewritten after every
case; rerunning the same command resumes it (cases already answered are skipped). API keys are read from the
environment and never written anywhere.

Python 3.10+. Needs the `anthropic` package for --provider anthropic; uses the `openai` package for --provider openai
when it is installed (plain HTTP otherwise); Pillow to downscale large images (optional).
"""
from __future__ import annotations

import argparse
import base64
import concurrent.futures as cf
import datetime as dt
import hashlib
import io
import json
import os
import random
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

CLIENT_VERSION = "1.0"
PROMPT_VERSION = "agent-prompt-v1"
DEFAULT_SITE = "https://llm-vlm-gsl.github.io/Ophth-Auditor/"
DEFAULT_MODELS = {"anthropic": "claude-opus-5-5", "openai": "Qwen/Qwen2.5-VL-72B-Instruct"}
KEY_ENV = {"anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY"}
TOOL, TOOL_VERSION = "ophth-audit", "1.0"
EXPORT_KEYS = ["tool", "tool_version", "rubric_version", "manifest_version", "exported_at", "rater", "annotations"]
NOTE_MAX = 2000
AUDIO_NOTE = ("Audio clips were not sent to the model (most APIs cannot take audio); the model judged the narration "
              "(Q5) from the transcript only.")


# ============================================================================ small helpers
def slugify(name) -> str:
    """Rater slug, identical to the page's rule."""
    s = re.sub(r"[^a-z0-9]+", "-", str(name if name is not None else "").lower()).strip("-")[:40]
    return s or "rater"


def iso_now() -> str:
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def file_stamp(d: dt.datetime | None = None) -> str:
    return (d or dt.datetime.now()).strftime("%Y%m%d-%H%M")


def parse_case_range(spec: str, ids: list[str]) -> list[str]:
    """'A001-A010,A015,B' -> ids in task order. A bare prefix selects every id starting with it."""
    want = []
    pos = {c: k for k, c in enumerate(ids)}
    for part in [p.strip() for p in (spec or "").split(",") if p.strip()]:
        if "-" in part:
            a, b = [x.strip() for x in part.split("-", 1)]
            if a not in pos or b not in pos:
                raise ValueError(f"unknown case id in range {part!r}")
            lo, hi = sorted((pos[a], pos[b]))
            want.extend(ids[lo:hi + 1])
        elif part in pos:
            want.append(part)
        else:
            hits = [c for c in ids if c.startswith(part)]
            if not hits:
                raise ValueError(f"unknown case id or prefix {part!r}")
            want.extend(hits)
    seen = set(want)
    return [c for c in ids if c in seen]


# ============================================================================ the agent entry (site or disk)
class Source:
    """Reads the agent entry and the media, from the live site (--site) or from a local web/ folder (--local)."""

    def __init__(self, site: str | None = None, local: str | None = None, timeout: float = 60):
        self.local = Path(local) if local else None
        self.site = None if local else (site or DEFAULT_SITE)
        if self.site and not self.site.endswith("/"):
            self.site += "/"
        self.timeout = timeout

    @property
    def where(self) -> str:
        return str(self.local) if self.local else self.site

    def read_bytes(self, rel: str) -> bytes:
        if self.local:
            return (self.local / rel).read_bytes()
        url = urllib.parse.urljoin(self.site, rel)
        req = urllib.request.Request(url, headers={"User-Agent": "audit-agent-client/" + CLIENT_VERSION})
        delay = 2.0
        for attempt in range(6):
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    return r.read()
            except urllib.error.HTTPError as e:
                if e.code not in (429, 500, 502, 503, 504) or attempt == 5:
                    raise
            except urllib.error.URLError:
                if attempt == 5:
                    raise
            time.sleep(delay)
            delay *= 2

    def read_json(self, rel: str):
        return json.loads(self.read_bytes(rel).decode("utf-8-sig"))

    def load(self):
        index = self.read_json("agent/index.json")
        rubric = self.read_json("agent/" + index["links"]["rubric"])
        tasks = [json.loads(line) for line in self.read_bytes("agent/" + index["links"]["tasks"]).decode("utf-8").splitlines()
                 if line.strip()]
        return index, rubric, tasks


def prepare_image(data: bytes, max_side: int) -> tuple[bytes, str, tuple[int, int] | None]:
    """Downscale to max_side (long side) when larger; returns (bytes, media type, (w, h) or None)."""
    media = "image/png" if data[:8] == b"\x89PNG\r\n\x1a\n" else "image/webp" if data[8:12] == b"WEBP" else "image/jpeg"
    try:
        from PIL import Image
    except ImportError:
        return data, media, None
    im = Image.open(io.BytesIO(data))
    w, h = im.size
    if max(w, h) <= max_side:
        return data, media, (w, h)
    s = max_side / max(w, h)
    im = im.convert("RGB").resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=90)
    return buf.getvalue(), "image/jpeg", im.size


# ============================================================================ prompt
def rubric_codes(rubric) -> dict[str, list[str]]:
    return {q["id"]: [o["code"] for o in q["options"]] for q in rubric["questions"]}


def skippable(rubric) -> list[str]:
    return [q["id"] for q in rubric["questions"] if q.get("skip_if")]


def skip_trigger(rubric) -> tuple[str, list[str]]:
    for q in rubric["questions"]:
        for k, v in (q.get("skip_if") or {}).items():
            return k, list(v)
    return "q1_ophthalmic", ["no"]


def system_prompt(rubric) -> str:
    L = ["You are an experienced ophthalmologist acting as one rater in an audit of a dataset of ophthalmic images "
         "paired with text descriptions. You answer a fixed rubric for one case at a time.", "",
         "## Instructions given to the human raters", "", rubric["intro"], ""]
    L += ["- " + n for n in rubric.get("notes", [])]
    L += ["", "## Additional rules for you (automated rater)", ""] + ["- " + n for n in rubric.get("agent_notes", [])]
    L += ["", "## Questions", ""]
    for k, q in enumerate(rubric["questions"], 1):
        L.append(f"### Q{k} `{q['id']}`: {q['title']}")
        L.append(q.get("help", ""))
        if q.get("skip_if"):
            cond = "; ".join(f"{a} is {' or '.join(map(repr, b))}" for a, b in q["skip_if"].items())
            L.append(f"(Answer `na` if {cond}.)")
        for o in q["options"]:
            L.append(f"- `{o['code']}` ({o['label']}): {o['help']}")
        L.append("")
    trig, vals = skip_trigger(rubric)
    L += ["## Output", "",
          "Reply with one JSON object and nothing else, with exactly these keys: "
          + ", ".join(q["id"] for q in rubric["questions"]) + ", note. Each answer is one option code (a string). "
          f"If {trig} is {' or '.join(map(repr, vals))}, every one of {', '.join(skippable(rubric))} is \"na\"; never "
          "use \"na\" otherwise. \"note\" is a short English sentence (at most about 40 words)."]
    return "\n".join(L)


def case_text(task, transcript_lang: str = "en") -> str:
    lang = (task.get("lang") or "").strip() or "unknown"
    orig, en = (task.get("transcript") or "").strip(), (task.get("transcript_en") or "").strip()
    L = ["Case to rate. The image is attached.", "", "DESCRIPTION (the text to judge):", task.get("caption") or "(empty)", ""]
    if transcript_lang == "original":
        L += [f"NARRATION: automatic transcript of the audio clip (language: {lang}):", orig or "(no transcript)"]
    else:
        L += ["NARRATION: automatic transcript of the audio clip" + ("" if lang == "en" else
              f", machine-translated to English from {lang}") + ":", (en or orig) or "(no transcript)"]
        if lang != "en" and orig:
            L += ["", f"Original transcript ({lang}):", orig]
    L += ["", "The audio itself is not available to you. Answer the 7 questions now, as one JSON object."]
    return "\n".join(L)


def answer_schema(rubric) -> dict:
    """Schema sent to the API (structured outputs / json_schema): enums per question, na allowed on q2..q6.
    Skip and note rules are checked here, not by the API (conditional schemas are not widely supported)."""
    sk = set(skippable(rubric))
    props = {q: {"type": "string", "enum": c + (["na"] if q in sk else [])} for q, c in rubric_codes(rubric).items()}
    props["note"] = {"type": "string"}
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


def prompt_hash(rubric) -> str:
    h = hashlib.sha256()
    h.update(PROMPT_VERSION.encode())
    h.update(system_prompt(rubric).encode("utf-8"))
    h.update(json.dumps(answer_schema(rubric), sort_keys=True).encode())
    h.update(case_text({"caption": "{caption}", "transcript": "{t}", "transcript_en": "{t_en}", "lang": "xx"}).encode())
    return h.hexdigest()[:16]


# ============================================================================ validation
class InvalidAnswer(ValueError):
    pass


def extract_json(text: str) -> dict:
    s = (text or "").strip()
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", s, re.S)
    if m:
        s = m.group(1)
    elif not s.startswith("{"):
        i, j = s.find("{"), s.rfind("}")
        if i < 0 or j < i:
            raise InvalidAnswer("the reply contains no JSON object")
        s = s[i:j + 1]
    try:
        obj = json.loads(s)
    except json.JSONDecodeError as e:
        raise InvalidAnswer(f"the reply is not valid JSON ({e.msg} at character {e.pos})") from e
    if not isinstance(obj, dict):
        raise InvalidAnswer("the reply must be a JSON object")
    return obj


def validate_answer(obj: dict, rubric) -> tuple[dict, list[str]]:
    """Check one answer; returns (clean answer, list of fixes applied). Raises InvalidAnswer with all problems."""
    codes, sk = rubric_codes(rubric), skippable(rubric)
    trig, vals = skip_trigger(rubric)
    errs, fixes, out = [], [], {}
    norm = {str(k).strip(): v for k, v in obj.items()}
    for q, opts in codes.items():
        v = norm.get(q)
        if v is None:
            errs.append(f"missing key {q}")
            continue
        v = str(v).strip().lower()
        if v not in opts and not (v == "na" and q in sk):
            errs.append(f"{q} = {v!r} is not one of {opts}" + (" (or 'na' when the skip rule applies)" if q in sk else ""))
        out[q] = v
    extra = [k for k in norm if k not in codes and k != "note"]
    if extra:
        errs.append(f"unexpected keys {extra}")
    note = norm.get("note", "")
    out["note"] = "" if note is None else str(note).strip()
    if not errs:
        if out[trig] in vals:
            for q in sk:
                if out[q] != "na":
                    fixes.append(f"{q} {out[q]} -> na (skip rule)")
                    out[q] = "na"
        else:
            bad = [q for q in sk if out[q] == "na"]
            if bad:
                errs.append(f"{', '.join(bad)} = 'na' but {trig} = {out[trig]!r}: 'na' is only allowed when "
                            f"{trig} is {' or '.join(map(repr, vals))}; choose a real option")
        for q in rubric["questions"]:
            for o in q["options"]:
                if o.get("note_required") and out.get(q["id"]) == o["code"] and not out["note"]:
                    errs.append(f"{q['id']} = {o['code']!r} requires a note saying what and where")
    if errs:
        raise InvalidAnswer("; ".join(errs))
    if len(out["note"]) > NOTE_MAX:
        out["note"] = out["note"][:NOTE_MAX]
        fixes.append("note truncated")
    return {**{q: out[q] for q in codes}, "note": out["note"]}, fixes


# ============================================================================ providers
class Refusal(RuntimeError):
    pass


class Reply:
    def __init__(self, text, assistant_message, model=None, input_tokens=0, output_tokens=0, stop=None):
        self.text, self.assistant_message, self.model = text, assistant_message, model
        self.input_tokens, self.output_tokens, self.stop = input_tokens, output_tokens, stop


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, model, max_tokens=16000, effort="medium", temperature=None, use_schema=True, max_retries=8,
                 timeout=600, client=None):
        if client is None:
            try:
                import anthropic
            except ImportError as e:
                raise SystemExit("--provider anthropic needs the anthropic package: pip install anthropic") from e
            if not os.environ.get(KEY_ENV["anthropic"]):
                raise SystemExit(f"set {KEY_ENV['anthropic']} in the environment")
            client = anthropic.Anthropic(max_retries=max_retries, timeout=timeout)   # SDK backs off on 429/5xx
        self.client, self.model, self.max_tokens = client, model, max_tokens
        self.effort, self.temperature, self.use_schema = effort, temperature, use_schema

    def image_block(self, b64, media):
        return {"type": "image", "source": {"type": "base64", "media_type": media, "data": b64}}

    def user_message(self, b64, media, text):
        return {"role": "user", "content": [self.image_block(b64, media), {"type": "text", "text": text}]}

    def complete(self, system, messages, schema) -> Reply:
        kw = dict(model=self.model, max_tokens=self.max_tokens,
                  system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}], messages=messages)
        oc = {}
        if self.effort:
            oc["effort"] = self.effort
        if self.use_schema:
            oc["format"] = {"type": "json_schema", "schema": schema}
        if oc:
            kw["output_config"] = oc
        if self.temperature is not None:                     # rejected by recent models; only sent when asked for
            kw["temperature"] = self.temperature
        r = self.client.messages.create(**kw)
        if r.stop_reason == "refusal":
            raise Refusal("the model declined the request (stop_reason refusal)")
        text = "".join(b.text for b in r.content if getattr(b, "type", None) == "text")
        u = getattr(r, "usage", None)
        return Reply(text, {"role": "assistant", "content": r.content}, getattr(r, "model", self.model),
                     getattr(u, "input_tokens", 0) or 0, getattr(u, "output_tokens", 0) or 0, r.stop_reason)


class OpenAICompatProvider:
    """Chat Completions on any OpenAI-compatible endpoint (OpenAI, vLLM, SGLang, LM Studio, ...)."""
    name = "openai"

    def __init__(self, model, base_url=None, max_tokens=4096, temperature=0.0, json_mode="schema", max_retries=8,
                 timeout=600, client=None, post=None):
        self.model, self.max_tokens, self.temperature, self.json_mode = model, max_tokens, temperature, json_mode
        self.base_url = (base_url or os.environ.get("OPENAI_BASE_URL") or "https://api.openai.com/v1").rstrip("/")
        self.max_retries, self.timeout, self.client, self._post = max_retries, timeout, client, post
        key = os.environ.get(KEY_ENV["openai"])
        if client is None and post is None:
            try:
                import openai
                self.client = openai.OpenAI(base_url=self.base_url, api_key=key or "EMPTY",
                                            max_retries=max_retries, timeout=timeout)   # SDK backs off on 429/5xx
            except ImportError:
                self._post = self._http_post
        self._key = key

    def image_block(self, b64, media):
        return {"type": "image_url", "image_url": {"url": f"data:{media};base64,{b64}"}}

    def user_message(self, b64, media, text):
        return {"role": "user", "content": [self.image_block(b64, media), {"type": "text", "text": text}]}

    def _http_post(self, payload):
        """Plain HTTP with exponential backoff on 429/5xx and network errors (when the openai package is absent)."""
        import requests
        headers = {"Content-Type": "application/json"}
        if self._key:
            headers["Authorization"] = "Bearer " + self._key
        return post_with_backoff(lambda: requests.post(self.base_url + "/chat/completions", json=payload,
                                                       headers=headers, timeout=self.timeout), self.max_retries)

    def complete(self, system, messages, schema) -> Reply:
        official = not self.base_url or "api.openai.com" in self.base_url
        # api.openai.com: current (reasoning) models take max_completion_tokens (which also covers their reasoning
        # tokens) and reject a temperature; OpenAI-compatible servers such as vLLM still expect max_tokens.
        payload = dict(model=self.model, messages=[{"role": "system", "content": system}] + messages)
        if official:
            payload["max_completion_tokens"] = max(self.max_tokens, 16000)
        else:
            payload["max_tokens"] = self.max_tokens
            if self.temperature is not None:
                payload["temperature"] = self.temperature
        if self.json_mode == "schema":
            payload["response_format"] = {"type": "json_schema",
                                          "json_schema": {"name": "case_answer", "schema": schema, "strict": True}}
        elif self.json_mode == "object":
            payload["response_format"] = {"type": "json_object"}
        if self.client is not None:
            r = self.client.chat.completions.create(**payload)
            d = r.model_dump() if hasattr(r, "model_dump") else r
        else:
            d = self._post(payload)
        ch = d["choices"][0]
        text = ch["message"].get("content") or ""
        if ch["message"].get("refusal"):
            raise Refusal(str(ch["message"]["refusal"]))
        u = d.get("usage") or {}
        return Reply(text, {"role": "assistant", "content": text}, d.get("model", self.model),
                     u.get("prompt_tokens", 0) or 0, u.get("completion_tokens", 0) or 0, ch.get("finish_reason"))


class TransientHTTPError(RuntimeError):
    pass


def post_with_backoff(send, max_retries=8, base=2.0, cap=120.0, sleep=time.sleep):
    """Call send() -> response with .status_code/.json()/.headers; retry 429/5xx and connection errors with
    exponential backoff (honours Retry-After)."""
    for attempt in range(max_retries + 1):
        try:
            r = send()
        except (ConnectionError, TimeoutError, OSError) as e:
            err, wait = e, None
        else:
            if r.status_code < 400:
                return r.json()
            if r.status_code not in (408, 409, 429) and r.status_code < 500:
                raise RuntimeError(f"HTTP {r.status_code}: {str(getattr(r, 'text', ''))[:500]}")
            err = TransientHTTPError(f"HTTP {r.status_code}")
            ra = (getattr(r, "headers", None) or {}).get("retry-after")
            try:
                wait = float(ra) if ra is not None else None
            except ValueError:
                wait = None
        if attempt == max_retries:
            raise err
        sleep(min(cap, wait if wait is not None else base * 2 ** attempt * (0.5 + random.random() / 2)))


# ============================================================================ export file
def blank_record(qids):
    return {**{q: "" for q in qids}, "note": "", "annotated_at": "", "time_spent_s": 0}


def is_done(rec, qids) -> bool:
    return bool(rec) and all(rec.get(q) for q in qids)


def find_existing(out_dir: Path, slug: str):
    cands = sorted(out_dir.glob(f"ophth_audit_{slug}_*.json"))
    cands = [p for p in cands if re.fullmatch(rf"ophth_audit_{re.escape(slug)}_\d{{8}}-\d{{4}}\.json", p.name)]
    return cands[-1] if cands else None


def write_json_atomic(path: Path, obj):
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, path)


def write_table_exports(path_json: Path, export, task_ids, qids, formats):
    """CSV / XLSX with the page's columns (optional; the JSON is the primary export)."""
    cols = ["no", "case_id"] + qids + ["note", "annotated_at", "time_spent_s"]
    rows = [[k + 1, cid] + [export["annotations"][cid][c] for c in cols[2:]] for k, cid in enumerate(task_ids)]
    if "csv" in formats:
        import csv
        with open(path_json.with_suffix(".csv"), "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f, lineterminator="\r\n")
            w.writerow(cols)
            w.writerows(rows)
    if "xlsx" in formats:
        try:
            import openpyxl
        except ImportError:
            print("[warn] openpyxl missing: no .xlsx written", file=sys.stderr)
            return
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "annotations"
        ws.append(cols)
        for r in rows:
            ws.append(r)
        ws2 = wb.create_sheet("rater")
        r = export["rater"]
        for row in (["field", "value"], ["name", r["name"]], ["role", r["role"]], ["years_experience", r["years_experience"]],
                    ["manifest_version", export["manifest_version"]], ["rubric_version", export["rubric_version"]],
                    ["exported_at", export["exported_at"]]):
            ws2.append(row)
        wb.save(path_json.with_suffix(".xlsx"))


# ============================================================================ the run
class Run:
    def __init__(self, provider, index, rubric, tasks, source, rater_name, out_dir, settings, transcript_lang="en",
                 image_max_side=1568, max_fix=2, fresh=False, formats=("json",), log=print):
        self.p, self.index, self.rubric, self.tasks, self.source = provider, index, rubric, tasks, source
        self.qids = [q["id"] for q in rubric["questions"]]
        self.rater = {"name": rater_name, "role": "llm", "years_experience": None}
        self.slug = slugify(rater_name)
        self.out_dir = Path(out_dir)
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.transcript_lang, self.image_max_side, self.max_fix = transcript_lang, image_max_side, max_fix
        self.formats, self.log = formats, log
        self.system = system_prompt(rubric)
        self.schema = answer_schema(rubric)
        self.lock = threading.Lock()
        self.task_ids = [t["id"] for t in tasks]
        self.ann = {cid: blank_record(self.qids) for cid in self.task_ids}
        prev_run = {}
        existing = None if fresh else find_existing(self.out_dir, self.slug)
        if existing:
            old = json.loads(existing.read_text(encoding="utf-8"))
            if old.get("manifest_version") == index["manifest_version"] and old.get("rubric_version") == rubric["rubric_version"]:
                for cid, rec in (old.get("annotations") or {}).items():
                    if cid in self.ann and is_done(rec, self.qids):
                        self.ann[cid] = {k: rec.get(k, self.ann[cid][k]) for k in self.ann[cid]}
                prev_run = old.get("run") or {}
                self.path = existing
                self.log(f"[resume] {existing.name}: {sum(is_done(r, self.qids) for r in self.ann.values())} cases already answered")
            else:
                existing = None
                self.log(f"[info] existing export is for another case list or rubric; starting a new file")
        if not existing:
            self.path = self.out_dir / f"ophth_audit_{self.slug}_{file_stamp()}.json"
            while self.path.exists():                       # two runs within the same minute
                time.sleep(1)
                self.path = self.out_dir / f"ophth_audit_{self.slug}_{file_stamp()}.json"
        self.run = {
            "client": "llm_annotate.py " + CLIENT_VERSION, "provider": provider.name,
            "model": getattr(provider, "model", None), **settings,
            "prompt_version": PROMPT_VERSION, "prompt_sha256": prompt_hash(rubric),
            "agent_spec_version": index.get("agent_spec_version"), "source": source.where,
            "transcript_lang": transcript_lang, "image_max_side": image_max_side,
            "started_at": prev_run.get("started_at") or iso_now(), "finished_at": None,
            "sessions": int(prev_run.get("sessions") or 0) + 1,
            "cases_requested": [], "cases_sent": list(prev_run.get("cases_sent") or []),
            "failures": {}, "invalid_replies_fixed": int(prev_run.get("invalid_replies_fixed") or 0),
            "skip_rule_fills": int(prev_run.get("skip_rule_fills") or 0),
            "served_models": sorted(set(prev_run.get("served_models") or [])),
            "usage": {"input_tokens": int((prev_run.get("usage") or {}).get("input_tokens") or 0),
                      "output_tokens": int((prev_run.get("usage") or {}).get("output_tokens") or 0)},
            "audio_sent": False, "note": AUDIO_NOTE,
        }

    def export(self) -> dict:
        return {"tool": TOOL, "tool_version": TOOL_VERSION, "rubric_version": self.rubric["rubric_version"],
                "manifest_version": self.index["manifest_version"], "exported_at": iso_now(), "rater": dict(self.rater),
                "annotations": {cid: dict(self.ann[cid]) for cid in self.task_ids}, "run": self.run}

    def save(self):
        with self.lock:
            ex = self.export()
            write_json_atomic(self.path, ex)
            if set(self.formats) - {"json"}:
                write_table_exports(self.path, ex, self.task_ids, self.qids, self.formats)

    def build_first_message(self, task):
        raw = self.source.read_bytes(task["image"])
        data, media, size = prepare_image(raw, self.image_max_side)
        msg = self.p.user_message(base64.standard_b64encode(data).decode("ascii"), media,
                                  case_text(task, self.transcript_lang))
        return msg, size

    def annotate_case(self, task):
        msg, _ = self.build_first_message(task)
        messages = [msg]
        t0 = time.monotonic()
        last_err, fixes_used = None, 0
        for attempt in range(self.max_fix + 1):
            reply = self.p.complete(self.system, messages, self.schema)
            with self.lock:
                self.run["usage"]["input_tokens"] += reply.input_tokens
                self.run["usage"]["output_tokens"] += reply.output_tokens
                if reply.model and reply.model not in self.run["served_models"]:
                    self.run["served_models"] = sorted(set(self.run["served_models"]) | {reply.model})
            try:
                if reply.stop == "max_tokens" or reply.stop == "length":
                    raise InvalidAnswer("the reply was cut off (token limit); answer with the JSON object only")
                answer, fixes = validate_answer(extract_json(reply.text), self.rubric)
            except InvalidAnswer as e:
                last_err = str(e)
                if attempt == self.max_fix:
                    break
                fixes_used += 1
                messages = messages + [reply.assistant_message, {"role": "user", "content": [{"type": "text", "text":
                           f"Your answer is invalid: {e}. Reply again with one corrected JSON object only."}]}]
                continue
            spent = round(time.monotonic() - t0, 1)
            rec = {**answer, "annotated_at": iso_now(), "time_spent_s": spent}
            with self.lock:
                self.ann[task["id"]] = rec
                self.run["invalid_replies_fixed"] += fixes_used
                self.run["skip_rule_fills"] += int(any("skip rule" in f for f in fixes))
                self.run["failures"].pop(task["id"], None)
            return rec
        raise InvalidAnswer(f"no valid answer after {self.max_fix + 1} attempts: {last_err}")

    def execute(self, case_ids, concurrency=4):
        todo = [t for t in self.tasks if t["id"] in set(case_ids) and not is_done(self.ann[t["id"]], self.qids)]
        self.run["cases_requested"] = list(case_ids)
        self.log(f"[run] {self.rater['name']}: {len(todo)} case(s) to annotate "
                 f"({len(case_ids) - len(todo)} already done) -> {self.path}")
        self.save()
        done = 0

        def work(task):
            with self.lock:
                if task["id"] not in self.run["cases_sent"]:
                    self.run["cases_sent"].append(task["id"])
            try:
                rec = self.annotate_case(task)
                return task["id"], rec, None
            except Exception as e:                                # noqa: BLE001 - recorded, run continues
                return task["id"], None, f"{type(e).__name__}: {e}"

        with cf.ThreadPoolExecutor(max_workers=max(1, concurrency)) as ex:
            for cid, rec, err in (f.result() for f in cf.as_completed([ex.submit(work, t) for t in todo])):
                done += 1
                if err:
                    with self.lock:
                        self.run["failures"][cid] = err[:500]
                    self.log(f"[fail] {cid}: {err[:200]}")
                else:
                    self.log(f"[{done}/{len(todo)}] {cid}: " + " ".join(rec[q] for q in self.qids) + f"  ({rec['time_spent_s']} s)")
                self.save()
        order = {c: k for k, c in enumerate(self.task_ids)}
        self.run["cases_sent"].sort(key=lambda c: order.get(c, 1 << 30))
        self.run["finished_at"] = iso_now()
        self.run["cases_done"] = sum(is_done(self.ann[c], self.qids) for c in self.task_ids)
        self.save()
        n_fail = len(self.run["failures"])
        self.log(f"[done] {self.path} ({self.run['cases_done']} answered, {n_fail} failed"
                 + ("; rerun the same command to retry them" if n_fail else "") + ")")
        return self.path


# ============================================================================ CLI
def estimate_tokens(system, text, size):
    img = 1600 if size is None else int(size[0] * size[1] / 750)
    return len(system) // 4, len(text) // 4, img


def make_provider(a):
    model = a.model or DEFAULT_MODELS[a.provider]
    if a.provider == "anthropic":
        return AnthropicProvider(model, max_tokens=a.max_tokens or 16000, effort=a.effort, temperature=a.temperature,
                                 use_schema=a.json_mode == "schema", max_retries=a.max_retries)
    return OpenAICompatProvider(model, base_url=a.base_url, max_tokens=a.max_tokens or 4096,
                                temperature=0.0 if a.temperature is None else a.temperature,
                                json_mode=a.json_mode, max_retries=a.max_retries)


class _DryProvider:
    """Message layout of the chosen provider without a client (for --dry-run)."""

    def __init__(self, provider, model):
        self.name, self.model = provider, model
        cls = AnthropicProvider if provider == "anthropic" else OpenAICompatProvider
        self.image_block, self.user_message = cls.image_block.__get__(self), cls.user_message.__get__(self)


def parse_args(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__.split("\n\n", 1)[1])
    src = ap.add_mutually_exclusive_group()
    src.add_argument("--site", default=None, help=f"published site (default {DEFAULT_SITE})")
    src.add_argument("--local", metavar="WEB_DIR", help="read the agent entry and media from a local web/ folder")
    ap.add_argument("--provider", choices=["anthropic", "openai"], default="anthropic",
                    help="anthropic, or openai = any OpenAI-compatible endpoint (vLLM, ...)")
    ap.add_argument("--model", help="model id (default: " + ", ".join(f"{k} {v}" for k, v in DEFAULT_MODELS.items()) + ")")
    ap.add_argument("--base-url", help="OpenAI-compatible base URL, e.g. http://localhost:8000/v1 (default OPENAI_BASE_URL "
                                       "or https://api.openai.com/v1)")
    sel = ap.add_mutually_exclusive_group()
    sel.add_argument("--cases", help="case ids: ranges, ids or prefixes, e.g. A001-A010,A015 or A")
    sel.add_argument("--limit", type=int, help="first N cases in presentation order")
    ap.add_argument("--concurrency", type=int, default=12, help="parallel requests per run; repeats run at the same time (default 12)")
    ap.add_argument("--out", default="llm_runs", help="output folder (default ./llm_runs)")
    ap.add_argument("--repeats", type=int, default=1, help="K independent runs -> K files, raters <provider>/<model>#1..K")
    ap.add_argument("--first-repeat", type=int, default=1, help="number of the first repeat (to add runs later; default 1)")
    ap.add_argument("--rater-name", help="override the rater name base (default <provider>/<model>)")
    ap.add_argument("--transcript-lang", choices=["en", "original"], default="en",
                    help="en: English translation (+ original when not English; default); original: original only")
    ap.add_argument("--effort", default="medium", help="anthropic: output_config.effort (low|medium|high|xhigh|max; '' = omit)")
    ap.add_argument("--temperature", type=float, help="sampling temperature (openai default 0; anthropic: not sent unless given "
                                                      "- recent Claude models reject it)")
    ap.add_argument("--max-tokens", type=int, help="max output tokens (default anthropic 16000, openai 4096)")
    ap.add_argument("--json-mode", choices=["schema", "object", "none"], default="schema",
                    help="schema: structured output with the answer schema (default); object: JSON mode; none: prompt only")
    ap.add_argument("--image-max-side", type=int, default=1568, help="downscale images whose long side is larger (default 1568)")
    ap.add_argument("--max-fix", type=int, default=2, help="retries with the validation error on an invalid answer (default 2)")
    ap.add_argument("--max-retries", type=int, default=8, help="HTTP retries with exponential backoff on 429/5xx (default 8)")
    ap.add_argument("--formats", default="json", help="json[,csv][,xlsx] (default json)")
    ap.add_argument("--fresh", action="store_true", help="start new files instead of resuming existing ones")
    ap.add_argument("--dry-run", action="store_true", help="print the first prompt and a token estimate; no API call")
    return ap.parse_args(argv)


def main(argv=None, provider_factory=None):
    a = parse_args(argv)
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
    source = Source(site=a.site, local=a.local)
    index, rubric, tasks = source.load()
    if index.get("rubric_version") != rubric.get("rubric_version"):
        print("[warn] index.json and rubric.json disagree on rubric_version", file=sys.stderr)
    ids = [t["id"] for t in tasks]
    case_ids = parse_case_range(a.cases, ids) if a.cases else ids[:a.limit] if a.limit else ids
    model = a.model or DEFAULT_MODELS[a.provider]
    base = a.rater_name or f"{a.provider}/{model}"
    names = [base] if a.repeats == 1 and a.first_repeat == 1 else \
        [f"{base}#{k}" for k in range(a.first_repeat, a.first_repeat + a.repeats)]
    slugs = [slugify(n) for n in names]
    if len(set(slugs)) != len(slugs):
        raise SystemExit("the rater names of the repeats give the same file slug (40-character limit): use a shorter --rater-name")
    formats = tuple(f.strip() for f in a.formats.split(",") if f.strip())

    if a.dry_run:
        dp = _DryProvider(a.provider, model)
        task = next(t for t in tasks if t["id"] == case_ids[0])
        raw = source.read_bytes(task["image"])
        data, media, size = prepare_image(raw, a.image_max_side)
        text = case_text(task, a.transcript_lang)
        sysp = system_prompt(rubric)
        s_tok, t_tok, i_tok = estimate_tokens(sysp, text, size)
        print("=" * 30 + " SYSTEM PROMPT " + "=" * 30)
        print(sysp)
        print("=" * 30 + f" USER MESSAGE ({task['id']}) " + "=" * 30)
        print(f"[image {media}, {len(data)} bytes, {size[0]}x{size[1]} px]" if size else f"[image {media}, {len(data)} bytes]")
        print(text)
        print("=" * 75)
        per_case = s_tok + t_tok + i_tok
        print(f"provider {a.provider}, model {model}, raters {names}")
        print(f"cases {len(case_ids)} x repeats {len(names)}; prompt {PROMPT_VERSION} sha256 {prompt_hash(rubric)}")
        print(f"estimated input tokens per case ~{per_case} (system ~{s_tok}, case text ~{t_tok}, image ~{i_tok}); "
              f"total ~{per_case * len(case_ids) * len(names):,} input tokens before caching and retries, plus the "
              f"output (JSON ~100 tokens per case, plus any thinking tokens).")
        print("No API call made.")
        return 0

    paths = []
    def one(name):
        prov = provider_factory(a) if provider_factory else make_provider(a)
        settings = {"temperature": getattr(prov, "temperature", None), "effort": getattr(prov, "effort", None),
                    "max_tokens": getattr(prov, "max_tokens", None), "json_mode": a.json_mode,
                    "base_url": getattr(prov, "base_url", None) if a.provider == "openai" else None,
                    "repeat": name.rsplit("#", 1)[1] if "#" in name else None}
        run = Run(prov, index, rubric, tasks, source, name, a.out, settings, transcript_lang=a.transcript_lang,
                  image_max_side=a.image_max_side, max_fix=a.max_fix, fresh=a.fresh, formats=formats)
        return run.execute(case_ids, a.concurrency)

    # repeats are independent runs: run them at the same time (each with its own --concurrency requests)
    import concurrent.futures as _cf
    with _cf.ThreadPoolExecutor(max_workers=max(1, len(names))) as ex:
        paths = [p for p in ex.map(one, names) if p]
    return 0 if paths else 1


if __name__ == "__main__":
    sys.exit(main())
