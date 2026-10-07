// UPDATE THE CARD AFTER A FAILED PAYMENT (lib/cardUpdate). Owner only — the
// card is the shop's money. Answers the Stripe Checkout URL (setup mode, the
// subscription's own customer); the return lands on /dashboard/subscription,
// which makes the card the default and pays what is owed with it.
import { NextResponse } from "next/server";
import { requireOwner, UnauthorizedError, NoOrgError } from "@/lib/orgContext";
import { isStripeEnabled } from "@/lib/sdk/stripe";
import { openCardUpdate } from "@/lib/cardUpdate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let organizationId: string;
  try {
    ({ organizationId } = await requireOwner());
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof NoOrgError) {
      return NextResponse.json({ error: "Only the owner can update the card." }, { status: 403 });
    }
    throw err;
  }
  if (!isStripeEnabled()) return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  try {
    const opened = await openCardUpdate(organizationId, new URL(req.url).origin);
    if (!opened) return NextResponse.json({ error: "There is no subscription to update the card on." }, { status: 409 });
    return NextResponse.json({ url: opened.url });
  } catch (err) {
    console.error("[update-card] checkout failed:", err);
    return NextResponse.json({ error: "Couldn't open the card form. Try again." }, { status: 502 });
  }
}
