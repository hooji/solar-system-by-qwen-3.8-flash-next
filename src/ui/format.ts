/**
 * format.ts — the ONE display-formatting rule set for real astronomical
 * values (task t_d9203468: labels + info panel). Pure module (no DOM, no
 * three.js) so Node tests can pin the rules: missing data NEVER surfaces as
 * `undefined`/`NaN`/blank — it always renders MISSING_DISPLAY ("—").
 *
 * Locale priority (task t_8701c121): every user-visible WORD this module
 * emits (period units, the retrograde marker, the bilingual name-pair order)
 * follows the language mode — Korean mode keeps the original ko-primary
 * strings byte-for-byte, EN mode leads with English. The dictionary in
 * ui/i18n.ts owns those words; this module only passes the lang through.
 * Physical VALUES (numbers, km↔AU conversion, unit symbols km/AU/h, the °
 * sign) are identical in both languages — a language switch never changes
 * a number, a conversion, or an inclination/scale figure.
 *
 * km ↔ AU conversion (spec: one consistent rule everywhere):
 *   1 AU = 149,597,870.7 km (IAU exact), always derived from the SAME raw
 *   value with the SAME rounding rule (toLocaleString, max 2 fraction
 *   digits). A km figure and its AU figure therefore never disagree.
 *
 * Render values (view-layout only: render units, scale-mode labels) are
 * formatted by the caller in a SEPARATE section and must never be mixed into
 * these real-value formatters.
 */
import { getLang, t, type Lang } from "./i18n";
import { BODY_NAMES } from "../data/bodyNames";

/** Exact IAU astronomical unit in km — the only conversion constant allowed. */
export const KM_PER_AU = 149_597_870.7;

/** Explicit placeholder for any value the dataset does not carry. */
export const MISSING_DISPLAY = "—";

/**
 * Unified rounding: Korean-locale grouping, ≤2 fraction digits by default.
 * The GROUPING is a numeric convention (3-digit separators are the same in
 * both app languages), deliberately fixed so the same figure renders
 * identically in ko and EN mode — real numbers never change with language.
 */
export function fmt(n: number | undefined, digits = 2): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return MISSING_DISPLAY;
  return n.toLocaleString("ko-KR", { maximumFractionDigits: digits });
}

/** True only for a real, usable number (guards every field before display). */
export function hasValue(n: number | undefined | null): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** km → AU (raw number; format with fmt, or use formatDistanceKm). */
export function kmToAu(km: number): number {
  return km / KM_PER_AU;
}

/** AU → km (raw number; format with fmt, or use formatDistanceAu). */
export function auToKm(au: number): number {
  return au * KM_PER_AU;
}

/**
 * Distance given in km, shown as km with its AU equivalent in parentheses
 * (small-body scale: moon orbits). Undefined/NaN → MISSING_DISPLAY.
 * km-first is the SCALE rule (km is the primary unit for km-scale values),
 * independent of the language mode — both languages show the same two unit
 * symbols; only the caller-supplied reference label carries words.
 */
export function formatDistanceKm(km: number | undefined, refLabel?: string): string {
  if (!hasValue(km)) return MISSING_DISPLAY;
  const kmPart = `${fmt(km, 0)} km`;
  const auPart = `(${fmt(kmToAu(km), 6)} AU)`;
  return `${kmPart} ${auPart}${refLabel ? ` · ${refLabel}` : ""}`;
}

/**
 * Distance given in AU, shown as AU with its km equivalent in parentheses
 * (heliocentric scale). Same rounding rule as formatDistanceKm; same
 * scale-driven unit order in both languages.
 */
export function formatDistanceAu(au: number | undefined, refLabel?: string): string {
  if (!hasValue(au)) return MISSING_DISPLAY;
  const auPart = `${fmt(au)} AU`;
  const kmPart = `(${fmt(auToKm(au), 0)} km)`;
  return `${auPart} ${kmPart}${refLabel ? ` · ${refLabel}` : ""}`;
}

/**
 * Orbital period in Earth days with meaning: short periods read in days,
 * ≥1 tropical-ish year switches to a year figure (days stay in parens).
 * The unit WORDS come from the dictionary in the given language (t_8701c121):
 * ko keeps "일"/"년", EN reads "days"/"years" — numbers identical.
 */
export function formatPeriodDays(days: number | undefined, lang: Lang = getLang()): string {
  if (!hasValue(days)) return MISSING_DISPLAY;
  const YR = 365.25; // Julian year, same constant the dataset conversions use
  if (Math.abs(days) < YR)
    return `${fmt(days)} ${t(Math.abs(days) === 1 ? "unit.day" : "unit.days", undefined, lang)}`;
  const years = days / YR;
  return (
    `${fmt(years)} ${t(Math.abs(years) === 1 ? "unit.year" : "unit.years", undefined, lang)} ` +
    `(${fmt(days, 0)} ${t("unit.days", undefined, lang)})`
  );
}

/**
 * Sidereal rotation in hours. NEGATIVE hours = retrograde spin (dataset
 * convention) — the sign is shown as a meaning, never as a bare negative.
 * The marker word follows the language mode; the h symbol does not.
 */
export function formatRotationHours(hours: number | undefined, lang: Lang = getLang()): string {
  if (!hasValue(hours)) return MISSING_DISPLAY;
  const dir = hours < 0 ? ` · ${t("rotation.retrograde", undefined, lang)}` : "";
  return `${fmt(Math.abs(hours))} h${dir}`;
}

/**
 * Raw name-pair rule — the CURRENT language's dataset name ONLY: ko mode
 * shows "목성", every other mode shows the English dataset name (localized
 * overrides for the other languages are bodyDisplayName's job, which needs
 * the body id). If the selected side is missing, the other stands in (a
 * real name beats a placeholder); only when both are missing does
 * MISSING_DISPLAY render.
 */
export function displayName(
  nameKo: string | undefined,
  nameEn: string | undefined,
  lang: Lang = getLang(),
): string {
  const ko = nameKo?.trim() || "";
  const en = nameEn?.trim() || "";
  const preferred = lang === "ko" ? ko : en;
  const fallback = lang === "ko" ? en : ko;
  return preferred || fallback || MISSING_DISPLAY;
}

/** The minimal body shape a display name needs (any dataset body fits). */
export interface NamedBody {
  id: string;
  nameKo?: string;
  nameEn?: string;
}

/**
 * Body display name in the CURRENT language: the data/bodyNames.ts entry
 * for `lang` wins; a language without an entry for this body falls back to
 * the dataset pair via displayName (English for every non-Korean language),
 * so a partial translation degrades to a real name, never a placeholder.
 * `undefined` body → MISSING_DISPLAY (missing parent etc.).
 */
export function bodyDisplayName(body: NamedBody | undefined, lang: Lang = getLang()): string {
  if (!body) return MISSING_DISPLAY;
  const localized = BODY_NAMES[lang]?.[body.id];
  return localized ?? displayName(body.nameKo, body.nameEn, lang);
}
