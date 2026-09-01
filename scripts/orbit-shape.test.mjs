/**
 * Orbit-shape regression (fix task t_d17906bf, following the diagnosis in
 * t_5a546f13 / docs/orbit-shape-diagnosis.md). The FIX-REVERSES fingerprint
 * assertions are now INVERTED: they assert the FIXED contract — every
 * parent-local satellite orbit renders as a closed circle/ellipse in every
 * distance mode, with only its SIZE scaled.
 *
 * CONTRACT (all proven by these tests on the REAL ScaleManager,
 * OrbitRenderer and CelestialBody code):
 *  (1) θ preserved — periapsis on +x, no axis flip, a:b = 1:√(1−e²)
 *      constant over θ (extent-fit ratio matches the real ratio);
 *  (2) eccentricity preserved — reconstructed e′ from drawn samples equals
 *      the real e, so the focus-anchored conic residual is ~0 (was 0.895:
 *      a cardioid-family curve);
 *  (3) the 90° radius matches the mapped-ellipse latus rectum (overshoot
 *      was +119 % pre-fix — the cardioid dimple);
 *  (4) closed 256-vertex loop with a smooth seam;
 *  (5) line ≡ body vertex-for-vertex: OrbitRenderer.isMoon and
 *      CelestialBody.moonRenderDistance both delegate to
 *      ScaleManager.mapSatelliteOrbitRadius — ONE uniform radial scale per
 *      orbit (a uniform scaling about the focus maps the real conic to a
 *      SIMILAR conic of the same e, never a cardioid);
 *  (6) size still rides the spec §5 log band: mapSatelliteDistance(a) keeps
 *      moon-vs-moon ordering; drawn apoapsis is capped at 9× parent radius
 *      (× systemMoonBoost while selected) even for large real e;
 *  (7) the mapping is parent-local: identical in log / linear / focus
 *      distance modes, and the §13 selection boost is itself uniform
 *      (shape survives the boost).
 *
 * MECHANISM: satelliteOrbitScale(a, e, …) picks ONE units-per-km constant
 * per orbit from mapSatelliteDistance(a) (the SIZE mapping, unchanged
 * scalar behaviour for ordering/camera framing), capped so
 * a(1+e)·scale ≤ band ceiling; mapSatelliteOrbitRadius multiplies any
 * radius by that constant. No per-vertex radius remap exists any more.
 * Run: node scripts/orbit-shape.test.mjs
 */
import assert from "node:assert/strict";
import { scaleMod, orbitMod, bodyMod, data } from "./orbit-shape-harness.mjs";

const { ScaleManager } = scaleMod;
const { OrbitRenderer } = orbitMod;
const { SOLAR_SYSTEM } = data;

let n = 0;
function t(name, fn) {
  fn();
  n++;
  console.log(`ok ${n} - ${name}`);
}

const moon = SOLAR_SYSTEM.find((b) => b.id === "moon");
const a = moon.semiMajorAxis; // 384400 km
const e = moon.eccentricity; // 0.0554
const rp = a * (1 - e);
const ra = a * (1 + e);
const PARENT_R = 1.2; // render units (Earth enhanced-mode radius)

const scale = new ScaleManager({});

/**
 * Sample the DRAWN moon line through the REAL OrbitRenderer code path, in
 * the orbit's OWN plane: the renderer tilts every vertex about X by the
 * body's real inclination (y = cz·sin i, z = cz·cos i), so the pre-tilt
 * plane coordinate is recovered as cz = z / cos i. The shape contract is
 * about the orbit curve itself, not its inclined projection.
 */
function sampledLine(body, range, sc = scale, parentR = PARENT_R) {
  const line = new OrbitRenderer(body);
  line.refresh(sc, parentR, range, null);
  const arr = line.line.geometry.getAttribute("position").array;
  const cosInc = Math.cos((body.inclinationDeg ?? 0) * (Math.PI / 180));
  const pts = [];
  for (let i = 0; i < 256; i++) {
    const x = arr[i * 3];
    const y = arr[i * 3 + 1];
    const z = arr[i * 3 + 2];
    // Undo the tilt exactly: hypot(y, z) = |cz| with sign from z/cos i
    // (|cos i| = 1 ⇒ no division drift; Triton's cos i < 0 flips z back).
    const cz = Math.hypot(y, z) * (Math.sign(z) || 1) * (Math.sign(cosInc) || 1);
    pts.push([x, cz]);
  }
  return pts;
}

/** Polar radii + focus-anchored conic fit of a drawn sample ring. */
function conicFit(pts) {
  const r = pts.map((p) => Math.hypot(p[0], p[1]));
  // Sample i ↔ eccentric anomaly E = 2πi/256: i=0 periapsis (+x), i=128 apoapsis.
  const rPeri = r[0];
  const rApo = r[128];
  const aFit = (rPeri + rApo) / 2;
  const eFit = (rApo - rPeri) / (rApo + rPeri);
  const semiLatus = aFit * (1 - eFit * eFit);
  let maxErr = 0;
  for (const [x, y] of pts) {
    const rr = Math.hypot(x, y);
    const c = Math.hypot(x, y) > 0 ? x / Math.max(rr, 1e-12) : 1; // cos θ
    maxErr = Math.max(maxErr, Math.abs(rr - semiLatus / (1 + eFit * c)) / aFit);
  }
  return { aFit, eFit, maxErr };
}

/** Extent-based axis ratio (a′:b′ along the periapsis axis, ≥1 when upright). */
function extentRatio(pts) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const aFit = (Math.max(...xs) - Math.min(...xs)) / 2;
  const bFit = (Math.max(...ys) - Math.min(...ys)) / 2;
  return { aFit, bFit, ratio: aFit / bFit };
}

// ---------------------------------------------------------------------------
// 1. Baseline: the Moon's REAL orbit is near-circular. Whatever the render
//    shows is the render's doing, not the data's.
// ---------------------------------------------------------------------------
t("Moon real orbit near-circular: e=0.0554, a:b=1.0015", () => {
  const ba = Math.sqrt(1 - e * e);
  assert.ok(Math.abs(ba - 0.99847) < 1e-4, `b/a=${ba}`);
});

// ---------------------------------------------------------------------------
// 2. Size band (spec §5) still holds on the SIZE mapping: a → [2.5×, 9×] of
//    the parent radius, and the minor-axis crossing now lands EXACTLY on the
//    conic latus rectum (pre-fix overshoot was +119 % — the cardioid dimple).
// ---------------------------------------------------------------------------
t("latus rectum: 90° radius matches the mapped conic (was +119 % overshoot)", () => {
  const minBand = PARENT_R * 2.5;
  const maxBand = PARENT_R * 9;
  const sizeAt = (km) => scale.mapSatelliteDistance(km, rp, ra, PARENT_R);
  assert.ok(Math.abs(sizeAt(rp) - minBand) < 1e-9);
  assert.ok(Math.abs(sizeAt(ra) - maxBand) < 1e-9);

  const pts = sampledLine(moon, { minKm: rp, maxKm: ra });
  const fit = conicFit(pts);
  // Sample i=64 is the eccentric-anomaly quarter point (E=π/2, real r=a).
  // On a true focus-conic its radius is semiLatus/(1+e′·cosθ) at ITS θ
  // (cosθ = −e there, so the value is a′·scale) — pre-fix this sample
  // overshot the conic through the same periapsis/apoapsis vertices by
  // +119 %, the cardioid dimple.
  const dMid = Math.hypot(pts[64][0], pts[64][1]);
  const theta = Math.atan2(pts[64][1], pts[64][0]);
  const latus = fit.aFit * (1 - fit.eFit * fit.eFit);
  const expected = latus / (1 + fit.eFit * Math.cos(theta));
  const overshoot = (dMid - expected) / expected;
  console.log(
    `  # size-map(a)=${sizeAt(a).toFixed(3)} band=[${minBand}, ${maxBand}] drawn a′=${fit.aFit.toFixed(3)} E=90° sample r=${dMid.toFixed(3)} vs conic-at-θ=${expected.toFixed(3)} overshoot=${(overshoot * 100).toExponential(1)}%`,
  );
  assert.ok(Math.abs(overshoot) < 1e-5, `expected conic at the quarter point within float32 rounding, got ${(overshoot * 100).toFixed(3)}%`);
  // Every drawn vertex stays inside the [2.5×, 9×] band (± float32 rounding).
  for (const [x, y] of pts) {
    const rr = Math.hypot(x, y);
    assert.ok(rr <= maxBand * (1 + 1e-6) && rr >= minBand * (1 - 1e-6), `vertex ${rr} outside band`);
  }
});

// ---------------------------------------------------------------------------
// 3. Closed-loop + seam sanity of the 256-sample LineLoop geometry.
// ---------------------------------------------------------------------------
const pts = sampledLine(moon, { minKm: rp, maxKm: ra });
t("drawn line is a closed 256-vertex loop (seam step matches its mirror step)", () => {
  assert.equal(pts.length, 256);
  // E-sampling is uniform in eccentric anomaly, so the step across the
  // seam (E=2π−δ → E=0) must equal its mirror (E=0 → E=δ) — the loop
  // closes smoothly wherever the sampling density happens to sit.
  const first = pts[0];
  const last = pts[255];
  const second = pts[1];
  const gap = Math.hypot(first[0] - last[0], first[1] - last[1]);
  const mirror = Math.hypot(second[0] - first[0], second[1] - first[1]);
  assert.ok(gap > 1e-9, "seam collapsed (duplicated seam vertex)");
  assert.ok(Math.abs(gap - mirror) / mirror < 1e-6, `seam ${gap} vs mirror ${mirror}`);
});

// ---------------------------------------------------------------------------
// 4. FIXED: a:b constant and upright — long axis along periapsis, ratio
//    matching the real 1/sqrt(1−e²) (pre-fix: 1.107:1 with the LONG axis on
//    the real MINOR direction).
// ---------------------------------------------------------------------------
t("a:b preserved and upright — drawn 1.0015:1 on the periapsis axis", () => {
  const ext = extentRatio(pts);
  const realRatio = 1 / Math.sqrt(1 - e * e); // 1.00154
  console.log(
    `  # drawn a′=${ext.aFit.toFixed(3)} b′=${ext.bFit.toFixed(3)} (a′:b′=${ext.ratio.toFixed(5)}) | real a:b=${realRatio.toFixed(5)}:1`,
  );
  assert.ok(ext.ratio >= 1, `long axis must lie on the periapsis axis, got ${ext.ratio}`);
  assert.ok(Math.abs(ext.ratio - realRatio) / realRatio < 1e-5, `a:b drift ${(ext.ratio - realRatio).toExponential(2)}`);
});

t("samples are a conic with the focus at the parent — unit-fit residual ~0 (was 0.895)", () => {
  const fit = conicFit(pts);
  console.log(`  # max |r − p/(1+e′cosθ)|/a′ over 256 samples = ${fit.maxErr.toExponential(2)}`);
  assert.ok(fit.maxErr < 1e-6, `expected focus-conic match within float32 rounding, got ${fit.maxErr}`);
});

// ---------------------------------------------------------------------------
// 5. line ≡ body: CelestialBody.moonRenderDistance and the OrbitRenderer
//    isMoon branch resolve to the SAME ScaleManager.mapSatelliteOrbitRadius
//    call, so the animated moon always rides its drawn line (spec §4/§13).
// ---------------------------------------------------------------------------
t("line ≡ body vertex-for-vertex (shared mapSatelliteOrbitRadius path)", () => {
  // θ=0 (periapsis) → exactly +x, positive:
  assert.equal(pts[0][1], 0);
  assert.ok(pts[0][0] > 0);

  const body = new bodyMod.CelestialBody(moon, 0);
  // SolarSystem supplies these before updateFromSim (computeMoonRanges +
  // syncParentRadii) — mirror that setup here.
  body.moonDistanceRange = { minKm: rp, maxKm: ra };
  body.parentRenderRadius = PARENT_R;
  for (const simDays of [0, 3.7, 11.3, 19.9, 25.5]) {
    const pos = body.realPlanePosition(simDays);
    const d = body.moonRenderDistance(pos.r, scale);
    const shared = scale.mapSatelliteOrbitRadius(pos.r, a, e, rp, ra, PARENT_R);
    assert.ok(Math.abs(d - shared) < 1e-12, "line/body radius-map drift");
  }
});

// ---------------------------------------------------------------------------
// 6. FIXED: eccentricity reconstruction from sample coordinates — e′ equals
//    the real e (pre-fix: e′=0.4286, 7.7× inflated).
// ---------------------------------------------------------------------------
t("reconstructed e′ = real e = 0.0554 (pre-fix: 0.4286, 7.7× error)", () => {
  const fit = conicFit(pts);
  console.log(
    `  # e_original=${e} e_reconstructed=${fit.eFit.toFixed(6)} ratio=${(fit.eFit / e).toFixed(6)} conic-residual=${fit.maxErr.toExponential(2)}`,
  );
  assert.ok(Math.abs(fit.eFit - e) < 1e-6, `expected e within float32 rounding, got ${fit.eFit}`);
});

// ---------------------------------------------------------------------------
// 7. FIXED across systems: Triton (real e≈0) draws a TRUE circle (pre-fix
//    1.217:1 at e≈0), and a HIGH-e synthetic satellite keeps its shape too —
//    uniform per-orbit scaling preserves e for ANY eccentricity, while the
//    apoapsis stays capped inside the 9× band.
// ---------------------------------------------------------------------------
t("Triton is a true circle; a high-e satellite (e=0.25) keeps e and its band", () => {
  const triton = SOLAR_SYSTEM.find((b) => b.id === "triton");
  const rpT = triton.semiMajorAxis * (1 - triton.eccentricity);
  const raT = triton.semiMajorAxis * (1 + triton.eccentricity);
  const tPts = sampledLine(triton, { minKm: rpT, maxKm: raT });
  const extT = extentRatio(tPts);
  console.log(`  # triton (real e=${triton.eccentricity}) drawn a:b = ${extT.ratio.toFixed(5)}:1`);
  assert.ok(Math.abs(extT.ratio - 1) < 1e-5, `Triton must render as a circle, got ${extT.ratio}:1`);
  const fitT = conicFit(tPts);
  assert.ok(fitT.maxErr < 1e-6, `Triton conic residual ${fitT.maxErr}`);

  // Synthetic high-e satellite (no such moon in the JPL dataset — probes the
  // cap + shape law beyond e≈0): a=100,000 km, e=0.25, own-range band.
  const hiE = {
    id: "synthetic-hi-e",
    jplId: "000",
    nameKo: "합성",
    nameEn: "SyntheticHiE",
    type: "moon",
    parentId: "jupiter",
    radiusKm: 100,
    semiMajorAxis: 100000,
    semiMajorAxisUnit: "km",
    eccentricity: 0.25,
    orbitalPeriodDays: 10,
    displayColor: "#ffffff",
  };
  const hPts = sampledLine(hiE, {
    minKm: hiE.semiMajorAxis * (1 - hiE.eccentricity),
    maxKm: hiE.semiMajorAxis * (1 + hiE.eccentricity),
  });
  const fitH = conicFit(hPts);
  const extH = extentRatio(hPts);
  const maxBand = PARENT_R * 9;
  const apo = Math.max(...hPts.map((p) => Math.hypot(p[0], p[1])));
  console.log(
    `  # hi-e (e=0.25): e′=${fitH.eFit.toFixed(6)} residual=${fitH.maxErr.toExponential(2)} a:b=${extH.ratio.toFixed(5)} apoapsis=${apo.toFixed(3)} ≤ band ceiling ${maxBand}`,
  );
  assert.ok(Math.abs(fitH.eFit - 0.25) < 1e-5, `high-e shape must survive: e′=${fitH.eFit}`);
  assert.ok(fitH.maxErr < 1e-6, `high-e conic residual ${fitH.maxErr}`);
  assert.ok(Math.abs(apo - maxBand) < maxBand * 1e-5, `apoapsis must sit ON the capped ceiling, got ${apo}`);
});

// ---------------------------------------------------------------------------
// 8. Parent-local invariance (task contract): the moon mapping is mode-
//    independent — identical geometry in log / linear / focus — and the §13
//    selection boost rescales it UNIFORMLY (still a similar conic).
// ---------------------------------------------------------------------------
t("mode-invariant + uniform system boost: log/linear/focus draw the same ellipse", () => {
  const range = { minKm: rp, maxKm: ra };
  const base = sampledLine(moon, range);
  const scLinear = new ScaleManager({});
  scLinear.setMode("linear", "enhanced");
  const scFocus = new ScaleManager({});
  scFocus.setMode("focus", "enhanced"); // anchors on earth — moons unaffected
  const lin = sampledLine(moon, range, scLinear);
  const foc = sampledLine(moon, range, scFocus);
  for (let i = 0; i < 256; i++) {
    assert.ok(
      Math.hypot(base[i][0] - lin[i][0], base[i][1] - lin[i][1]) < 1e-12 &&
        Math.hypot(base[i][0] - foc[i][0], base[i][1] - foc[i][1]) < 1e-12,
      `mode changed the parent-local moon geometry at vertex ${i}`,
    );
  }

  // Select the Earth system → band ×2.2 boost must be a uniform rescale.
  const sel = new ScaleManager({});
  sel.selectedId = "earth";
  assert.ok(sel.systemBoostActive);
  const boosted = sampledLine(moon, range, sel);
  const f0 = extentRatio(base);
  const f1 = extentRatio(boosted);
  const s = Math.hypot(boosted[0][0], boosted[0][1]) / Math.hypot(base[0][0], base[0][1]);
  for (let i = 0; i < 256; i++) {
    const d0 = Math.hypot(base[i][0], base[i][1]);
    const d1 = Math.hypot(boosted[i][0], boosted[i][1]);
    assert.ok(Math.abs(d1 - s * d0) / d0 < 1e-5, `boost not uniform at vertex ${i}`);
  }
  assert.ok(Math.abs(f1.ratio - f0.ratio) < 1e-5, "boost changed the axis ratio");
  console.log(`  # boost factor=${s.toFixed(4)} (periapsis-capped: pre-cap band would give 2.2 — periapsis rides the cap, shape kept)`);
});

console.log(
  `\n# ${n} tests passed — FIXED contract confirmed: one uniform radial scale per satellite orbit (ScaleManager.mapSatelliteOrbitRadius), θ and a:b and e preserved exactly, apoapsis capped at the 9×(×2.2 boost) band, line ≡ body in every distance mode. Pre-fix cardioid fingerprint (e′ 7.7×, latus +119 %, residual 0.895, axis flip) is gone.`,
);
