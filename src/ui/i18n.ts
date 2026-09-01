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
 * Default language is Korean. The explicit EN/한국어 choice persists under
 * LANGUAGE_STORAGE_KEY and is restored on reload. A missing value, an
 * invalid value, or a storage access failure (private mode / disabled) all
 * fall back to Korean safely — same tolerance pattern as overlayState.ts.
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

/** Stored choice, or Korean when nothing valid/reachable is stored. */
export function loadLang(): Lang {
  try {
    return parseLang(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)) ?? "ko";
  } catch {
    return "ko"; // private mode / disabled storage — still Korean, still works
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

let current: Lang = "ko"; // default until main.ts restores the stored choice

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
