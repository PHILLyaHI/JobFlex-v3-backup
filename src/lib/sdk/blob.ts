import { IntegrationDisabledError } from "./base";

export function isBlobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function uploadBlob(
  name: string,
  body: Blob | ArrayBuffer | Buffer,
  opts?: { contentType?: string },
) {
  if (!isBlobEnabled()) throw new IntegrationDisabledError("Vercel Blob", "BLOB_READ_WRITE_TOKEN");
  const { put } = await import("@vercel/blob");
  // The key never carries path separators from user input (callers pass
  // safeFilename output), and the content type is stated explicitly so the
  // store cannot infer text/html from a crafted extension and serve a page.
  return put(name.replace(/\.\.+/g, "."), body as Parameters<typeof put>[1], {
    access: "public",
    token: process.env.BLOB_READ_WRITE_TOKEN!,
    ...(opts?.contentType ? { contentType: opts.contentType } : {}),
  });
}
