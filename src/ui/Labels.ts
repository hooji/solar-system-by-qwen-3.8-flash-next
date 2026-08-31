/**
 * Labels — CSS2D screen-aligned labels (spec §11).
 * Korean primary, English secondary. Density reduced by camera distance and
 * selection state; moon labels only when their parent is selected.
 */
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import type { SolarSystem } from "../core/SolarSystem";
import { selectionFor } from "../core/bodyIdentity";

export class Labels {
  private visible = true;
  /** Scratch — no per-frame allocation (spec §16). */
  private readonly scratch = new THREE.Vector3();

  attach(solar: SolarSystem): void {
    for (const body of solar.bodies.values()) {
      const el = document.createElement("div");
      el.className = "label";
      const ko = document.createElement("span");
      ko.className = "label-ko";
      ko.textContent = body.data.nameKo;
      const en = document.createElement("span");
      en.className = "label-en";
      en.textContent = body.data.nameEn;
      el.append(ko, en);
      const obj = new CSS2DObject(el);
      obj.center.set(0.5, 0);
      obj.position.set(0, body.renderRadius + 0.4, 0);
      obj.name = `label:${body.data.id}`;
      obj.userData.bodyId = body.data.id;
      body.group.add(obj);
      solar.labelObjects.set(body.data.id, obj);
    }
  }

  /** Hide moon labels in global view; show them when parent selected. */
  update(solar: SolarSystem, selectedId: string | null, camera: THREE.Camera): void {
    // Shared selection contract (core/bodyIdentity.ts): the revealed system
    // is derived once, not re-inferred from raw ids here.
    const { systemParentId } = selectionFor(selectedId);
    for (const [id, obj] of solar.labelObjects) {
      const body = solar.bodies.get(id);
      if (!body) continue;
      const d = body.data;
      let show = this.visible;
      if (d.type === "moon") {
        const inRevealedSystem = systemParentId !== null && d.parentId === systemParentId;
        show = show && selectedId !== null && (inRevealedSystem || d.id === selectedId);
        // Distance declutter (spec §11) applies to moon labels OUTSIDE the
        // revealed system only. Inside it the camera legitimately focuses
        // far enough to frame the boosted moon orbits — decluttering there
        // would hide the very labels the selection exists to reveal.
        if (show && !inRevealedSystem) {
          const dist = camera.position.distanceTo(body.group.getWorldPosition(this.scratch));
          if (dist > 120) show = false;
        }
      }
      obj.visible = show;
      // Sit just above the body at its CURRENT render radius (spec §11).
      obj.position.y = body.renderRadius * 1.15 + 0.4;
    }
  }

  setVisible(v: boolean): void {
    this.visible = v;
  }
}
