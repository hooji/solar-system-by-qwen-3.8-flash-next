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
  PANEL_LABELS_KO,
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
  private readonly onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key.toLowerCase() !== "h" || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const t = ev.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
    ev.preventDefault();
    this.set(toggleAll(this.state));
  };

  constructor(container: HTMLElement) {
    this.dock = document.createElement("nav");
    this.dock.className = "overlay-dock panel-lite";
    this.dock.setAttribute("aria-label", "오버레이 패널 복구");

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
    this.restoreBtn.textContent = "모두 복구";
    this.restoreBtn.addEventListener("click", () => this.set(restoreAll(this.state)));
    this.dock.appendChild(this.restoreBtn);

    container.appendChild(this.dock);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener(BODY_SELECTED_EVENT, this.onBodySelectedEvent);
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
    for (const id of PANEL_IDS) {
      const reg = this.panels.get(id);
      if (!reg) continue;
      const vis = effectiveVisible(this.state, id);
      reg.el.classList.toggle("panel-collapsed", !vis);
      reg.el.inert = !vis; // collapse also removes panels from tab order
      reg.el.setAttribute("aria-hidden", String(!vis));
      reg.collapseBtn.setAttribute(
        "aria-label",
        `${PANEL_LABELS_KO[id]} 패널 ${vis ? "숨기기" : "표시"}`,
      );
      reg.collapseBtn.setAttribute("aria-expanded", String(vis));
      reg.collapseBtn.textContent = vis ? "×" : "·";
    }

    const anyHidden = PANEL_IDS.some((id) => !effectiveVisible(this.state, id));
    this.globalBtn.textContent = this.state.collapsedAll
      ? "패널 표시"
      : "패널 숨김";
    this.globalBtn.title = "모든 오버레이 숨김/표시 (단축키 H)";
    this.globalBtn.setAttribute("aria-pressed", String(!this.state.collapsedAll));

    // Restore affordance: one chip per hidden panel, always reachable in the dock.
    this.chipWrap.replaceChildren(
      ...PANEL_IDS.filter((id) => !effectiveVisible(this.state, id)).map((id) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "dock-btn dock-chip";
        chip.textContent = PANEL_LABELS_KO[id];
        chip.setAttribute("aria-label", `${PANEL_LABELS_KO[id]} 패널 표시`);
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
