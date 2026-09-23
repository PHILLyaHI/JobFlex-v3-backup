// Secrets at rest (Square OAuth tokens today). AES-256-GCM under a single
// app key, TOKEN_ENCRYPTION_KEY = 32 random bytes, base64 (`openssl rand
// -base64 32`). Output format `v1.<iv>.<tag>.<ciphertext>` (base64url) so a
// future key rotation can add `v2.` without a migration.
import "server-only";
import crypto from "node:crypto";

const VERSION = "v1";

function keyBytes(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;
  const buf = Buffer.from(raw, "base64");
  return buf.length === 32 ? buf : null;
}

export function isSecretBoxConfigured(): boolean {
  return keyBytes() !== null;
}

export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretBoxError";
  }
}

export function encryptSecret(plain: string): string {
  const key = keyBytes();
  if (!key) throw new SecretBoxError("TOKEN_ENCRYPTION_KEY is missing or not 32 bytes");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(enc: string): string {
  const key = keyBytes();
  if (!key) throw new SecretBoxError("TOKEN_ENCRYPTION_KEY is missing or not 32 bytes");
  const parts = enc.split(".");
  const [v, ivB, tagB, ctB] = parts;
  if (parts.length !== 4 || v !== VERSION || !ivB || !tagB || !ctB) {
    throw new SecretBoxError("Unrecognised secret format");
  }
  const iv = Buffer.from(ivB, "base64url");
  const tag = Buffer.from(tagB, "base64url");
  if (iv.length !== 12 || tag.length !== 16) throw new SecretBoxError("Unrecognised secret format");
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(ctB, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretBoxError("Secret failed authentication (wrong key?)");
  }
}
