/**
 * Language-dictionary parity & language-state tests (task t_00139ab5,
 * foundation for t_ff056f3b panel English support).
 * Run: node scripts/i18n-parity.test.mjs
 *
 * (1) KEY PARITY: every language dictionary carries the EXACT key set of
 *     the Korean source of truth — a missing key, an extra key, or an empty
 *     translation fails. The check itself is meta-tested on deliberately
 *     drifted copies so the detector is proven, not assumed.
 * (2) LANGUAGE STATE: default is English; the explicit choice persists under
 *     the documented localStorage key and restores on "reload" (fresh load);
 *     missing/invalid values and storage-access failure all stay safely in
 *     English; toggle cycles the full language roster + subscribers behave.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { i18n, installStorage } from "./i18n-harness.mjs";

const { LANGS, LANGUAGE_STORAGE_KEY, MESSAGES, isLang, parseLang, loadLang, saveLang, getLang, setLang, toggleLang, onLangChange, t } =
  i18n;

let n = 0;
function test(name, fn) {
  fn();
  n++;
  console.log(`ok ${n} - ${name}`);
}

/** THE parity rule: identical key sets, no empty values. Returns issues[]. */
function parityIssues(ko, en) {
  const koKeys = Object.keys(ko).sort();
  const enKeys = Object.keys(en).sort();
  const issues = [];
  for (const k of koKeys) if (!(k in en)) issues.push(`missing in en: ${k}`);
  for (const k of enKeys) if (!(k in ko)) issues.push(`extra in en: ${k}`);
  for (const k of koKeys) {
    if (typeof ko[k] !== "string" || ko[k].trim() === "") issues.push(`empty ko value: ${k}`);
    if (k in en && (typeof en[k] !== "string" || en[k].trim() === "")) issues.push(`empty en value: ${k}`);
  }
  return issues;
}

// --- (1) key parity ------------------------------------------------------------

test("EVERY language dictionary carries EXACTLY the ko key set", () => {
  assert.ok(LANGS.length >= 16, `expected the full language roster, got ${LANGS.join(",")}`);
  for (const lang of LANGS) {
    if (lang === "ko") continue;
    const issues = parityIssues(MESSAGES.ko, MESSAGES[lang]);
    assert.deepEqual(issues, [], `[${lang}] ${issues.join("; ")}`);
  }
  assert.ok(Object.keys(MESSAGES.ko).length >= 5, "dictionary is not trivially empty");
});

test("no dictionary value is a key id or an untranslated ko copy", () => {
  for (const lang of LANGS) {
    if (lang === "ko") continue;
    for (const k of Object.keys(MESSAGES.ko)) {
      if (k.startsWith("lang.")) continue; // autonyms are shared by design
      assert.notEqual(MESSAGES[lang][k], k, `${lang}.${k} value is an id, not a message`);
      assert.notEqual(MESSAGES[lang][k], MESSAGES.ko[k], `${lang}.${k} value equals ko (untranslated)`);
    }
  }
});

test("interpolation token sets match ko in EVERY language for every key", () => {
  // A message with {tokens} MUST carry the SAME token names in every
  // language, or one language silently loses interpolated data (t_292b0645:
  // panel strings introduced the first parameterised messages).
  const tokens = (s) => (s.match(/\{(\w+)\}/g) ?? []).map((t) => t.slice(1, -1)).sort();
  const drifts = (ko, other) =>
    Object.keys(ko).filter((k) => k in other && JSON.stringify(tokens(other[k])) !== JSON.stringify(tokens(ko[k])));
  for (const lang of LANGS) {
    if (lang === "ko") continue;
    const drift = drifts(MESSAGES.ko, MESSAGES[lang]);
    assert.deepEqual(drift, [], `[${lang}] token drift: ${drift.join(", ")}`);
  }
  // meta: the detector itself catches a dropped token
  const driftedEn = { ...MESSAGES.en, "overlay.collapseAria": "hide the panel" };
  assert.deepEqual(drifts(MESSAGES.ko, driftedEn), ["overlay.collapseAria"]);
});

// --- (1b) no hardcoded Korean outside the dictionary ---------------------------

/** Strip block + line/trailing comments so only code strings are scanned.
 *  (No source in UI_SOURCES contains `//` inside a string literal — verified
 *  for this task; keep the list URL-free if that ever changes.) */
function stripComments(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "")) // full-line AND trailing comments
    .join("\n");
}

const HARDCODED_KO = /[\uAC00-\uD7A3]/;

test("panel/UI sources resolve ALL user strings through the dictionary (t_292b0645)", () => {
  // Scans the overlay-UI sources for Korean OUTSIDE comments: any hit is a
  // hardcoded user-facing string that must become a dictionary key instead.
  // Excluded on purpose:
  //  - src/ui/i18n.ts          → the dictionary itself (source of truth)
  //  - src/ui/format.ts        → real-data value formatting (units); locale
  //                            priority there is owned by t_8701c121
  //  - src/data/*              → real astronomical data (nameKo is data)
  const UI_SOURCES = [
    "src/ui/ControlPanel.ts",
    "src/ui/InfoPanel.ts",
    "src/ui/OverlayManager.ts",
    "src/ui/overlayState.ts",
    "src/core/ScaleManager.ts",
    "src/core/SimulationClock.ts",
    "src/main.ts",
  ];
  const offenders = [];
  for (const rel of UI_SOURCES) {
    const src = stripComments(readFileSync(new URL(`../${rel}`, import.meta.url), "utf8"));
    src.split("\n").forEach((line, i) => {
      if (HARDCODED_KO.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [], `hardcoded Korean in UI sources:\n${offenders.join("\n")}`);
});

test("HARDCODE DETECTOR catches a literal and ignores comments (meta)", () => {
  const sample = 'const a = "한국어 리터럴"; // 한국어 주석\n/* 한국어\n블록 */\nconst b = "english";\n';
  const hits = stripComments(sample)
    .split("\n")
    .filter((l) => HARDCODED_KO.test(l));
  assert.equal(hits.length, 1, `exactly the literal must survive stripping: ${JSON.stringify(hits)}`);
  assert.ok(hits[0].includes("리터럴"), hits[0]);
});

test("PARITY DETECTOR fails on a missing en key (omission is caught)", () => {
  const driftedEn = { ...MESSAGES.en };
  delete driftedEn[Object.keys(driftedEn)[0]];
  assert.ok(parityIssues(MESSAGES.ko, driftedEn).length > 0, "detector must flag the missing key");
});

test("PARITY DETECTOR fails on an extra en key (addition is caught)", () => {
  const driftedEn = { ...MESSAGES.en, "rogue.new.key": "rogue" };
  assert.ok(parityIssues(MESSAGES.ko, driftedEn).some((i) => i.includes("rogue.new.key")));
});

test("PARITY DETECTOR fails on an empty translation", () => {
  const driftedEn = { ...MESSAGES.en, "header.subtitle": "   " };
  assert.ok(parityIssues(MESSAGES.ko, driftedEn).some((i) => i.includes("header.subtitle")));
});

// --- (2) language state --------------------------------------------------------

test("default language is English with no stored value", () => {
  const s = installStorage("empty");
  try {
    assert.equal(loadLang(), "en");
  } finally {
    s.dispose();
  }
});

test("invalid stored values are rejected and fall back to English", () => {
  for (const bad of ["sv", "", "KR", "korean", "null", "ko-KR!!", "EN", "ja-JP"]) {
    const s = installStorage(bad);
    try {
      assert.equal(loadLang(), "en", `stored "${bad}" must not select a language`);
      assert.equal(parseLang(bad), null);
    } finally {
      s.dispose();
    }
  }
});

test("storage access failure (private mode) still loads English safely", () => {
  const s = installStorage("throw");
  try {
    assert.equal(loadLang(), "en");
    assert.doesNotThrow(() => saveLang("ko")); // save swallows the error, app keeps running
  } finally {
    s.dispose();
  }
});

test("explicit choice persists under the documented key and restores on reload", () => {
  const s = installStorage("ok");
  try {
    setLang("en");
    assert.equal(s.store.get(LANGUAGE_STORAGE_KEY), "en", "stored under the explicit key");
    assert.equal(getLang(), "en");
    // "reload": a fresh loadLang() (new module state would call it at boot)
    assert.equal(loadLang(), "en", "restores EN across reload");
    setLang("ko");
    assert.equal(loadLang(), "ko");
  } finally {
    s.dispose();
  }
});

test("toggleLang cycles through EVERY language, notifies, persists each step", () => {
  const s = installStorage("ok");
  setLang(LANGS[0]); // baseline BEFORE subscribing
  const seen = [];
  const off = onLangChange((l) => seen.push(l));
  try {
    // One full lap: visits every language once, in order, and wraps.
    const expected = [...LANGS.slice(1), LANGS[0]];
    for (const want of expected) {
      assert.equal(toggleLang(), want);
      assert.equal(s.store.get(LANGUAGE_STORAGE_KEY), want, "persisted at each step");
    }
    assert.deepEqual(seen, expected);
    off();
    toggleLang(); // unsubscribed listener must not be called again
    assert.deepEqual(seen, expected, "unsubscribe honoured");
  } finally {
    off();
    s.dispose();
  }
});

// --- (3) translation lookup ------------------------------------------------------

test("t() resolves every key in both languages with no undefined leaks", () => {
  for (const lang of LANGS) {
    for (const key of Object.keys(MESSAGES[lang])) {
      const v = t(key, undefined, lang);
      assert.equal(typeof v, "string");
      assert.ok(v.trim().length > 0 && !v.includes("undefined"), `${lang}.${key}`);
    }
  }
});

test("t() interpolates {tokens}; an unknown token stays visible, never blank", () => {
  // Uses the real API contract with a synthetic message injected at runtime —
  // a runtime-injected key can bypass the compile-time check, so the visible
  // fallback behaviour is what protects the UI.
  MESSAGES.ko["test.greet"] = "안녕 {who}, {missing} 남김";
  MESSAGES.en["test.greet"] = "Hello {who}, keep {missing}";
  try {
    assert.equal(t("test.greet", { who: "world" }, "en"), "Hello world, keep {missing}");
    assert.equal(t("test.greet", { who: "세계", missing: "X" }, "ko"), "안녕 세계, X 남김");
  } finally {
    delete MESSAGES.ko["test.greet"];
    delete MESSAGES.en["test.greet"];
  }
});

test("t() on a runtime-injected key that en lacks returns a visible placeholder", () => {
  MESSAGES.ko["test.only.ko"] = "한국어 전용";
  try {
    const v = t("test.only.ko", undefined, "en");
    assert.ok(v.includes("test.only.ko") && v.trim().length > 0, `visible: ${v}`);
    assert.notEqual(v, "undefined");
    assert.notEqual(v, "");
  } finally {
    delete MESSAGES.ko["test.only.ko"];
  }
});

test("isLang accepts only the declared languages", () => {
  for (const l of ["en", "ko", "ja", "zh", "fr", "de", "es", "ar", "pt", "it", "nl", "ru", "tr", "id", "vi", "hi"]) {
    assert.equal(isLang(l), true, l);
  }
  assert.equal(isLang("sv"), false);
  assert.equal(isLang("EN"), false);
  assert.equal(isLang("pt-BR"), false);
  assert.equal(isLang(undefined), false);
});

console.log(`\n${n} i18n-parity checks passed`);
