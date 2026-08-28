/**
 * Browser check for the overlay toggle system (task t_30700e13) over raw CDP.
 * Usage: node scripts/overlay-browser-check.mjs <url> <ws-endpoint-json-url>
 * Expects a headless Chrome already running with --remote-debugging-port.
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

function check(name, cond, extra = "") {
  console.log(`${cond ? "ok  " : "FAIL"} - ${name}${extra ? " :: " + extra : ""}`);
  if (!cond) process.exitCode = 1;
}

const errors = [];

const target = await newTarget(process.env.QW_URL || "http://localhost:5212/");
const ws = await connect(target.webSocketDebuggerUrl);
ws.addEventListener("message", (raw) => {
  const m = JSON.parse(msgData(raw));
  if (m.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(m.params));
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
    const e = m.params.entry;
    // No favicon is shipped in this demo; its 404 is not an app error.
    if (/favicon/i.test(e.text) || /favicon/i.test(e.url || "")) return;
    errors.push(`${e.text}${e.url ? " (" + e.url + ")" : ""}`);
  }
});
await send(ws, "Runtime.enable");
await send(ws, "Log.enable");
await sleep(3500); // boot + first frames

const vis = `(id) => {
  const el = document.querySelector('[data-panel="'+id+'"]');
  if (!el) return {missing:true};
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const cx = Math.min(Math.max(r.left+4, 0), innerWidth-1), cy = Math.min(Math.max(r.top+4,0), innerHeight-1);
  const hit = document.elementFromPoint(cx, cy);
  return {
    opacity: parseFloat(cs.opacity),
    collapsed: el.classList.contains('panel-collapsed'),
    inert: el.inert,
    ariaHidden: el.getAttribute('aria-hidden'),
    blocksPointer: !!hit && (hit === el || el.contains(hit)),
  };
}`;

// 1. panels registered with collapse buttons + ARIA
const reg = await evalJs(ws, `({
  panels: [...document.querySelectorAll('.panel[data-panel]')].map(e=>e.dataset.panel),
  buttons: document.querySelectorAll('.panel-collapse').length,
  labels: [...document.querySelectorAll('.panel-collapse')].map(b=>b.getAttribute('aria-label')),
  dock: !!document.querySelector('.overlay-dock'),
})`);
check("3 panels registered (header, control, info)", JSON.stringify(reg.panels.sort()) === '["control","header","info"]', JSON.stringify(reg.panels));
check("each panel has an individual collapse button", reg.buttons === 3);
check("collapse buttons carry ARIA labels", reg.labels.every((l) => /패널 (숨기기|표시)/.test(l)), reg.labels.join("|"));
check("dock exists for global toggle + restore", reg.dock);

// 2. initial state: header/control visible; info panel is legitimately empty
// (hidden) until a body is selected, but must not be collapsed by the overlay system.
for (const p of ["header", "control"]) {
  const s = await evalJs(ws, `(${vis})("${p}")`);
  check(`${p}: visible on load, no pointer capture issue`, s.opacity === 1 && !s.collapsed && !s.inert && s.blocksPointer);
}
{
  const s = await evalJs(ws, `(${vis})("info")`);
  check("info: not collapsed by overlay system on load", !s.collapsed && !s.inert && s.opacity === 1);
}

// 3. individual collapse via button click
await evalJs(ws, `document.querySelector('.panel-collapse[data-panel="control"]').click()`);
await sleep(450);
let cs = await evalJs(ws, `(${vis})("control")`);
check("control hides after its collapse button", cs.opacity === 0 && cs.collapsed && cs.inert === true && cs.ariaHidden === "true");
check("collapsed panel does not capture pointer input", !cs.blocksPointer);
let hs = await evalJs(ws, `(${vis})("header")`);
check("header unaffected by control collapse", hs.opacity === 1);
const chips = await evalJs(ws, `[...document.querySelectorAll('.dock-chip')].map(c=>c.textContent)`);
check("restore chip appears for hidden panel", JSON.stringify(chips) === '["제어"]', JSON.stringify(chips));
const stored = await evalJs(ws, `localStorage.getItem("qwsolar.overlay.v1")`);
check("state persisted to localStorage", !!stored && JSON.parse(stored).collapsed.control === true, stored);

// 4. global button hides all, canvas keeps full screen
await evalJs(ws, `document.querySelector('.dock-global').click()`);
await sleep(450);
const allHidden = await evalJs(ws, `["header","control","info"].every(p=>{const el=document.querySelector('[data-panel="'+p+'"]');const c=getComputedStyle(el);const r=el.getBoundingClientRect();const h=document.elementFromPoint(Math.min(Math.max(r.left+4,0),innerWidth-1),Math.min(Math.max(r.top+4,0),innerHeight-1));return c.opacity==='0'&&el.inert&&!(h&&(h===el||el.contains(h)))})`);
check("global toggle hides all panels, none capture pointer", allHidden);
const canvasTop = await evalJs(ws, `(() => {const c=document.querySelector('#viewport canvas');const r=c.getBoundingClientRect();const hit=document.elementFromPoint(r.width/2, r.height/2);return hit===c||c.contains(hit)})()`);
check("only 3D canvas remains hit-testable at center", canvasTop === true);
const dockVisible = await evalJs(ws, `(() => {const d=document.querySelector('.overlay-dock');const r=d.getBoundingClientRect();const h=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);return !!h && d.contains(h)})()`);
check("dock stays reachable while everything is hidden", dockVisible === true);

// 5. H hotkey restores
await evalJs(ws, `window.__keys=[];window.addEventListener("keydown",e=>window.__keys.push(e.key))`);
for (const type of ["keyDown", "keyUp"]) {
  await send(ws, "Input.dispatchKeyEvent", {
    type, key: "h", code: "KeyH", text: type === "keyDown" ? "h" : undefined,
    windowsVirtualKeyCode: 72, nativeVirtualKeyCode: 72,
  });
}
await sleep(450);
const keysSeen = await evalJs(ws, `window.__keys`);
check("page received the H keydown", keysSeen.includes("h"), JSON.stringify(keysSeen));
const restored = await evalJs(ws, `(() => { const s = window.__qwOverlay.getState(); return !s.collapsedAll
  && ["header","info"].every(p=>!document.querySelector('[data-panel="'+p+'"]').classList.contains('panel-collapsed')); })()`);
check("H key exits global-hide, restoring per-panel layout", restored === true);
cs = await evalJs(ws, `(${vis})("control")`);
check("control stays individually collapsed after H-restore (layout preserved)", cs.collapsed === true && cs.inert === true);

// 6. restore chip re-opens the single panel
await evalJs(ws, `document.querySelector('.dock-chip').click()`);
await sleep(450);
cs = await evalJs(ws, `(${vis})("control")`);
check("chip restores the collapsed panel", cs.opacity === 1 && !cs.collapsed);

// 7. selection event auto-shows info even from full hide
await evalJs(ws, `document.querySelector('.dock-global').click()`); // hide all
await sleep(450);
await evalJs(ws, `window.__qwSelect("mars")`);
await sleep(450);
const infoS = await evalJs(ws, `(${vis})("info")`);
const infoText = await evalJs(ws, `document.querySelector('.info-panel').textContent.includes("화성")`);
check("body selection shows info panel from global-collapsed state", infoS.opacity === 1 && !infoS.collapsed);
check("info panel content follows the selection (화성/Mars)", infoText === true);

// 8. persistence across reload
const before = await evalJs(ws, `localStorage.getItem("qwsolar.overlay.v1")`);
await send(ws, "Page.reload", { ignoreCache: true });
await sleep(3500);
const after = await evalJs(ws, `localStorage.getItem("qwsolar.overlay.v1")`);
const stateAfterReload = await evalJs(ws, `window.__qwOverlay.getState()`);
check("localStorage survives reload", before === after, after);
check("collapsed state rehydrates on reload", JSON.stringify(stateAfterReload) === JSON.stringify(JSON.parse(after)), JSON.stringify(stateAfterReload));

// 9. reduced-motion: transitions suppressed (emulate, then check style rule exists)
await send(ws, "Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await sleep(200);
const rm = await evalJs(ws, `getComputedStyle(document.querySelector('[data-panel="header"]')).transitionDuration`);
check("prefers-reduced-motion kills panel transitions", rm === "0s", rm);
await send(ws, "Emulation.setEmulatedMedia", { features: [] });

// 10. small viewport: dock + restore reachable, not overlapping controls
await send(ws, "Emulation.setDeviceMetricsOverride", { width: 420, height: 720, deviceScaleFactor: 1, mobile: true });
await sleep(600);
const overlap = await evalJs(ws, `(() => {
  const d = document.querySelector('.overlay-dock').getBoundingClientRect();
  const cp = document.querySelector('.control-panel').getBoundingClientRect();
  const inf = document.querySelector('.info-panel').getBoundingClientRect();
  const hit = (a,b)=> !(a.right<b.left||a.left>b.right||a.bottom<b.top||a.top>b.bottom);
  const g = document.elementFromPoint(d.left+d.width/2, d.top+d.height/2);
  return { overlapCtrl: hit(d,cp), overlapInfo: hit(d,inf), reachable: !!g && document.querySelector('.overlay-dock').contains(g) };
})()`);
check("420px: dock does not overlap control panel", overlap.overlapCtrl === false);
check("420px: dock does not overlap info panel", overlap.overlapInfo === false);
check("420px: dock hit-testable (not covered/lost)", overlap.reachable === true);

// 11. keyboard access: buttons focusable via tab
const focusable = await evalJs(ws, `(() => {
  const b=document.querySelector('.panel-collapse[data-panel="header"]');
  b.focus();
  return document.activeElement === b;
})()`);
check("collapse buttons reachable by keyboard focus", focusable === true);

console.log(`\nconsole/page errors: ${errors.length}`);
if (errors.length) { console.log(errors.slice(0, 5).join("\n")); process.exitCode = 1; }
ws.close();