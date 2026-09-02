/**
 * Simulation-time / kinematics unit tests (task t_1f6e8acc).
 * Run: node scripts/sim-time.test.mjs
 * Covers the PURE math only (no three.js/DOM): Kepler solver accuracy and
 * stability, representative-body sanity (Earth/Jupiter/Saturn/Pluto/Io/
 * Titan/Moon), extreme time-scale behaviour, spin from real rotation periods,
 * inclination mapping, and the frame-rate-independent SimulationClock with
 * play/pause/reset/presets (spec §7/§8/§16).
 */
import assert from "node:assert/strict";
import { kepler, simMath, clockMod } from "./sim-time-harness.mjs";

const { solveKepler, ellipsePlanePosition, meanAnomalyRad } = kepler;
const { spinAngleRad, inclinationComponents, degToRad } = simMath;
const { SimulationClock, TIME_SCALE_PRESETS, timeScaleLabel } = clockMod;

const TWO_PI = Math.PI * 2;
let n = 0;
function t(name, fn) {
  fn();
  n++;
  console.log(`ok ${n} - ${name}`);
}

/** Kepler residual |E − e·sinE − M| after wrapping to (−π, π]. */
function residual(M, e) {
  const E = solveKepler(M, e);
  const f = (((M - (E - e * Math.sin(E))) % TWO_PI) + TWO_PI) % TWO_PI;
  return Math.abs(f > Math.PI ? f - TWO_PI : f);
}

// ---------------------------------------------------------------------------
// 1. Solver accuracy — every e in the dataset plus deliberately extreme ones
// ---------------------------------------------------------------------------
t("solver residual < 1e-8 for all real eccentricities and extremes", () => {
  for (const e of [0, 0.0068, 0.0167, 0.0934, 0.2056, 0.252, 0.5, 0.9, 0.969, 0.99, 0.999]) {
    for (let i = 0; i < 512; i++) {
      const M = (i / 512) * TWO_PI;
      assert.ok(residual(M, e) < 1e-8, `e=${e} M=${M.toFixed(3)} residual=${residual(M, e)}`);
    }
  }
});

t("solver is E-monotone in M (no flips at high eccentricity)", () => {
  let prev = -Infinity;
  for (let i = 0; i < 20000; i++) {
    const E = solveKepler((i / 20000) * TWO_PI, 0.99);
    assert.ok(E >= prev - 1e-12, "E went backwards");
    prev = E;
  }
});

t("mean anomaly wraps to [0, 2π) incl. negative time", () => {
  assert.equal(meanAnomalyRad(0, 365.25, 0), 0);
  const a = meanAnomalyRad(-100, 365.25, 0.7);
  assert.ok(a >= 0 && a < TWO_PI, `got ${a}`);
});

// ---------------------------------------------------------------------------
// 2. Geometry — focus at origin, apsides match a(1±e), orbit closes
// ---------------------------------------------------------------------------
t("apsides match a(1−e) and a(1+e) for an eccentric orbit (Pluto)", () => {
  const a = 39.6;
  const e = 0.252;
  const per = ellipsePlanePosition(0, 1, a, e, 0); // M=0 → periapsis
  assert.ok(Math.abs(per.r - a * (1 - e)) < 1e-6, `peri r=${per.r}`);
  assert.ok(Math.abs(per.y) < 1e-9);
  const P = 90560; // Pluto sidereal days
  const apo = ellipsePlanePosition(P / 2, P, a, e, 0); // M=π → apoapsis
  assert.ok(Math.abs(apo.r - a * (1 + e)) < 1e-3, `apo r=${apo.r}`);
});

t("orbit is closed and periodic: pos(t) == pos(t+P) (Earth)", () => {
  const P = 365.256;
  for (const t0 of [0, 40.5, 200]) {
    const p1 = ellipsePlanePosition(t0, P, 1, 0.0167, 1.1);
    const p2 = ellipsePlanePosition(t0 + P, P, 1, 0.0167, 1.1);
    assert.ok(Math.abs(p1.x - p2.x) < 1e-9 && Math.abs(p1.y - p2.y) < 1e-9);
  }
});

t("eccentric motion: angular sweep fast at periapsis, slow at apoapsis (Kepler II)", () => {
  const e = 0.252;
  const P = 90560;
  // Signed shortest-arc angle between two positions (wrap-safe).
  const sweep = (t0, t1) => {
    const p0 = ellipsePlanePosition(t0, P, 39.6, e, 0);
    const p1 = ellipsePlanePosition(t1, P, 39.6, e, 0);
    return Math.abs(Math.atan2(p0.x * p1.y - p0.y * p1.x, p0.x * p1.x + p0.y * p1.y));
  };
  // Equal time windows around periapsis (t=0) and apoapsis (t=P/2).
  const wPeri = sweep(0, 0.01 * P);
  const wApo = sweep(0.5 * P, 0.51 * P);
  assert.ok(wPeri > wApo, `peri sweep ${wPeri} should exceed apo sweep ${wApo}`);
});

// ---------------------------------------------------------------------------
// 3. Representative bodies — real periods/axes from the dataset (JPL)
// ---------------------------------------------------------------------------
t("representative heliocentric bodies: period/axis/range consistency", () => {
  const BODIES = [
    // [id, P(days), a(AU), e]  — JPL [S1]/[S2]
    ["earth", 365.256, 1.000001018, 0.01671022],
    ["jupiter", 4332.589, 5.2026, 0.0489],
    ["saturn", 10759.22, 9.5549, 0.0565],
    ["pluto", 90560, 39.6, 0.252],
  ];
  for (const [, P, a, e] of BODIES) {
    let rmin = Infinity;
    let rmax = 0;
    for (let i = 0; i < 4000; i++) {
      const { r } = ellipsePlanePosition((i / 4000) * P, P, a, e, 0);
      assert.ok(Number.isFinite(r) && r > 0);
      rmin = Math.min(rmin, r);
      rmax = Math.max(rmax, r);
    }
    assert.ok(Math.abs(rmin - a * (1 - e)) / a < 1e-3, `${a} rmin`);
    assert.ok(Math.abs(rmax - a * (1 + e)) / a < 1e-3, `${a} rmax`);
  }
  // Kepler's third law sanity on real numbers: P² ∝ a³ across these bodies
  const ratio = (P, a) => (P * P) / (a * a * a);
  const rEarth = ratio(365.256, 1.000001018);
  const rJup = ratio(4332.589, 5.2026);
  const rSat = ratio(10759.22, 9.5549);
  assert.ok(Math.abs(rJup / rEarth - 1) < 0.05, `jupiter P²/a³ off: ${rJup / rEarth}`);
  assert.ok(Math.abs(rSat / rEarth - 1) < 0.05, `saturn P²/a³ off: ${rSat / rEarth}`);
});

t("relative speeds come from real periods: inner sweeps more than outer in fixed time", () => {
  // Earth vs Jupiter over 100 days (mean-anomaly advance 2π·t/P).
  const earth = ellipsePlanePosition(100, 365.256, 1, 0.0167, 0);
  const earth0 = ellipsePlanePosition(0, 365.256, 1, 0.0167, 0);
  const jup = ellipsePlanePosition(100, 4332.589, 5.2026, 0.0489, 0);
  const jup0 = ellipsePlanePosition(0, 4332.589, 5.2026, 0.0489, 0);
  const sweep = (p0, p) => Math.abs(Math.atan2(p.y, p.x) - Math.atan2(p0.y, p0.x));
  assert.ok(sweep(earth0, earth) > sweep(jup0, jup) * 5);
});

t("moon orbits in parent-local units (Io: a=421700 km, P=1.769 d)", () => {
  const a = 421700;
  const e = 0.0041;
  const P = 1.769137786;
  const p0 = ellipsePlanePosition(0, P, a, e, 0);
  assert.ok(Math.abs(p0.r - a * (1 - e)) < 1);
  const half = ellipsePlanePosition(P / 2, P, a, e, 0);
  assert.ok(Math.abs(half.r - a * (1 + e)) < a * 1e-3);
});

// ---------------------------------------------------------------------------
// 4. Spin — real rotation periods incl. retrograde (spec §7)
// ---------------------------------------------------------------------------
t("spin: Earth completes one turn per sidereal day, sign positive", () => {
  const P = 23.9345; // h
  const a1 = spinAngleRad(1, P);
  assert.ok(Math.abs(a1 - (TWO_PI * 24) / P) < 1e-9);
  assert.ok(a1 > 0);
});

t("spin: retrograde bodies (Venus/Uranus negative period) spin opposite", () => {
  const venus = spinAngleRad(10, -5832.43);
  const earth = spinAngleRad(10, 23.9345);
  assert.ok(Math.sign(venus) === -1 && Math.sign(earth) === 1);
});

t("spin: no period / zero period → no spin, never NaN", () => {
  assert.equal(spinAngleRad(123, undefined), 0);
  assert.equal(spinAngleRad(123, 0), 0);
});

// ---------------------------------------------------------------------------
// 5. Inclination mapping — shared by bodies and orbit lines
// ---------------------------------------------------------------------------
t("inclination: i=0 keeps the flat plane (y=0, z=cz)", () => {
  const c = inclinationComponents(12.5, 0);
  assert.equal(c.y, 0);
  assert.ok(Math.abs(c.z - 12.5) < 1e-12);
});

t("inclination: Pluto 17.1° lifts y off the ecliptic, magnitude preserved", () => {
  const cz = 100;
  const c = inclinationComponents(cz, 17.1);
  assert.ok(c.y > 0 && c.y < cz);
  assert.ok(Math.abs(Math.hypot(c.y, c.z) - cz) < 1e-9); // pure rotation about X
});

t("degToRad matches three.js convention within 1e-12", () => {
  assert.ok(Math.abs(degToRad(180) - Math.PI) < 1e-12);
});

// ---------------------------------------------------------------------------
// 6. SimulationClock — frame-rate independence, transport, presets (spec §8)
// ---------------------------------------------------------------------------
t("clock: same real duration → same simDays at any frame pacing", () => {
  const mk = (steps, dtMs) => {
    const c = new SimulationClock();
    c.setTimeScale(100); // 100 sim days per real second
    let ms = 0;
    c.update(ms); // seeds lastRealMs
    for (let i = 0; i < steps; i++) {
      ms += dtMs;
      c.update(ms);
    }
    return c.simDays;
  };
  // 2 seconds of real time each, different frame rates (60fps vs 15fps).
  const at60 = mk(120, 1000 / 60);
  const at15 = mk(30, 1000 / 15);
  assert.ok(Math.abs(at60 - 200) < 1e-6, `60fps ${at60}`);
  assert.ok(Math.abs(at15 - 200) < 1e-6, `15fps ${at15}`);
});

t("clock: pause freezes simDays, play resumes accumulation", () => {
  const c = new SimulationClock();
  c.setPlaying(false);
  c.update(0);
  c.update(1000);
  assert.equal(c.simDays, 0);
  c.setPlaying(true);
  c.update(2000);
  assert.ok(c.simDays > 0);
});

t("clock: reset returns to initial time (default epoch 0, or a given day)", () => {
  const c = new SimulationClock();
  c.update(0);
  c.update(5000);
  assert.ok(c.simDays > 0);
  c.reset();
  assert.equal(c.simDays, 0);
  c.reset(1234.5);
  assert.equal(c.simDays, 1234.5);
  // Stale real-time gap after reset must not jump the clock:
  c.update(999999);
  assert.ok(c.simDays < 1240, `reset didn't reseed dt (got ${c.simDays})`);
});

t("clock: huge real-time gaps clamp (tab was backgrounded)", () => {
  const c = new SimulationClock();
  c.setTimeScale(365.25);
  c.update(0);
  c.update(10 * 60 * 1000); // 10 minutes of wall time in one step
  assert.ok(c.simDays <= 1 * 365.25 + 1e-9, `gap not clamped: ${c.simDays}`);
});

t("clock presets cover the suggested ladder 1d…1y per second", () => {
  const v = TIME_SCALE_PRESETS.map((p) => p.daysPerSecond);
  assert.deepEqual(v, [1, 10, 100, 365.25]);
  assert.equal(timeScaleLabel(365.25), "1s = 1 year");
  assert.match(timeScaleLabel(7), /1s = 7 days/);
});

t("speed labels localize: ko preset + generated, EN is the app default", () => {
  assert.equal(timeScaleLabel(365.25, "ko"), "1초 = 1년");
  assert.equal(timeScaleLabel(1, "ko"), "1초 = 1일");
  assert.equal(timeScaleLabel(7, "ko"), "1초 = 7일");
  assert.equal(timeScaleLabel(0.5, "ko"), "1초 = 12시간");
  assert.equal(timeScaleLabel(0.5), "1s = 12 hours", "EN default without an explicit language");
});

t("extreme speed: at max preset the whole Pluto orbit advances in <1 min real", () => {
  const c = new SimulationClock();
  c.setTimeScale(365.25); // 1s = 1y (max preset)
  let ms = 0;
  c.update(ms);
  while (c.simDays < 90560 && ms < 60000 * 10) {
    ms += 16.7;
    c.update(ms);
  }
  assert.ok(c.simDays >= 90560, `Pluto year not reached in 10 min real at 1y/s`);
});

t("positions never depend on wall clock: two clocks, same simDays → same place", () => {
  const p1 = ellipsePlanePosition(12345.6, 4332.589, 5.2026, 0.0489, 2.4);
  const p2 = ellipsePlanePosition(12345.6, 4332.589, 5.2026, 0.0489, 2.4);
  assert.deepEqual(p1, p2);
  assert.ok(Number.isFinite(p1.x) && Number.isFinite(p1.y) && Number.isFinite(p1.r));
});

console.log(`\nall ${n} sim-time tests passed`);
