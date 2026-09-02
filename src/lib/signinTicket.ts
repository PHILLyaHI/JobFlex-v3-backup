// ONE-TIME SIGN-IN TICKET — the bridge between "the account was just created"
// and "the browser holds a session".
//
// The pay-first signup creates the User only after Stripe sends the visitor
// back, on a fresh page load where the password they typed on step 1 is gone.
// Until 2026-09-02 that meant landing on "Your shop is live" and then being
// walked to the login wall five seconds later — a signup that read as failing.
//
// A ticket is minted by completePendingSignup the moment the User row exists,
// handed to the client once, and redeemed by the `signup-ticket` Credentials
// provider in lib/auth.ts. It is:
//   · unguessable — 32 random bytes, base64url;
//   · stored HASHED, in the same key→string store the pending intent used
//     (SyncState), so a DB read leaks nothing redeemable;
//   · short-lived (5 minutes) and single-use — consumed on the first redeem,
//     whether or not the sign-in that follows succeeds.
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/tokens";

const TICKET_TTL_MS = 5 * 60 * 1000;

function key(raw: string): string {
  return `signin-ticket:${hashToken(raw)}`;
}

/** Mint a ticket for a user that was created seconds ago. */
export async function mintSigninTicket(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await db.syncState.create({
    data: { key: key(raw), cursor: JSON.stringify({ userId, exp: Date.now() + TICKET_TTL_MS }) },
  });
  return raw;
}

/**
 * Redeem a ticket: returns the user id it names, or null. The row is deleted
 * before the answer is checked, so a ticket is spent by its first presentation
 * no matter the outcome.
 */
export async function consumeSigninTicket(raw: string): Promise<string | null> {
  if (typeof raw !== "string" || raw.length < 32 || raw.length > 128) return null;
  const k = key(raw);
  const row = await db.syncState.findUnique({ where: { key: k } }).catch(() => null);
  if (!row) return null;
  await db.syncState.delete({ where: { key: k } }).catch(() => {});
  try {
    const rec = JSON.parse(row.cursor) as { userId?: string; exp?: number };
    if (!rec?.userId || typeof rec.exp !== "number" || Date.now() > rec.exp) return null;
    return rec.userId;
  } catch {
    return null;
  }
}
