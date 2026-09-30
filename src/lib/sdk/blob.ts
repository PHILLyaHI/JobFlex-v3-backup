import { IntegrationDisabledError } from "./base";

export function isBlobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function uploadBlob(
  name: string,
  body: Blob | ArrayBuffer | Buffer,
  opts?: { contentType?: string; addRandomSuffix?: boolean },
) {
  if (!isBlobEnabled()) throw new IntegrationDisabledError("Vercel Blob", "BLOB_READ_WRITE_TOKEN");
  const { put } = await import("@vercel/blob");
  // The key never carries path separators from user input (callers pass
  // safeFilename output), and the content type is stated explicitly so the
  // store cannot infer text/html from a crafted extension and serve a page.
  // @vercel/blob 2.x (stage B, 2026-09-30): `access` is required and the
  // random suffix is off by default — it stays ON here, as 0.x had it, so a
  // repeated name never throws on an existing blob. This is the PUBLIC store
  // (proposal photos, reviews, change orders); the crew's files and receipts
  // go to the private one (lib/media/privateStore).
  return put(name.replace(/\.\.+/g, "."), body as Parameters<typeof put>[1], {
    access: "public",
    token: process.env.BLOB_READ_WRITE_TOKEN!,
    addRandomSuffix: opts?.addRandomSuffix ?? true,
    ...(opts?.contentType ? { contentType: opts.contentType } : {}),
  });
}

/** Deletes one blob by URL. No-op when Blob is off; a missing blob does not throw. */
export async function deleteBlob(url: string) {
  if (!isBlobEnabled()) return;
  const { del } = await import("@vercel/blob");
  await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN! });
}
