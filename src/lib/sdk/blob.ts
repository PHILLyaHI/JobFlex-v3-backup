import { IntegrationDisabledError } from "./base";

export function isBlobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function uploadBlob(name: string, body: Blob | ArrayBuffer | Buffer) {
  if (!isBlobEnabled()) throw new IntegrationDisabledError("Vercel Blob", "BLOB_READ_WRITE_TOKEN");
  const { put } = await import("@vercel/blob");
  return put(name, body as any, {
    access: "public",
    token: process.env.BLOB_READ_WRITE_TOKEN!,
  });
}
