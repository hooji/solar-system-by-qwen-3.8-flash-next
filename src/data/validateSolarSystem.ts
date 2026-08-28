/**
 * Data-quality checks for SOLAR_SYSTEM. Run in dev (main.ts) to catch
 * dataset edits that break the relationships the demo depends on.
 * All rules trace to spec §15 "Astronomical Data Accuracy".
 */
import {
  SOLAR_SYSTEM,
  getHeliocentricBodies,
  type CelestialBodyData,
} from "./solarSystemData";

export interface ValidationIssue {
  severity: "error" | "warning";
  message: string;
}

const REQUIRED_PLANET_FIELDS: (keyof CelestialBodyData)[] = [
  "id",
  "nameKo",
  "nameEn",
  "type",
  "radiusKm",
];

export function validateSolarSystem(
  bodies: readonly CelestialBodyData[] = SOLAR_SYSTEM,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();

  for (const b of bodies) {
    for (const f of REQUIRED_PLANET_FIELDS) {
      if (b[f] === undefined || b[f] === null || b[f] === "") {
        issues.push({ severity: "error", message: `${b.id}: missing ${f}` });
      }
    }
    if (ids.has(b.id)) {
      issues.push({ severity: "error", message: `duplicate id "${b.id}"` });
    }
    ids.add(b.id);

    if (!(b.radiusKm > 0)) {
      issues.push({ severity: "error", message: `${b.id}: radiusKm must be > 0` });
    }
    if (b.eccentricity !== undefined && (b.eccentricity < 0 || b.eccentricity >= 1)) {
      issues.push({ severity: "error", message: `${b.id}: eccentricity out of [0,1)` });
    }
    if (b.orbitalPeriodDays !== undefined && !(b.orbitalPeriodDays > 0)) {
      issues.push({ severity: "error", message: `${b.id}: orbitalPeriodDays must be > 0` });
    }
    if (b.rotationPeriodHours !== undefined && b.rotationPeriodHours === 0) {
      issues.push({ severity: "error", message: `${b.id}: rotationPeriodHours is 0` });
    }
    if (b.type === "moon") {
      if (!b.parentId) {
        issues.push({ severity: "error", message: `moon ${b.id}: no parentId` });
      } else if (!ids.has(b.parentId)) {
        // parent may appear later — flag below in second pass
        void 0;
      }
      if (b.semiMajorAxisUnit !== "km" || !(b.semiMajorAxis && b.semiMajorAxis > 0)) {
        issues.push({ severity: "error", message: `moon ${b.id}: needs positive semiMajorAxis in km` });
      }
    } else if (b.type !== "star") {
      if (b.semiMajorAxisUnit !== "AU" || !(b.semiMajorAxis && b.semiMajorAxis > 0)) {
        issues.push({ severity: "error", message: `${b.id}: needs positive semiMajorAxis in AU` });
      }
    }
  }

  // Parent resolution pass.
  for (const b of bodies) {
    if (b.parentId && !bodies.some((p) => p.id === b.parentId)) {
      issues.push({ severity: "error", message: `${b.id}: unknown parent "${b.parentId}"` });
    }
  }

  // Required coverage: Sun, 8 planets, Pluto (spec §3).
  const need = ["sun", "mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
  for (const n of need) {
    if (!bodies.some((b) => b.id === n)) {
      issues.push({ severity: "error", message: `required body "${n}" missing` });
    }
  }

  // Order checks (spec §15).
  const planets = getHeliocentricBodies();
  for (let i = 1; i < planets.length; i++) {
    const prev = planets[i - 1] as CelestialBodyData;
    const cur = planets[i] as CelestialBodyData;
    if ((cur.semiMajorAxis ?? 0) <= (prev.semiMajorAxis ?? 0)) {
      issues.push({ severity: "error", message: `distance order broken: ${prev.id} -> ${cur.id}` });
    }
    if ((cur.orbitalPeriodDays ?? 0) <= (prev.orbitalPeriodDays ?? 0)) {
      issues.push({ severity: "error", message: `orbital-period order broken: ${prev.id} -> ${cur.id}` });
    }
  }

  // Jupiter/Saturn clearly larger than Earth; Pluto eccentric & inclined (spec §6,§7).
  const earth = bodies.find((b) => b.id === "earth");
  const jupiter = bodies.find((b) => b.id === "jupiter");
  const saturn = bodies.find((b) => b.id === "saturn");
  const pluto = bodies.find((b) => b.id === "pluto");
  if (earth && jupiter && !(jupiter.radiusKm > 3 * earth.radiusKm)) {
    issues.push({ severity: "warning", message: "Jupiter not clearly larger than Earth" });
  }
  if (earth && saturn && !(saturn.radiusKm > 3 * earth.radiusKm)) {
    issues.push({ severity: "warning", message: "Saturn not clearly larger than Earth" });
  }
  if (pluto) {
    const eccentric = bodies.filter((b) => b.type === "planet" && (b.eccentricity ?? 0) > (pluto.eccentricity ?? 0));
    const inclined = bodies.filter((b) => b.type === "planet" && (b.inclinationDeg ?? 0) > (pluto.inclinationDeg ?? 0));
    if (eccentric.length > 0) {
      issues.push({ severity: "warning", message: `planet(s) more eccentric than Pluto: ${eccentric.map((b) => b.id)}` });
    }
    if (inclined.length > 0) {
      issues.push({ severity: "warning", message: `planet(s) more inclined than Pluto: ${inclined.map((b) => b.id)}` });
    }
  }

  // Every named moon must resolve to a parent and preserve ordering within system.
  const parentIds = new Set(bodies.filter((b) => b.type !== "moon" && b.type !== "star").map((b) => b.id));
  for (const pid of parentIds) {
    const moons = bodies.filter((b) => b.parentId === pid).sort((a, b) => (a.semiMajorAxis ?? 0) - (b.semiMajorAxis ?? 0));
    for (let i = 1; i < moons.length; i++) {
      const a = moons[i - 1] as CelestialBodyData;
      const b = moons[i] as CelestialBodyData;
      if ((b.orbitalPeriodDays ?? 0) < (a.orbitalPeriodDays ?? 0)) {
        issues.push({ severity: "warning", message: `moon period order odd around ${pid}: ${a.id} -> ${b.id}` });
      }
    }
  }

  return issues;
}

export function formatIssues(issues: ValidationIssue[]): string {
  if (issues.length === 0) return "solar-system data: OK";
  return issues.map((i) => `[${i.severity}] ${i.message}`).join("\n");
}
