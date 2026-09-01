// Direct re-run of the containment test in the MOON-selected screenshot state.
const DEBUG = "http://127.0.0.1:9333";
const APP = "http://localhost:5211/";
const target = await (await fetch(`${DEBUG}/json/new?${encodeURIComponent(APP)}`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
async function ev(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  const res = r.result || {}; // CDP nests: msg.result = { result: RemoteObject, exceptionDetails? }
  if (r.exceptionDetails) return "EXC:" + (r.exceptionDetails.exception?.description || "");
  return res.result ? res.result.value : undefined;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send("Runtime.enable");
await send("Page.enable");
await sleep(2500);
for (let i = 0; i < 60; i++) { if (await ev("!!window.__qwVerify")) break; await sleep(500); }
await ev("window.__qwVerify.setPlaying(false)");
// Reproduce the screenshot state exactly: paused, log mode, moon selected, settled.
await ev("window.__qwVerify.select('moon'); window.__qwVerify.setSimDays(1250);");
await sleep(2200);
await ev("window.__qwVerify.setSimDays(1250)");
const out = await ev(`(() => {
  const v = window.__qwVerify;
  const ring = v.orbitSamples('moon');
  const pw = v.worldPos('earth');
  const pts = ring.pts.map(p => v.projectWorld(pw[0] + p[0], pw[1] + p[1], pw[2] + p[2]));
  const c = v.projectWorld(pw[0], pw[1], pw[2]);
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if ((yi > c.y) !== (yj > c.y) && c.x < ((xj - xi) * (c.y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  const r = pts.map(q => Math.hypot(q.x - c.x, q.y - c.y));
  const e = v.bodyScreen('earth'), m = v.bodyScreen('moon');
  const cam = v.cameraState();
  return JSON.stringify({
    earthOnScreen: [e.x, e.y, e.onScreen], moonOnScreen: [m.x, m.y, m.onScreen],
    earthInsideRing: ins, ringPx: [Math.min(...r).toFixed(0), Math.max(...r).toFixed(0)],
    camGap: cam.gap, anchor: cam.anchorId,
    ringScreenBox: [Math.min(...pts.map(p=>p.x)).toFixed(0), Math.min(...pts.map(p=>p.y)).toFixed(0), Math.max(...pts.map(p=>p.x)).toFixed(0), Math.max(...pts.map(p=>p.y)).toFixed(0)],
  }, null, 1);
})()`);
console.log(out);
// Also capture exactly what the screenshot showed, for cross-reference.
const shot = await send("Page.captureScreenshot", { format: "png" });
const { writeFileSync } = await import("node:fs");
writeFileSync("/tmp/qw-orbit-shots/moon-repro.png", Buffer.from(shot.result.data, "base64"));
console.log("wrote /tmp/qw-orbit-shots/moon-repro.png");
ws.close();
