/**
 * bodyTextures.ts — real photographic surface maps (equirectangular) for the
 * bodies that have them, keyed by body id. Files live in public/textures/
 * and ship with the static build; bodies absent from this map keep their
 * procedural look (Pluto's four small moons have never been imaged beyond a
 * few pixels, so no real map exists for them).
 *
 * Sources (see public/textures/ATTRIBUTION.md for the full credits):
 *  - Sun, Mercury, Venus (cloud layer), Mars, Jupiter, Saturn (+ring),
 *    Uranus, Neptune: Solar System Scope texture pack (CC BY 4.0, based on
 *    NASA elevation and imagery data).
 *  - Earth: NASA Blue Marble (Visible Earth, land_ocean_ice).
 *  - Moon: NASA LRO LROC WAC global mosaic.
 *  - All other moons, Pluto and Charon: NASA mission mosaics (Galileo,
 *    Voyager, Cassini, Viking, New Horizons) distributed via the NOAA
 *    Science On a Sphere catalog. NASA imagery is in the public domain.
 */

/** Body id → texture file name under public/textures/. */
export const BODY_TEXTURE_FILES: Readonly<Record<string, string>> = {
  sun: "sun.jpg",
  mercury: "mercury.jpg",
  venus: "venus.jpg",
  earth: "earth.jpg",
  mars: "mars.jpg",
  jupiter: "jupiter.jpg",
  saturn: "saturn.jpg",
  uranus: "uranus.jpg",
  neptune: "neptune.jpg",
  pluto: "pluto.jpg",
  moon: "moon.jpg",
  phobos: "phobos.jpg",
  deimos: "deimos.jpg",
  io: "io.jpg",
  europa: "europa.jpg",
  ganymede: "ganymede.jpg",
  callisto: "callisto.jpg",
  mimas: "mimas.jpg",
  enceladus: "enceladus.jpg",
  tethys: "tethys.jpg",
  dione: "dione.jpg",
  rhea: "rhea.jpg",
  titan: "titan.jpg",
  iapetus: "iapetus.jpg",
  miranda: "miranda.jpg",
  ariel: "ariel.jpg",
  umbriel: "umbriel.jpg",
  titania: "titania.jpg",
  oberon: "oberon.jpg",
  triton: "triton.jpg",
  charon: "charon.jpg",
};

/** Planet id → ring texture (radial strip: u = inner→outer, straight alpha). */
export const RING_TEXTURE_FILES: Readonly<Record<string, string>> = {
  saturn: "saturn_ring.png",
};
