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
import { inclinationComponents, spinAngleRad } from "./simMath";

/**
 * Shared unit sphere — created once at module init and reused by every body
 * (spec §16). Dispose is owned by SolarSystem.dispose(), NOT by the bodies.
 */
const SHARED_SPHERE = new THREE.SphereGeometry(1, 32, 24);

/** Dispose the shared sphere; called from SolarSystem.dispose(). */
export function disposeSharedGeometries(): void {
  SHARED_SPHERE.dispose();
}

export class CelestialBody {
  readonly data: CelestialBodyData;
  /** Scene-graph node for this body (moon systems nest under parent group). */
  readonly group: THREE.Group;
  /** Tilt frame inside the group: carries axialTiltDeg (obliquity, spec §7). */
  readonly tiltGroup: THREE.Group;
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshStandardMaterial;
  /** Mutable: a photo emissive map re-bases the sun's glow (applyTexture). */
  private baseEmissiveIntensity: number;

  renderRadius = 0;
  /** Detail-view dim state (spec §13): unrelated bodies fade back. */
  private dimmed = false;
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
    // Identification contract (core/bodyIdentity.ts): EVERY node of this
    // body's subtree resolves to `data.id` via the userData walk, so a click
    // on any descendant (mesh, ring, future geometry) maps to the real body.
    this.group.userData.bodyId = data.id;

    this.tiltGroup = new THREE.Group();
    this.tiltGroup.name = `tilt:${data.id}`;
    this.tiltGroup.rotation.z = THREE.MathUtils.degToRad(data.axialTiltDeg ?? 0);
    this.group.add(this.tiltGroup);

    const geo = SHARED_SPHERE; // reused across all bodies (spec §16)
    this.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(data.displayColor),
      roughness: data.render?.emissive ? 0.4 : 0.9,
      metalness: 0,
      emissive: data.render?.emissive ? new THREE.Color(data.displayColor) : new THREE.Color(0x000000),
      emissiveIntensity: data.render?.emissive ? 1.6 : 0,
    });
    this.baseEmissiveIntensity = this.material.emissiveIntensity;
    this.mesh = new THREE.Mesh(geo, this.material);
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
      if (scale.focusActive && anchor) {
        // Focus mode: the Sun renders at its compressed REAL offset from the
        // anchor, so the anchor system is the visual centre (spec §4/§13).
        scale.mapHeliocentricPlanePoint({ x: 0, y: 0, r: 0 }, anchor, this.planeOut);
        this.group.position.set(this.planeOut.x, 0, this.planeOut.cz);
      } else {
        this.group.position.set(0, 0, 0);
      }
      this.applySpin(simDays);
      return;
    }

    const pos = this.realPlanePosition(simDays);

    if (d.type === "moon") {
      const dist = this.moonRenderDistance(pos.r, scale);
      const theta = Math.atan2(pos.y, pos.x);
      const cz = dist * Math.sin(theta);
      const tilt = inclinationComponents(cz, d.inclinationDeg ?? 0);
      this.group.position.set(dist * Math.cos(theta), tilt.y, tilt.z);
    } else {
      scale.mapHeliocentricPlanePoint(pos, anchor, this.planeOut);
      scale.applyInclination(this.planeOut, d.inclinationDeg ?? 0, this.group.position);
    }

    this.applySpin(simDays);
  }

  /**
   * Parent-local render distance for a real radius (km) on THIS moon's orbit.
   * Delegates to the shared orbit mapper so the body rides its drawn line
   * exactly (OrbitRenderer.isMoon branch calls the same function).
   */
  moonRenderDistance(distanceKm: number, scale: ScaleManager): number {
    const range = this.moonDistanceRange ?? { minKm: distanceKm, maxKm: distanceKm + 1 };
    return scale.mapSatelliteOrbitRadius(
      distanceKm,
      this.data.semiMajorAxis ?? 0,
      this.data.eccentricity ?? 0,
      range.minKm,
      range.maxKm,
      this.parentRenderRadius,
    );
  }

  applyRadius(scale: ScaleManager): void {
    this.renderRadius = scale.mapBodyRadius(this.data);
    this.mesh.scale.setScalar(this.renderRadius);
  }

  /**
   * Swap the procedural look for a real photographic surface map (async
   * texture load callback). The map carries the body's true colors, so the
   * displayColor tint gives way to white; the emissive sun re-bases its glow
   * on the photo (white light through the map at unit intensity). Respects a
   * dim state that may have been applied while the file was still loading.
   */
  applyTexture(tex: THREE.Texture): void {
    const mat = this.material;
    mat.map = tex;
    mat.color.set(0xffffff);
    if (this.data.render?.emissive) {
      mat.emissiveMap = tex;
      mat.emissive.set(0xffffff);
      this.baseEmissiveIntensity = 1.0;
      mat.emissiveIntensity = this.dimmed
        ? this.baseEmissiveIntensity * 0.15
        : this.baseEmissiveIntensity;
    }
    mat.needsUpdate = true;
  }

  /**
   * Detail-view dim (spec §13: "dim, simplify, or temporarily hide unrelated
   * planets"): fade the mesh without touching geometry (cheap, reversible).
   * Materials start opaque; toggling `transparent` recompiles the shader, so
   * the flag flips only on state change.
   */
  setDimmed(dim: boolean): void {
    if (this.dimmed === dim) return;
    this.dimmed = dim;
    const mat = this.material;
    mat.transparent = dim;
    mat.opacity = dim ? 0.15 : 1;
    mat.emissiveIntensity = dim ? this.baseEmissiveIntensity * 0.15 : this.baseEmissiveIntensity;
    mat.depthWrite = !dim;
    mat.needsUpdate = true;
  }

  /** Axial rotation from the REAL period; negative period = retrograde spin. */
  private applySpin(simDays: number): void {
    this.mesh.rotation.y = spinAngleRad(simDays, this.data.rotationPeriodHours);
  }

  dispose(): void {
    // Geometry is the shared unit sphere — only this body's material is ours.
    this.material.dispose();
  }
}
