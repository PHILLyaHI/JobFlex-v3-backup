// A HOMEOWNER'S FILE LEAVES THE PHONE (2026-10-03) — browser side, the same
// three ways the crew's files go (lib/media/uploadJobMedia): straight to the
// private Blob store with a token from /api/home/[key]/upload-token, to this
// machine's disk in development, or — on Vercel before the store exists — a
// small picture as a data URL. The server names the way first
// (/api/home/[key]/upload-ticket); the file is recorded on the request after
// it lands (actions/homeFiles).
import { upload } from "@vercel/blob/client";
import { registerHomeFile, uploadHomeFileInline, type HomeFilesResult } from "@/actions/homeFiles";
import { MAX_FILE_BYTES, MAX_INLINE_PHOTO_BYTES, fileSize, isImageType, isVideoType } from "@/lib/jobMediaShared";
import { MediaUploadError, shrinkPhoto } from "@/lib/media/uploadJobMedia";

export type StorageWay = "blob" | "local" | "inline";

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function wordsOf(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const j = JSON.parse(text) as { error?: string };
    if (j.error) return j.error;
  } catch {
    /* plain text */
  }
  return text && text.length < 200 ? text : fallback;
}

function netWords(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  if (/network|failed to fetch|load failed|offline|timeout/i.test(m)) return "The connection dropped — check the signal and try again.";
  if (/too large|file too large|maximumSizeInBytes/i.test(m)) return `That file is over the ${fileSize(MAX_FILE_BYTES)} limit.`;
  if (/content ?type/i.test(m)) return "Pictures, videos and PDFs only.";
  return m || "The upload failed.";
}

/** PUT to the local fallback with real progress (fetch has none). */
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
        let msg = xhr.status === 413 ? `That file is over the ${fileSize(MAX_FILE_BYTES)} limit.` : "The upload failed.";
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

/** One file into the request's folder, recorded. Throws MediaUploadError in the homeowner's words. */
export async function uploadHomeFile(opts: {
  homeKey: string;
  token: string;
  file: File;
  note: string | null;
  /** With the last file of a batch: the shop hears once, with the count. */
  notify: { count: number } | null;
  onProgress?: (pct: number) => void;
}): Promise<HomeFilesResult> {
  const { homeKey, token, file, note, notify, onProgress } = opts;
  const video = isVideoType(file.type) || /\.(mp4|mov|m4v|webm|3gp)$/i.test(file.name);
  const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!video && !pdf && !isImageType(file.type)) throw new MediaUploadError(`${file.name} is not a picture, a video or a PDF.`);
  if (file.size > MAX_FILE_BYTES) throw new MediaUploadError(`${file.name} is larger than ${fileSize(MAX_FILE_BYTES)} (${fileSize(file.size)}) — send a shorter video or a smaller picture.`);
  const body = video || pdf ? { blob: file as Blob, type: file.type || (pdf ? "application/pdf" : "video/mp4"), name: file.name } : await shrinkPhoto(file);
  onProgress?.(1);
  let ticket: Response;
  try {
    ticket = await fetch(`/api/home/${encodeURIComponent(homeKey)}/upload-ticket`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name: body.name, contentType: body.type, bytes: body.blob.size }),
    });
  } catch (err) {
    throw new MediaUploadError(netWords(err));
  }
  if (!ticket.ok) throw new MediaUploadError(await wordsOf(ticket, "The upload was refused."));
  const t = (await ticket.json()) as { mode: StorageWay; pathname?: string; uploadUrl?: string };
  if (t.mode === "blob" && t.pathname) {
    let url: string;
    try {
      const put = await upload(t.pathname, body.blob, {
        access: "private",
        handleUploadUrl: `/api/home/${encodeURIComponent(homeKey)}/upload-token`,
        contentType: body.type,
        multipart: body.blob.size > 8 * 1024 * 1024,
        clientPayload: JSON.stringify({ token }),
        onUploadProgress: (p) => onProgress?.(Math.max(1, Math.min(99, Math.round(p.percentage)))),
      });
      url = put.url;
    } catch (err) {
      throw new MediaUploadError(netWords(err));
    }
    return registerHomeFile({ key: homeKey, token, url, name: body.name, contentType: body.type, bytes: body.blob.size, note: note ?? undefined, notify: notify ?? undefined });
  }
  if (t.mode === "local" && t.uploadUrl) {
    const r = await putWithProgress(t.uploadUrl, body.blob, body.type, onProgress);
    return registerHomeFile({ key: homeKey, token, url: r.url, name: body.name, contentType: body.type, bytes: r.bytes, note: note ?? undefined, notify: notify ?? undefined });
  }
  // inline: production before the store exists — a picture only, small.
  if (video) throw new MediaUploadError("Videos need JobFlex's file storage, which isn't switched on yet — photos still go through.");
  if (pdf) throw new MediaUploadError("A PDF needs JobFlex's file storage, which isn't switched on yet — a photo of the page goes through.");
  if (body.blob.size > MAX_INLINE_PHOTO_BYTES) throw new MediaUploadError(`${file.name} is still ${fileSize(body.blob.size)} after shrinking — the limit right now is ${fileSize(MAX_INLINE_PHOTO_BYTES)}.`);
  const dataUrl = await readAsDataUrl(body.blob);
  return uploadHomeFileInline({ key: homeKey, token, dataUrl, name: body.name, note: note ?? undefined, notify: notify ?? undefined });
}
