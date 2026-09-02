#!/usr/bin/env node
/**
 * Regenerate src/data/starCatalogData.ts from the Yale Bright Star
 * Catalogue, 5th Revised Ed. (Hoffleit & Warren 1991) — the ~9,100 stars
 * visible to the naked eye. Public-domain data, distributed by the CDS
 * (VizieR catalog V/50): https://cdsarc.cds.unistra.fr/viz-bin/cat/V/50
 *
 * Every entry with valid J2000 coordinates and a V magnitude is kept and
 * packed as four little-endian arrays, base64-encoded:
 *   Uint16 raDeg×100 · Int16 decDeg×100 · Int16 Vmag×100 · Int16 B-V×100
 * (0.01° ≈ 36″ — far below a rendered point's angular size. A missing B-V
 * is stored as the sentinel 32767; the decoder substitutes a neutral tint.)
 *
 * Usage: node scripts/build-star-catalog.mjs [catalogFile]
 *   With no argument the catalog is downloaded from the CDS mirror.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const CDS_URL = "https://cdsarc.cds.unistra.fr/ftp/V/50/catalog.gz";
const OUT = "src/data/starCatalogData.ts";
const BV_MISSING = 32767;

let text;
if (process.argv[2]) {
  const raw = readFileSync(process.argv[2]);
  text = (process.argv[2].endsWith(".gz") ? gunzipSync(raw) : raw).toString("latin1");
} else {
  console.log(`downloading ${CDS_URL} …`);
  const res = await fetch(CDS_URL);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  text = gunzipSync(Buffer.from(await res.arrayBuffer())).toString("latin1");
}

/** Fixed-width field helper (1-based inclusive byte positions, per ReadMe). */
const field = (line, from, to) => line.slice(from - 1, to).trim();

const stars = [];
for (const line of text.split("\n")) {
  if (line.length < 107) continue;
  const raH = field(line, 76, 77);
  const vmag = field(line, 103, 107);
  if (raH === "" || vmag === "") continue; // novae/objects without J2000/V
  const ra =
    (Number(raH) + Number(field(line, 78, 79)) / 60 + Number(field(line, 80, 83)) / 3600) * 15;
  const decSign = field(line, 84, 84) === "-" ? -1 : 1;
  const dec =
    decSign *
    (Number(field(line, 85, 86)) +
      Number(field(line, 87, 88)) / 60 +
      Number(field(line, 89, 90)) / 3600);
  const bvRaw = field(line, 110, 114);
  stars.push({
    ra: Math.round(ra * 100) % 36000,
    dec: Math.round(dec * 100),
    mag: Math.round(Number(vmag) * 100),
    bv: bvRaw === "" ? BV_MISSING : Math.round(Number(bvRaw) * 100),
  });
}

const n = stars.length;
const buf = new ArrayBuffer(n * 8);
const ra = new Uint16Array(buf, 0, n);
const dec = new Int16Array(buf, n * 2, n);
const mag = new Int16Array(buf, n * 4, n);
const bv = new Int16Array(buf, n * 6, n);
stars.forEach((s, i) => {
  ra[i] = s.ra;
  dec[i] = s.dec;
  mag[i] = s.mag;
  bv[i] = s.bv;
});
const b64 = Buffer.from(buf).toString("base64");

writeFileSync(
  OUT,
  `/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate with: node scripts/build-star-catalog.mjs
 *
 * Yale Bright Star Catalogue, 5th Revised Ed. (Hoffleit & Warren 1991),
 * ${n} stars with J2000 coordinates and V magnitude. Public-domain data
 * via CDS VizieR catalog V/50. Packing (little-endian, base64):
 * Uint16 raDeg×100 · Int16 decDeg×100 · Int16 Vmag×100 · Int16 B-V×100
 * (B-V sentinel ${BV_MISSING} = not measured). Decoder: data/starCatalog.ts.
 */

export const STAR_COUNT = ${n};

export const BV_MISSING_SENTINEL = ${BV_MISSING};

export const STAR_DATA_B64 =
${JSON.stringify(b64).replace(/(.{100})/g, "$1\" +\n  \"")};
`,
);
console.log(`wrote ${OUT}: ${n} stars, ${(b64.length / 1024).toFixed(0)} KB base64`);
