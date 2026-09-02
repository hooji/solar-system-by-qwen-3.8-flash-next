/**
 * Labels — CSS2D screen-aligned labels (spec §11).
 * Single-language: each label shows the body name in the CURRENT language
 * only (선택 언어 단일 표기) and re-renders in place on a language switch.
 * The language never affects label visibility (the control-panel Labels
 * checkbox and the H hotkey keep working unchanged).
 * Density reduced by camera distance and selection state; moon labels only
 * when their parent is selected.
 */
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import type { SolarSystem } from "../core/SolarSystem";
import { selectionFor } from "../core/bodyIdentity";
import { getLang, onLangChange, type Lang } from "./i18n";
import { bodyDisplayName, type NamedBody } from "./format";

export class Labels {
  private visible = true;
  /** Scratch — no per-frame allocation (spec §16). */
  private readonly scratch = new THREE.Vector3();
  /** Live label hosts + their bodies — re-labelled in place on a switch. */
  private readonly hosts: { el: HTMLElement; body: NamedBody }[] = [];
  private offLang: (() => void) | null = null;

  attach(solar: SolarSystem): void {
    for (const body of solar.bodies.values()) {
      const el = document.createElement("div");
      el.className = "label";
      this.hosts.push({ el, body: body.data });
      const obj = new CSS2DObject(el);
      obj.center.set(0.5, 0);
      obj.position.set(0, body.renderRadius + 0.4, 0);
      obj.name = `label:${body.data.id}`;
      obj.userData.bodyId = body.data.id;
      body.group.add(obj);
      solar.labelObjects.set(body.data.id, obj);
    }
    // One subscription for the whole class: language change re-labels every
    // host IN PLACE (textContent swap, no DOM rebuild, no per-label caches).
    this.offLang ??= onLangChange((lang) => this.applyLanguage(lang));
    this.applyLanguage(getLang());
  }

  /** Release the language subscription (teardownAll in main.ts). */
  dispose(): void {
    this.offLang?.();
    this.offLang = null;
    this.hosts.length = 0;
  }

  /**
   * Render every label as the CURRENT language's name only. Visibility,
   * declutter and selection behaviour are untouched by this.
   */
  private applyLanguage(lang: Lang): void {
    for (const h of this.hosts) h.el.textContent = bodyDisplayName(h.body, lang);
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
