/**
 * Display-format contract tests (task t_d9203468: labels + info panel).
 * Run: node scripts/info-format.test.mjs
 * Pins the ONE formatting rule set ui/format.ts: missing data NEVER leaks as
 * undefined/NaN/blank, km↔AU always uses the same exact constant and the
 * same rounding, and every real dataset body formats to a complete
 * current-language name plus unit-bearing values with no placeholders in
 * place of real data.
 */
import assert from "node:assert/strict";
import { format, data, i18n } from "./info-format-harness.mjs";

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
  displayName,
  bodyDisplayName,
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

t("period: days below a year, years (with day count) above (EN default)", () => {
  assert.equal(formatPeriodDays(1.769), "1.77 days");
  assert.ok(formatPeriodDays(4332.59).includes("years"), "Jupiter 11.86 y");
  assert.ok(formatPeriodDays(4332.59).includes("days"), "days kept in parens");
});

t("rotation: retrograde sign is shown as meaning, magnitude stays positive", () => {
  assert.equal(formatRotationHours(23.93), "23.93 h");
  const retro = formatRotationHours(-5832.43);
  assert.ok(retro.includes("retrograde"), retro);
  assert.ok(!retro.includes("-"), `no bare negative: ${retro}`);
});

t("displayName: the selected language's name ONLY, other-language fallback for gaps", () => {
  assert.equal(displayName("목성", "Jupiter", "ko"), "목성");
  assert.equal(displayName("목성", "Jupiter", "en"), "Jupiter");
  assert.equal(displayName("", "Jupiter", "ko"), "Jupiter", "missing ko → real en name beats a placeholder");
  assert.equal(displayName("목성", "", "en"), "목성", "missing en → real ko name beats a placeholder");
  assert.equal(displayName(undefined, undefined, "ko"), MISSING_DISPLAY);
  assert.equal(displayName(undefined, undefined, "en"), MISSING_DISPLAY);
});

// --- locale-aware data-label priority (task t_8701c121) -----------------------
// Korean mode keeps the ORIGINAL strings byte-for-byte; EN mode leads with
// English words. Numbers/conversions are IDENTICAL in both modes — a
// language switch is a display-layer event, never a data event.

t("period EN mode: English unit words, same scale rule (days < year, years above)", () => {
  assert.equal(formatPeriodDays(1.769, "en"), "1.77 days");
  const jup = formatPeriodDays(4332.59, "en");
  assert.ok(jup.includes("11.86 years"), jup);
  assert.ok(jup.includes("4,333 days"), `day count kept in parens: ${jup}`);
  assert.ok(!/[\uAC00-\uD7A3]/.test(jup), `no Korean leak: ${jup}`);
});

t("period ko mode with EXPLICIT lang keeps the original strings", () => {
  assert.equal(formatPeriodDays(1.769, "ko"), "1.77 일");
  assert.ok(formatPeriodDays(4332.59, "ko").includes("년"));
});

t("period: the NUMBERS are identical across languages (display-only change)", () => {
  const digits = (s) => (s.match(/[\d.,]+/g) ?? []).join("|");
  assert.equal(digits(formatPeriodDays(4332.59, "ko")), digits(formatPeriodDays(4332.59, "en")));
  assert.equal(digits(formatPeriodDays(1.769, "ko")), digits(formatPeriodDays(1.769, "en")));
});

t("rotation EN mode: English retrograde marker, no bare negative", () => {
  assert.equal(formatRotationHours(23.93, "en"), "23.93 h");
  const retro = formatRotationHours(-5832.43, "en");
  assert.ok(retro.includes("retrograde") && !/[\uAC00-\uD7A3]/.test(retro), retro);
  assert.ok(!retro.includes("-"), `no bare negative: ${retro}`);
});

t("name: each mode shows ONLY its own language's name — never the pair", () => {
  assert.ok(!displayName("목성", "Jupiter", "ko").includes("Jupiter"));
  assert.ok(!displayName("목성", "Jupiter", "en").includes("목성"));
  assert.ok(!displayName("목성", "Jupiter", "ko").includes("·"), "no pair separator");
  assert.ok(!displayName("목성", "Jupiter", "en").includes("·"), "no pair separator");
});

t("bodyDisplayName: localized names win, gaps fall back to the English name", () => {
  const jup = SOLAR_SYSTEM.find((b) => b.id === "jupiter");
  assert.equal(bodyDisplayName(jup, "ko"), "목성");
  assert.equal(bodyDisplayName(jup, "en"), "Jupiter");
  assert.equal(bodyDisplayName(jup, "ja"), "木星");
  assert.equal(bodyDisplayName(jup, "zh"), "木星");
  assert.equal(bodyDisplayName(jup, "es"), "Júpiter");
  assert.equal(bodyDisplayName(jup, "ar"), "المشتري");
  // fr/de write Jupiter exactly like English — exercised as the fallback path
  assert.equal(bodyDisplayName(jup, "fr"), "Jupiter");
  assert.equal(bodyDisplayName(jup, "de"), "Jupiter");
  const io = SOLAR_SYSTEM.find((b) => b.id === "io");
  assert.equal(bodyDisplayName(io, "zh"), "木卫一", "Chinese systematic designation");
  assert.equal(bodyDisplayName(io, "es"), "Ío");
  assert.equal(bodyDisplayName(undefined, "en"), MISSING_DISPLAY, "missing body → placeholder");
});

t("bodyDisplayName: EVERY body resolves to a real name in EVERY language", () => {
  for (const lang of i18n.LANGS) {
    for (const b of SOLAR_SYSTEM) {
      const name = bodyDisplayName(b, lang);
      assert.ok(
        typeof name === "string" && name.length > 0 && name !== MISSING_DISPLAY,
        `${lang}/${b.id}: ${JSON.stringify(name)}`,
      );
    }
  }
});

t("formatters FOLLOW the current language without an explicit lang arg", () => {
  const before = i18n.getLang();
  try {
    i18n.setLang("en");
    assert.equal(formatPeriodDays(1.769), "1.77 days");
    assert.equal(displayName("지구", "Earth"), "Earth");
    i18n.setLang("ko");
    assert.equal(formatPeriodDays(1.769), "1.77 일");
    assert.equal(displayName("지구", "Earth"), "지구");
  } finally {
    i18n.setLang(before);
  }
});

t("reference labels: {name} carries the current-language name only", () => {
  const koRef = i18n.t("info.ref.moon", { name: displayName("목성", "Jupiter", "ko") }, "ko");
  const enRef = i18n.t("info.ref.moon", { name: displayName("목성", "Jupiter", "en") }, "en");
  assert.ok(koRef.includes("목성") && !koRef.includes("Jupiter"), koRef);
  assert.ok(enRef.includes("Jupiter") && !enRef.includes("목성"), enRef);
  assert.ok(!koRef.includes("{name}") && !enRef.includes("{name}"), "token resolved");
});

t("type labels: every body type resolves in BOTH languages, no placeholders", () => {
  for (const lang of ["ko", "en"]) {
    for (const key of ["type.star", "type.planet", "type.dwarf-planet", "type.moon"]) {
      const v = i18n.t(key, undefined, lang);
      assert.ok(v.trim().length > 0 && !v.includes("?"), `${lang}.${key} = ${v}`);
    }
  }
});

// --- whole-dataset sweep ---------------------------------------------------------

t("EVERY dataset body has a real name in BOTH languages and formats without leaks", () => {
  for (const b of SOLAR_SYSTEM) {
    for (const lang of ["ko", "en"]) {
      const name = displayName(b.nameKo, b.nameEn, lang);
      assert.ok(name.length > 0 && !name.includes(MISSING_DISPLAY), `name ${b.id} (${lang}): ${name}`);
    }

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
    const dKo = formatDistanceKm(b.semiMajorAxis, displayName(p.nameKo, p.nameEn, "ko"));
    const dEn = formatDistanceKm(b.semiMajorAxis, displayName(p.nameKo, p.nameEn, "en"));
    assert.ok(dKo.includes(p.nameKo) && !dKo.includes(p.nameEn), `${b.id}: ${dKo}`);
    assert.ok(dEn.includes(p.nameEn) && !dEn.includes(p.nameKo), `${b.id}: ${dEn}`);
  }
});

console.log(`\n${n} info-format checks passed`);
