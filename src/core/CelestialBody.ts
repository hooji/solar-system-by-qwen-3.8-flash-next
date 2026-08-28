/**
 * CelestialBody — one body's three.js representation + orbital kinematics.
 * Position comes from REAL orbital elements (a, e, i, P) via Kepler's
 * equation; only afterwards is distance converted to render units through
 * ScaleManager, so real and render values never mix (spec §7, §15).
 * Spin uses the real rotationPeriodHours (negative = retrograde, spec §7/§8).
 */
import * as THREE from "three";
import type { CelestialBodyData } from "../data/solarSystemData";
import { type ScaleManager, bodyPhaseRad, type PlanePoint } from "./ScaleManager";
import { ellipsePlanePosition } from "./Kepler";

const TWO_PI = Math.PI * 2;

export class CelestialBody {
  readonly data: CelestialBodyData;
  /** Scene-graph node for this body (moon systems nest under parent group). */
  readonly group: THREE.Group;
  /** Tilt frame inside the group: carries axialTiltDeg (obliquity, spec §7). */
  readonly tiltGroup: THREE.Group;
  readonly mesh: THREE.Mesh;

  renderRadius = 0;
  /**
   * Render radius of the parent body (moons only). Used by
   * ScaleManager.mapSatelliteDistance for the 2.5×–9× rule (spec §5).
   */
  parentRenderRadius = 0;
  /** Min/max moon orbit distance (km) within this body's system (set once). */
  moonDistanceRange: { minKm: number; maxKm: number } | null = null;

  /** Deterministic anomaly phase so bodies start at varied positions. */
  private readonly phaseRad: number;
  /** Scratch objects — no per-frame allocation (spec §16). */
  private readonly planeOut = { x: 0, cz: 0 };

  constructor(data: CelestialBodyData, index: number) {
    this.data = data;
    this.phaseRad = bodyPhaseRad(index);
    this.group = new THREE.Group();
    this.group.name = data.id;

    this.tiltGroup = new THREE.Group();
    this.tiltGroup.name = `tilt:${data.id}`;
    this.tiltGroup.rotation.z = THREE.MathUtils.degToRad(data.axialTiltDeg ?? 0);
    this.group.add(this.tiltGroup);

    const geo = new THREE.SphereGeometry(1, 32, 24); // unit sphere; scaled per update
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(data.displayColor),
      roughness: data.render?.emissive ? 0.4 : 0.9,
      metalness: 0,
      emissive: data.render?.emissive ? new THREE.Color(data.displayColor) : new THREE.Color(0x000000),
      emissiveIntensity: data.render?.emissive ? 1.6 : 0,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = data.id;
    this.mesh.userData.bodyId = data.id;
    this.tiltGroup.add(this.mesh);
  }

  /**
   * Real orbital-plane position (units: AU for heliocentric bodies, km for
   * moons), focus at origin. Three.js Y is "up": the ecliptic maps to XZ and
   * inclination tilts about the X axis.
   */
  realPlanePosition(simDays: number): PlanePoint {
    const d = this.data;
    return ellipsePlanePosition(
      simDays,
      d.orbitalPeriodDays ?? 1,
      d.semiMajorAxis ?? 0,
      d.eccentricity ?? 0,
      this.phaseRad,
    );
  }

  /**
   * Place group.position in render units. Heliocentric bodies go through the
   * shared plane mapper (identical math to OrbitRenderer, so orbit line and
   * planet always agree — incl. focus mode, spec §4/§13); moons use their
   * parent-local log mapping (spec §5) inside the parent's group.
   */
  updateFromSim(simDays: number, scale: ScaleManager, anchor: PlanePoint | null): void {
    const d = this.data;
    this.applyRadius(scale);

    if (d.type === "star") {
      this.group.position.set(0, 0, 0);
      this.applySpin(simDays);
      return;
    }

    const pos = this.realPlanePosition(simDays);

    if (d.type === "moon") {
      const dist = this.moonRenderDistance(pos.r, scale);
      const theta = Math.atan2(pos.y, pos.x);
      const inc = THREE.MathUtils.degToRad(d.inclinationDeg ?? 0);
      const cz = dist * Math.sin(theta);
      this.group.position.set(dist * Math.cos(theta), cz * Math.sin(inc), cz * Math.cos(inc));
    } else {
      scale.mapHeliocentricPlanePoint(pos, anchor, this.planeOut);
      scale.applyInclination(this.planeOut, d.inclinationDeg ?? 0, this.group.position);
    }

    this.applySpin(simDays);
  }

  moonRenderDistance(distanceKm: number, scale: ScaleManager): number {
    const range = this.moonDistanceRange ?? { minKm: distanceKm, maxKm: distanceKm + 1 };
    return scale.mapSatelliteDistance(distanceKm, range.minKm, range.maxKm, this.parentRenderRadius);
  }

  applyRadius(scale: ScaleManager): void {
    this.renderRadius = scale.mapBodyRadius(this.data);
    this.mesh.scale.setScalar(this.renderRadius);
  }

  /** Axial rotation from the REAL period; negative period = retrograde spin. */
  private applySpin(simDays: number): void {
    const rot = this.data.rotationPeriodHours;
    if (rot === undefined || rot === 0) return;
    this.mesh.rotation.y = ((simDays * 24) / rot) * TWO_PI;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
