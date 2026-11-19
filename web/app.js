/* Ophthalmic image–description audit: the rater page. Export formats and the rater-slug rule: the README.
 *
 * One code base, opened in one of three ways:
 * - Offline (file://, double-click index.html in Chrome/Edge): the rubric (guidelines.js) and the case list
 *   (<data>/manifest.js) are loaded with <script> tags, never with fetch(), so that file:// works.
 * - Served over http(s) (a static site such as GitHub Pages, a local test server, or serve.py of the offline
 *   package): the page first fetches <data>/meta.json. When it describes encrypted data (format
 *   "ophth-audit-enc-v1", written by tools/encrypt_data.py, which documents the format), the page asks for the
 *   access code, derives the key with PBKDF2-SHA256, decrypts <data>/manifest.bin, and decrypts every image and
 *   audio clip on demand (AES-256-GCM, Web Crypto) into blob: URLs. Otherwise it loads <data>/manifest.js.
 *   An address ending in #key=<access code> opens the encrypted data directly; the fragment is then removed.
 * - The data folder is ?data=<folder> (default "data"), relative to index.html.
 * - config.js (optional, loaded first): window.AUDIT_CONFIG = {server: "auto" | false}. "auto" (the default): over
 *   http(s), when api/ping answers (serve.py), answers are also PUT, debounced, to api/annotations/<rater-slug>;
 *   false: the page never calls api/* (static hosting).
 * - Answers are autosaved in localStorage under "ophth-audit:ann:<manifest_version>:<rater-slug>" and leave the
 *   browser as files the reviewer downloads (Download annotations: JSON, CSV or Excel).
 * - With a relay (config.js relay: "<absolute URL>", or ?relay=<url>; relay/relay.py in the repository), as in Retify:
 *   the reviewer finds or creates a session by name on the relay, every annotation is sent to it as it is made
 *   (an outbox in localStorage, retried with back-off and when the browser is online again), the relay's and the
 *   browser's annotations are merged on entering (the later annotated_at wins), and a strip under the top bar shows
 *   everyone's progress. The session is "ophth-audit:session"; its annotations "ophth-audit:relay:<mv>:<session id>",
 *   its outbox "ophth-audit:outbox:<mv>:<session id>". Download annotations works the same in both modes.
 * Reviewer-facing behaviour follows the lab's Retify page (its AGENTS.md, section 5): the eye at the top left is the
 * bright / dark switch, the task is the headline, How to stands out, "annotations" and "download" in plain words,
 * a short welcome for someone new, the image as a small canvas, the queue below the case on narrow screens.
 * - AI pre-filled answers (optional, plaintext data only): <data>/ai_prefill.js (window.AUDIT_AI, written by
 *   tools/build_ai_prefill.py), loaded with a <script> tag after the case list. Every question the reviewer has not
 *   answered shows the AI's answer, marked as the AI's; the reviewer changes answers as usual, and Enter / Confirm
 *   keeps the AI's answers that are left. A case is complete only once every answer is the reviewer's. Each case's
 *   annotation keeps the AI's answers it was shown ("ai": {question: code}, "ai_model"), so that the analysis can tell
 *   a kept AI answer (answer == ai) from a changed one. Without the file the page behaves as before.
 * - Nothing is requested from other origins: no CDN, no fonts, no analytics.
 * Interaction patterns, the image viewer and the CSV reader are adapted from an earlier MIT-licensed annotation
 * tool by the same authors.
 */
"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  const G = window.AUDIT_GUIDELINES;
  const CFG = window.AUDIT_CONFIG && typeof window.AUDIT_CONFIG === "object" ? window.AUDIT_CONFIG : {};
  const SERVER_API = CFG.server !== false;         // config.js server: false -> never call api/* (static site)
  // the lab's relay: an absolute http(s) URL, from ?relay= or config.js; empty: annotations stay in this browser
  const RELAY = (() => {
    const u = String(new URLSearchParams(location.search).get("relay") || CFG.relay || "").trim().replace(/\/+$/, "");
    return /^https?:\/\/[^/]/i.test(u) ? u : "";
  })();
  const TOOL = "ophth-audit", TOOL_VERSION = "1.0";
  // Question ids and export columns, in SPEC order (guidelines.js is checked against this at start).
  const QIDS = ["q1_ophthalmic", "q2_modality", "q3_crop", "q4_image_text", "q5_faithful", "q6_clinical", "q7_pii"];
  const COLS = ["no", "case_id", ...QIDS, "note", "annotated_at", "time_spent_s"];
  // with AI pre-filled answers: the AI's answer per question and the model, after the columns above
  const AI_COLS = [...QIDS.map((q) => "ai_" + q), "ai_model"];
  const LS = "ophth-audit:";              // prefix of every localStorage key of this page
  const IDLE_MS = 3 * 60 * 1000;          // no key, mouse or wheel for this long (and no audio playing): the clock stops
  const NOTE_MAX = 2000;
  const STATE_TEXT = { todo: "To do", partial: "Started", done: "Done", flag: "Done · flagged" };

  // ---------------------------------------------------------------- small helpers
  // Rater slug (SPEC; identical in serve.py and tools/analyze_audit.py): lowercase the full name, replace every run
  // of characters outside [a-z0-9] with a single "-", strip leading/trailing "-", truncate to 40 chars; empty -> "rater".
  function slugify(name) {
    const s = String(name == null ? "" : name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    return s || "rater";
  }
  const pad = (n) => String(n).padStart(2, "0");
  // ISO-8601 in local time with the UTC offset, e.g. 2026-11-18T09:41:07-07:00 (exact for parsers, readable in Excel)
  function isoNow(d) {
    d = d || new Date();
    const o = -d.getTimezoneOffset(), a = Math.abs(o);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" +
      pad(d.getMinutes()) + ":" + pad(d.getSeconds()) + (o >= 0 ? "+" : "-") + pad(Math.floor(a / 60)) + ":" + pad(a % 60);
  }
  const fileStamp = (d) => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" + pad(d.getHours()) + pad(d.getMinutes());
  const tms = (s) => { const t = Date.parse(s || ""); return Number.isFinite(t) ? t : 0; };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsJson(k) { const s = lsGet(k); if (!s) return null; try { return JSON.parse(s); } catch (e) { return null; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } }
  function lsKeys() {
    try { const out = []; for (let i = 0; i < localStorage.length; i++) out.push(localStorage.key(i)); return out; } catch (e) { return []; }
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function rich(node, text) {                       // **two stars** make bold; everything else stays plain text
    node.replaceChildren();
    String(text || "").split("**").forEach((part, k) => { if (part) node.append(k % 2 ? el("b", null, part) : document.createTextNode(part)); });
    return node;
  }
  const plain = (t) => String(t || "").replace(/\*\*/g, "");
  const fmtClock = (s) => { s = Math.max(0, Math.floor(Number(s) || 0)); return Math.floor(s / 60) + ":" + pad(s % 60); };
  const fmtLeft = (s) => { const m = Math.max(1, Math.round(s / 60)); return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + pad(m % 60) + " min"; };
  function fmtWhen(iso) {
    const t = tms(iso);
    if (!t) return "";
    const d = new Date(t);
    return d.toLocaleDateString([], { day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const median = (xs) => {
    if (!xs.length) return 0;
    const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  let langNames = null;
  try { langNames = new Intl.DisplayNames(["en"], { type: "language" }); } catch (e) { /* language codes then */ }
  function langName(code) { try { return (langNames && langNames.of(code)) || code; } catch (e) { return code; } }
  let toastTimer = 0;
  function toast(msg, err, ms) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.toggle("err", !!err);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), ms || (err ? 6000 : 2600));
  }
  function banner(msg) { const b = $("banner"); b.textContent = msg; b.hidden = !msg; }

  // ---------------------------------------------------------------- the data folder and media paths
  const params = new URLSearchParams(location.search);
  const DATA = (params.get("data") || "data").trim().replace(/\\/g, "/").replace(/\/+$/, "") || "data";
  const DATA_OK = !/^[a-z][a-z0-9+.-]*:/i.test(DATA) && !DATA.startsWith("//");   // a relative (or /rooted) folder only
  // Media paths in the manifest (image, audio) are relative to index.html and written for the default data folder,
  // e.g. "data/images/A001.jpg" (SPEC). The rule used to resolve them:
  //  1. a path with a scheme (blob:, data:, ...) or a leading "/" is used as it is;
  //  2. a path that starts with "data/" is re-rooted on the folder the manifest was loaded from (?data=<folder>):
  //     with ?data=../tests/fixture/data, "data/images/T001.jpg" becomes "../tests/fixture/data/images/T001.jpg";
  //     with the default folder nothing changes;
  //  3. any other path is relative to index.html, as SPEC says.
  function mediaUrl(p) {
    if (!p || typeof p !== "string") return "";
    p = p.trim().replace(/\\/g, "/").replace(/^\.\//, "");
    if (!p) return "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith("/")) return p;
    if (p.startsWith("data/")) return DATA + "/" + p.slice(5);
    return p;
  }

  // ---------------------------------------------------------------- encrypted data (format ophth-audit-enc-v1)
  // tools/encrypt_data.py documents the format. In short: <data>/meta.json (plaintext) names the key derivation
  // (PBKDF2, SHA-256, iterations, base64 salt) and the encrypted manifest. Every encrypted file is a 12-byte random IV
  // followed by the AES-256-GCM ciphertext and its 128-bit tag; the additional authenticated data is the UTF-8 path of
  // the file relative to the data folder ("manifest.bin", "images/A001.bin"). The key is PBKDF2 over the normalized
  // access code: lowercase, every character outside [a-z0-9] dropped.
  const ENC_FORMAT = "ophth-audit-enc-v1";
  const WRONG_CODE = "This code does not open the data. Check it and try again.";
  const enc = { on: false, meta: null, key: null, v: "" };
  const utf8 = (s) => new TextEncoder().encode(s);
  const normCode = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
  function b64enc(u8) { let s = ""; for (let k = 0; k < u8.length; k++) s += String.fromCharCode(u8[k]); return btoa(s); }
  function b64dec(s) { const b = atob(String(s)), u = new Uint8Array(b.length); for (let k = 0; k < b.length; k++) u[k] = b.charCodeAt(k); return u; }
  const relOk = (p) => typeof p === "string" && /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/.test(p) && !p.split("/").some((x) => x === "." || x === "..");
  // a media path of the manifest ("data/images/A001.bin") -> its path relative to the data folder ("images/A001.bin"),
  // which is both what is fetched and the file's additional authenticated data
  function relOf(p) { p = String(p || "").trim().replace(/\\/g, "/").replace(/^\.\//, ""); return p.startsWith("data/") ? p.slice(5) : p; }
  function metaProblem(m) {
    const k = m.kdf;
    if (!k || k.name !== "PBKDF2" || k.hash !== "SHA-256") return "the key derivation is not PBKDF2 with SHA-256";
    if (!Number.isInteger(k.iterations) || k.iterations < 1000 || k.iterations > 50000000) return "the iteration count is not valid";
    let salt = null;
    try { salt = b64dec(k.salt); } catch (e) { /* not base64: reported below */ }
    if (!salt || salt.length < 8) return "the salt is not valid";
    if (m.cipher !== "AES-256-GCM") return "the cipher is not AES-256-GCM";
    if (!relOk(m.manifest)) return "the path of the encrypted case list is not valid";
    if (typeof m.dataset !== "string" || !m.dataset) return "the dataset version is missing";
    return "";
  }
  async function deriveRaw(code) {                  // access code -> 32 key bytes, PBKDF2-HMAC-SHA256 (meta.json)
    const k = enc.meta.kdf;
    const base = await crypto.subtle.importKey("raw", utf8(normCode(code)), "PBKDF2", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64dec(k.salt), iterations: k.iterations }, base, 256));
  }
  const aesKey = (raw) => crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
  class WrongKey extends Error {}
  async function openBuf(key, buf, rel) {           // IV (12 bytes) | ciphertext | tag (16 bytes), AAD = rel
    if (!buf || buf.byteLength < 28) throw new Error("the file " + rel + " is too short");
    try {
      return await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(buf, 0, 12), additionalData: utf8(rel), tagLength: 128 },
        key, new Uint8Array(buf, 12));
    } catch (e) { throw new WrongKey("the file " + rel + " does not match the access code (damaged or replaced)"); }
  }
  async function getBin(rel, fresh) {               // fresh: revalidate (the case list); media: ?v=<build> skips stale copies
    const url = DATA + "/" + rel + (fresh ? "" : "?v=" + encodeURIComponent(enc.v));
    let last = null;
    for (let attempt = 0; attempt < 4; attempt++) {  // GitHub Pages can answer 5xx or 429 for a moment: retry quietly
      if (attempt) await new Promise((res) => setTimeout(res, 400 * attempt * attempt));
      let r;
      try { r = await fetch(url, { cache: fresh ? "no-cache" : "default" }); }
      catch (e) { last = new Error("no connection to the site"); continue; }
      if (r.ok) return r.arrayBuffer();
      last = new Error("HTTP " + r.status + " for " + rel);
      if (r.status < 500 && r.status !== 429) break;   // 404 and other client errors: retrying would not help
    }
    throw last;
  }
  // Remembered keys: the derived key (raw, base64) in localStorage under "ophth-audit:key:<dataset>:<salt>", so that
  // neither the code nor the slow key derivation is needed again on this computer. A data folder rebuilt with the
  // same salt (encrypt_data.py --keep-salt, e.g. for a new dataset version) still finds the key.
  const KEYS = LS + "key:";
  const keyName = () => KEYS + enc.meta.dataset + ":" + enc.meta.kdf.salt;
  function keyNames(sameSalt) {                     // this dataset's own entry first
    const salt = enc.meta ? ":" + enc.meta.kdf.salt : "\u0000", own = enc.meta ? keyName() : "";
    return lsKeys().filter((k) => k && k.startsWith(KEYS) && (!sameSalt || k.endsWith(salt))).sort((a, b) => (b === own) - (a === own));
  }
  function forgetKeys(all) { for (const k of keyNames(!all)) lsDel(k); }
  function rememberKey(raw) { forgetKeys(false); lsSet(keyName(), b64enc(raw)); }

  // Decrypted media: blob: URLs, made on demand and kept for the cases around the current one (keepBlobs).
  const blobs = new Map();                          // data-relative path -> {p: Promise<url>, url, dead}
  function blobFor(c, kind) {
    const rel = relOf(c[kind]);
    let e = blobs.get(rel);
    if (!e) {
      const type = (typeof c[kind + "_type"] === "string" && c[kind + "_type"]) || (kind === "image" ? "image/jpeg" : "audio/mpeg");
      const x = { url: "", dead: false };
      x.p = getBin(rel).then((buf) => openBuf(enc.key, buf, rel)).then((plain) => {
        const url = URL.createObjectURL(new Blob([plain], { type }));
        if (x.dead) { URL.revokeObjectURL(url); throw new Error("not needed any more"); }
        x.url = url;
        return url;
      });
      x.p.catch(() => { if (blobs.get(rel) === x) blobs.delete(rel); });   // a failure is not kept: tried again next time
      blobs.set(rel, e = x);
    }
    return e.p;
  }
  function readyBlob(c, kind) { const e = c[kind] ? blobs.get(relOf(c[kind])) : null; return e && e.url ? e.url : ""; }
  function keepBlobs() {                            // the current case, 2 before and 3 after stay; the rest is freed
    const keep = new Set();
    for (let k = Math.max(0, cur - 2); k <= Math.min(N - 1, cur + 3); k++) for (const kind of ["image", "audio"]) if (cases[k][kind]) keep.add(relOf(cases[k][kind]));
    for (const [rel, e] of blobs) if (!keep.has(rel)) { blobs.delete(rel); e.dead = true; if (e.url) URL.revokeObjectURL(e.url); }
  }

  // ---------------------------------------------------------------- the rubric
  const OPT = {};                                   // question id -> {code: option}
  function skipped(q, a) {                          // skip logic: q2–q6 when q1_ophthalmic is "no"
    if (!q.skip_if || !a) return false;
    return Object.keys(q.skip_if).some((qid) => (q.skip_if[qid] || []).includes(a[qid]));
  }
  function applySkip(a) {                           // skipped questions are "na"; once not skipped, a left-over "na" is cleared
    for (const q of G.questions) {
      if (!q.skip_if) continue;
      if (skipped(q, a)) a[q.id] = "na";
      else if (a[q.id] === "na") a[q.id] = "";
    }
  }
  const isComplete = (a) => !!a && G.questions.every((q) => !q.required || skipped(q, a) || !!a[q.id]);
  const pick = (q, a) => (a ? OPT[q.id][a[q.id]] : null);
  const hasIssue = (a) => G.questions.some((q) => { const o = pick(q, a); return !!(o && o.issue); });
  const needsNote = (a) => !String(a.note || "").trim() && G.questions.some((q) => { const o = pick(q, a); return !!(o && o.ask_note); });
  const hasContent = (a) => !!a && (QIDS.some((q) => !!a[q]) || !!String(a.note || "").trim());
  function blank() {
    const a = {};
    for (const q of QIDS) a[q] = "";
    a.note = ""; a.annotated_at = ""; a.time_spent_s = 0;
    return a;
  }
  // One case's annotation as read from storage or a file: known codes only ("na" only where skip logic allows it).
  function clean(raw, res) {
    const a = blank();
    if (!raw || typeof raw !== "object") return a;
    for (const q of G.questions) {
      const v = raw[q.id] == null ? "" : String(raw[q.id]).trim().toLowerCase();
      if (!v) continue;
      if (OPT[q.id][v] || (v === "na" && q.skip_if)) a[q.id] = v;
      else if (res) res.invalid++;
    }
    a.note = raw.note == null ? "" : String(raw.note).slice(0, NOTE_MAX);
    a.annotated_at = typeof raw.annotated_at === "string" ? raw.annotated_at.trim() : "";
    const t = Number(raw.time_spent_s);
    a.time_spent_s = Number.isFinite(t) && t > 0 ? t : 0;
    applySkip(a);
    const ai = aiCodes(raw.ai);
    if (ai) { a.ai = ai; a.ai_model = typeof raw.ai_model === "string" ? raw.ai_model.trim().slice(0, 200) : ""; }
    return a;
  }
  // The AI's answers of one case ({question: code}): known codes, "na" where skip logic allows it; null when none
  function aiCodes(raw) {
    if (!raw || typeof raw !== "object") return null;
    const s = {};
    for (const q of G.questions) {
      const v = raw[q.id] == null ? "" : String(raw[q.id]).trim().toLowerCase();
      s[q.id] = OPT[q.id][v] || (v === "na" && q.skip_if) ? v : "";
    }
    applySkip(s);
    return QIDS.some((q) => s[q]) ? s : null;
  }

  // ---------------------------------------------------------------- state
  let M = null, cases = [], N = 0, byId = new Map();
  let session = false, slug = "", storeKey = "", record = null, ann = {};
  let cur = 0, active = 0, filt = "all", shown = "", localOk = true, savedAt = 0;
  const keyFor = (sl, mv) => LS + "ann:" + (mv || M.manifest_version) + ":" + sl;
  const curRec = () => (session && cases[cur] ? ann[cases[cur].id] : undefined);
  function ensureRec(id) {                          // a case the reviewer works on keeps the AI's answers it shows
    const a = ann[id] || (ann[id] = blank());
    if (!a.ai && AI && AI.answers[id]) {
      a.ai = {};
      for (const q of QIDS) a.ai[q] = AI.answers[id][q] || "";
      a.ai_model = AI.model;
    }
    return a;
  }

  // ---------------------------------------------------------------- AI pre-filled answers (<data>/ai_prefill.js)
  let AI = null;                                    // {model, runs, answers: {case_id: {question: code, agree, note}}}
  function takeAi(x) {
    if (!x || typeof x !== "object" || x.manifest_version !== M.manifest_version || !x.answers || typeof x.answers !== "object") return null;
    const answers = {};
    for (const id of Object.keys(x.answers)) {
      const r = x.answers[id], s = byId.has(id) ? aiCodes(r) : null;
      if (!s) continue;
      s.agree = r.agree && typeof r.agree === "object" ? r.agree : {};
      s.note = String(r.note || "").trim().slice(0, NOTE_MAX);
      answers[id] = s;
    }
    if (!Object.keys(answers).length) return null;
    return { model: String(x.model || "an AI model").slice(0, 200), runs: Number(x.runs) || 0, answers };
  }
  // the AI's answers this case shows: the ones kept in its annotation, else those of ai_prefill.js
  function aiOf(id) { const a = ann[id]; return (a && a.ai) || (AI && AI.answers[id]) || null; }
  const hasAi = () => !!AI || cases.some((c) => ann[c.id] && ann[c.id].ai);
  function shownView(id) {                          // what the case shows: the reviewer's answer, else the AI's
    const a = ann[id], s = aiOf(id), v = {};
    for (const q of QIDS) v[q] = (a && a[q]) || (s && s[q]) || "";
    applySkip(v);
    return v;
  }
  function status(id) {
    const a = ann[id];
    if (isComplete(a)) return hasIssue(a) ? "flag" : "done";
    return hasContent(a) ? "partial" : "todo";
  }
  const countCompleteIn = (anns) => cases.reduce((n, c) => n + (anns && isComplete(anns[c.id]) ? 1 : 0), 0);
  const countDone = () => countCompleteIn(ann);
  function nextIncomplete(from) {
    for (let k = 0; k < N; k++) { const j = (from + k) % N; if (!isComplete(ann[cases[j].id])) return j; }
    return -1;
  }
  function newRecord(rater) {
    return { tool: TOOL, tool_version: TOOL_VERSION, rubric_version: G.version, manifest_version: M.manifest_version, rater,
      saved_at: "", changed_at: "", rev: 0, exported_rev: 0, exported_at: "", last_case: "", annotations: {} };
  }
  function peekLocal(sl) {
    const r = lsJson(keyFor(sl));
    return r && r.annotations && typeof r.annotations === "object" ? r : null;
  }

  // ---------------------------------------------------------------- saving: this browser, and serve.py when there
  const server = { on: false, timer: 0, busy: false, again: false, fails: 0, dirty: false };
  const api = (p) => "api/" + p;                   // relative to index.html: /api/... when serve.py serves web/ at the root
  function persist(toServer) {
    if (!session) return;
    record.saved_at = isoNow();
    localOk = lsSet(storeKey, JSON.stringify(record));
    savedAt = Date.now();
    if (server.on && toServer !== false) { server.dirty = true; schedulePut(1500); }
    if (me) queue();
    showSave();
  }
  function changed() {                              // an answer or a note changed
    record.rev = (record.rev || 0) + 1;
    record.changed_at = isoNow();
    persist();
  }
  const unexported = () => !!record && (record.rev || 0) > (record.exported_rev || 0);
  function showSave() {
    const s = $("save");
    const set = (t, cls, title) => { s.textContent = t; s.className = "save" + (cls ? " " + cls : ""); s.title = title || t; };
    if (!session) return set(M ? "Not started" : "Loading…", "warn");
    if (me) {                                       // the lab's relay: what matters is whether the lab has them
      const n = obx.length;
      if (n && rl.fails) return set("Not yet saved (" + n + " waiting)", "err",
        "No connection to the lab right now. Your annotations are kept in this browser and sent as soon as the connection is back; keep this page open.");
      if (n || rl.sending) return set("Saving…");
      if (rl.offline) return set("Not yet saved to the lab — no connection", "err",
        "Your annotations are kept on this computer and saved to the lab when the connection is back.");
      const t = new Date(rl.savedAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      return set("Saved to the lab · " + t, "", "Every annotation is saved to the lab as you make it; you can continue on any computer under your name.");
    }
    if (!localOk) return set("Not saved — download your annotations before closing", "err",
      "This browser refused to keep the annotations (a private window, or the storage is full). Download your annotations often.");
    const t = new Date(savedAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    if (server.on) {                                // serve.py of the offline package: a copy in its results folder too
      if (server.fails) return set("Saved in this browser · " + t + " · not yet in the results folder, retrying", "warn",
        "The annotations are safe in this browser. Is the program window still open? Download your annotations before closing to be sure.");
      if (server.dirty || server.busy) return set("Saved in this browser · " + t + " · saving to the results folder…");
      return set("Saved in this browser and in the results folder · " + t);
    }
    if (unexported()) return set("Saved in this browser · " + t + " · not downloaded yet", "",
      "Saved automatically in this browser. At the end of each sitting, click Download annotations and send us the JSON file.");
    const d = tms(record.exported_at) ? new Date(tms(record.exported_at)) : null;
    const when = !d ? "" : d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : fmtWhen(record.exported_at);
    return set("Saved in this browser · " + t + (when ? " · downloaded " + when : ""));
  }
  async function ping() {
    if (!SERVER_API || !/^https?:$/.test(location.protocol)) return false;
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 2500);
      const r = await fetch(api("ping"), { cache: "no-store", signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) return false;
      const j = await r.json();
      return !!(j && j.ok && j.tool === TOOL);
    } catch (e) { return false; }
  }
  function serverBody() {
    const o = exportObject();
    o.saved_at = record.saved_at;
    o.source = "autosave";
    return JSON.stringify(o);
  }
  function schedulePut(ms) { clearTimeout(server.timer); server.timer = setTimeout(putNow, ms); }
  async function putNow() {
    clearTimeout(server.timer);
    if (!server.on || !session) return;
    if (server.busy) { server.again = true; return; }
    server.busy = true; server.dirty = false;
    const url = api("annotations/" + encodeURIComponent(slug)), body = serverBody();
    try {
      const r = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body, cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      server.fails = 0;
    } catch (e) {
      server.fails++; server.dirty = true;
      server.timer = setTimeout(putNow, Math.min(60000, 2000 * 2 ** Math.min(server.fails, 5)));
    } finally {
      server.busy = false;
      if (server.again) { server.again = false; schedulePut(300); }
      showSave();
    }
  }
  function putKeepalive() {                         // the page is closing: one last copy to serve.py
    if (!server.on || !session || !(server.dirty || server.busy)) return;
    try {
      fetch(api("annotations/" + encodeURIComponent(slug)), { method: "PUT", headers: { "Content-Type": "application/json" },
        body: serverBody(), keepalive: true }).catch(() => {});
    } catch (e) { /* the copy in this browser is there */ }
  }

  // ---------------------------------------------------------------- the lab's relay (as in Retify)
  // Sessions by name, a key per browser; every changed case goes into the outbox, which is sent in batches of 200
  // (back-off up to a minute, and again when the browser is online); everyone's progress under the top bar.
  let me = null;                                    // the session on the relay: {id, name, key}
  let obx = [];                                     // the outbox: annotations the relay has not confirmed yet
  const touched = new Set();                        // cases changed since the last save
  const rl = { sending: false, fails: 0, wait: 2000, retry: 0, savedAt: 0, offline: false };
  const touch = (id) => { if (me && id) touched.add(id); };
  const outboxKey = () => LS + "outbox:" + M.manifest_version + ":" + me.id;
  function setOutbox(o) { obx = o; lsSet(outboxKey(), JSON.stringify(o)); }
  async function rcall(method, path, body) {
    const r = await fetch(RELAY + path, {
      method, cache: "no-store",
      headers: Object.assign({ "Content-Type": "application/json" }, me ? { "X-Audit-Key": me.key } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || "HTTP " + r.status); e.status = r.status; throw e; }
    return j;
  }
  function item(id) {                               // one case as the relay takes it (the export's fields)
    const a = ann[id], o = { case_id: id };
    for (const q of QIDS) o[q] = a[q] || "";
    o.note = a.note || "";
    o.annotated_at = a.annotated_at;
    o.time_spent_s = Math.round((Number(a.time_spent_s) || 0) * 10) / 10;
    if (a.ai) { o.ai = Object.assign({}, a.ai); o.ai_model = a.ai_model || ""; }
    return o;
  }
  function queue() {
    if (!me || !touched.size) return;
    const ids = [...touched].filter((id) => ann[id] && ann[id].annotated_at);
    touched.clear();
    if (!ids.length) return;
    const o = obx.filter((x) => !ids.includes(x.case_id));
    for (const id of ids) o.push(item(id));
    setOutbox(o);
    flush();
  }
  async function flush() {
    if (rl.sending || !me) return;
    if (!obx.length) { showSave(); return; }
    rl.sending = true;
    clearTimeout(rl.retry);
    const mine = me;
    showSave();
    try {
      while (obx.length && me === mine) {
        const batch = obx.slice(0, 200);
        await rcall("POST", "/annotations", { set: M.manifest_version, session: me.id, annotations: batch });
        if (me !== mine) break;
        const sent = new Map(batch.map((x) => [x.case_id, JSON.stringify(x)]));
        setOutbox(obx.filter((x) => sent.get(x.case_id) !== JSON.stringify(x)));   // changed meanwhile: still queued
        rl.fails = 0;
        rl.offline = false;
        rl.savedAt = Date.now();
      }
      rl.wait = 2000;
      rl.sending = false;
      showSave();
      team();
    } catch (e) {
      rl.sending = false;
      if (e.status === 403 && me === mine) { enter("Please type your name again."); return; }
      rl.fails++;
      showSave();
      rl.retry = setTimeout(flush, rl.wait);
      rl.wait = Math.min(rl.wait * 2, 60000);
    }
  }
  addEventListener("online", () => { rl.wait = 2000; flush(); });

  async function team() {                           // everyone's progress: masked names and counts, never annotations
    if (!me) return;
    try {
      const p = await rcall("GET", "/progress?set=" + encodeURIComponent(M.manifest_version) + "&session=" + me.id);
      const T = $("teamrows");
      T.replaceChildren();
      for (const r of p.annotators) {
        const d = el("div", "trow" + (r.you ? " me" : ""));
        const bar = el("div", "pbar"), fill = el("i");
        fill.style.width = (p.cases ? (100 * r.annotated) / p.cases : 0) + "%";
        bar.append(fill);
        d.append(el("b", null, r.name || "Annotator " + r.annotator), el("span", null, r.annotated + " / " + p.cases), bar);
        T.append(d);
      }
      if (!p.annotators.length) T.textContent = "No annotations yet.";
      $("team").hidden = false;
    } catch (e) { /* progress is a nicety; the annotations are what matters */ }
  }
  setInterval(() => { if (me && session && !document.hidden) team(); }, 15000);

  // On entering: the relay's annotations of this session merged with this browser's (the later one wins); the cases
  // newer here are queued. false: the relay does not know this browser's key (enter again by name).
  async function sync() {
    let got;
    try {
      got = (await rcall("GET", "/annotations?set=" + encodeURIComponent(M.manifest_version) + "&session=" + me.id)).annotations || {};
    } catch (e) {
      if (e.status === 403) return false;
      rl.offline = true;
      return true;                                  // offline: work from this browser; the outbox waits
    }
    const res = mergeIn(got);
    touched.clear();                                // what came from the relay is not sent back
    if (res.taken) { record.rev = (record.rev || 0) + 1; record.changed_at = isoNow(); }
    for (const id of Object.keys(ann)) {
      const a = ann[id], b = got[id];
      if (!a || !a.annotated_at || !hasContent(a)) continue;
      if (!b || tms(a.annotated_at) > tms(b.annotated_at) ||
        (tms(a.annotated_at) === tms(b.annotated_at) && (Number(a.time_spent_s) || 0) > (Number(b.time_spent_s) || 0) + 0.05)) touched.add(id);
    }
    return true;
  }
  // Who is annotating, on the relay: the sessions sharing a word with the typed name, or a new one with the full name
  let relayResolve = null;
  function askRelay(why, cancelable) {
    return new Promise((resolve) => {
      if (relayResolve) relayResolve("cancel");
      relayResolve = resolve;
      const R = $("rRes");
      R.replaceChildren();
      if (why) R.append(el("p", "ferr", why));
      $("rName").value = me ? me.name : "";
      $("rCancel").hidden = !cancelable;
      $("rFind").classList.add("primary");
      $("rFind").hidden = false;
      showBox("relayBox", $("rName"));
    });
  }
  function closeRelay(v) {
    $("relayBox").hidden = true;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    const r = relayResolve;
    relayResolve = null;
    if (r) r(v);
  }
  async function findSession(e) {
    if (e) e.preventDefault();
    const name = cleanName($("rName").value), R = $("rRes");
    R.replaceChildren();
    $("rFind").classList.add("primary");
    if (!name) { $("rName").focus(); return; }
    const say = (t) => R.append(el("p", null, t));
    try {
      const { matches } = await rcall("POST", "/sessions/find", { name });
      if (matches.length) {
        say("We found these sessions for “" + name + "”. Is one of them yours?");
        for (const m of matches) {
          const b = choice(m.name, m.annotated + " annotated", async () => {
            try { closeRelay(await rcall("POST", "/sessions/enter", { id: m.id })); } catch (x) { say("That did not work. Please try again."); }
          });
          b.classList.add("primary");
          R.append(b);
        }
        R.append(choice("None of these is me", "start a new session", () => newSession(name)));
      } else {
        newSession(name, "No session was found for “" + name + "”. Would you like to start a new session?");
      }
    } catch (x) {
      say("No connection right now. Please try again, or choose Continue without saving to the lab and download your annotations when you finish.");
    }
  }
  function newSession(typed, why) {                 // a new session needs the full name, first and last
    const R = $("rRes");
    R.replaceChildren();
    $("rFind").classList.remove("primary");
    const p = el("p", null, (why ? why + " " : "") + "Please enter your full name, first and last.");
    const f = document.createElement("form");
    f.noValidate = true;
    const input = el("input", "field");
    input.id = "fullname"; input.autocomplete = "name"; input.maxLength = 80; input.placeholder = "e.g., Tina Vascullensky";
    input.setAttribute("aria-label", "Your full name");
    const row = el("div", "row"), go = el("button", "primary", "Start a new session");
    go.type = "submit";
    row.append(go);
    f.append(input, row);
    R.append(p, f);
    input.value = words(typed).length >= 2 ? cleanName(typed) : "";
    input.focus();
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const full = cleanName(input.value);
      if (words(full).length < 2) { p.textContent = "Please enter your full name, first and last (e.g., Tina Vascullensky)."; input.focus(); return; }
      try { closeRelay(await rcall("POST", "/sessions", { name: full })); } catch (x) { p.textContent = "That did not work. Please try again."; }
    };
  }
  $("rForm").addEventListener("submit", findSession);
  $("rFind").onclick = findSession;
  $("rLocal").onclick = () => closeRelay("local");
  $("rCancel").onclick = () => closeRelay("cancel");
  // ask for the name, then work in that session; "Continue without saving to the lab": in this browser only, by name
  async function enter(why) {
    const s = await askRelay(why, !!(session && !why));
    if (s === "cancel") return;
    if (s && s.id) return join(s);
    if (session) { flushNote(); saveTime(); persist(); }
    leaveRelay();
    lsDel(LS + "session");
    const r = await openSession(false);
    if (r) await startSession(r);
  }
  function leaveRelay() {
    me = null;
    obx = [];
    touched.clear();
    clearTimeout(rl.retry);
    Object.assign(rl, { sending: false, fails: 0, wait: 2000, savedAt: 0, offline: false });
    $("team").hidden = true;
  }
  async function join(s) {
    if (session) { flushNote(); saveTime(); persist(); }
    leaveRelay();
    me = { id: s.id, name: s.name, key: s.key };
    lsSet(LS + "session", JSON.stringify({ id: s.id, name: s.name, key: s.key, relay: RELAY }));
    await startSession({ name: s.name, role: "", years_experience: null });
  }

  // ---------------------------------------------------------------- merging (load, server copy, other tabs)
  // For each case the annotation with the later annotated_at wins; this browser keeps a tie.
  function mergeIn(src) {
    const res = { taken: 0, kept: 0, unknown: 0, invalid: 0 };
    for (const id of Object.keys(src || {})) {
      if (!byId.has(id)) { res.unknown++; continue; }
      const r = clean(src[id], res);
      if (!hasContent(r)) continue;
      const a = ann[id];
      if (!hasContent(a) || tms(r.annotated_at) > tms(a.annotated_at)) {
        r.time_spent_s = Math.max(r.time_spent_s || 0, (a && a.time_spent_s) || 0);
        ann[id] = r;
        touch(id);
        res.taken++;
      } else res.kept++;
    }
    return res;
  }
  const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");

  // ---------------------------------------------------------------- exports (SPEC "Export contract")
  function exportObject() {
    const out = {}, withAi = hasAi();
    for (const c of cases) {
      const a = ann[c.id] || blank(), r = {};
      for (const q of QIDS) r[q] = a[q] || "";
      r.note = a.note || "";
      r.annotated_at = a.annotated_at || "";
      r.time_spent_s = Math.round((Number(a.time_spent_s) || 0) * 10) / 10;
      if (withAi) {                                 // the AI's answers this case showed ("" when it was never opened)
        r.ai = {};
        for (const q of QIDS) r.ai[q] = (a.ai && a.ai[q]) || "";
        r.ai_model = (a.ai && a.ai_model) || "";
      }
      out[c.id] = r;
    }
    const rt = record.rater;
    return { tool: TOOL, tool_version: TOOL_VERSION, rubric_version: G.version, manifest_version: M.manifest_version,
      exported_at: isoNow(), rater: { name: rt.name, role: rt.role, years_experience: rt.years_experience }, annotations: out };
  }
  const withAiCols = (o) => cases.some((c) => o.annotations[c.id] && o.annotations[c.id].ai);
  const header = (o) => (withAiCols(o) ? [...COLS, ...AI_COLS] : COLS);
  const tableRows = (o) => cases.map((c, k) => {
    const r = o.annotations[c.id], row = [k + 1, c.id, ...QIDS.map((q) => r[q]), r.note, r.annotated_at, r.time_spent_s];
    return withAiCols(o) ? [...row, ...QIDS.map((q) => (r.ai && r.ai[q]) || ""), r.ai_model || ""] : row;
  });
  const csvCell = (v) => { const s = v == null ? "" : String(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csvText = (o) => [header(o), ...tableRows(o)].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  function xlsxBytes(o) {
    const X = window.XLSX, wb = X.utils.book_new();
    const ws = X.utils.aoa_to_sheet([header(o), ...tableRows(o)]);
    ws["!cols"] = [5, 8, 13, 12, 9, 13, 12, 12, 8, 50, 26, 12, 13, 12, 9, 13, 12, 12, 8, 20].map((w) => ({ wch: w }));
    X.utils.book_append_sheet(wb, ws, "annotations");
    const r = o.rater;
    const ws2 = X.utils.aoa_to_sheet([["field", "value"], ["name", r.name], ["role", r.role], ["years_experience", r.years_experience],
      ["manifest_version", o.manifest_version], ["rubric_version", o.rubric_version], ["exported_at", o.exported_at]]);
    ws2["!cols"] = [{ wch: 18 }, { wch: 40 }];
    X.utils.book_append_sheet(wb, ws2, "rater");
    return X.write(wb, { bookType: "xlsx", type: "array", compression: true });
  }
  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function doExport(kind) {
    if (!session) return;
    flushNote(); saveTime();
    if (kind === "xlsx" && !window.XLSX) return toast("The Excel file cannot be made here (vendor/xlsx.full.min.js is missing). Please download the JSON file.", true);
    const o = exportObject(), name = "ophth_audit_" + slug + "_" + fileStamp(new Date()) + "." + kind;
    let blob;
    try {
      if (kind === "json") blob = new Blob([JSON.stringify(o, null, 2) + "\n"], { type: "application/json" });
      else if (kind === "csv") blob = new Blob([csvText(o)], { type: "text/csv;charset=utf-8" });
      else blob = new Blob([xlsxBytes(o)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    } catch (e) {
      return toast("The download failed: " + e.message, true);
    }
    download(blob, name);
    record.exported_rev = record.rev || 0;
    record.exported_at = o.exported_at;
    persist(false);
    $("dlBox").hidden = true;
    toast("Downloaded " + name + " · " + countDone() + " of " + N + " cases annotated", false, 4500);
  }
  function openDownload() {                         // one control for the three files, as in Retify
    if (!session) return;
    flushNote(); saveTime();
    const done = countDone(), left = N - done;
    $("dlSum").textContent = done + " of " + N + " cases annotated" +
      (left ? " (" + left + " still to do; you can download now and again later)." : ". Thank you!") +
      (me ? " This is a copy; your annotations are already saved to the lab."
        : " Please send us the JSON file" + (server.on ? "; a copy is also kept in the results folder." : ".") + " Excel and CSV are copies for you.");
    openBox("dlBox", "dlJson");
  }

  // ---------------------------------------------------------------- loading a file exported earlier
  function csvRows(text) {                          // RFC 4180: quotes, doubled quotes, CR/LF inside quotes
    const out = [];
    let row = [], cell = "", q = false;
    for (let k = 0; k < text.length; k++) {
      const c = text[k];
      if (q) {
        if (c === '"') { if (text[k + 1] === '"') { cell += '"'; k++; } else q = false; } else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[k + 1] === "\n") k++;
        row.push(cell); out.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); out.push(row); }
    return out.filter((r) => r.some((x) => String(x).trim()));
  }
  function fromRows(rows) {                         // spreadsheet rows -> {case_id: annotation}; columns found by name
    const h = (rows[0] || []).map((x) => String(x == null ? "" : x).replace(/^﻿/, "").trim().toLowerCase());
    const ci = h.indexOf("case_id");
    if (ci < 0) throw new Error('it has no "case_id" column');
    const out = {};
    for (const row of rows.slice(1)) {
      const id = String(row[ci] == null ? "" : row[ci]).trim();
      if (!id) continue;
      const r = {};
      for (const f of [...QIDS, "note", "annotated_at", "time_spent_s"]) { const k = h.indexOf(f); if (k >= 0) r[f] = row[k]; }
      if (h.includes("ai_" + QIDS[0])) {            // the AI's answers, after the usual columns
        r.ai = {};
        for (const q of QIDS) { const k = h.indexOf("ai_" + q); r.ai[q] = k >= 0 ? row[k] : ""; }
        const k = h.indexOf("ai_model");
        r.ai_model = k >= 0 ? String(row[k] == null ? "" : row[k]) : "";
      }
      out[id] = r;
    }
    return out;
  }
  async function loadFile(file) {
    let got, who = "", mv = "";
    const name = file.name || "file";
    try {
      if (/\.json$/i.test(name)) {
        const j = JSON.parse(await file.text());
        if (!j || !j.annotations || typeof j.annotations !== "object") throw new Error('it has no "annotations"');
        got = j.annotations;
        who = j.rater && j.rater.name ? slugify(j.rater.name) : "";
        mv = typeof j.manifest_version === "string" ? j.manifest_version : "";
      } else if (/\.xlsx$/i.test(name)) {
        if (!window.XLSX) throw new Error("the Excel reader (vendor/xlsx.full.min.js) is missing");
        const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
        got = fromRows(XLSX.utils.sheet_to_json(wb.Sheets.annotations || wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" }));
        if (wb.Sheets.rater) {
          const kv = {};
          for (const r of XLSX.utils.sheet_to_json(wb.Sheets.rater, { header: 1, raw: true, defval: "" })) kv[String(r[0]).trim()] = r[1];
          if (kv.name) who = slugify(kv.name);
          if (kv.manifest_version) mv = String(kv.manifest_version);
        }
      } else if (/\.csv$/i.test(name)) {
        got = fromRows(csvRows((await file.text()).replace(/^﻿/, "")));
        // CSV has no rater block: the slug is in the file name, <prefix>_audit_<slug>_<YYYYMMDD-HHMM>.csv, where the
        // prefix is this page's ("ophth") or the one of files exported by an earlier version of the offline package
        const m = name.match(/^[a-z0-9]+_audit_([a-z0-9-]+)_\d{8}-\d{4}/i);
        if (m) who = m[1].toLowerCase();
      } else throw new Error("please choose a .json, .csv or .xlsx file downloaded from this page");
    } catch (e) {
      return ask("Could not load the file", [name + ": " + e.message], [{ label: "Close", value: 0, primary: true, cancel: true }]);
    }
    if (who && who !== slug) {
      const ok = await ask("Annotations of another reviewer?", ["This file was downloaded under the name “" + who + "”, but you are annotating as " +
        record.rater.name + ".", "Add its annotations to yours anyway?"],
      [{ label: "Cancel", value: false, cancel: true }, { label: "Merge anyway", value: true }]);
      if (!ok) return;
    }
    if (mv && mv !== M.manifest_version) {
      const ok = await ask("Another version of the cases", ["This file was saved for another version of the cases (“" + mv + "”; this page shows “" +
        M.manifest_version + "”). Only cases with the same ID are loaded."], [{ label: "Cancel", value: false, cancel: true }, { label: "Load", value: true, primary: true }]);
      if (!ok) return;
    }
    flushNote(); saveTime();
    const res = mergeIn(got);
    if (res.taken) changed(); else persist();
    renderCase();
    const lines = [plural(res.taken, "case") + " taken from " + name + " (newer than this browser's or new).",
      plural(res.kept, "case") + " kept as they were in this browser (the same or newer)."];
    if (res.unknown) lines.push(plural(res.unknown, "row") + " skipped: not cases of this audit.");
    if (res.invalid) lines.push(plural(res.invalid, "answer") + " ignored: not answers of these questions.");
    await ask("Annotations loaded", lines, [{ label: "OK", value: 0, primary: true, cancel: true }]);
  }

  // ---------------------------------------------------------------- dialogs
  let askCancel = null;
  function ask(title, paras, buttons) {
    if (askCancel) askCancel();
    return new Promise((resolve) => {
      $("askTitle").textContent = title;
      $("askBody").replaceChildren(...paras.map((p) => (typeof p === "string" ? el("p", null, p) : p)));
      const R = $("askRow");
      R.replaceChildren();
      let cancelValue = null, focus = null, cancelBtn = null;
      const finish = (v) => {
        $("askBox").hidden = true;
        askCancel = null;
        if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
        resolve(v);
      };
      for (const b of buttons) {
        const x = el("button", b.primary ? "primary" : "", b.label);
        x.type = "button";
        x.onclick = () => finish(b.value);
        if (b.cancel) { cancelValue = b.value; cancelBtn = x; }
        if (b.primary) focus = x;
        R.append(x);
      }
      askCancel = () => finish(cancelValue);
      showBox("askBox", focus || cancelBtn || R.lastChild);   // no primary action: the safe button has the focus
    });
  }
  const MODALS = ["askBox", "accessBox", "relayBox", "sessBox", "welcomeBox", "helpBox", "dlBox"];
  function topModal() { for (const id of MODALS) if (!$(id).hidden) return $(id); return null; }
  function showBox(id, focusEl) {                   // open a dialog at its top, with the keyboard focus on its button
    $(id).hidden = false;
    const box = $(id).querySelector(".box");
    if (box) box.scrollTop = 0;
    setTimeout(() => { if (focusEl) focusEl.focus({ preventScroll: true }); }, 0);
  }
  function openBox(id, focusId) { showBox(id, $(focusId)); }
  function closeBox(m) {
    if (m.id === "askBox") { if (askCancel) askCancel(); return; }
    if (m.dataset.esc === "no") return;
    m.hidden = true;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }
  for (const id of ["helpBox", "dlBox"]) $(id).addEventListener("click", (e) => { if (e.target === $(id)) closeBox($(id)); });

  // ---------------------------------------------------------------- the session: who is rating
  const cleanName = (s) => String(s || "").replace(/\s+/g, " ").trim();
  // Words of a name, for finding a session as Retify does: case, accents and punctuation do not matter.
  const words = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let sessResolve = null;
  function savedSessions() {                        // the names that have annotations saved in this browser, newest first
    const pre = LS + "ann:" + M.manifest_version + ":";
    return lsKeys().filter((k) => k && k.startsWith(pre)).map((k) => ({ slug: k.slice(pre.length), rec: lsJson(k) }))
      .filter((x) => x.rec && x.rec.rater && x.rec.rater.name).sort((a, b) => tms(b.rec.saved_at) - tms(a.rec.saved_at));
  }
  function choice(label, sub, onclick, on) {
    const b = el("button", "sess" + (on ? " on" : ""));
    b.type = "button";
    b.append(el("span", null, label), el("small", null, sub));
    b.onclick = onclick;
    return b;
  }
  // As the name is typed: the session of exactly this name (continue), else the sessions in this browser sharing a word
  // with it ("Is one of them yours?"), else a new session, which needs the full name, first and last.
  function updFound() {
    const name = cleanName($("sName").value), R = $("sRes");
    R.replaceChildren();
    $("sErr").hidden = true;
    if (!name) { $("sGo").textContent = "Start"; return; }
    const rec = peekLocal(slugify(name));
    const annotated = (r) => countCompleteIn(r.annotations) + " of " + N + " annotated";
    if (rec) {
      R.append(el("p", "found", "Welcome back. Your session was found in this browser: " + annotated(rec) +
        (rec.saved_at ? ", last saved " + fmtWhen(rec.saved_at) : "") + "."));
      $("sGo").textContent = "Continue";
      return;
    }
    const w = new Set(words(name));
    const matches = savedSessions().filter((x) => words(x.rec.rater.name).some((v) => w.has(v))).slice(0, 6);
    if (matches.length) {
      R.append(el("p", null, "We found these sessions for “" + name + "” in this browser. Is one of them yours?"));
      for (const x of matches) R.append(choice(x.rec.rater.name, annotated(x.rec), () => { $("sName").value = x.rec.rater.name; updFound(); $("sName").focus(); }));
      R.append(el("p", null, "If not, please enter your full name, first and last, to start a new session."));
    } else {
      R.append(el("p", null, "No session was found for “" + name + "” in this browser. To start a new session, please enter your full name, first and last."));
    }
    $("sGo").textContent = "Start a new session";
  }
  function openSession(cancelable) {
    return new Promise((resolve) => {
      sessResolve = resolve;
      const last = lsJson(LS + "last");
      $("sName").value = !cancelable && last && typeof last.name === "string" ? last.name : "";
      $("sCancel").hidden = !cancelable;
      $("sLock").hidden = !enc.on;
      $("sErr").hidden = true;
      updFound();
      $("sessBox").hidden = false;
      setTimeout(() => { $("sName").focus(); $("sName").select(); }, 0);
    });
  }
  function closeSession(v) {
    $("sessBox").hidden = true;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    const r = sessResolve;
    sessResolve = null;
    if (r) r(v);
  }
  $("sName").addEventListener("input", updFound);
  $("sCancel").onclick = () => closeSession(null);
  $("sessForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = cleanName($("sName").value);     // as in Retify: the reviewer's name is the only identity asked for
    const bad = (msg) => { $("sErr").textContent = msg; $("sErr").hidden = false; $("sName").focus(); };
    if (name.length < 2) return bad("Please enter your name.");
    if (!/[a-z0-9]/i.test(name)) return bad("Please type your name in Latin letters (a–z), for example as in your e-mail address.");
    if (!peekLocal(slugify(name)) && words(name).length < 2) return bad("Please enter your full name, first and last (e.g., Tina Vascullensky).");
    closeSession({ name, role: "", years_experience: null });
  });

  async function startSession(rater) {
    if (session) {                                  // leaving the current rater: everything saved first
      flushNote(); saveTime(); persist();
      if (server.on) await putNow();
    }
    session = false;                                // no clock, keys or saving until the copies are settled
    const sl = slugify(rater.name);
    slug = sl;
    // on the relay: this browser's copy of the session, apart from the browser-only annotations under the same name
    storeKey = me ? LS + "relay:" + M.manifest_version + ":" + me.id : keyFor(sl);
    let stored = lsJson(storeKey);
    if (!(stored && stored.annotations && typeof stored.annotations === "object")) stored = null;
    record = Object.assign(newRecord(rater), stored || {});
    Object.assign(record, { tool: TOOL, tool_version: TOOL_VERSION, rubric_version: G.version, manifest_version: M.manifest_version, rater });
    ann = {};
    for (const id of Object.keys((stored && stored.annotations) || {})) if (byId.has(id)) ann[id] = clean(stored.annotations[id]);
    record.annotations = ann;
    shown = "";
    lsSet(LS + "last", JSON.stringify(rater));
    showWho();
    enableButtons(true);
    if (me) {                                       // the relay's copy, merged; the outbox of an earlier visit
      const o = lsJson(outboxKey());
      obx = Array.isArray(o) ? o.filter((x) => x && byId.has(x.case_id)) : [];
      $("team").hidden = true;
      if (!(await sync())) return enter("Please type your name again.");
    } else if (server.on) await fromServer();        // a newer copy on the audit server?
    else if (!stored) await fromOtherVersion();      // answers saved for an earlier case list in this browser?
    session = true;
    persist();
    if (me) { flush(); team(); }
    const k = nextIncomplete(0), last = byId.get(record.last_case);
    cur = k >= 0 ? k : last != null ? last : 0;
    active = firstOpen(cases[cur].id);
    allDoneShown = false;
    renderCase();
    await welcome();
    lastTick = Date.now();
    if (k < 0) allDone();                           // everything annotated already: say so, as Retify does
  }
  async function fromServer() {
    let got = null;
    try {
      const r = await fetch(api("annotations/" + encodeURIComponent(slug)), { cache: "no-store" });
      if (r.ok) got = await r.json();
    } catch (e) { /* no copy */ }
    if (!got || !got.annotations || typeof got.annotations !== "object") return;
    const theirs = got.saved_at || got.exported_at || "";
    if (tms(theirs) > tms(record.saved_at)) {
      const other = got.manifest_version && got.manifest_version !== M.manifest_version;
      const ok = await ask("Continue from the copy in the results folder?", [
        "The results folder on this computer has a copy of your work that is newer than the copy in this browser.",
        "That copy: " + countCompleteIn(got.annotations) + " of " + N + " cases annotated, saved " + fmtWhen(theirs) + ". This browser: " +
          countDone() + " annotated" + (record.saved_at ? ", saved " + fmtWhen(record.saved_at) : "") + ".",
        "Loading it keeps, for each case, the newer annotation." + (other ? " (It was saved for another version of the cases, “" + got.manifest_version + "”.)" : "")],
      [{ label: "Keep this browser's copy", value: false, cancel: true }, { label: "Load that copy", value: true, primary: true }]);
      if (!ok) return;
    }
    // (an older server copy is merged quietly: it only adds cases that are newer there, e.g. from another browser)
    const res = mergeIn(got.annotations);
    if (res.taken) { record.rev = (record.rev || 0) + 1; record.changed_at = isoNow(); toast(plural(res.taken, "case") + " loaded from the results folder"); }
  }
  async function fromOtherVersion() {
    const pre = LS + "ann:", suf = ":" + slug;
    const found = lsKeys().filter((k) => k && k.startsWith(pre) && k.endsWith(suf) && k !== storeKey)
      .map((k) => ({ mv: k.slice(pre.length, k.length - suf.length), rec: lsJson(k) }))
      .filter((x) => x.rec && x.rec.annotations && Object.keys(x.rec.annotations).some((id) => byId.has(id) && hasContent(x.rec.annotations[id])))
      .sort((a, b) => tms(b.rec.saved_at) - tms(a.rec.saved_at));
    if (!found.length) return;
    const x = found[0], n = Object.keys(x.rec.annotations).filter((id) => byId.has(id) && hasContent(x.rec.annotations[id])).length;
    const ok = await ask("Load your earlier annotations?", ["This browser has annotations saved under your name for another version of the cases (“" +
      x.mv + "”): " + plural(n, "case") + " with the same ID as in this version (“" + M.manifest_version + "”).",
    "Load them? Please check those cases again when you reach them."],
    [{ label: "Start without them", value: false, cancel: true }, { label: "Load", value: true, primary: true }]);
    if (!ok) return;
    const res = mergeIn(x.rec.annotations);
    if (res.taken) { record.rev = (record.rev || 0) + 1; record.changed_at = isoNow(); }
    toast(plural(res.taken, "case") + " loaded");
  }
  // The welcome, for someone new (Retify): once the session is known, when it has no annotations yet (a new reviewer,
  // or one who never annotated), once per name in this browser. Help otherwise only from How to.
  function welcome() {
    const k = LS + "welcomed:" + (me ? me.id : slug);
    if (lsGet(k) === "1" || cases.some((c) => hasContent(ann[c.id]))) return Promise.resolve();
    rich($("wStore"), me
      ? "Your annotations are saved automatically under your name, as you make them. To continue on another computer, open this page there and type the same name."
      : server.on
      ? "Your annotations are saved automatically in this browser and in the results folder on this computer. At the end of each sitting, click **Download annotations** and send us the JSON file."
      : "Your annotations are saved automatically in this browser. To continue later, open this page again in the same browser and type the same name. At the end of each sitting, click **Download annotations** and send us the JSON file.");
    showBox("welcomeBox", $("wOk"));
    return new Promise((done) => {
      $("wOk").onclick = () => {
        $("welcomeBox").hidden = true;
        lsSet(k, "1");
        if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
        lastTick = Date.now();
        done();
      };
    });
  }
  function showWho() {
    const r = record && record.rater;
    $("who").hidden = !r;
    if (!r) return;
    $("whoName").textContent = r.name;
    $("who").title = "Reviewer: " + r.name;
  }
  function enableButtons(on) { for (const id of ["loadBtn", "dlBtn", "prevBtn", "nextBtn", "todoBtn"]) $(id).disabled = !on; }
  $("switchBtn").onclick = async () => {
    if (RELAY) return enter();
    const r = await openSession(true);
    if (r) await startSession(r);
  };

  // ---------------------------------------------------------------- the questions
  const qrows = [];
  function buildQuestions() {
    const L = $("qlist");
    L.replaceChildren();
    G.questions.forEach((q, qi) => {
      const row = el("div", "q");
      row.dataset.q = q.id;
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", "Question " + (qi + 1) + ": " + plain(q.title));
      const h = el("div", "qh");
      h.title = plain(q.title);
      h.append(el("span", "qn", String(qi + 1)), el("span", "qt", q.short || plain(q.title)), el("span", "qna", "N/A"));
      h.onclick = () => setActive(qi);
      const o = el("div", "opts");
      o.style.setProperty("--n", q.options.length);
      if (q.options.length > 5) { o.classList.add("many"); row.classList.add("many"); }   // Q2: one row, or 4 + 3 when the panel is narrow (style.css)
      const btns = {};
      for (const op of q.options) {
        const b = el("button", "opt" + (op.issue ? " issue" : ""));
        b.type = "button";
        b.append(el("kbd", null, op.key), el("span", null, op.label), el("i", "aib", "AI"));
        b.title = b.dataset.t = op.label + " (key " + op.key + "): " + plain(op.help);
        b.onclick = () => answer(qi, op.code);
        o.append(b);
        btns[op.code] = b;
      }
      row.append(h, o);
      L.append(row);
      qrows.push({ row, btns });
    });
  }
  let defsOn = lsGet(LS + "defs") !== "0";         // the answer definitions under the questions, unless hidden
  function renderHelp() {
    const H = $("qhelp"), q = G.questions[active], id = cases[cur].id, v = shownView(id)[q.id], s = aiOf(id);
    const tog = el("button", "mini tog", defsOn ? "Hide help" : "Show help");
    tog.type = "button";
    tog.title = "The help and the answer definitions of the highlighted question (also shown when you point at an answer)";
    tog.onclick = () => { defsOn = !defsOn; lsSet(LS + "defs", defsOn ? "1" : "0"); renderHelp(); };
    H.replaceChildren(tog, el("div", "ht", "Q" + (active + 1) + ". " + plain(q.title)), rich(el("div", "hh"), q.help));
    H.classList.toggle("compact", !defsOn);
    H.title = defsOn ? "" : plain(q.help);
    if (!defsOn) return;
    const ul = el("ul", "ho");
    for (const op of q.options) {
      const li = el("li", v === op.code ? "sel" : "");
      li.append(el("kbd", null, op.key), el("b", null, op.label), rich(el("span"), op.help));
      if (s && s[q.id] === op.code) li.append(el("i", "aib", "AI"));
      ul.append(li);
    }
    H.append(ul);
  }
  function renderQuestions() {
    const id = cases[cur].id, a = curRec(), vw = shownView(id), s = aiOf(id), x = AI && AI.answers[id];
    G.questions.forEach((q, qi) => {
      const v = (a && a[q.id]) || "", sk = skipped(q, vw), r = qrows[qi];
      const sug = !v && !sk ? vw[q.id] : "";          // the AI's answer, not confirmed yet
      const mark = s && !sk ? s[q.id] : "";           // the AI's answer, also once the reviewer chose
      r.row.classList.toggle("skip", sk);
      r.row.classList.toggle("ok", !!v && !sk);
      r.row.classList.toggle("sug", !!sug);
      r.row.classList.toggle("on", qi === active && !sk);
      for (const code of Object.keys(r.btns)) {
        const b = r.btns[code];
        b.classList.toggle("sel", v === code);
        b.classList.toggle("ai", sug === code);
        b.classList.toggle("aimark", mark === code);
        b.disabled = sk;
        b.setAttribute("aria-pressed", v === code ? "true" : "false");
        const n = x && x.agree && Number(x.agree[q.id]);
        b.title = b.dataset.t + (mark === code ? " · The AI's answer" + (n && AI.runs ? " (" + n + " of " + AI.runs + " runs)" : "") +
          (v ? "" : ", not confirmed yet") : "");
      }
    });
    renderAi();
    renderHelp();
    const on = qrows[active] && qrows[active].row, box = $("qs");
    if (on && box.scrollHeight > box.clientHeight) {
      const rb = on.getBoundingClientRect(), bb = box.getBoundingClientRect();
      if (rb.top < bb.top) box.scrollTop -= bb.top - rb.top + 4;
      else if (rb.bottom > bb.bottom) box.scrollTop += rb.bottom - bb.bottom + 4;
    }
  }
  // Skip logic follows what the case shows (the reviewer's answers, else the AI's); "answered" means by the reviewer.
  function firstOpen(id) {
    const a = ann[id], v = shownView(id);
    const k = G.questions.findIndex((q) => !skipped(q, v) && !(a && a[q.id]));
    return k < 0 ? 0 : k;
  }
  function nextActive(qi, id) {                     // the next unanswered question after this one (wrapping), else the next one
    const n = G.questions.length, a = ann[id] || {}, v = shownView(id);
    for (let d = 1; d < n; d++) { const j = (qi + d) % n, q = G.questions[j]; if (!skipped(q, v) && !a[q.id]) return j; }
    for (let j = qi + 1; j < n; j++) if (!skipped(G.questions[j], v)) return j;
    return qi;
  }
  function setActive(qi) {
    if (!session || skipped(G.questions[qi], shownView(cases[cur].id))) return;
    active = qi;
    renderQuestions();
  }
  function moveActive(d) {
    const v = shownView(cases[cur].id);
    let j = active;
    do { j += d; } while (j >= 0 && j < G.questions.length && skipped(G.questions[j], v));
    if (j >= 0 && j < G.questions.length) { active = j; renderQuestions(); }
  }
  function answer(qi, code) {
    if (!session) return;
    const id = cases[cur].id, q = G.questions[qi];
    if (skipped(q, shownView(id)) || !OPT[q.id][code]) return;
    const a = ensureRec(id), was = isComplete(a);
    a[q.id] = code;
    applySkip(a);
    a.annotated_at = isoNow();
    touch(id);
    active = nextActive(qi, id);
    changed();
    renderQuestions(); renderState(); renderList(); renderProgress();
    if (!was && isComplete(a)) completed(a);
  }
  // Confirm (Enter): the AI's answers the reviewer has not changed become the reviewer's; the case is then complete
  function confirmCase() {
    if (!session) return;
    const id = cases[cur].id;
    if (!aiOf(id)) return toast("This case has no AI answers: please answer the questions");
    const v = shownView(id);
    let a = ann[id];
    if (isComplete(a)) return completed(a);         // confirmed already: on to the next case still to do
    const k = G.questions.findIndex((q) => q.required && !skipped(q, v) && !v[q.id]);
    if (k >= 0) {
      active = k;
      renderQuestions();
      return toast("Question " + (k + 1) + " has no AI answer: please answer it, then confirm", false, 4000);
    }
    a = ensureRec(id);
    for (const q of QIDS) if (!a[q]) a[q] = v[q];
    applySkip(a);
    a.annotated_at = isoNow();
    touch(id);
    changed();
    renderQuestions(); renderState(); renderList(); renderProgress();
    if (isComplete(a)) completed(a);
  }
  function renderAi() {
    const id = cases[cur].id, s = aiOf(id), box = $("aibox");
    box.hidden = !s;
    if (!s) return;
    const x = AI && AI.answers[id], a = ann[id], done = isComplete(a);
    const model = (a && a.ai && a.ai_model) || (AI && AI.model) || "an AI model";
    const why = (x && x.note) || "(none given)";
    $("aiNote").textContent = why;
    $("aiText").title = "AI's reasoning: " + why;
    $("aiTag").title = "Answers pre-filled by " + model + (AI && AI.runs > 1 ? " (the most frequent answer of " + AI.runs + " runs)" : "") +
      ". Check every answer, change any that is wrong, then confirm.";
    const b = $("confirmBtn");
    b.disabled = done;
    b.firstChild.textContent = done ? "Confirmed" : "Confirm";
    b.title = done ? "You have confirmed every answer of this case" : "Keep the AI's answers you did not change and go to the next case (Enter)";
  }
  function answerKey(k) {
    if (skipped(G.questions[active], shownView(cases[cur].id))) { active = firstOpen(cases[cur].id); renderQuestions(); }
    const q = G.questions[active], op = q.options.find((o) => o.key === k);
    if (!op) return toast("Question " + (active + 1) + " has " + q.options.length + " answers: keys 1–" + q.options.length);
    answer(active, op.code);
  }
  let allDoneShown = false;
  function completed(a) {
    if (needsNote(a)) {
      toast("Please write in the note what is identifying and where. Then press Esc, and → for the next case.", false, 8000);
      $("note").focus();
      return;
    }
    const k = nextIncomplete(cur + 1);
    if (k < 0) return allDone();
    toast("Case " + (cur + 1) + " annotated", false, 1300);
    go(k);
  }
  async function allDone() {
    if (allDoneShown) return;
    allDoneShown = true;
    const v = await ask("All cases are annotated — thank you!", [
      me ? "Your annotations are saved. Downloading a copy is optional."
        : "Please download your annotations and send the JSON file back to us." + (server.on ? " A copy is also in the results folder." : ""),
      "You can still click any case on the left to look at it again or change it."],
    [{ label: "Close", value: false, cancel: true }, { label: "Download annotations", value: true, primary: true }]);
    if (v) doExport("json");
  }

  // ---------------------------------------------------------------- the note
  let noteTimer = 0, noteFor = null;
  $("note").maxLength = NOTE_MAX;
  $("note").addEventListener("input", () => {
    if (!session) return;
    noteFor = cases[cur].id;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(flushNote, 500);
  });
  $("note").addEventListener("blur", () => flushNote());
  function flushNote() {
    clearTimeout(noteTimer);
    if (!noteFor || !session) { noteFor = null; return; }
    const id = noteFor;
    noteFor = null;
    const a = ensureRec(id), v = $("note").value.slice(0, NOTE_MAX);
    if ((a.note || "") === v) return;
    a.note = v;
    a.annotated_at = isoNow();
    touch(id);
    changed();
    if (cases[cur].id === id) { renderState(); renderList(); renderProgress(); }
  }

  // ---------------------------------------------------------------- case view
  function go(k) {
    if (!session || k < 0 || k >= N) return;
    if (document.activeElement === $("note")) $("note").blur();
    flushNote(); saveTime();
    if (k !== cur) { cur = k; active = firstOpen(cases[cur].id); }
    renderCase();
    record.last_case = cases[cur].id;
  }
  function renderCase() {
    if (!session) return;
    const c = cases[cur], a = ann[c.id];
    $("caseTitle").textContent = "Case " + (cur + 1) + " / " + N;
    $("caseId").textContent = c.id;
    if (shown !== c.id) {                           // a new case: image, texts, audio
      shown = c.id;
      showImage(c);
      $("caption").textContent = String(c.caption || "").trim() || "(no description)";
      renderTranscript();
      loadAudio();
      $("texts").scrollTop = 0;
      $("transcript").scrollTop = 0;
      $("caption").parentElement.scrollTop = 0;
      $("qs").scrollTop = 0;
      const nx = cases[cur + 1];
      if (enc.on) {                                 // free what is far away; decrypt the next case in advance
        keepBlobs();
        if (nx) for (const kind of ["image", "audio"]) if (nx[kind]) blobFor(nx, kind).catch(() => {});
      } else if (nx && nx.image) new Image().src = mediaUrl(nx.image);   // preload the next image
    }
    if (document.activeElement !== $("note")) $("note").value = (a && a.note) || "";
    if (skipped(G.questions[active], shownView(c.id))) active = firstOpen(c.id);
    $("prevBtn").disabled = cur === 0;
    $("nextBtn").disabled = cur === N - 1;
    renderState(); renderQuestions(); renderList(); renderProgress();
  }
  function renderState() {
    const s = status(cases[cur].id), e = $("caseState");
    e.className = "state " + s;
    e.textContent = STATE_TEXT[s];
  }
  function renderList() {
    const L = $("list");
    L.replaceChildren();
    let n = 0;
    cases.forEach((c, k) => {
      const s = status(c.id), done = s === "done" || s === "flag";
      if ((filt === "todo" && done) || (filt === "done" && !done) || (filt === "flag" && s !== "flag")) return;
      const b = el("button", "c " + s + (k === cur ? " cur" : ""), String(k + 1));
      b.type = "button";
      b.title = c.id + " · " + STATE_TEXT[s];
      b.setAttribute("role", "listitem");
      b.onclick = () => go(k);
      L.append(b);
      n++;
    });
    if (!n) L.append(el("div", "none", filt === "flag" ? "No flagged cases." : filt === "done" ? "No cases done yet." : "Nothing left to do."));
    const x = L.querySelector(".cur");
    if (x) {
      const rb = x.getBoundingClientRect(), lb = L.getBoundingClientRect();
      if (rb.top < lb.top) L.scrollTop -= lb.top - rb.top + 4;
      else if (rb.bottom > lb.bottom) L.scrollTop += rb.bottom - lb.bottom + 4;
    }
  }
  function renderProgress() {
    let done = 0, flag = 0;
    const times = [];
    for (const c of cases) {
      const s = status(c.id);
      if (s === "done" || s === "flag") { done++; times.push(Number(ann[c.id].time_spent_s) || 0); }
      if (s === "flag") flag++;
    }
    $("pDone").textContent = done + " / " + N;
    $("pBar").style.width = (N ? (100 * done) / N : 0) + "%";
    $("pFlag").textContent = flag;
    $("pLeft").textContent = N - done;
    const med = median(times.filter((t) => t > 0));
    $("pMed").textContent = med ? Math.round(med) + " s" : "–";
    $("pEta").textContent = med && N - done ? "≈ " + fmtLeft(med * (N - done)) + " left" : "";
  }

  // ---------------------------------------------------------------- the image: scroll to zoom at the pointer, drag to move
  // v.s is the zoom over the fitted image (1 = fits the frame); v.x, v.y its top-left corner in the frame.
  function makeView(stage, img, resetBtn) {
    let v = { s: 1, x: 0, y: 0 }, drag = null;
    function apply() {
      const W = stage.clientWidth, H = stage.clientHeight;
      if (!img.naturalWidth || !W || !H) return;
      const k = Math.min(W / img.naturalWidth, H / img.naturalHeight), fw = img.naturalWidth * k, fh = img.naturalHeight * k;
      img.style.width = fw + "px";
      img.style.height = fh + "px";
      v.s = Math.min(8, Math.max(1, v.s));
      // along each side: centred while the image is smaller than the frame, else no empty space at its edges
      const place = (p, size, frame) => (size <= frame ? (frame - size) / 2 : Math.min(0, Math.max(frame - size, p)));
      v.x = place(v.x, fw * v.s, W);
      v.y = place(v.y, fh * v.s, H);
      img.style.transform = "translate(" + v.x + "px," + v.y + "px) scale(" + v.s + ")";
      if (resetBtn) resetBtn.disabled = v.s === 1;
    }
    function reset() { v = { s: 1, x: 0, y: 0 }; apply(); }
    function zoomAt(f, px, py) {
      const s = Math.min(8, Math.max(1, v.s * f));
      v.x = px - ((px - v.x) * s) / v.s;
      v.y = py - ((py - v.y) * s) / v.s;
      v.s = s;
      apply();
    }
    stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);   // ctrlKey: a trackpad pinch
    }, { passive: false });
    stage.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX - v.x, y: e.clientY - v.y };
      stage.setPointerCapture(e.pointerId);
      stage.classList.add("drag");
    });
    stage.addEventListener("pointermove", (e) => { if (drag) { v.x = e.clientX - drag.x; v.y = e.clientY - drag.y; apply(); } });
    const end = () => { drag = null; stage.classList.remove("drag"); };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);
    stage.addEventListener("dblclick", reset);
    img.addEventListener("load", reset);
    if (window.ResizeObserver) new ResizeObserver(() => apply()).observe(stage); else addEventListener("resize", apply);
    return { apply, reset, zoom: (f) => zoomAt(f, stage.clientWidth / 2, stage.clientHeight / 2) };
  }
  const view = makeView($("stage"), $("img"), $("resetBtn"));
  const vview = makeView($("vstage"), $("vimg"), $("vReset"));
  function showImage(c) {
    const img = $("img"), m = $("imgMsg");
    m.hidden = true;
    img.style.visibility = "";
    const src = enc.on ? (c.image ? readyBlob(c, "image") : "") : mediaUrl(c.image);
    if (!c.image || (!src && !enc.on)) {
      img.removeAttribute("src");
      m.textContent = "No image for this case.";
      m.hidden = false;
      return;
    }
    if (src) { if (img.getAttribute("src") !== src) img.src = src; else view.reset(); return; }
    // encrypted, not decrypted yet: a placeholder until it is (the case may have changed by then)
    img.removeAttribute("src");
    m.textContent = "Loading the image…";
    m.hidden = false;
    blobFor(c, "image").then((url) => { if (shown === c.id) img.src = url; }, (x) => {
      if (shown !== c.id) return;
      m.textContent = "This image could not be loaded (" + x.message + "). Please check the internet connection, then go to another case and back to try again.";
      m.hidden = false;
    });
  }
  $("img").addEventListener("error", () => {
    const img = $("img");
    if (!img.getAttribute("src")) return;
    img.style.visibility = "hidden";
    $("imgMsg").textContent = enc.on ? "This image could not be shown (the decrypted file is not a valid image)."
      : "This image could not be loaded (" + img.getAttribute("src") + "). Please check that the whole folder was unzipped.";
    $("imgMsg").hidden = false;
  });
  $("img").addEventListener("load", () => { $("img").style.visibility = ""; $("imgMsg").hidden = true; });
  $("resetBtn").onclick = () => view.reset();
  function openViewer() {
    if (!$("img").getAttribute("src") || $("img").style.visibility === "hidden") return;
    $("vimg").src = $("img").src;
    $("viewer").hidden = false;
    requestAnimationFrame(() => vview.reset());
  }
  const closeViewer = () => { $("viewer").hidden = true; };
  $("fullBtn").onclick = openViewer;
  $("vClose").onclick = closeViewer;
  $("vReset").onclick = () => vview.reset();

  // ---------------------------------------------------------------- narration: transcript and audio
  let showOrig = lsGet(LS + "orig") === "1";
  function renderTranscript() {
    const c = cases[cur], lang = String(c.lang || "").trim().toLowerCase();
    const en = String(c.transcript_en || "").trim(), orig = String(c.transcript || "").trim();
    const foreign = !!lang && lang !== "en", T = $("transcript");
    $("origBtn").hidden = !(foreign && orig && en);
    $("origBtn").textContent = showOrig ? "Show English" : "Show original";
    let text, tl = "en", info = "";
    if (foreign && orig && (showOrig || !en)) {
      text = orig; tl = lang;
      info = langName(lang) + (en ? " · original transcript" : " · original transcript (no English translation)");
    } else {
      text = en || orig;
      if (foreign) info = langName(lang) + " · machine translation to English";
    }
    $("langInfo").textContent = info;
    T.classList.toggle("empty", !text);
    T.setAttribute("dir", "auto");
    T.lang = text ? tl : "en";
    T.textContent = text || (mediaUrl(c.audio) ? "No transcript available — use the audio."
      : "No transcript and no audio for this case: answer Q5 with “Can't judge”.");
  }
  function toggleOrig() {
    if ($("origBtn").hidden) return toast("The transcript of this case is in English");
    showOrig = !showOrig;
    lsSet(LS + "orig", showOrig ? "1" : "0");
    renderTranscript();
  }
  $("origBtn").onclick = toggleOrig;

  const audio = $("audio");
  const RATES = [1, 1.5, 2];
  let rate = RATES.includes(Number(lsGet(LS + "speed"))) ? Number(lsGet(LS + "speed")) : 1;
  const PLAY = '<path d="M7 4.5v15l13-7.5z"/>', PAUSE = '<path d="M6 4.5h4v15H6zM14 4.5h4v15h-4z"/>';
  let audioState = "none";                          // none | loading (being decrypted) | error | ready
  function setAudio(src, msg, state) {
    $("player").classList.toggle("off", !src);
    $("noAudio").hidden = !!src;
    $("noAudio").textContent = msg || "No audio for this case";
    audioState = src ? "ready" : state || "none";
    if (src) audio.src = src; else audio.removeAttribute("src");
    audio.load();
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
    playerUI();
  }
  function loadAudio() {
    const c = cases[cur];
    audio.pause();
    if (!enc.on) return setAudio(mediaUrl(c.audio));
    if (!c.audio) return setAudio("");
    const ready = readyBlob(c, "audio");
    if (ready) return setAudio(ready);
    setAudio("", "Loading the audio…", "loading");
    blobFor(c, "audio").then((url) => { if (shown === c.id) setAudio(url); },
      (x) => { if (shown === c.id) setAudio("", "The audio could not be loaded (" + x.message + ")", "error"); });
  }
  function playerUI() {
    const c = cases[cur];
    const d = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Number(c && c.duration_s) || 0;
    $("trackFill").style.width = d ? Math.min(100, (100 * audio.currentTime) / d) + "%" : "0%";
    $("pTime").textContent = fmtClock(audio.currentTime) + " / " + fmtClock(d);
    $("playIcon").innerHTML = audio.paused ? PLAY : PAUSE;
    $("playBtn").setAttribute("aria-label", audio.paused ? "Play" : "Pause");
    $("playBtn").title = (audio.paused ? "Play" : "Pause") + " (Space)";
    document.querySelectorAll("#speed button").forEach((b) => b.classList.toggle("on", Number(b.dataset.r) === rate));
  }
  for (const ev of ["play", "pause", "timeupdate", "loadedmetadata", "durationchange", "ended", "emptied", "ratechange"]) audio.addEventListener(ev, playerUI);
  audio.addEventListener("error", () => {
    if (!audio.getAttribute("src")) return;
    audioState = "error";
    $("player").classList.add("off");
    $("noAudio").textContent = "The audio could not be loaded";
    $("noAudio").hidden = false;
  });
  function togglePlay() {
    if (!audio.getAttribute("src") || $("player").classList.contains("off")) {
      return toast(audioState === "loading" ? "The audio is still loading" : audioState === "error" ? "The audio could not be loaded" : "No audio for this case");
    }
    if (audio.paused) audio.play().catch(() => toast("The audio could not be played", true));
    else audio.pause();
  }
  function setRate(r) {
    rate = r;
    audio.defaultPlaybackRate = r;
    audio.playbackRate = r;
    lsSet(LS + "speed", String(r));
    playerUI();
  }
  $("playBtn").onclick = togglePlay;
  $("speed").addEventListener("click", (e) => { const b = e.target.closest("button[data-r]"); if (b) setRate(Number(b.dataset.r)); });
  let seeking = false;
  function seekTo(e) {
    const r = $("track").getBoundingClientRect(), d = audio.duration;
    if (!Number.isFinite(d) || !d || !r.width) return;
    audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * d;
    playerUI();
  }
  $("track").addEventListener("pointerdown", (e) => { seeking = true; $("track").setPointerCapture(e.pointerId); seekTo(e); });
  $("track").addEventListener("pointermove", (e) => { if (seeking) seekTo(e); });
  $("track").addEventListener("pointerup", () => (seeking = false));
  $("track").addEventListener("pointercancel", () => (seeking = false));

  // ---------------------------------------------------------------- time per case
  // The clock of the open case runs while the session is on, the tab is visible, no session/welcome dialog is open,
  // and there was a key, mouse or wheel event in the last IDLE_MS (or the audio plays). Saved as time_spent_s.
  let lastTick = Date.now(), lastAct = Date.now(), timeDirty = false, lastMove = 0;
  const act = () => { lastAct = Date.now(); };
  for (const t of ["keydown", "pointerdown", "wheel", "input"]) addEventListener(t, act, { capture: true, passive: true });
  addEventListener("pointermove", () => { const n = Date.now(); if (n - lastMove > 1000) { lastMove = n; act(); } }, { capture: true, passive: true });
  function clockRuns(now) {
    return session && N > 0 && document.visibilityState === "visible" && $("sessBox").hidden && $("relayBox").hidden && $("welcomeBox").hidden &&
      (now - lastAct < IDLE_MS || !audio.paused);
  }
  setInterval(() => {
    const now = Date.now(), dt = Math.min(Math.max(now - lastTick, 0), 5000);
    lastTick = now;
    if (!clockRuns(now)) return;
    const a = ensureRec(cases[cur].id);
    a.time_spent_s = (Number(a.time_spent_s) || 0) + dt / 1000;
    touch(cases[cur].id);
    timeDirty = true;
  }, 1000);
  function saveTime() { if (timeDirty && session) { timeDirty = false; persist(); } }
  setInterval(() => { if (timeDirty) { saveTime(); renderProgress(); } }, 15000);
  document.addEventListener("visibilitychange", () => {
    lastTick = Date.now();
    if (document.visibilityState === "hidden" && session) { flushNote(); saveTime(); if (server.on && server.dirty) putNow(); }
  });

  // ---------------------------------------------------------------- page closing, other tabs
  let leaving = false;                              // the page reloads on purpose (Lock): no unload warning
  addEventListener("beforeunload", (e) => {
    if (!session) return;
    flushNote(); saveTime();
    putKeepalive();
    // no audit server (or it fails): warn when there are answers that were never exported; with the relay, when
    // some are still waiting to be sent
    if ((me ? obx.length > 0 : unexported() && (!server.on || server.fails > 0)) && !leaving) {
      const msg = me ? "Some annotations are not saved to the lab yet. They stay saved in this browser." : "Some annotations were not downloaded yet. They stay saved in this browser.";
      e.preventDefault();
      e.returnValue = msg;
      return msg;
    }
  });
  addEventListener("pagehide", () => { if (session) { flushNote(); saveTime(); } });
  addEventListener("storage", (e) => {             // the same rater in another tab: merge, newer answer per case wins
    if (!session || e.key !== storeKey || !e.newValue) return;
    let other;
    try { other = JSON.parse(e.newValue); } catch (x) { return; }
    if (!other || !other.annotations || typeof other.annotations !== "object") return;
    const res = mergeIn(other.annotations);
    // write back only when this tab has something the other copy lacks (so that two tabs settle, not ping-pong)
    const theirs = other.annotations;
    const more = Object.keys(ann).some((id) => hasContent(ann[id]) && (!theirs[id] || tms(ann[id].annotated_at) > tms(theirs[id].annotated_at)));
    if (res.taken) { record.rev = Math.max(record.rev || 0, other.rev || 0) + 1; renderCase(); }
    if (res.taken || more) persist();
    banner("This page is open in another tab or window too. Annotations are merged, but please work in one tab only.");
  });

  // ---------------------------------------------------------------- keyboard
  document.addEventListener("mousedown", (e) => {
    // keep the keyboard focus off buttons (Space and the number keys stay shortcuts), and leave the note box
    const b = e.target && e.target.closest && e.target.closest("button");
    if (!b || b.closest(".modal")) return;
    e.preventDefault();
    const f = document.activeElement;
    if (f && /^(TEXTAREA|INPUT|SELECT)$/.test(f.tagName)) f.blur();
  }, true);
  document.addEventListener("keydown", (e) => {
    const t = e.target, tag = t && t.tagName;
    const typing = tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT" || (t && t.isContentEditable);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && !e.shiftKey && (e.key === "s" || e.key === "S")) {      // Ctrl+S: Export JSON
      e.preventDefault();
      if (session && !topModal()) doExport("json");
      return;
    }
    if (typing) {                                   // typing in the note (or a form): no shortcuts; Esc leaves the box
      if (e.key === "Escape" && !topModal()) { e.preventDefault(); t.blur(); }
      return;
    }
    const m = topModal();
    if (m) { if (e.key === "Escape") { e.preventDefault(); closeBox(m); } return; }
    if (!$("viewer").hidden) {
      const k = e.key.toLowerCase();
      if (k === "escape" || k === "f" || k === "enter") closeViewer();
      else if (k === "+" || k === "=") vview.zoom(1.25);
      else if (k === "-" || k === "_") vview.zoom(0.8);
      else if (k === "0" || k === "r") vview.reset();
      else return;
      e.preventDefault();
      return;
    }
    if (!session || mod || e.altKey) return;
    const k = e.key;
    if (k.length === 1 && k >= "1" && k <= "9") { e.preventDefault(); if (!e.repeat) answerKey(k); return; }
    let done = true;
    switch (k) {
      case "ArrowUp": moveActive(-1); break;
      case "ArrowDown": moveActive(1); break;
      case "ArrowLeft": go(cur - 1); break;
      case "ArrowRight": go(cur + 1); break;
      case " ": if (!e.repeat) togglePlay(); break;
      case "?": openHelp(); break;
      // a focused button keeps its Enter; with AI answers Enter confirms the case (F: full size), else full size
      case "Enter": if (tag === "BUTTON") done = false; else if (AI) confirmCase(); else openViewer(); break;
      case "+": case "=": view.zoom(1.25); break;
      case "-": case "_": view.zoom(0.8); break;
      case "0": view.reset(); break;
      default:
        switch (k.toLowerCase()) {
          case "n": nextTodo(); break;
          case "s": setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length]); toast("Audio speed " + rate + "×", false, 1000); break;
          case "t": toggleOrig(); break;
          case "e": $("note").focus(); break;
          case "f": openViewer(); break;
          case "r": view.reset(); break;
          case "g": openHelp(); break;
          case "escape": break;
          default: {
            const dm = /^Digit([1-9])$/.exec(e.code || "");
            if (dm && !e.repeat) answerKey(dm[1]); else if (!dm) done = false;
          }
        }
    }
    if (done) e.preventDefault();
  });
  function nextTodo() {
    if (!session) return;
    const k = nextIncomplete(cur + 1);
    if (k < 0) return toast("All cases are annotated");
    if (k === cur) return toast("This is the only case still to do");
    go(k);
  }

  // ---------------------------------------------------------------- buttons
  $("prevBtn").onclick = () => go(cur - 1);
  $("nextBtn").onclick = () => go(cur + 1);
  $("todoBtn").onclick = nextTodo;
  $("confirmBtn").onclick = confirmCase;
  $("dlBtn").onclick = openDownload;
  $("dlJson").onclick = () => doExport("json");
  $("dlCsv").onclick = () => doExport("csv");
  $("dlXlsx").onclick = () => doExport("xlsx");
  $("dlClose").onclick = () => closeBox($("dlBox"));
  $("loadBtn").onclick = () => { if (session) $("loadFile").click(); };
  $("loadFile").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (f && session) loadFile(f);
  });
  function openHelp() {
    rich($("gStore"), me
      ? "Your annotations are saved automatically under your name (**" + me.name.replace(/\*/g, "") + "**), as you make them. To continue on another computer, open this page there and type the same name. Others see only how many cases you have annotated, never your annotations. **Download annotations** gives you a copy."
      : server.on
      ? "Your annotations are saved automatically in this browser and in the results folder on this computer. You can close the page and continue later by typing the same name. At the end of each sitting, and when you finish, click **Download annotations** and send us the JSON file. **Load annotations** adds annotations from a file downloaded earlier; for each case the newer annotation is kept."
      : "Your annotations are kept in this browser on this computer only; nothing is uploaded. You can close the page and continue later in the same browser by typing the same name. At the end of each sitting, and when you finish, click **Download annotations** and send us the JSON file. To continue on another computer, download the annotations here, then use **Load annotations** there; for each case the newer annotation is kept.");
    openBox("helpBox", "gOk");
  }
  $("help").onclick = openHelp;
  $("gOk").onclick = () => closeBox($("helpBox"));
  document.querySelectorAll("#filter button").forEach((b) => (b.onclick = () => {
    filt = b.dataset.f;
    document.querySelectorAll("#filter button").forEach((x) => x.classList.toggle("on", x === b));
    if (session) renderList();
  }));
  $("goto").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const g = $("goto"), v = g.value.trim();
    if (!v || !session) return;
    let k = -1;
    if (/^\d+$/.test(v) && +v >= 1 && +v <= N) k = +v - 1;
    else {
      const u = v.toUpperCase(), ids = cases.map((c) => c.id.toUpperCase());
      k = ids.indexOf(u);
      if (k < 0) k = ids.findIndex((x) => x.startsWith(u));
      if (k < 0) k = ids.findIndex((x) => x.includes(u));
    }
    if (k < 0) { g.classList.add("bad"); setTimeout(() => g.classList.remove("bad"), 900); return; }
    g.value = "";
    g.blur();
    go(k);
  });

  // ---------------------------------------------------------------- bright or dark: the eye at the top left switches
  // Bright by default, whatever the computer's setting; the choice is kept per browser and set on <html data-theme>
  // before the page draws (index.html). The eye says what it switches to, not what the page is.
  const ICON = {
    moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  };
  const darkNow = () => document.documentElement.dataset.theme === "dark";
  function themeButton() {
    const to = darkNow() ? "bright" : "dark";
    $("themecap").textContent = "Switch to " + to;
    $("themebadge").innerHTML = to === "dark" ? ICON.moon : ICON.sun;
    $("theme").title = "Switch to " + to;
    $("theme").setAttribute("aria-label", $("theme").title);
  }
  $("theme").onclick = () => {
    const t = darkNow() ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    lsSet(LS + "theme", t);
    themeButton();
  };

  // ---------------------------------------------------------------- texts from guidelines.js
  function buildTexts() {
    // the headline, the sentence under it, the introduction, the guidelines in short (as Retify's guidelines.json)
    $("question").textContent = plain(G.question) || "Ophthalmic image–description audit";
    rich($("task"), G.task || "");
    $("task").title = plain(G.task);
    rich($("gIntro"), G.intro);
    rich($("wIntro"), G.welcome || G.intro);
    rich($("wRules"), G.in_short || "");
    $("gNotes").replaceChildren(...(G.notes || []).map((t) => rich(el("li"), t)));
    if (AI) {                                       // AI pre-filled answers: the welcome, How to and the keys say so
      rich($("wAnswer"), "Each case opens with the **7 answers pre-filled by an AI**, marked **AI** and lighter than yours. Check each one: click (or press the number of) the right answer wherever the AI is wrong. Then press **Enter** (or **Confirm**) to keep the rest; the next case opens.");
      rich($("gAi"), "**Answers pre-filled by an AI.** Each case opens with the answers of an AI model (" + AI.model.replace(/\*/g, "") + ") already chosen: they are marked **AI**, lighter and dashed, and the AI's short reasoning is under the questions. The AI is often wrong: check every answer against the image and the narration, and change any that you would not give yourself (click your answer, or press its number). Then press **Enter** or click **Confirm**: the AI's answers you did not change become yours, and the next case opens. A case counts as done only after you confirm it. A small **AI** badge keeps showing which answer the AI gave.");
      $("gAi").hidden = false;
      rich($("kEnterT"), "Confirm the case: keep the AI's answers you did not change; the next case opens");
    }
    $("gRubric").replaceChildren(...G.questions.map((q, qi) => {
      const d = el("div", "rq"), ul = el("ul");
      d.append(el("h4", null, "Q" + (qi + 1) + ". " + plain(q.title)), rich(el("p"), q.help));
      for (const o of q.options) {
        const li = el("li");
        li.append(el("b", null, o.key + " · " + o.label), " ", rich(el("span"), o.help));
        if (o.issue) li.append(el("span", "tag", "flags the case"));
        ul.append(li);
      }
      d.append(ul);
      return d;
    }));
  }

  // ---------------------------------------------------------------- start
  function fatal(title, msg) {
    access = null;
    $("accessBox").hidden = true;
    $("work").hidden = true;
    $("fatal").hidden = false;
    $("fatalTitle").textContent = title;
    $("fatalMsg").textContent = msg;
    $("save").textContent = "Not loaded";
    $("save").className = "save err";
    for (const id of ["loadBtn", "dlBtn"]) $(id).disabled = true;
  }
  function checkManifest(m) {
    if (!m || typeof m !== "object") return enc.on ? "The decrypted case list is not an object." : DATA + "/manifest.js does not define window.AUDIT_MANIFEST.";
    if (!m.manifest_version || typeof m.manifest_version !== "string") return "The case list has no manifest_version.";
    if (!Array.isArray(m.cases) || !m.cases.length) return "The case list is empty.";
    const seen = new Set();
    for (let k = 0; k < m.cases.length; k++) {
      const c = m.cases[k];
      if (!c || typeof c.id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(c.id)) return "Case " + (k + 1) + " has no valid id.";
      if (seen.has(c.id)) return "The case id " + c.id + " appears twice.";
      seen.add(c.id);
    }
    return "";
  }
  async function start(m) {
    M = m; cases = m.cases; N = cases.length;
    byId = new Map(cases.map((c, k) => [c.id, k]));
    AI = enc.on ? null : takeAi(window.AUDIT_AI);   // AI pre-filled answers: plaintext data only
    $("nTotal").textContent = N;
    $("setInfo").textContent = "Version " + M.manifest_version;
    buildQuestions();
    buildTexts();
    let storageOk = lsSet(LS + "probe", "1");
    try { localStorage.removeItem(LS + "probe"); } catch (e) { storageOk = false; }
    if (!storageOk) banner("This browser does not let the page keep your annotations (a private window, or blocked storage). They are kept only while this page is open: please download your annotations often, or open the page in a normal window.");
    if (!window.XLSX) { $("dlXlsx").disabled = true; $("dlXlsx").title = "The Excel file cannot be made here (vendor/xlsx.full.min.js is missing)"; }
    server.on = await ping();
    showSave();
    if (RELAY) {                                    // the lab's relay: the session of this browser, else ask by name
      const st = lsJson(LS + "session");
      if (st && st.id && st.key && st.name && st.relay === RELAY) return join(st);
      return enter();
    }
    const r = await openSession(false);
    if (r) await startSession(r);
  }
  const onSite = /^https?:$/.test(location.protocol);
  function loadManifestScript() {                   // plaintext data: <data>/manifest.js through a <script> tag
    window.AUDIT_MANIFEST = undefined;
    const s = document.createElement("script");
    s.src = DATA + "/manifest.js";
    s.onload = () => {
      const m = window.AUDIT_MANIFEST, err = checkManifest(m);
      if (err) return fatal("The case list is not valid", err);
      // then the AI pre-filled answers, when the data folder has them; without them the page works as before
      window.AUDIT_AI = undefined;
      const t = document.createElement("script"), go = () => start(m).catch((x) => fatal("The page could not start", String((x && x.stack) || x)));
      t.src = DATA + "/ai_prefill.js";
      t.onload = go;
      t.onerror = go;
      document.head.append(t);
    };
    s.onerror = () => fatal("The case list could not be loaded", onSite
      ? "This site has no case list in " + DATA + "/ (neither meta.json with encrypted data nor manifest.js). Please reload the page; if it happens again, contact the study team."
      : "The file " + DATA + "/manifest.js was not found. Please unzip the whole folder and open index.html from inside it (next to index.html there must be app.js, guidelines.js and the " + DATA + " folder).");
    document.head.append(s);
  }

  // Encrypted data: the code in the address (#key=), else a key remembered on this computer, else the access dialog.
  let access = null;                                // while the access dialog waits: {buf: manifest.bin, busy}
  async function tryRaw(raw, buf) {                 // -> {raw, key, m}; null when the key does not open manifest.bin
    const key = await aesKey(raw);
    let plain, m;
    try { plain = await openBuf(key, buf, enc.meta.manifest); } catch (e) { if (e instanceof WrongKey) return null; throw e; }
    try { m = JSON.parse(new TextDecoder().decode(plain)); } catch (e) { throw new Error("the decrypted case list is not valid JSON"); }
    return { raw, key, m };
  }
  function unlocked(got) {
    enc.key = got.key;
    const err = checkManifest(got.m);
    if (err) return fatal("The case list is not valid", err);
    start(got.m).catch((x) => fatal("The page could not start", String((x && x.stack) || x)));
  }
  async function openEncrypted(meta, hashCode) {
    enc.on = true;
    enc.meta = meta;
    const bad = metaProblem(meta);
    if (bad) return fatal("The data could not be opened", DATA + "/meta.json: " + bad + ".");
    enc.v = String(meta.created || meta.dataset);
    if (!window.crypto || !crypto.subtle) {
      return fatal("The data cannot be decrypted here", "Decryption needs a secure connection: please open the page through its https:// address (on this computer, http://127.0.0.1 or http://localhost also work).");
    }
    $("save").textContent = "Opening the case list…";
    let buf;
    try { buf = await getBin(meta.manifest, true); } catch (e) {
      return fatal("The case list could not be loaded", DATA + "/" + meta.manifest + ": " + e.message + ". Please check the internet connection and reload the page.");
    }
    let note = "";
    if (normCode(hashCode)) {
      const got = await tryRaw(await deriveRaw(hashCode), buf);
      if (got) { rememberKey(got.raw); return unlocked(got); }
      note = "The access code in the link does not open the data. Check it and try again.";
    }
    for (const name of keyNames(true)) {
      let raw = null;
      try { raw = b64dec(lsGet(name) || ""); } catch (e) { /* damaged: forgotten below */ }
      const got = raw && raw.length === 32 ? await tryRaw(raw, buf) : null;
      if (got) {
        rememberKey(got.raw);                       // under this dataset's name
        if (note) toast("The code in the link did not open the data; the code remembered on this computer did.", true, 8000);
        return unlocked(got);
      }
      lsDel(name);                                  // a remembered key that fails is forgotten
      if (!note) note = "The access code remembered on this computer does not open the data any more. Please enter the access code.";
    }
    access = { buf, busy: false };
    $("aErr").textContent = note;
    $("aErr").hidden = !note;
    $("aCode").value = "";
    $("save").textContent = "Waiting for the access code";
    showBox("accessBox", $("aCode"));
  }
  async function submitCode(code, fromLink) {
    const a = access;
    if (!a || a.busy) return;
    const err = (msg) => { $("aErr").textContent = msg; $("aErr").hidden = false; $("aCode").focus(); $("aCode").select(); };
    if (!normCode(code)) return err("Please enter the access code.");
    a.busy = true;
    $("aGo").disabled = true;
    $("aGo").textContent = "Checking…";
    $("aErr").hidden = true;
    let got = null, fail = "";
    try { got = await tryRaw(await deriveRaw(code), a.buf); } catch (e) { fail = "The data could not be opened: " + e.message; }
    $("aGo").disabled = false;
    $("aGo").textContent = "Open";
    a.busy = false;
    if (access !== a) return;                       // the page gave up meanwhile (fatal)
    if (!got) return err(fail || (fromLink ? "The access code in the link does not open the data. Check it and try again." : WRONG_CODE));
    access = null;
    $("accessBox").hidden = true;
    $("aCode").value = "";
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if (fromLink || $("aRemember").checked) rememberKey(got.raw); else forgetKeys(false);
    unlocked(got);
  }
  $("accessForm").addEventListener("submit", (e) => { e.preventDefault(); submitCode($("aCode").value, false); });
  function takeHashCode() {                         // #key=<access code>: read once, then removed from the address
    const m = /^#(?:.*&)?key=([^&]*)/.exec(location.hash || "");
    if (!m) return "";
    let code = m[1];
    try { code = decodeURIComponent(code.replace(/\+/g, " ")); } catch (e) { /* used as it is */ }
    try { history.replaceState(history.state, "", location.pathname + location.search); } catch (e) { /* file:// */ }
    return code;
  }
  addEventListener("hashchange", () => {            // a #key= link opened in a tab that already shows the page
    const code = takeHashCode();
    if (code && access) submitCode(code, true);
  });
  async function lockPage() {                       // forget the code on this computer; the page asks for it again
    const ok = await ask("Lock this page?", ["The access code is forgotten on this computer: the page asks for it again, now and next time.",
      "Your answers stay saved in this browser."], [{ label: "Cancel", value: false, cancel: true }, { label: "Lock", value: true, primary: true }]);
    if (!ok) return;
    if (session) { flushNote(); saveTime(); persist(); }
    forgetKeys(true);
    leaving = true;
    location.reload();
  }
  $("sLock").onclick = lockPage;

  async function boot() {
    themeButton();
    enableButtons(false);
    const hashCode = takeHashCode();                // first of all: the code leaves the address bar
    if (!G || !Array.isArray(G.questions)) return fatal("The rubric could not be loaded", "guidelines.js is missing or damaged. Please unzip the whole folder again and open index.html from inside it.");
    const ids = G.questions.map((q) => q.id).join(", ");
    if (ids !== QIDS.join(", ")) return fatal("The rubric does not match this page", "guidelines.js has the questions " + ids + "; this page expects " + QIDS.join(", ") + ".");
    for (const q of G.questions) { OPT[q.id] = {}; for (const o of q.options) OPT[q.id][o.code] = o; }
    if (!DATA_OK) return fatal("Unsupported data folder", "?data= must be a folder relative to index.html (got “" + DATA + "”).");
    if (onSite && CFG.encrypted !== false) {                                   // served over http(s): encrypted data when <data>/meta.json says so
      let meta = null;
      try {
        const r = await fetch(DATA + "/meta.json", { cache: "no-cache" });
        if (r.ok) meta = await r.json().catch(() => null);
      } catch (e) {
        return fatal("The page could not reach its data", "Please check the internet connection and reload the page.");
      }
      if (meta && typeof meta === "object" && meta.format === ENC_FORMAT) return openEncrypted(meta, hashCode);
      if (meta && typeof meta === "object" && typeof meta.format === "string" && meta.format.startsWith("ophth-audit-enc-")) {
        return fatal("The data could not be opened", DATA + "/meta.json has the format “" + meta.format + "”, which this page does not know. Please reload the page (an updated page may be waiting).");
      }
    }
    loadManifestScript();                           // file://, or a site with plaintext data (serve.py)
  }
  addEventListener("error", (e) => { if (e && e.message) toast("Unexpected error: " + e.message + " (your answers are saved)", true, 8000); });
  addEventListener("unhandledrejection", (e) => { toast("Unexpected error: " + ((e.reason && e.reason.message) || e.reason) + " (your answers are saved)", true, 8000); });

  // a few internals for the tests in ../tests (not used by the page)
  window.AUDIT_APP = {
    slugify, mediaUrl, isoNow, normCode, csvText: () => csvText(exportObject()), exportObject: () => exportObject(),
    status: (id) => status(id), annotation: (id) => ann[id], answer: (q, code) => answer(QIDS.indexOf(q), code),
    ids: () => cases.map((c) => c.id), blobs: () => blobs.size, confirm: () => confirmCase(), view: (id) => shownView(id),
    ai: (id) => aiOf(id), aiModel: () => (AI ? AI.model : ""),
    get state() {
      return { session, slug, storeKey, cur, active, n: N, id: cases[cur] && cases[cur].id, server: Object.assign({}, server), done: countDone(),
        relay: RELAY, me: me && { id: me.id, name: me.name }, outbox: obx.length, sending: rl.sending, fails: rl.fails,
        mode: enc.on ? "encrypted" : M ? "plain" : "", audio: audioState };
    },
  };
  boot().catch((x) => fatal("The page could not start", String((x && x.stack) || x)));
})();
