/**
 * i18n.ts — type-safe panel language foundation (task t_00139ab5 / root
 * t_ff056f3b). Two rules this module owns:
 *
 *  1. KEY PARITY AT COMPILE TIME. Korean is the source of truth for the key
 *     set (`KO`, `as const`); English is typed `Record<MessageKey, string>`,
 *     so the typecheck fails on ANY missing key (exhaustive mapped type) and
 *     on ANY extra key (excess-property check on the literal). A runtime
 *     double-check lives in scripts/i18n-parity.test.mjs (npm test), so the
 *     two languages can never drift apart silently.
 *  2. THE LANGUAGE IS APP STATE, NOT A WIDGET STRING. Panels read `t(key)`
 *     and subscribe through `onLangChange` — later panel-localisation tasks
 *     reuse this API instead of hardcoding.
 *
 * Default language is English. The explicit EN/한국어 choice persists under
 * LANGUAGE_STORAGE_KEY and is restored on reload. A missing value, an
 * invalid value, or a storage access failure (private mode / disabled) all
 * fall back to English safely — same tolerance pattern as overlayState.ts.
 */

export const LANGS = ["ko", "en"] as const;
export type Lang = (typeof LANGS)[number];

/** Explicit localStorage key for the EN/한국어 choice (survives reload). */
export const LANGUAGE_STORAGE_KEY = "qwsolar.language.v1";

/** Korean messages — the source of truth for the key set. */
const KO = {
  "header.title": "로그 태양계 · Logarithmic Solar System",
  "header.subtitle": "실제 천문 데이터를 로그 스케일로 압축한 시각화입니다.",
  "header.langGroup": "표시 언어",
  "lang.ko": "한국어",
  "lang.en": "EN",
  "disclaimer.text":
    "이 시각화는 실제 천문 데이터를 사용하지만, 궤도 거리는 로그 스케일로 압축되고 천체 크기는 화면 가독성을 위해 과장됩니다. 렌더 크기와 렌더 거리는 하나의 동일한 물리 스케일을 공유하지 않습니다.",

  // --- panel titles / overlay dock (t_292b0645) ------------------------------
  "panel.header": "헤더",
  "panel.control": "제어",
  "panel.info": "인포",
  "overlay.dockAria": "오버레이 패널 복구",
  "overlay.restore": "모두 복구",
  "overlay.hideAll": "패널 숨김",
  "overlay.showAll": "패널 표시",
  "overlay.globalTitle": "모든 오버레이 숨김/표시 (단축키 H)",
  "overlay.collapseAria": "{label} 패널 {verb}",
  "overlay.verbHide": "숨기기",
  "overlay.verbShow": "표시",

  // --- control panel ----------------------------------------------------------
  "control.aria": "시뮬레이션 제어",
  "control.play": "재생",
  "control.pause": "정지",
  "control.reset": "리셋",
  "control.speed": "배속",
  "control.now": "현재 {speed} · {state}",
  "control.statePlaying": "재생 중",
  "control.statePaused": "정지",
  "control.distScale": "거리 스케일",
  "control.sizeScale": "크기 스케일",
  "control.orbits": "궤도선",
  "control.labels": "이름표",
  "control.moons": "위성",
  "control.stars": "별배경",
  "control.camReset": "카메라 리셋",
  "ts.secDay": "1초 = 1일",
  "ts.secTenDays": "1초 = 10일",
  "ts.secHundredDays": "1초 = 100일",
  "ts.secYear": "1초 = 1년",
  "ts.days": "1초 = {v}일",
  "ts.hours": "1초 = {v}시간",
  "sim.elapsedDays": "{value} 일 경과",
  "sim.elapsedYears": "{value} 년 경과",

  // --- info panel rows / separators --------------------------------------------
  "info.aria": "천체 정보",
  "info.sep.real": "실제 천문 데이터 (real astronomical data)",
  "info.sep.render": "화면 렌더 값 — 배치용, 실데이터 아님 (render values)",
  "info.sep.mode": "화면 표현 (display modes)",
  "info.kind": "종류",
  "info.radius": "실제 평균 반지름",
  "info.avgDist": "평균 거리 (반장축)",
  "info.liveDist": "현재 실제 거리",
  "info.period": "공전 주기",
  "info.rotation": "자전 주기",
  "info.ecc": "이심률 (무차원)",
  "info.incl": "공전 경사 (deg)",
  "info.renderRadius": "렌더 반지름",
  "info.renderDist": "렌더 거리",
  "info.distMode": "거리 표현",
  "info.sizeMode": "크기 표현",
  "info.moons": "위성 목록",
  // Body names render in the CURRENT language only ({name} is resolved by
  // the caller through displayName) — never as a bilingual pair.
  "info.ref.moon": "{name} 기준",
  "info.ref.sun": "태양 기준",
  "type.star": "항성",
  "type.planet": "행성",
  "type.dwarf-planet": "왜소행성",
  "type.moon": "위성",

  // --- scale-mode labels / distance reference labels ----------------------------
  "scale.dist.log": "로그 거리 스케일 (log scale)",
  "scale.dist.linear": "선형 거리 스케일 (linear scale)",
  "scale.dist.focus": "포커스 스케일 — {name} 중심 (focus scale)",
  "scale.dist.focusSun": "포커스 스케일 — 태양 중심",
  "scale.size.enhanced": "가시성 향상 크기 (enhanced)",
  "scale.size.huge": "거대 크기 (huge, 향상 ×3)",
  "scale.size.gigantic": "초거대 크기 (gigantic, 향상 ×10)",
  "scale.size.relative": "상대 크기 강조 (relative)",
  "scale.size.uniform": "균일 마커 (uniform)",
  "scale.from.parent": "{name} 기준 (parent-local)",
  "scale.from.focus": "기준 {name} (focus)",
  "scale.from.sun": "태양 기준",

  // --- data-label priority (t_8701c121) ---------------------------------------
  // Value strings for REAL data rows: unit WORDS, retrograde marker, and the
  // bilingual name pair. Each language's template fixes its OWN natural word
  // order, so ui/format.ts carries no language branches — only a lang arg.
  // Latin unit SYMBOLS (km/AU/h/units/°) are deliberately NOT keys: they are
  // identical in both languages (international scientific notation), and the
  // parity test would (rightly) reject a key whose en value copies its ko one.
  "unit.day": "일",
  "unit.days": "일",
  "unit.year": "년",
  "unit.years": "년",
  "rotation.retrograde": "역행(retrograde)",
} as const;

/** Every message key in the app (derived from the Korean dictionary). */
export type MessageKey = keyof typeof KO;

/**
 * The per-language label keys. Compile-time proof they are real MessageKeys:
 * `_LABEL_KEYS_ARE_MESSAGES` only typechecks while the template-literal type
 * stays a subset of MessageKey (renaming a lang label key breaks the build).
 */
export type LangLabelKey = `lang.${Lang}`;
const _LABEL_KEYS_ARE_MESSAGES: Record<LangLabelKey, MessageKey> = {
  "lang.ko": "lang.ko",
  "lang.en": "lang.en",
};
void _LABEL_KEYS_ARE_MESSAGES;

/**
 * English messages. `Record<MessageKey, string>` over a literal object is
 * checked BOTH ways: every ko key must be present (missing ⇒ type error)
 * and no key outside MessageKey may be added (excess-property ⇒ type error).
 */
const EN: Record<MessageKey, string> = {
  "header.title": "Logarithmic Solar System",
  "header.subtitle": "A visualization that compresses real astronomical data onto a logarithmic scale.",
  "header.langGroup": "Display language",
  "lang.ko": "한국어",
  "lang.en": "EN",
  "disclaimer.text":
    "This visualization uses real astronomical data, but orbital distances are compressed on a logarithmic scale and body sizes are exaggerated for on-screen readability. Render size and render distance do not share a single common physical scale.",

  "panel.header": "Header",
  "panel.control": "Control",
  "panel.info": "Info",
  "overlay.dockAria": "Restore overlay panels",
  "overlay.restore": "Restore all",
  "overlay.hideAll": "Hide panels",
  "overlay.showAll": "Show panels",
  "overlay.globalTitle": "Hide / show all overlays (hotkey H)",
  "overlay.collapseAria": "{label} panel {verb}",
  "overlay.verbHide": "hide",
  "overlay.verbShow": "show",

  "control.aria": "Simulation control",
  "control.play": "Play",
  "control.pause": "Pause",
  "control.reset": "Reset",
  "control.speed": "Speed",
  "control.now": "Now {speed} · {state}",
  "control.statePlaying": "playing",
  "control.statePaused": "paused",
  "control.distScale": "Distance scale",
  "control.sizeScale": "Size scale",
  "control.orbits": "Orbits",
  "control.labels": "Labels",
  "control.moons": "Moons",
  "control.stars": "Starfield",
  "control.camReset": "Reset camera",
  "ts.secDay": "1s = 1 day",
  "ts.secTenDays": "1s = 10 days",
  "ts.secHundredDays": "1s = 100 days",
  "ts.secYear": "1s = 1 year",
  "ts.days": "1s = {v} days",
  "ts.hours": "1s = {v} hours",
  "sim.elapsedDays": "{value} days elapsed",
  "sim.elapsedYears": "{value} years elapsed",

  "info.aria": "Celestial body info",
  "info.sep.real": "Real astronomical data",
  "info.sep.render": "Render values — for screen layout, NOT real data",
  "info.sep.mode": "Display modes",
  "info.kind": "Type",
  "info.radius": "Mean real radius",
  "info.avgDist": "Mean distance (semi-major axis)",
  "info.liveDist": "Current real distance",
  "info.period": "Orbital period",
  "info.rotation": "Rotation period",
  "info.ecc": "Eccentricity (dimensionless)",
  "info.incl": "Orbital inclination (deg)",
  "info.renderRadius": "Render radius",
  "info.renderDist": "Render distance",
  "info.distMode": "Distance display",
  "info.sizeMode": "Size display",
  "info.moons": "Moons",
  // Body names render in the CURRENT language only ({name} is resolved by
  // the caller through displayName).
  "info.ref.moon": "relative to {name}",
  "info.ref.sun": "relative to the Sun",
  "type.star": "Star",
  "type.planet": "Planet",
  "type.dwarf-planet": "Dwarf planet",
  "type.moon": "Moon",

  "scale.dist.log": "Log distance scale",
  "scale.dist.linear": "Linear distance scale",
  "scale.dist.focus": "Focus scale — centred on {name}",
  "scale.dist.focusSun": "Focus scale — centred on the Sun",
  "scale.size.enhanced": "Enhanced visibility size",
  "scale.size.huge": "Huge size (enhanced ×3)",
  "scale.size.gigantic": "Gigantic size (enhanced ×10)",
  "scale.size.relative": "Relative size emphasis",
  "scale.size.uniform": "Uniform markers",
  "scale.from.parent": "from {name} (parent-local)",
  "scale.from.focus": "from {name} (focus)",
  "scale.from.sun": "from the Sun",

  // Data-label priority (t_8701c121): English leads. Period units are English
  // words, the retrograde marker is English, and the name pair leads with the
  // English name (ko token = the Korean DATA field, still shown second).
  "unit.day": "day",
  "unit.days": "days",
  "unit.year": "year",
  "unit.years": "years",
  "rotation.retrograde": "retrograde",
};

/** Runtime dictionaries (exported for the parity test; one lookup path). */
export const MESSAGES: Record<Lang, Record<MessageKey, string>> = { ko: KO, en: EN };

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGS as readonly string[]).includes(v);
}

/** Tolerant parse: ONLY the exact "ko"/"en" strings are accepted, else null. */
export function parseLang(raw: string | null | undefined): Lang | null {
  return isLang(raw) ? raw : null;
}

/** Stored choice, or English when nothing valid/reachable is stored. */
export function loadLang(): Lang {
  try {
    return parseLang(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)) ?? "en";
  } catch {
    return "en"; // private mode / disabled storage — still English, still works
  }
}

export function saveLang(lang: Lang): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    /* storage unavailable — the session language still works */
  }
}

// --- current-language state ---------------------------------------------------

let current: Lang = "en"; // default until main.ts restores the stored choice

type LangListener = (lang: Lang) => void;
const listeners = new Set<LangListener>();

export function getLang(): Lang {
  return current;
}

/**
 * Bootstrap restore (main.ts, once at startup): load the stored choice into
 * the state WITHOUT re-persisting or notifying (nothing subscribes yet).
 */
export function restoreLang(): Lang {
  current = loadLang();
  return current;
}

/**
 * Set the language, persist the explicit choice, then notify subscribers
 * (panels re-render from `t()` — nothing else caches translated strings).
 */
export function setLang(lang: Lang): Lang {
  current = lang;
  saveLang(lang);
  for (const fn of [...listeners]) fn(lang);
  return current;
}

/** Flip ko ↔ en and return the NEW language (toggle control path). */
export function toggleLang(): Lang {
  return setLang(current === "ko" ? "en" : "ko");
}

/** Subscribe to language changes; returns the unsubscribe function. */
export function onLangChange(fn: LangListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// --- translation lookup ---------------------------------------------------------

/** Parameters interpolate `{token}` placeholders in a message. */
export type MessageParams = Record<string, string | number>;

/**
 * Look up a message in `lang` (default: the current language). Keys are
 * compile-checked; a key that only exists at runtime-bypass level (cast)
 * still returns a VISIBLE placeholder, never `undefined`/`blank`/throw.
 * An interpolation token with no matching param stays visible as `{token}`
 * so a wiring gap is obvious instead of silently dropping content.
 */
export function t(key: MessageKey, params?: MessageParams, lang: Lang = current): string {
  const table: Record<string, string | undefined> = MESSAGES[lang];
  const raw = table[key];
  if (typeof raw !== "string") return `?${String(key)}?`;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (token: string, name: string): string =>
    name in params ? String(params[name]) : token,
  );
}
