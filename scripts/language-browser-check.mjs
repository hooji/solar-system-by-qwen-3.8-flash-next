/**
 * Browser language-toggle regression (task t_00139ab5 — i18n foundation).
 * Usage: node scripts/language-browser-check.mjs [cdp-http-url] [app-url]
 * Expects headless Chrome with --remote-debugging-port and the app served
 * from a VITE_VERIFY=1 build (window.__qwVerify present).
 *
 * Proves, against the REAL DOM (not a reimplementation):
 *   1. Korean is the default on a clean profile (no stored key);
 *   2. the header carries a keyboard-operable EN/한국어 toggle whose
 *      aria-pressed reflects the CURRENT language (accessibility state);
 *   3. clicking EN re-renders header + disclaimer in English and stores the
 *      choice under the explicit localStorage key;
 *   4. a page RELOAD restores EN from storage (title/disclaimer English at
 *      boot, before any interaction);
 *   5. a garbage stored value falls back to Korean safely (no crash);
 *   6. keyboard focus + Enter activates the toggle (keyboard operable);
 *   7. console stays exception-free throughout.
 */
const DEBUG = process.argv[2] || "http://127.0.0.1:9333";
const APP = process.argv[3] || "http://localhost:5211/";
const LANG_KEY = "qwsolar.language.v1";

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

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "ok  " : "FAIL"} - ${name}${extra ? " :: " + extra : ""}`);
  if (cond) passed++;
  else failed++;
}

const errors = [];

async function openApp(ws) {
  await send(ws, "Page.enable").catch(() => {});
  await send(ws, "Runtime.enable").catch(() => {});
  await send(ws, "Log.enable").catch(() => {});
}

const SNAP = `(() => ({
  lang: document.documentElement.lang,
  title: document.querySelector('.header h1')?.textContent ?? null,
  sub: document.querySelector('.header .sub')?.textContent ?? null,
  disclaimer: document.querySelector('.disclaimer')?.textContent ?? null,
  stored: localStorage.getItem(${JSON.stringify(LANG_KEY)}),
  toggle: !!document.querySelector('.lang-toggle'),
  pressed: [...document.querySelectorAll('.lang-toggle button')].map(b => [b.dataset.lang, b.getAttribute('aria-pressed')]),
  groupAria: document.querySelector('.lang-toggle')?.getAttribute('aria-label') ?? null,
  verifyBooted: !!window.__qwVerify,
}))()`;

const target = await newTarget(APP);
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
await openApp(ws);
await sleep(2500);

// Clean profile baseline: remove any stored language AND overlay state
// (a persisted collapsedAll would leave panels inert and skew later steps),
// reload to a clean slate.
await evalJs(ws, `localStorage.removeItem(${JSON.stringify(LANG_KEY)}); localStorage.removeItem("qwsolar.overlay.v1")`);
await send(ws, "Page.reload");
await sleep(2500);

// 1. default Korean
{
  const s = await evalJs(ws, SNAP);
  check("verify build booted (VITE_VERIFY)", s.verifyBooted);
  check("clean profile defaults to Korean", s.lang === "ko" && /로그 태양계/.test(s.title || ""), `lang=${s.lang}`);
  check("disclaimer starts in Korean", /로그 스케일로 압축/.test(s.disclaimer || ""));
  check("no language stored until an explicit choice", s.stored === null, String(s.stored));
}

// 2. toggle control exists, keyboard-operable, ARIA reflects current state
{
  const s = await evalJs(ws, SNAP);
  check("header carries the EN/한국어 toggle", s.toggle);
  check(
    "aria-pressed marks ONLY Korean while ko is active",
    JSON.stringify(s.pressed) === JSON.stringify([["ko", "true"], ["en", "false"]]),
    JSON.stringify(s.pressed),
  );
  check("toggle group has an aria-label", /언어|language/i.test(s.groupAria || ""), s.groupAria || "");
}

// 3. click EN → English + persisted
await evalJs(ws, `document.querySelector('.lang-toggle button[data-lang="en"]').click()`);
await sleep(300);
{
  const s = await evalJs(ws, SNAP);
  check("clicking EN switches document language", s.lang === "en", s.lang);
  check("header title becomes English", s.title === "Logarithmic Solar System", s.title || "");
  check("subtitle becomes English", /compresses real astronomical data/.test(s.sub || ""), s.sub || "");
  check("disclaimer becomes English", /logarithmic scale/.test(s.disclaimer || "") && !/로그/.test(s.disclaimer || ""));
  check("choice stored under the explicit key", s.stored === "en", String(s.stored));
  check(
    "aria-pressed moves to EN after switch",
    JSON.stringify(s.pressed) === JSON.stringify([["ko", "false"], ["en", "true"]]),
    JSON.stringify(s.pressed),
  );
  check("group aria-label follows the language", /Display language/i.test(s.groupAria || ""), s.groupAria || "");
}

// 4. reload restores English WITHOUT any interaction
await send(ws, "Page.reload");
await sleep(2500);
{
  const s = await evalJs(ws, SNAP);
  check("reload restores EN from storage", s.lang === "en" && s.title === "Logarithmic Solar System", `lang=${s.lang} title=${s.title}`);
  check("restored EN survives before first interaction", /logarithmic/.test(s.disclaimer || ""));
}

// 4b. BOOT-TIME localization on an EN reload (t_8a229bca regression): every
// name an element stamps AT CONSTRUCTION — the browser-tab document.title,
// the info panel's aria-label — must already be English before any toggle
// fires. Pre-fix, restoreLang() ran after InfoPanel's constructor, so a
// stored-EN reload kept Korean access names until the NEXT language change.
{
  const s = await evalJs(ws, `(() => {
    const koRe = /[\\u3131-\\uD7A3]/;
    return {
      docTitle: document.title,
      infoAria: document.querySelector('[data-panel="info"]')?.getAttribute('aria-label') ?? null,
      ariaLeaks: [...document.querySelectorAll('[aria-label]')]
        .map(e => e.getAttribute('aria-label'))
        .filter(a => a && koRe.test(a)),
    };
  })()`);
  check("EN reload: browser-tab document.title is English (no Korean)", s.docTitle === "Logarithmic Solar System", s.docTitle);
  check("EN reload: info panel aria-label boots English (constructor reads restored lang)", s.infoAria === "Celestial body info", String(s.infoAria));
  check("EN reload: ZERO Korean inside any aria-label", s.ariaLeaks.length === 0, JSON.stringify(s.ariaLeaks));
}

// 5. garbage stored value → safe Korean fallback
await evalJs(ws, `localStorage.setItem(${JSON.stringify(LANG_KEY)}, "klingon")`);
await send(ws, "Page.reload");
await sleep(2500);
{
  const s = await evalJs(ws, SNAP);
  check("invalid stored value falls back to Korean safely", s.lang === "ko" && /로그 태양계/.test(s.title || ""), `lang=${s.lang}`);
}

// 5b. PANELS localize: control/info/overlay strings + aria names switch with
// the language (task t_292b0645). Select a body FIRST so the info panel has
// content to re-label, then flip EN and compare every snapshot field.
const PANEL_SNAP = `(() => {
  const txt = (sel) => document.querySelector(sel)?.textContent ?? null;
  const speed = txt('.sim-speed') || "";
  // Row label of the distance-mode row = the span sharing the row with the
  // 'log' mode button (robust against DOM order / collapse-button insertion).
  const distRow = document.querySelector('.control-panel button[data-mode="log"]')?.parentElement;
  const distLabel = distRow ? [...distRow.children].find(c=>c.tagName==='SPAN')?.textContent ?? null : null;
  // The mean real radius row is found BY LABEL (both languages), not by
  // index (the dd-less separator dt makes index-zip unreliable). The value
  // carries ONE decimal (fmt 1) — the full "69,911.0 km" figure is captured
  // so a constant data value is compared across languages: real data is
  // never translated, without flakiness from the running simulation.
  const kmOf = (s) => (s || "").match(/([\\d,.]+) km/)?.[1] ?? null;
  const radiusKm = (() => {
    const want = document.documentElement.lang === "en" ? "Mean real radius" : "실제 평균 반지름";
    const dt = [...document.querySelectorAll('.info-panel dt')].find(d=>d.textContent===want);
    return dt ? kmOf(dt.nextElementSibling?.textContent) : null;
  })();
  return {
    lang: document.documentElement.lang,
    controlAria: document.querySelector('[data-panel="control"]')?.getAttribute('aria-label') ?? null,
    controlTitle: txt('.control-panel .panel-header h2'),
    play: [...(document.querySelector('.control-panel > .row')?.querySelectorAll('button')??[])].map(b=>b.textContent),
    speedLabel: speed,
    selText: document.querySelector('.control-panel select')?.selectedOptions[0]?.textContent ?? null,
    distLabel,
    infoAria: document.querySelector('[data-panel="info"]')?.getAttribute('aria-label') ?? null,
    infoDt: [...document.querySelectorAll('.info-panel dt')].map(d=>d.textContent).slice(0, 4),
    globalBtn: txt('.dock-global'),
    globalTitle: document.querySelector('.dock-global')?.title ?? null,
    collapseAria: [...document.querySelectorAll('.panel-collapse')].map(b=>b.getAttribute('aria-label')),
    liveKm: radiusKm,
  };
})()`;

// start from a clean Korean state with a selection on Jupiter (moons → rows)
await evalJs(ws, `localStorage.removeItem(${JSON.stringify(LANG_KEY)}); localStorage.removeItem("qwsolar.overlay.v1"); location.reload()`);
await sleep(2500);
await evalJs(ws, `window.__qwSelect("jupiter")`);
await sleep(600);
const koSnap = await evalJs(ws, PANEL_SNAP);
check("ko baseline: control aria + title in Korean", koSnap.controlAria === "시뮬레이션 제어" && koSnap.controlTitle === "제어", `${koSnap.controlAria}|${koSnap.controlTitle}`);
check("ko baseline: transport buttons in Korean", JSON.stringify(koSnap.play) === JSON.stringify(["재생", "정지", "리셋"]), JSON.stringify(koSnap.play));
check("ko baseline: speed row + select option in Korean", /현재 1초 = 10일 · (재생 중|정지)/.test(koSnap.speedLabel || "") && koSnap.selText === "1초 = 10일", `${koSnap.speedLabel}|${koSnap.selText}`);
check("ko baseline: info rows in Korean", (koSnap.infoDt[0] || "").includes("실제 천문 데이터") && koSnap.infoDt[1] === "종류", JSON.stringify(koSnap.infoDt));
check("ko baseline: dock button + collapse aria in Korean", koSnap.globalBtn === "패널 숨김" && koSnap.collapseAria.every((l) => /패널 (숨기기|표시)/.test(l)), `${koSnap.globalBtn}|${koSnap.collapseAria[0]}`);

await evalJs(ws, `document.querySelector('.lang-toggle button[data-lang="en"]').click()`);
await sleep(600);
const enSnap = await evalJs(ws, PANEL_SNAP);
check("EN: control panel aria-label and title switch to English", enSnap.controlAria === "Simulation control" && enSnap.controlTitle === "Control", `${enSnap.controlAria}|${enSnap.controlTitle}`);
check("EN: transport buttons switch to English", JSON.stringify(enSnap.play) === JSON.stringify(["Play", "Pause", "Reset"]), JSON.stringify(enSnap.play));
check("EN: speed readout re-composes in English word order", /^Now 1s = 10 days · (playing|paused)$/.test(enSnap.speedLabel || ""), enSnap.speedLabel || "");
check("EN: speed select option translates", enSnap.selText === "1s = 10 days", String(enSnap.selText));
check("EN: distance-mode row label translates", (enSnap.distLabel || "").trim() === "Distance scale", String(enSnap.distLabel));
check("EN: info panel aria-label switches", enSnap.infoAria === "Celestial body info", String(enSnap.infoAria));
check("EN: info rows switch to English", (enSnap.infoDt[0] || "") === "Real astronomical data" && enSnap.infoDt[1] === "Type", JSON.stringify(enSnap.infoDt));
check("EN: dock button + title + collapse aria switch", enSnap.globalBtn === "Hide panels" && /Hide \/ show all overlays/.test(enSnap.globalTitle || "") && enSnap.collapseAria.every((l) => /panel (hide|show)/.test(l)), `${enSnap.globalBtn}|${enSnap.collapseAria[0]}`);
check("EN: numeric data value survives the switch (same km figure in the live-distance row)", koSnap.liveKm !== null && enSnap.liveKm === koSnap.liveKm, `${koSnap.liveKm} vs ${enSnap.liveKm}`);
check("EN: no Korean leaks anywhere in the localized panels",
  !/[\uAC00-\uD7A3]/.test([enSnap.controlAria, enSnap.controlTitle, ...enSnap.play, enSnap.speedLabel, enSnap.selText, enSnap.infoAria, ...enSnap.infoDt, enSnap.globalBtn, ...enSnap.collapseAria].filter(Boolean).join("|")),
  "leak check");

// switch BACK to Korean: everything restores
await evalJs(ws, `document.querySelector('.lang-toggle button[data-lang="ko"]').click()`);
await sleep(600);
const koBack = await evalJs(ws, PANEL_SNAP);
check("back to ko: panels restore the original captions", koBack.controlTitle === "제어" && koBack.globalBtn === "패널 숨김" && koBack.infoDt[1] === "종류", JSON.stringify(koBack.infoDt));

// 5c. DATA-LABEL priority (t_8701c121): real-data value strings and screen
// labels follow the language mode; pairing and visibility stay independent.
// Select Jupiter (moons rows + period > 1 year + real km figures present).
const DATA_SNAP = `(() => {
  const ddAfter = (want) => {
    const dt = [...document.querySelectorAll('.info-panel dt')].find(d=>d.textContent===want);
    return dt ? dt.nextElementSibling?.textContent ?? null : null;
  };
  const lang = document.documentElement.lang;
  const rows = lang === 'en'
    ? { period: 'Orbital period', rotation: 'Rotation period', kind: 'Type', moons: 'Moons' }
    : { period: '공전 주기', rotation: '자전 주기', kind: '종류', moons: '위성 목록' };
  const label = document.querySelector('.label');
  const koLine = label?.querySelector('.label-ko')?.getBoundingClientRect();
  const enLine = label?.querySelector('.label-en')?.getBoundingClientRect();
  return {
    lang,
    h2: document.querySelector('.info-panel h2')?.textContent ?? null,
    typeVal: ddAfter(rows.kind),
    periodVal: ddAfter(rows.period),
    rotationVal: lang === 'en' ? ddAfter(rows.rotation) : ddAfter(rows.rotation),
    moonsVal: ddAfter(rows.moons),
    avgDist: ddAfter(lang === 'en' ? 'Mean distance (semi-major axis)' : '평균 거리 (반장축)'),
    labelClasses: label ? label.className : null,
    labelHasBoth: !!label?.querySelector('.label-ko') && !!label?.querySelector('.label-en'),
    koOnTop: !!(koLine && enLine && koLine.top < enLine.top),
  };
})()`;

// Korean baseline (clean state, Jupiter selected)
await evalJs(ws, `localStorage.removeItem(${JSON.stringify(LANG_KEY)}); localStorage.removeItem("qwsolar.overlay.v1"); location.reload()`);
await sleep(2500);
await evalJs(ws, `window.__qwSelect("jupiter")`);
await sleep(700);
const koData = await evalJs(ws, DATA_SNAP);
check("ko data baseline: name pair Korean-first, both names", koData.h2 === "목성 · Jupiter", String(koData.h2));
check("ko data baseline: type value in Korean", koData.typeVal === "행성", String(koData.typeVal));
check("ko data baseline: period reads 일/년 units", /년/.test(koData.periodVal || "") && /일/.test(koData.periodVal || ""), String(koData.periodVal));
check("ko data baseline: distance carries km AND AU figures", /km/.test(koData.avgDist || "") && /AU/.test(koData.avgDist || ""), String(koData.avgDist));
check("ko data baseline: screen labels ko-line on top, both names present", koData.labelHasBoth && koData.koOnTop && !koData.labelClasses.includes("label-order-en"), koData.labelClasses);

await evalJs(ws, `document.querySelector('.lang-toggle button[data-lang="en"]').click()`);
await sleep(700);
const enData = await evalJs(ws, DATA_SNAP);
check("EN data: name pair English-first, Korean still shown", enData.h2 === "Jupiter · 목성", String(enData.h2));
check("EN data: type value in English", enData.typeVal === "Planet", String(enData.typeVal));
check("EN data: period unit WORDS become English, same number", /^11\.86 years \(4,333 days\)$/.test((enData.periodVal || "").trim()), String(enData.periodVal));
const koDigits = ((koData.periodVal || "").match(/[\d.,]+/g) ?? []).join("|");
const enDigits = ((enData.periodVal || "").match(/[\d.,]+/g) ?? []).join("|");
check("EN data: period NUMBERS unchanged by the switch (display-only)", koDigits === enDigits && koDigits.length > 0, `${koDigits} vs ${enDigits}`);
// The DISTANCE figures must be byte-identical across the switch; only the
// ref label (a dictionary WORD string) is allowed to translate.
const figs = (s) => ((s || "").split(" · ")[0] ?? "").trim();
check("EN data: km/AU figures unchanged by the switch (ref label may translate)",
  figs(enData.avgDist) === figs(koData.avgDist) && /km/.test(figs(enData.avgDist)),
  `${figs(koData.avgDist)} vs ${figs(enData.avgDist)}`);
check("EN data: moon list pairs flip to English-first", !!enData.moonsVal && enData.moonsVal.startsWith("Io · 이오"), String(enData.moonsVal || "").slice(0, 28));
check("EN data: screen labels flip order (English line on top), pair kept", enData.labelHasBoth && enData.labelClasses.includes("label-order-en") && !enData.koOnTop, `${enData.labelClasses} koOnTop=${enData.koOnTop}`);

// label visibility stays INDEPENDENT of language: uncheck Labels while in EN,
// every CSS2D host must be display:none via the label object toggle.
const labelsHidden = await evalJs(ws, `(() => {
  const cb = [...document.querySelectorAll('.control-panel input[type=checkbox]')][1]; // 이름표/Labels row
  cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`);
await sleep(400);
const labelVis = await evalJs(ws, `(() => {
  const labels = [...document.querySelectorAll('.label')];
  return {
    count: labels.length,
    allHidden: labels.length > 0 && labels.every(el => el.style.display === 'none'),
    anyHidden: labels.some(el => el.style.display === 'none'),
  };
})()`);
check("EN + labels unchecked: every label host hidden — visibility independent of language",
  labelVis.count > 0 && labelVis.allHidden, JSON.stringify(labelVis));
await evalJs(ws, `(() => {
  const cb = [...document.querySelectorAll('.control-panel input[type=checkbox]')][1];
  cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await sleep(300);

// back to Korean restores ko-first data labels too
await evalJs(ws, `document.querySelector('.lang-toggle button[data-lang="ko"]').click()`);
await sleep(700);
const koDataBack = await evalJs(ws, DATA_SNAP);
check("back to ko: data labels restore Korean-first (pair + units + label order)", koDataBack.h2 === "목성 · Jupiter" && /년/.test(koDataBack.periodVal || "") && koDataBack.koOnTop, `${koDataBack.h2}|${koDataBack.periodVal}`);

// 6. keyboard operability: focus + Enter activates EN (panels must be live —
// inert panels swallow activation, so prove visible first).
await evalJs(ws, `localStorage.removeItem(${JSON.stringify(LANG_KEY)}); localStorage.removeItem("qwsolar.overlay.v1")`);
await send(ws, "Page.reload");
await sleep(2500);
{
  const ready = await evalJs(ws, `document.querySelector('.header').inert === false`);
  check("header is interactive after clean reload (not inert)", ready);
  await evalJs(ws, `document.querySelector('.lang-toggle button[data-lang="en"]').focus()`);
  await send(ws, "Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await send(ws, "Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await sleep(300);
  const s = await evalJs(ws, SNAP);
  check("keyboard Enter on the focused EN button switches language", s.lang === "en" && s.stored === "en", `lang=${s.lang} stored=${s.stored}`);
  // H hotkey must not hijack while a BUTTON has focus? (buttons are allowed targets) — ensure H still toggles panels globally: press H, panels hidden state flips
  const before = await evalJs(ws, `document.querySelector('.overlay-dock').dataset.collapsedAll`);
  await send(ws, "Input.dispatchKeyEvent", { type: "keyDown", key: "h", code: "KeyH", windowsVirtualKeyCode: 72 });
  await send(ws, "Input.dispatchKeyEvent", { type: "keyUp", key: "h", code: "KeyH", windowsVirtualKeyCode: 72 });
  await sleep(200);
  const after = await evalJs(ws, `document.querySelector('.overlay-dock').dataset.collapsedAll`);
  check("H hotkey still works alongside the language toggle", before === "false" && after === "true", `${before}->${after}`);
  // language state is independent of panel collapse
  const s2 = await evalJs(ws, SNAP);
  check("language state independent of panel collapse", s2.lang === "en" && s2.stored === "en");
}

// 7. no console exceptions anywhere in the run
check("no page exceptions / console errors", errors.length === 0, errors.slice(0, 3).join(" | "));

ws.close();
console.log(`\n${passed} ok / ${failed} FAIL — language browser check`);
if (failed > 0) process.exit(1);
