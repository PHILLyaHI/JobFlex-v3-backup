"use server";

// The homeowner's side of a routed request — everything the status page
// (/request/[token]) can DO. Public like the intake itself: there is no
// homeowner account, the capability token in the URL is the authorization
// (nobody without the emailed link can name a valid one), so every action here
// resolves the lead through the token and nothing else.
import { z } from "zod";
import { db } from "@/lib/db";
import { clientRerouteUnlocksAt, unmatchAndAdvance } from "@/lib/leadCenter/unmatch";
import { enforceRateLimit, clientIp, HOUR } from "@/lib/rateLimit";

const rerouteInput = z.object({
  token: z.string().min(8),
  /** Optional, skipped in one tap: a canned option or the homeowner's words. */
  reason: z.string().trim().max(500).optional(),
});

export type RerouteResult =
  | { ok: true; status: string; rerouted: boolean }
  | { ok: false; error: string };

/**
 * "Find me another contractor." Idempotent against the match the homeowner is
 * looking at: the un-match core acts only while the lead is still MATCHED to
 * that same shop, so a double click, a stale tab, or a race with the shop
 * declining first all fall through to an honest "already moving" answer
 * instead of a second write.
 */
export async function requestAnotherContractor(raw: unknown): Promise<RerouteResult> {
  const data = rerouteInput.parse(raw);
  // The token is the identity; brake on it AND on the caller's IP so neither a
  // stolen link nor one machine can grind the cascade.
  await enforceRateLimit(`reroute:${data.token}`, 5, HOUR, "requests");
  await enforceRateLimit(`reroute-ip:${await clientIp()}`, 10, HOUR, "requests");

  const pl = await db.platformLead.findUnique({ where: { accessToken: data.token } });
  if (!pl) return { ok: false, error: "This link is not valid." };

  if (pl.status !== "MATCHED" || !pl.matchedOrgId) {
    // Nothing to undo — the shop already passed, or matching is in flight.
    return { ok: true, status: pl.status, rerouted: false };
  }

  // Owner's rule #1, enforced server-side (the page's disabled button is UX,
  // not a guard): the shop gets its 24 hours to make the call.
  const unlockAt = clientRerouteUnlocksAt(pl.matchedAt);
  if (unlockAt && Date.now() < unlockAt.getTime()) {
    return {
      ok: false,
      error:
        "Give the contractor a little more time to reach you — this option unlocks 24 hours after the match.",
    };
  }

  const prevOrgId = pl.matchedOrgId;
  const res = await unmatchAndAdvance(pl.id, {
    offerStatus: "REJECTED_BY_CLIENT",
    respondedById: null,
    declineReason: data.reason || null,
    // The shop DID accept this lead and may have started on it — their row is
    // marked LOST, not erased (owner's rule #5).
    leadDisposition: "lost",
    expectedOrgId: prevOrgId,
  });
  if (!res.changed) {
    // Lost the race to the shop's own decline / an admin re-assign — the
    // request is already moving, which is exactly what the homeowner wanted.
    return { ok: true, status: res.status, rerouted: false };
  }

  // Notifications are best-effort: the re-route stands even if nobody pings.
  try {
    const { notifyShopClientRequestedReroute, notifyHomeownerRerouting, notifyHomeownerManualQueue } =
      await import("@/lib/notify");
    await notifyShopClientRequestedReroute(pl.id, prevOrgId, data.reason || null).catch((err) =>
      console.warn("[homeowner-portal] shop notify failed:", err),
    );
    if (res.status === "MANUAL_QUEUE") {
      await notifyHomeownerManualQueue(pl.id).catch((err) =>
        console.warn("[homeowner-portal] manual-queue notify failed:", err),
      );
    } else {
      await notifyHomeownerRerouting(pl.id).catch((err) =>
        console.warn("[homeowner-portal] rerouting notify failed:", err),
      );
    }
  } catch (err) {
    console.warn("[homeowner-portal] notify import failed:", err);
  }

  return { ok: true, status: res.status, rerouted: res.rerouted };
}
