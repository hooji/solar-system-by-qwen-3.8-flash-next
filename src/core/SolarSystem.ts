/**
 * SolarSystem — scene-graph assembly. Owns CelestialBody + OrbitRenderer
 * instances, the Sun light, star field, rings and procedural textures.
 * No UI logic here (spec §17 separation).
 */
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import {
  SOLAR_SYSTEM,
  getChildrenOf,
  type CelestialBodyData,
} from "../data/solarSystemData";
import { CelestialBody } from "./CelestialBody";
import { OrbitRenderer } from "./OrbitRenderer";
import { ScaleManager } from "./ScaleManager";

/** Procedural banded/variation CanvasTexture (spec §12: no external images). */
function makeBandedTexture(base: string, bandColor: string): THREE.CanvasTexture | null {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = bandColor;
  for (let y = 0; y < size; y += 8) {
    const h = 2 + Math.abs(Math.sin(y * 0.35) * 5);
    ctx.globalAlpha = 0.18 + 0.12 * Math.abs(Math.cos(y * 0.2));
    ctx.fillRect(0, y, size, h);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class SolarSystem {
  readonly root = new THREE.Group();
  readonly bodies = new Map<string, CelestialBody>();
  readonly orbits = new Map<string, OrbitRenderer>();
  readonly labelObjects = new Map<string, CSS2DObject>();

  private starField: THREE.Points | null = null;
  private readonly disposables: { dispose(): void }[] = [];

  constructor(private readonly scene: THREE.Scene, private readonly scale: ScaleManager) {
    this.build();
  }

  private build(): void {
    // Ambient + Sun point light (spec §12).
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.28));
    const sunLight = new THREE.PointLight(0xfff2cc, 3.2, 0, 0.00085);
    sunLight.position.set(0, 0, 0);
    this.root.add(sunLight);

    SOLAR_SYSTEM.forEach((data, idx) => {
      const body = new CelestialBody(data, idx);

      if (data.render?.banded) {
        const tex = makeBandedTexture(data.displayColor, "#2a2018");
        if (tex) {
          const mat = body.mesh.material as THREE.MeshStandardMaterial;
          mat.map = tex;
          mat.needsUpdate = true;
          this.disposables.push(tex);
        }
      }

      // Saturn (mandatory) / Uranus (when practical) rings (spec §12).
      if (data.render?.hasRings) {
        const ring = this.makeRing(data);
        if (ring) body.group.add(ring);
      }

      // Moons live under the parent's group → whole system travels with it.
      if (data.type === "moon" && data.parentId) {
        const parent = this.bodies.get(data.parentId);
        if (parent) parent.group.add(body.group);
        else this.root.add(body.group);
      } else {
        this.root.add(body.group);
      }
      this.bodies.set(data.id, body);
    });

    // Ring radii depend on each parent's render radius — applied in refreshScales().
    this.computeMoonRanges();

    // Heliocentric + moon orbit lines.
    for (const body of this.bodies.values()) {
      const d = body.data;
      if (d.type === "star") continue;
      const orbit = new OrbitRenderer(d);
      const parentGroup =
        d.type === "moon" && d.parentId ? this.bodies.get(d.parentId)?.group ?? this.root : this.root;
      parentGroup.add(orbit.line);
      this.orbits.set(d.id, orbit);
    }

    this.scene.add(this.root);
    this.starField = this.makeStarField();
    if (this.starField) this.scene.add(this.starField);
  }

  private makeRing(data: CelestialBodyData): THREE.Mesh | null {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const grad = ctx.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, "rgba(210,190,150,0.05)");
    grad.addColorStop(0.5, "rgba(230,210,170,0.55)");
    grad.addColorStop(1, "rgba(190,170,140,0.08)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const inner = data.render?.ringInnerScale ?? 1.3;
    const outer = data.render?.ringOuterScale ?? 2.2;
    const geo = new THREE.RingGeometry(inner, outer, 96);
    // remap UV so the gradient spans inner→outer radially
    const pos = geo.getAttribute("position");
    const uv = geo.getAttribute("uv");
    const v3 = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v3.fromBufferAttribute(pos, i);
      const rr = (v3.length() - inner) / (outer - inner);
      uv.setXY(i, rr, 0.5);
    }
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: data.id === "uranus" ? 0.35 : 0.85,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2; // lies in planet's XZ plane (equatorial)
    mesh.userData.ringScales = { inner, outer };
    mesh.name = `ring:${data.id}`;
    this.disposables.push(geo, mat, tex);
    return mesh;
  }

  private makeStarField(): THREE.Points | null {
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    const count = isMobile ? 1200 : 3500; // spec §16: reduce density on mobile
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const radius = 900 + Math.random() * 900;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.4,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    this.disposables.push(geo, mat);
    return new THREE.Points(geo, mat);
  }

  /** Min/max real moon orbit distance (km) per parent — drives local log map. */
  private computeMoonRanges(): void {
    for (const body of this.bodies.values()) {
      const d = body.data;
      if (d.type !== "moon" || !d.parentId) continue;
      const parent = this.bodies.get(d.parentId);
      const sibs = getChildrenOf(d.parentId);
      const aVals = sibs.map((s) => s.semiMajorAxis ?? 0);
      const range = { minKm: Math.min(...aVals), maxKm: Math.max(...aVals) };
      for (const s of sibs) {
        const cb = this.bodies.get(s.id);
        if (cb) cb.moonDistanceRange = range;
      }
      void parent;
    }
  }

  /** Re-map positions, radii, orbit lines after a scale-mode change. */
  refreshScales(simDays: number): void {
    for (const body of this.bodies.values()) {
      if (body.data.type === "moon") {
        const parent = body.data.parentId ? this.bodies.get(body.data.parentId) : undefined;
        body.parentRenderRadius = parent?.renderRadius ?? 1;
      }
      body.updateFromSim(simDays, this.scale);
    }
    for (const [id, orbit] of this.orbits) {
      const body = this.bodies.get(id);
      if (!body) continue;
      const parentR = body.data.type === "moon" ? body.parentRenderRadius : 0;
      orbit.refresh(this.scale, parentR, body.moonDistanceRange);
    }
    this.syncRings();
  }

  /** Keep ring geometry at planet render scale (unit-space rings). */
  private syncRings(): void {
    for (const body of this.bodies.values()) {
      if (!body.data.render?.hasRings) continue;
      const ring = body.group.getObjectByName(`ring:${body.data.id}`);
      if (ring) ring.scale.setScalar(body.renderRadius);
      // Axial tilt for the planet group so rings sit in the equatorial plane.
      if (body.data.axialTiltDeg !== undefined) {
        body.mesh.rotation.z = THREE.MathUtils.degToRad(body.data.axialTiltDeg);
        ring?.rotateZ?.(0);
      }
    }
  }

  update(simDays: number): void {
    for (const body of this.bodies.values()) {
      body.updateFromSim(simDays, this.scale);
    }
  }

  setStarFieldVisible(visible: boolean): void {
    if (this.starField) this.starField.visible = visible;
  }

  setOrbitsVisible(visible: boolean): void {
    for (const o of this.orbits.values()) o.setVisible(visible);
  }

  /** Pick targets for the raycaster. */
  pickTargets(): THREE.Object3D[] {
    return [...this.bodies.values()].map((b) => b.mesh);
  }

  dispose(): void {
    for (const o of this.orbits.values()) o.dispose();
    for (const b of this.bodies.values()) b.dispose();
    for (const d of this.disposables) d.dispose();
    this.scene.remove(this.root);
    if (this.starField) this.scene.remove(this.starField);
  }
}
