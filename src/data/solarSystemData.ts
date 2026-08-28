/**
 * Real astronomical data for the solar-system demo.
 *
 * UNITS & FRAME CONVENTIONS (mandatory reading for downstream tasks):
 *  - radiusKm            : mean (volumetric-equivalent) radius, km
 *  - semiMajorAxis       : AU for heliocentric orbits (planets/dwarf planet),
 *                          km for satellite (moon) orbits around parentId
 *  - eccentricity        : dimensionless
 *  - inclinationDeg      : heliocentric orbits → deg vs J2000 mean ecliptic;
 *                          moon orbits → deg vs the parent's local Laplace plane
 *                          (JPL) or mean ecliptic (Moon), per source table
 *  - orbitalPeriodDays   : sidereal orbital period in Earth days
 *  - rotationPeriodHours : sidereal rotation in hours; NEGATIVE = retrograde spin
 *  - axialTiltDeg        : obliquity to orbital plane (deg)
 *
 * SOURCES (accessed 2026-08-29, see README for full list):
 *  [S1] JPL SSD Planetary Physical Parameters
 *       https://ssd.jpl.nasa.gov/planets/phys_par.html
 *       → mean radius, sidereal rotation period (days), sidereal orbital period (yr)
 *  [S2] JPL SSD Approximate Positions of the Planets, Table 1 (1800–2050 AD,
 *       Keplerian elements at J2000 w.r.t. mean ecliptic)
 *       https://ssd.jpl.nasa.gov/planets/approx_pos.html
 *       → a (AU), e, I (deg) for Mercury…Neptune (Earth = EM barycenter value)
 *  [S3] JPL SSD Planetary Satellite Mean Elements / Physical Parameters
 *       https://ssd.jpl.nasa.gov/sats/elem/sep.html
 *       https://ssd.jpl.nasa.gov/sats/phys_par/sep.html
 *       → moon a (km), e, i (deg), P (days), mean radius (km)
 *  [S4] JPL Small-Body Database API (134340 Pluto, orbit solution 1, DE441)
 *       https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=134340
 *       → Pluto a=39.6 AU, e=0.252, i=17.1 deg
 *
 * OrbitalPeriodDays: where the source lists years [S1], days = years × 365.25
 * (Julian year). rotationPeriodHours: source days [S1] × 24. No values are
 * invented here; only unit conversions are applied. Axial tilts are from the
 * IAU/IAG rotational-elements reports cited by [S1] refs [B]/[C] (rounded to
 * 2 decimals) and are visual metadata, not required by the demo's physics.
 */

export type BodyType = "star" | "planet" | "dwarf-planet" | "moon";
export type DistanceUnit = "AU" | "km";

export interface CelestialBodyData {
  /** Stable internal id, e.g. "jupiter", "io". */
  id: string;
  /** JPL Small-Body/Satellite Database SPK-ish id for future Horizons use. */
  jplId: string;
  nameKo: string;
  nameEn: string;
  type: BodyType;
  /** Parent body id (moon → planet/dwarf planet). Sun has no parent. */
  parentId?: string;

  radiusKm: number;
  semiMajorAxis?: number;
  semiMajorAxisUnit?: DistanceUnit;
  eccentricity?: number;
  inclinationDeg?: number;
  orbitalPeriodDays?: number;
  rotationPeriodHours?: number;
  axialTiltDeg?: number;

  displayColor: string;
  description?: string;

  /** Rendering hints (visual metadata, not astronomical data). */
  render?: {
    emissive?: boolean;
    hasRings?: boolean;
    /** Inner/outer ring radii in multiples of the body's RENDERED radius. */
    ringInnerScale?: number;
    ringOuterScale?: number;
    /** Banded atmosphere drawn procedurally (CanvasTexture). */
    banded?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Sun [S1 is planet-only; radius/rotation from NASA Sun facts, see README]
// ---------------------------------------------------------------------------
const SUN: CelestialBodyData = {
  id: "sun",
  jplId: "10",
  nameKo: "태양",
  nameEn: "Sun",
  type: "star",
  radiusKm: 695700, // NASA planetary fact-sheet value (≈1.4M km diameter)
  rotationPeriodHours: 609.1, // 25.38 d equatorial sidereal (NASA: ~25 d equator)
  axialTiltDeg: 7.25,
  displayColor: "#ffd75e",
  description: "태양계 중심 항성. 모든 행성 공전 데이터의 기원.",
  render: { emissive: true },
};

// ---------------------------------------------------------------------------
// Planets + dwarf planet (a/e/I from [S2][S4]; radius/P/rot from [S1])
// ---------------------------------------------------------------------------
const PLANETS: CelestialBodyData[] = [
  {
    id: "mercury",
    jplId: "199",
    nameKo: "수성",
    nameEn: "Mercury",
    type: "planet",
    parentId: "sun",
    radiusKm: 2439.4,
    semiMajorAxis: 0.38709927,
    semiMajorAxisUnit: "AU",
    eccentricity: 0.20563593,
    inclinationDeg: 7.00497902,
    orbitalPeriodDays: 87.9684, // 0.2408467 yr [S1]
    rotationPeriodHours: 1407.51, // 58.6462 d [S1]
    axialTiltDeg: 0.03,
    displayColor: "#8c8378",
    render: {},
  },
  {
    id: "venus",
    jplId: "299",
    nameKo: "금성",
    nameEn: "Venus",
    type: "planet",
    parentId: "sun",
    radiusKm: 6051.8,
    semiMajorAxis: 0.72333566,
    semiMajorAxisUnit: "AU",
    eccentricity: 0.00677672,
    inclinationDeg: 3.39467605,
    orbitalPeriodDays: 224.7005, // 0.61519726 yr [S1]
    rotationPeriodHours: -5832.43, // -243.018 d, retrograde [S1]
    axialTiltDeg: 177.36,
    displayColor: "#d9a066",
    render: { banded: true },
  },
  {
    id: "earth",
    jplId: "399",
    nameKo: "지구",
    nameEn: "Earth",
    type: "planet",
    parentId: "sun",
    radiusKm: 6371.0084,
    semiMajorAxis: 1.00000261, // EM barycenter element [S2]
    semiMajorAxisUnit: "AU",
    eccentricity: 0.01671123,
    inclinationDeg: 0.00001531, // |I| of EM barycenter [S2]
    orbitalPeriodDays: 365.2562, // 1.0000174 yr [S1]
    rotationPeriodHours: 23.9345, // 0.99726968 d [S1]
    axialTiltDeg: 23.44,
    displayColor: "#3b7bd4",
    render: {},
  },
  {
    id: "mars",
    jplId: "499",
    nameKo: "화성",
    nameEn: "Mars",
    type: "planet",
    parentId: "sun",
    radiusKm: 3389.5,
    semiMajorAxis: 1.52371034,
    semiMajorAxisUnit: "AU",
    eccentricity: 0.0933941,
    inclinationDeg: 1.84969142,
    orbitalPeriodDays: 686.9801, // 1.8808476 yr [S1]
    rotationPeriodHours: 24.623, // 1.02595676 d [S1]
    axialTiltDeg: 25.19,
    displayColor: "#c1552e",
    render: {},
  },
  {
    id: "jupiter",
    jplId: "599",
    nameKo: "목성",
    nameEn: "Jupiter",
    type: "planet",
    parentId: "sun",
    radiusKm: 69911,
    semiMajorAxis: 5.202887,
    semiMajorAxisUnit: "AU",
    eccentricity: 0.04838624,
    inclinationDeg: 1.30439695,
    orbitalPeriodDays: 4332.589, // 11.862615 yr [S1]
    rotationPeriodHours: 9.925, // 0.41354 d [S1]
    axialTiltDeg: 3.13,
    displayColor: "#c8a06a",
    render: { banded: true },
  },
  {
    id: "saturn",
    jplId: "699",
    nameKo: "토성",
    nameEn: "Saturn",
    type: "planet",
    parentId: "sun",
    radiusKm: 58232,
    semiMajorAxis: 9.53667594,
    semiMajorAxisUnit: "AU",
    eccentricity: 0.05386179,
    inclinationDeg: 2.48599187,
    orbitalPeriodDays: 10755.696, // 29.447498 yr [S1]
    rotationPeriodHours: 10.656, // 0.44401 d [S1]
    axialTiltDeg: 26.73,
    displayColor: "#e0c586",
    render: { hasRings: true, ringInnerScale: 1.3, ringOuterScale: 2.3, banded: true },
  },
  {
    id: "uranus",
    jplId: "799",
    nameKo: "천왕성",
    nameEn: "Uranus",
    type: "planet",
    parentId: "sun",
    radiusKm: 25362,
    semiMajorAxis: 19.18916464,
    semiMajorAxisUnit: "AU",
    eccentricity: 0.04725744,
    inclinationDeg: 0.77263783,
    orbitalPeriodDays: 30687.144, // 84.016846 yr [S1]
    rotationPeriodHours: -17.24, // -0.71833 d, retrograde [S1]
    axialTiltDeg: 97.77,
    displayColor: "#7fd4d4",
    render: { hasRings: true, ringInnerScale: 1.5, ringOuterScale: 2.0 },
  },
  {
    id: "neptune",
    jplId: "899",
    nameKo: "해왕성",
    nameEn: "Neptune",
    type: "planet",
    parentId: "sun",
    radiusKm: 24622,
    semiMajorAxis: 30.06992276,
    semiMajorAxisUnit: "AU",
    eccentricity: 0.00859048,
    inclinationDeg: 1.77004347,
    orbitalPeriodDays: 60191.553, // 164.79132 yr [S1]
    rotationPeriodHours: 16.11, // 0.67125 d [S1]
    axialTiltDeg: 28.32,
    displayColor: "#3252c8",
    render: { banded: true },
  },
  {
    id: "pluto",
    jplId: "9",
    nameKo: "명왕성",
    nameEn: "Pluto",
    type: "dwarf-planet",
    parentId: "sun",
    radiusKm: 1188.3,
    semiMajorAxis: 39.6, // [S4]
    semiMajorAxisUnit: "AU",
    eccentricity: 0.252, // [S4]
    inclinationDeg: 17.1, // [S4]
    orbitalPeriodDays: 90553.5, // 247.92065 yr [S1]
    rotationPeriodHours: -153.29, // 6.3872 d retrograde (synchronous w/ Charon) [S1]
    axialTiltDeg: 122.53,
    displayColor: "#b9a390",
    render: {},
  },
];

// ---------------------------------------------------------------------------
// Major moons (a/e/i/P from [S3]; radius from [S3] phys-par)
// ---------------------------------------------------------------------------
const MOONS: CelestialBodyData[] = [
  {
    id: "moon",
    jplId: "301",
    nameKo: "달",
    nameEn: "Moon",
    type: "moon",
    parentId: "earth",
    radiusKm: 1737.4,
    semiMajorAxis: 384400,
    semiMajorAxisUnit: "km",
    eccentricity: 0.0554,
    inclinationDeg: 5.16, // vs ecliptic [S3]
    orbitalPeriodDays: 27.322,
    rotationPeriodHours: 655.728, // tidally locked = orbital period [S3]
    displayColor: "#cfc9c2",
  },
  {
    id: "phobos",
    jplId: "401",
    nameKo: "포보스",
    nameEn: "Phobos",
    type: "moon",
    parentId: "mars",
    radiusKm: 11.08,
    semiMajorAxis: 9375,
    semiMajorAxisUnit: "km",
    eccentricity: 0.015,
    inclinationDeg: 1.1,
    orbitalPeriodDays: 0.3187,
    displayColor: "#9a8d80",
  },
  {
    id: "deimos",
    jplId: "402",
    nameKo: "데이모스",
    nameEn: "Deimos",
    type: "moon",
    parentId: "mars",
    radiusKm: 6.2,
    semiMajorAxis: 23457,
    semiMajorAxisUnit: "km",
    eccentricity: 0.0002,
    inclinationDeg: 1.8,
    orbitalPeriodDays: 1.2625,
    displayColor: "#a89c8d",
  },
  {
    id: "io",
    jplId: "501",
    nameKo: "이오",
    nameEn: "Io",
    type: "moon",
    parentId: "jupiter",
    radiusKm: 1821.49,
    semiMajorAxis: 421800,
    semiMajorAxisUnit: "km",
    eccentricity: 0.004,
    inclinationDeg: 0.05,
    orbitalPeriodDays: 1.762732,
    displayColor: "#e6d291",
  },
  {
    id: "europa",
    jplId: "502",
    nameKo: "에우로파",
    nameEn: "Europa",
    type: "moon",
    parentId: "jupiter",
    radiusKm: 1560.8,
    semiMajorAxis: 671100,
    semiMajorAxisUnit: "km",
    eccentricity: 0.009,
    inclinationDeg: 0.47,
    orbitalPeriodDays: 3.525463,
    displayColor: "#d9cbb3",
  },
  {
    id: "ganymede",
    jplId: "503",
    nameKo: "가니메데",
    nameEn: "Ganymede",
    type: "moon",
    parentId: "jupiter",
    radiusKm: 2631.2,
    semiMajorAxis: 1070400,
    semiMajorAxisUnit: "km",
    eccentricity: 0.0013,
    inclinationDeg: 0.2,
    orbitalPeriodDays: 7.155588,
    displayColor: "#a99b8a",
  },
  {
    id: "callisto",
    jplId: "504",
    nameKo: "칼리스토",
    nameEn: "Callisto",
    type: "moon",
    parentId: "jupiter",
    radiusKm: 2410.3,
    semiMajorAxis: 1882700,
    semiMajorAxisUnit: "km",
    eccentricity: 0.0074,
    inclinationDeg: 0.28,
    orbitalPeriodDays: 16.69044,
    displayColor: "#7d7364",
  },
  {
    id: "mimas",
    jplId: "601",
    nameKo: "미마스",
    nameEn: "Mimas",
    type: "moon",
    parentId: "saturn",
    radiusKm: 198.2,
    semiMajorAxis: 186000,
    semiMajorAxisUnit: "km",
    eccentricity: 0.0202,
    inclinationDeg: 1.57,
    orbitalPeriodDays: 0.942422,
    displayColor: "#c8c2b8",
  },
  {
    id: "enceladus",
    jplId: "602",
    nameKo: "엔셀라두스",
    nameEn: "Enceladus",
    type: "moon",
    parentId: "saturn",
    radiusKm: 252.1,
    semiMajorAxis: 238400,
    semiMajorAxisUnit: "km",
    eccentricity: 0.0047,
    inclinationDeg: 0.02,
    orbitalPeriodDays: 1.370218,
    displayColor: "#e9edee",
  },
  {
    id: "tethys",
    jplId: "603",
    nameKo: "테티스",
    nameEn: "Tethys",
    type: "moon",
    parentId: "saturn",
    radiusKm: 531.1,
    semiMajorAxis: 295000,
    semiMajorAxisUnit: "km",
    eccentricity: 0.0008,
    inclinationDeg: 1.12,
    orbitalPeriodDays: 1.887802,
    displayColor: "#d6d2cb",
  },
  {
    id: "dione",
    jplId: "604",
    nameKo: "디오네",
    nameEn: "Dione",
    type: "moon",
    parentId: "saturn",
    radiusKm: 561.4,
    semiMajorAxis: 377700,
    semiMajorAxisUnit: "km",
    eccentricity: 0.0022,
    inclinationDeg: 0.02,
    orbitalPeriodDays: 2.736916,
    displayColor: "#cfcfc8",
  },
  {
    id: "rhea",
    jplId: "605",
    nameKo: "레아",
    nameEn: "Rhea",
    type: "moon",
    parentId: "saturn",
    radiusKm: 763.5,
    semiMajorAxis: 527200,
    semiMajorAxisUnit: "km",
    eccentricity: 0.0013,
    inclinationDeg: 0.35,
    orbitalPeriodDays: 4.517503,
    displayColor: "#c2bdb4",
  },
  {
    id: "titan",
    jplId: "606",
    nameKo: "타이탄",
    nameEn: "Titan",
    type: "moon",
    parentId: "saturn",
    radiusKm: 2574.76,
    semiMajorAxis: 1221900,
    semiMajorAxisUnit: "km",
    eccentricity: 0.0288,
    inclinationDeg: 0.33,
    orbitalPeriodDays: 15.945448,
    displayColor: "#d39a4f",
  },
  {
    id: "iapetus",
    jplId: "608",
    nameKo: "이아페투스",
    nameEn: "Iapetus",
    type: "moon",
    parentId: "saturn",
    radiusKm: 734.3,
    semiMajorAxis: 3561700,
    semiMajorAxisUnit: "km",
    eccentricity: 0.0286,
    inclinationDeg: 15.47, // vs Laplace plane; high inclination is real
    orbitalPeriodDays: 79.331002,
    displayColor: "#8f8577",
  },
  {
    id: "miranda",
    jplId: "705",
    nameKo: "미란다",
    nameEn: "Miranda",
    type: "moon",
    parentId: "uranus",
    radiusKm: 235.8,
    semiMajorAxis: 129846,
    semiMajorAxisUnit: "km",
    eccentricity: 0.0013,
    inclinationDeg: 4.34,
    orbitalPeriodDays: 1.413479,
    displayColor: "#b9bcbe",
  },
  {
    id: "ariel",
    jplId: "701",
    nameKo: "아리엘",
    nameEn: "Ariel",
    type: "moon",
    parentId: "uranus",
    radiusKm: 578.9,
    semiMajorAxis: 190929,
    semiMajorAxisUnit: "km",
    eccentricity: 0.0012,
    inclinationDeg: 0.04,
    orbitalPeriodDays: 2.520379,
    displayColor: "#c4c8ca",
  },
  {
    id: "umbriel",
    jplId: "702",
    nameKo: "엄브리에르",
    nameEn: "Umbriel",
    type: "moon",
    parentId: "uranus",
    radiusKm: 584.7,
    semiMajorAxis: 265986,
    semiMajorAxisUnit: "km",
    eccentricity: 0.0039,
    inclinationDeg: 0.13,
    orbitalPeriodDays: 4.144177,
    displayColor: "#949a9e",
  },
  {
    id: "titania",
    jplId: "703",
    nameKo: "티타니아",
    nameEn: "Titania",
    type: "moon",
    parentId: "uranus",
    radiusKm: 788.9,
    semiMajorAxis: 436298,
    semiMajorAxisUnit: "km",
    eccentricity: 0.0011,
    inclinationDeg: 0.34,
    orbitalPeriodDays: 8.705869,
    displayColor: "#b0aa9e",
  },
  {
    id: "oberon",
    jplId: "704",
    nameKo: "오베론",
    nameEn: "Oberon",
    type: "moon",
    parentId: "uranus",
    radiusKm: 761.4,
    semiMajorAxis: 583511,
    semiMajorAxisUnit: "km",
    eccentricity: 0.0014,
    inclinationDeg: 0.06,
    orbitalPeriodDays: 13.463237,
    displayColor: "#a39a8c",
  },
  {
    id: "triton",
    jplId: "801",
    nameKo: "트리톤",
    nameEn: "Triton",
    type: "moon",
    parentId: "neptune",
    radiusKm: 1352.6,
    semiMajorAxis: 354800,
    semiMajorAxisUnit: "km",
    eccentricity: 0.000016,
    inclinationDeg: 156.885, // retrograde orbit vs Neptune equator [S3]
    orbitalPeriodDays: 5.876994,
    displayColor: "#c9d2d6",
  },
  {
    id: "charon",
    jplId: "901",
    nameKo: "카론",
    nameEn: "Charon",
    type: "moon",
    parentId: "pluto",
    radiusKm: 606,
    semiMajorAxis: 19600,
    semiMajorAxisUnit: "km",
    eccentricity: 0.00022,
    inclinationDeg: 0.1,
    orbitalPeriodDays: 6.387222,
    displayColor: "#9d968b",
  },
  {
    id: "styx",
    jplId: "905",
    nameKo: "스틱스",
    nameEn: "Styx",
    type: "moon",
    parentId: "pluto",
    radiusKm: 5.2,
    semiMajorAxis: 43200,
    semiMajorAxisUnit: "km",
    eccentricity: 0.0059,
    inclinationDeg: 0.81,
    orbitalPeriodDays: 20.1648,
    displayColor: "#b5aea4",
  },
  {
    id: "nix",
    jplId: "902",
    nameKo: "닉스",
    nameEn: "Nix",
    type: "moon",
    parentId: "pluto",
    radiusKm: 18,
    semiMajorAxis: 49300,
    semiMajorAxisUnit: "km",
    eccentricity: 0.0019,
    inclinationDeg: 1.93,
    orbitalPeriodDays: 24.857,
    displayColor: "#c0b8ac",
  },
  {
    id: "kerberos",
    jplId: "904",
    nameKo: "케르베로스",
    nameEn: "Kerberos",
    type: "moon",
    parentId: "pluto",
    radiusKm: 6,
    semiMajorAxis: 58300,
    semiMajorAxisUnit: "km",
    eccentricity: 0.0033,
    inclinationDeg: 0.37,
    orbitalPeriodDays: 32.167,
    displayColor: "#a9a29a",
  },
  {
    id: "hydra",
    jplId: "903",
    nameKo: "히드라",
    nameEn: "Hydra",
    type: "moon",
    parentId: "pluto",
    radiusKm: 18.5,
    semiMajorAxis: 65200,
    semiMajorAxisUnit: "km",
    eccentricity: 0.0042,
    inclinationDeg: 0.41,
    orbitalPeriodDays: 38.198,
    displayColor: "#b8b0a5",
  },
];

export const SOLAR_SYSTEM: readonly CelestialBodyData[] = [SUN, ...PLANETS, ...MOONS];

export const SUN_DATA: CelestialBodyData = SUN;

export function getBodyById(id: string): CelestialBodyData | undefined {
  return SOLAR_SYSTEM.find((b) => b.id === id);
}

export function getChildrenOf(id: string): CelestialBodyData[] {
  return SOLAR_SYSTEM.filter((b) => b.parentId === id);
}

/** Heliocentric bodies (Sun excluded, moons excluded). */
export function getHeliocentricBodies(): CelestialBodyData[] {
  return SOLAR_SYSTEM.filter(
    (b) => b.type === "planet" || b.type === "dwarf-planet",
  );
}

/** Largest stored semi-major axis among planets/dwarf planet — for log mapping. */
export function maxHeliocentricDistanceAU(): number {
  return Math.max(
    ...getHeliocentricBodies().map((b) => b.semiMajorAxis ?? 0),
  );
}
