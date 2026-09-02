#!/usr/bin/env node
/**
 * Build the fully self-contained single-file app: the vite bundle plus every
 * surface texture inlined as a data URI. The page injects the textures via
 * window.__QW_TEXTURE_DATA, which src/core/textures.ts checks before falling
 * back to the textures/ directory — so the SAME bundle works hosted (dist/)
 * and as one offline HTML file that opens straight from disk (file://).
 *
 * Run AFTER `npm run build` (reads dist/assets). If `sharp` is importable
 * (the release workflow installs it), JPEG textures are downscaled to
 * ≤1024 px at quality 72, keeping the file around 3 MB; without sharp the
 * full-resolution files are inlined (~17 MB) — same app either way.
 *
 * Usage: node scripts/build-single-file.mjs [outFile]
 *        (default outFile: release/solar-system-single-file.html)
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2] ?? "release/solar-system-single-file.html";
const DIST = "dist";
const TEX_DIR = path.join("public", "textures");

let sharp = null;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.log("note: `sharp` not available — inlining textures at full resolution");
}

let jsFile;
let cssFile;
try {
  const assets = readdirSync(path.join(DIST, "assets"));
  jsFile = assets.find((f) => f.endsWith(".js"));
  cssFile = assets.find((f) => f.endsWith(".css"));
} catch {
  /* fall through to the guard below */
}
if (!jsFile || !cssFile) {
  console.error("error: dist/assets is missing — run `npm run build` first");
  process.exit(1);
}

const js = readFileSync(path.join(DIST, "assets", jsFile), "utf8");
const css = readFileSync(path.join(DIST, "assets", cssFile), "utf8");
// An inline <script> ends at the first literal `</script`; the bundle must
// not contain one or the page would truncate silently.
if (js.includes("</scr" + "ipt")) {
  console.error("error: bundle contains a literal </scr" + "ipt> sequence");
  process.exit(1);
}

const textures = {};
for (const f of readdirSync(TEX_DIR).filter((f) => /\.(jpg|png)$/.test(f))) {
  const file = path.join(TEX_DIR, f);
  let buf;
  let mime;
  if (f.endsWith(".png") || !sharp) {
    buf = readFileSync(file); // ring alpha strip stays PNG; no-sharp fallback
    mime = f.endsWith(".png") ? "image/png" : "image/jpeg";
  } else {
    buf = await sharp(file)
      .resize({ width: 1024, withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toBuffer();
    mime = "image/jpeg";
  }
  textures[f] = `data:${mime};base64,${buf.toString("base64")}`;
}

const html =
  '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
  "<title>Logarithmic Solar System</title>\n" +
  "<!-- Self-contained build. Surface textures: NASA imagery (public domain)\n" +
  "     + Solar System Scope texture pack (CC BY 4.0) — full credits in\n" +
  "     public/textures/ATTRIBUTION.md of the source repository. -->\n" +
  "<style>\n" + css + "\n</style>\n</head>\n<body>\n" +
  '<div id="viewport"></div>\n' +
  "<script>window.__QW_TEXTURE_DATA = " + JSON.stringify(textures) + ";</" + "script>\n" +
  '<script type="module">\n' + js + "\n</" + "script>\n</body>\n</html>\n";

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
const mb = (statSync(OUT).size / 1048576).toFixed(2);
console.log(`wrote ${OUT} (${mb} MB, ${Object.keys(textures).length} textures inlined)`);
