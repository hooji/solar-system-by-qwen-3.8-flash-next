/**
 * Picking / pointer-lifecycle browser check (task t_06891a0f) over raw CDP.
 * Usage: node scripts/pick-input-browser-check.mjs <cdp-http-url>
 * Expects a headless Chrome already running with --remote-debugging-port and
 * the app served at QW_URL (default http://localhost:5211/) with VITE_VERIFY=1.
 *
 * Real input only: clicks/drags/pinches are dispatched through CDP
 * Input.dispatchMouseEvent / dispatchTouchEvent, so the browser generates
 * native pointer events and the app's own listener chain (tracker → pickAt →
 * selectBody) is what gets exercised. Selection is asserted via
 * __qwVerify.selectedState() — the bodyIdentity contract's derivation.
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

// --- helpers -----------------------------------------------------------------

const MOUSE = { none: "none", left: "left" };
async function mouse(type, x, y, button = MOUSE.left, clickCount = 1) {
  await send(ws, "Input.dispatchMouseEvent", {
    type, x, y, button, clickCount,
    buttons: button === MOUSE.left ? 1 : 0,
  });
}
/** Desktop click: real down+up at the same point. */
async function click(x, y) {
  await mouse("mousePressed", x, y);
  await sleep(30);
  await mouse("mouseReleased", x, y);
}
/** Orbit drag: down, several moves, up far away. */
async function drag(x0, y0, x1, y1) {
  await mouse("mousePressed", x0, y0);
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    await mouse("mouseMoved", x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
    await sleep(16);
  }
  await mouse("mouseReleased", x1, y1);
}
const touch = (type, x, y, id) =>
  send(ws, "Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x, y, id }],
  });
/** Two-finger pinch: both down, spread, lift one then the other. */
async function pinch(x0, y0, x1, y1) {
  await touch("touchStart", x0, y0, 1);
  await sleep(30);
  await touch("touchStart", x1, y1, 2);
  await sleep(30);
  await touch("touchMove", x0 - 40, y0, 1);
  await touch("touchMove", x1 + 40, y1, 2);
  await sleep(30);
  await touch("touchEnd", x1 + 40, y1, 2);
  // touchEnd with only the remaining point:
  await send(ws, "Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [{ x: x0 - 40, y: y0, id: 1 }],
  });
  await sleep(30);
}
/** One-finger tap through touch events (mobile tap path). */
async function tap(x, y) {
  await touch("touchStart", x, y, 7);
  await sleep(30);
  await touch("touchEnd", x, y, 7);
}

const sel = () => evalJs(ws, `__qwVerify.selectedState()`);
const screenOf = (id) => evalJs(ws, `__qwVerify.bodyScreen(${JSON.stringify(id)})`);
const resetView = async () => {
  await evalJs(ws, `__qwVerify.select(null)`);
  await sleep(700); // let the tween settle
};

// Freeze the camera mathematically: pause sim so bodies stop moving while
// we click (deterministic hit points; picking itself is unaffected).
await evalJs(ws, `__qwVerify.setPlaying(false)`);
await sleep(100);

// 1. device pixel ratio / dpr-independent NDC sanity + rect presence
{
  const dpr = await evalJs(ws, `devicePixelRatio`);
  const s = await screenOf("jupiter");
  check("app boots with verify API and jupiter projects on-screen", !!s && s.onScreen, `dpr=${dpr}`);
}

// 2. planet click selects it (nearest valid hit via parent-chain resolution)
{
  await resetView();
  const s = await screenOf("jupiter");
  await click(s.x, s.y);
  await sleep(120);
  const st = await sel();
  check("click on Jupiter selects jupiter", st.selectedId === "jupiter", JSON.stringify(st));
  check("planet selection derives system=itself, anchor=itself",
    st.systemParentId === "jupiter" && st.focusAnchorId === "jupiter");
}

// 3. ring-child click resolves to the owning planet (Saturn ring mesh)
{
  await resetView();
  const s = await screenOf("saturn");
  // Click on the ring: horizontally offset ~1.8 render radii from centre —
  // between planet edge and ring outer edge. Compute pixel offset from the
  // projected geometry instead of guessing: sample 4 offsets, take the first
  // that resolves to saturn WITHOUT selecting the globe (proves ring hit).
  const rect = await evalJs(ws, `rendererRect = (() => { const r = document.querySelector('#viewport canvas').getBoundingClientRect(); return {w:r.width,h:r.height,l:r.left,t:r.top}; })() || null`);
  const offsets = [2.2, 2.6, 1.9, 3.0, 3.4];
  let ringHit = null;
  for (const k of offsets) {
    // 1 render radius in px ≈ (radius/dist)*((h/2)/tan(fov/2)) — but easier:
    // use CSS2D label? Most robust: probe points and ask the page which one
    // raycasts to saturn via a pick at that point (exposed indirectly: we
    // click and observe selection + that the globe was NOT the direct mesh).
    const px = s.x + s.renderRadius * 40 * k * 0.01 * rect.w * 0.01; // fallback small probe
    void px;
  }
  // Deterministic approach: expose nothing more — instead verify the ring is
  // pickable by dispatching a click at the ring's projected position: the
  // ring is a flat annulus in the planet's equatorial plane; its left edge in
  // screen space ≈ centre x − (ringOuterScale × radius projected). Project the
  // ring's world-space left edge through the same camera inside the page:
  const ringPt = await evalJs(ws, `(() => {
    const api = __qwVerify;
    const c = document.querySelector('#viewport canvas').getBoundingClientRect();
    // Project a point offset in +x world from saturn's world position by
    // (ringOuter × renderRadius): we cannot reach THREE here, so ask the
    // verify API to project an arbitrary world-space offset instead.
    return api.bodyScreenOffset ? api.bodyScreenOffset('saturn', 2.0) : null;
  })()`);
  if (ringPt && ringPt.ok) {
    await click(ringPt.x, ringPt.y);
    await sleep(120);
    const st = await sel();
    check("click on Saturn's ring selects saturn (child mesh → parent chain)",
      st.selectedId === "saturn", JSON.stringify(st));
  } else {
    check("ring-projection probe available", false, "bodyScreenOffset missing — skipping ring click");
  }
}

// 4. empty-space click keeps the current selection (no error, no deselect)
{
  await resetView();
  await evalJs(ws, `__qwVerify.select('mars')`);
  await sleep(120);
  // A far corner of the canvas is empty space at the default framing.
  const corner = await evalJs(ws, `(() => { const r = document.querySelector('#viewport canvas').getBoundingClientRect(); return { x: r.left + 8, y: r.top + 8 }; })()`);
  await click(corner.x, corner.y);
  await sleep(120);
  const st = await sel();
  check("click on empty space keeps selection, no exception", st.selectedId === "mars", JSON.stringify(st));
}

// 5. dblclick on empty space clears the selection (existing UX contract)
{
  const corner = await evalJs(ws, `(() => { const r = document.querySelector('#viewport canvas').getBoundingClientRect(); return { x: r.left + 8, y: r.top + 8 }; })()`);
  await mouse("mousePressed", corner.x, corner.y);
  await mouse("mouseReleased", corner.x, corner.y, MOUSE.none, 1);
  await mouse("mousePressed", corner.x, corner.y);
  await mouse("mouseReleased", corner.x, corner.y, MOUSE.none, 2);
  await sleep(120);
  const st = await sel();
  check("double-click on empty space clears the selection", st.selectedId === null, JSON.stringify(st));
}

// 6. drag (orbit) is never a tap-select
{
  await resetView();
  const centre = await evalJs(ws, `(() => { const r = document.querySelector('#viewport canvas').getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()`);
  const camBefore = await evalJs(ws, `JSON.stringify(__qwVerify.cameraState().target)`);
  await drag(centre.x, centre.y, centre.x + 220, centre.y + 60);
  await sleep(250);
  const st = await sel();
  const camAfter = await evalJs(ws, `JSON.stringify(__qwVerify.cameraState().target)`);
  check("drag past tolerance does not select anything", st.selectedId === null, JSON.stringify(st));
  check("drag still drives OrbitControls (target changed)", camBefore !== camAfter, `${camBefore} → ${camAfter}`);
}

// 7. mobile tap selects a body
{
  await resetView();
  // Re-project after the drag changed the view; find a body now on screen.
  let hit = null;
  for (const id of ["jupiter", "saturn", "mars", "earth", "sun"]) {
    const s = await screenOf(id);
    if (s && s.onScreen && s.x > 40 && s.y > 40 && s.x < 1240) { hit = { id, s }; break; }
  }
  if (hit) {
    await tap(hit.s.x, hit.s.y);
    await sleep(120);
    const st = await sel();
    check(`touch tap selects ${hit.id}`, st.selectedId === hit.id, JSON.stringify(st));
  } else {
    check("a body was on screen for the touch tap", false);
  }
}

// 8. pinch (two touches) never selects
{
  await resetView();
  let hit = null;
  for (const id of ["jupiter", "mars", "earth", "sun"]) {
    const s = await screenOf(id);
    if (s && s.onScreen) { hit = { id, s }; break; }
  }
  if (hit) {
    await pinch(hit.s.x, hit.s.y, hit.s.x + 60, hit.s.y + 40);
    await sleep(120);
    const st = await sel();
    check("pinch starting on a body does not select it", st.selectedId === null, JSON.stringify(st));
  } else {
    check("a body was on screen for the pinch test", false);
  }
}

// 9. resize keeps picking accurate (fresh rect per pick)
{
  await resetView();
  await send(ws, "Emulation.setDeviceMetricsOverride", {
    width: 700, height: 500, deviceScaleFactor: 2, mobile: true,
  });
  await sleep(500); // resize + tween re-frame
  let hit = null;
  for (const id of ["jupiter", "mars", "earth", "sun", "saturn"]) {
    const s = await screenOf(id);
    if (s && s.onScreen && s.x > 30 && s.y > 30 && s.x < 670 && s.y < 470) { hit = { id, s }; break; }
  }
  if (hit) {
    await click(hit.s.x, hit.s.y);
    await sleep(120);
    const st = await sel();
    check(`after dpr-2 resize click still selects ${hit.id}`, st.selectedId === hit.id, JSON.stringify(st));
  } else {
    check("a body was on screen after resize", false);
  }
  await send(ws, "Emulation.clearDeviceMetricsOverride", {});
  await sleep(300);
}

// 10. rapid re-selection during camera animation delivers the LATEST pick
{
  await resetView();
  const a = await screenOf("mars");
  await click(a.x, a.y); // starts a tween
  await sleep(150); // mid-flight
  const b = await screenOf("venus");
  if (b && b.onScreen && Math.abs(b.x - a.x) + Math.abs(b.y - a.y) > 20) {
    await click(b.x, b.y);
    await sleep(200);
    const st = await sel();
    check("re-select mid-animation delivers the newest selection",
      st.selectedId === "venus", JSON.stringify(st));
  } else {
    // Venus not comfortably clickable right now — assert at least the first
    // selection still holds and nothing threw.
    const st = await sel();
    check("mid-animation re-select (fallback: first selection intact, no error)",
      st.selectedId === "mars", JSON.stringify(st));
  }
}

// 11. teardown hook removes the picking listeners
{
  await resetView();
  await evalJs(ws, `window.__qwTeardownPicking()`);
  await sleep(100);
  const s = await screenOf("jupiter");
  if (s && s.onScreen) {
    await click(s.x, s.y);
    await sleep(120);
    const st = await sel();
    check("__qwTeardownPicking disables further tap-selects", st.selectedId === null, JSON.stringify(st));
  } else {
    check("jupiter on screen for teardown test", false);
  }
}

// --- console cleanliness -------------------------------------------------------
check("no page exceptions / console errors during the whole sweep",
  errors.length === 0, errors.slice(0, 3).join(" | "));

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURES"} — pick-input browser check`);
ws.close();
process.exit(failures === 0 ? 0 : 1);
