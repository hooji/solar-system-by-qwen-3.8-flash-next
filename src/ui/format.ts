/**
 * format.ts — the ONE display-formatting rule set for real astronomical
 * values (task t_d9203468: labels + info panel). Pure module (no DOM, no
 * three.js) so Node tests can pin the rules: missing data NEVER surfaces as
 * `undefined`/`NaN`/blank — it always renders MISSING_DISPLAY ("—").
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

/** Exact IAU astronomical unit in km — the only conversion constant allowed. */
export const KM_PER_AU = 149_597_870.7;

/** Explicit placeholder for any value the dataset does not carry. */
export const MISSING_DISPLAY = "—";

/** Unified rounding: Korean-locale grouping, ≤2 fraction digits by default. */
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
 */
export function formatDistanceKm(km: number | undefined, refLabel?: string): string {
  if (!hasValue(km)) return MISSING_DISPLAY;
  const kmPart = `${fmt(km, 0)} km`;
  const auPart = `(${fmt(kmToAu(km), 6)} AU)`;
  return `${kmPart} ${auPart}${refLabel ? ` · ${refLabel}` : ""}`;
}

/**
 * Distance given in AU, shown as AU with its km equivalent in parentheses
 * (heliocentric scale). Same rounding rule as formatDistanceKm.
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
 */
export function formatPeriodDays(days: number | undefined): string {
  if (!hasValue(days)) return MISSING_DISPLAY;
  const YR = 365.25; // Julian year, same constant the dataset conversions use
  if (Math.abs(days) < YR) return `${fmt(days)} 일`;
  return `${fmt(days / YR)} 년 (${fmt(days, 0)} 일)`;
}

/**
 * Sidereal rotation in hours. NEGATIVE hours = retrograde spin (dataset
 * convention) — the sign is shown as a meaning, never as a bare negative.
 */
export function formatRotationHours(hours: number | undefined): string {
  if (!hasValue(hours)) return MISSING_DISPLAY;
  const dir = hours < 0 ? " · 역행(retrograde)" : "";
  return `${fmt(Math.abs(hours))} h${dir}`;
}

/** Bilingual name pair ("목성 · Jupiter"); empty/missing name → MISSING_DISPLAY. */
export function bilingualName(nameKo: string | undefined, nameEn: string | undefined): string {
  const ko = nameKo?.trim() || MISSING_DISPLAY;
  const en = nameEn?.trim() || MISSING_DISPLAY;
  return `${ko} · ${en}`;
}
