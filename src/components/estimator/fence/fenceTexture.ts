// Procedural fence-surface textures generated on a canvas — no image assets,
// mirroring the roof estimator's shingleTexture approach. Phase 1 ships real
// cedar + vinyl; the other three materials use a tuned solid-colour PBR fallback
// (chain-link's diamond alpha-mesh and the rest land in Phase 3).
import * as THREE from "three";
import type { FenceMaterial } from "./fenceTypes";

export interface FenceMaterialTextures {
  map: THREE.CanvasTexture | null;
  bump: THREE.CanvasTexture | null;
  color: number;
  roughness: number;
  metalness: number;
  dispose: () => void;
}

// Deterministic LCG so a material always looks identical across renders/sessions.
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function makeCanvas(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return c;
}

function solid(color: number, roughness: number, metalness: number): FenceMaterialTextures {
  return { map: null, bump: null, color, roughness, metalness, dispose: () => {} };
}

function cedar(): FenceMaterialTextures {
  const size = 256;
  const map = makeCanvas(size);
  const bump = makeCanvas(size);
  const mctx = map.getContext("2d");
  const bctx = bump.getContext("2d");
  if (!mctx || !bctx) return solid(0xb07a47, 0.82, 0);
  const rnd = lcg(20260626);

  mctx.fillStyle = "#b07a47";
  mctx.fillRect(0, 0, size, size);
  bctx.fillStyle = "#808080";
  bctx.fillRect(0, 0, size, size);

  // Vertical grain streaks (the board runs top-to-bottom on each picket face).
  for (let i = 0; i < 220; i++) {
    const x = Math.floor(rnd() * size);
    const w = 1 + Math.floor(rnd() * 2);
    const a = 0.04 + rnd() * 0.1;
    const dark = rnd() > 0.5;
    mctx.fillStyle = dark ? `rgba(60,35,15,${a})` : `rgba(228,184,134,${a})`;
    mctx.fillRect(x, 0, w, size);
    const b = dark ? 105 : 155;
    bctx.fillStyle = `rgba(${b},${b},${b},${Math.min(1, a * 2)})`;
    bctx.fillRect(x, 0, w, size);
  }

  // A couple of soft knots.
  for (let k = 0; k < 2; k++) {
    const cx = rnd() * size;
    const cy = rnd() * size;
    const r = 4 + rnd() * 5;
    const g = mctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, "rgba(70,40,18,0.5)");
    g.addColorStop(1, "rgba(70,40,18,0)");
    mctx.fillStyle = g;
    mctx.beginPath();
    mctx.arc(cx, cy, r, 0, Math.PI * 2);
    mctx.fill();
  }

  // Edge seams so adjacent boards read as separate planks.
  mctx.fillStyle = "rgba(40,22,8,0.35)";
  mctx.fillRect(0, 0, 3, size);
  mctx.fillRect(size - 3, 0, 3, size);

  const mt = new THREE.CanvasTexture(map);
  const bt = new THREE.CanvasTexture(bump);
  mt.colorSpace = THREE.SRGBColorSpace;
  for (const t of [mt, bt]) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  return {
    map: mt,
    bump: bt,
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0,
    dispose: () => {
      mt.dispose();
      bt.dispose();
    },
  };
}

function vinyl(): FenceMaterialTextures {
  const size = 256;
  const map = makeCanvas(size);
  const ctx = map.getContext("2d");
  if (!ctx) return solid(0xeef0ee, 0.35, 0);

  ctx.fillStyle = "#eef0ee";
  ctx.fillRect(0, 0, size, size);
  // Faint tongue-and-groove seams down the panel.
  ctx.fillStyle = "rgba(168,176,170,0.5)";
  ctx.fillRect(0, 0, 2, size);
  ctx.fillRect(Math.floor(size * 0.5), 0, 2, size);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillRect(3, 0, 1, size);
  ctx.fillRect(Math.floor(size * 0.5) + 3, 0, 1, size);

  const mt = new THREE.CanvasTexture(map);
  mt.colorSpace = THREE.SRGBColorSpace;
  mt.wrapS = THREE.RepeatWrapping;
  mt.wrapT = THREE.RepeatWrapping;
  return { map: mt, bump: null, color: 0xffffff, roughness: 0.35, metalness: 0, dispose: () => mt.dispose() };
}

export function makeFenceTextures(material: FenceMaterial): FenceMaterialTextures {
  switch (material) {
    case "cedar":
      return cedar();
    case "vinyl":
      return vinyl();
    case "chain-link":
      // Posts/rails get a galvanised-metal look; the diamond mesh infill is a
      // separate alpha texture (makeChainLinkAlpha) applied per run by the viewer.
      return solid(0x9aa0a6, 0.5, 0.6);
    case "aluminum":
      return solid(0x2c3036, 0.4, 0.7);
    case "composite":
      return solid(0x6f6a60, 0.7, 0.05);
  }
}

// Alpha texture for chain-link infill: white diamond wire on black (transparent)
// holes, used as a MeshStandardMaterial.alphaMap with alphaTest. Tileable.
export function makeChainLinkAlpha(): THREE.CanvasTexture {
  const size = 128;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = size * 0.07;
    ctx.lineCap = "round";
    const gap = size / 4;
    for (let o = -size; o <= size * 2; o += gap) {
      ctx.beginPath();
      ctx.moveTo(o, 0);
      ctx.lineTo(o + size, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(o, size);
      ctx.lineTo(o + size, 0);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
