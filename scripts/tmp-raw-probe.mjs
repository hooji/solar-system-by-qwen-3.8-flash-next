// Raw CDP probe — print full Runtime.evaluate responses.
const DEBUG = "http://127.0.0.1:9333";
const APP = "http://localhost:5211/";
const target = await (await fetch(`${DEBUG}/json/new?${encodeURIComponent(APP)}`, { method: "PUT" })).json();
console.log("target:", target.url, target.id);
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Runtime.enable");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2500);
for (const expr of ["1+1", "document.readyState", "typeof window.__qwVerify"]) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  console.log(expr, "=>", JSON.stringify(r).slice(0, 300));
}
ws.close();
