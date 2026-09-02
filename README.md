# QW Solar — Log-Scale Solar System Demo

An interactive solar-system visualization built on Three.js. The Sun through
Pluto and the major moons are rendered from real astronomical data, with
separate render scales applied to distances and sizes for on-screen
readability. Every body with a real photographic global map (NASA imagery —
see `public/textures/ATTRIBUTION.md`) renders with its actual surface.
Original requirements: `docs/THREEJS_SOLAR_DEMO_PROMPT.md` (all sections
1–18 followed in full).

## Running

```bash
npm install
npm run dev      # dev server
npm run build    # TypeScript check + production build
npm run preview  # inspect the build output
```

Requires Node 20.19+ / 22.12+ (Vite 8 requirement).

## Controls (camera & selection)

| Action | Result |
|--------|--------|
| Left-click drag | Orbit the camera |
| Wheel / trackpad | Zoom in / out |
| Right-click drag (touch: two-finger drag) | Pan |
| Click (tap) a body | Select it + ease-in-out camera focus + info panel shown |
| Hover | Name and type tooltip |
| Double-click empty space | Deselect, back to the full solar system |
| Control panel `Reset camera` button / `Reset` | Deselect and return to the full solar-system view |

On selection, the default view automatically sets its distance to fit the
screen. Clicking a planet frames that planet together with its moons;
clicking a moon frames the moon together with its parent planet; clicking the
Sun brings the whole solar system back into view. The initial view is a
tilted (not top-down) perspective with the Sun through Pluto all in one
frame.

## Panel visibility and hotkeys

- Switch the display language with the flag buttons at the bottom-left of
  the header — eight languages: English, 한국어, 日本語, 中文, Français,
  Deutsch, Español and العربية (Arabic also flips the document to RTL).
  English is the default; the choice is saved in
  `localStorage["qwsolar.language.v1"]` and restored after a reload, and it
  fails safe to English when no stored value exists, the stored value is
  invalid, or storage access fails.
  (Base task t_00139ab5 — key symmetry across ALL dictionaries is enforced
  at compile time and by the i18n-parity check in `npm test`.)
- When switching, the translation covers every panel, not just the header and
  info panel (t_292b0645): control-panel buttons, labels and speed options
  and the `Now … · playing` readout, info row names and separators,
  scale-mode names, dock buttons, restore chips and their `title` attributes,
  and even the collapse/expand buttons' aria-labels all re-render immediately
  through dictionary lookup. Developer logs are not translated. Body names
  render in the CURRENT language only: EN mode shows `Jupiter`, Korean mode
  `목성`, Japanese `木星`, Chinese the systematic `木卫一`-style names,
  Spanish `Júpiter`, Arabic `المشتري` — in the on-screen labels, the
  info-panel title and moon list, the tooltip, and every reference label
  (`src/data/bodyNames.ts`; a language without an entry for a body falls
  back to the English name). Unit words follow the language too
  (`11.86 years (4,333 days)` ↔ `11.86 년 (4,333 일)`), while both unit
  notations (km/AU) and every number, conversion, and tilt/scale calculation
  stay identical regardless of language (the display layer changes only).
  Label show/hide keeps working independently of the language toggle.
- Each panel (header, control, info) can be hidden or shown individually via
  the collapse button at its top-right corner.
- `H` key: hides every UI panel on screen at once (for screenshots) or
  restores the previous layout exactly. The bottom dock's individual restore
  chips (e.g. `Control`) can bring panels back one at a time.
- Even while a panel is collapsed, clicking a body automatically reopens the
  info panel.
- Toggle state is saved in `localStorage["qwsolar.overlay.v1"]` and restored
  after a reload.
- Control panel: play/pause/reset, speed (1s = 1 day / 10 days / 100 days /
  1 year, default 10 days), distance scale (Log default · Linear · Focus),
  size scale (Enhanced · Huge default · Gigantic · Relative · Uniform),
  toggles for orbit lines, labels, moons, and starfield, and camera reset.
  The active distance/size mode is highlighted on its button.

## Scale modes explained

- **Distance Log (default)**: logarithmic compression of the mid-range —
  inner planets stay distinguishable and the outer edge still fits on one
  screen.
- **Distance Linear**: true AU proportion. Mercury through Mars appearing
  glued to the Sun is the point (a comparison mode that shows how extreme the
  real distance differences are).
- **Distance Focus**: layout is centered on the selected planetary system,
  with the outside gently compressed.
- **Size Enhanced**: square-root compression plus a minimum visible size.
  The Jupiter · Saturn ≫ Earth relationship is preserved while Pluto and the
  moons remain identifiable.
- **Size Huge (default)**: the Enhanced mapping magnified ×3 (Sun excluded).
  Bodies are easier to see and to click at the whole-system zoom level —
  the demo-friendly default.
- **Size Gigantic**: the Enhanced mapping magnified ×10 (Sun excluded) — a
  deliberately exaggerated showcase mode; neighboring bodies can visually
  overlap.
- **Size Relative**: emphasizes true proportions (magnifies size differences).
- **Size Uniform**: an identical marker for every body — a mode for looking
  at the orbital structure only.
- Render distance and render size are layout display values only, never a
  real physical scale (the bottom-right disclaimer and the info panel's
  render section state this every time).

## Surface textures (real NASA imagery)

Every planet, every major moon, Pluto and Charon render with a real
photographic/mosaic global map of the actual body (equirectangular), loaded
asynchronously from `public/textures/`:

- Sun–Neptune (+ Saturn's rings): the Solar System Scope texture pack
  (CC BY 4.0, based on NASA data); Earth is the NASA Blue Marble and the
  Moon the LRO LROC WAC global mosaic.
- All other moons, Pluto and Charon: NASA mission mosaics (Galileo, Voyager,
  Cassini, Viking, New Horizons) via the NOAA Science On a Sphere catalog.

Full per-file credits: `public/textures/ATTRIBUTION.md`. The map list lives
in `src/data/bodyTextures.ts`; loading is fallback-safe (a body whose map is
missing or unreachable keeps the original procedural look — Pluto's four
small moons have no real map at all, so they always use it).

## Data

`src/data/solarSystemData.ts` is the single source of real data, and the
rendering code hardcodes no astronomical values whatsoever. Fields:
`radiusKm`, `semiMajorAxis` (AU = heliocentric, km = moons), `eccentricity`,
`inclinationDeg`, `orbitalPeriodDays`, `rotationPeriodHours` (negative =
retrograde rotation), `axialTiltDeg`, `jplId`, `nameKo`/`nameEn`, `parentId`,
plus color and presentation metadata (`displayColor`, `render`).

### Sources (accessed 2026-08-29)

| # | Source | Data used |
|---|--------|-----------|
| S1 | JPL SSD Planetary Physical Parameters — https://ssd.jpl.nasa.gov/planets/phys_par.html | Mean radii (km) of the planets and Pluto, sidereal rotation periods, sidereal orbital periods. Basis: IAU Working Group (Archinal+2018), Explanatory Supplement to the Astronomical Almanac (Seidelmann 1992) |
| S2 | JPL SSD Approximate Positions of the Planets, Table 1 — https://ssd.jpl.nasa.gov/planets/approx_pos.html | J2000 Keplerian elements a (AU), e, i (°) for Mercury through Neptune. Earth uses the Earth/Moon Barycenter values |
| S3 | JPL SSD Satellite Mean Elements / Phys Par — https://ssd.jpl.nasa.gov/sats/elem/sep.html, https://ssd.jpl.nasa.gov/sats/phys_par/sep.html | Moon orbital a (km), e, i, P (days), mean radius. Jupiter=JUP365, Saturn=SAT441, Uranus=URA182, Neptune=NEP097, Pluto=PLU060 (Brozović & Jacobson 2024) |
| S4 | JPL SBDB API (134340 Pluto, DE441) — https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=134340&phys-par=true | Pluto orbit a=39.6 AU, e=0.252, i=17.1° |
| — | NASA Sun Facts — https://science.nasa.gov/sun/facts/ | Solar radius ≈695,700 km (diameter 1.4M km), equatorial rotation ≈25 days |

Conversion rules: years→days ×365.25, days→hours ×24. Everything else uses
the raw source values. The Moon's orbital period equals its rotation period
due to tidal locking.

### Precision notes
- Pluto's moons' e/i are rounded to the fewest significant figures matching
  the PLU060 stated precision (low-precision values like 0.000 in the JPL
  mean-elements table reflect the table's own digit count).
- The sign of planetary `rotationPeriodHours` follows the IAU convention
  (negative = retrograde: Venus, Uranus, Pluto).

### Validation
`src/data/validateSolarSystem.ts` runs the relation checks from spec §15:
duplicate ids / required fields, parentId resolution, planet distance and
orbital-period ordering, Jupiter · Saturn ≫ Earth in size, Pluto's maximum
eccentricity and inclination, and moon distance-period ordering. Output is
printed to the console in DEV mode.

## Scale formulas (render ≠ real data)

- **Distance (log, default)**: `d = 16 + log1p(AU)/log1p(39.6) × (190−16)`
  (min/max are the spec §4 recommended values, maxAU is the real-data maximum a)
- **Distance (linear)**: `d = AU × 4.7` — the crowding of the inner planets is
  the point (spec §4)
- **Distance (focus)**: the selected planetary system is placed at the center
  of the screen, and every body is positioned by its **true offset (AU)**
  relative to the anchor, then compressed: offsets ≤1.2 AU map quasi-linearly
  (`off × 0.75·26 units/AU`), and beyond that `log1p` compresses gently up to
  a cap (300 units). Planet and moon orbit lines share one mapper with no
  distinction between them, so bodies and orbits always agree (spec §4/§13).
- **Moon distance**: parent-group local coordinates. Sizes map the
  semi-major axis a through `log1p` into a band of 2.5–9× the render radius
  (the mapping span is the min/max of each moon's actual radius span
  `a(1±e)` rather than the semi-major axis itself — so high-eccentricity
  moons and single-moon systems (the Moon, Triton) never exceed the 9× band
  either), and the orbit path itself is drawn with **one single isotropic
  scale (units/km) per orbit** — the radius is never re-mapped vertex by
  vertex, so θ, a:b and e are preserved exactly and ellipses stay ellipses
  (t_5a546f13 diagnosis, t_d17906bf fix, docs/orbit-shape-diagnosis.md).
  Selecting a planet expands its parent-system band 2.2× (spec §13 detail
  view); that expansion is also an isotropic scale, so the shape stays the
  same.
- **Size (enhanced)**: `clamp(0.55 + 0.65·√(R/R⊕), 0.55, 4.0)`, moons
  `clamp(0.16 + 0.4·√(R/R⊕), 0.16, 0.75)`, the Sun a separate fixed 8
- **Size (huge, default / gigantic)**: the enhanced mapping ×3 / ×10
  (`SIZE_MODE_MULTIPLIER`); the Sun keeps its fixed radius in every mode
- **Size (relative)**: true-proportion emphasis `clamp(0.25 + 0.35·(R/R⊕), 0.25, 6.5)`
- **Size (uniform)**: an identical 0.6 marker for every body
- Orbital phase comes from a numerical solution of Kepler's equation (Newton,
  tol 1e-6) plus accumulated mean anomaly. Positions are computed solely from
  the accumulated simulation day count (independent of frame count, spec §8).

The in-app info panel and the bottom-right disclaimer both state that render
values are not real physical scale.

## Structure

```
src/
  main.ts                      # bootstrap: renderer, camera, loop, UI wiring
  styles.css
  data/solarSystemData.ts      # real data (single source)
  data/validateSolarSystem.ts  # data-validation utility
  data/bodyTextures.ts         # body id → real NASA surface-map file (public/textures/)
  data/bodyNames.ts            # body id → localized display names (ja/zh/fr/de/es/ar)
  core/ScaleManager.ts         # real data → render-unit conversion (3 distance & 5 size modes)
  core/SimulationClock.ts      # speed / play / pause / reset
  core/Kepler.ts               # Kepler-equation solver & orbit-plane position (pure functions)
  core/simMath.ts              # pure functions for rotation-angle & tilt mapping (no three/DOM deps)
  core/SolarSystem.ts          # scene graph: bodies, rings, starfield, moon local frames, transition interpolation
  core/CameraTween.ts          # camera focus: distance mapping + live-tracking ease-in-out tween (pure)
  core/CelestialBody.ts        # Kepler orbital kinematics, rotation, dimming (shared geometry)
  core/textures.ts             # photo-texture URL resolution + async loading (fallback-safe)
  core/OrbitRenderer.ts        # orbit lines (built at init, updated only on scale change)
  ui/ControlPanel.ts           # control HUD
  ui/InfoPanel.ts              # tooltip + info panel (real vs render values shown separately)
  ui/Labels.ts                 # CSS2D name labels (current language only)
  ui/i18n.ts                   # ko/en symmetric dictionary, language state, localStorage (t_00139ab5)
  ui/overlayState.ts           # overlay-toggle pure state, localStorage (t_30700e13)
  ui/OverlayManager.ts         # collapse buttons, dock, H hotkey, ARIA, selection events (t_30700e13)
```

## Contracts for follow-up workers

- Panel language (t_00139ab5): `ui/i18n.ts` is the single language foundation.
  The truth of the dictionary key set is Korean (`KO`); English is
  `Record<MessageKey,string>`, so defective or extra keys are compile errors,
  and the runtime symmetry check is enforced by
  `node scripts/i18n-parity.test.mjs` (in the npm test chain). User-facing
  strings are looked up only through `t(key, params?, lang?)` (a missing key
  becomes a visible `?key?` placeholder — never undefined/empty), and panels
  re-render via `onLangChange(fn)` subscriptions (no string caching). The
  current language is read/written through `getLang()`/`setLang()`/
  `toggleLang()`, defaulting to English; the choice persists in
  `localStorage["qwsolar.language.v1"]` (anything other than "ko"/"en" falls
  back to English, and a storage failure behaves the same). Every fixed string
  across all panels (control buttons, labels and speed options; info row
  names, separators and type names; dock, chip and collapse aria-labels;
  scale-mode names; speed and elapsed labels) resolves through these
  dictionary keys with no Korean literals left in source — the hardcoding
  scan in `scripts/i18n-parity.test.mjs` (comments excluded, including a
  meta-test of the detector itself) and the `{token}` two-language symmetry
  check enforce this. Dictionary-derived keys such as `PANEL_LABEL_KEYS` stay
  as static mappings for compile-time validation. Verified in a real browser:
  `node scripts/language-browser-check.mjs` (headless Chrome + CDP, 52
  checks — per-panel rendering in both languages and aria switching, not just
  the header, plus real-data label priority, label line-order swapping, and
  label-visibility independence).
- Body identity & selection state (t_766b495f): `core/bodyIdentity.ts` is the
  sole identity/state contract. Body ids are `CelestialBodyData.id` (parents
  via `parentId`), and scene nodes advertise themselves only through
  `userData.bodyId` (mesh, group, and ring alike) — `name` (like
  "tilt:<id>") is decorative, so never parse it. Click resolution on mesh
  children (rings etc.) is `resolveBodyIdFromObject(node)`: it walks the
  parent chain and adopts the first `userData.bodyId` that actually exists in
  the dataset, or null (empty space — no exceptions). The entire selection
  state (selected id, detail-view system parent, focus anchor) comes from one
  derivation, `selectionFor(id)` (moon → parent, star → null). Raycast
  recursion targets are `SolarSystem.pickTargets()` (mesh + rings), with
  coordinates as NDC relative to `getBoundingClientRect()` — dpr-independent
  and still correct after window resizes. A moon's `group.position` is
  parent-local (`coordFrameOf`), so scene comparisons must always use
  `getWorldPosition()`. Verified by: `node scripts/body-identity.test.mjs`
  (14 checks, pure).
- Overlay panel toggles (t_30700e13): `ui/overlayState.ts` (pure state,
  localStorage) and `ui/OverlayManager.ts` (DOM, dock, H hotkey, ARIA) span
  the whole layer. Registering a `.panel` via `overlay.register(id, el)`
  injects its individual collapse button. Body selection must flow through
  exactly one path — `selectBody(id)` in `main.ts` — which emits the
  `qw:body-selected` custom event (detail `{id}`) → the info panel shows
  itself automatically even when individually/globally hidden
  (`__qwOverlay.notifyBodySelected(id)` can call this directly; it is the
  test seam). Toggle state lives in `localStorage["qwsolar.overlay.v1"]`.
  State-transition rules are verified by `npm test`; real-browser
  verification: `node scripts/overlay-browser-check.mjs` (headless Chrome +
  CDP, 28 checks).
- Renderer extension (t_a5d73491): `ScaleManager`, `SolarSystem`, and
  `OrbitRenderer` form the rendering layer; `SOLAR_SYSTEM` is the data layer.
  Never mix the two kinds of values. Mode changes and system selection go
  through `SolarSystem.animateScaleChange()` (0.7 s easeInOut interpolation;
  spec §13 "interpolate, never snap"); use `refreshScales(simDays)` only when
  an immediate remap is required. Orbit lines share the same ScaleManager
  mapper as the bodies, so they never drift out of alignment in any mode. In
  detail view, unrelated bodies dim to 15% opacity
  (`CelestialBody.setDimmed`). Geometry is a single shared unit sphere
  (created at module init) — call `disposeSharedGeometries()` only from
  `SolarSystem.dispose()`.
- Simulation time (t_1f6e8acc): positions, rotation, and tilt are functions
  solely of the accumulated `simDays` (independent of frame count, spec
  §7/§8). The Kepler solution stays stable across the whole e<1 range via
  Newton plus a bisection bracket (`core/Kepler.ts`), and the rotation-angle
  and tilt mappings live in the pure functions of `core/simMath.ts`, so
  bodies, moons, and orbit lines share the same formulas. Speed changes go
  through `SimulationClock.setTimeScale(daysPerSecond)`; play/pause/reset
  through `setPlaying/reset` — the HUD is updated by `ControlPanel.setStatus()`
  at most 5 times per second (elapsed time, current speed, play state).
  Size/distance mode-change interpolation and the camera tween run on
  real-time dt (`SolarSystem.update(simDays, dtSec)`) — there is no 60fps
  assumption. Verified by: `node scripts/sim-time.test.mjs` (22 checks, pure
  math), the `t_clock_*` tags in autotest (pause-freeze, reset, speed), and
  `scripts/hud-check.sh`.
- Labels & info panel (t_d9203468): `ui/format.ts` is the sole home of the
  real-value display rules (pure; Node test `scripts/info-format.test.mjs`,
  19 checks). Missing data never leaks as `undefined`/`NaN` — it is unified
  as `MISSING_DISPLAY` ("—"), and km↔AU share one IAU exact constant
  (149,597,870.7 km) and one rounding rule so the two unit displays never
  disagree with each other. Body names follow a single rule in
  `displayName`: the CURRENT language's name only (EN mode "Jupiter", Korean
  mode "목성"; a missing name falls back to the other language before the
  "—" placeholder); the period and retrograde unit WORDS are per-language
  (the `unit.*` / `rotation.retrograde` dictionary keys) and numbers are
  identical in both languages. `InfoPanel`
  separates the real-data section from the render-values section (`units`,
  marked "not real data") with headers, takes selection through
  `showBody(id)`, and updates only via `refresh()` — the frame loop (200 ms)
  re-renders the current selection with live sim time, so it always matches
  moving bodies and mode changes; there is no direct DOM-mutation path, so
  display state cannot diverge. Even when panels are individually/globally
  hidden, the `selectBody` → `qw:body-selected` path restores it
  automatically (`__qwVerify.select(id)` goes through the same path).
  Verified by: `node scripts/info-panel-browser-check.mjs` (headless Chrome
  CDP; planets, moons, selection, label sync, restoration, down to 420px
  width).
- Camera focus (t_31402ac4): one focus path — `main.reframeCamera()` applies
  the selection state derived from `selectionFor` **first**, then builds the
  render-unit inputs with `focusFrameFor(id)` (original vs boosted radius
  separated, the parent render-ring extent for parent-local moons, ring outer
  radius) and passes them to `core/CameraTween.cameraFocusDistance()`.
  Mapping: planet/moon = max(parent-system extent, effective radius) × 2.2;
  **selecting the star (Sun) = the global distance unchanged** (spec §9
  "selecting the Sun shows the whole solar system" — the Sun is at the
  origin, so it lands in the same frame); no selection = 340. The camera and
  the focus-distance scale mapping read the same number, so they cannot
  disagree with each other, and distance-mode changes and reset use the same
  route (`onDistanceMode` / `__qwVerify.setDistanceMode` → `reframeCamera`).
  The flight is owned by `CameraTween`: it starts from the current camera
  state (controls.target/camera.position), keeps the viewing direction, and
  each step re-reads the body's **current** world position via `follow(out)`
  (running alongside sim time), so at the final step target ≡ world position
  and the camera sits exactly `mapping` distance away. Re-selecting
  mid-flight is a safe cancel — calling `start()` again aborts application of
  the previous segment; after completion `update()` is inert (it does not
  even invoke callbacks; dispose-safe); if follow yields NaN, that step is
  skipped. Verified by: `node scripts/camera-focus.test.mjs` (14 checks,
  pure), the `t_cam_*` tags in autotest (paused, moving target, moon io,
  rapid re-selection, focus mode, global return).
- Raycaster selection & pointer lifecycle (t_06891a0f): input arbitration
  lives entirely in two pure modules —
  `core/pickCoords.ndcFromClientPoint(x, y, rect)` converts a click point to
  NDC relative to `getBoundingClientRect()` (dpr-independent; a fresh rect
  per pick, so it stays correct after window resizes and orientation changes,
  and a zero-size rect returns null instead of throwing). Tap-vs-drag is
  `core/pointerGesture.TapGestureTracker` (pure): only stationary taps within
  `TAP_MOVE_TOLERANCE_PX` (6px, boundary inclusive) of the pointerdown/up
  coordinates are allowed; the moment a second pointer joins, the entire
  gesture is disqualified (lifting fingers one by one during a pinch selects
  nothing); disqualification clears only when all pointers are released;
  pointercancel never leaves a phantom down. `main.ts` registers
  pointerdown/up/cancel + dblclick + pointermove on the canvas exactly once,
  all as named handlers — `teardownPicking()`/`__qwTeardownPicking()` are
  removable globally and separately (no double registration). Hover raycast
  is skipped while the pointer is down (during an OrbitControls drag). Pick
  nearest-valid: `pickAt` adopts the first valid id from the sorted recursive
  `pickTargets()` results via `resolveBodyIdFromObject` (ring child → planet);
  empty space keeps the selection and raises no exception; only
  double-clicking empty space deselects (existing UX). Verified by:
  `node scripts/pick-input.test.mjs` (18 checks, pure) +
  `node scripts/pick-input-browser-check.mjs` (CDP real input, 16 checks:
  planet, ring child, moon→earth derivation, empty space, double-click,
  coexistence with OrbitControls drag, touch tap, pinch disqualification,
  dpr-2 resize, re-select during animation, teardown, zero console errors).
- Integration teardown & listener accounting (t_92052608): `teardownAll()`
  (on beforeunload and via `__qwTeardownAll()`) releases in one shot the rAF
  loop (cancelled, never rearmed), the 5 canvas pickers + OrbitControls
  internal listeners (`controls.dispose()`), window resize/beforeunload, the
  overlay, and scene resources; duplicate calls are harmless (idempotent). In
  `VITE_VERIFY=1` builds, an `EventTarget.prototype` accounting hook counts
  live listeners per (target, event) — over-removal saturates at 0 to absorb
  OrbitControls' add/remove churn — proving all are live while mounted and
  all are 0 after teardown. In production builds it compiles away as dead
  code. Verified by: `node scripts/integration-browser-check.mjs` (CDP, 14
  checks: loop stops, all listeners released, canvas unresponsive after
  teardown, single re-registration and working selection after remount,
  dpr-2 resize click, zero console errors).
- Moon orbit-shape browser regression (t_b4bcc438): where
  `orbit-shape.test.mjs` verifies the real classes under Node,
  `scripts/orbit-shape-browser-check.mjs` reads the LineLoop vertices
  actually uploaded to WebGL over CDP — ellipse reconstruction for all 25
  parent-local moons (e′ = the real e, focus-conic residual < 1e-6),
  body-line agreement, the 2.5×–9× (×2.2 boosted) band, bit-for-bit
  log/linear/focus identity, planet-line regression (including hiding the
  focus-anchor line), layout retention after switching the center body (whole
  moon systems + direct Moon selection), and the parent sphere contained
  inside each moon's outer ring in screen projection. Run: `VITE_VERIFY=1 npm
  run build && npm run preview -- --port 5211` + headless Chrome
  `--remote-debugging-port=9333`, then
  `node scripts/orbit-shape-browser-check.mjs http://127.0.0.1:9333 http://localhost:5211/`
  (391 checks, outputs 8 representative screenshots).
- Commit convention: `<type>: <summary> [<kanban-task-id>]`, one commit per
  completed task.

## Known limitations (as of this stage)

- The focus distance mode compresses around the anchor, so the orbit-line
  shapes of other planets are distorted — a deliberate choice prioritizing
  body-orbit consistency (spec §4 "local scale centered on the selected
  planetary system"). For comparisons that require absolute physical orbit
  shapes, use linear mode.
- Detail-view dimming applies only to mesh opacity; the orbit lines of
  unrelated bodies remain as-is — intentional design.
