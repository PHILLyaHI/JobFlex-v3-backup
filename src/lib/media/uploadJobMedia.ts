// A PHOTO, A VIDEO OR A RECEIPT LEAVES THE PHONE (2026-09-27; stage B
// 2026-09-30) — browser side, one path for the worker portal (a token) and
// the dashboard (the session).
//
// A photo is shrunk here first — a 12-megapixel shot is 4 MB of JPEG the job
// never needs. Then the server says where the bytes go (/api/crew/upload-ticket
// checks the caller against the job before anything moves):
//   blob   — straight from the phone to the PRIVATE Vercel Blob store, with a
//            token from /api/jobs/media/token (multipart for anything big);
//   local  — development without the store: straight to this machine's disk
//            through /api/crew/upload-local, with progress, the same shape;
//   inline — production before the store exists: a photo or a receipt image
//            rides as a data URL through the older routes (4 MB), a video is
//            refused in a sentence.
// Any file up to 100 MB, photo or video, as it is (no conversion). Nothing is
// ever sent as base64 when the store — or the local fallback — is there.

import { upload } from "@vercel/blob/client";
import { MAX_INLINE_PHOTO_BYTES, MAX_FILE_BYTES, PHOTO_LONG_SIDE, blobPathFor, fileSize, isImageType, isVideoType, type MediaKind } from "@/lib/jobMediaShared";

export type UploadDoor = { token: string } | { session: true };
export type UploadFolder = "jobs" | "receipts";

export interface UploadedMedia {
  id: string;
  url: string;
  media: "photo" | "video";
}

export interface UploadedFile {
  /** The stored URL the row keeps (private blob, local: or data:). */
  url: string;
  contentType: string;
  bytes: number;
  name: string;
}

export class MediaUploadError extends Error {}

/** A JPEG no longer than PHOTO_LONG_SIDE on its long side; the file itself
 *  when the browser cannot decode it or it is already small. */
export async function shrinkPhoto(file: File): Promise<{ blob: Blob; type: string; name: string }> {
  if (!isImageType(file.type) || file.type === "image/gif") return { blob: file, type: file.type || "image/jpeg", name: file.name };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, PHOTO_LONG_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 1.5 * 1024 * 1024) {
      bitmap.close();
      return { blob: file, type: file.type, name: file.name };
    }
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d");
    if (!g) throw new Error("no canvas");
    g.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob) throw new Error("no blob");
    return { blob, type: "image/jpeg", name: file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg" };
  } catch {
    return { blob: file, type: file.type || "image/jpeg", name: file.name };
  }
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** A failed request in words a crew member can act on. */
async function wordsOf(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const j = JSON.parse(text) as { error?: string };
    if (j.error) return j.error;
  } catch {
    /* plain text */
  }
  if (res.status === 413) return "That file is over the 100 MB limit.";
  return text && text.length < 200 ? text : fallback;
}

function netWords(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  if (/network|failed to fetch|load failed|offline|timeout/i.test(m)) return "The connection dropped — check the signal and try again.";
  if (/too large|file too large|maximumSizeInBytes/i.test(m)) return "That file is over the 100 MB limit.";
  if (/content ?type/i.test(m)) return "That kind of file is not accepted here.";
  return m || "The upload failed.";
}

/** PUT a file to the local fallback with real progress (fetch has none). */
function putWithProgress(url: string, body: Blob, type: string, onProgress?: (pct: number) => void): Promise<{ url: string; bytes: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.max(1, Math.min(99, Math.round((e.loaded / e.total) * 100))));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as { url: string; bytes: number });
        } catch {
          reject(new MediaUploadError("The file went up but the answer was unreadable."));
        }
      } else {
        let msg = xhr.status === 413 ? "That file is over the 100 MB limit." : "The upload failed.";
        try {
          msg = (JSON.parse(xhr.responseText) as { error?: string }).error ?? msg;
        } catch {
          /* keep */
        }
        reject(new MediaUploadError(msg));
      }
    };
    xhr.onerror = () => reject(new MediaUploadError("The connection dropped — check the signal and try again."));
    xhr.send(body);
  });
}

/**
 * Put one file in the job's private folder (`jobs/<jobId>/` for the work,
 * `receipts/<jobId>/` for a receipt) and return the stored URL. Recording it
 * on the job — a JobPhoto, a JobExpense — is the caller's next request.
 */
export async function uploadJobFile(opts: {
  jobId: string;
  door: UploadDoor;
  file: File;
  folder: UploadFolder;
  onProgress?: (pct: number) => void;
}): Promise<UploadedFile & { mode: "blob" | "local" | "inline" }> {
  const { jobId, door, file, folder, onProgress } = opts;
  const video = isVideoType(file.type) || /\.(mp4|mov|m4v|webm|3gp)$/i.test(file.name);
  const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (folder === "jobs" && !video && !isImageType(file.type)) throw new MediaUploadError(`${file.name} is not a photo or a video.`);
  if (folder === "receipts" && !isImageType(file.type) && !pdf) throw new MediaUploadError(`${file.name} is not a picture or a PDF of the receipt.`);
  if (file.size > MAX_FILE_BYTES) throw new MediaUploadError(`${file.name} is larger than ${fileSize(MAX_FILE_BYTES)} (${fileSize(file.size)}) — send a shorter video or a smaller picture.`);

  const body = video || pdf ? { blob: file as Blob, type: file.type || (pdf ? "application/pdf" : "video/mp4"), name: file.name } : await shrinkPhoto(file);
  const token = "token" in door ? door.token : null;

  onProgress?.(1);
  let ticket: Response;
  try {
    ticket = await fetch("/api/crew/upload-ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, token, folder, name: body.name, contentType: body.type, bytes: body.blob.size }),
    });
  } catch (err) {
    throw new MediaUploadError(netWords(err));
  }
  if (!ticket.ok) throw new MediaUploadError(await wordsOf(ticket, "The upload was refused."));
  const t = (await ticket.json()) as { mode: "blob" | "local" | "inline"; pathname?: string; uploadUrl?: string };

  if (t.mode === "blob" && t.pathname) {
    try {
      const put = await upload(t.pathname, body.blob, {
        access: "private",
        handleUploadUrl: "/api/jobs/media/token",
        contentType: body.type,
        multipart: body.blob.size > 8 * 1024 * 1024,
        clientPayload: JSON.stringify({ jobId, token, folder, contentType: body.type, bytes: body.blob.size }),
        onUploadProgress: (p) => onProgress?.(Math.max(1, Math.min(99, Math.round(p.percentage)))),
      });
      return { url: put.url, contentType: body.type, bytes: body.blob.size, name: body.name, mode: "blob" };
    } catch (err) {
      throw new MediaUploadError(netWords(err));
    }
  }
  if (t.mode === "local" && t.uploadUrl) {
    const r = await putWithProgress(t.uploadUrl, body.blob, body.type, onProgress);
    return { url: r.url, contentType: body.type, bytes: r.bytes, name: body.name, mode: "local" };
  }
  // inline: production before the store exists — a picture only, small.
  if (video) throw new MediaUploadError("Videos need the company's file storage, which is not switched on yet — the office can turn it on. Photos still go through.");
  if (pdf) throw new MediaUploadError("A PDF needs the company's file storage, which is not switched on yet — take a photo of the receipt instead.");
  if (body.blob.size > MAX_INLINE_PHOTO_BYTES) throw new MediaUploadError(`${file.name} is still ${fileSize(body.blob.size)} after shrinking — the limit without file storage is ${fileSize(MAX_INLINE_PHOTO_BYTES)}.`);
  const dataUrl = await readAsDataUrl(body.blob);
  return { url: dataUrl, contentType: body.type, bytes: body.blob.size, name: body.name, mode: "inline" };
}

/**
 * A photo or a video of the work, stored and recorded on the job (a JobPhoto
 * row, hung on the day open today — or on `date`, a day being closed late).
 */
export async function uploadJobMedia(opts: {
  jobId: string;
  door: UploadDoor;
  file: File;
  kind: MediaKind;
  /** Kept for the older callers; the server decides the path now. */
  blobEnabled?: boolean;
  onProgress?: (pct: number) => void;
  /** The day the file belongs to, when it is not today ("2026-09-29"). */
  date?: string | null;
  caption?: string | null;
  /** The dashboard's inline photo path (a server action) when there is no store. */
  inlineUpload?: (dataUrl: string, filename: string, kind: MediaKind) => Promise<{ id: string; url: string }>;
}): Promise<UploadedMedia> {
  const { jobId, door, file, kind, onProgress } = opts;
  const token = "token" in door ? door.token : null;
  const stored = await uploadJobFile({ jobId, door, file, folder: "jobs", onProgress });
  const video = isVideoType(stored.contentType);
  if (stored.mode === "inline") {
    // The older inline routes take the data URL and store it on the row.
    if (token) {
      const res = await fetch("/api/worker/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, jobId, dataUrl: stored.url, filename: stored.name, kind, date: opts.date ?? null }),
      });
      if (!res.ok) throw new MediaUploadError(await wordsOf(res, "Couldn't upload that photo."));
      const rec = (await res.json()) as { id: string; url: string };
      onProgress?.(100);
      return { ...rec, media: "photo" };
    }
    if (!opts.inlineUpload) throw new MediaUploadError("Couldn't upload that photo.");
    const rec = await opts.inlineUpload(stored.url, stored.name, kind);
    onProgress?.(100);
    return { ...rec, media: "photo" };
  }
  let res: Response;
  try {
    res = await fetch("/api/jobs/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, token, url: stored.url, kind, contentType: stored.contentType, bytes: stored.bytes, name: stored.name, date: opts.date ?? null, caption: opts.caption ?? null }),
    });
  } catch (err) {
    throw new MediaUploadError(netWords(err));
  }
  if (!res.ok) throw new MediaUploadError(await wordsOf(res, "The file went up but could not be recorded."));
  const rec = (await res.json()) as { id: string; url: string; media: "photo" | "video" };
  onProgress?.(100);
  return { ...rec, media: video ? "video" : rec.media };
}

/** The blob key for a job's file (kept for the older callers and the QA). */
export { blobPathFor };
