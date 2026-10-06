"use server";

// ADMIN · a custom plan's pages, from the account sheet (owner, 2026-10-06).
//
// Read: the pages the org holds (our record — what the gate reads) beside
// what its Stripe subscription bills, so a mismatch is visible at a glance.
// Write: two ways, picked per change —
//   · "customer": the same rules the owner's own picker follows
//     (lib/customBilling): added pages charged now, prorated; removed pages
//     close now and the price drops from the next bill;
//   · "none": access only — our record moves, Stripe is not touched (a
//     goodwill page, or repairing a record). The sheet says what it costs.
// A reason is required and goes on the organization's activity with the
// admin's email.

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { logActivity, TRAIL_KINDS } from "@/lib/activityLog";
import { revalidatePlanSurfaces } from "@/lib/planCatalogServer";
import { getStripeClient, isStripeEnabled } from "@/lib/sdk/stripe";
import { customPriceCents, normalizeCustomPages } from "@/lib/customPlan";
import { billedPageCount, changeCustomPages, customItemsOf, readOrgPages } from "@/lib/customBilling";

export type AdminCustomPages = {
  onCustom: boolean;
  pages: string[];
  /** What the pages cost per month (our price list). */
  pricedCents: number;
  /** What Stripe bills per month, and its page quantity; null without a
   *  reachable subscription. */
  billedCents: number | null;
  billedPages: number | null;
  /** The subscription is still on the one-price model (lib/customBilling). */
  legacy: boolean;
  stripeStatus: string | null;
};

export async function getAdminCustomPages(organizationId: string): Promise<AdminCustomPages> {
  await requirePlatformAdmin();
  const sub = await db.subscription.findUnique({ where: { organizationId } });
  const onCustom = (sub?.plan ?? "").toUpperCase() === "CUSTOM";
  const pages = await readOrgPages(organizationId);
  const out: AdminCustomPages = {
    onCustom,
    pages,
    pricedCents: customPriceCents(pages),
    billedCents: null,
    billedPages: null,
    legacy: false,
    stripeStatus: null,
  };
  if (!sub?.externalSubId || !isStripeEnabled()) return out;
  try {
    const { stripe } = await getStripeClient();
    const s = await stripe.subscriptions.retrieve(sub.externalSubId);
    const yearly = s.items.data[0]?.price?.recurring?.interval === "year";
    const gross = s.items.data.reduce((sum, i) => sum + (i.price.unit_amount ?? 0) * (i.quantity ?? 1), 0);
    out.billedCents = yearly ? Math.round(gross / 10) : gross;
    out.billedPages = billedPageCount(s);
    out.legacy = customItemsOf(s).legacy.length > 0;
    out.stripeStatus = s.status;
  } catch {
    // Unreachable subscription: the sheet shows our record only.
  }
  return out;
}

export async function setAdminCustomPages(input: {
  organizationId: string;
  pages: string[];
  billing: "customer" | "none";
  reason: string;
}): Promise<{ ok: true; pages: string[]; chargedCents: number } | { ok: false; error: string }> {
  const admin = await requirePlatformAdmin();
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 3) return { ok: false, error: "Give a reason first." };
  const billing = input.billing === "none" ? "none" : "customer";
  const res = await changeCustomPages({
    organizationId: input.organizationId,
    next: normalizeCustomPages(Array.isArray(input.pages) ? input.pages.map(String) : []),
    billing,
  });
  if (!res.ok) return res;
  await logActivity({
    organizationId: input.organizationId,
    actorId: admin.id,
    kind: TRAIL_KINDS.SETTINGS,
    summary: `JobFlex admin ${admin.email ?? ""} changed the custom plan's pages${billing === "none" ? " (access only, billing unchanged)" : ""}: ${reason}`,
    meta: { area: "billing", pages: res.pages, added: res.added, removed: res.removed, billing, chargedCents: res.chargedCents },
  }).catch(() => {});
  revalidatePlanSurfaces();
  revalidatePath("/admin/users");
  revalidatePath("/admin/subscribers");
  revalidatePath("/dashboard", "layout");
  return { ok: true, pages: res.pages, chargedCents: res.chargedCents };
}
