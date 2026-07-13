import { createHash } from "node:crypto";

// One-way hash for magic-link tokens that we only ever need to *match*, never
// re-display. Storing sha256(rawToken) means a DB-read leak yields no usable
// links — the raw token lives only in the email/URL. Used for team-invite
// tokens (mirrors the password-reset flow). NOT used for the worker-portal
// token, which is a persistent credential re-sent on every assignment and so
// must stay reconstructable.
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
