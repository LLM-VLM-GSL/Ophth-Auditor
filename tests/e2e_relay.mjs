// End-to-end test of the audit page with the lab's relay, in headless Chrome/Edge through the DevTools protocol
// (Node 22+, no packages). As Retify's tests/e2e_relay.mjs:
//
//   node tests/e2e_relay.mjs [outdir]
//
// It starts tests/serve.py (web/ with the plaintext test fixture as data/) and relay/relay.py (annotations in
// <outdir>/answers), both on 127.0.0.1 and free ports from 8790, then: a reviewer creates a session by name and
// annotates; the top bar says the annotations are saved; everyone's progress shows the count with the masked name;
// a second browser (a fresh profile) finds the session by part of the name and gets the annotations back; with the
// relay stopped, annotations wait in the browser ("Not yet saved (n waiting)") and are sent when it is back; a reload
// merges what another browser saved; "Continue without saving to the lab" works in this browser only; the relay's
// export is the page's JSON export; the AI's pre-filled answers each case showed (ai, ai_model) are saved with it and
// come back in another browser. Screenshots at 1366x768 (bright and dark) and 860 px go to <outdir>.
// Env: CHROME (browser path), PYTHON (default "python"). Exits non-zero on a failed check or a page error.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, "..");
const outdir = resolve(process.argv[2] || join(tmpdir(), "audit-e2e-relay"));
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });
const PY = process.env.PYTHON || "python";
const browser = [process.env.CHROME, "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => p && existsSync(p));
if (!browser) { console.error("no Chrome/Edge found; set CHROME"); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, got) => { console.log((ok ? "ok   " : "FAIL ") + name + (got !== undefined ? "  (" + (typeof got === "string" ? got : JSON.stringify(got)) + ")" : "")); if (!ok) failed++; return ok; };
function freePort(from) {
  return new Promise((res, rej) => {
    const s = createServer();
    s.once("error", () => (from < 8899 ? freePort(from + 1).then(res, rej) : rej(new Error("no free port"))));
    s.listen(from, "127.0.0.1", () => s.close(() => res(from)));
  });
}

// ------------------------------------------------------------------ the page server and the relay
const FIXTURE = join(ROOT, "tests", "fixture", "data");
const MV = /"manifest_version":\s*"([^"]+)"/.exec(readFileSync(join(FIXTURE, "manifest.js"), "utf8"))[1];
const pagePort = await freePort(8790);
const serve = spawn(PY, ["-B", join(HERE, "serve.py"), "--port", String(pagePort), "--data", FIXTURE], { stdio: ["ignore", "ignore", "inherit"] });
const relayPort = await freePort(pagePort + 1);
const settings = join(outdir, "relay.json");
writeFileSync(settings, JSON.stringify({ manifest_url: join(FIXTURE, "manifest.js"), guidelines_url: join(ROOT, "web", "guidelines.js"),
  data_dir: join(outdir, "answers"), port: relayPort, origins: ["http://127.0.0.1:*"], hf: { repo: "" } }));
const API = `http://127.0.0.1:${relayPort}/api/ophth-audit`;
let relay = null;
async function startRelay() {
  relay = spawn(PY, ["-B", join(ROOT, "relay", "relay.py"), settings], { stdio: ["ignore", "ignore", "inherit"] });
  for (let i = 0; i < 75; i++) { try { if ((await fetch(API + "/status")).ok) return; } catch (e) { /* not yet */ } await sleep(200); }
  throw new Error("the relay did not start");
}
async function stopRelay() { relay.kill(); for (let i = 0; i < 50; i++) { try { await fetch(API + "/status"); } catch (e) { return; } await sleep(100); } }
for (let i = 0; i < 75; i++) { try { if ((await fetch(`http://127.0.0.1:${pagePort}/`)).ok) break; } catch (e) { /* not yet */ } await sleep(200); }
await startRelay();
const PAGE = `http://127.0.0.1:${pagePort}/?relay=${encodeURIComponent(API)}`;

// ------------------------------------------------------------------ one headless browser per reviewer, each with its own profile
const procs = [];
async function open(name, w = 1366, h = 768) {
  const port = await freePort(9420 + procs.length * 3);
  const profile = mkdtempSync(join(tmpdir(), "audit-relay-profile-"));
  const proc = spawn(browser, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, `--window-size=${w},${h}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  procs.push({ proc, profile });
  for (let i = 0; i < 75; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/list`)).ok) break; } catch (e) { /* not yet */ } await sleep(200); }
  const pg = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
  const ws = new WebSocket(pg.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let seq = 0;
  const pend = new Map(), errs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result || {}); pend.delete(d.id); }
    if (d.method === "Runtime.exceptionThrown") errs.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errs.push("console.error: " + d.params.args.map((a) => a.value ?? a.description).join(" "));
  };
  const cdp = (m, p = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method: m, params: p })); });
  const js = async (e) => {
    const r = await cdp("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(name + ": evaluate failed: " + e.slice(0, 100) + " :: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  await cdp("Page.enable"); await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const dl = await cdp("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: outdir });
  if (dl.exceptionDetails) await cdp("Page.setDownloadBehavior", { behavior: "allow", downloadPath: outdir });
  const until = async (expr, ms = 10000) => { for (let t = 0; t < ms; t += 200) { if (await js(expr)) return true; await sleep(200); } return false; };
  const shot = async (n) => writeFileSync(join(outdir, n), Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64"));
  const nav = async (url) => { await cdp("Page.navigate", { url }); await sleep(1500); };
  const size = async (W, H) => { await cdp("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false }); await sleep(500); };
  await nav(PAGE);
  return { js, until, shot, nav, size, errs, close: () => ws.close() };
}
const $ = (id) => `document.getElementById(${JSON.stringify(id)})`;
const find = async (b, name) => {
  await b.js(`${$("rName")}.value=${JSON.stringify(name)};${$("rFind")}.click()`);
  return b.until(`!!document.querySelector("#rRes .sess, #fullname, #rRes p")`);
};
const FULL = ["yes", "oct", "good", "full", "full", "correct", "no"];
const QIDS = ["q1_ophthalmic", "q2_modality", "q3_crop", "q4_image_text", "q5_faithful", "q6_clinical", "q7_pii"];
const annotate = (b, codes) => b.js(`(()=>{${codes.map((c, k) => (c ? `AUDIT_APP.answer("${QIDS[k]}","${c}");` : "")).join("")}})()`);
const saved = `/^Saved to the lab/.test(${$("save")}.textContent)`;
const current = (sid) => JSON.parse(readFileSync(join(outdir, "answers", "current", MV, sid + ".json"), "utf8")).annotations;
const app = (b) => b.js(`JSON.stringify(AUDIT_APP.state)`).then(JSON.parse);
const fitCheck = async (b, label) => {
  const m = JSON.parse(await b.js(`JSON.stringify((()=>{const q=[...document.querySelectorAll(".q")];const qs=${$("qs")};
    return {last:Math.round(q[q.length-1].getBoundingClientRect().bottom),note:Math.round(${$("note")}.getBoundingClientRect().bottom),h:innerHeight,scroll:qs.scrollHeight>qs.clientHeight+1}})())`));
  check(label + ": all 7 questions and the note visible without scrolling", m.last <= m.h && m.note <= m.h && !m.scroll, m);
};

// 1. a new reviewer: name, new session, welcome, annotations saved to the lab as they are made
const a = await open("A");
check("the page first asks who is annotating, on the relay (no welcome, no browser-only name box)",
  await a.until(`!${$("relayBox")}.hidden && ${$("sessBox")}.hidden && ${$("welcomeBox")}.hidden`));
check("the relay dialog offers Continue without saving to the lab", /Continue without saving to the lab/.test(await a.js(`${$("rLocal")}.textContent`)));
await a.shot("relay_0_name.png");
await find(a, "Tester");
check("an unknown name offers a new session", /No session was found for “Tester”/.test(await a.js(`${$("rRes")}.textContent`)));
await a.js(`document.getElementById("fullname").value="Reviewer";document.getElementById("fullname").form.requestSubmit()`); await sleep(400);
check("a new session needs the full name", /full name, first and last/.test(await a.js(`${$("rRes")}.textContent`)) && !(await a.js(`${$("relayBox")}.hidden`)));
await a.js(`document.getElementById("fullname").value="Test Reviewer";document.getElementById("fullname").form.requestSubmit()`);
check("the session is created", await a.until(`${$("relayBox")}.hidden`));
check("a new reviewer then gets the welcome, which says annotations are saved under the name",
  await a.until(`!${$("welcomeBox")}.hidden`) && /saved automatically under your name/.test(await a.js(`${$("wStore")}.textContent`)));
await a.js(`${$("wOk")}.click()`); await sleep(300);
check("the top bar names the reviewer", /Test Reviewer/.test(await a.js(`${$("who")}.textContent`)));
const sid = (await app(a)).me.id;
await annotate(a, FULL);                                            // case 1, complete
check("case 1 is saved to the lab", await a.until(saved), await a.js(`${$("save")}.textContent`));
await a.js(`AUDIT_APP.answer("q1_ophthalmic","no");AUDIT_APP.answer("q7_pii","no")`);   // case 2: skip logic
check("case 2 is saved to the lab", await a.until(`${saved} && AUDIT_APP.state.outbox===0`));
let cur = current(sid);
check("the relay has both cases, with skip logic as na", cur.T001 && cur.T001.q5_faithful === "full" && cur.T002 &&
  QIDS.slice(1, 6).every((q) => cur.T002[q] === "na"), cur.T002);
const AI1 = { q1_ophthalmic: "yes", q2_modality: "oct", q3_crop: "good", q4_image_text: "full", q5_faithful: "partial", q6_clinical: "correct", q7_pii: "no" };
check("the relay keeps the AI's pre-filled answers each case showed (ai, ai_model)", JSON.stringify(cur.T001.ai) === JSON.stringify(AI1) &&
  cur.T001.ai_model === "testlab/vision-model" && cur.T002.ai.q1_ophthalmic === "no" && cur.T002.ai.q7_pii === "yes", cur.T001.ai);
check("everyone's progress shows the count with the masked name, marked as this reviewer",
  await a.until(`/Te\\*t Revi\\*\\*\\*r\\s*2 \\/ 6/.test(${$("teamrows")}.innerText) && !!document.querySelector("#teamrows .trow.me") && !${$("team")}.hidden`),
  await a.js(`${$("teamrows")}.innerText`));
check("and no full names in it", !/Test Reviewer/.test(await a.js(`${$("teamrows")}.innerText`)));
await fitCheck(a, "1366x768 with the progress strip");
await a.shot("relay_1_1366x768_bright.png");
await a.js(`${$("theme")}.click()`); await sleep(300);
await a.shot("relay_2_1366x768_dark.png");
await a.js(`${$("theme")}.click()`);

// a second annotator, through the API: two cards, in the order of the first annotations
const H = { "Content-Type": "application/json", Origin: `http://127.0.0.1:${pagePort}` };
const post = async (path, body, key = "") => (await fetch(API + path, { method: "POST", headers: { ...H, "X-Audit-Key": key }, body: JSON.stringify(body) })).json();
const other = await post("/sessions", { name: "Other Annotator" });
const rec = (id, t) => Object.assign({ case_id: id, note: "", annotated_at: t, time_spent_s: 5 }, ...QIDS.map((q, k) => ({ [q]: FULL[k] })));
await post("/annotations", { set: MV, session: other.id, annotations: [rec("T001", "2026-11-18T10:00:00Z")] }, other.key);
await a.js(`${$("nextBtn")}.click()`);                            // nothing changes: the strip refreshes every 15 s
check("the strip shows the other annotator within 15 s, masked", await a.until(`document.querySelectorAll("#teamrows .trow").length===2`, 20000) &&
  /Ot\*\*r Anno\*\*\*\*r\s*1 \/ 6/.test(await a.js(`${$("teamrows")}.innerText`)), await a.js(`${$("teamrows")}.innerText`));

// 2. a fresh browser finds the session by part of the name; the annotations come back; then it annotates too
const b = await open("B");
await find(b, "reviewer");
check("part of the name finds the session", /We found these sessions for “reviewer”[\s\S]*Test Reviewer[\s\S]*2 annotated/.test(await b.js(`${$("rRes")}.textContent`)),
  await b.js(`${$("rRes")}.textContent`));
await b.js(`document.querySelector("#rRes .sess.primary").click()`);
check("the annotations come back in the other browser", await b.until(`AUDIT_APP.state.done===2`), (await app(b)).done);
check("a reviewer who has annotated gets no welcome", await b.js(`${$("welcomeBox")}.hidden`));
check("the same answers as in the first browser", JSON.stringify(await b.js(`AUDIT_APP.annotation("T002")`)).includes('"q2_modality":"na"'));
check("…with the AI's answers they showed", JSON.stringify(await b.js(`AUDIT_APP.annotation("T001").ai`)) === JSON.stringify(AI1) &&
  (await b.js(`AUDIT_APP.annotation("T001").ai_model`)) === "testlab/vision-model");
await b.js(`(()=>{const g=${$("goto")};g.value="3";g.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter"}))})()`); await sleep(300);
await annotate(b, FULL);                                            // case 3, from the second browser
check("the second browser saves to the lab", await b.until(`${saved} && AUDIT_APP.state.outbox===0`));
check("no page errors in the second browser", b.errs.length === 0, b.errs.join(" | "));
b.close();

// 3. with the relay down, annotations wait in the browser; when it is back (and the browser online), they are sent
await stopRelay();
await a.js(`(()=>{const g=${$("goto")};g.value="4";g.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter"}))})()`); await sleep(300);
await annotate(a, ["yes", "cfp"]);
check("relay down: the annotations wait, in red", await a.until(`/^Not yet saved \\(1 waiting\\)/.test(${$("save")}.textContent) && ${$("save")}.classList.contains("err")`),
  await a.js(`${$("save")}.textContent`));
check("the outbox is kept in the browser", (await a.js(`localStorage.getItem("ophth-audit:outbox:${MV}:${sid}")`) || "").includes('"T004"'));
await a.shot("relay_3_waiting.png");
await startRelay();
await a.js(`dispatchEvent(new Event("online"))`);
check("relay back: the waiting annotation is sent", await a.until(`${saved} && AUDIT_APP.state.outbox===0`, 15000), await a.js(`${$("save")}.textContent`));
cur = current(sid);
check("the relay has the waiting annotation", cur.T004 && cur.T004.q2_modality === "cfp", cur.T004);
const log = readFileSync(join(outdir, "answers", "log", MV, sid + ".jsonl"), "utf8").trim().split("\n");
check("every change was logged", log.length >= 4, log.length);

// 4. a reload in the first browser: the session is remembered, and what the second browser saved is merged in
await a.nav(PAGE);
check("the session is remembered: no name asked", await a.until(`AUDIT_APP.state.session && ${$("relayBox")}.hidden`));
check("the case annotated in the other browser is here", await a.until(`AUDIT_APP.status("T003")==="done"`), await a.js(`AUDIT_APP.status("T003")`));
check("and the earlier ones are still here", await a.js(`AUDIT_APP.state.done===3 && AUDIT_APP.annotation("T004").q2_modality==="cfp"`));

// 5. Download annotations in relay mode: a copy, the page's usual file
await a.js(`${$("dlBtn")}.click()`); await sleep(300);
check("Download says the annotations are already saved", /already saved to the lab/.test(await a.js(`${$("dlSum")}.textContent`)));
await a.js(`${$("dlJson")}.click()`);
let files = [];
for (let t = 0; t < 50 && !files.length; t++) { files = readdirSync(outdir).filter((f) => /^ophth_audit_test-reviewer_\d{8}-\d{4}\.json$/.test(f)); await sleep(200); }
check("the JSON download works as without the relay", files.length === 1, files);
if (files.length) {
  const j = JSON.parse(readFileSync(join(outdir, files[0]), "utf8"));
  check("the downloaded file has the merged annotations", j.annotations.T003.q1_ophthalmic === "yes" && j.rater.name === "Test Reviewer");
}
check("no page errors in the first browser", a.errs.length === 0, a.errs.join(" | "));

// 6. Continue without saving to the lab: this browser only, by name, as without a relay
const c = await open("C", 860, 900);
await c.until(`!${$("relayBox")}.hidden`);
await c.js(`${$("rLocal")}.click()`);
check("Continue without saving: the browser-only name box", await c.until(`!${$("sessBox")}.hidden && ${$("relayBox")}.hidden`));
await c.js(`(()=>{const n=${$("sName")};n.value="Local Person";n.dispatchEvent(new Event("input"));${$("sGo")}.click()})()`);
await c.until(`!${$("welcomeBox")}.hidden`); await c.js(`${$("wOk")}.click()`); await sleep(200);
await annotate(c, FULL);
const sc = await app(c);
check("browser-only: saved in this browser, no session on the relay, no progress strip",
  /^Saved in this browser/.test(await c.js(`${$("save")}.textContent`)) && !sc.me && sc.done === 1 && await c.js(`${$("team")}.hidden`), sc);
check("no page errors in the browser-only one", c.errs.length === 0, c.errs.join(" | "));
c.close();
const n = await open("N", 860, 900);
await find(n, "Test Reviewer");
await n.js(`document.querySelector("#rRes .sess.primary").click()`);
await n.until(`AUDIT_APP.state.session`); await sleep(1500);
await n.shot("relay_4_860_bright.png");
check("narrow: the progress strip is shown", await n.js(`!${$("team")}.hidden`));
n.close();

// 7. the relay's export is the page's export, one file per reviewer
const exp = join(outdir, "export");
execFileSync(PY, ["-B", join(ROOT, "relay", "relay.py"), settings, "--export", exp], { encoding: "utf8" });
const ex = readdirSync(exp).sort();
check("one export per reviewer, named as the page names its downloads", ex.length === 2 && /^ophth_audit_other-annotator_\d{8}-\d{4}\.json$/.test(ex[0]) &&
  /^ophth_audit_test-reviewer_\d{8}-\d{4}\.json$/.test(ex[1]), ex);
const e1 = JSON.parse(readFileSync(join(exp, ex[1]), "utf8"));
check("the export has every case, in the page's fields", Object.keys(e1.annotations).join(",") === "T001,T002,T003,T004,T005,T006" &&
  e1.tool === "ophth-audit" && e1.manifest_version === MV && e1.annotations.T003.q6_clinical === "correct" && e1.annotations.T005.q1_ophthalmic === "");
check("the export has the AI's answers next to the reviewer's", JSON.stringify(e1.annotations.T001.ai) === JSON.stringify(AI1) && e1.annotations.T001.ai_model === "testlab/vision-model" &&
  "ai" in e1.annotations.T005, e1.annotations.T001);

a.close();
relay.kill(); serve.kill();
for (const p of procs) { p.proc.kill(); }
await sleep(800);
for (const p of procs) { try { rmSync(p.profile, { recursive: true, force: true }); } catch (e) { /* still in use */ } }
console.log(failed ? failed + " check(s) failed" : "all checks passed");
process.exit(failed ? 1 : 0);
