/**
 * OverlayManager — DOM side of the overlay toggle system (task t_30700e13).
 * Owns header/control/info panels: per-panel collapse buttons, an always
 * accessible dock (global hide/restore + "복구"), the H hotkey, ARIA wiring,
 * localStorage persistence, and the body-selected event contract.
 * All state transitions are delegated to overlayState.ts (pure, testable).
 */
import {
  BODY_SELECTED_EVENT,
  PANEL_IDS,
  PANEL_LABEL_KEYS,
  type OverlayState,
  type PanelId,
  effectiveVisible,
  isBodySelectedDetail,
  loadOverlayState,
  restoreAll,
  saveOverlayState,
  stateWithBodySelected,
  toggleAll,
  togglePanel,
} from "./overlayState";
import { onLangChange, t } from "./i18n";

interface Registration {
  el: HTMLElement;
  collapseBtn: HTMLButtonElement;
}

export class OverlayManager {
  private state: OverlayState = loadOverlayState();
  private readonly panels = new Map<PanelId, Registration>();
  private readonly dock: HTMLElement;
  private readonly globalBtn: HTMLButtonElement;
  private readonly chipWrap: HTMLElement;
  private readonly restoreBtn: HTMLButtonElement;
  private readonly offLang: () => void;
  private readonly onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key.toLowerCase() !== "h" || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const target = ev.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
    ev.preventDefault();
    this.set(toggleAll(this.state));
  };

  constructor(container: HTMLElement) {
    this.dock = document.createElement("nav");
    this.dock.className = "overlay-dock panel-lite";

    this.globalBtn = document.createElement("button");
    this.globalBtn.type = "button";
    this.globalBtn.className = "dock-btn dock-global";
    this.globalBtn.addEventListener("click", () => this.set(toggleAll(this.state)));
    this.dock.appendChild(this.globalBtn);

    this.chipWrap = document.createElement("div");
    this.chipWrap.className = "dock-chips";
    this.dock.appendChild(this.chipWrap);

    this.restoreBtn = document.createElement("button");
    this.restoreBtn.type = "button";
    this.restoreBtn.className = "dock-btn dock-restore";
    this.restoreBtn.addEventListener("click", () => this.set(restoreAll(this.state)));
    this.dock.appendChild(this.restoreBtn);

    container.appendChild(this.dock);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener(BODY_SELECTED_EVENT, this.onBodySelectedEvent);
    // Language change re-labels dock buttons, chips and every aria name
    // (t_292b0645) — labels are derived in apply(), never cached.
    this.offLang = onLangChange(() => this.apply(false));
    this.apply(false);
    // Test/debug call site for the selection contract (see README §overlays).
    (window as unknown as { __qwOverlay?: OverlayManager }).__qwOverlay = this;
  }

  /** Register a panel element; injects its individual collapse button. */
  register(id: PanelId, el: HTMLElement): void {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "panel-collapse";
    btn.dataset.panel = id;
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.set(togglePanel(this.state, id));
    });
    el.insertBefore(btn, el.firstChild);
    el.dataset.panel = id;
    this.panels.set(id, { el, collapseBtn: btn });
    this.apply(false);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener(BODY_SELECTED_EVENT, this.onBodySelectedEvent);
    this.offLang();
    this.dock.remove();
    for (const { el, collapseBtn } of this.panels.values()) {
      collapseBtn.remove();
      delete el.dataset.panel;
      el.classList.remove("panel-collapsed");
      el.inert = false;
      el.removeAttribute("aria-hidden");
    }
    this.panels.clear();
  }

  // --- selection event contract ---------------------------------------------

  private readonly onBodySelectedEvent = (ev: Event): void => {
    const detail = (ev as CustomEvent).detail;
    if (isBodySelectedDetail(detail)) this.notifyBodySelected(detail.id);
  };

  /**
   * Call site for body selection (also reachable via
   * `window.dispatchEvent(new CustomEvent("qw:body-selected", { detail: { id } }))`
   * or `__qwOverlay.notifyBodySelected(id)`): the info panel is shown even
   * from an individual or global collapsed state.
   */
  notifyBodySelected(_id: string): void {
    this.set(stateWithBodySelected(this.state));
  }

  getState(): OverlayState {
    return this.state;
  }

  // --- internals -------------------------------------------------------------

  private set(next: OverlayState): void {
    this.state = next;
    saveOverlayState(next);
    this.apply(true);
  }

  private apply(animated: boolean): void {
    if (!animated) document.body.classList.add("no-anim");
    // Every string below resolves through t() against the CURRENT language —
    // a language change re-runs apply() via onLangChange, so nothing caches.
    this.dock.setAttribute("aria-label", t("overlay.dockAria"));
    for (const id of PANEL_IDS) {
      const reg = this.panels.get(id);
      if (!reg) continue;
      const vis = effectiveVisible(this.state, id);
      reg.el.classList.toggle("panel-collapsed", !vis);
      reg.el.inert = !vis; // collapse also removes panels from tab order
      reg.el.setAttribute("aria-hidden", String(!vis));
      reg.collapseBtn.setAttribute(
        "aria-label",
        t("overlay.collapseAria", {
          label: t(PANEL_LABEL_KEYS[id]),
          verb: t(vis ? "overlay.verbHide" : "overlay.verbShow"),
        }),
      );
      reg.collapseBtn.setAttribute("aria-expanded", String(vis));
      reg.collapseBtn.textContent = vis ? "×" : "·";
    }

    const anyHidden = PANEL_IDS.some((id) => !effectiveVisible(this.state, id));
    this.globalBtn.textContent = t(this.state.collapsedAll ? "overlay.showAll" : "overlay.hideAll");
    this.globalBtn.title = t("overlay.globalTitle");
    this.globalBtn.setAttribute("aria-pressed", String(!this.state.collapsedAll));
    this.restoreBtn.textContent = t("overlay.restore");

    // Restore affordance: one chip per hidden panel, always reachable in the dock.
    this.chipWrap.replaceChildren(
      ...PANEL_IDS.filter((id) => !effectiveVisible(this.state, id)).map((id) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "dock-btn dock-chip";
        chip.textContent = t(PANEL_LABEL_KEYS[id]);
        chip.setAttribute(
          "aria-label",
          t("overlay.collapseAria", {
            label: t(PANEL_LABEL_KEYS[id]),
            verb: t("overlay.verbShow"),
          }),
        );
        chip.addEventListener("click", () => this.set(togglePanel(this.state, id)));
        return chip;
      }),
    );
    this.restoreBtn.hidden = !anyHidden;
    this.dock.dataset.collapsedAll = String(this.state.collapsedAll);

    if (!animated) {
      void document.body.offsetWidth; // flush styles before re-enabling transitions
      requestAnimationFrame(() => document.body.classList.remove("no-anim"));
    }
  }
}
