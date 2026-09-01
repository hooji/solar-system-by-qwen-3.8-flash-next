/**
 * Node harness for scripts/sim-time.test.mjs — transpiles the PURE math
 * modules (Kepler.ts, simMath.ts, SimulationClock.ts) with the project's own
 * TypeScript compiler and imports them as ESM modules. SimulationClock
 * carries i18n KEYS for its speed presets (t_292b0645) and therefore imports
 * ui/i18n.ts — pure too (window.localStorage is only touched inside
 * functions) — so every relative import is rewired to a transpiled data-URI
 * module (same recursive pattern as orbit-shape-harness.mjs). These modules
 * have no three.js / DOM dependencies, so they load and run directly under
 * Node. No extra test-only deps.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const cache = new Map();

/** Transpile src-relative TS and recursively resolve its relative imports. */
async function loadTs(rel) {
  const key = path.normalize(rel);
  if (cache.has(key)) return cache.get(key);
  const source = readFileSync(path.join(root, key), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const dir = path.dirname(key);
  const specifiers = [...outputText.matchAll(/from\s+"(\.[^"]*)"/g)].map((m) => m[1]);
  let js = outputText;
  for (const spec of new Set(specifiers)) {
    const depRel = path.normalize(path.join(dir, spec + ".ts"));
    const dep = await loadTs(depRel);
    js = js.split(`from "${spec}"`).join(`from "${dep}"`);
  }
  const url = "data:text/javascript;base64," + Buffer.from(js).toString("base64");
  cache.set(key, url);
  return url;
}

export const kepler = await import(await loadTs("src/core/Kepler.ts"));
export const simMath = await import(await loadTs("src/core/simMath.ts"));
export const clockMod = await import(await loadTs("src/core/SimulationClock.ts"));
export const i18n = await import(await loadTs("src/ui/i18n.ts"));
