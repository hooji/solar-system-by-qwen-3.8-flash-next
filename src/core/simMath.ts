/**
 * simMath — pure simulation-time math (no three.js / DOM dependencies) so it
 * is unit-testable directly in Node (spec §7/§8):
 *  - axial spin angle from the REAL rotationPeriodHours (negative = retrograde)
 *  - the single Y-up mapping that turns an in-plane render coordinate plus an
 *    inclination into scene elevation/in-plane components — used identically
 *    by planets, moons, and orbit lines, so all three stay consistent.
 */
const TWO_PI = Math.PI * 2;

/** Degrees → radians. */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Axial spin angle (rad) at simDays for a body with rotationPeriodHours.
 * Negative period (retrograde rotators: Venus, Uranus, Pluto) naturally
 * produces opposite-signed spin. 0/undefined → no spin.
 */
export function spinAngleRad(simDays: number, rotationPeriodHours: number | undefined): number {
  if (rotationPeriodHours === undefined || rotationPeriodHours === 0) return 0;
  return ((simDays * 24) / rotationPeriodHours) * TWO_PI;
}

/**
 * Orbital inclination mapping about the X axis in the Y-up scene frame:
 * the in-plane secondary coordinate `cz` (render units, the "Z" of the
 * orbital-plane projection) splits into scene (y, z):
 *   y = cz·sin(i),  z' = cz·cos(i)
 * With i=0 this is the flat ecliptic mapping (y=0, z'=cz).
 */
export function inclinationComponents(
  cz: number,
  inclinationDeg: number,
): { y: number; z: number } {
  const inc = degToRad(inclinationDeg);
  return { y: cz * Math.sin(inc), z: cz * Math.cos(inc) };
}
