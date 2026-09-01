/**
 * Labels — CSS2D screen-aligned labels (spec §11).
 * Bilingual: BOTH names always shown. Locale priority (task t_8701c121):
 * Korean mode leads with the Korean line (original look), EN mode leads with
 * the English line — the PAIR is never reduced to one name and the order
 * flip is independent of label visibility (the control-panel 이름표/Labels
 * checkbox and the H hotkey keep working unchanged).
 * Density reduced by camera distance and selection state; moon labels only
 * when their parent is selected.
 */
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import type { SolarSystem } from "../core/SolarSystem";
import { selectionFor } from "../core/bodyIdentity";
import { getLang, onLangChange, type Lang } from "./i18n";

export class Labels {
  private visible = true;
  /** Scratch — no per-frame allocation (spec §16). */
  private readonly scratch = new THREE.Vector3();
  /** Live label hosts — reordered in place on a language switch. */
  private readonly hosts: HTMLElement[] = [];
  private offLang: (() => void) | null = null;

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
      this.hosts.push(el);
      const obj = new CSS2DObject(el);
      obj.center.set(0.5, 0);
      obj.position.set(0, body.renderRadius + 0.4, 0);
      obj.name = `label:${body.data.id}`;
      obj.userData.bodyId = body.data.id;
      body.group.add(obj);
      solar.labelObjects.set(body.data.id, obj);
    }
    // One subscription for the whole class: language change re-orders every
    // label IN PLACE (CSS-driven, no DOM rebuild, no per-label caches).
    this.offLang ??= onLangChange((lang) => this.applyOrder(lang));
    this.applyOrder(getLang());
  }

  /** Release the language subscription (teardownAll in main.ts). */
  dispose(): void {
    this.offLang?.();
    this.offLang = null;
    this.hosts.length = 0;
  }

  /**
   * Language mode ONLY picks which name leads: `html[lang]` + the order class
   * flip the two stacked lines (EN mode puts English on top). Visibility,
   * declutter and selection behaviour are untouched by this.
   */
  private applyOrder(lang: Lang): void {
    const en = lang === "en";
    for (const el of this.hosts) el.classList.toggle("label-order-en", en);
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
