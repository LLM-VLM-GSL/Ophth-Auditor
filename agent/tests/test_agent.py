"""Tests of the agent entry (tools/build_agent_spec.py, web/agent/) and the LLM client (agent/llm_annotate.py).

    python -m pytest agent/tests -q

No network and no API call: the client runs against the local web/ folder with a mocked API client.
The analysis test runs only when the study team's analysis script is next to this repository
(../audit_tool/tools/analyze_audit.py, or the path in AUDIT_ANALYSIS); it is skipped otherwise.
"""
import json
import os
import random
import shutil
import subprocess
import sys
import types
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
WEB = REPO / "web"
sys.path.insert(0, str(REPO / "tools"))
sys.path.insert(0, str(REPO / "agent"))
import build_agent_spec as bas          # noqa: E402
import llm_annotate as la               # noqa: E402

QIDS = ["q1_ophthalmic", "q2_modality", "q3_crop", "q4_image_text", "q5_faithful", "q6_clinical", "q7_pii"]
SKIP = QIDS[1:6]


def load_rubric():
    return json.loads((WEB / "agent" / "rubric.json").read_text(encoding="utf-8"))


def manifest_ids():
    return [c["id"] for c in bas.parse_js_assignment(WEB / "data" / "manifest.js", "AUDIT_MANIFEST")["cases"]]


# ============================================================================ generator
def test_js_parser_accepts_js_object_syntax(tmp_path):
    p = tmp_path / "x.js"
    p.write_text("""/* header */ window.X = {
      // comment with "quotes" and a url https://a.b/c
      version: 'v1', "url": "https://site/x", 'it\\'s': "say \\"hi\\"",
      list: [1, 2, {a: true, b: null,},], /* inline */ n: -1.5e3,
    };""", encoding="utf-8")
    assert bas.parse_js_assignment(p, "X") == {"version": "v1", "url": "https://site/x", "it's": 'say "hi"',
                                               "list": [1, 2, {"a": True, "b": None}], "n": -1500.0}


def test_generated_files_are_up_to_date():
    assert bas.main(["--check"]) == 0


def test_round_trip_with_sources():
    g = bas.parse_js_assignment(WEB / "guidelines.js", "AUDIT_GUIDELINES")
    rubric = load_rubric()
    assert rubric["rubric_version"] == g["version"]
    assert [q["id"] for q in rubric["questions"]] == [q["id"] for q in g["questions"]] == QIDS
    for q, gq in zip(rubric["questions"], g["questions"]):
        assert [o["code"] for o in q["options"]] == [o["code"] for o in gq["options"]]
        assert q["skip_if"] == gq.get("skip_if") and q["title"] == gq["title"] and q["help"] == gq["help"]
    tasks = [json.loads(x) for x in (WEB / "agent" / "tasks.jsonl").read_text(encoding="utf-8").splitlines()]
    assert [t["id"] for t in tasks] == manifest_ids()
    for t in tasks:
        assert (WEB / t["image"]).exists() and t["image_url"] == bas.DEFAULT_SITE + t["image"]
        assert t["transcript_en"] is not None and t["lang"]
    idx = json.loads((WEB / "agent" / "index.json").read_text(encoding="utf-8"))
    assert idx["n_cases"] == len(tasks) and idx["rubric_version"] == g["version"]
    for name in idx["links"].values():
        assert (WEB / "agent" / name).exists() or name == "../index.html"
    import hashlib
    for name, h in idx["sha256"].items():
        assert hashlib.sha256((WEB / "agent" / name).read_bytes().replace(b"\r\n", b"\n")).hexdigest() == h


def test_schema_is_valid_and_encodes_skip_logic():
    jsonschema = pytest.importorskip("jsonschema")
    s = json.loads((WEB / "agent" / "output_schema.json").read_text(encoding="utf-8"))
    jsonschema.Draft202012Validator.check_schema(s)
    v = jsonschema.Draft202012Validator({"$ref": "#/$defs/case_answer", "$defs": s["$defs"]})
    ok = {"q1_ophthalmic": "no", **{q: "na" for q in SKIP}, "q7_pii": "no", "note": ""}
    assert v.is_valid(ok)
    assert not v.is_valid(dict(ok, q2_modality="oct"))
    assert not v.is_valid(dict(ok, q1_ophthalmic="yes"))
    assert not v.is_valid(dict(ok, q7_pii="yes"))                       # note required
    assert v.is_valid(dict(ok, q7_pii="yes", note="name top left"))


def test_check_detects_stale_files(tmp_path):
    web = tmp_path / "web"
    (web / "data").mkdir(parents=True)
    shutil.copy(WEB / "guidelines.js", web / "guidelines.js")
    shutil.copy(WEB / "data" / "manifest.js", web / "data" / "manifest.js")
    assert bas.main(["--web", str(web), "--check"]) == 1                # nothing generated yet
    assert bas.main(["--web", str(web)]) == 0
    assert bas.main(["--web", str(web), "--check"]) == 0
    p = web / "guidelines.js"
    p.write_text(p.read_text(encoding="utf-8").replace('"rubric-v1"', '"rubric-v9"'), encoding="utf-8")
    assert bas.main(["--web", str(web), "--check"]) == 1
    assert bas.main(["--web", str(web)]) == 0
    assert json.loads((web / "agent" / "index.json").read_text(encoding="utf-8"))["rubric_version"] == "rubric-v9"


def test_no_dataset_name_in_agent_files():
    import re
    pat = re.compile(r"ophth[-_ ]?500[-_ ]?k", re.I)
    for p in list((WEB / "agent").iterdir()) + list((REPO / "agent").rglob("*.py")) + list((REPO / "agent").rglob("*.md")) \
            + [REPO / "tools" / "build_agent_spec.py"]:
        assert not pat.search(p.read_text(encoding="utf-8")), p


# ============================================================================ validation helpers
def test_validate_answer_rules():
    r = load_rubric()
    base = {"q1_ophthalmic": "yes", "q2_modality": "oct", "q3_crop": "good", "q4_image_text": "full",
            "q5_faithful": "partial", "q6_clinical": "correct", "q7_pii": "no", "note": "ok"}
    ans, fixes = la.validate_answer(dict(base, q2_modality="OCT "), r)
    assert ans["q2_modality"] == "oct" and fixes == []
    ans, fixes = la.validate_answer(dict(base, q1_ophthalmic="no"), r)          # skip rule filled in, as the page does
    assert all(ans[q] == "na" for q in SKIP) and len(fixes) == 5
    with pytest.raises(la.InvalidAnswer, match="only allowed"):
        la.validate_answer(dict(base, q3_crop="na"), r)
    with pytest.raises(la.InvalidAnswer, match="requires a note"):
        la.validate_answer(dict(base, q7_pii="yes", note=""), r)
    with pytest.raises(la.InvalidAnswer, match="missing key q6_clinical"):
        la.validate_answer({k: v for k, v in base.items() if k != "q6_clinical"}, r)
    with pytest.raises(la.InvalidAnswer, match="not one of"):
        la.validate_answer(dict(base, q4_image_text="mostly"), r)
    assert la.extract_json('Sure:\n```json\n{"a": 1}\n```') == {"a": 1}
    assert la.extract_json('text {"a": 2} text') == {"a": 2}
    with pytest.raises(la.InvalidAnswer):
        la.extract_json("no json here")


def test_case_range_and_slug():
    ids = manifest_ids()
    assert la.parse_case_range("A001-A003,A010", ids) == ["A001", "A002", "A003", "A010"]
    assert la.parse_case_range("A00", ids) == ids[:9]
    with pytest.raises(ValueError):
        la.parse_case_range("Z999", ids)
    assert la.slugify("anthropic/claude-opus-5-5#2") == "anthropic-claude-opus-5-5-2"
    assert la.slugify("Dr. Jane O'Neil") == "dr-jane-o-neil" and la.slugify("") == "rater"


def test_post_with_backoff_retries_429_and_5xx():
    class R:
        def __init__(self, code, body=None, headers=None):
            self.status_code, self._b, self.headers, self.text = code, body, headers or {}, "err"

        def json(self):
            return self._b
    seq = [R(429, headers={"retry-after": "3"}), R(503), R(200, {"ok": 1})]
    waits = []
    assert la.post_with_backoff(lambda: seq.pop(0), max_retries=5, sleep=waits.append) == {"ok": 1}
    assert waits[0] == 3.0 and len(waits) == 2
    with pytest.raises(RuntimeError, match="HTTP 400"):
        la.post_with_backoff(lambda: R(400), sleep=waits.append)
    with pytest.raises(la.TransientHTTPError):
        la.post_with_backoff(lambda: R(500), max_retries=2, sleep=lambda s: None)


# ============================================================================ mocked API
def scripted_answer(cid, attempt):
    """Deterministic answers: A004 says q1=no but fills q2..q6 (skip rule fills na); A006 first replies with an invalid
    'na' and is fixed on the retry; A007 reports PII; A009 never gives a valid answer."""
    k = int(cid[1:])
    a = {"q1_ophthalmic": "yes", "q2_modality": ["oct", "cfp", "angio"][k % 3], "q3_crop": "good",
         "q4_image_text": ["full", "partial", "none"][k % 3], "q5_faithful": "partial", "q6_clinical": "correct",
         "q7_pii": "no", "note": f"case {cid}"}
    if cid == "A004":
        a["q1_ophthalmic"] = "no"
    if cid == "A006" and attempt == 0:
        a["q3_crop"] = "na"
    if cid == "A007":
        a.update(q7_pii="yes", note="patient name in the top left corner")
    if cid == "A009":
        return "I cannot tell."
    return "```json\n" + json.dumps(a) + "\n```"


class FakeMessages:
    def __init__(self, script, log):
        self.script, self.log = script, log

    def create(self, **kw):
        self.log.append(kw)
        cid = self._cid(kw)
        attempt = (len(kw["messages"]) - 1) // 2
        text = self.script(cid, attempt)
        if text == "REFUSE":
            return types.SimpleNamespace(stop_reason="refusal", content=[], model="fake", usage=None)
        return types.SimpleNamespace(stop_reason="end_turn", model="claude-test-served",
                                     content=[types.SimpleNamespace(type="thinking", thinking=""),
                                              types.SimpleNamespace(type="text", text=text)],
                                     usage=types.SimpleNamespace(input_tokens=1000, output_tokens=50))

    @staticmethod
    def _cid(kw):
        img = kw["messages"][0]["content"][0]["source"]["data"]
        return FakeMessages.by_image[img]


def make_factory(script, log):
    tasks = [json.loads(x) for x in (WEB / "agent" / "tasks.jsonl").read_text(encoding="utf-8").splitlines()]
    import base64
    by_image = {}
    for t in tasks:
        data, _, _ = la.prepare_image((WEB / t["image"]).read_bytes(), 1568)
        by_image[base64.standard_b64encode(data).decode("ascii")] = t["id"]
    FakeMessages.by_image = by_image

    def factory(a):
        client = types.SimpleNamespace(messages=FakeMessages(script, log))
        return la.AnthropicProvider(a.model, effort=a.effort, use_schema=a.json_mode == "schema", client=client)
    return factory


def run_client(tmp_path, extra=(), script=scripted_answer, log=None):
    log = [] if log is None else log
    argv = ["--local", str(WEB), "--provider", "anthropic", "--model", "claude-test", "--out", str(tmp_path / "out"),
            "--concurrency", "3", *extra]
    assert la.main(argv, provider_factory=make_factory(script, log)) == 0
    return log


def only_export(tmp_path, slug="anthropic-claude-test"):
    files = sorted((tmp_path / "out").glob(f"ophth_audit_{slug}_*.json"))
    assert len(files) == 1, files
    return files[0], json.loads(files[0].read_text(encoding="utf-8"))


def test_client_writes_a_valid_export(tmp_path):
    log = run_client(tmp_path, ["--cases", "A001-A010", "--formats", "json,csv,xlsx"])
    path, d = only_export(tmp_path)
    assert list(d)[:7] == bas.EXPORT_KEYS and list(d)[7:] == ["run"]
    assert d["tool"] == "ophth-audit" and d["rubric_version"] == load_rubric()["rubric_version"]
    assert d["rater"] == {"name": "anthropic/claude-test", "role": "llm", "years_experience": None}
    assert list(d["annotations"]) == manifest_ids()                    # every case, in order (blank when not run)
    ann = d["annotations"]
    assert all(list(r) == QIDS + ["note", "annotated_at", "time_spent_s"] for r in ann.values())
    assert ann["A004"]["q1_ophthalmic"] == "no" and all(ann["A004"][q] == "na" for q in SKIP)
    assert ann["A006"]["q3_crop"] == "good"
    assert ann["A007"]["q7_pii"] == "yes" and "name" in ann["A007"]["note"]
    assert ann["A009"]["q1_ophthalmic"] == "" and ann["A011"]["q1_ophthalmic"] == ""
    assert ann["A001"]["annotated_at"] and ann["A001"]["time_spent_s"] >= 0
    run = d["run"]
    assert set(run["failures"]) == {"A009"} and "no valid answer after 3 attempts" in run["failures"]["A009"]
    assert run["cases_sent"] == [f"A{k:03d}" for k in range(1, 11)] and run["cases_done"] == 9
    assert run["invalid_replies_fixed"] == 1 and run["skip_rule_fills"] == 1 and run["audio_sent"] is False
    assert "Audio" in run["note"] and run["provider"] == "anthropic" and run["model"] == "claude-test"
    assert run["served_models"] == ["claude-test-served"] and run["prompt_sha256"]
    assert "api_key" not in json.dumps(d).lower() and "sk-" not in json.dumps(d)
    # API calls: 10 cases + 1 retry for A006 + 2 retries for A009
    assert len(log) == 13
    kw = log[0]
    assert kw["model"] == "claude-test" and kw["output_config"]["effort"] == "medium"
    assert kw["output_config"]["format"]["type"] == "json_schema"
    assert kw["system"][0]["cache_control"] == {"type": "ephemeral"} and "q7_pii" in kw["system"][0]["text"]
    img, txt = kw["messages"][0]["content"]
    assert img["type"] == "image" and img["source"]["type"] == "base64" and img["source"]["media_type"] == "image/jpeg"
    assert "DESCRIPTION" in txt["text"] and "temperature" not in kw
    retry = [k for k in log if len(k["messages"]) == 3]
    assert any("invalid" in k["messages"][2]["content"][0]["text"] for k in retry)
    assert retry[0]["messages"][1]["role"] == "assistant"               # the model's own reply is sent back unchanged
    # JSON Schema of the export
    jsonschema = pytest.importorskip("jsonschema")
    s = json.loads((WEB / "agent" / "output_schema.json").read_text(encoding="utf-8"))
    jsonschema.Draft202012Validator(s).validate(d)
    # CSV / XLSX next to it
    assert path.with_suffix(".csv").exists() and path.with_suffix(".xlsx").exists()


def test_check_exports_accepts_the_export(tmp_path):
    pytest.importorskip("pandas")
    pytest.importorskip("openpyxl")
    run_client(tmp_path, ["--cases", "A001-A005", "--formats", "json,csv,xlsx"])
    r = subprocess.run([sys.executable, str(REPO / "tests" / "check_exports.py"), str(tmp_path / "out"),
                        "--manifest", str(WEB / "data" / "manifest.js")], capture_output=True, text=True, encoding="utf-8")
    fails = [x for x in r.stdout.splitlines() if x.startswith("FAIL ")]
    # Until tests/check_exports.py knows automated raters, it reports exactly these two checks (role "llm" and the
    # extra "run" key); every other check of the contract must pass.
    allowed = ("FAIL JSON top-level keys (in order)", "FAIL JSON rater role is empty or a known role")
    assert all(x.startswith(allowed) for x in fails), r.stdout
    assert "ok   JSON every annotation has the expected fields, codes and skip logic" in r.stdout


def test_resume_skips_done_cases(tmp_path):
    run_client(tmp_path, ["--cases", "A001-A010"])
    path1, d1 = only_export(tmp_path)

    def fixed(cid, attempt):
        return scripted_answer("A001" if cid == "A009" else cid, attempt)
    log = run_client(tmp_path, ["--cases", "A001-A010"], script=fixed)
    path2, d2 = only_export(tmp_path)
    assert path2 == path1 and len(log) == 1                            # only A009 sent again
    assert d2["run"]["failures"] == {} and d2["run"]["cases_done"] == 10 and d2["run"]["sessions"] == 2
    assert d2["annotations"]["A002"] == d1["annotations"]["A002"]
    assert d2["run"]["usage"]["input_tokens"] == d1["run"]["usage"]["input_tokens"] + 1000


def test_repeats_write_separate_files(tmp_path):
    run_client(tmp_path, ["--cases", "A001-A002", "--repeats", "2"])
    for k in (1, 2):
        _, d = only_export(tmp_path, f"anthropic-claude-test-{k}")
        assert d["rater"]["name"] == f"anthropic/claude-test#{k}" and d["run"]["repeat"] == str(k)


def test_refusal_is_recorded_as_failure(tmp_path):
    run_client(tmp_path, ["--cases", "A001-A002"], script=lambda c, a: "REFUSE" if c == "A002" else scripted_answer(c, a))
    _, d = only_export(tmp_path)
    assert "Refusal" in d["run"]["failures"]["A002"] and d["annotations"]["A001"]["q1_ophthalmic"] == "yes"


def test_dry_run_makes_no_call(tmp_path, capsys):
    def boom(a):
        raise AssertionError("no provider in a dry run")
    assert la.main(["--local", str(WEB), "--dry-run", "--limit", "3", "--repeats", "2"], provider_factory=boom) == 0
    out = capsys.readouterr().out
    assert "SYSTEM PROMPT" in out and "estimated input tokens" in out and "No API call made." in out
    assert not list(tmp_path.iterdir())


def test_openai_compatible_request_shape():
    sent = []

    def post(payload):
        sent.append(payload)
        return {"model": "qwen", "choices": [{"finish_reason": "stop", "message": {"content": '{"x": 1}'}}],
                "usage": {"prompt_tokens": 7, "completion_tokens": 3}}
    p = la.OpenAICompatProvider("qwen", base_url="http://localhost:8000/v1", post=post)
    msg = p.user_message("AAAA", "image/jpeg", "hello")
    r = p.complete("SYS", [msg], {"type": "object"})
    assert r.text == '{"x": 1}' and r.input_tokens == 7
    pl = sent[0]
    assert pl["messages"][0] == {"role": "system", "content": "SYS"} and pl["temperature"] == 0.0
    assert pl["messages"][1]["content"][0]["image_url"]["url"].startswith("data:image/jpeg;base64,")
    assert pl["response_format"]["type"] == "json_schema"


# ============================================================================ analysis (local, optional)
def _analysis_script():
    p = Path(os.environ.get("AUDIT_ANALYSIS") or REPO.parent / "audit_tool" / "tools" / "analyze_audit.py")
    return p if p.exists() else None


@pytest.mark.skipif(_analysis_script() is None, reason="analysis script not available next to the repository")
def test_analysis_keeps_llm_separate(tmp_path):
    pytest.importorskip("pandas")
    script = _analysis_script()
    sys.path.insert(0, str(script.parent))
    import analyze_audit as aa
    run_client(tmp_path, ["--cases", "A001-A030"])
    res = tmp_path / "out"
    rng = random.Random(3)
    ids = manifest_ids()
    rubric = load_rubric()
    codes = {q["id"]: [o["code"] for o in q["options"]] for q in rubric["questions"]}
    for name in ("Human One", "Human Two", "Human Three"):
        ann = {}
        for cid in ids[:30]:
            a = {q: rng.choice(codes[q]) for q in QIDS}
            if a["q1_ophthalmic"] == "no":
                a.update({q: "na" for q in SKIP})
            ann[cid] = {**a, "note": "", "annotated_at": "2026-11-18T10:00:00-07:00", "time_spent_s": 30.0}
        d = {"tool": "ophth-audit", "tool_version": "1.0", "rubric_version": rubric["rubric_version"],
             "manifest_version": "x", "exported_at": "2026-11-18T11:00:00-07:00",
             "rater": {"name": name, "role": "ophthalmologist", "years_experience": 5}, "annotations": ann}
        (res / f"ophth_audit_{la.slugify(name)}_20261118-1100.json").write_text(json.dumps(d), encoding="utf-8")
    out = tmp_path / "analysis"
    rc = aa.main(["--results", str(res), "--manifest", str(WEB / "data" / "manifest.js"), "--key", "", "--guidelines", "",
                  "--out", str(out), "--n-boot", "20"])
    assert rc == 0
    m = json.loads((out / "metrics.json").read_text(encoding="utf-8"))
    assert len(m["raters"]) == 3 and all(r["role"] == "ophthalmologist" for r in m["raters"])
    assert [r["name"] for r in m["llm"]["raters"]] == ["anthropic/claude-test"]
    assert m["llm"]["raters"][0]["cases_completed"] == 29                # A009 failed
    assert "## LLM raters" in (out / "summary.md").read_text(encoding="utf-8")
