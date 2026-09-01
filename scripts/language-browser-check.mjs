/**
 * Browser language-toggle regression (task t_00139ab5 — i18n foundation).
 * Usage: node scripts/language-browser-check.mjs [cdp-http-url] [app-url]
 * Expects headless Chrome with --remote-debugging-port and the app served
 * from a VITE_VERIFY=1 build (window.__qwVerify present).
 *
 * Proves, against the REAL DOM (not a reimplementation):
 *   1. Korean is the default on a clean profile (no stored key);
 *   2. the header carries a keyboard-operable EN/한국어 toggle whose
 *      aria-pressed reflects the CURRENT language (accessibility state);
 *   3. clicking EN re-renders header + disclaimer in English and stores the
 *      choice under the explicit localStorage key;
 *   4. a page RELOAD restores EN from storage (title/disclaimer English at
 *      boot, before any interaction);
 *   5. a garbage stored value falls back to Korean safely (no crash);
 *   6. keyboard focus + Enter activates the toggle (keyboard operable);
 *   7. console stays exception-free throughout.
 */
const DEBUG = process.argv[2] || "http://127.0.0.1:9333";
const APP = process.argv[3] || "http://localhost:5211/";
const LANG_KEY = "qwsolar.language.v1";

async function newTarget(url) {
  const res = await fetch(`${DEBUG}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  return res.json();
}
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(e.error || new Error("ws error"));
  });
}
function msgData(raw) {
  const d = typeof raw === "object" && raw !== null && "data" in raw ? raw.data : raw;
  return typeof d === "string" ? d : d.toString();
}
let idSeq = 0;
function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++idSeq;
    const onMsg = (raw) => {
      const msg = JSON.parse(msgData(raw));
      if (msg.id === id) {
        ws.removeEventListener("message", onMsg);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
    ws.addEventListener("message", onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evalJs(ws, expression) {
  const r = await send(ws, "Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("page exception: " + JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "ok  " : "FAIL"} - ${name}${extra ? " :: " + extra : ""}`);
  if (cond) passed++;
  else failed++;
}

const errors = [];

async function openApp(ws) {
  await send(ws, "Page.enable").catch(() => {});
  await send(ws, "Runtime.enable").catch(() => {});
  await send(ws, "Log.enable").catch(() => {});
}

const SNAP = `(() => ({
  lang: document.documentElement.lang,
  title: document.querySelector('.header h1')?.textContent ?? null,
  sub: document.querySelector('.header .sub')?.textContent ?? null,
  disclaimer: document.querySelector('.disclaimer')?.textContent ?? null,
  stored: localStorage.getItem(${JSON.stringify(LANG_KEY)}),
  toggle: !!document.querySelector('.lang-toggle'),
  pressed: [...document.querySelectorAll('.lang-toggle button')].map(b => [b.dataset.lang, b.getAttribute('aria-pressed')]),
  groupAria: document.querySelector('.lang-toggle')?.getAttribute('aria-label') ?? null,
  verifyBooted: !!window.__qwVerify,
}))()`;

const target = await newTarget(APP);
const ws = await connect(target.webSocketDebuggerUrl);
ws.addEventListener("message", (raw) => {
  const m = JSON.parse(msgData(raw));
  if (m.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(m.params));
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
    const e = m.params.entry;
    if (/favicon/i.test(e.text) || /favicon/i.test(e.url || "")) return;
    errors.push(`${e.text}${e.url ? " (" + e.url + ")" : ""}`);
  }
});
await openApp(ws);
await sleep(2500);

// Clean profile baseline: remove any stored language AND overlay state
// (a persisted collapsedAll would leave panels inert and skew later steps),
// reload to a clean slate.
await evalJs(ws, `localStorage.removeItem(${JSON.stringify(LANG_KEY)}); localStorage.removeItem("qwsolar.overlay.v1")`);
await send(ws, "Page.reload");
await sleep(2500);

// 1. default Korean
{
  const s = await evalJs(ws, SNAP);
  check("verify build booted (VITE_VERIFY)", s.verifyBooted);
  check("clean profile defaults to Korean", s.lang === "ko" && /로그 태양계/.test(s.title || ""), `lang=${s.lang}`);
  check("disclaimer starts in Korean", /로그 스케일로 압축/.test(s.disclaimer || ""));
  check("no language stored until an explicit choice", s.stored === null, String(s.stored));
}

// 2. toggle control exists, keyboard-operable, ARIA reflects current state
{
  const s = await evalJs(ws, SNAP);
  check("header carries the EN/한국어 toggle", s.toggle);
  check(
    "aria-pressed marks ONLY Korean while ko is active",
    JSON.stringify(s.pressed) === JSON.stringify([["ko", "true"], ["en", "false"]]),
    JSON.stringify(s.pressed),
  );
  check("toggle group has an aria-label", /언어|language/i.test(s.groupAria || ""), s.groupAria || "");
}

// 3. click EN → English + persisted
await evalJs(ws, `document.querySelector('.lang-toggle button[data-lang="en"]').click()`);
await sleep(300);
{
  const s = await evalJs(ws, SNAP);
  check("clicking EN switches document language", s.lang === "en", s.lang);
  check("header title becomes English", s.title === "Logarithmic Solar System", s.title || "");
  check("subtitle becomes English", /compresses real astronomical data/.test(s.sub || ""), s.sub || "");
  check("disclaimer becomes English", /logarithmic scale/.test(s.disclaimer || "") && !/로그/.test(s.disclaimer || ""));
  check("choice stored under the explicit key", s.stored === "en", String(s.stored));
  check(
    "aria-pressed moves to EN after switch",
    JSON.stringify(s.pressed) === JSON.stringify([["ko", "false"], ["en", "true"]]),
    JSON.stringify(s.pressed),
  );
  check("group aria-label follows the language", /Display language/i.test(s.groupAria || ""), s.groupAria || "");
}

// 4. reload restores English WITHOUT any interaction
await send(ws, "Page.reload");
await sleep(2500);
{
  const s = await evalJs(ws, SNAP);
  check("reload restores EN from storage", s.lang === "en" && s.title === "Logarithmic Solar System", `lang=${s.lang} title=${s.title}`);
  check("restored EN survives before first interaction", /logarithmic/.test(s.disclaimer || ""));
}

// 5. garbage stored value → safe Korean fallback
await evalJs(ws, `localStorage.setItem(${JSON.stringify(LANG_KEY)}, "klingon")`);
await send(ws, "Page.reload");
await sleep(2500);
{
  const s = await evalJs(ws, SNAP);
  check("invalid stored value falls back to Korean safely", s.lang === "ko" && /로그 태양계/.test(s.title || ""), `lang=${s.lang}`);
}

// 6. keyboard operability: focus + Enter activates EN (panels must be live —
// inert panels swallow activation, so prove visible first).
await evalJs(ws, `localStorage.removeItem(${JSON.stringify(LANG_KEY)}); localStorage.removeItem("qwsolar.overlay.v1")`);
await send(ws, "Page.reload");
await sleep(2500);
{
  const ready = await evalJs(ws, `document.querySelector('.header').inert === false`);
  check("header is interactive after clean reload (not inert)", ready);
  await evalJs(ws, `document.querySelector('.lang-toggle button[data-lang="en"]').focus()`);
  await send(ws, "Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await send(ws, "Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await sleep(300);
  const s = await evalJs(ws, SNAP);
  check("keyboard Enter on the focused EN button switches language", s.lang === "en" && s.stored === "en", `lang=${s.lang} stored=${s.stored}`);
  // H hotkey must not hijack while a BUTTON has focus? (buttons are allowed targets) — ensure H still toggles panels globally: press H, panels hidden state flips
  const before = await evalJs(ws, `document.querySelector('.overlay-dock').dataset.collapsedAll`);
  await send(ws, "Input.dispatchKeyEvent", { type: "keyDown", key: "h", code: "KeyH", windowsVirtualKeyCode: 72 });
  await send(ws, "Input.dispatchKeyEvent", { type: "keyUp", key: "h", code: "KeyH", windowsVirtualKeyCode: 72 });
  await sleep(200);
  const after = await evalJs(ws, `document.querySelector('.overlay-dock').dataset.collapsedAll`);
  check("H hotkey still works alongside the language toggle", before === "false" && after === "true", `${before}->${after}`);
  // language state is independent of panel collapse
  const s2 = await evalJs(ws, SNAP);
  check("language state independent of panel collapse", s2.lang === "en" && s2.stored === "en");
}

// 7. no console exceptions anywhere in the run
check("no page exceptions / console errors", errors.length === 0, errors.slice(0, 3).join(" | "));

ws.close();
console.log(`\n${passed} ok / ${failed} FAIL — language browser check`);
if (failed > 0) process.exit(1);
