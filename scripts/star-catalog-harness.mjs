/**
 * Node harness for scripts/star-catalog.test.mjs — transpiles the pure star
 * catalog module (data/starCatalog.ts: no DOM, no three.js; atob is a Node
 * global since v16) with the project's own TypeScript compiler and imports
 * it via a data-URI, rewiring relative imports recursively (same pattern as
 * info-format-harness.mjs). No extra deps.
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
    const dep = await loadTs(path.normalize(path.join(dir, spec + ".ts")));
    js = js.split(`from "${spec}"`).join(`from "${dep}"`);
  }
  const url = "data:text/javascript;base64," + Buffer.from(js).toString("base64");
  cache.set(key, url);
  return url;
}

export const starCatalog = await import(await loadTs("src/data/starCatalog.ts"));
