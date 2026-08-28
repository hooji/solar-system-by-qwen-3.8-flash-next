# Three.js Logarithmic Solar System Demo — Implementation Prompt

Build an interactive 3D Solar System demo that runs in a web browser using Three.js.

The demo must visualize the Solar System from the Sun through Pluto, including major moons. It should use real astronomical data as its source of truth while applying logarithmic and visibility-enhancing display scales so that the complete system can fit within a single screen and still remain understandable.

## 1. Goal

Create a browser-based 3D visualization that allows users to inspect the Solar System from the Sun to Pluto at a glance.

Use real astronomical values for the following properties:

- Actual celestial-body radius
- Mean distance from the Sun or orbital semi-major axis
- Orbital period
- Rotation period
- Orbital eccentricity
- Orbital inclination
- Moon-to-parent distance
- Moon orbital period

A physically exact rendering scale would make planets and moons nearly invisible and would place outer planets too far away to fit on one screen. Therefore, clearly separate these three concepts:

1. Real astronomical data
2. Rendered orbital-distance scale
3. Rendered celestial-body size scale

Preserve the real data in the model, but use logarithmic distance compression, minimum display sizes, and visibility-oriented size scaling for rendering.

---

## 2. Technology Stack

Use the following stack:

- Vite
- TypeScript
- Three.js
- `OrbitControls`
- HTML/CSS-based HUD and control panels
- No external physics engine
- `requestAnimationFrame`-based animation
- Responsive support for both desktop and mobile browsers

The project must run with:

```bash
npm install
npm run dev
```

Separate astronomical data, rendering logic, simulation timing, and UI logic into maintainable modules.

Suggested project structure:

```text
src/
  main.ts
  styles.css
  data/
    solarSystemData.ts
  core/
    SolarSystem.ts
    CelestialBody.ts
    OrbitRenderer.ts
    ScaleManager.ts
    SimulationClock.ts
  ui/
    ControlPanel.ts
    InfoPanel.ts
    Labels.ts
```

---

## 3. Celestial Bodies to Include

### Sun

- Sun

### Planets and Dwarf Planet

Include all of the following:

- Mercury
- Venus
- Earth
- Mars
- Jupiter
- Saturn
- Uranus
- Neptune
- Pluto

Display Pluto as a dwarf planet, but allow it to be selected, focused, and inspected in the same way as the planets.

### Major Moons

Do not attempt to include every known moon. Include at least the following major moons:

- Earth
  - Moon

- Mars
  - Phobos
  - Deimos

- Jupiter
  - Io
  - Europa
  - Ganymede
  - Callisto

- Saturn
  - Mimas
  - Enceladus
  - Tethys
  - Dione
  - Rhea
  - Titan
  - Iapetus

- Uranus
  - Miranda
  - Ariel
  - Umbriel
  - Titania
  - Oberon

- Neptune
  - Triton

- Pluto
  - Charon
  - Styx
  - Nix
  - Kerberos
  - Hydra

Store moon definitions in a data file so that additional moons can be added or removed without modifying the rendering engine.

---

## 4. Heliocentric Distance Scale

Store real Sun-to-planet orbital distances as semi-major axes in astronomical units.

Do not render these distances with a simple linear scale in the default view. Apply a logarithmic mapping instead.

Implement a mapping similar to the following:

```ts
function mapHeliocentricDistance(
  distanceAU: number,
  maxDistanceAU: number,
  minRenderDistance: number,
  maxRenderDistance: number
): number {
  const normalized =
    Math.log1p(distanceAU) /
    Math.log1p(maxDistanceAU);

  return (
    minRenderDistance +
    normalized * (maxRenderDistance - minRenderDistance)
  );
}
```

Recommended initial values:

```ts
const MAX_DISTANCE_AU = 39.5; // Approximate Pluto orbital scale
const MIN_RENDER_DISTANCE = 16;
const MAX_RENDER_DISTANCE = 190;
```

These values may be adjusted to improve composition, but the following conditions must remain true:

- The Sun through Pluto must fit inside the default camera view.
- The orbits of Mercury, Venus, Earth, and Mars must remain visually distinguishable.
- The outer planets must not collapse into a narrow band.
- The correct distance order and broad relative differences must be preserved.
- The UI must explicitly state that the active distance representation is a logarithmic distance scale.

Provide the following selectable distance modes:

- **Log Scale** — default mode
- **Linear Scale** — comparison mode
- **Focus Scale** — local scale centered on the selected planetary system

In Linear Scale mode, it is acceptable and expected for the inner planets to become difficult to see. This mode should help demonstrate how extreme the actual distance differences are.

---

## 5. Moon-Orbit Scale

Do not use the global Solar System distance scale directly for moon orbits. Doing so would cause most moons to overlap their parent planets.

Create a local coordinate system for each planetary system and apply a separate logarithmic mapping for moon distances.

Example:

```ts
function mapSatelliteDistance(
  distanceKm: number,
  minDistanceKm: number,
  maxDistanceKm: number,
  minRenderDistance: number,
  maxRenderDistance: number
): number {
  const shiftedDistance = Math.max(
    0,
    distanceKm - minDistanceKm
  );

  const shiftedMax = Math.max(
    1,
    maxDistanceKm - minDistanceKm
  );

  const normalized =
    Math.log1p(shiftedDistance) /
    Math.log1p(shiftedMax);

  return (
    minRenderDistance +
    normalized * (maxRenderDistance - minRenderDistance)
  );
}
```

Moon-system rendering rules:

- Place moons under their parent planet's `THREE.Group`.
- When the planet moves, the complete moon system must move with it.
- Render moon orbits at approximately 2.5 to 9 times the displayed radius of the parent planet.
- Preserve the real ordering of moon distances.
- In the full Solar System view, render moons subtly and hide or greatly reduce the opacity of moon orbit lines.
- When a planet is selected, enlarge and clarify its local moon system.
- Transition smoothly between the global Solar System scale and the selected planetary-system scale.

---

## 6. Celestial-Body Size Scale

Store the actual radius of every celestial body, but do not render bodies using the same physical scale as orbital distance.

A physically uniform scale would make Earth, Mercury, Pluto, and most moons nearly invisible.

Use a gentle square-root or power-based mapping for displayed planet radius.

Example:

```ts
function mapPlanetRadius(radiusKm: number): number {
  const earthRadiusKm = 6371;
  const ratio = radiusKm / earthRadiusKm;

  return THREE.MathUtils.clamp(
    0.55 + 0.65 * Math.pow(ratio, 0.5),
    0.55,
    4.0
  );
}
```

Handle the Sun separately:

```ts
const SUN_RENDER_RADIUS = 8;
```

Guarantee a minimum visible size for moons:

```ts
function mapMoonRadius(radiusKm: number): number {
  const earthRadiusKm = 6371;
  const ratio = radiusKm / earthRadiusKm;

  return THREE.MathUtils.clamp(
    0.16 + 0.4 * Math.pow(ratio, 0.5),
    0.16,
    0.75
  );
}
```

Size-rendering rules:

- Preserve the actual ordering of celestial-body sizes.
- Jupiter and Saturn must appear clearly larger than Earth.
- Mercury, Pluto, and major moons must remain identifiable.
- The Sun must not overwhelm the complete scene.
- The UI must explain that body size is visually enhanced and does not share the same physical scale as orbital distance.

Provide the following selectable size modes:

- **Enhanced Visibility** — default mode
- **Relative Size** — stronger emphasis on real size ratios
- **Uniform Markers** — similar marker sizes for all bodies

---

## 7. Orbital Mechanics and Orbit Rendering

Prefer elliptical orbits over simple circles.

Use a data model similar to the following:

```ts
interface CelestialBodyData {
  id: string;
  nameKo: string;
  nameEn: string;
  type: "star" | "planet" | "dwarf-planet" | "moon";
  parentId?: string;

  radiusKm: number;
  semiMajorAxis?: number;
  semiMajorAxisUnit?: "AU" | "km";
  eccentricity?: number;
  inclinationDeg?: number;
  orbitalPeriodDays?: number;
  rotationPeriodHours?: number;
  axialTiltDeg?: number;

  displayColor: string;
  description?: string;
}
```

Compute orbital positions using mean anomaly and Kepler's equation, or use a reasonable numerical approximation suitable for a browser demo.

Minimum requirements:

- Any orbit with non-zero eccentricity must be visibly elliptical.
- Pluto's eccentricity and inclination must be noticeably greater than those of most planets.
- Apply orbital inclination in 3D space.
- Avoid rendering every orbit as a perfectly overlapping coplanar circle.
- Derive relative orbital speed from actual orbital periods.
- Provide an adjustable simulation time multiplier.
- Compute positions from accumulated simulation time, not from frame count, so the simulation behaves consistently at different frame rates.

---

## 8. Simulation Time Controls

Add simulation controls in the upper-right area or along the bottom of the viewport.

Required controls:

- Play
- Pause
- Reset
- Time-scale slider or selector
- Current simulation date or elapsed simulation days

Suggested time scales:

- 1 second = 1 day
- 1 second = 10 days
- 1 second = 100 days
- 1 second = 1 year

Choose a default speed that makes outer-planet movement observable.

Do not assign arbitrary independent visual speeds to each planet. Preserve the actual ratios between orbital periods.

---

## 9. Camera and User Interaction

Use `OrbitControls`.

Required interactions:

- Left-drag: orbit camera
- Mouse wheel or trackpad: zoom
- Right-drag or equivalent: pan
- Click celestial body: focus on that body
- Double-click empty space or press Reset: return to the complete Solar System view

The initial camera must use a slightly oblique perspective rather than a perfectly vertical top-down view.

The initial composition must satisfy the following:

- The Sun through Pluto is visible.
- Orbital inclinations can be perceived.
- Planet labels do not excessively overlap.
- The complete structure of the Solar System is understandable at a glance.

When a body is selected, move the camera smoothly using ease-in-out interpolation.

Focus behavior:

- Selecting the Sun: show the complete Solar System
- Selecting a planet: show the planet and its major moons
- Selecting a moon: frame the moon together with its parent planet

---

## 10. Selection and Information Panel

Use `THREE.Raycaster` to support celestial-body selection.

On pointer hover, show a compact tooltip containing:

- Korean name
- English name
- Object type

On click, display a detailed information panel containing:

- Name
- Object type
- Actual radius
- Mean distance from the Sun or parent body
- Orbital period
- Rotation period
- Orbital eccentricity
- Orbital inclination
- Moon list
- Current rendered distance
- Active distance scale
- Current rendered radius
- Active size scale

Clearly distinguish real astronomical values from rendered display values.

Example:

```text
Actual distance from the Sun: 5.20 AU
Rendered orbital radius: 104.3 units
Distance representation: Log Scale

Actual radius: 69,911 km
Rendered radius: 3.7 units
Size representation: Enhanced Visibility
```

---

## 11. Labels

Use HTML-based labels, `CSS2DRenderer`, or Three.js sprite labels.

Label requirements:

- Always show labels for the Sun, planets, and Pluto by default.
- Show moon labels when their parent planet is selected.
- Labels must face the camera or remain screen-aligned.
- Hide labels naturally when they are off-screen or fully occluded where practical.
- Reduce label density based on camera distance and selection state.
- Use Korean as the primary label and English as the secondary label.

Example:

```text
목성
Jupiter
```

---

## 12. Visual Design

The demo must work without external texture assets. Use procedural colors, generated textures, and materials as the default implementation.

Represent each body with a recognizable approximate appearance:

- Sun: emissive sphere with a light source
- Mercury: dark gray
- Venus: yellow-brown
- Earth: blue and green tones
- Mars: red-orange
- Jupiter: light brown atmospheric bands
- Saturn: pale yellow with rings
- Uranus: cyan or turquoise
- Neptune: deep blue
- Pluto: gray-brown
- Moons: neutral colors distinct from the parent body

Saturn's rings are mandatory.

Include thin Uranian rings when practical.

Planetary bands or surface variation may be generated with `CanvasTexture` or a lightweight shader. The demo must not fail when external image resources are unavailable.

Add the following scene elements:

- Black or very dark space background
- Procedurally generated star field
- Subtle ambient light
- Illumination originating from the Sun
- Orbit lines

Highlight the selected body's orbit. Render non-selected orbit lines with lower opacity.

---

## 13. Global View and Planetary-System Detail View

### Complete Solar System View

- Show the Sun through Pluto.
- Show all planetary orbit lines.
- Show planet labels.
- Display moons as small bodies or markers.
- Hide moon orbit lines by default or render them very faintly.
- Fit the entire Solar System into the viewport.

### Planetary-System Detail View

When a planet is selected:

- Move the selected planet to the visual center.
- Reveal its moon orbit lines.
- Show moon labels.
- Animate moon orbital motion.
- Dim, simplify, or temporarily hide unrelated planets.
- Provide a Back or Solar System button to return to the global view.

Interpolate scale and camera changes rather than switching abruptly.

---

## 14. User Interface

Use unobtrusive translucent panels that do not significantly block the scene.

### Header

Display:

```text
Logarithmic Solar System
A visualization of real astronomical data compressed with logarithmic scaling
```

### Control Panel

Provide:

- Complete Solar System view
- Play and pause
- Time scale
- Distance scale selector
- Size scale selector
- Orbit visibility toggle
- Label visibility toggle
- Moon visibility toggle
- Star-field visibility toggle
- Camera reset

### Information Panel

Show both real astronomical data and current rendered values for the selected body.

### Required Scale Disclaimer

Include a visible explanation equivalent to:

```text
This visualization uses real astronomical data. However, orbital distances are compressed with a logarithmic scale and celestial-body sizes are visually enlarged so that the complete Solar System can be shown on one screen.

Rendered body sizes and rendered orbital distances therefore do not share one uniform physical scale.
```

---

## 15. Astronomical Data Accuracy

Do not invent arbitrary astronomical values directly in the rendering code.

Use reliable public data from sources such as NASA or JPL as the basis for the dataset.

Document the following in the README:

- Data sources
- Distance-scaling formula
- Celestial-body size-scaling formula
- Difference between physical scale and visualization scale
- Criteria used to select moons
- Installation and execution instructions

The data does not need unnecessary precision, but the following relationships must be correct:

- Order of planets by distance from the Sun
- Order of planets by size
- Relative order of orbital periods
- Correct parent body for each moon
- Correct order of moon orbits
- Pluto's comparatively high eccentricity and orbital inclination

---

## 16. Performance Requirements

- The demo must run smoothly on a typical desktop browser.
- Do not use unrestricted `devicePixelRatio` on high-resolution displays.

Use an upper limit such as:

```ts
renderer.setPixelRatio(
  Math.min(window.devicePixelRatio, 2)
);
```

- Do not create unnecessary `Geometry`, `Material`, or `Vector` objects every frame.
- Build orbit-line geometry during initialization and reuse it.
- Update labels and information panels only when necessary.
- Handle browser resizing correctly.
- Reduce star count and label density on mobile devices.
- Avoid browser-console errors and warnings.

---

## 17. Implementation Quality

Follow these implementation rules:

- Separate astronomical data from visualization logic.
- Move constants and magic numbers into configuration objects.
- Use descriptive class and function names.
- Comment the scale-conversion formulas.
- Use explicit TypeScript types.
- Minimize use of `any`.
- Implement resize handling and resource disposal.
- Avoid duplicated logic.
- Do not place the complete application inside one oversized `main.ts` file.

---

## 18. Completion Criteria

The implementation is complete only when all of the following are true:

1. The project runs with `npm install` and `npm run dev`.
2. The Sun through Pluto fits inside the initial viewport.
3. Real heliocentric distances are stored and mapped through a logarithmic display scale.
4. Celestial-body sizes are based on real radii but independently compressed or enlarged for visibility.
5. Major moons, including Earth's Moon, are visible.
6. Pluto and its moon system, including Charon, are included.
7. Planets and moons move according to the relative ratios of their real orbital periods.
8. Clicking a planet moves the camera to its planetary system.
9. The user can return to the complete Solar System view.
10. The information panel distinguishes real values from rendered values.
11. The UI explicitly explains that distance and size do not use one shared physical scale.
12. The layout works on desktop and mobile browsers.
13. The project has no TypeScript compilation errors.
14. The browser console has no runtime errors.
15. The README documents execution, data sources, and scaling formulas.

Before writing the implementation, present the complete project file structure. Then provide fully executable source code without omissions. Do not provide only pseudocode, architectural sketches, or incomplete snippets.
