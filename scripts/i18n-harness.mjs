/**
 * Node harness for scripts/i18n-parity.test.mjs — transpiles the PURE
 * language-state module (src/ui/i18n.ts; window.localStorage is only touched
 * inside functions, so importing in Node is safe) with the project's own
 * TypeScript compiler and imports it via a data-URI (same pattern as
 * info-format-harness.mjs). No extra deps.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const here = path.dirname(fileURLToPath(import.meta.url));

function transpile(rel) {
  const source = readFileSync(path.join(here, "..", rel), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return "data:text/javascript;base64," + Buffer.from(outputText).toString("base64");
}

export const i18n = await import(transpile("src/ui/i18n.ts"));

/**
 * Install a scripted window.localStorage stub BEFORE calling load/save.
 * mode: "ok" (in-memory), "empty" (no stored value), "throw" (private mode /
 * storage disabled), or a fixed string value. Returns dispose() to unset.
 */
export function installStorage(mode) {
  const store = new Map();
  if (typeof mode === "string") store.set(i18n.LANGUAGE_STORAGE_KEY, mode);
  const storage =
    mode === "throw"
      ? {
          getItem() {
            throw new Error("SecurityError: storage access denied");
          },
          setItem() {
            throw new Error("SecurityError: storage access denied");
          },
        }
      : {
          getItem: (k) => (store.has(k) ? store.get(k) : null),
          setItem: (k, v) => void store.set(k, String(v)),
        };
  globalThis.window = { localStorage: storage };
  return {
    store,
    dispose() {
      delete globalThis.window;
    },
  };
}
