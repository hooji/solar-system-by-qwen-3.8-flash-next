/**
 * Kepler's equation solver — pure function, shared by the animated bodies and
 * the orbit-line sampler so both agree exactly (spec §7). M = E − e·sin E,
 * Newton iteration (tol 1e-6, max 8 steps) — standard-accuracy approximation,
 * suitable for a browser demo.
 */
export const KEPLER_TOL = 1e-6;

/** Solve for eccentric anomaly E given mean anomaly M (rad) and e in [0,1). */
export function solveKepler(meanAnomalyRad: number, e: number): number {
  let E = meanAnomalyRad + e * Math.sin(meanAnomalyRad); // standard start guess
  for (let i = 0; i < 8; i++) {
    const dM = meanAnomalyRad - (E - e * Math.sin(E));
    const dE = dM / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < KEPLER_TOL) break;
  }
  return E;
}

/**
 * Position in the orbital plane (focus at origin), real units:
 * x toward periapsis, y perpendicular, r = |pos|. Units follow `a` (AU for
 * heliocentric orbits, km for moon orbits).
 */
export function ellipsePlanePosition(
  simDays: number,
  periodDays: number,
  a: number,
  e: number,
  phaseRad: number,
): { x: number; y: number; r: number } {
  const TWO_PI = Math.PI * 2;
  const M = (((simDays / Math.max(periodDays, 1e-9)) * TWO_PI + phaseRad) % TWO_PI + TWO_PI) % TWO_PI;
  const E = solveKepler(M, e);
  const x = a * (Math.cos(E) - e);
  const y = a * Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E);
  return { x, y, r: Math.hypot(x, y) };
}
