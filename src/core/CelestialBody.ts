/**
 * CelestialBody — one body's three.js representation + orbital kinematics.
 * Position comes from REAL orbital elements (a, e, i, P) via Kepler's
 * equation; only afterwards is distance converted to render units through
 * ScaleManager, so real and render values never mix (spec §7, §15).
 */
import * as THREE from "three";
import type { CelestialBodyData } from "../data/solarSystemData";
import type { ScaleManager } from "./ScaleManager";

const TWO_PI = Math.PI * 2;

/** Solve Kepler's equation M = E − e·sin E (radians), Newton iteration. */
export function solveKepler(meanAnomalyRad: number, e: number): number {
  let E = meanAnomalyRad + e * Math.sin(meanAnomalyRad); // standard start guess
  for (let i = 0; i < 8; i++) {
    const dM = meanAnomalyRad - (E - e * Math.sin(E));
    const dE = dM / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-6) break;
  }
  return E;
}

export class CelestialBody {
  readonly data: CelestialBodyData;
  /** Scene-graph node for this body (moon systems nest under parent group). */
  readonly group: THREE.Group;
  readonly mesh: THREE.Mesh;

  renderRadius = 0;
  /**
   * Render radius of the parent body (moons only). Used by
   * ScaleManager.mapSatelliteDistance for the 2.5×–9× rule (spec §5).
   */
  parentRenderRadius = 0;
  /** Min/max moon orbit distance (km) within this body's system (set once). */
  moonDistanceRange: { minKm: number; maxKm: number } | null = null;

  /** Per-body phase offset so bodies start at varied true anomalies. */
  private readonly phaseRad: number;

  constructor(data: CelestialBodyData, index: number) {
    this.data = data;
    this.phaseRad = ((index * 2.39996323) % TWO_PI); // golden-angle spread, deterministic
    this.group = new THREE.Group();
    this.group.name = data.id;

    const geo = new THREE.SphereGeometry(1, 32, 24); // unit sphere; scaled per update
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(data.displayColor),
      roughness: data.render?.emissive ? 0.4 : 0.9,
      emissive: data.render?.emissive ? new THREE.Color(data.displayColor) : new THREE.Color(0x000000),
      emissiveIntensity: data.render?.emissive ? 1.6 : 0,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = data.id;
    this.mesh.userData.bodyId = data.id;
    this.group.add(this.mesh);
  }

  /**
   * Real orbital plane position (units: AU for heliocentric bodies, km for
   * moons) as [xAlongPeriapsis, yPerp, r], focus at origin. Orbit lies in the
   * XZ plane of its group after updateFromSim: three.js Y is "up", so the
   * ecliptic maps to XZ and inclination tilts about the X axis.
   */
  realPlanePosition(simDays: number): { x: number; y: number; r: number } {
    const d = this.data;
    const a = d.semiMajorAxis ?? 0;
    const e = d.eccentricity ?? 0;
    const P = d.orbitalPeriodDays ?? 1;
    const M = (simDays / P) * TWO_PI + this.phaseRad;
    const E = solveKepler(((M % TWO_PI) + TWO_PI) % TWO_PI, e);
    const x = a * (Math.cos(E) - e);
    const y = a * Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E);
    return { x, y, r: Math.hypot(x, y) };
  }

  /**
   * Place group.position in render units. Heliocentric bodies get the global
   * log/linear mapping; moons use their parent-local log mapping (spec §5).
   */
  updateFromSim(simDays: number, scale: ScaleManager): void {
    const d = this.data;
    this.applyRadius(scale);

    if (d.type === "star") {
      this.group.position.set(0, 0, 0);
      return;
    }

    const { x, y, r } = this.realPlanePosition(simDays);
    const inc = THREE.MathUtils.degToRad(d.inclinationDeg ?? 0);

    let distance: number;
    if (d.type === "moon") {
      distance = this.moonRenderDistance(r, scale);
    } else {
      distance = scale.mapHeliocentricDistance(r); // r in AU here
    }

    const theta = Math.atan2(y, x);
    // Orbit plane = XZ; inclination tilts Z-component into Y about X axis.
    const cx = distance * Math.cos(theta);
    const cz = distance * Math.sin(theta);
    this.group.position.set(cx, cz * Math.sin(inc), cz * Math.cos(inc));
  }

  moonRenderDistance(distanceKm: number, scale: ScaleManager): number {
    const range = this.moonDistanceRange ?? { minKm: distanceKm, maxKm: distanceKm + 1 };
    return scale.mapSatelliteDistance(
      distanceKm,
      range.minKm,
      range.maxKm,
      this.parentRenderRadius,
    );
  }

  applyRadius(scale: ScaleManager): void {
    this.renderRadius = scale.mapBodyRadius(this.data);
    this.mesh.scale.setScalar(this.renderRadius);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
