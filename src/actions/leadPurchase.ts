"use server";

// Paid Lead Center leads — the shop's side (lib/leadCenter/purchase.ts has the
// rule). Same guard as accepting an offer: sales and managers.
import { revalidatePath } from "next/cache";
import { requireSalesOrManager } from "@/lib/orgContext";
import { appBaseUrl } from "@/lib/appUrl";
import { chargeCardOnFile, finishCheckoutReturn, startPurchase, type PurchaseStep } from "@/lib/leadCenter/purchase";

async function buyer() {
  const ctx = await requireSalesOrManager();
  return { organizationId: ctx.organizationId, userId: ctx.user.id, email: ctx.user.email ?? null };
}

/** The Accept on a priced offer: what to show next — a card to confirm, or
 *  Stripe Checkout. A free offer answers `free` (the caller accepts as usual). */
export async function startLeadPurchase(offerId: string): Promise<PurchaseStep> {
  return startPurchase(await buyer(), offerId, await appBaseUrl());
}

/** "Charge $45 to Visa •4242" confirmed. */
export async function chargeLeadOffer(offerId: string): Promise<PurchaseStep> {
  const step = await chargeCardOnFile(await buyer(), offerId, await appBaseUrl());
  if (step.kind === "unlocked") revalidatePath("/dashboard/leads");
  return step;
}

/** Back from Stripe Checkout (`?lead_paid=…&session_id=…`): the session read
 *  from Stripe, the lead opened if it is paid. */
export async function finishLeadCheckout(sessionId: string) {
  const ctx = await requireSalesOrManager();
  const res = await finishCheckoutReturn(ctx.organizationId, sessionId);
  if (res.status === "unlocked") revalidatePath("/dashboard/leads");
  return res;
}
