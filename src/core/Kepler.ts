/**
 * Kepler's equation solver — pure function, shared by the animated bodies and
 * the orbit-line sampler so both agree exactly (spec §7). M = E − e·sin E.
 *
 * Newton iteration with a guaranteed monotone bracket (bisection fallback):
 * f(E) = E − e·sin E − M is strictly increasing for e < 1 and the root lies
 * in [0, 2π) for M ∈ [0, 2π), so the solve converges at ANY eccentricity the
 * dataset may hold — plain Newton diverges past e≈0.98. Standard-accuracy
 * approximation, suitable for a browser demo.
 */
export const KEPLER_TOL = 1e-6;
/** Solver is driven tighter than KEPLER_TOL; the export stays as the public contract. */
const SOLVER_TOL = 1e-10;
const MAX_ITER = 30;
const TWO_PI = Math.PI * 2;

/** Solve for eccentric anomaly E given mean anomaly M (rad) and e in [0,1). */
export function solveKepler(meanAnomalyRad: number, e: number): number {
  const ecc = Math.min(Math.max(e, 0), 0.9999999);
  const M = (((meanAnomalyRad % TWO_PI) + TWO_PI) % TWO_PI + TWO_PI) % TWO_PI;
  let lo = 0;
  let hi = TWO_PI;
  // Standard 3rd-order start guess, clamped inside the bracket.
  let E = Math.min(Math.max(M + ecc * Math.sin(M), 1e-12), TWO_PI - 1e-12);
  for (let i = 0; i < MAX_ITER; i++) {
    const f = E - ecc * Math.sin(E) - M;
    if (Math.abs(f) < SOLVER_TOL) break;
    if (f > 0) hi = E;
    else lo = E;
    const df = 1 - ecc * Math.cos(E); // > 0 for e < 1 — f is monotone
    const next = E - f / df;
    // Newton step must stay in the shrinking bracket, else bisect.
    E = next > lo && next < hi ? next : (lo + hi) / 2;
  }
  return E;
}

/** Mean anomaly (rad, wrapped to [0, 2π)) accumulated from simulation time. */
export function meanAnomalyRad(
  simDays: number,
  periodDays: number,
  phaseRad: number,
): number {
  const TWO_PI_ = Math.PI * 2;
  const P = Math.max(periodDays, 1e-9);
  return (((simDays / P) * TWO_PI_ + phaseRad) % TWO_PI_ + TWO_PI_) % TWO_PI_;
}

/**
 * Position in the orbital plane (focus at origin), real units:
 * x toward periapsis, y perpendicular, r = |pos|. Units follow `a` (AU for
 * heliocentric orbits, km for moon orbits). Position depends ONLY on
 * simDays/elements — never on frame count (spec §7/§8).
 */
export function ellipsePlanePosition(
  simDays: number,
  periodDays: number,
  a: number,
  e: number,
  phaseRad: number,
): { x: number; y: number; r: number } {
  const M = meanAnomalyRad(simDays, periodDays, phaseRad);
  const E = solveKepler(M, e);
  const x = a * (Math.cos(E) - e);
  const y = a * Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E);
  return { x, y, r: Math.hypot(x, y) };
}
