// Browser-only. Shrinks a photo before it leaves the phone: a 12 MP camera
// JPEG is 4–8 MB, the upload routes cap at 4 MB decoded and Vercel's request
// body at 4.5 MB, so the picture gets drawn onto a canvas no longer than
// `maxEdge` and re-encoded as JPEG. Anything the browser cannot decode
// (HEIC outside Safari, say) is passed through untouched as a data URL and the
// server decides.

export type DownscaleOptions = { maxEdge?: number; quality?: number };

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read the photo"));
    r.readAsDataURL(file);
  });
}

export async function downscaleImage(file: File, opts: DownscaleOptions = {}): Promise<string> {
  const maxEdge = opts.maxEdge ?? 1600;
  const quality = opts.quality ?? 0.85;
  if (typeof document === "undefined") return fileToDataUrl(file);

  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await decode(file);
  } catch {
    return fileToDataUrl(file);
  }
  const w = "naturalWidth" in bitmap ? bitmap.naturalWidth : bitmap.width;
  const h = "naturalHeight" in bitmap ? bitmap.naturalHeight : bitmap.height;
  if (!w || !h) return fileToDataUrl(file);

  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return fileToDataUrl(file);
  ctx.drawImage(bitmap, 0, 0, cw, ch);
  if ("close" in bitmap) bitmap.close();
  try {
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return fileToDataUrl(file);
  }
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    // imageOrientation honours the EXIF rotation a phone camera writes.
    return createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
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
