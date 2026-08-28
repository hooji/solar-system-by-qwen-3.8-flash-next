/**
 * overlayState.ts — pure state layer for the overlay panel toggle system
 * (task t_30700e13). No DOM here: transitions are plain functions so the
 * interactions between per-panel state and the global hide state stay
 * consistent and unit-testable. Persistence key + parse-guarded load/save
 * for localStorage live here too.
 */

export const PANEL_IDS = ["header", "control", "info"] as const;
export type PanelId = (typeof PANEL_IDS)[number];

export const PANEL_LABELS_KO: Record<PanelId, string> = {
  header: "헤더",
  control: "제어",
  info: "인포",
};

export interface OverlayState {
  /** One hotkey (H) / global button flips this; individual flags are kept. */
  collapsedAll: boolean;
  /** Per-panel collapse, preserved across a global collapse/restore. */
  collapsed: Record<PanelId, boolean>;
}

export const STORAGE_KEY = "qwsolar.overlay.v1";

export function defaultOverlayState(): OverlayState {
  return {
    collapsedAll: false,
    collapsed: { header: false, control: false, info: false },
  };
}

function isPanelId(v: unknown): v is PanelId {
  return typeof v === "string" && (PANEL_IDS as readonly string[]).includes(v);
}

/** Tolerant deserialization: anything malformed falls back to defaults. */
export function parseOverlayState(raw: string | null | undefined): OverlayState {
  if (!raw) return defaultOverlayState();
  try {
    const o = JSON.parse(raw) as Partial<OverlayState>;
    const s = defaultOverlayState();
    if (typeof o.collapsedAll === "boolean") s.collapsedAll = o.collapsedAll;
    if (o.collapsed && typeof o.collapsed === "object") {
      for (const [k, v] of Object.entries(o.collapsed)) {
        if (isPanelId(k) && typeof v === "boolean") s.collapsed[k] = v;
      }
    }
    return s;
  } catch {
    return defaultOverlayState();
  }
}

export function loadOverlayState(): OverlayState {
  try {
    return parseOverlayState(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return defaultOverlayState(); // private-mode / disabled storage
  }
}

export function saveOverlayState(state: OverlayState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — state still works for this session */
  }
}

/** A panel is on screen only when neither it nor the global switch is off. */
export function effectiveVisible(state: OverlayState, id: PanelId): boolean {
  return !state.collapsedAll && !state.collapsed[id];
}

/**
 * Per-panel collapse/expand button. While everything is globally hidden,
 * opening one panel also exits the global state (the user asked to see it).
 */
export function togglePanel(state: OverlayState, id: PanelId): OverlayState {
  const next: OverlayState = {
    ...state,
    collapsedAll: false,
    collapsed: {
      ...state.collapsed,
      [id]: state.collapsedAll ? false : !state.collapsed[id],
    },
  };
  return next;
}

/** Global button / H key: hide all overlays or restore the previous per-panel layout. */
export function toggleAll(state: OverlayState): OverlayState {
  return { ...state, collapsedAll: !state.collapsedAll };
}

/** Dock "복구": drop every collapse (individual + global) in one click. */
export function restoreAll(_state: OverlayState): OverlayState {
  return defaultOverlayState();
}

/**
 * Body-selection contract: any selection (raycast click now, programmatic
 * later) must surface the info panel even from a collapsed state.
 */
export function stateWithBodySelected(state: OverlayState): OverlayState {
  return {
    ...state,
    collapsedAll: false,
    collapsed: { ...state.collapsed, info: false },
  };
}

// --- public event interface --------------------------------------------------
// The selection logic lives in the focus/selection task; this is the explicit,
// testable call site it plugs into. Fire the event (or call the window hook)
// with { id } and the overlay state updates, showing the info panel.

export const BODY_SELECTED_EVENT = "qw:body-selected";

export interface BodySelectedDetail {
  id: string;
}

export function isBodySelectedDetail(v: unknown): v is BodySelectedDetail {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as BodySelectedDetail).id === "string"
  );
}
