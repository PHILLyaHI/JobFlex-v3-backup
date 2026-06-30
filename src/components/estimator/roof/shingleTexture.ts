import * as THREE from "three";

// Procedural architectural asphalt-shingle textures (color + bump), generated on
// a canvas so no image assets are needed. EagleView's sandbox reports no roof
// material, so we default to asphalt shingles — ~80% of US homes. Tileable, and
// the 3D viewer scales UVs to real feet so courses read at a believable size.
export function makeShingleTextures(): {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  dispose: () => void;
} {
  const S = 512;
  const COURSES = 12; // 12 courses over the ~6ft tile ≈ 6in exposure
  const TABS = 6; //      6 tabs over ~6ft ≈ 12in tabs
  const ch = S / COURSES;
  const tw = S / TABS;

  const mapC = document.createElement("canvas");
  mapC.width = mapC.height = S;
  const bumpC = document.createElement("canvas");
  bumpC.width = bumpC.height = S;
  const c = mapC.getContext("2d")!;
  const b = bumpC.getContext("2d")!;

  // Weathered-wood / charcoal asphalt tones.
  const tones = ["#6b5d52", "#62554b", "#5a4e45", "#6f6156", "#554a42", "#675a4f", "#4f453d"];
  let seed = 20260626;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed & 1023) / 1023;
  };

  c.fillStyle = "#564b43";
  c.fillRect(0, 0, S, S);
  b.fillStyle = "#888";
  b.fillRect(0, 0, S, S);

  for (let row = 0; row < COURSES; row++) {
    const y = row * ch;
    const offset = (row % 2) * (tw / 2); // stagger alternate courses
    for (let t = -1; t <= TABS; t++) {
      const x = t * tw + offset;
      // Deterministic tone keyed by wrapped tab index → seamless horizontal tiling.
      const tabKey = ((t % TABS) + TABS) % TABS;
      c.fillStyle = tones[(row * 3 + tabKey * 7) % tones.length];
      c.fillRect(x, y, tw - 1.5, ch); // gap = keyway between tabs
      // Granule speckle.
      for (let s = 0; s < 70; s++) {
        c.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.08)";
        c.fillRect(x + rnd() * tw, y + rnd() * ch, 1.4, 1.4);
      }
    }
    // Architectural shadow band along the bottom of each course (dimension).
    const g = c.createLinearGradient(0, y + ch * 0.5, 0, y + ch);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.34)");
    c.fillStyle = g;
    c.fillRect(0, y + ch * 0.5, S, ch * 0.5);

    // Bump: a FLAT course (shingles are flat) with a quick shadow step at the
    // butt edge — not a rounded gradient (which reads as tubes). Dark keyways.
    const bg = b.createLinearGradient(0, y, 0, y + ch);
    bg.addColorStop(0, "#9c9c9c");
    bg.addColorStop(0.8, "#969696");
    bg.addColorStop(0.86, "#7c7c7c");
    bg.addColorStop(0.97, "#525252");
    bg.addColorStop(1, "#4a4a4a");
    b.fillStyle = bg;
    b.fillRect(0, y, S, ch);
    for (let t = -1; t <= TABS; t++) {
      b.fillStyle = "#3f3f3f";
      b.fillRect(t * tw + offset - 1, y, 2, ch);
    }
  }

  const map = new THREE.CanvasTexture(mapC);
  const bump = new THREE.CanvasTexture(bumpC);
  for (const tx of [map, bump]) {
    tx.wrapS = THREE.RepeatWrapping;
    tx.wrapT = THREE.RepeatWrapping;
    tx.anisotropy = 8;
  }
  map.colorSpace = THREE.SRGBColorSpace;
  return {
    map,
    bump,
    dispose: () => {
      map.dispose();
      bump.dispose();
    },
  };
}
