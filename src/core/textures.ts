/**
 * textures.ts — the ONE place render code resolves and loads photo textures
 * (data/bodyTextures.ts says WHICH file a body uses; this says WHERE it is
 * and HOW it loads). Loading is always asynchronous and always optional:
 * bodies keep their procedural look until a map decodes, and keep it forever
 * if the file is missing or unreachable — a texture can improve the scene
 * but never break it.
 */
import * as THREE from "three";

declare global {
  interface Window {
    /**
     * Single-file / offline builds inline every texture as a data URI here
     * (file name → data URI) BEFORE the bundle runs; when present it wins
     * over the on-disk textures/ directory, so the exact same bundle works
     * hosted (dist/textures/*) and as one self-contained HTML file.
     */
    __QW_TEXTURE_DATA?: Record<string, string>;
  }
}

/** Resolve a texture file name to a loadable URL (inline data URI wins). */
export function textureUrl(file: string): string {
  const inline =
    typeof window !== "undefined" ? window.__QW_TEXTURE_DATA?.[file] : undefined;
  return inline ?? `${import.meta.env.BASE_URL}textures/${file}`;
}

const loader = new THREE.TextureLoader();

/**
 * Load a color texture; onLoad fires only on success with colorSpace set.
 * Failure is silent by design (the procedural fallback simply stays).
 */
export function loadColorTexture(
  file: string,
  onLoad: (tex: THREE.Texture) => void,
): void {
  loader.load(
    textureUrl(file),
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      onLoad(tex);
    },
    undefined,
    () => {
      /* missing/unreachable file → keep the procedural look */
    },
  );
}
