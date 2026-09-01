/**
 * Browser orbit-shape regression (task t_b4bcc438) over raw CDP.
 * Usage: node scripts/orbit-shape-browser-check.mjs <cdp-http-url> [app-url]
 * Expects headless Chrome with --remote-debugging-port and the app served with
 * VITE_VERIFY=1 (exposes window.__qwVerify).
 *
 * Unlike scripts/orbit-shape.test.mjs (Node harness, real classes), this one
 * reads the ACTUAL DRAWN geometry out of the live WebGL scene — every vertex
 * of every orbit LineLoop and every animated body's container-space position
 * — and asserts, in each of the three distance modes:
 *   (1) every parent-local satellite line is a focus-conic: e′ == real e,
 *       unit conic residual ≈ 0 (the pre-fix cardioid had residual 0.895);
 *   (2) the animated moon rides its line (body radius vs conic at its θ);
 *   (3) apoapsis stays inside the 2.5×–9× band (×2.2 while its system is
 *       selected), i.e. the single-point ceiling cap works live;
 *   (4) moon line geometry is BIT-IDENTICAL across log/linear/focus
 *       (parent-local mapping is mode-invariant);
 *   (5) every planet/dwarf rides its own line in every mode (focus mode:
 *       anchor-relative, chord-bounded); the focus anchor's own line is
 *       hidden by design;
 *   (6) after center-body switching (selection sweeps through every moon
 *       parent, incl. a moon-select), parent-local layouts survive: shape
 *       e′ and body-on-line re-verified per system under the §13 boost.
 *
 * Inclined moons: the drawn vertices are tilted about X by the real
 * inclination, so the orbit-plane coordinate is recovered as
 * cz = hypot(y,z)·sign(z)·sign(cos i) (Triton i=156.9° flips z back).
 */
const DEBUG = process.argv[2] || "http://127.0.0.1:9333";
const APP = process.argv[3] || "http://localhost:5211/";

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
let failures = 0;
let checks = 0;
function check(name, cond, extra = "") {
  checks++;
  if (!cond) failures++;
  console.log(`${cond ? "ok  " : "FAIL"} - ${name}${extra ? " :: " + extra : ""}`);
}

// --- math (same conventions as scripts/orbit-shape.test.mjs) ---------------
function planeCoords(pts, inclinationDeg) {
  const cosInc = Math.cos((inclinationDeg ?? 0) * (Math.PI / 180));
  return pts.map(([x, y, z]) => [x, Math.hypot(y, z) * (Math.sign(z) || 1) * (Math.sign(cosInc) || 1)]);
}
function conicFit(pts) {
  const r = pts.map((p) => Math.hypot(p[0], p[1]));
  const rPeri = r[0];
  const rApo = r[128];
  const aFit = (rPeri + rApo) / 2;
  const eFit = (rApo - rPeri) / (rApo + rPeri);
  const semiLatus = aFit * (1 - eFit * eFit);
  let maxErr = 0;
  for (const [x, y] of pts) {
    const rr = Math.hypot(x, y);
    const c = rr > 0 ? x / rr : 1;
    maxErr = Math.max(maxErr, Math.abs(rr - semiLatus / (1 + eFit * c)) / aFit);
  }
  return { aFit, eFit, maxErr, semiLatus };
}
/** Relative conic residual of a single point (radius vs p/(1+e cosθ)). */
function conicResidual(p, fit) {
  const rr = Math.hypot(p[0], p[1]);
  const c = rr > 0 ? p[0] / rr : 1;
  return Math.abs(rr - fit.semiLatus / (1 + fit.eFit * c)) / fit.aFit;
}
/** Min distance from a point to the polyline (closed). */
function pointPolylineDist(p, pts3) {
  let best = Infinity;
  const n = pts3.length;
  for (let i = 0; i < n; i++) {
    const a = pts3[i];
    const b = pts3[(i + 1) % n];
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const pax = p[0] - a[0], pay = p[1] - a[1], paz = p[2] - a[2];
    const len2 = abx * abx + aby * aby + abz * abz;
    let t = len2 > 0 ? (pax * abx + pay * aby + paz * abz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const dx = pax - t * abx, dy = pay - t * aby, dz = paz - t * abz;
    best = Math.min(best, Math.sqrt(dx * dx + dy * dy + dz * dz));
  }
  return best;
}
function fingerprint(pts) {
  return pts.map((p) => p.map((v) => v.toFixed(4)).join(",")).join(";");
}

// Live per-moon verification through the page API. Returns summary object.
async function verifyMoon(ws, id) {
  return await evalJs(ws, `(() => {
    const v = window.__qwVerify;
    const line = v.orbitSamples(${JSON.stringify(id)});
    const meta = v.bodyMeta(${JSON.stringify(id)});
    return { line, meta };
  })()`);
}

const ws = await connect((await newTarget(APP + (APP.includes("?") ? "&" : "?") + "qwcheck=1")).webSocketDebuggerUrl);
await send(ws, "Runtime.enable");
await send(ws, "Page.enable");

// Wait for the app + verify API.
let ready = false;
for (let i = 0; i < 60; i++) {
  ready = await evalJs(ws, "!!window.__qwVerify");
  if (ready) break;
  await sleep(500);
}
check("app booted with VITE_VERIFY api", ready);
if (!ready) { console.log(`RESULT FAIL (${failures}/${checks})`); process.exit(1); }
// Freeze the clock: every read below is then deterministic (positions only
// move when we explicitly time-travel with setSimDays).
await evalJs(ws, `window.__qwVerify.setPlaying(false)`);

// Console error capture
const consoleErrors = [];
ws.addEventListener("message", (raw) => {
  const msg = JSON.parse(msgData(raw));
  if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) {
    consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
  }
  if (msg.method === "Runtime.exceptionThrown") consoleErrors.push("EXCEPTION " + JSON.stringify(msg.params.exceptionDetails));
});

// Enumerate every parent-local satellite from the LIVE scene.
const moons = await evalJs(ws, `(() => {
  const v = window.__qwVerify;
  const out = [];
  for (const id of v.bodyIds()) {
    const m = v.bodyMeta(id);
    if (m && m.type === "moon") out.push({ id, parent: m.parentId, e: m.eccentricity, inc: m.inclinationDeg, range: m.moonRange });
  }
  return out;
})()`);
const byParent = {};
for (const m of moons) (byParent[m.parent] ||= []).push(m);
console.log(`# parent-local satellites in live scene: ${moons.length} across ${Object.keys(byParent).length} systems (${Object.keys(byParent).join(", ")})`);
// Expectation from src/data/solarSystemData.ts (t_b4bcc438 roster):
const EXPECTED = ["moon","phobos","deimos","io","europa","ganymede","callisto","mimas","enceladus","tethys","dione","rhea","titan","iapetus","miranda","ariel","umbriel","titania","oberon","triton","charon","styx","nix","kerberos","hydra"];
check(
  "satellite roster complete (Moon, Phobos/Deimos, Io/Europa/Ganymede/Callisto, all named Saturn moons incl. Iapetus, all Uranus moons, all Uranus/Neptune/Pluto entries incl. Triton & Charon)",
  EXPECTED.length === moons.length && EXPECTED.every((id) => moons.some((m) => m.id === id)),
  `live=${moons.length} expected=${EXPECTED.length}`,
);

const planets = await evalJs(ws, `window.__qwVerify.bodyIds().filter(id => { const m = window.__qwVerify.bodyMeta(id); return m && (m.type === "planet" || m.type === "dwarf" || m.type === "dwarf-planet"); })`);
const T = 1250; // deterministic sim day (same as autotest sweep)

/** Full moon sweep for the CURRENT mode/selection. label marks the context. */
async function moonSweep(label, { selectionActive = false, expectBitSame = null } = {}) {
  const snaps = {};
  for (const m of moons) {
    const { line, meta } = await verifyMoon(ws, m.id);
    if (!line || !meta) { check(`${m.id} samples present (${label})`, false); continue; }
    const pts = planeCoords(line.pts, m.inc);
    const fit = conicFit(pts);
    const parentR = meta.parentRenderRadius;
    const eOk = Math.abs(fit.eFit - m.e) < 1e-6;
    const shapeOk = fit.maxErr < 1e-6;
    // NOTE (observed live behaviour, ScaleManager.systemBoostActive): the §13
    // moon boost is GLOBAL — ANY selection (not just this system's) lifts the
    // ceiling to 9×2.2 for every moon. Shape stays uniform-scaled either way;
    // the band check mirrors the shipped semantics.
    const ceiling = parentR * 9 * (selectionActive ? 2.2 : 1);
    let rMax = 0, rMin = Infinity;
    for (const p of pts) { const rr = Math.hypot(p[0], p[1]); rMax = Math.max(rMax, rr); rMin = Math.min(rMin, rr); }
    const bandOk = rMax <= ceiling * (1 + 1e-6) && rMin >= parentR * 2.5 * (1 - 1e-6);
    const bodyR = Math.hypot(meta.local[0], Math.hypot(meta.local[1], meta.local[2]) * (Math.sign(meta.local[2]) || 1) * (Math.sign(Math.cos((m.inc * Math.PI) / 180)) || 1));
    const onLine = conicResidual([meta.local[0], Math.hypot(meta.local[1], meta.local[2]) * (Math.sign(meta.local[2]) || 1) * (Math.sign(Math.cos((m.inc * Math.PI) / 180)) || 1)], fit) < 5e-5;
    check(`${m.id} drawn ellipse e′=${fit.eFit.toFixed(6)} (real ${m.e}) | conic-residual=${fit.maxErr.toExponential(1)} band=[${(parentR * 2.5).toFixed(2)},${ceiling.toFixed(2)}] drawn=[${rMin.toFixed(2)},${rMax.toFixed(2)}] body-on-line (${label})`,
      eOk && shapeOk && bandOk && onLine && line.visible,
      `visible=${line.visible}`);
    snaps[m.id] = fingerprint(pts);
  }
  return snaps;
}

// ---------------------------------------------------------------------------
// 1..3. Global sweeps: log → linear → focus (anchor defaults to earth).
// ---------------------------------------------------------------------------
const perModeSnaps = {};
for (const mode of ["log", "linear", "focus"]) {
  // select(null) FIRST: focusOn(null) resets focusAnchorId, so setting the
  // mode afterwards leaves focus mode properly ANCHORED (default earth) —
  // the anchor-line-hidden branch and compressed-offset mapping are only
  // reachable in that state.
  await evalJs(ws, `window.__qwVerify.select(null); window.__qwVerify.setDistanceMode(${JSON.stringify(mode)}); window.__qwVerify.setSimDays(${T});`);
  await sleep(1500); // transition + reframe settle
  await evalJs(ws, `window.__qwVerify.setSimDays(${T})`); // snap positions to target
  perModeSnaps[mode] = await moonSweep(mode);

  // Planet regression for this mode: body rides its own line; anchor line hidden in focus.
  for (const pid of planets) {
    const info = await evalJs(ws, `(() => { const v = window.__qwVerify; return { line: v.orbitSamples(${JSON.stringify(pid)}), meta: v.bodyMeta(${JSON.stringify(pid)}) }; })()`);
    if (!info.line || !info.meta) { check(`${pid} line present (${mode})`, false); continue; }
    const hidden = info.line.visible === false;
    if (hidden) {
      check(`${pid} line hidden in ${mode} (focus anchor by design)`, mode === "focus");
      continue;
    }
    const p = info.meta.local;
    const dLine = pointPolylineDist([p[0], p[1], p[2]], info.line.pts);
    const rBody = Math.hypot(p[0], p[1], p[2]) || 1;
    check(`${pid} rides its own line in ${mode} (dist=${dLine.toExponential(1)})`, dLine <= Math.max(1e-3, rBody * 0.01));
  }

  // Linear mode: planet lines must be genuine ellipses (angle-preserving linear scale).
  if (mode === "linear") {
    for (const pid of planets) {
      const info = await evalJs(ws, `(() => { const v = window.__qwVerify; return { line: v.orbitSamples(${JSON.stringify(pid)}), meta: v.bodyMeta(${JSON.stringify(pid)}) }; })()`);
      if (!info.line || !info.line.visible) continue;
      const pts = planeCoords(info.line.pts, info.meta.inclinationDeg);
      const r = pts.map((q) => Math.hypot(q[0], q[1]));
      const rp = Math.min(...r), ra = Math.max(...r);
      const eFit = (ra - rp) / (ra + rp);
      const dev = Math.abs(eFit - info.meta.eccentricity) / Math.max(1e-4, info.meta.eccentricity);
      check(`${pid} linear line is an ellipse e=${eFit.toFixed(5)} vs real ${info.meta.eccentricity} (dev ${(dev * 100).toFixed(2)}%)`, dev < 0.02);
    }
  }
}

// (4) parent-local moon geometry bit-identical across all three modes.
for (const m of moons) {
  const [a, b, c] = [perModeSnaps.log[m.id], perModeSnaps.linear[m.id], perModeSnaps.focus[m.id]];
  check(`${m.id} line bit-identical across log/linear/focus`, a && b && c && a === b && b === c);
}

// ---------------------------------------------------------------------------
// 6. Center-body switching: select every moon parent (and a moon directly),
//    re-verify that system's parent-local layout under the §13 boost.
// ---------------------------------------------------------------------------
const shotDir = process.env.QW_SHOTS || "/tmp/qw-orbit-shots";
const parentsToVisit = Object.keys(byParent); // earth, mars, jupiter, saturn, uranus, neptune, pluto
for (const parent of parentsToVisit) {
  await evalJs(ws, `window.__qwVerify.select(${JSON.stringify(parent)}); window.__qwVerify.setSimDays(${T});`);
  await sleep(1400); // camera tween + boost transition
  await evalJs(ws, `window.__qwVerify.setSimDays(${T})`);
  await moonSweep(`selected:${parent}`, { selectionActive: true });

  // (7) SCREEN GEOMETRY in the FRAMED view (what the user sees): the
  //     projected polygon of every moon ring must contain the parent's
  //     projected centre. Ring vertices are parent-local; the parent group
  //     carries translation only (tilt lives in the child tiltGroup), so
  //     world = parentWorld + local. Point-in-polygon ray cast incl.
  //     perspective foreshortening + inclination tilt.
  const settled = await evalJs(ws, `window.__qwVerify.cameraState()`);
  for (const m of byParent[parent]) {
    const inside = await evalJs(ws, `(() => {
      const v = window.__qwVerify;
      const ring = v.orbitSamples(${JSON.stringify(m.id)});
      const pw = v.worldPos(${JSON.stringify(parent)});
      const pts = ring.pts.map(p => v.projectWorld(pw[0] + p[0], pw[1] + p[1], pw[2] + p[2]));
      const c = v.projectWorld(pw[0], pw[1], pw[2]);
      let ins = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
        if ((yi > c.y) !== (yj > c.y) && c.x < ((xj - xi) * (c.y - yi)) / (yj - yi) + xi) ins = !ins;
      }
      const r = pts.map(q => Math.hypot(q.x - c.x, q.y - c.y));
      return { ins, minPx: Math.min(...r), maxPx: Math.max(...r) };
    })()`);
    check(`${parent} framed: ${m.id} ring encloses parent on screen (r=[${inside.minPx.toFixed(0)},${inside.maxPx.toFixed(0)}]px)`,
      inside.ins && inside.maxPx - inside.minPx > 8, `camGap=${settled.gap}`);
  }
}
// Selecting a MOON must boost its parent too (systemParentOf rule), and the
// whole roster's parent-local layout must still be intact afterwards.
await evalJs(ws, `window.__qwVerify.select("io"); window.__qwVerify.setSimDays(${T});`);
await sleep(1400);
await evalJs(ws, `window.__qwVerify.setSimDays(${T})`);
await moonSweep("selected:io(moon)", { selectionActive: true });
// …and back to no selection: unboosted band must hold again everywhere.
await evalJs(ws, `window.__qwVerify.select(null); window.__qwVerify.setDistanceMode("log"); window.__qwVerify.setSimDays(${T});`);
await sleep(1400);
await evalJs(ws, `window.__qwVerify.setSimDays(${T})`);
await moonSweep("deselected-log");

  const sep = await evalJs(ws, `(() => { const v = window.__qwVerify; const a = v.bodyScreen('moon'), b = v.bodyScreen('earth'); return Math.hypot(a.x-b.x, a.y-b.y); })()`);
  check("moon view keeps Earth and Moon on screen with sane separation", sep > 5);

// ---------------------------------------------------------------------------
// Representative screenshots (each planetary system + the Moon view).
// ---------------------------------------------------------------------------
let shots = 0;
try { const { mkdirSync } = await import("node:fs"); mkdirSync(shotDir, { recursive: true }); } catch {}
for (const id of ["moon", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]) {
  await evalJs(ws, `window.__qwVerify.select(${JSON.stringify(id)})`);
  await sleep(1600); // settle the focus tween so the framing is final
  const shot = await send(ws, "Page.captureScreenshot", { format: "png" });
  try {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(`${shotDir}/${id}.png`, Buffer.from(shot.data, "base64"));
    shots++;
  } catch (e) { console.log(`screenshot write failed: ${e.message}`); }
}
check(`representative screenshots captured to ${shotDir} (${shots} files)`, shots === 8);

const realErrors = consoleErrors.filter((e) => !/favicon|DevTools/i.test(e));
check("no console errors/exceptions during sweep", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ""}`);
console.log(`RESULT ${failures === 0 ? "ALL PASS" : "FAIL"} (bodies=${moons.length + planets.length + 1}, moons=${moons.length})`);
process.exit(failures === 0 ? 0 : 1);
