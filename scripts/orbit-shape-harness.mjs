/**
 * Node harness for scripts/orbit-shape.test.mjs — loads the REAL scale/render
 * stack (Kepler.ts, simMath.ts, ScaleManager.ts, bodyIdentity.ts,
 * OrbitRenderer.ts, CelestialBody.ts) under Node by transpiling with the
 * project's own TypeScript compiler, recursively rewiring every relative
 * import to a data-URI module, and pinning the bare `three` specifier to the
 * absolute ESM build file (data-URI modules cannot resolve bare specifiers;
 * three.module.js has no DOM requirements at import time — Vector3,
 * MathUtils, BufferGeometry and LineLoop all construct fine in Node).
 *
 * Same pattern as sim-time-harness.mjs / body-identity-harness.mjs, extended
 * to the three.js-touching classes so line-vs-body consistency is tested on
 * the ACTUAL OrbitRenderer/CelestialBody code, not a reimplementation.
 * No extra test-only deps.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
// data:-URI modules cannot resolve bare specifiers OR absolute paths — the
// only portable specifier is a file: URL (three.module.js then resolves its
// own ./three.core.js normally).
const THREE_ABS = path.resolve(root, "node_modules/three/build/three.module.js");
const THREE_URL = pathToFileURL(THREE_ABS).href;

const cache = new Map();

/** Transpile src-relative TS and recursively resolve its imports. */
async function loadTs(rel) {
  const key = path.normalize(rel);
  if (cache.has(key)) return cache.get(key);
  const source = readFileSync(path.join(root, key), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  // Resolve every relative import against THIS module's directory.
  const dir = path.dirname(key);
  const specifiers = [...outputText.matchAll(/from\s+"(\.[^"]*)"/g)].map((m) => m[1]);
  let js = outputText.replace(/from\s+"three"/g, `from "${THREE_URL}"`);
  for (const spec of new Set(specifiers)) {
    const depRel = path.normalize(path.join(dir, spec + ".ts"));
    const dep = await loadTs(depRel);
    js = js.split(`from "${spec}"`).join(`from "${dep}"`);
  }
  const url = "data:text/javascript;base64," + Buffer.from(js).toString("base64");
  cache.set(key, url);
  return url;
}

export const three = await import(THREE_URL);
export const kepler = await import(await loadTs("src/core/Kepler.ts"));
export const simMath = await import(await loadTs("src/core/simMath.ts"));
export const data = await import(await loadTs("src/data/solarSystemData.ts"));
export const scaleMod = await import(await loadTs("src/core/ScaleManager.ts"));
export const orbitMod = await import(await loadTs("src/core/OrbitRenderer.ts"));
export const bodyMod = await import(await loadTs("src/core/CelestialBody.ts"));
