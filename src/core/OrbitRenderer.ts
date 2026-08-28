/**
 * OrbitRenderer — orbit path lines. Real Keplerian ellipses are sampled in
 * AU space, then each vertex is mapped to render units with the active
 * ScaleManager, so the line always agrees with the animated planet position.
 * Geometry buffers are created once and only rewritten when the scale mode
 * changes (spec §16: no per-frame geometry churn).
 */
import * as THREE from "three";
import type { CelestialBodyData } from "../data/solarSystemData";
import type { ScaleManager } from "./ScaleManager";

export class OrbitRenderer {
  readonly line: THREE.LineLoop;
  private readonly positions: Float32Array;
  private readonly samples = 256;
  private lastSignature = "";

  constructor(private readonly body: CelestialBodyData) {
    this.positions = new Float32Array(this.samples * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(body.displayColor).lerp(new THREE.Color(0xffffff), 0.25),
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.line = new THREE.LineLoop(geo, mat);
    this.line.name = `orbit:${body.id}`;
  }

  /**
   * Rebuild vertex positions from REAL elements via scale mapping.
   * `parentRenderRadius` is only needed for moons (local mapping).
   */
  refresh(
    scale: ScaleManager,
    parentRenderRadius = 0,
    moonRange: { minKm: number; maxKm: number } | null = null,
  ): void {
    const d = this.body;
    const a = d.semiMajorAxis ?? 0;
    const e = d.eccentricity ?? 0;
    const inc = THREE.MathUtils.degToRad(d.inclinationDeg ?? 0);
    const isMoon = d.type === "moon";

    const signature = `${scale.distanceMode}|${isMoon ? parentRenderRadius.toFixed(3) + JSON.stringify(moonRange) : ""}`;
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    for (let i = 0; i < this.samples; i++) {
      const E = (i / this.samples) * Math.PI * 2;
      const x = a * (Math.cos(E) - e);
      const y = a * Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E);
      const r = Math.hypot(x, y);
      const theta = Math.atan2(y, x);
      const distance = isMoon && moonRange
        ? scale.mapSatelliteDistance(r, moonRange.minKm, moonRange.maxKm, parentRenderRadius)
        : scale.mapHeliocentricDistance(r);
      const cx = distance * Math.cos(theta);
      const cz = distance * Math.sin(theta);
      this.positions[i * 3] = cx;
      this.positions[i * 3 + 1] = cz * Math.sin(inc);
      this.positions[i * 3 + 2] = cz * Math.cos(inc);
    }
    const attr = this.line.geometry.getAttribute("position") as THREE.BufferAttribute;
    attr.needsUpdate = true;
    this.line.geometry.computeBoundingSphere();
  }

  setHighlighted(highlighted: boolean): void {
    const mat = this.line.material as THREE.LineBasicMaterial;
    mat.opacity = highlighted ? 0.9 : 0.3;
  }

  setVisible(visible: boolean): void {
    this.line.visible = visible;
  }

  dispose(): void {
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
  }
}
