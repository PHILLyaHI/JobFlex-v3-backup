/* A RECEIPT PHOTO, MADE SENDABLE — client side, before it leaves the browser.
 *
 * The receipt reader used to send the picked file to the server as-is, as a
 * base64 data URL: a 4 MB phone JPEG became a 5.4 MB request. That is over
 * Vercel's 4.5 MB request ceiling on production and close to the 8 MB server
 * action limit in dev, so the owner's Home Depot photo never reached the
 * model and the page said nothing useful (2026-09-19). And an iPhone's HEIC,
 * which the picker accepted, is a format the vision model does not take.
 *
 * So the browser does what a phone does before it emails a picture: decode
 * the file, turn it the right way up, scale the long edge to RECEIPT_MAX_EDGE
 * and re-encode as JPEG, stepping the quality down until the payload is
 * under RECEIPT_MAX_UPLOAD_BYTES. A receipt is text on paper; 2000px on the
 * long edge reads every line a phone camera captured, at a tenth of the
 * bytes. HEIC decodes where the browser can (Safari) and is refused with a
 * plain sentence where it cannot — never silently.
 *
 * Every refusal is a ReceiptImageError whose message is written for the
 * contractor, so a caller shows it as-is.
 */

export class ReceiptImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptImageError";
  }
}

export interface PreparedReceipt {
  /** `data:image/jpeg;base64,…` — what goes to scanReceipt / saveReceiptExpense. */
  dataUrl: string;
  /** The original name with a .jpg extension, for the blob key. */
  filename: string;
  width: number;
  height: number;
  /** Bytes of the JPEG (not of the data URL). */
  bytes: number;
  original: { type: string; bytes: number };
}

/** Bigger than any phone photo; a guard against a mis-pick, not a policy. */
export const RECEIPT_MAX_SOURCE_BYTES = 25 * 1024 * 1024;
/** Long edge after scaling — a receipt's print is legible well below this. */
export const RECEIPT_MAX_EDGE = 2000;
/** Under the 4.5 MB request ceiling once base64 adds a third. */
export const RECEIPT_MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

const HEIC_TYPE = /^image\/hei[cf]$/i;
const HEIC_EXT = /\.hei[cf]$/i;

/** True for an iPhone's HEIC/HEIF, by type or — Windows and Linux leave the type empty — by extension. */
export function isHeicFile(file: { type: string; name: string }): boolean {
  return HEIC_TYPE.test(file.type) || HEIC_EXT.test(file.name);
}

/** True when the browser says it is an image, or the name does when the browser says nothing. */
export function looksLikeImage(file: { type: string; name: string }): boolean {
  if (file.type) return /^image\//i.test(file.type);
  return /\.(jpe?g|png|webp|gif|bmp|tiff?|hei[cf])$/i.test(file.name);
}

export const HEIC_REFUSAL =
  "This browser can't read HEIC photos. On the iPhone, share the photo as JPEG (Settings → Camera → Formats → Most Compatible), or take a screenshot of it and upload that.";

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap honours the EXIF orientation, so a phone photo taken
  // upright comes out upright — the model reads a rotated receipt badly.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      /* fall through to <img> */
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

function dataUrlBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(",");
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/**
 * The picked file as an upright JPEG data URL small enough to send. Throws a
 * ReceiptImageError with a sentence for the contractor when it cannot be.
 */
export async function prepareReceiptImage(file: File): Promise<PreparedReceipt> {
  if (!looksLikeImage(file)) {
    throw new ReceiptImageError("That is not an image — a receipt uploads as a photo: JPG, PNG, WebP or HEIC.");
  }
  if (file.size > RECEIPT_MAX_SOURCE_BYTES) {
    throw new ReceiptImageError(`That file is ${(file.size / 1048576).toFixed(0)} MB — too large to read. A phone photo of the receipt is enough.`);
  }
  if (file.size === 0) {
    throw new ReceiptImageError("That file is empty — pick the photo again.");
  }

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    throw new ReceiptImageError(isHeicFile(file) ? HEIC_REFUSAL : "That image couldn't be read — it may be damaged. Try a JPG or PNG of the receipt.");
  }
  const sw = "naturalWidth" in source ? source.naturalWidth : source.width;
  const sh = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (!(sw > 0 && sh > 0)) {
    throw new ReceiptImageError("That image has no size — it may be damaged. Try another photo.");
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ReceiptImageError("This browser can't process images — try another browser.");

  let scale = Math.min(1, RECEIPT_MAX_EDGE / Math.max(sw, sh));
  let dataUrl = "";
  let bytes = Infinity;
  // Quality first, then size: a receipt at 0.7 is still every line legible,
  // and only then do we give up pixels.
  for (const step of [
    { q: 0.86 },
    { q: 0.76 },
    { q: 0.66 },
    { q: 0.7, shrink: 0.75 },
    { q: 0.7, shrink: 0.75 },
  ]) {
    if (step.shrink) scale *= step.shrink;
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    ctx.fillStyle = "#fff"; // a PNG with transparency reads as paper, not as black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    dataUrl = canvas.toDataURL("image/jpeg", step.q);
    bytes = dataUrlBytes(dataUrl);
    if (bytes <= RECEIPT_MAX_UPLOAD_BYTES) break;
  }
  if ("close" in source) source.close();
  if (!dataUrl.startsWith("data:image/jpeg")) {
    throw new ReceiptImageError("This browser couldn't re-encode the photo — try a JPG or PNG.");
  }
  if (bytes > RECEIPT_MAX_UPLOAD_BYTES) {
    throw new ReceiptImageError("That photo stays too large to send even scaled down — try a closer shot of just the receipt.");
  }

  return {
    dataUrl,
    filename: (file.name || "receipt").replace(/\.[a-z0-9]+$/i, "") + ".jpg",
    width: canvas.width,
    height: canvas.height,
    bytes,
    original: { type: file.type, bytes: file.size },
  };
}

/** What to tell the contractor when the server action itself failed to answer. */
export function receiptTransportError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/body exceeded|payload too large|413|too large/i.test(msg)) return "The photo was too large for the server to accept — try a closer shot of just the receipt.";
  if (/fetch failed|network|failed to fetch|load failed/i.test(msg)) return "The upload didn't reach the server — check the connection and try again.";
  if (/unauthori[sz]ed|forbidden|not signed in|sign in/i.test(msg)) return "You're signed out — sign in again and retry.";
  return msg || "The receipt reader didn't answer — try again in a moment.";
}
