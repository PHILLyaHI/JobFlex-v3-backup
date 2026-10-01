// THE SITE ICONS (2026-10-01) — the JobFlex J, white on an ink tile, drawn from
// the product mark (public/jobflex-mark.png, 2048²). One look everywhere: the
// browser tab, Google's results (light and dark), the home screen.
//
//   node scripts/brand-icons.mjs
//
// Writes (Next's file conventions put the <link> tags in the head itself):
//   src/app/favicon.ico        16, 32, 48 — /favicon.ico, for Google and old browsers
//   src/app/icon.png           512×512   — <link rel="icon" type="image/png" sizes="512x512">
//   src/app/icon1.png          192×192   — a second <link rel="icon">: Google asks for a multiple of 48 px (192 = 4 × 48)
//   src/app/apple-icon.png     180×180   — <link rel="apple-touch-icon" sizes="180x180">
//   public/icons/icon-192.png, icon-512.png, maskable-512.png — the manifest's (app/manifest.ts)
//
// Blueprint: the ink token (#0a0a0a) as the tile, the paper white J, square
// corners, no gradient. The small sizes draw the J larger so it holds at 16 px.
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const INK = "#0a0a0a";
const SRC = "public/jobflex-mark.png";

// The J alone: the mark's alpha, trimmed to the glyph, filled white.
const trimmed = await sharp(SRC).trim().toBuffer({ resolveWithObject: true });
const alpha = await sharp(trimmed.data).extractChannel("alpha").toBuffer();
const glyph = await sharp({ create: { width: trimmed.info.width, height: trimmed.info.height, channels: 3, background: "#ffffff" } })
  .joinChannel(alpha)
  .png()
  .toBuffer();

/** A square tile of `size` px with the J at `fill` of the tile's height, centred. */
async function tile(size, fill) {
  const h = Math.round(size * fill);
  const j = await sharp(glyph).resize({ height: h, kernel: "lanczos3" }).toBuffer({ resolveWithObject: true });
  const left = Math.round((size - j.info.width) / 2);
  const top = Math.round((size - j.info.height) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: INK } })
    .composite([{ input: j.data, left, top }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** One ICO entry as a 32-bit BMP (BITMAPINFOHEADER, BGRA bottom-up, an empty AND mask). */
async function bmpEntry(size, fill) {
  const { data } = await sharp(await tile(size, fill)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rowMask = Math.ceil(size / 32) * 4;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // XOR + AND
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(size * size * 4 + rowMask * size, 20);
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = (y * size + x) * 4;
      const d = ((size - 1 - y) * size + x) * 4;
      pixels[d] = data[s + 2];
      pixels[d + 1] = data[s + 1];
      pixels[d + 2] = data[s];
      pixels[d + 3] = data[s + 3];
    }
  }
  return Buffer.concat([header, pixels, Buffer.alloc(rowMask * size)]);
}

async function ico(entries) {
  const images = await Promise.all(entries.map(([size, fill]) => bmpEntry(size, fill)));
  const dir = Buffer.alloc(6 + 16 * entries.length);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(entries.length, 4);
  let offset = dir.length;
  entries.forEach(([size], i) => {
    const e = 6 + 16 * i;
    dir.writeUInt8(size >= 256 ? 0 : size, e);
    dir.writeUInt8(size >= 256 ? 0 : size, e + 1);
    dir.writeUInt16LE(1, e + 4);
    dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(images[i].length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += images[i].length;
  });
  return Buffer.concat([dir, ...images]);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("src/app/favicon.ico", await ico([[16, 0.8], [32, 0.74], [48, 0.7]]));
writeFileSync("src/app/icon.png", await tile(512, 0.64));
writeFileSync("src/app/icon1.png", await tile(192, 0.64));
writeFileSync("src/app/apple-icon.png", await tile(180, 0.62));
writeFileSync("public/icons/icon-192.png", await tile(192, 0.64));
writeFileSync("public/icons/icon-512.png", await tile(512, 0.64));
// Maskable: the J inside the 80% safe circle the launchers crop to.
writeFileSync("public/icons/maskable-512.png", await tile(512, 0.48));
console.log("icons written");
