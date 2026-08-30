import { IntegrationDisabledError } from "./base";

export function isBlobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function uploadBlob(
  name: string,
  body: Blob | ArrayBuffer | Buffer,
  opts?: { addRandomSuffix?: boolean },
) {
  if (!isBlobEnabled()) throw new IntegrationDisabledError("Vercel Blob", "BLOB_READ_WRITE_TOKEN");
  const { put } = await import("@vercel/blob");
  return put(name, body, {
    access: "public",
    token: process.env.BLOB_READ_WRITE_TOKEN!,
    ...opts,
  });
}

/** Deletes one blob by URL. No-op when Blob is off; a missing blob does not throw. */
export async function deleteBlob(url: string) {
  if (!isBlobEnabled()) return;
  const { del } = await import("@vercel/blob");
  await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN! });
}
