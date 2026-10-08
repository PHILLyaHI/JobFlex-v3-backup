// Browser-only. The one rule for a company logo, shared by every place that
// uploads one (Company desktop, Company mobile, the classic LogoDropzone).
//
// The stored value stays what it always was — a data URL in
// `Organization.logoUrl` — so the file is made small HERE, before it leaves the
// browser: a phone photo or a 6000 px export is drawn onto a canvas no longer
// than 1024 px and re-encoded, and the result is held under 1 MB. That keeps
// the server action far below `serverActions.bodySizeLimit` and the row small
// enough to ship inside every page and email that shows the logo.
//
//   · PNG, JPG, WebP or SVG, up to 15 MB as picked.
//   · Raster: longest side ≤ 1024 px, never enlarged, aspect kept, EXIF
//     rotation applied. PNG stays PNG, WebP stays WebP (both keep alpha), JPG
//     stays JPG at 0.9.
//   · Over 1 MB after that: step down (768 px, lower quality, WebP, and JPG
//     only when the picture has no transparency) until it fits.
//   · SVG is not rasterised; it is taken as is up to 1 MB.
//   · HEIC and anything else the browser can't decode → a plain message.

export const LOGO_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const LOGO_MAX_SVG_BYTES = 1024 * 1024;
/** Ceiling for the data URL that reaches the database (raster results). */
export const LOGO_MAX_STORED_BYTES = 1024 * 1024;
export const LOGO_MAX_EDGE = 1024;

export const LOGO_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg";
export const LOGO_HINT = "PNG, JPG, WebP or SVG up to 15 MB";

const MSG_NOT_IMAGE = "Image files only";
const MSG_FORMAT = "Use PNG, JPG, WebP or SVG";
const MSG_TOO_LARGE = "Too large — keep it under 15 MB";
const MSG_SVG_TOO_LARGE = "SVG too large — keep it under 1 MB";
const MSG_NO_FIT = "Couldn’t get this logo under 1 MB — try a simpler file";

/** A refusal with a message that is safe to show as is. */
export class LogoFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LogoFileError";
  }
}

type Kind = "png" | "jpeg" | "webp" | "svg";

const BY_MIME: Record<string, Kind> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/pjpeg": "jpeg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const BY_EXT: Record<string, Kind> = { png: "png", jpg: "jpeg", jpeg: "jpeg", webp: "webp", svg: "svg" };
// Image extensions we recognise but don't take, so a picker that reports no
// MIME type (some Windows drags, some Android galleries) still gets the
// "use PNG…" answer rather than "image files only".
const OTHER_IMAGE_EXT = /^(heic|heif|avif|gif|bmp|tif|tiff|ico|jxl|raw|dng|cr2|nef|psd)$/;

function kindOf(file: File): Kind | "other-image" | "not-image" {
  const mime = file.type.toLowerCase();
  if (BY_MIME[mime]) return BY_MIME[mime];
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (mime.startsWith("image/")) return BY_EXT[ext] ?? "other-image";
  if (!mime || mime === "application/octet-stream") {
    if (BY_EXT[ext]) return BY_EXT[ext];
    if (OTHER_IMAGE_EXT.test(ext)) return "other-image";
  }
  return "not-image";
}

export type PrepareLogoOptions = {
  /** Longest side for raster output. Default 1024. */
  maxEdge?: number;
};

/**
 * Validate and shrink a picked logo file. Resolves to the data URL to store;
 * rejects with a {@link LogoFileError} whose message is meant for the user.
 */
export async function prepareLogo(file: File, opts: PrepareLogoOptions = {}): Promise<string> {
  const kind = kindOf(file);
  if (kind === "not-image") throw new LogoFileError(MSG_NOT_IMAGE);
  if (kind === "other-image") throw new LogoFileError(MSG_FORMAT);
  if (file.size > LOGO_MAX_FILE_BYTES) throw new LogoFileError(MSG_TOO_LARGE);

  if (kind === "svg") {
    if (file.size > LOGO_MAX_SVG_BYTES) throw new LogoFileError(MSG_SVG_TOO_LARGE);
    const text = await file.text().catch(() => "");
    if (!/<svg[\s>]/i.test(text)) throw new LogoFileError(MSG_FORMAT);
    return "data:image/svg+xml;base64," + base64Utf8(text);
  }

  const source = await decode(file).catch(() => null);
  if (!source) throw new LogoFileError(MSG_FORMAT);
  try {
    return encodeRaster(source, kind, opts.maxEdge ?? LOGO_MAX_EDGE);
  } finally {
    if ("close" in source) source.close();
  }
}

/** Draw `source` at each rung of the ladder until a result fits the ceiling. */
function encodeRaster(source: ImageBitmap | HTMLImageElement, kind: Exclude<Kind, "svg">, maxEdge: number): string {
  const w = "naturalWidth" in source ? source.naturalWidth : source.width;
  const h = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (!w || !h) throw new LogoFileError(MSG_FORMAT);

  const canvases = new Map<number, HTMLCanvasElement>();
  const at = (edge: number) => {
    let c = canvases.get(edge);
    if (!c) {
      c = drawScaled(source, w, h, edge);
      canvases.set(edge, c);
    }
    return c;
  };
  // The steps down: full, ¾ (768 for a 1024 logo), ½, ⅜.
  const e1 = maxEdge;
  const e2 = Math.round(maxEdge * 0.75);
  const e3 = Math.round(maxEdge / 2);
  const e4 = Math.round(maxEdge * 0.375);

  // Transparency only matters to whether a JPG fallback is allowed.
  const alpha = kind !== "jpeg" && hasAlpha(at(e1));

  type Rung = [edge: number, mime: string, quality?: number];
  const ladder: Rung[] =
    kind === "jpeg"
      ? [[e1, "image/jpeg", 0.9], [e1, "image/jpeg", 0.8], [e2, "image/jpeg", 0.8], [e2, "image/jpeg", 0.65], [e3, "image/jpeg", 0.7]]
      : kind === "webp"
        ? [[e1, "image/webp", 0.9], [e1, "image/webp", 0.8], [e2, "image/webp", 0.8], [e2, "image/webp", 0.65], [e3, "image/webp", 0.7], [e2, "image/png"], [e3, "image/png"]]
        : [[e1, "image/png"], [e2, "image/png"], [e1, "image/webp", 0.92], [e2, "image/webp", 0.85], [e3, "image/png"], [e3, "image/webp", 0.8], [e4, "image/png"]];
  if (!alpha && kind !== "jpeg") ladder.push([e1, "image/jpeg", 0.9], [e2, "image/jpeg", 0.8], [e3, "image/jpeg", 0.75]);

  for (const [edge, mime, quality] of ladder) {
    let url: string;
    try {
      url = at(edge).toDataURL(mime, quality);
    } catch {
      continue;
    }
    // A browser that can't encode the asked type silently hands back PNG;
    // that rung is then a repeat of a PNG one, so skip it.
    if (!url.startsWith("data:" + mime)) continue;
    if (url.length <= LOGO_MAX_STORED_BYTES) return url;
  }
  throw new LogoFileError(MSG_NO_FIT);
}

/**
 * Longest side → `edge` (never enlarged). Halves in steps first so a 6000 px
 * source doesn't alias when it lands at 1024.
 */
function drawScaled(source: CanvasImageSource, w: number, h: number, edge: number): HTMLCanvasElement {
  const scale = Math.min(1, edge / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  let cur: CanvasImageSource = source;
  let cw = w;
  let ch = h;
  while (cw / 2 >= tw && ch / 2 >= th) {
    const step = document.createElement("canvas");
    step.width = Math.round(cw / 2);
    step.height = Math.round(ch / 2);
    const sctx = step.getContext("2d");
    if (!sctx) break;
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(cur, 0, 0, step.width, step.height);
    cur = step;
    cw = step.width;
    ch = step.height;
  }

  const out = document.createElement("canvas");
  out.width = tw;
  out.height = th;
  const ctx = out.getContext("2d");
  if (!ctx) throw new LogoFileError(MSG_FORMAT);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cur, 0, 0, tw, th);
  return out;
}

function hasAlpha(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return true;
  try {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
    return false;
  } catch {
    return true; // unknown → keep the alpha-safe formats
  }
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // imageOrientation applies the EXIF rotation a phone camera writes.
      return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      // fall through to <img>, which some browsers decode more widely
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function base64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
