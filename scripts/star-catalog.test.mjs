/**
 * Star catalog & sky-orientation tests — pins the accurate night sky:
 * (1) the packed Yale Bright Star Catalogue decodes to the full naked-eye
 *     star set with every field in its physical range;
 * (2) famous stars sit at their true J2000 positions with their true
 *     magnitudes (Sirius, Vega, Betelgeuse, Polaris);
 * (3) the equatorial→scene mapping puts the vernal equinox on +X, tilts
 *     the celestial pole by exactly the J2000 obliquity, keeps zodiac
 *     stars on the ecliptic (scene XZ) plane, and is ORIENTATION-
 *     PRESERVING (determinant +1) — the sky is never mirrored;
 * (4) B−V colors map to physically sensible tints.
 * Run: node scripts/star-catalog.test.mjs
 */
import assert from "node:assert/strict";
import { starCatalog } from "./star-catalog-harness.mjs";

const {
  OBLIQUITY_J2000_DEG,
  loadStarCatalog,
  equatorialToSceneDirection,
  bvToRGB,
} = starCatalog;

let n = 0;
function t(name, fn) {
  fn();
  n++;
  console.log(`ok ${n} - ${name}`);
}

const cat = loadStarCatalog();
const DEG = Math.PI / 180;

/** Nearest catalog star to (ra, dec) within tol degrees, or null. */
function findStar(ra, dec, tol = 0.05) {
  for (let i = 0; i < cat.count; i++) {
    if (Math.abs(cat.raDeg[i] - ra) < tol && Math.abs(cat.decDeg[i] - dec) < tol) return i;
  }
  return null;
}

t("catalog decodes to the full naked-eye star set with fields in range", () => {
  assert.ok(cat.count >= 9000 && cat.count <= 9110, `count ${cat.count}`);
  for (let i = 0; i < cat.count; i++) {
    assert.ok(cat.raDeg[i] >= 0 && cat.raDeg[i] < 360, `ra[${i}]=${cat.raDeg[i]}`);
    assert.ok(cat.decDeg[i] >= -90 && cat.decDeg[i] <= 90, `dec[${i}]=${cat.decDeg[i]}`);
    assert.ok(cat.mag[i] >= -1.5 && cat.mag[i] <= 8.5, `mag[${i}]=${cat.mag[i]}`);
    // Upper bound accommodates HR 1607 (R Leporis, "Hind's Crimson Star"),
    // an extreme carbon star and the catalog's reddest entry at B−V +5.74.
    assert.ok(cat.bv[i] >= -0.5 && cat.bv[i] <= 5.8, `bv[${i}]=${cat.bv[i]}`);
  }
});

t("famous stars sit at their true J2000 positions with true magnitudes", () => {
  // [name, RA°, Dec°, Vmag, tolMag] — J2000 values (SIMBAD).
  const known = [
    ["Sirius", 101.287, -16.716, -1.46, 0.05],
    ["Vega", 279.234, 38.784, 0.03, 0.05],
    ["Betelgeuse", 88.793, 7.407, 0.5, 0.31], // variable; catalog lists 0.50
    ["Polaris", 37.955, 89.264, 1.98, 0.1],
    ["Regulus", 152.093, 11.967, 1.35, 0.05],
  ];
  for (const [name, ra, dec, vmag, tol] of known) {
    const i = findStar(ra, dec);
    assert.notEqual(i, null, `${name} missing near (${ra}, ${dec})`);
    assert.ok(Math.abs(cat.mag[i] - vmag) <= tol, `${name} mag ${cat.mag[i]} vs ${vmag}`);
  }
  // Sirius is the brightest star in the entire catalog.
  let brightest = 0;
  for (let i = 1; i < cat.count; i++) if (cat.mag[i] < cat.mag[brightest]) brightest = i;
  assert.ok(Math.abs(cat.raDeg[brightest] - 101.287) < 0.05, "brightest star must be Sirius");
});

t("vernal equinox maps to scene +X; celestial pole tilts by the obliquity", () => {
  const v = { x: 0, y: 0, z: 0 };
  equatorialToSceneDirection(0, 0, v);
  assert.ok(Math.abs(v.x - 1) < 1e-12 && Math.abs(v.y) < 1e-12 && Math.abs(v.z) < 1e-12);
  // North celestial pole: ε away from the scene's +Y (north ecliptic pole),
  // tipped toward −Z (ecliptic longitude 90° maps to −Z in scene space).
  equatorialToSceneDirection(0, 90, v);
  const eps = OBLIQUITY_J2000_DEG * DEG;
  assert.ok(Math.abs(v.y - Math.cos(eps)) < 1e-12, `pole y ${v.y}`);
  assert.ok(Math.abs(v.z + Math.sin(eps)) < 1e-12, `pole z ${v.z}`);
  const angleFromY = Math.acos(v.y) / DEG;
  assert.ok(Math.abs(angleFromY - OBLIQUITY_J2000_DEG) < 1e-9, `tilt ${angleFromY}°`);
});

t("mapping is orientation-preserving (det +1) — the sky is not mirrored", () => {
  const e1 = { x: 0, y: 0, z: 0 };
  const e2 = { x: 0, y: 0, z: 0 };
  const e3 = { x: 0, y: 0, z: 0 };
  equatorialToSceneDirection(0, 0, e1); // equatorial x̂
  equatorialToSceneDirection(90, 0, e2); // equatorial ŷ
  equatorialToSceneDirection(0, 90, e3); // equatorial ẑ
  const det =
    e1.x * (e2.y * e3.z - e2.z * e3.y) -
    e1.y * (e2.x * e3.z - e2.z * e3.x) +
    e1.z * (e2.x * e3.y - e2.y * e3.x);
  assert.ok(Math.abs(det - 1) < 1e-12, `det ${det} (−1 would be a mirrored sky)`);
});

t("zodiac stars lie on the scene's ecliptic (XZ) plane", () => {
  // Regulus sits within half a degree of the ecliptic (β ≈ +0.46°); Aldebaran
  // within six (β ≈ −5.47°). Both must land close to the planets' plane,
  // while Polaris (β ≈ +66°) must sit far off it.
  const v = { x: 0, y: 0, z: 0 };
  equatorialToSceneDirection(152.093, 11.967, v); // Regulus
  assert.ok(Math.abs(v.y) < Math.sin(1.0 * DEG), `Regulus |y|=${Math.abs(v.y)}`);
  equatorialToSceneDirection(68.98, 16.509, v); // Aldebaran
  assert.ok(Math.abs(v.y) < Math.sin(6.5 * DEG), `Aldebaran |y|=${Math.abs(v.y)}`);
  equatorialToSceneDirection(37.955, 89.264, v); // Polaris — far from ecliptic
  assert.ok(v.y > Math.sin(60 * DEG), `Polaris y=${v.y}`);
});

t("every mapped star is a unit direction", () => {
  const v = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < cat.count; i += 97) {
    equatorialToSceneDirection(cat.raDeg[i], cat.decDeg[i], v);
    const len = Math.hypot(v.x, v.y, v.z);
    assert.ok(Math.abs(len - 1) < 1e-12, `|v| ${len} at ${i}`);
  }
});

t("B−V colors are physically sensible tints", () => {
  const [rB, , bB] = bvToRGB(-0.24); // hot B-type (e.g. Spica): bluish
  assert.ok(bB >= rB, `hot star must not be red-tinted: r=${rB} b=${bB}`);
  const [rM, , bM] = bvToRGB(1.85); // cool M-type (Betelgeuse): reddish
  assert.ok(rM > bM, `cool star must be warm-tinted: r=${rM} b=${bM}`);
  for (const bv of [-0.4, 0, 0.65, 1.5, 2.0, 3.0]) {
    const rgb = bvToRGB(bv);
    for (const c of rgb) assert.ok(c > 0.3 && c <= 1.0, `tint out of range: ${rgb}`);
    assert.ok(Math.max(...rgb) === 1, "max component normalised to 1");
  }
});

console.log(`\n${n} star-catalog checks passed — real Yale BSC sky, ecliptic-aligned, unmirrored`);
