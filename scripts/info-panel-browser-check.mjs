/**
 * Browser check for the label + info-panel selection wiring (task t_d9203468)
 * over raw CDP. Usage: node scripts/info-panel-browser-check.mjs [debug-url]
 * Expects a headless Chrome already running with --remote-debugging-port and
 * a VITE_VERIFY=1 dev server (QW_URL env, default http://localhost:5213/).
 *
 * Covers the task's completion bar: exact bilingual names + real data for a
 * planet AND a moon selection, km/AU consistency, render-vs-real separation,
 * no undefined/NaN leaks, label update on selection change, auto-restore of a
 * collapsed (individual AND global) panel on new selection, live refresh of
 * the panel while bodies move, and resize/mobile validity.
 */
const DEBUG = process.argv[2] || "http://127.0.0.1:9334";

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
const target = await newTarget(process.env.QW_URL || "http://localhost:5213/");
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
await sleep(3500); // boot + first frames

// Panel snapshot: text content of the info panel + visibility facts.
const infoSnap = `(() => {
  const el = document.querySelector('[data-panel="info"]');
  const cs = getComputedStyle(el);
  return {
    hidden: el.hidden,
    collapsed: el.classList.contains('panel-collapsed'),
    opacity: parseFloat(cs.opacity),
    text: el.textContent,
  };
})()`;

// Labels snapshot: which CSS2D labels are visible (ko text).
const labelSnap = `[...document.querySelectorAll('.label')].filter(l=>{
  const o=l.parentElement; // CSS2DObject div wrapper keeps visibility on the element itself
  return getComputedStyle(l).display!=='none' && l.style.display!=='none';
}).map(l=>l.querySelector('.label-ko').textContent)`;

// --- 1. planet selection: exact bilingual name + real data -------------------
await evalJs(ws, `window.__qwSelect("jupiter")`);
await sleep(2200); // panel paints instantly; the 1.0s camera tween must also
                   // settle before distance-based label declutter is valid
let s = await evalJs(ws, infoSnap);
check("planet: bilingual name in title (목성 · Jupiter)", s.text.includes("목성") && s.text.includes("Jupiter"));
check("planet: real-data section present", s.text.includes("실제 천문 데이터"));
check("planet: render section clearly separated", s.text.includes("렌더") && s.text.includes("실데이터 아님"));
check("planet: real radius with km unit", / km/.test(s.text));
check("planet: distance carries both AU and km", s.text.includes("AU") && s.text.includes("km"));
check("planet: period has a unit (일 or 년)", /[일년]/.test(s.text));
check("planet: no undefined/NaN leaks", !/undefined|NaN/.test(s.text));
check("planet: moon list uses bilingual names", s.text.includes("이오") && s.text.includes("Io"));

// Labels follow selection: Jupiter moons appear.
let labels = await evalJs(ws, labelSnap);
check("labels: Jupiter system revealed (이오·에우로파·가니메데·칼리스토)",
  ["이오", "에우로파", "가니메데", "칼리스토"].every((m) => labels.includes(m)),
  JSON.stringify(labels));

// --- 2. moon selection: parent-local real data --------------------------------
await evalJs(ws, `window.__qwSelect("io")`);
await sleep(600);
s = await evalJs(ws, infoSnap);
check("moon: bilingual name in title (이오 · Io)", s.text.includes("이오") && s.text.includes("Io"));
check("moon: distance labelled against parent (목성(Jupiter) 기준)", s.text.includes("목성(Jupiter) 기준"));
check("moon: km figure with AU conversion", /km\s*\([\d.]+ AU\)/.test(s.text), s.text.match(/[\d,]+ km \([\d.]+ AU\)/)?.[0]);
check("moon: no undefined/NaN leaks", !/undefined|NaN/.test(s.text));

// km/AU consistency: parse both figures and cross-check against the constant.
const cross = await evalJs(ws, `(() => {
  const m = document.querySelector('.info-panel').textContent.match(/([\\d,]+) km \\(([\\d.]+) AU\\)/);
  if (!m) return null;
  const km = Number(m[1].replace(/,/g, "")), au = Number(m[2]);
  return { km, au, rel: Math.abs(km/149597870.7 - au) / au };
})()`);
check("moon: km and AU figures mutually consistent (<1e-3 rel)", cross && cross.rel < 1e-3, JSON.stringify(cross));

// --- 3. render-vs-real never conflated ----------------------------------------
const separated = await evalJs(ws, `(() => {
  const dds = [...document.querySelectorAll('.info-panel dd')].map(d=>d.textContent);
  const renderUnits = dds.filter(v=>/units/.test(v));
  const realKm = dds.filter(v=>/(km|AU)/.test(v) && !/units/.test(v));
  return { renderUnits: renderUnits.length, realKm: realKm.length };
})()`);
check("render values use 'units', real values use km/AU — separate rows",
  separated.renderUnits >= 2 && separated.realKm >= 3, JSON.stringify(separated));

// --- 4. live refresh while the body moves (tick path, NO re-selection) --------
await evalJs(ws, `window.__qwVerify.setSimDays(0); window.__qwVerify.select("earth")`);
await sleep(800);
const snapEarth = `(() => {
  const t = [...document.querySelectorAll('.info-panel dt')].find(d=>d.textContent==='현재 실제 거리');
  return t ? t.nextElementSibling.textContent : null;
})()`;
const before = await evalJs(ws, snapEarth);
// Move sim time WITHOUT touching the selection: only the frame-loop
// info.refresh() path can update the panel now.
await evalJs(ws, `window.__qwVerify.setSimDays(100)`);
await sleep(900); // ≥1 refresh tick (200ms cadence)
const after = await evalJs(ws, snapEarth);
check("panel re-renders the SAME selection at new sim time (tick refresh)", !!before && !!after && before !== after,
  `${before} -> ${after}`);
const stillEarth = await evalJs(ws, `document.querySelector('.info-panel h2').textContent.includes("지구")`);
check("tick refresh keeps the selection identity (지구)", stillEarth === true);

// --- 5. collapse-then-select auto-restore via the state interface --------------
// (a) individual collapse
await evalJs(ws, `document.querySelector('.panel-collapse[data-panel="info"]').click()`);
await sleep(450);
let pre = await evalJs(ws, infoSnap);
check("info individually collapsed first", pre.collapsed === true && pre.opacity === 0);
await evalJs(ws, `window.__qwSelect("mars")`);
await sleep(500);
s = await evalJs(ws, infoSnap);
check("new selection auto-restores individual collapse", s.opacity === 1 && !s.collapsed);
check("restored content follows the new selection (화성)", s.text.includes("화성") && s.text.includes("Mars"));

// (b) global hide
await evalJs(ws, `document.querySelector('.dock-global').click()`);
await sleep(450);
pre = await evalJs(ws, infoSnap);
check("info globally hidden first", pre.opacity === 0);
await evalJs(ws, `window.__qwSelect("titan")`);
await sleep(500);
s = await evalJs(ws, infoSnap);
check("new selection auto-restores global hide", s.opacity === 1 && !s.collapsed);
check("moon selection from global hide shows bilingual name (타이탄 · Titan)",
  s.text.includes("타이탄") && s.text.includes("Titan"));

// --- 6. moving-body label + panel stay in sync with selection -------------------
const sync = await evalJs(ws, `(() => {
  const st = window.__qwOverlay.getState();
  const title = document.querySelector('.info-panel h2').textContent;
  return { info: st.collapsed.info, collapsedAll: st.collapsedAll, title };
})()`);
check("overlay state and panel content agree (no divergent display)", sync.info === false && sync.title.includes("타이탄"),
  JSON.stringify(sync));

// --- 7. resize + mobile: selection state stays valid ---------------------------
await send(ws, "Emulation.setDeviceMetricsOverride", { width: 420, height: 720, deviceScaleFactor: 1, mobile: true });
await sleep(700);
await evalJs(ws, `window.__qwSelect("europa")`);
await sleep(600);
const mob = await evalJs(ws, `(() => {
  const el = document.querySelector('[data-panel="info"]');
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const inView = r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
  return { visible: !el.classList.contains('panel-collapsed') && parseFloat(cs.opacity) === 1,
           inView, text: el.textContent };
})()`);
check("mobile 420px: selection shows info panel inside viewport", mob.visible && mob.inView);
check("mobile 420px: moon bilingual content (에우로파 · Europa)", mob.text.includes("에우로파") && mob.text.includes("Europa"));
await send(ws, "Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await sleep(500);
const desk = await evalJs(ws, `(() => {
  const el = document.querySelector('[data-panel="info"]');
  return { visible: parseFloat(getComputedStyle(el).opacity) === 1, text: el.textContent };
})()`);
check("back to desktop: same selection still displayed", desk.visible && desk.text.includes("에우로파"));

// --- 8. empty-space path: hide() clears without breaking next selection --------
await evalJs(ws, `window.__qwVerify.select(null)`);
await sleep(400);
const cleared = await evalJs(ws, `document.querySelector('[data-panel="info"]').hidden`);
check("deselect hides the panel (no stale content shown)", cleared === true);
await evalJs(ws, `window.__qwSelect("pluto")`);
await sleep(500);
s = await evalJs(ws, infoSnap);
check("selection after empty-space works (명왕성 왜소행성)", s.text.includes("명왕성") && s.text.includes("Pluto") && s.text.includes("왜소행성"));

console.log(`\nconsole/page errors: ${errors.length}`);
if (errors.length) { console.log(errors.slice(0, 5).join("\n")); process.exitCode = 1; }
ws.close();
