/**
 * Display-format contract tests (task t_d9203468: labels + info panel).
 * Run: node scripts/info-format.test.mjs
 * Pins the ONE formatting rule set ui/format.ts: missing data NEVER leaks as
 * undefined/NaN/blank, km↔AU always uses the same exact constant and the
 * same rounding, and every real dataset body formats to complete bilingual
 * names plus unit-bearing values with no placeholders in place of real data.
 */
import assert from "node:assert/strict";
import { format, data } from "./info-format-harness.mjs";

const {
  KM_PER_AU,
  MISSING_DISPLAY,
  fmt,
  hasValue,
  kmToAu,
  auToKm,
  formatDistanceKm,
  formatDistanceAu,
  formatPeriodDays,
  formatRotationHours,
  bilingualName,
} = format;
const { SOLAR_SYSTEM } = data;

let n = 0;
function t(name, fn) {
  fn();
  n++;
  console.log(`ok ${n} - ${name}`);
}

// --- missing-data guard ------------------------------------------------------

t("fmt: undefined / NaN / Infinity all render the explicit placeholder", () => {
  for (const v of [undefined, NaN, Infinity, -Infinity]) {
    assert.equal(fmt(v), MISSING_DISPLAY, `fmt(${v})`);
  }
  assert.equal(fmt(0), "0", "0 is a real value, not missing");
});

t("hasValue accepts only finite numbers", () => {
  assert.equal(hasValue(undefined), false);
  assert.equal(hasValue(NaN), false);
  assert.equal(hasValue("5"), false);
  assert.equal(hasValue(5), true);
  assert.equal(hasValue(0), true);
});

t("every optional-field formatter returns the placeholder for missing data", () => {
  for (const fn of [formatDistanceKm, formatDistanceAu, formatPeriodDays, formatRotationHours]) {
    assert.equal(fn(undefined), MISSING_DISPLAY, fn.name);
    assert.equal(fn(NaN), MISSING_DISPLAY, fn.name);
  }
  assert.equal(formatDistanceKm(undefined, "목성"), MISSING_DISPLAY);
});

// --- km ↔ AU conversion consistency ------------------------------------------

t("conversion uses the exact IAU constant and round-trips", () => {
  assert.equal(KM_PER_AU, 149_597_870.7);
  for (const au of [0.387, 1, 5.204, 39.6]) {
    assert.ok(Math.abs(kmToAu(auToKm(au)) - au) < 1e-12, `round-trip ${au} AU`);
  }
});

t("km and AU figures of the SAME distance agree with each other", () => {
  // Io's real orbit ~421,700 km: the km string and its parenthesised AU
  // figure must both be present and convert into each other under the rules.
  const s = formatDistanceKm(421_700, "목성(Jupiter) 기준");
  const km = Number(s.match(/([\d,]+) km/)[1].replace(/,/g, ""));
  const au = Number(s.match(/\(([\d.]+) AU\)/)[1]);
  assert.ok(Math.abs(kmToAu(km) - au) < 5e-7, s);
  assert.ok(s.includes("목성"), s);
});

t("AU distance shows both units with the unified rounding rule", () => {
  const s = formatDistanceAu(5.204, "태양(Sun) 기준");
  assert.ok(s.includes("AU") && s.includes("km"), s);
  assert.ok(!s.includes("undefined") && !s.includes("NaN"), s);
  // km figure is the AU figure × the exact constant (to km integer rounding)
  const km = Number(s.match(/\(([\d,]+) km\)/)[1].replace(/,/g, ""));
  assert.ok(Math.abs(km - Math.round(auToKm(5.204))) <= 1, s);
});

// --- meaning-bearing values ----------------------------------------------------

t("period: days below a year, years (with day count) above", () => {
  assert.equal(formatPeriodDays(1.769), "1.77 일");
  assert.ok(formatPeriodDays(4332.59).includes("년"), "Jupiter 11.86 y");
  assert.ok(formatPeriodDays(4332.59).includes("일"), "days kept in parens");
});

t("rotation: retrograde sign is shown as meaning, magnitude stays positive", () => {
  assert.equal(formatRotationHours(23.93), "23.93 h");
  const retro = formatRotationHours(-5832.43);
  assert.ok(retro.includes("역행"), retro);
  assert.ok(!retro.includes("-"), `no bare negative: ${retro}`);
});

t("bilingual name pairs Korean and English, placeholder for gaps", () => {
  assert.equal(bilingualName("목성", "Jupiter"), "목성 · Jupiter");
  assert.equal(bilingualName("", "Jupiter"), "— · Jupiter");
  assert.equal(bilingualName(undefined, undefined), "— · —");
});

// --- whole-dataset sweep ---------------------------------------------------------

t("EVERY dataset body formats bilingually with real data and no leaks", () => {
  for (const b of SOLAR_SYSTEM) {
    const name = bilingualName(b.nameKo, b.nameEn);
    assert.ok(name.includes("·") && !name.includes(MISSING_DISPLAY), `name ${b.id}: ${name}`);

    const radius = `${fmt(b.radiusKm, 1)} km`;
    assert.ok(!radius.includes(MISSING_DISPLAY) && radius.endsWith("km"), `radius ${b.id}`);

    const period = formatPeriodDays(b.orbitalPeriodDays);
    assert.ok(!period.includes("undefined") && !period.includes("NaN"), `period ${b.id}`);

    const rot = formatRotationHours(b.rotationPeriodHours);
    assert.ok(!rot.includes("undefined") && !rot.includes("NaN"), `rotation ${b.id}`);

    // Bodies that carry an orbit produce a unit-bearing, reference-labelled
    // distance; bodies without one produce exactly the placeholder.
    if (b.semiMajorAxis !== undefined) {
      const d = b.type === "moon"
        ? formatDistanceKm(b.semiMajorAxis, "parent")
        : formatDistanceAu(b.semiMajorAxis, "sun");
      assert.ok(d.includes("AU") && d.includes("km"), `distance ${b.id}: ${d}`);
      assert.ok(!d.includes(MISSING_DISPLAY), `distance ${b.id}`);
    } else {
      assert.equal(formatDistanceAu(b.semiMajorAxis), MISSING_DISPLAY, `distance ${b.id}`);
    }
  }
});

t("moon sweep: every moon has a parent in the dataset for the reference label", () => {
  const byId = new Map(SOLAR_SYSTEM.map((b) => [b.id, b]));
  for (const b of SOLAR_SYSTEM) {
    if (b.type !== "moon") continue;
    const p = byId.get(b.parentId);
    assert.ok(p, `moon ${b.id} parent label would be missing`);
    const d = formatDistanceKm(b.semiMajorAxis, bilingualName(p.nameKo, p.nameEn));
    assert.ok(d.includes(p.nameKo) && d.includes(p.nameEn), `${b.id}: ${d}`);
  }
});

console.log(`\n${n} info-format checks passed`);
