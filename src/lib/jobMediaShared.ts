// PHOTOS AND VIDEOS OF THE WORK (2026-09-27) — pure, client-safe.
//
// Owner: "at the workers' dashboard, an option to upload videos and pictures
// of how the job was done — they go to the job's proposal folder." A video
// is a JobPhoto row like a photo (no schema change): its kind is the same
// Before / Progress / After, and `analysis` — the row's JSON column — carries
// `{"media":"video", …}` so every page draws a player instead of a picture.

export type MediaKind = "BEFORE" | "PROGRESS" | "AFTER";
export const MEDIA_KINDS: readonly MediaKind[] = ["BEFORE", "PROGRESS", "AFTER"];

export const IMAGE_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
export const VIDEO_TYPES: readonly string[] = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v", "video/3gpp"];
/** What the file pickers offer. */
export const MEDIA_ACCEPT = "image/*,video/mp4,video/quicktime,video/webm,video/x-m4v,video/3gpp";

/** Through the file store (client upload): a photo after shrinking, a video whole. */
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
/** Without the store a photo travels as a data URL in a JSON body (Vercel's 4.5 MB request cap). */
export const MAX_INLINE_PHOTO_BYTES = 4 * 1024 * 1024;
/** Photos are shrunk in the browser to this long side before they leave the phone. */
export const PHOTO_LONG_SIDE = 1800;

export function isVideoType(t: string | null | undefined): boolean {
  return !!t && (VIDEO_TYPES.includes(t.toLowerCase()) || t.toLowerCase().startsWith("video/"));
}
export function isImageType(t: string | null | undefined): boolean {
  return !!t && (IMAGE_TYPES.includes(t.toLowerCase()) || t.toLowerCase().startsWith("image/"));
}

export interface MediaMeta {
  media: "photo" | "video";
  contentType?: string;
  bytes?: number;
  name?: string;
}

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|3gp)(\?|$)/i;

/** What a JobPhoto row is, from its `analysis` JSON (a video's marker) or,
 *  failing that, the URL's extension. Anything unreadable is a photo. */
export function mediaOf(row: { url: string; analysis?: string | null }): MediaMeta {
  const raw = row.analysis;
  if (raw) {
    try {
      const j = JSON.parse(raw) as Partial<MediaMeta> & { media?: unknown };
      if (j && j.media === "video") {
        return { media: "video", contentType: typeof j.contentType === "string" ? j.contentType : undefined, bytes: typeof j.bytes === "number" ? j.bytes : undefined, name: typeof j.name === "string" ? j.name : undefined };
      }
    } catch {
      /* not ours */
    }
  }
  if (VIDEO_EXT.test(row.url)) return { media: "video" };
  return { media: "photo" };
}

export function mediaMetaJson(m: MediaMeta): string | null {
  return m.media === "video" ? JSON.stringify({ media: "video", contentType: m.contentType, bytes: m.bytes, name: m.name }) : null;
}

/** "2.4 MB" */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** The blob key for a job's file: under the job, dated, the name made safe. */
export function blobPathFor(jobId: string, filename: string | null | undefined, fallback: string): string {
  const base = (filename ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^\.+/, "").slice(0, 80) || fallback;
  return `jobs/${jobId}/${Date.now()}-${cleaned}`;
}

/** The store's public host, and this job's own folder in it. */
export function isJobBlobUrl(url: string, jobId: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !/\.public\.blob\.vercel-storage\.com$/i.test(u.hostname)) return false;
    return u.pathname.startsWith(`/jobs/${jobId}/`);
  } catch {
    return false;
  }
}
