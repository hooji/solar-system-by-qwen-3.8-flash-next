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
const touchPts = (type, pts) =>
  send(ws, "Input.dispatchTouchEvent", {
    type,
    touchPoints:
      type === "touchEnd"
        ? pts.filter((p) => !p.end)
        : pts,
  });
/** Two-finger pinch: touchPoints is the FULL new active set — CDP diffs it
 *  against the previous event to press/move/release one point at a time
 *  (omitting a still-down finger is rejected). The app sees native touch* →
 *  pointer* transitions for two pointerIds. */
async function pinch(x0, y0, x1, y1) {
  await touchPts("touchStart", [{ x: x0, y: y0, id: 1 }]);
  await sleep(30);
  await touchPts("touchStart", [
    { x: x0, y: y0, id: 1 },
    { x: x1, y: y1, id: 2 },
  ]);
  await sleep(30);
  await touchPts("touchMove", [
    { x: x0 - 40, y: y0, id: 1 },
    { x: x1 + 40, y: y1, id: 2 },
  ]);
  await sleep(30);
  // Lift finger 2: remaining active set is finger 1 only.
  await touchPts("touchEnd", [{ x: x0 - 40, y: y0, id: 1 }]);
  await sleep(30);
  // Lift finger 1: empty remaining set ends the gesture.
  await touchPts("touchEnd", []);
  await sleep(30);
}
/** One-finger tap through touch events (mobile tap path). */
async function tap(x, y) {
  await touchPts("touchStart", [{ x, y, id: 7 }]);
  await sleep(30);
  await touchPts("touchEnd", []);
}

const sel = () => evalJs(ws, `__qwVerify.selectedState()`);
const screenOf = (id) => evalJs(ws, `__qwVerify.bodyScreen(${JSON.stringify(id)})`);
/** True when the topmost element at (x,y) is the WebGL canvas — a body's
 *  projected point can fall under an overlay panel at small sizes, where a
 *  click legitimately hits the panel, not the scene. */
const canvasTopAt = (x, y) =>
  evalJs(
    ws,
    `(() => { const el = document.elementFromPoint(${x}, ${y}); const c = document.querySelector('#viewport canvas'); return !!el && (el === c || c.contains(el)); })()`,
  );
/** Wait until the camera is truly at rest: tween finished AND successive
 *  position samples stop changing (OrbitControls damping keeps a small
 *  residual drift after gestures like the pinch test — fixed sleeps race it). */
async function waitForCameraSettle(maxMs = 4000) {
  let prev = await evalJs(ws, `JSON.stringify(__qwVerify.cameraState().position)`);
  let still = 0;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await sleep(120);
    const st = await evalJs(ws, `__qwVerify.cameraState()`);
    const now = JSON.stringify(st.position);
    if (!st.tweenActive && now === prev) {
      if (++still >= 2) return true;
    } else {
      still = 0;
    }
    prev = now;
  }
  return false;
}
const resetView = async () => {
  await evalJs(ws, `__qwVerify.select(null)`);
  await waitForCameraSettle();
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
  // Saturn's ring sits in its tilted equatorial plane; find a screen point
  // along camera-right where the DIRECT raycast hit is the ring mesh itself
  // ("ring:saturn"), then click there for real.
  let ringPt = null;
  for (const k of [1.9, 2.1, 1.6, 2.3, 1.4, 2.5]) {
    const p = await evalJs(ws, `__qwVerify.bodyScreenOffset('saturn', ${k})`);
    if (!p || !p.onScreen) continue;
    const probe = await evalJs(ws, `__qwVerify.pickProbe(${p.x}, ${p.y})`);
    if (probe.direct === "ring:saturn" && probe.id === "saturn") {
      ringPt = { ...p, direct: probe.direct };
      break;
    }
  }
  if (ringPt) {
    await click(ringPt.x, ringPt.y);
    await sleep(120);
    const st = await sel();
    check("click on Saturn's ring selects saturn (child mesh → parent chain)",
      st.selectedId === "saturn", JSON.stringify({ ...st, direct: ringPt.direct, k: ringPt.k }));
  } else {
    check("a ring-direct hit point was found on Saturn", false, "ring plane not hit at sampled offsets");
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
  await mouse("mousePressed", corner.x, corner.y, MOUSE.left, 1);
  await mouse("mouseReleased", corner.x, corner.y, MOUSE.left, 1);
  await mouse("mousePressed", corner.x, corner.y, MOUSE.left, 2);
  await mouse("mouseReleased", corner.x, corner.y, MOUSE.left, 2);
  await sleep(120);
  const st = await sel();
  check("double-click on empty space clears the selection", st.selectedId === null, JSON.stringify(st));
}

// 6. drag (orbit) is never a tap-select
{
  await resetView();
  const centre = await evalJs(ws, `(() => { const r = document.querySelector('#viewport canvas').getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()`);
  // Rotation orbits around controls.target — the TARGET never moves; the
  // evidence that OrbitControls received the drag is the CAMERA POSITION.
  const camBefore = await evalJs(ws, `JSON.stringify(__qwVerify.cameraState().position)`);
  await drag(centre.x, centre.y, centre.x + 220, centre.y + 60);
  await sleep(400); // let damping settle so the next test starts from rest
  const st = await sel();
  const camAfter = await evalJs(ws, `JSON.stringify(__qwVerify.cameraState().position)`);
  check("drag past tolerance does not select anything", st.selectedId === null, JSON.stringify(st));
  check("drag still drives OrbitControls (camera position changed)", camBefore !== camAfter, `${camBefore} → ${camAfter}`);
}

// 7. mobile tap selects a body
{
  await resetView();
  // Re-project after the drag changed the view; only tap a point whose LIVE
  // raycast resolves to that body (damping tail can shift the camera between
  // round-trips — probe-then-tap keeps this about input plumbing).
  let done = false;
  for (const id of ["jupiter", "saturn", "mars", "earth", "sun"]) {
    const s = await screenOf(id);
    if (!s || !s.onScreen || s.x < 40 || s.y < 40 || s.x > 1240) continue;
    const probe = await evalJs(ws, `__qwVerify.pickProbe(${s.x}, ${s.y})`);
    if (probe.id !== id) continue;
    const top = await canvasTopAt(s.x, s.y);
    if (!top) continue;
    await tap(s.x, s.y);
    await sleep(150);
    const st = await sel();
    check(`touch tap selects ${id}`, st.selectedId === id, JSON.stringify(st));
    done = true;
    break;
  }
  if (!done) check("a probe-verified body was tap-able", false);
}

// 7b. moon click selects the moon and derives parent as system/anchor
{
  await resetView();
  await evalJs(ws, `__qwVerify.select('earth')`);
  await sleep(1200); // camera lands on the Earth system → the Moon is clickable
  const m = await screenOf("moon");
  if (m && m.onScreen) {
    const probe = await evalJs(ws, `__qwVerify.pickProbe(${m.x}, ${m.y})`);
    await click(m.x, m.y);
    await sleep(120);
    const st = await sel();
    // If the probe/globe won the raycast, the selection is earth — accept
    // moon only when the direct hit was the moon mesh; assert accordingly.
    if (probe.id === "moon") {
      check("click on the Moon selects moon", st.selectedId === "moon", JSON.stringify(st));
      check("moon selection derives system=earth, anchor=earth",
        st.systemParentId === "earth" && st.focusAnchorId === "earth", JSON.stringify(st));
    } else {
      check("moon raycast point was reachable", false, `probe hit ${probe.id} at moon screen pos`);
    }
  } else {
    check("moon projected on screen after earth focus", false, JSON.stringify(m));
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
  // Fresh page: the pinch test leaves OrbitControls damping residuals that
  // no fixed settle can fully erase — a reload is the deterministic reset.
  await send(ws, "Page.reload", {});
  await sleep(3500); // boot + first frames (listeners/errors keep streaming)
  await evalJs(ws, `__qwVerify.setPlaying(false)`);
  await send(ws, "Emulation.setDeviceMetricsOverride", {
    width: 700, height: 500, deviceScaleFactor: 2, mobile: false,
  });
  await waitForCameraSettle(); // resize + camera fully at rest at the new size
  let done = false;
  for (const id of ["jupiter", "mars", "earth", "sun", "saturn"]) {
    const s = await screenOf(id);
    if (!s || !s.onScreen || s.x < 30 || s.y < 30 || s.x > 670 || s.y > 470) continue;
    // Only click points whose LIVE raycast already resolves to this body —
    // the camera may still nudge between two round-trips; probe-then-click
    // keeps the assertion about coordinate accuracy, not timing.
    const probe = await evalJs(ws, `__qwVerify.pickProbe(${s.x}, ${s.y})`);
    if (probe.id !== id) continue;
    await click(s.x, s.y);
    await sleep(120);
    const st = await sel();
    check(`after dpr-2 resize click still selects ${id}`, st.selectedId === id, JSON.stringify(st));
    done = true;
    break;
  }
  if (!done) check("a probe-verified body was clickable after resize", false);
  await send(ws, "Emulation.clearDeviceMetricsOverride", {});
  await sleep(300);
}

// 10. rapid re-selection during camera animation delivers the LATEST pick
{
  await resetView(); // global framing: multiple bodies comfortably clickable
  // Pre-probe TWO distinct bodies at REST, then click both while the first
  // tween is still running. The ease-in-out tween barely moves in its first
  // ~200ms (cubic k≈0.02 at t=0.15), so the pre-probed points are still
  // valid at the second click; probing mid-flight instead would race the
  // projection itself.
  const pts = [];
  for (const id of ["mars", "earth", "jupiter", "saturn", "sun", "venus"]) {
    const s = await screenOf(id);
    if (!s || !s.onScreen || s.x < 40 || s.y < 40 || s.x > 660 || s.y > 460) continue;
    const probe = await evalJs(ws, `__qwVerify.pickProbe(${s.x}, ${s.y})`);
    if (probe.id !== id) continue;
    if (!(await canvasTopAt(s.x, s.y))) continue;
    pts.push({ id, s });
    if (pts.length === 2) break;
  }
  if (pts.length === 2) {
    const [a, b] = pts;
    await click(a.s.x, a.s.y); // starts a tween
    await sleep(150); // mid-flight (tween definitely active)
    const mid = await evalJs(ws, `__qwVerify.cameraState().tweenActive`);
    await click(b.s.x, b.s.y);
    await sleep(200);
    const st = await sel();
    check("re-select mid-animation delivers the newest selection",
      st.selectedId === b.id, JSON.stringify({ ...st, first: a.id, second: b.id, midFlight: mid }));
  } else {
    check("two probe-verified bodies were clickable at rest", false, pts.map((p) => p.id).join(","));
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
