// Step-by-step projection probe (t_b4bcc438 debug).
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
  if (r.exceptionDetails) return { EXCEPTION: r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails) };
  if (r.result.subtype === "error") return { ERROR: JSON.stringify(r.result) };
  return { value: r.result.value };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send("Runtime.enable");
console.log("ready:", await ev("!!window.__qwVerify"));
for (let i = 0; i < 40; i++) { const r = await ev("!!window.__qwVerify"); if (r.value) break; await sleep(500); }
console.log("api keys:", await ev("Object.keys(window.__qwVerify||{}).join(',')"));
console.log("select:", await ev("window.__qwVerify.setPlaying(false); window.__qwVerify.select('moon'); window.__qwVerify.setSimDays(1250); 'ok'"));
await sleep(2000);
console.log("ring:", await ev("window.__qwVerify.orbitSamples('moon').pts.length + ' vis=' + window.__qwVerify.orbitSamples('moon').visible"));
console.log("earth:", await ev("JSON.stringify(window.__qwVerify.worldPos('earth'))"));
console.log("proj:", await ev("JSON.stringify(window.__qwVerify.projectWorld(0,0,0))"));
console.log("poly:", await ev(`(() => {
  const v = window.__qwVerify;
  const ring = v.orbitSamples('moon');
  const pw = v.worldPos('earth');
  const pts = ring.pts.map(p => v.projectWorld(pw[0]+p[0], pw[1]+p[1], pw[2]+p[2]));
  const c = v.projectWorld(pw[0], pw[1], pw[2]);
  const xs = pts.map(q=>q.x), ys = pts.map(q=>q.y);
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if ((yi > c.y) !== (yj > c.y) && c.x < ((xj - xi) * (c.y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return JSON.stringify({ c, cx: [Math.min(...xs), Math.max(...xs)], cy: [Math.min(...ys), Math.max(...ys)], inside: ins });
})()`));
ws.close();
