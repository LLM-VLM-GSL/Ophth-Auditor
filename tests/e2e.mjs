// End-to-end tests of the audit page in headless Chrome/Edge through the DevTools protocol (Node 22+, no packages).
// Approach adapted from the end-to-end tests of an earlier MIT-licensed annotation tool by the same authors.
//
//   node tests/e2e.mjs plain [outdir]               file:// web/index.html?data=../tests/fixture/data (plaintext
//                                                    fixture): the whole rating flow, exports, load/merge, layout
//   node tests/e2e.mjs encrypted [outdir]           encrypts the fixture with a test code into a temporary folder,
//                                                    serves web/ with it as data/ on http://127.0.0.1, and tests the
//                                                    access dialog, remembered keys, Lock, #key= links, decryption
//                                                    of every image and audio clip, errors, exports
//   node tests/e2e.mjs real <outdir> <code file>    serves web/ as it is (its encrypted data/) and opens every case
//                                                    with the code from <code file>; screenshots in <outdir>
// Env: CHROME (browser path), PYTHON (Python with cryptography, pandas, openpyxl; default "python").
// Exits non-zero on a failed check, a page error or a console error. Downloads and screenshots go to <outdir>
// (default: a folder in the system temp directory). Keep <outdir> outside the repository.
import { spawn, execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, "..");
const [mode = "plain", outArg, codeArg] = process.argv.slice(2);
if (!["plain", "encrypted", "real"].includes(mode)) { console.error("mode: plain | encrypted | real"); process.exit(2); }
if (mode === "real" && !codeArg) { console.error("real mode: node tests/e2e.mjs real <outdir> <code file>"); process.exit(2); }
const outdir = resolve(outArg || join(tmpdir(), "audit-e2e-" + mode));
const PY = process.env.PYTHON || "python";
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });
const browser = [process.env.CHROME, "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => p && existsSync(p));
if (!browser) { console.error("no Chrome/Edge found; set CHROME"); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FIXTURE = join(ROOT, "tests", "fixture", "data");
// the dummy code of the encrypted test fixture (never the code of real data)
const TEST_CODE = "2345-6789-abcd-efgh-jkmn-pqrs";
const WRONG = "This code does not open the data. Check it and try again.";
const LINK_WRONG = "The access code in the link does not open the data. Check it and try again.";
const STALE = "The access code remembered on this computer does not open the data any more. Please enter the access code.";
function freePort(from) {
  return new Promise((res, rej) => {
    const s = createServer();
    s.once("error", () => (from < 8899 ? freePort(from + 1).then(res, rej) : rej(new Error("no free port"))));
    s.listen(from, "127.0.0.1", () => s.close(() => res(from)));
  });
}

// ------------------------------------------------------------------ the page server (http modes)
let server = null, encDir = "", tmpRoot = "";
let URL0 = pathToFileURL(join(ROOT, "web", "index.html")).href + "?data=../tests/fixture/data";
if (mode !== "plain") {
  if (mode === "encrypted") {
    tmpRoot = mkdtempSync(join(tmpdir(), "audit-e2e-enc-"));
    encDir = join(tmpRoot, "data");
    writeFileSync(join(tmpRoot, "code.txt"), TEST_CODE + "\n");
    console.log(execFileSync(PY, ["-B", join(ROOT, "tools", "encrypt_data.py"), "--src", FIXTURE, "--out", encDir,
      "--code-file", join(tmpRoot, "code.txt")], { encoding: "utf8" }).trim().split("\n").map((l) => "     | " + l).join("\n"));
  }
  const port = await freePort(8790);
  server = spawn(PY, ["-B", join(HERE, "serve.py"), "--port", String(port), ...(encDir ? ["--data", encDir] : [])], { stdio: ["ignore", "ignore", "inherit"] });
  URL0 = `http://127.0.0.1:${port}/`;
  let up = false;
  for (let i = 0; i < 100 && !up; i++) { try { up = (await fetch(URL0)).ok; } catch (e) { await sleep(150); } }
  if (!up) { console.error("the test server did not start"); server.kill(); process.exit(2); }
}
const ORIGIN = URL0.startsWith("http") ? new URL(URL0).origin : "";

// ------------------------------------------------------------------ the browser
const DEBUG_PORT = await freePort({ plain: 9351, encrypted: 9361, real: 9371 }[mode]);
const profile = mkdtempSync(join(tmpdir(), "audit-e2e-profile-"));
// --disable-gpu: software rendering only
const proc = spawn(browser, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "--window-size=1366,768",
  "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });

let ws, seq = 0, failed = 0;
const pend = new Map(), errs = [], dialogs = [], reqs = [];
const cdp = (m, p = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method: m, params: p })); });
const js = async (e) => {
  const r = await cdp("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error("evaluate failed: " + e.slice(0, 120) + " :: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const shot = async (n) => writeFileSync(join(outdir, n), Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64"));
const check = (name, ok, got) => { console.log((ok ? "ok   " : "FAIL ") + name + (got !== undefined ? "  (" + (typeof got === "string" ? got : JSON.stringify(got)) + ")" : "")); if (!ok) failed++; return ok; };
const VK = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Escape: 27, Enter: 13, " ": 32, "?": 191, "+": 187, "-": 189 };
const CODE = { " ": "Space", "?": "Slash", "+": "Equal", "-": "Minus" };
async function key(k, o = {}) {
  const code = o.code || CODE[k] || (/^[0-9]$/.test(k) ? "Digit" + k : /^[a-z]$/i.test(k) ? "Key" + k.toUpperCase() : k);
  const vk = VK[k] || (k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0);
  const text = k === "Enter" ? "\r" : k.length === 1 ? k : undefined, modifiers = o.mod || (k === "?" || k === "+" ? 8 : 0);
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, text, unmodifiedText: text, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
  await sleep(o.wait ?? 120);
}
const keys = async (s, wait) => { for (const k of s) await key(k, { wait }); };
async function click(sel) {
  const r = await js(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:"nearest"});const b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2}})()`);
  if (!r) throw new Error("no element " + sel);
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y });
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "left", clickCount: 1 });
  await sleep(200);
}
async function until(expr, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await js(expr)) return true; await sleep(100); } return false; }
async function waitDownloads(n, ms = 10000) {
  const t0 = Date.now();
  let f = [];
  while (Date.now() - t0 < ms) {
    f = readdirSync(outdir).filter((x) => x.startsWith("ophth_audit_") && !x.endsWith(".crdownload"));
    if (f.length >= n) return f;
    await sleep(200);
  }
  return f;
}
const ann = (id) => js(`JSON.stringify(AUDIT_APP.annotation(${JSON.stringify(id)})||null)`).then((s) => JSON.parse(s));
const answers = (a) => (a ? [a.q1_ophthalmic, a.q2_modality, a.q3_crop, a.q4_image_text, a.q5_faithful, a.q6_clinical, a.q7_pii].join(",") : "");
const visible = (id) => js(`!document.getElementById(${JSON.stringify(id)}).hidden`);
async function startSession(name, role, years, expectWelcome) {
  check("session dialog shown", await until(`!document.getElementById("sessBox").hidden`));
  if (mode === "plain" && !existsSync(join(outdir, "d1_session.png"))) await shot("d1_session.png");
  await js(`(()=>{const n=document.getElementById("sName");n.value=${JSON.stringify(name)};n.dispatchEvent(new Event("input"));
    const r=document.getElementById("sRole");if(${JSON.stringify(role)})r.value=${JSON.stringify(role)};
    const y=document.getElementById("sYears");if(${JSON.stringify(String(years))}!=="")y.value=${JSON.stringify(String(years))};})()`);
  await js(`document.getElementById("sGo").click()`);
  await sleep(500);
  if (expectWelcome) {
    check("welcome dialog shown for a new rater", await until(`!document.getElementById("welcomeBox").hidden`));
    if (mode === "plain" && !existsSync(join(outdir, "d2_welcome.png"))) await shot("d2_welcome.png");
    await js(`document.getElementById("wOk").click()`);
    await sleep(300);
  }
}
async function loadFileInput(path) {
  const doc = await cdp("DOM.getDocument");
  const nd = await cdp("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "#loadFile" });
  await cdp("DOM.setFileInputFiles", { nodeId: nd.nodeId, files: [path] });
  await sleep(800);
}
async function freshStorage() {           // leave the session (the unload handler saves once more), clear storage, reload
  const d0 = dialogs.length;
  await cdp("Page.reload"); await sleep(1500);
  const seen = dialogs.slice(d0);
  await js(`localStorage.clear()`);
  await cdp("Page.reload"); await sleep(1500);
  return seen;
}
const askText = () => js(`document.getElementById("askBox").hidden?"":document.getElementById("askTitle").textContent+" | "+document.getElementById("askBody").textContent`);
const askClick = (primary) => js(`(()=>{const b=[...document.querySelectorAll("#askRow button")];(${primary}?b.find(x=>x.classList.contains("primary")):b.find(x=>!x.classList.contains("primary"))).click()})()`);
async function go(url) { await cdp("Page.navigate", { url: "about:blank" }); await sleep(300); await cdp("Page.navigate", { url }); await sleep(800); }
async function typeCode(code, remember) {   // the access dialog: type a code and press Open (a real mouse click)
  await js(`(()=>{const i=document.getElementById("aCode");i.value="";i.focus();document.getElementById("aRemember").checked=${!!remember}})()`);
  await cdp("Input.insertText", { text: code });
  await click("#aGo");
  await until(`!document.getElementById("aGo").disabled && (!document.getElementById("aErr").hidden || document.getElementById("accessBox").hidden)`, 15000);
  await sleep(200);
}
const storedKeys = () => js(`Object.keys(localStorage).filter(k=>k.startsWith("ophth-audit:key:"))`);

// ------------------------------------------------------------------ connect
for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).ok) break; } catch (e) { /* not yet */ } await sleep(200); }
const pg = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json()).find((t) => t.type === "page");
ws = new WebSocket(pg.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result || { exceptionDetails: d.error }); pend.delete(d.id); }
  if (d.method === "Runtime.exceptionThrown") errs.push("exception: " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errs.push("console.error: " + d.params.args.map((a) => a.value ?? a.description).join(" "));
  if (d.method === "Log.entryAdded" && d.params.entry.level === "error") errs.push("log: " + d.params.entry.text + " " + (d.params.entry.url || ""));
  if (d.method === "Network.requestWillBeSent") reqs.push(d.params.request.url);
  if (d.method === "Page.javascriptDialogOpening") { dialogs.push(d.params.type); cdp("Page.handleJavaScriptDialog", { accept: true }); }
};
await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Log.enable"); await cdp("Network.enable");
const dl = await cdp("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: outdir });
if (dl.exceptionDetails) await cdp("Page.setDownloadBehavior", { behavior: "allow", downloadPath: outdir });
await cdp("Page.navigate", { url: URL0 });
await sleep(1500);

let expectedErr = () => false;
try {
  if (mode === "plain") await plain();
  else if (mode === "encrypted") await encrypted();
  else await real();
} catch (e) {
  check("test ran to the end", false, e.stack || String(e));
}
const other = reqs.filter((u) => /^https?:/i.test(u) && !(ORIGIN && u.startsWith(ORIGIN + "/")));
check("no requests to other origins", other.length === 0, other.slice(0, 5));
check("no requests to api/* (the public page has no server)", !reqs.some((u) => /\/api\//.test(u)), reqs.filter((u) => /\/api\//.test(u)).slice(0, 3));
const pageErrs = errs.filter((e) => !expectedErr(e));
check("no page errors or console errors", pageErrs.length === 0, pageErrs.slice(0, 8));
ws.close(); proc.kill(); if (server) server.kill(); await sleep(600);
for (const d of [profile, tmpRoot]) { try { if (d) rmSync(d, { recursive: true, force: true }); } catch (e) { /* the browser may still hold a file */ } }
console.log(failed ? `\n${failed} FAILED` : "\nALL OK");
process.exit(failed ? 1 : 0);

// ------------------------------------------------------------------ file:// with the plaintext fixture: the whole flow
async function plain() {
  check("the case list loads (fixture-v1, 6 cases)", (await js(`document.getElementById("setInfo").textContent`)).includes("fixture-v1 · 6 cases"), await js(`document.getElementById("setInfo").textContent`));
  check("plaintext mode, no access dialog", (await js(`AUDIT_APP.state.mode`)) === "plain" && (await js(`document.getElementById("accessBox").hidden`)));
  check("visible title is neutral", (await js(`document.title`)) === "Ophthalmic image–description audit" && (await js(`document.querySelector(".brand h1").textContent`)) === "Ophthalmic image–description audit");
  check("robots: noindex, nofollow", (await js(`document.querySelector('meta[name=robots]').content`)) === "noindex, nofollow");
  // slug rule: the page and the Python rule of tests/check_exports.py agree
  const names = ["Dr. Jane O'Neil", "  Jane   Doe ", "Élodie Müller-Smith", "María José Pérez", "A".repeat(50), "x ".repeat(30), "---", "李 明", "Kelvin \u212A Test"];
  const pyS = JSON.parse(execFileSync(PY, ["-B", "-c", "import sys,json; sys.path.insert(0, sys.argv[1]); from check_exports import slugify; print(json.dumps([slugify(n) for n in json.loads(sys.argv[2])]))", HERE, JSON.stringify(names)], { encoding: "utf8" }));
  const jsS = await js(`JSON.stringify(${JSON.stringify(names)}.map(AUDIT_APP.slugify))`);
  check("slug rule identical in app.js and Python", jsS === JSON.stringify(pyS), jsS);
  check("slug example: Dr. Jane O'Neil -> dr-jane-o-neil", JSON.parse(jsS)[0] === "dr-jane-o-neil");
  check("media path rule: data/... is re-rooted on ?data=", (await js(`AUDIT_APP.mediaUrl("data/images/T001.jpg")`)) === "../tests/fixture/data/images/T001.jpg");
  check("access code normalization: lowercase, [a-z0-9] only", (await js(`AUDIT_APP.normCode(" AbC-12 x_Y ")`)) === "abc12xy");

  await js(`(()=>{document.getElementById("sName").value=" ";document.getElementById("sGo").click()})()`);
  check("an empty name is refused", (await js(`document.getElementById("sErr").textContent`)).includes("enter your name"));
  check("only the name is asked (no role, no years)", await js(`document.getElementById("sRole").closest(".frow").hidden`));
  check("no Lock button without encrypted data", await js(`document.getElementById("sLock").hidden`));
  await startSession("Dr. Jane O'Neil", "ophthalmologist", 7, true);
  check("session on, slug per the rule", (await js(`AUDIT_APP.state.slug`)) === "dr-jane-o-neil");
  check("storage key holds manifest_version and slug", (await js(`AUDIT_APP.state.storeKey`)) === "ophth-audit:ann:fixture-v1:dr-jane-o-neil");
  check("case 1 shown", (await js(`document.getElementById("caseId").textContent`)) === "T001");
  check("image loaded", await until(`document.getElementById("img").naturalWidth>0`));
  check("description shown", (await js(`document.getElementById("caption").textContent`)).startsWith("Optical coherence tomography B-scan"));
  check("English transcript, no language line", (await js(`document.getElementById("langInfo").textContent`)) === "" && (await js(`document.getElementById("transcript").textContent`)).startsWith("Here you can see"));
  check("q2 offers 7 answers incl. Multi (key 6)", (await js(`[...document.querySelectorAll('[data-q=q2_modality] .opt')].map(b=>b.textContent).join("|")`)) === "1OCT|2CFP|3UWF|4Angio|5Other|6Multi|7Unsure");
  await shot("f1_case1.png");

  await sleep(2200);                                         // some time on the case
  await key("1");
  check("1 answers q1 and moves to q2", (await js(`AUDIT_APP.state.active`)) === 1 && (await ann("T001")).q1_ophthalmic === "yes");
  await key("ArrowUp");
  check("Up goes back to q1", (await js(`AUDIT_APP.state.active`)) === 0);
  await key("ArrowDown");
  await keys("111216");                                       // oct good full partial correct, then q7: 6 is not an answer
  check("a key without an answer does nothing", (await js(`AUDIT_APP.state.id`)) === "T001" && !(await ann("T001")).q7_pii);
  await key("1");                                             // q7 no -> complete
  check("case 1 complete: auto-advance to case 2", (await js(`AUDIT_APP.state.id`)) === "T002");
  check("case 1 answers", answers(await ann("T001")) === "yes,oct,good,full,partial,correct,no", answers(await ann("T001")));
  check("case 1 status done", (await js(`AUDIT_APP.status("T001")`)) === "done");

  check("language line names Spanish", (await js(`document.getElementById("langInfo").textContent`)).includes("Spanish"), await js(`document.getElementById("langInfo").textContent`));
  check("English translation shown first", (await js(`document.getElementById("transcript").textContent`)).startsWith("Here we see hard exudates"));
  await key("t");
  check("T shows the original transcript", (await js(`document.getElementById("transcript").textContent`)).startsWith("Aquí vemos"));
  await key("t");
  await key("2");
  const a2 = await ann("T002");
  check("q1=no: q2..q6 recorded as na", [a2.q2_modality, a2.q3_crop, a2.q4_image_text, a2.q5_faithful, a2.q6_clinical].every((v) => v === "na"), answers(a2));
  check("q2..q6 visibly disabled", (await js(`[...document.querySelectorAll(".q.skip")].length`)) === 5 && (await js(`document.querySelector('[data-q=q3_crop] .opt').disabled`)));
  check("q7 becomes the active question", (await js(`AUDIT_APP.state.active`)) === 6);
  await shot("f2_skip.png");
  await key("2");                                             // q7 yes -> a note is asked for, no auto-advance
  check("q7=yes with an empty note: stays and focuses the note", (await js(`AUDIT_APP.state.id`)) === "T002" && (await js(`document.activeElement.id`)) === "note");
  await keys("Name 123 ", 30);
  check("typing digits in the note does not answer", (await js(`document.getElementById("note").value`)) === "Name 123 " && (await js(`AUDIT_APP.state.id`)) === "T002");
  await key("Escape");
  check("Esc leaves the note box and saves the note", (await js(`document.activeElement===document.body`)) && (await ann("T002")).note === "Name 123 ");
  check("case 2 flagged (q1 no, q7 yes)", (await js(`AUDIT_APP.status("T002")`)) === "flag");
  await key("ArrowRight");
  check("case 3 shown", (await js(`AUDIT_APP.state.id`)) === "T003");
  check("no audio: player off, message shown", (await js(`document.getElementById("player").classList.contains("off") && !document.getElementById("noAudio").hidden`)));
  check("no transcript and no audio message", (await js(`document.getElementById("transcript").textContent`)).includes("No transcript and no audio"));
  await key("ArrowLeft");
  check("Left: back to case 2, q1 active", (await js(`AUDIT_APP.state.id`)) === "T002" && (await js(`AUDIT_APP.state.active`)) === 0);
  await key("1");
  const a2b = await ann("T002");
  check("q1 changed back to yes: the na values are cleared", [a2b.q2_modality, a2b.q3_crop, a2b.q4_image_text, a2b.q5_faithful, a2b.q6_clinical].every((v) => v === "") && a2b.q7_pii === "yes", answers(a2b));
  check("case 2 is now started, not complete", (await js(`AUDIT_APP.status("T002")`)) === "partial");
  await keys("62342");                                        // multi partial none cant_judge minor -> complete
  check("case 2 complete with Multi: auto-advance to case 3", (await js(`AUDIT_APP.state.id`)) === "T003");
  check("case 2 answers", answers(await ann("T002")) === "yes,multi,partial,none,cant_judge,minor,yes", answers(await ann("T002")));

  await sleep(1200);
  await click('[data-q=q1_ophthalmic] .opt:nth-child(3)');
  check("mouse click answers q1 (unsure) and keeps keys working", (await ann("T003")).q1_ophthalmic === "unsure" && (await js(`document.activeElement===document.body`)));
  await keys("731441");
  check("case 3 answers", answers(await ann("T003")) === "unsure,unsure,bad,full,cant_judge,cant_judge,no", answers(await ann("T003")));
  check("auto-advance to case 4", (await js(`AUDIT_APP.state.id`)) === "T004");

  check("empty transcript: 'use the audio'", (await js(`document.getElementById("transcript").textContent`)) === "No transcript available — use the audio.");
  await until(`document.getElementById("audio").readyState>=1`, 4000);
  await key(" ");
  check("Space plays the audio", await until(`!document.getElementById("audio").paused`, 3000));
  await key(" ");
  check("Space pauses", await js(`document.getElementById("audio").paused`));
  await key("s");
  check("S: speed 1.5x", (await js(`document.getElementById("audio").playbackRate`)) === 1.5);
  await key("s"); await key("s");
  check("S twice more: back to 1x", (await js(`document.getElementById("audio").playbackRate`)) === 1);
  await key("+");
  check("+ zooms in (Reset view enabled)", !(await js(`document.getElementById("resetBtn").disabled`)));
  await key("0");
  check("0 resets the view", await js(`document.getElementById("resetBtn").disabled`));
  await key("f");
  check("F opens the full-size view", await until(`!document.getElementById("viewer").hidden && document.getElementById("vimg").naturalWidth>0`));
  await shot("f3_viewer.png");
  await key("Escape");
  check("Esc closes it", await js(`document.getElementById("viewer").hidden`));
  await key("g");
  check("G opens the guide with the full rubric", (await js(`!document.getElementById("guideBox").hidden && document.querySelectorAll("#gRubric .rq").length===7 && document.getElementById("gRubric").textContent.includes("Multi")`)));
  check("the guide does not mention the audit server here", await js(`document.getElementById("gServer").hidden`));
  await shot("d3_guide.png");
  await key("Escape");
  await key("?", {});
  check("? shows the shortcuts", await js(`!document.getElementById("keysBox").hidden`));
  await key("Escape");
  check("Esc closes the shortcuts", await js(`document.getElementById("keysBox").hidden`));
  await key("e");
  await key("5");
  check("E focuses the note; 5 is typed, not an answer", (await js(`document.getElementById("note").value`)) === "5" && !(await ann("T004")).q1_ophthalmic);
  const NOTE4 = '5, "quoted"\nline 2; café';
  await cdp("Input.insertText", { text: NOTE4.slice(1) });
  await key("Escape");
  check("note with comma, quotes, newline and accent saved", (await ann("T004")).note === NOTE4, (await ann("T004")).note);
  await key("n");
  check("N: next case still to do (case 5)", (await js(`AUDIT_APP.state.id`)) === "T005");
  await key("ArrowLeft");
  check("progress 3 / 6 and median shown", (await js(`document.getElementById("pDone").textContent`)) === "3 / 6" && /\d+ s/.test(await js(`document.getElementById("pMed").textContent`)), await js(`document.getElementById("pMed").textContent`));
  await js(`document.querySelector('#filter [data-f=flag]').click()`);
  check("filter Flagged lists cases 2 and 3", (await js(`[...document.querySelectorAll("#list .c")].map(b=>b.textContent).join()`)) === "2,3");
  await js(`document.querySelector('#filter [data-f=all]').click()`);
  check("list colours: done, flag, flag, partial, todo, todo", (await js(`[...document.querySelectorAll("#list .c")].map(b=>b.className.replace(/\\s*cur/,"").replace("c ","")).join()`)) === "done,flag,flag,partial,todo,todo",
    await js(`[...document.querySelectorAll("#list .c")].map(b=>b.className).join()`));

  // layout at a 1366x768 laptop screen (browser window: about 1366x657 of page)
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1366, height: 657, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  await key("ArrowLeft"); await key("ArrowLeft"); await key("ArrowLeft");
  await layoutChecks("1366x657");
  await shot("f4_1366x657_light.png");
  await js(`document.getElementById("themeBtn").click()`);
  check("theme switch: dark, and remembered", (await js(`document.documentElement.dataset.theme`)) === "dark" && (await js(`localStorage.getItem("ophth-audit:theme")`)) === "dark");
  await key("ArrowRight");
  await shot("f5_1366x657_dark.png");
  await js(`document.getElementById("themeBtn").click()`);
  await cdp("Emulation.clearDeviceMetricsOverride");

  const dBefore = dialogs.length;
  await cdp("Page.reload"); await sleep(1800);
  check("unload warning when answers were not exported", dialogs.slice(dBefore).includes("beforeunload"), dialogs);
  check("same browser: the last name is prefilled", (await js(`document.getElementById("sName").value`)) === "Dr. Jane O'Neil");
  check("…and its saved work is found", (await js(`document.getElementById("sFound").textContent`)).includes("3 of 6 cases complete"), await js(`document.getElementById("sFound").textContent`));
  await js(`document.getElementById("sGo").click()`); await sleep(600);
  check("resumed: no welcome, 3 / 6, at the first case still to do", (await js(`document.getElementById("welcomeBox").hidden`)) && (await js(`document.getElementById("pDone").textContent`)) === "3 / 6" && (await js(`AUDIT_APP.state.id`)) === "T004");
  check("answers and notes survived the reload", answers(await ann("T002")) === "yes,multi,partial,none,cant_judge,minor,yes" && (await ann("T002")).note === "Name 123 " && (await ann("T004")).note.startsWith("5, "));

  await key("s", { mod: 2 }); await sleep(700);                 // Ctrl+S = Export JSON
  check("Ctrl+S exports JSON", (await waitDownloads(1, 5000)).some((f) => f.endsWith(".json")));
  await js(`document.getElementById("expCsv").click()`); await sleep(700);
  await js(`document.getElementById("expXlsx").click()`);
  const files = await waitDownloads(3);
  check("JSON, CSV and XLSX downloaded as ophth_audit_<slug>_<stamp>", ["json", "csv", "xlsx"].every((e) => files.some((f) => f.endsWith("." + e))), files);
  check("status says exported", (await js(`document.getElementById("save").textContent`)).includes("exported"), await js(`document.getElementById("save").textContent`));
  const expected = { manifest_version: "fixture-v1", rater: { name: "Dr. Jane O'Neil", role: "", years_experience: null },
    answers: {
      T001: { q1_ophthalmic: "yes", q2_modality: "oct", q3_crop: "good", q4_image_text: "full", q5_faithful: "partial", q6_clinical: "correct", q7_pii: "no", note: "" },
      T002: { q1_ophthalmic: "yes", q2_modality: "multi", q3_crop: "partial", q4_image_text: "none", q5_faithful: "cant_judge", q6_clinical: "minor", q7_pii: "yes", note: "Name 123 " },
      T003: { q1_ophthalmic: "unsure", q2_modality: "unsure", q3_crop: "bad", q4_image_text: "full", q5_faithful: "cant_judge", q6_clinical: "cant_judge", q7_pii: "no" },
      T004: { q1_ophthalmic: "", q7_pii: "", note: '5, "quoted"\nline 2; café' },
      T005: { q1_ophthalmic: "", q2_modality: "", note: "", annotated_at: "" },
    }, timed: ["T001", "T002", "T003"] };
  checkExports(expected);
  const jsonFile = join(outdir, files.find((f) => f.endsWith(".json"))), xlsxFile = join(outdir, files.find((f) => f.endsWith(".xlsx")));
  const csvFile = join(outdir, files.find((f) => f.endsWith(".csv")));

  check("no unload warning right after an export", (await freshStorage()).length === 0);
  await startSession("Dr. Jane O'Neil", "ophthalmologist", 7, true);
  check("storage cleared: 0 / 6", (await js(`document.getElementById("pDone").textContent`)) === "0 / 6");
  await loadFileInput(xlsxFile);
  check("XLSX loaded: 4 cases taken", (await askText()).includes("4 cases taken"), await askText());
  await askClick(true); await sleep(200);
  check("after XLSX load: 3 / 6 and the answers back", (await js(`document.getElementById("pDone").textContent`)) === "3 / 6" &&
    answers(await ann("T002")) === "yes,multi,partial,none,cant_judge,minor,yes" && (await ann("T002")).note === "Name 123 ");
  await loadFileInput(jsonFile);
  check("JSON of the same answers: nothing taken, 4 kept", (await askText()).includes("0 cases taken") && (await askText()).includes("4 cases kept"), await askText());
  await askClick(true); await sleep(200);
  await loadFileInput(csvFile);
  check("CSV of the same answers: nothing taken", (await askText()).includes("0 cases taken"), await askText());
  await askClick(true); await sleep(200);
  // CSV exported by an earlier version (another file-name prefix, another tool id in JSON): the slug is still read
  mkdirSync(join(outdir, "merge"), { recursive: true });
  const oldCsv = join(outdir, "merge", "studyv0_audit_dr-jane-o-neil_20261118-1031.csv");
  copyFileSync(csvFile, oldCsv);
  await loadFileInput(oldCsv);
  check("CSV with an earlier file-name prefix: same rater, loads without asking", (await askText()).startsWith("Annotations loaded"), await askText());
  await askClick(true); await sleep(200);
  const otherCsv = join(outdir, "merge", "studyv0_audit_someone-else_20261118-1031.csv");
  copyFileSync(csvFile, otherCsv);
  await loadFileInput(otherCsv);
  check("CSV whose file name names another rater: asks first", (await askText()).includes("someone-else"), await askText());
  await askClick(false); await sleep(200);
  const j = JSON.parse(readFileSync(jsonFile, "utf8"));
  j.tool = "earlier-audit";
  j.annotations.T001.q3_crop = "bad"; j.annotations.T001.annotated_at = "2030-01-01T00:00:00+00:00";
  j.annotations.T003.q3_crop = "good"; j.annotations.T003.annotated_at = "2000-01-01T00:00:00+00:00";
  j.annotations.T005.q1_ophthalmic = "maybe"; j.annotations.ZZZ9 = { q1_ophthalmic: "yes" };
  writeFileSync(join(outdir, "merge", "newer.json"), JSON.stringify(j));
  await loadFileInput(join(outdir, "merge", "newer.json"));
  const t = await askText();
  check("merge (another tool id is accepted): the newer T001 is taken, the older T003 kept, unknown id and bad code reported", t.includes("1 case taken") && t.includes("1 row skipped") && t.includes("1 answer ignored"), t);
  await askClick(true); await sleep(200);
  check("merge result: T001 q3 bad (newer), T003 q3 bad (kept)", (await ann("T001")).q3_crop === "bad" && (await ann("T003")).q3_crop === "bad");
  j.rater.name = "Someone Else";
  writeFileSync(join(outdir, "merge", "other.json"), JSON.stringify(j));
  await loadFileInput(join(outdir, "merge", "other.json"));
  check("another rater's file: asks first", (await askText()).includes("another rater"), await askText());
  await askClick(false); await sleep(200);
  check("…and Cancel merges nothing", (await js(`document.getElementById("askBox").hidden`)) && (await ann("T001")).q3_crop === "bad");
  await js(`document.getElementById("switchBtn").click()`); await sleep(300);
  check("Switch opens the session dialog with Cancel and the saved session", (await js(`!document.getElementById("sCancel").hidden && document.getElementById("sSaved").textContent.includes("Jane O'Neil")`)));
  await startSession("Second Rater", "optometrist", 2, true);
  check("a second rater starts empty", (await js(`document.getElementById("pDone").textContent`)) === "0 / 6" && (await js(`AUDIT_APP.state.slug`)) === "second-rater");
  await shot("f6_end.png");
}

async function layoutChecks(tag) {
  const lay = JSON.parse(await js(`JSON.stringify({sw:document.documentElement.scrollWidth,w:innerWidth,
    top:document.querySelector(".top").scrollWidth<=document.querySelector(".top").clientWidth+1,
    cut:[...document.querySelectorAll(".opt span,.qt")].filter(s=>s.scrollWidth>s.clientWidth+1).map(s=>s.textContent),
    rows:[...document.querySelectorAll(".q")].filter(r=>{const b=r.getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight}).length,
    cap:(()=>{const b=document.getElementById("caption").getBoundingClientRect();return b.top>=0&&b.top<innerHeight-40})(),
    h1:(()=>{const h=document.querySelector(".brand h1");return h.scrollWidth<=h.clientWidth+1})()})`));
  check(tag + ": no horizontal scroll", lay.sw <= lay.w, lay);
  check(tag + ": header fits, title not cut", lay.top && lay.h1);
  check(tag + ": no cut-off answer labels", lay.cut.length === 0, lay.cut);
  check(tag + ": all 7 questions visible", lay.rows === 7, lay.rows);
  check(tag + ": description visible", lay.cap);
}

function checkExports(expected) {
  writeFileSync(join(outdir, "expected.json"), JSON.stringify(expected, null, 1));
  let py = "";
  try {
    py = execFileSync(PY, ["-B", join(HERE, "check_exports.py"), outdir, "--expect", join(outdir, "expected.json"), "--manifest", join(FIXTURE, "manifest.js")], { encoding: "utf8" });
    check("tests/check_exports.py: the exports are as documented", true);
  } catch (e) { py = (e.stdout || "") + (e.stderr || ""); check("tests/check_exports.py: the exports are as documented", false); }
  console.log(py.split("\n").map((l) => "     | " + l).join("\n"));
}

// ------------------------------------------------------------------ http with the encrypted fixture
async function encrypted() {
  const meta = JSON.parse(readFileSync(join(encDir, "meta.json"), "utf8"));
  const keyName = "ophth-audit:key:fixture-v1:" + meta.kdf.salt;
  check("encrypted fixture: meta.json has exactly the documented keys", JSON.stringify(Object.keys(meta)) === JSON.stringify(["format", "dataset", "created", "kdf", "cipher", "manifest", "n_cases"]), Object.keys(meta));
  check("access dialog shown first (no session dialog)", (await until(`!document.getElementById("accessBox").hidden`)) && (await js(`document.getElementById("sessBox").hidden`)));
  check("the dialog says the audit is private", (await js(`document.querySelector("#accessBox p").textContent`)) === "This audit is private. Enter the access code you received.");
  check("Remember on this computer is checked by default", await js(`document.getElementById("aRemember").checked`));
  check("the page fetched meta.json and manifest.bin only", reqs.some((u) => u.endsWith("/data/meta.json")) && reqs.some((u) => u.endsWith("/data/manifest.bin")) && !reqs.some((u) => /\/data\/(images|audio)\//.test(u)));
  await shot("e1_access.png");
  await typeCode("", true);
  check("an empty code is refused", (await js(`document.getElementById("aErr").textContent`)) === "Please enter the access code.");
  await typeCode("2345-6789-abcd-efgh-jkmn-pqrz", true);
  check("a wrong code is rejected with a clear message", (await js(`document.getElementById("aErr").textContent`)) === WRONG && (await visible("accessBox")), await js(`document.getElementById("aErr").textContent`));
  check("…and nothing is remembered", (await storedKeys()).length === 0);
  await shot("e2_wrong_code.png");
  await typeCode(TEST_CODE, false);
  check("the right code opens the data (session dialog)", (await js(`document.getElementById("accessBox").hidden`)) && (await until(`!document.getElementById("sessBox").hidden`)));
  check("…not remembered when the box is unchecked", (await storedKeys()).length === 0);
  check("the code field is emptied", (await js(`document.getElementById("aCode").value`)) === "");
  await cdp("Page.reload"); await sleep(1500);
  check("not remembered: after a reload the code is asked again", await until(`!document.getElementById("accessBox").hidden`));
  await typeCode("  2345 6789 ABCD efgh-JKMN pqrs ", true);        // spaces, dashes and capitals do not matter
  check("the code with spaces and capitals opens the data", await until(`!document.getElementById("sessBox").hidden`));
  check("Remember: the derived key is stored under dataset + salt", JSON.stringify(await storedKeys()) === JSON.stringify([keyName]) && (await js(`atob(localStorage.getItem(${JSON.stringify(keyName)})).length`)) === 32);
  check("…and never the code itself", !(await js(`JSON.stringify(Object.entries(localStorage))`)).includes("jkmn"));
  check("Lock / forget code offered in the session dialog", await visible("sLock"));

  await startSession("Enc Tester", "researcher", 2, true);
  check("encrypted mode, 6 cases", (await js(`AUDIT_APP.state.mode`)) === "encrypted" && (await js(`AUDIT_APP.state.n`)) === 6);
  check("case 1: the image is decrypted into a blob: URL", await until(`document.getElementById("img").src.startsWith("blob:") && document.getElementById("img").naturalWidth===640`));
  check("case 1: the audio is decrypted and plays", (await until(`document.getElementById("audio").src.startsWith("blob:") && document.getElementById("audio").readyState>=1 && document.getElementById("audio").duration>2.5`)));
  await shot("e3_case1.png");
  await key(" ");
  check("Space plays the decrypted audio", await until(`!document.getElementById("audio").paused`, 3000));
  await key(" ");
  await key("f");
  check("full-size view works with the blob: image", await until(`!document.getElementById("viewer").hidden && document.getElementById("vimg").src.startsWith("blob:") && document.getElementById("vimg").naturalWidth===640`));
  await key("Escape");
  await sleep(1200);
  await keys("1111211");                                      // yes oct good full partial correct no -> complete
  check("case 1 answered by keyboard: auto-advance to case 2", (await js(`AUDIT_APP.state.id`)) === "T002" && answers(await ann("T001")) === "yes,oct,good,full,partial,correct,no", answers(await ann("T001")));
  check("case 2 image (854x188) decrypted", await until(`document.getElementById("img").naturalWidth===854`));
  await sleep(1500);
  await keys("21");                                           // q1 no (skip logic) -> q7 no -> complete
  check("case 2: skip logic, complete, auto-advance to case 3", (await js(`AUDIT_APP.state.id`)) === "T003" && answers(await ann("T002")) === "no,na,na,na,na,na,no", answers(await ann("T002")));
  check("case 3 (no audio): image decrypted, 'No audio for this case'", (await until(`document.getElementById("img").naturalWidth===500`)) &&
    (await js(`document.getElementById("player").classList.contains("off") && document.getElementById("noAudio").textContent==="No audio for this case"`)));
  const dims = { T004: 300, T005: 1200, T006: 900 }, bad = [];
  for (const id of ["T004", "T005", "T006"]) {
    await key("ArrowRight");
    const okI = await until(`AUDIT_APP.state.id===${JSON.stringify(id)} && document.getElementById("img").naturalWidth===${dims[id]}`);
    const okA = await until(`document.getElementById("audio").src.startsWith("blob:") && document.getElementById("audio").duration>0`);
    if (!okI || !okA) bad.push(id + (okI ? "" : " image") + (okA ? "" : " audio"));
  }
  check("cases 4-6: every image and audio clip decrypts", bad.length === 0, bad);
  check("only the cases around the current one stay decrypted", (await js(`AUDIT_APP.blobs()`)) <= 12, await js(`AUDIT_APP.blobs()`));
  await key("s", { mod: 2 }); await sleep(700);
  await js(`document.getElementById("expCsv").click()`); await sleep(700);
  await js(`document.getElementById("expXlsx").click()`);
  const files = await waitDownloads(3);
  check("JSON, CSV and XLSX downloaded", ["json", "csv", "xlsx"].every((e) => files.some((f) => f.endsWith("." + e))), files);
  checkExports({ manifest_version: "fixture-v1", rater: { name: "Enc Tester", role: "", years_experience: null },
    answers: {
      T001: { q1_ophthalmic: "yes", q2_modality: "oct", q3_crop: "good", q4_image_text: "full", q5_faithful: "partial", q6_clinical: "correct", q7_pii: "no", note: "" },
      T002: { q1_ophthalmic: "no", q2_modality: "na", q3_crop: "na", q4_image_text: "na", q5_faithful: "na", q6_clinical: "na", q7_pii: "no" },
      T003: { q1_ophthalmic: "", note: "", annotated_at: "" },
    }, timed: ["T001", "T002"] });

  // remembered: a reload opens the data without asking
  await cdp("Page.reload"); await sleep(1500);
  check("reload: the remembered key opens the data without asking", (await until(`!document.getElementById("sessBox").hidden`)) && (await js(`document.getElementById("accessBox").hidden`)));
  await js(`document.getElementById("sGo").click()`); await sleep(600);
  check("…and the work is resumed (2 / 6)", (await js(`document.getElementById("pDone").textContent`)) === "2 / 6" && (await js(`AUDIT_APP.state.id`)) === "T003");
  await key("1");                                             // an answer that is not exported yet
  check("an unexported answer", (await ann("T003")).q1_ophthalmic === "yes" && (await js(`document.getElementById("save").textContent`)).includes("not exported"));

  // Lock / forget code
  await js(`document.getElementById("switchBtn").click()`); await sleep(300);
  await click("#sLock");
  check("Lock asks first", (await askText()).startsWith("Lock this page?"), await askText());
  const d0 = dialogs.length;
  await askClick(true); await sleep(1800);
  check("after Lock: the page asks for the code again", await until(`!document.getElementById("accessBox").hidden`));
  check("…the key is forgotten, the answers are kept", (await storedKeys()).length === 0 &&
    JSON.parse((await js(`localStorage.getItem("ophth-audit:ann:fixture-v1:enc-tester")`)) || "{}").annotations?.T003?.q1_ophthalmic === "yes");
  check("…and no leave-page warning although an answer was not exported", dialogs.length === d0, dialogs.slice(d0));

  // a link with #key=
  await go(URL0 + "#key=" + TEST_CODE);
  check("#key= link: opens directly (no access dialog)", (await until(`!document.getElementById("sessBox").hidden`)) && (await js(`document.getElementById("accessBox").hidden`)));
  check("…the fragment is gone from the address", !(await js(`location.href`)).includes("#") && (await js(`location.hash`)) === "" && !(await js(`location.href`)).includes("pqrs"), await js(`location.href`));
  check("…and the key is remembered", JSON.stringify(await storedKeys()) === JSON.stringify([keyName]));

  // a remembered key that fails is forgotten
  await js(`localStorage.setItem(${JSON.stringify(keyName)}, btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))))`);
  await cdp("Page.reload"); await sleep(1500);
  check("a remembered key that fails: the dialog says so", (await until(`!document.getElementById("accessBox").hidden`)) && (await js(`document.getElementById("aErr").textContent`)) === STALE, await js(`document.getElementById("aErr").textContent`));
  check("…and the bad key is forgotten", (await storedKeys()).length === 0);

  // a wrong #key= link
  await go(URL0 + "#key=wrong-code-0000");
  check("wrong #key= link: the dialog says the link's code is wrong", (await until(`!document.getElementById("accessBox").hidden`)) && (await js(`document.getElementById("aErr").textContent`)) === LINK_WRONG, await js(`document.getElementById("aErr").textContent`));
  check("…and the fragment is gone", !(await js(`location.href`)).includes("#"));

  // a #key= link opened while the dialog waits (no reload: hashchange)
  await js(`location.hash = "#key=${TEST_CODE}"`);
  check("#key= added while the dialog waits: opens the data", await until(`!document.getElementById("sessBox").hidden && document.getElementById("accessBox").hidden`, 10000));
  check("…fragment gone, key remembered", !(await js(`location.href`)).includes("#") && JSON.stringify(await storedKeys()) === JSON.stringify([keyName]));

  // errors: a missing file (HTTP 404) and a damaged one
  const img5 = join(encDir, "images", "T005.bin"), aud6 = join(encDir, "audio", "T006.bin");
  renameSync(img5, img5 + ".away");
  const good6 = readFileSync(aud6), bad6 = Buffer.from(good6);
  bad6[100] ^= 0xff;
  writeFileSync(aud6, bad6);
  expectedErr = (e) => /status of 404/.test(e) && e.includes("/data/images/T005.bin");
  await cdp("Page.reload"); await sleep(1500);
  await until(`!document.getElementById("sessBox").hidden`);
  await js(`document.getElementById("sGo").click()`); await sleep(600);
  await js(`(()=>{const g=document.getElementById("goto");g.value="5";g.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))})()`);
  check("a missing image: a readable error", await until(`!document.getElementById("imgMsg").hidden && document.getElementById("imgMsg").textContent.includes("could not be loaded (HTTP 404 for images/T005.bin)")`), await js(`document.getElementById("imgMsg").textContent`));
  await shot("e4_missing_image.png");
  await key("ArrowRight");
  check("a damaged audio file: a readable error", await until(`document.getElementById("noAudio").textContent.includes("does not match the access code")`), await js(`document.getElementById("noAudio").textContent`));
  await key(" ");
  check("Space on it says the audio could not be loaded", (await js(`document.getElementById("toast").textContent`)) === "The audio could not be loaded");
  renameSync(img5 + ".away", img5);
  writeFileSync(aud6, good6);
  await key("ArrowLeft");
  check("the file is back: going to the case again loads it (failures are not kept)", await until(`AUDIT_APP.state.id==="T005" && document.getElementById("img").naturalWidth===1200 && document.getElementById("imgMsg").hidden`));
  await key("ArrowRight");
  check("…and the repaired audio plays", await until(`AUDIT_APP.state.audio==="ready" && document.getElementById("audio").duration>0`));

  // the data rebuilt with --keep-salt for a new dataset version (e.g. a second batch): the remembered key still opens it
  const src2 = join(tmpRoot, "src2");
  cpSync(FIXTURE, src2, { recursive: true });
  writeFileSync(join(src2, "manifest.js"), readFileSync(join(src2, "manifest.js"), "utf8").replace('"fixture-v1"', '"fixture-v2"'));
  execFileSync(PY, ["-B", join(ROOT, "tools", "encrypt_data.py"), "--src", src2, "--out", encDir, "--code-file", join(tmpRoot, "code.txt"), "--keep-salt"], { encoding: "utf8" });
  await cdp("Page.reload"); await sleep(1500);
  check("--keep-salt rebuild with a new dataset version: the remembered key opens it without asking",
    (await until(`!document.getElementById("sessBox").hidden`)) && (await js(`document.getElementById("accessBox").hidden`)));
  check("…the case list is the new version, and the key is now kept under it", (await js(`document.getElementById("setInfo").textContent`)).includes("fixture-v2") &&
    JSON.stringify(await storedKeys()) === JSON.stringify(["ophth-audit:key:fixture-v2:" + meta.kdf.salt]), await storedKeys());
}

// ------------------------------------------------------------------ http with the site's own (real) encrypted data
async function real() {
  const code = readFileSync(resolve(codeArg), "utf8").trim();
  const meta = await js(`fetch("data/meta.json",{cache:"no-cache"}).then(r=>r.json())`);
  check("the site's data is encrypted (ophth-audit-enc-v1)", meta.format === "ophth-audit-enc-v1" && meta.cipher === "AES-256-GCM" && meta.kdf.iterations >= 600000, { format: meta.format, n: meta.n_cases });
  check("access dialog shown", await until(`!document.getElementById("accessBox").hidden`));
  await typeCode(code, true);
  check("the access code opens the data", await until(`!document.getElementById("sessBox").hidden && document.getElementById("accessBox").hidden`, 15000));
  await startSession("Smoke Test", "researcher", 1, true);
  const n = await js(`AUDIT_APP.state.n`);
  check("every case of meta.json is in the case list", n === meta.n_cases && n > 0, { n, meta: meta.n_cases });
  const ids = await js(`AUDIT_APP.ids()`), bad = [];
  let withAudio = 0;
  for (let k = 0; k < n; k++) {
    const okI = await until(`AUDIT_APP.state.cur===${k} && document.getElementById("img").src.startsWith("blob:") && document.getElementById("img").complete && document.getElementById("img").naturalWidth>0`, 8000);
    const okA = await until(`["ready","none"].includes(AUDIT_APP.state.audio) && (AUDIT_APP.state.audio==="none" || document.getElementById("audio").duration>0)`, 8000);
    if ((await js(`AUDIT_APP.state.audio`)) === "ready") withAudio++;
    if (!okI || !okA) bad.push(ids[k] + (okI ? "" : " image") + (okA ? "" : " audio"));
    if (k === 0) { await sleep(400); await shot("r1_first_1366x768.png"); }
    if (k < n - 1) await key("ArrowRight", { wait: 30 });
  }
  check("every image and audio clip decrypts (" + n + " cases, " + withAudio + " with audio)", bad.length === 0, bad);
  check("walked to the last case", (await js(`AUDIT_APP.state.cur`)) === n - 1);
  check("only the cases around the current one stay decrypted", (await js(`AUDIT_APP.blobs()`)) <= 12, await js(`AUDIT_APP.blobs()`));
  await js(`(()=>{const g=document.getElementById("goto");g.value="1";g.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))})()`);
  await until(`AUDIT_APP.state.cur===0 && document.getElementById("img").naturalWidth>0`);
  await sleep(400);
  await layoutChecks("1366x768 window");
  await shot("r2_case1_1366x768.png");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1366, height: 657, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  await layoutChecks("1366x657 page");
  await shot("r3_case1_1366x657.png");
  await cdp("Emulation.clearDeviceMetricsOverride");
}
