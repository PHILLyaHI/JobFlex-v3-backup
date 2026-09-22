// A server action's refusal, as a VALUE.
//
// Next.js redacts a thrown Server Action message in production (the client
// gets its own fault paragraph and a digest), so "Promo code X is already in
// use", "Enter 100 or less", "This link is invalid or has expired" only ever
// reached an admin or a partner on the dev server. Every refusal a person is
// meant to read comes back in this envelope instead; what is still THROWN is
// what nobody should read — an auth failure, a database that is down.
//
// The same shape actions/influencers.requestPayout and the payout decisions
// already answer with; this names it once.

import { ZodError } from "zod";

export type ActionResult<T = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string };

export const refused = (error: string): { ok: false; error: string } => ({ ok: false, error });

/**
 * A refusal from something that threw: a ZodError's first issue as
 * "field: message" (what the sheets show today), any other Error's message.
 * Auth and infrastructure errors are re-thrown — they are not for the reader.
 */
export function refusal(err: unknown): { ok: false; error: string } {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first?.path?.[0];
    return refused(field !== undefined ? `${String(field)}: ${first.message}` : (first?.message ?? "Check the form."));
  }
  if (err instanceof Error && err.name !== "UnauthorizedError" && err.name !== "NoOrgError" && !/prisma|database|ECONN/i.test(err.message)) {
    return refused(err.message);
  }
  throw err;
}
