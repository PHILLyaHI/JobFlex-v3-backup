// GOOGLE ON THE SIGNUP PAGE — identity only, never an account.
//
// Until 2026-09-03 a Google sign-in for an address JobFlex had never seen
// provisioned an organization on the spot and dropped the visitor on the
// dashboard with no plan — the one thing the pay-first signup exists to
// prevent (owner's report). Google now proves WHO the visitor is and nothing
// more: the verified identity is parked here for a few minutes and the
// visitor is sent back into the signup at step 2 (company), then step 3 (the
// plan), and the account is created only when checkout returns — exactly as
// a password signup is. The pending intent records that the account is
// Google-backed (no password), and the finished User signs in with Google.
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/tokens";

const TTL_MS = 20 * 60 * 1000;

export interface GoogleSignupIdentity {
  email: string;
  name: string | null;
  image: string | null;
}

function key(raw: string): string {
  return `google-signup:${hashToken(raw)}`;
}

/** Park a Google-verified identity; returns the handle the register page carries. */
export async function stashGoogleSignup(identity: GoogleSignupIdentity): Promise<string> {
  const raw = randomBytes(24).toString("base64url");
  await db.syncState.create({
    data: { key: key(raw), cursor: JSON.stringify({ ...identity, at: Date.now() }) },
  });
  return raw;
}

/** Read a parked identity (not consumed — the same handle serves the whole
 *  signup until the intent is created). Null when missing or stale. */
export async function readGoogleSignup(raw: string): Promise<GoogleSignupIdentity | null> {
  if (typeof raw !== "string" || raw.length < 20 || raw.length > 80) return null;
  const row = await db.syncState.findUnique({ where: { key: key(raw) } }).catch(() => null);
  if (!row) return null;
  try {
    const rec = JSON.parse(row.cursor) as GoogleSignupIdentity & { at?: number };
    if (!rec?.email || Date.now() - (rec.at ?? 0) > TTL_MS) return null;
    return { email: rec.email.toLowerCase(), name: rec.name ?? null, image: rec.image ?? null };
  } catch {
    return null;
  }
}

export async function consumeGoogleSignup(raw: string): Promise<void> {
  await db.syncState.delete({ where: { key: key(raw) } }).catch(() => {});
}
