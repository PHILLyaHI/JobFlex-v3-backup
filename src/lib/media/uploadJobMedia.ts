// A PHOTO OR A VIDEO LEAVES THE PHONE (2026-09-27) — browser side, one path
// for the worker portal (a token) and the dashboard (the session).
//
// A photo is shrunk here first — a 12-megapixel shot is 4 MB of JPEG the
// job never needs, and a phone on a jobsite has the bandwidth it has. With
// the company's file store on, the file then goes straight to Vercel Blob
// with a token from /api/jobs/media/token and is recorded at /api/jobs/media;
// a video only ever travels this way. Without the store a photo travels as
// a data URL through the older routes, and a video is refused with a plain
// sentence, because a JSON body cannot carry one.

import { upload } from "@vercel/blob/client";
import { MAX_INLINE_PHOTO_BYTES, MAX_VIDEO_BYTES, PHOTO_LONG_SIDE, blobPathFor, fileSize, isImageType, isVideoType, type MediaKind } from "@/lib/jobMediaShared";

export type UploadDoor = { token: string } | { session: true };

export interface UploadedMedia {
  id: string;
  url: string;
  media: "photo" | "video";
}

export class MediaUploadError extends Error {}

/** A JPEG no longer than PHOTO_LONG_SIDE on its long side; the file itself
 *  when the browser cannot decode it (HEIC on a desk) or it is already small. */
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

export async function uploadJobMedia(opts: {
  jobId: string;
  door: UploadDoor;
  file: File;
  kind: MediaKind;
  /** The company's file store is on (the server knows; the page passes it). */
  blobEnabled: boolean;
  onProgress?: (pct: number) => void;
  /** The dashboard's inline photo path (a server action) when there is no store. */
  inlineUpload?: (dataUrl: string, filename: string, kind: MediaKind) => Promise<{ id: string; url: string }>;
}): Promise<UploadedMedia> {
  const { jobId, door, file, kind, blobEnabled, onProgress } = opts;
  const video = isVideoType(file.type) || /\.(mp4|mov|m4v|webm|3gp)$/i.test(file.name);
  if (!video && !isImageType(file.type)) throw new MediaUploadError(`${file.name} is not a photo or a video.`);
  if (video && !blobEnabled) throw new MediaUploadError("Videos need the company's file storage, which is not switched on yet — the office can turn it on. Photos still go through.");
  if (video && file.size > MAX_VIDEO_BYTES) throw new MediaUploadError(`${file.name} is ${fileSize(file.size)} — videos up to ${fileSize(MAX_VIDEO_BYTES)}.`);

  const body = video ? { blob: file as Blob, type: file.type || "video/mp4", name: file.name } : await shrinkPhoto(file);
  const token = "token" in door ? door.token : null;

  if (blobEnabled) {
    onProgress?.(1);
    const pathname = blobPathFor(jobId, body.name, video ? "video.mp4" : "photo.jpg");
    const put = await upload(pathname, body.blob, {
      access: "public",
      handleUploadUrl: "/api/jobs/media/token",
      contentType: body.type,
      multipart: body.blob.size > 20 * 1024 * 1024,
      clientPayload: JSON.stringify({ jobId, token, contentType: body.type, bytes: body.blob.size }),
      onUploadProgress: (p) => onProgress?.(Math.max(1, Math.min(99, Math.round(p.percentage)))),
    });
    const res = await fetch("/api/jobs/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, token, url: put.url, kind, contentType: body.type, bytes: body.blob.size, name: body.name }),
    });
    if (!res.ok) throw new MediaUploadError((await res.text().catch(() => "")) || "The file went up but could not be recorded.");
    const rec = (await res.json()) as { id: string; url: string; media: "photo" | "video" };
    onProgress?.(100);
    return rec;
  }

  // No store: the photo rides inline, small.
  if (body.blob.size > MAX_INLINE_PHOTO_BYTES) throw new MediaUploadError(`${file.name} is still ${fileSize(body.blob.size)} after shrinking — the limit without file storage is ${fileSize(MAX_INLINE_PHOTO_BYTES)}.`);
  onProgress?.(10);
  const dataUrl = await readAsDataUrl(body.blob);
  if (token) {
    const res = await fetch("/api/worker/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, jobId, dataUrl, filename: body.name, kind }),
    });
    if (!res.ok) throw new MediaUploadError((await res.text().catch(() => "")) || "Couldn't upload that photo.");
    const rec = (await res.json()) as { id: string; url: string };
    onProgress?.(100);
    return { ...rec, media: "photo" };
  }
  if (!opts.inlineUpload) throw new MediaUploadError("Couldn't upload that photo.");
  const rec = await opts.inlineUpload(dataUrl, body.name, kind);
  onProgress?.(100);
  return { ...rec, media: "photo" };
}
