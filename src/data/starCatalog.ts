/**
 * starCatalog.ts — decode + placement math for the real night sky
 * (data/starCatalogData.ts: Yale Bright Star Catalogue V/50, every
 * naked-eye star, J2000). Pure module (no three.js, no DOM) so the Node
 * tests can pin the astronomy; the scene builder in core/SolarSystem.ts
 * only consumes the arrays this module returns.
 *
 * FRAME (matches the planets' layout): the scene's XZ plane is the
 * ecliptic and +Y the NORTH ecliptic pole, with +X the J2000 vernal
 * equinox — the same axis the heliocentric orbit mapping uses. Equatorial
 * coordinates are rotated onto the ecliptic by the J2000 obliquity, and
 * the equatorial→scene mapping is ORIENTATION-PRESERVING (mapped basis
 * determinant +1), so the sky seen from inside matches reality —
 * constellations read correctly, never mirrored the way a star globe
 * viewed from outside would be.
 */
import {
  BV_MISSING_SENTINEL,
  STAR_COUNT,
  STAR_DATA_B64,
} from "./starCatalogData";

/** IAU 2006 mean obliquity of the ecliptic at J2000.0 (degrees). */
export const OBLIQUITY_J2000_DEG = 23.439279;

const DEG = Math.PI / 180;

export interface StarCatalog {
  count: number;
  /** Right ascension, J2000 (degrees, 0–360). */
  raDeg: Float64Array;
  /** Declination, J2000 (degrees, −90..+90). */
  decDeg: Float64Array;
  /** Visual magnitude (≈ −1.46 for Sirius … +8). */
  mag: Float64Array;
  /** B−V color index; stars without a measured B−V get +0.4 (neutral). */
  bv: Float64Array;
}

function base64ToBytes(b64: string): Uint8Array {
  // atob is a global in every target browser AND in Node ≥16 (the tests).
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Decode the packed catalog (see starCatalogData.ts for the layout). */
export function loadStarCatalog(): StarCatalog {
  const bytes = base64ToBytes(STAR_DATA_B64);
  const n = STAR_COUNT;
  // The base64 payload is little-endian; typed-array views over the buffer
  // match on every platform three.js runs on (all little-endian in practice),
  // but decode via DataView to be byte-order exact.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const raDeg = new Float64Array(n);
  const decDeg = new Float64Array(n);
  const mag = new Float64Array(n);
  const bv = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    raDeg[i] = view.getUint16(i * 2, true) / 100;
    decDeg[i] = view.getInt16(n * 2 + i * 2, true) / 100;
    mag[i] = view.getInt16(n * 4 + i * 2, true) / 100;
    const rawBv = view.getInt16(n * 6 + i * 2, true);
    bv[i] = rawBv === BV_MISSING_SENTINEL ? 0.4 : rawBv / 100;
  }
  return { count: n, raDeg, decDeg, mag, bv };
}

/**
 * J2000 equatorial direction → scene unit direction.
 * Equatorial frame: x̂ = vernal equinox, ẑ = north celestial pole.
 * Ecliptic rotation (about the shared equinox x-axis, obliquity ε):
 *   x_ec = x_eq;  y_ec = cosε·y_eq + sinε·z_eq;  z_ec = −sinε·y_eq + cosε·z_eq
 * Scene mapping (right-handed, +Y = north ecliptic pole, det = +1):
 *   X = x_ec,  Y = z_ec,  Z = −y_ec
 */
export function equatorialToSceneDirection(
  raDeg: number,
  decDeg: number,
  out: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const eps = OBLIQUITY_J2000_DEG * DEG;
  const xEq = Math.cos(dec) * Math.cos(ra);
  const yEq = Math.cos(dec) * Math.sin(ra);
  const zEq = Math.sin(dec);
  const yEc = Math.cos(eps) * yEq + Math.sin(eps) * zEq;
  const zEc = -Math.sin(eps) * yEq + Math.cos(eps) * zEq;
  out.x = xEq;
  out.y = zEc;
  out.z = -yEc;
  return out;
}

/**
 * B−V color index → linear RGB tint (0..1 each, max component = 1).
 * Ballesteros' formula gives an effective blackbody temperature from B−V;
 * a compact Planckian-locus fit turns that into RGB. The result is blended
 * toward white so the tint reads as star color, not traffic lights.
 */
export function bvToRGB(bvIn: number): [number, number, number] {
  const bvC = Math.min(2.0, Math.max(-0.4, bvIn));
  // Ballesteros (2012): T in kelvin from B−V, valid across the main sequence.
  const t = 4600 * (1 / (0.92 * bvC + 1.7) + 1 / (0.92 * bvC + 0.62));
  const tk = t / 100;
  let r: number;
  let g: number;
  let b: number;
  if (tk <= 66) {
    r = 255;
    g = Math.min(255, Math.max(0, 99.4708 * Math.log(tk) - 161.12));
    b = tk <= 19 ? 0 : Math.min(255, Math.max(0, 138.518 * Math.log(tk - 10) - 305.045));
  } else {
    r = Math.min(255, Math.max(0, 329.699 * Math.pow(tk - 60, -0.1332)));
    g = Math.min(255, Math.max(0, 288.122 * Math.pow(tk - 60, -0.0755)));
    b = 255;
  }
  const max = Math.max(r, g, b);
  // 55 % tint strength: hot stars read blue-white, cool ones amber-white.
  const mix = (c: number) => 0.45 + 0.55 * (c / max);
  return [mix(r), mix(g), mix(b)];
}
