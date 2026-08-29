/**
 * OrbitRenderer — orbit path lines. Real Keplerian ellipses are sampled in
 * real units (AU / km), then each vertex is mapped to render units with the
 * SAME ScaleManager calls the animated body uses, so line and planet always
 * agree in every distance mode (spec §4, §7, §13). Geometry buffers are built
 * once at init and only rewritten on refresh — no per-frame allocation
 * (spec §16).
 */
import * as THREE from "three";
import type { CelestialBodyData } from "../data/solarSystemData";
import type { ScaleManager, PlanePoint } from "./ScaleManager";
import { inclinationComponents } from "./simMath";

const DEFAULT_OPACITY = 0.3;

export class OrbitRenderer {
  readonly line: THREE.LineLoop;
  private readonly positions: Float32Array;
  private readonly samples = 256;
  private lastSignature = "";
  private baseOpacity = DEFAULT_OPACITY;
  private highlighted = false;
  /** Focus mode collapses the anchor's own line; user toggle is separate. */
  private hiddenByFocus = false;
  private userVisible = true;
  /** Shared mapping scratch — allocated once (spec §16). */
  private readonly planeOut = { x: 0, cz: 0 };

  constructor(private readonly body: CelestialBodyData) {
    this.positions = new Float32Array(this.samples * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(body.displayColor).lerp(new THREE.Color(0xffffff), 0.25),
      transparent: true,
      opacity: this.baseOpacity,
      depthWrite: false,
    });
    this.line = new THREE.LineLoop(geo, mat);
    this.line.name = `orbit:${body.id}`;
  }

  /**
   * Rewrite vertex positions from REAL elements via the active scale mapping.
   * - moons: parent-local log mapping (needs parentRenderRadius + range).
   * - heliocentric: ScaleManager.mapHeliocentricPlanePoint — identical math
   *   to the body position update, so the animated planet always rides its
   *   drawn line in log / linear / focus modes alike.
   * In focus mode `anchor` moves with the anchor each sim-day, so the whole
   * family of lines is re-sampled (cheap: buffer reuse) — spec §13 says to
   * interpolate, not switch abruptly; the app drives refresh cadence.
   */
  refresh(
    scale: ScaleManager,
    parentRenderRadius = 0,
    moonRange: { minKm: number; maxKm: number } | null = null,
    anchor: PlanePoint | null = null,
  ): void {
    const d = this.body;
    const a = d.semiMajorAxis ?? 0;
    const e = d.eccentricity ?? 0;
    const isMoon = d.type === "moon";

    const needsAnchor = !isMoon && scale.focusActive && !!anchor;
    const signature = [
      scale.distanceMode,
      `${scale.systemBoostActive}`,
      isMoon ? `${parentRenderRadius.toFixed(3)}|${moonRange?.minKm}|${moonRange?.maxKm}` : "",
      // Moon lines are parent-local and anchor-independent — don't rebuild
      // them on the anchor's per-frame drift (spec §16).
      needsAnchor ? `${anchor!.x.toFixed(2)},${anchor!.y.toFixed(2)}` : "",
    ].join("#");
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    const isAnchorLine = !isMoon && scale.focusActive && !!anchor && d.id === scale.focusAnchorId;
    // The anchor IS the centre of the focus view: its own orbit collapses to
    // a point (position = compress(p − p) = 0 at every t) — hide the line.
    this.hiddenByFocus = isAnchorLine;
    if (isAnchorLine) {
      this.line.visible = false;
      return;
    }
    this.line.visible = this.userVisible;

    const b = Math.sqrt(Math.max(0, 1 - e * e));
    for (let i = 0; i < this.samples; i++) {
      // Sample the REAL ellipse by eccentric anomaly — the same
      // parameterisation the body's animated position uses.
      const E = (i / this.samples) * Math.PI * 2;
      const px = a * (Math.cos(E) - e);
      const py = a * b * Math.sin(E);
      const pr = Math.hypot(px, py);

      let x: number;
      let cz: number;
      if (isMoon && moonRange) {
        const dist = scale.mapSatelliteDistance(pr, moonRange.minKm, moonRange.maxKm, parentRenderRadius);
        const th = Math.atan2(py, px);
        x = dist * Math.cos(th);
        cz = dist * Math.sin(th);
      } else {
        scale.mapHeliocentricPlanePoint({ x: px, y: py, r: pr }, anchor, this.planeOut);
        x = this.planeOut.x;
        cz = this.planeOut.cz;
      }

      this.positions[i * 3] = x;
      const tilt = inclinationComponents(cz, d.inclinationDeg ?? 0);
      this.positions[i * 3 + 1] = tilt.y;
      this.positions[i * 3 + 2] = tilt.z;
    }
    const attr = this.line.geometry.getAttribute("position") as THREE.BufferAttribute;
    attr.needsUpdate = true;
    this.line.geometry.computeBoundingSphere();
  }

  /** Selection emphasis (spec §12): highlight selected orbit, dim the rest. */
  setHighlighted(highlighted: boolean): void {
    this.highlighted = highlighted;
    this.applyOpacity();
  }

  /**
   * Moon orbit lines: hidden-ish in the global view, clear when their system
   * is opened (spec §5/§13). Planet lines keep the default opacity.
   */
  setSystemRevealed(revealed: boolean): void {
    this.baseOpacity = this.body.type === "moon" ? (revealed ? 0.55 : 0.07) : DEFAULT_OPACITY;
    this.applyOpacity();
  }

  private applyOpacity(): void {
    const mat = this.line.material as THREE.LineBasicMaterial;
    mat.opacity = this.highlighted ? 0.9 : this.baseOpacity * 0.85;
  }

  setVisible(visible: boolean): void {
    this.userVisible = visible;
    this.line.visible = visible && !this.hiddenByFocus;
  }

  dispose(): void {
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
  }
}
