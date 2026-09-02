"use server";

// PAY FIRST, THEN THE ACCOUNT EXISTS.
//
// Until 2026-08-28 the flow created the workspace at the end of step 2 and only
// then showed the plan — so a visitor who never subscribed still had an account,
// a login and an org that would show up in the Lead Center's shop list. The
// owner's rule now: no subscription, no account.
//
// HOW IT WORKS WITHOUT INVENTING A TABLE
// A signup that has not been paid for is not a User and not an Organization; it
// is a PENDING intent. It is parked in `SyncState` — the app's existing
// key→string store, the same one the Lead Center's routing mode uses — under
// `signup:<token>`, holding the details plus a BCRYPT HASH of the password (the
// plaintext never leaves the browser's request, and nothing readable is stored).
// The row expires on read; a stale one is simply refused.
//
//   1. `startPendingSignup` validates and parks the intent, returns a token.
//   2. The plan step asks `/api/checkout/signup` for a Stripe Checkout session
//      carrying that token; Stripe collects the card and starts the trial.
//   3. `completePendingSignup(token, sessionId)` verifies the session with
//      Stripe, creates Organization + owner User + Membership, records the
//      Subscription, and consumes the token.
//
// The skip path (testing only) calls `completePendingSignup(token, null)`,
// which creates the same account with no subscription attached.
import { randomUUID, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { TRADE_TYPES } from "@/lib/tradeTypes";
import { bindAttributionToOrg } from "@/lib/attribution";
import { getStripe, isStripeEnabled } from "@/lib/sdk/stripe";
import { getPlanBySlug } from "@/lib/planCatalogServer";
import { CUSTOM_PLAN_SLUG, normalizeCustomPages } from "@/lib/customPlan";

/** How long an unpaid intent is honoured. Long enough to pay, short enough
 *  that an abandoned card never becomes an account a week later. */
const PENDING_TTL_MS = 2 * 60 * 60 * 1000;

const pendingSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  businessName: z.string().trim().min(1, "Enter your business name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  companyAddress: z.string().trim().max(240).optional(),
  companyPhone: z.string().trim().max(40).optional(),
  tradeTypes: z.array(z.enum(TRADE_TYPES)).max(TRADE_TYPES.length).optional(),
  otherTrade: z.string().trim().max(80).optional(),
  attribution: z
    .object({ kind: z.enum(["promo", "ref"]), code: z.string().trim().min(3).max(40) })
    .nullish(),
  /** Add-on pages, when the custom plan is the one being bought. Stored with
   *  the intent so checkout and account creation price and record the SAME
   *  selection — the client never gets to name a price. */
  customPages: z.array(z.string().max(40)).max(40).optional(),
});

type PendingRecord = z.infer<typeof pendingSchema> extends infer T
  ? Omit<Extract<T, object>, "password"> & { hashedPassword: string; createdAt: number }
  : never;

function key(token: string): string {
  return `signup:${token}`;
}

export async function startPendingSignup(raw: unknown): Promise<{ ok: true; token: string }> {
  const data = pendingSchema.parse(raw);

  // Same answer as registration gives, at the same point in the flow: you
  // cannot hide that an address is taken when the next step would collide.
  const existing = await db.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existing) {
    throw new Error("That email is already registered. Try signing in instead.");
  }

  const token = randomUUID();
  const record: PendingRecord = {
    name: data.name,
    businessName: data.businessName,
    email: data.email,
    companyAddress: data.companyAddress,
    companyPhone: data.companyPhone,
    tradeTypes: data.tradeTypes,
    otherTrade: data.otherTrade,
    attribution: data.attribution ?? null,
    customPages: normalizeCustomPages(data.customPages),
    hashedPassword: await bcrypt.hash(data.password, 10),
    createdAt: Date.now(),
  } as PendingRecord;

  await db.syncState.upsert({
    where: { key: key(token) },
    update: { cursor: JSON.stringify(record) },
    create: { key: key(token), cursor: JSON.stringify(record) },
  });
  return { ok: true, token };
}

/** Read a live intent, or null when it is missing or stale. */
export async function readPendingSignup(
  token: string,
): Promise<{ email: string; businessName: string; customPages: string[] } | null> {
  const rec = await loadPending(token);
  return rec
    ? {
        email: rec.email,
        businessName: rec.businessName,
        customPages: normalizeCustomPages(rec.customPages),
      }
    : null;
}

/** Record which pages a custom plan bought, for the org that was just created.
 *  Kept in the same key→string store the pending intent uses; the gate that
 *  reads it lives with the plan limits. */
export async function readOrgCustomPages(organizationId: string): Promise<string[]> {
  const row = await db.syncState.findUnique({ where: { key: `orgPages:${organizationId}` } }).catch(() => null);
  if (!row) return [];
  try {
    return normalizeCustomPages(JSON.parse(row.cursor) as string[]);
  } catch {
    return [];
  }
}

async function loadPending(token: string): Promise<PendingRecord | null> {
  if (!token) return null;
  const row = await db.syncState.findUnique({ where: { key: key(token) } }).catch(() => null);
  if (!row) return null;
  try {
    const rec = JSON.parse(row.cursor) as PendingRecord;
    if (!rec?.email || Date.now() - (rec.createdAt ?? 0) > PENDING_TTL_MS) return null;
    return rec;
  } catch {
    return null;
  }
}

/**
 * Turn a paid (or skipped) intent into a real workspace.
 *
 * `sessionId` is a Stripe Checkout session; when present it is verified against
 * Stripe AND against this token before anything is written — a guessed session
 * id belonging to somebody else's checkout creates nothing.
 */
export async function completePendingSignup(
  token: string,
  sessionId: string | null,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const rec = await loadPending(token);
  if (!rec) return { ok: false, error: "That signup expired. Start again." };

  let stripeCustomerId: string | null = null;
  let stripeSubscriptionId: string | null = null;
  let planSlug: string | null = null;
  let trialEnd: Date | null = null;

  if (sessionId) {
    if (!isStripeEnabled()) return { ok: false, error: "Checkout is not configured." };
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription"],
      });
      // The session must be THIS signup's, and it must have actually started.
      if (session.client_reference_id !== token) {
        return { ok: false, error: "That checkout does not belong to this signup." };
      }
      const paid = session.status === "complete" || session.payment_status === "paid";
      if (!paid) return { ok: false, error: "The payment has not completed yet." };
      stripeCustomerId = typeof session.customer === "string" ? session.customer : null;
      const sub = session.subscription;
      if (sub && typeof sub !== "string") {
        stripeSubscriptionId = sub.id;
        trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
      } else if (typeof sub === "string") {
        stripeSubscriptionId = sub;
      }
      planSlug = (session.metadata?.planSlug as string | undefined) ?? null;
    } catch (err) {
      console.warn("[signup] checkout verify failed:", err);
      return { ok: false, error: "Couldn't verify the payment. Try again." };
    }
  }

  // Re-check the address: somebody may have registered it while the card was
  // being typed.
  const taken = await db.user.findUnique({ where: { email: rec.email }, select: { id: true } });
  if (taken) return { ok: false, error: "That email is already registered. Try signing in." };

  const slug = await uniqueSlug(slugify(rec.businessName));
  let orgId: string;
  try {
    const created = await db.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: rec.businessName,
          slug,
          billingEmail: rec.email,
          address: rec.companyAddress || null,
          phone: rec.companyPhone || null,
          tradeTypesJson: JSON.stringify(rec.tradeTypes ?? []),
          otherTrade:
            rec.otherTrade && rec.tradeTypes?.includes("Other") ? rec.otherTrade : null,
        },
        select: { id: true },
      });
      const user = await tx.user.create({
        data: {
          email: rec.email,
          name: rec.name,
          hashedPassword: rec.hashedPassword,
          activeOrgId: org.id,
        },
        select: { id: true },
      });
      await tx.membership.create({
        data: { userId: user.id, organizationId: org.id, role: "OWNER" },
      });
      return { orgId: org.id };
    });
    orgId = created.orgId;
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") {
      return { ok: false, error: "That email is already registered. Try signing in." };
    }
    throw e;
  }

  // The subscription row, written here rather than by the webhook: at session
  // creation there was no organization for the webhook's metadata to name.
  if (stripeSubscriptionId || stripeCustomerId) {
    const plan =
      planSlug && planSlug !== CUSTOM_PLAN_SLUG ? await getPlanBySlug(planSlug) : null;
    await db.subscription
      .upsert({
        where: { organizationId: orgId },
        update: {
          plan: planSlug === CUSTOM_PLAN_SLUG ? "CUSTOM" : (plan?.slug.toUpperCase() ?? "PRO"),
          status: trialEnd ? "trialing" : "active",
          externalCustomerId: stripeCustomerId,
          externalSubId: stripeSubscriptionId,
          trialEndsAt: trialEnd,
        },
        create: {
          organizationId: orgId,
          plan: planSlug === CUSTOM_PLAN_SLUG ? "CUSTOM" : (plan?.slug.toUpperCase() ?? "PRO"),
          status: trialEnd ? "trialing" : "active",
          externalCustomerId: stripeCustomerId,
          externalSubId: stripeSubscriptionId,
          trialEndsAt: trialEnd,
        },
      })
      .catch((err) => console.warn("[signup] subscription record failed:", err));
  }

  // The custom plan's page selection belongs to the workspace it was bought
  // for, so it is written the moment that workspace exists.
  const chosen = normalizeCustomPages(rec.customPages);
  if (chosen.length || planSlug === CUSTOM_PLAN_SLUG) {
    await db.syncState
      .upsert({
        where: { key: `orgPages:${orgId}` },
        update: { cursor: JSON.stringify(chosen) },
        create: { key: `orgPages:${orgId}`, cursor: JSON.stringify(chosen) },
      })
      .catch((err) => console.warn("[signup] page selection not recorded:", err));
  }

  if (rec.attribution) {
    await bindAttributionToOrg(orgId, rec.email, rec.attribution.kind, rec.attribution.code).catch(
      () => {},
    );
  }

  // The intent is spent.
  await db.syncState.delete({ where: { key: key(token) } }).catch(() => {});
  return { ok: true, email: rec.email };
}

/* ── local helpers (the auth action's, kept private to this file) ───────── */

function slugify(v: string): string {
  return (
    v
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "shop"
  );
}

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  for (let i = 0; i < 40; i++) {
    const hit = await db.organization.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!hit) return candidate;
    candidate = `${base}-${createHash("sha1").update(base + i).digest("hex").slice(0, 4)}`;
  }
  return `${base}-${randomUUID().slice(0, 6)}`;
}
