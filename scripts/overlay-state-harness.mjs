/**
 * Node harness for scripts/overlay-state.test.mjs — transpiles overlayState.ts
 * with the project's own TypeScript compiler (devDependency) and imports it
 * as an ESM module. No extra test-only deps.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const here = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(here, "../src/ui/overlayState.ts");
const source = readFileSync(srcPath, "utf8");

const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});

const url = "data:text/javascript;base64," + Buffer.from(outputText).toString("base64");
export const mod = await import(url);
