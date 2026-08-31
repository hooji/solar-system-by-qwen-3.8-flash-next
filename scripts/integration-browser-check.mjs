/**
 * Integration browser check (task t_92052608) over raw CDP.
 * Usage: node scripts/integration-browser-check.mjs <cdp-http-url>
 * Expects headless Chrome with --remote-debugging-port and the app served at
 * QW_URL (default http://localhost:5211/) with VITE_VERIFY=1.
 *
 * Scope (the union-level behaviours the per-task checks could not see):
 *   - dispose: full teardown stops the rAF loop, nets every app-owned
 *     listener to zero, is idempotent, and leaves the canvas inert;
 *   - remount: after a reload the app re-boots from scratch (listeners
 *     re-registered exactly once, selection works again);
 *   - resize: window-size change keeps tap-select coordinates correct
 *     (fresh-rect NDC rule survives the merged pick/camera/panel code);
 *   - zero console errors / page exceptions / unhandled rejections through
 *     the whole sweep.
 */
const DEBUG = process.argv[2] || "http://127.0.0.1:9333";

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
  const r = await send(ws, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error("page exception: " + JSON.stringify(r.exceptionDetails));
  }
  return r.result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const errors = [];
let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "ok  " : "FAIL"} - ${name}${extra ? " :: " + extra : ""}`);
  if (!cond) {
    failures++;
    process.exitCode = 1;
  }
}

const target = await newTarget(process.env.QW_URL || "http://localhost:5211/");
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
await send(ws, "Runtime.enable");
await send(ws, "Log.enable");
await send(ws, "Page.enable");
await sleep(3500); // boot + first frames

const MOUSE = { none: "none", left: "left" };
async function mouse(type, x, y, button = MOUSE.left, clickCount = 1) {
  await send(ws, "Input.dispatchMouseEvent", {
    type, x, y, button, clickCount,
    buttons: button === MOUSE.left ? 1 : 0,
  });
}
async function click(x, y) {
  await mouse("mousePressed", x, y);
  await sleep(30);
  await mouse("mouseReleased", x, y);
}

const sel = () => evalJs(ws, `__qwVerify.selectedState()`);
const screenOf = (id) => evalJs(ws, `__qwVerify.bodyScreen(${JSON.stringify(id)})`);
const stats = () => evalJs(ws, `__qwListenerStats()`);
const frames = () => evalJs(ws, `__qwVerify.pointerDiag().frames`);

/** App-owned listener keys: canvas (5 picking + OrbitControls' set), window
 *  (resize/beforeunload/keydown/selection event). `live` is the saturating
 *  in-flight count maintained by the verify-build accounting hook. */
const APP_KEYS = [
  "element:pointerdown", "element:pointerup", "element:pointercancel",
  "element:pointermove", "element:dblclick", "element:wheel",
  "element:contextmenu", "window:resize", "window:beforeunload",
  "window:keydown", "window:qw:body-selected",
];
const lives = (s) => Object.fromEntries(APP_KEYS.map((k) => [k, s[k]?.live ?? 0]));

/** A canvas-top, probe-verified screen point for a body (panels can cover
 *  projections at small sizes — same guard as pick-input-browser-check). */
async function clickableOf(id) {
  const s = await screenOf(id);
  if (!s || !s.onScreen) return null;
  const top = await evalJs(
    ws,
    `(() => { const el = document.elementFromPoint(${s.x}, ${s.y}); const c = document.querySelector('#viewport canvas'); return !!el && (el === c || c.contains(el)); })()`,
  );
  return top ? s : null;
}
async function waitForClickable(id, maxMs = 4000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const p = await clickableOf(id);
    if (p) return p;
    await sleep(200);
  }
  return null;
}

// 1. boot + live loop
{
  const s = await screenOf("mars");
  check("app boots, verify + listener-stat hooks present", !!s && s.onScreen && (await stats()) !== undefined);
  const f0 = await frames();
  await sleep(400);
  const f1 = await frames();
  check("animation loop is running (frame counter grows)", f1 > f0, `${f0} → ${f1}`);
}

// 2. selection works pre-teardown (tap-select on a frozen sim)
await evalJs(ws, `__qwVerify.setPlaying(false)`);
{
  const s = await screenOf("mars");
  await click(s.x, s.y);
  await sleep(150);
  const st = await sel();
  check("pre-teardown click selects mars", st.selectedId === "mars", JSON.stringify(st));
}

// 3. resize keeps NDC correct (fresh-rect rule) — then restore
{
  await send(ws, "Emulation.setDeviceMetricsOverride", {
    width: 700, height: 500, deviceScaleFactor: 2, mobile: true,
  });
  await sleep(400); // resize event + rAF re-render
  await evalJs(ws, `__qwVerify.select(null)`);
  await sleep(1300); // let the global-reframe tween finish
  let done = false;
  for (const id of ["jupiter", "saturn", "mars", "earth", "venus"]) {
    const p = await waitForClickable(id, 1500);
    if (!p) continue;
    await click(p.x, p.y);
    await sleep(150);
    const st = await sel();
    check(`after resize (700×500 dpr2) click on ${id} still selects`, st.selectedId === id, JSON.stringify(st));
    done = true;
    break;
  }
  if (!done) check("a canvas-top body point was clickable after resize", false);
  await send(ws, "Emulation.clearDeviceMetricsOverride");
  await sleep(400);
}

// 4. live listener population before teardown
{
  const n = lives(await stats());
  check("app listeners live while mounted (canvas+window keys >0)",
    n["element:pointerdown"] >= 2 && n["element:pointermove"] >= 1 &&
    n["window:resize"] === 1 && n["window:beforeunload"] === 1,
    JSON.stringify(n));
}

// 5. FULL teardown: twice (idempotent), then prove the loop + listeners die
{
  await evalJs(ws, `__qwTeardownAll(); __qwTeardownAll()`);
  await sleep(150);
  const f0 = await frames();
  await sleep(500);
  const f1 = await frames();
  check("rAF loop stopped after double teardown (frame counter frozen)", f1 === f0, `${f0} → ${f1}`);

  const s = await stats();
  const leaks = APP_KEYS.filter((k) => (s[k]?.live ?? 0) > 0);
  check("every app-owned canvas/window listener released after teardown", leaks.length === 0, JSON.stringify(leaks));

  // canvas must be inert: a click on Mars' projected point changes nothing
  const before = await sel();
  const p = await clickableOf("mars");
  if (p) {
    await click(p.x, p.y);
    await sleep(150);
  }
  const after = await sel();
  check("canvas inert after teardown (click selects nothing, no throw)",
    JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before, after, clicked: !!p }));
}

// 6. remount: reload → full re-boot, single registration, selection works
{
  await send(ws, "Page.navigate", { url: process.env.QW_URL || "http://localhost:5211/" });
  await sleep(3500);
  const ok = await evalJs(ws, `!!window.__qwVerify && !!window.__qwListenerStats && !!window.__qwTeardownAll`);
  check("remount: app re-boots clean with all hooks", ok === true);

  const n = lives(await stats());
  const f0 = await frames();
  await sleep(300);
  const f1 = await frames();
  check("remount: frame loop re-armed", f1 > f0, `${f0} → ${f1}`);
  check("remount: listeners registered exactly once again (no duplicates)",
    n["element:pointerdown"] >= 2 && n["window:resize"] === 1 && n["window:beforeunload"] === 1 &&
    n["window:keydown"] === 1 && n["window:qw:body-selected"] === 1,
    JSON.stringify(n));

  await evalJs(ws, `__qwVerify.setPlaying(false)`);
  await sleep(100);
  await evalJs(ws, `__qwVerify.select(null)`);
  await sleep(1300);
  const s = await screenOf("earth");
  await click(s.x, s.y);
  await sleep(150);
  const st = await sel();
  check("remount: click-select works after re-boot", st.selectedId === "earth", JSON.stringify(st));
}

// 7. console hygiene over the whole sweep
await sleep(300);
check("no page exceptions / console errors during the whole sweep", errors.length === 0, errors.join(" | ").slice(0, 400));

console.log(failures === 0 ? "\nALL PASS — integration browser check" : `\n${failures} FAILURE(S)`);
ws.close();
process.exit(failures === 0 ? 0 : 1);
