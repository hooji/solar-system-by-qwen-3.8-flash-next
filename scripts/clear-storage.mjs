// One-off: clear localStorage on the app origin in the debug Chrome, so the
// CDP browser checks start from a clean profile (they assume no prior state).
const DEBUG = process.argv[2] || "http://127.0.0.1:9333";
const APP = process.argv[3] || "http://localhost:5211/";
const t = await (await fetch(`${DEBUG}/json/new?${encodeURIComponent(APP)}`, { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const send = (m, p = {}) =>
  new Promise((res, rej) => {
    const i = ++id;
    const h = (e) => {
      const msg = JSON.parse(typeof e.data === "string" ? e.data : e.data.toString());
      if (msg.id === i) {
        ws.removeEventListener("message", h);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      }
    };
    ws.addEventListener("message", h);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
await send("Runtime.enable");
await new Promise((r) => setTimeout(r, 1500));
await send("Runtime.evaluate", { expression: "localStorage.clear()" });
console.log("localStorage cleared on app origin");
ws.close();
