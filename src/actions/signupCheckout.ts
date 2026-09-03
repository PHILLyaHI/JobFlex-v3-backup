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
import { getStripeClient, isStripeEnabled } from "@/lib/sdk/stripe";
import { getPlanBySlug } from "@/lib/planCatalogServer";
import { CUSTOM_PLAN_SLUG, normalizeCustomPages } from "@/lib/customPlan";
import { SubscriptionStatus } from "@/lib/prismaEnums";
import { enforceRateLimit, clientIp, HOUR } from "@/lib/rateLimit";
import { mintSigninTicket } from "@/lib/signinTicket";
import { readGoogleSignup } from "@/lib/googleSignup";
import { settleReferralsForSignupOrg } from "@/lib/referralRewards";

/** How long an unpaid intent is honoured. Long enough to pay, short enough
 *  that an abandoned card never becomes an account a week later. */
const PENDING_TTL_MS = 2 * 60 * 60 * 1000;

const pendingSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  businessName: z.string().trim().min(1, "Enter your business name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  // One of the two: a password, or the handle of a parked Google identity
  // (lib/googleSignup) whose email must match.
  password: z.string().min(8, "Password must be at least 8 characters").max(200).optional(),
  googleToken: z.string().min(20).max(80).optional(),
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
  ? Omit<Extract<T, object>, "password" | "googleToken"> & {
      /** Null for a Google-backed signup — the finished account signs in with Google. */
      hashedPassword: string | null;
      viaGoogle?: boolean;
      image?: string | null;
      createdAt: number;
    }
  : never;

function key(token: string): string {
  return `signup:${token}`;
}

export async function startPendingSignup(raw: unknown): Promise<{ ok: true; token: string }> {
  const data = pendingSchema.parse(raw);
  await enforceRateLimit(`signup-start:${await clientIp()}`, 5, HOUR, "sign-ups");

  // Google-backed: the address is the one Google verified, whatever the form
  // says, and there is no password to hash.
  let google: { email: string; image: string | null } | null = null;
  if (data.googleToken) {
    const g = await readGoogleSignup(data.googleToken);
    if (!g) throw new Error("Your Google sign-in expired. Continue with Google again.");
    google = { email: g.email, image: g.image };
    data.email = g.email;
  } else if (!data.password) {
    throw new Error("Choose a password, or continue with Google.");
  }

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
    hashedPassword: google ? null : await bcrypt.hash(data.password as string, 10),
    viaGoogle: Boolean(google),
    image: google?.image ?? null,
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
export async function readPendingSignup(token: string): Promise<{
  email: string;
  businessName: string;
  customPages: string[];
  attribution: { kind: "promo" | "ref"; code: string } | null;
} | null> {
  const rec = await loadPending(token);
  return rec
    ? {
        email: rec.email,
        businessName: rec.businessName,
        customPages: normalizeCustomPages(rec.customPages),
        attribution: rec.attribution ?? null,
      }
    : null;
}

/* THE RELOAD PROBLEM. The intent is spent by its first completion, so a
   reload of the return URL found nothing and said "That signup expired" over
   a shop that had just been created (owner's report, 2026-09-02). Completion
   now leaves a DONE marker behind the spent token for a day: a reload within
   REPLAY_WINDOW_MS, carrying the same Stripe session id, is handed a fresh
   sign-in ticket and lands where it left off; later reloads are told the shop
   is already set up and pointed at sign-in. The marker never recreates
   anything — the account exists exactly once. */
const DONE_TTL_MS = 24 * 60 * 60 * 1000;
const REPLAY_WINDOW_MS = 15 * 60 * 1000;

type DoneRecord = { userId: string; email: string; sessionId: string | null; at: number };

function doneKey(token: string): string {
  return `signup-done:${token}`;
}

async function loadDone(token: string): Promise<DoneRecord | null> {
  const row = await db.syncState.findUnique({ where: { key: doneKey(token) } }).catch(() => null);
  if (!row) return null;
  try {
    const rec = JSON.parse(row.cursor) as DoneRecord;
    if (!rec?.userId || Date.now() - (rec.at ?? 0) > DONE_TTL_MS) return null;
    return rec;
  } catch {
    return null;
  }
}

/**
 * Update the page selection on a live pending intent.
 *
 * THE $30-CHARGED-$20 BUG this closes: the intent is parked at the END OF STEP
 * 2, but the pages are picked on STEP 3 — so the selection stored with the
 * intent was whatever it held when the account form was submitted (empty), and
 * the checkout route, which prices ONLY from the intent (never the request
 * body, so a doctored request can't name its own price), charged the $20 base
 * no matter what was ticked. The client now calls this right before asking for
 * checkout; the same normalize-and-store, the same server-side pricing.
 */
export async function updatePendingSignupPages(
  token: string,
  pages: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rec = await loadPending(token);
  if (!rec) return { ok: false, error: "That signup expired. Start again." };
  const next: PendingRecord = {
    ...rec,
    customPages: normalizeCustomPages(Array.isArray(pages) ? pages.map(String) : []),
  };
  await db.syncState.upsert({
    where: { key: key(token) },
    update: { cursor: JSON.stringify(next) },
    create: { key: key(token), cursor: JSON.stringify(next) },
  });
  return { ok: true };
}

/**
 * Stamp (or clear) the validated code on a live intent. The intent is parked
 * at the END of step 2 and the code is typed on step 3 — so until 2026-09-02
 * the checkout route, which reads attribution ONLY from the intent, never saw
 * a code applied on the plan step, and Stripe charged full price under a
 * "10% off" line (owner's report). The client calls this right before it asks
 * for checkout, the same way it re-stamps the custom pages.
 */
export async function updatePendingSignupAttribution(
  token: string,
  attribution: { kind: "promo" | "ref"; code: string } | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rec = await loadPending(token);
  if (!rec) return { ok: false, error: "That signup expired. Start again." };
  const parsed = pendingSchema.shape.attribution.safeParse(attribution);
  const next: PendingRecord = { ...rec, attribution: parsed.success ? (parsed.data ?? null) : null };
  await db.syncState.upsert({
    where: { key: key(token) },
    update: { cursor: JSON.stringify(next) },
    create: { key: key(token), cursor: JSON.stringify(next) },
  });
  return { ok: true };
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
): Promise<
  | { ok: true; email: string; ticket: string | null }
  | { ok: false; error: string; done?: boolean; email?: string }
> {
  const rec = await loadPending(token);
  if (!rec) {
    const done = await loadDone(token);
    if (done && sessionId && done.sessionId === sessionId) {
      if (Date.now() - done.at <= REPLAY_WINDOW_MS) {
        return { ok: true, email: done.email, ticket: await mintSigninTicket(done.userId) };
      }
      return {
        ok: false,
        done: true,
        email: done.email,
        error: "This signup is already complete. Sign in to open your shop.",
      };
    }
    return { ok: false, error: "That signup expired. Start again." };
  }

  // The skip path ("create the account with no subscription") is a testing
  // exit. It is a public server action, so it is gated HERE, not in the UI:
  // production never honours it, and outside production only when the
  // operator opts in with SIGNUP_ALLOW_SKIP=true. Otherwise the paywall this
  // file exists to enforce could be walked around with one call.
  if (!sessionId) {
    const skipAllowed =
      process.env.NODE_ENV !== "production" && process.env.SIGNUP_ALLOW_SKIP === "true";
    if (!skipAllowed) return { ok: false, error: "Choose a plan to finish creating your account." };
  }

  let stripeCustomerId: string | null = null;
  let stripeSubscriptionId: string | null = null;
  let planSlug: string | null = null;
  let trialEnd: Date | null = null;
  let periodEnd: Date | null = null;
  // The page selection the customer actually PAID for. Stamped into the
  // Checkout session's metadata by the checkout route from the intent as it
  // was when the price was computed; read back from Stripe (immutable to the
  // client) rather than from the intent, which updatePendingSignupPages can
  // still rewrite after the session was priced.
  let paidCustomPages: string[] | null = null;

  if (sessionId) {
    if (!isStripeEnabled()) return { ok: false, error: "Checkout is not configured." };
    try {
      // Same mode the session was created under, as long as the admin switch
      // has not been flipped mid-checkout; a cross-mode session id simply
      // fails to retrieve, which reads as "couldn't verify" — correct.
      const { stripe } = await getStripeClient();
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
        periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
      } else if (typeof sub === "string") {
        stripeSubscriptionId = sub;
      }
      planSlug = (session.metadata?.planSlug as string | undefined) ?? null;
      const metaPages = session.metadata?.customPages;
      if (typeof metaPages === "string") {
        paidCustomPages = normalizeCustomPages(metaPages.split(",").filter(Boolean));
      }
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
  let userId: string;
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
          image: rec.image ?? null,
          activeOrgId: org.id,
        },
        select: { id: true },
      });
      await tx.membership.create({
        data: { userId: user.id, organizationId: org.id, role: "OWNER" },
      });
      return { orgId: org.id, userId: user.id };
    });
    orgId = created.orgId;
    userId = created.userId;
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
        // Status uses the canonical enum casing — the limits engine compares
        // against SubscriptionStatus.ACTIVE/TRIALING and treated the old
        // lowercase values as LAPSED (free quotas for a paying customer until
        // the webhook happened to overwrite the row). currentPeriodEnd makes
        // the row self-expiring if the webhook never arrives.
        update: {
          plan: planSlug === CUSTOM_PLAN_SLUG ? "CUSTOM" : (plan?.slug.toUpperCase() ?? "PRO"),
          status: trialEnd ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE,
          provider: "STRIPE",
          externalCustomerId: stripeCustomerId,
          externalSubId: stripeSubscriptionId,
          trialEndsAt: trialEnd,
          currentPeriodEnd: periodEnd,
        },
        create: {
          organizationId: orgId,
          plan: planSlug === CUSTOM_PLAN_SLUG ? "CUSTOM" : (plan?.slug.toUpperCase() ?? "PRO"),
          status: trialEnd ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE,
          provider: "STRIPE",
          externalCustomerId: stripeCustomerId,
          externalSubId: stripeSubscriptionId,
          trialEndsAt: trialEnd,
          currentPeriodEnd: periodEnd,
        },
      })
      .catch((err) => console.warn("[signup] subscription record failed:", err));
  }

  // The custom plan's page selection belongs to the workspace it was bought
  // for, so it is written the moment that workspace exists.
  // Paid selection wins; the intent's copy is only used on the (non-prod) skip
  // path where nothing was priced at all.
  const chosen = paidCustomPages ?? (sessionId ? [] : normalizeCustomPages(rec.customPages));
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
    // A referral counts the moment the referred shop's subscription exists
    // (see lib/referralRewards). Skipped on the no-subscription testing exit.
    if (rec.attribution.kind === "ref" && stripeSubscriptionId) {
      await settleReferralsForSignupOrg(orgId).catch((err) =>
        console.warn("[signup] referral settle failed:", err),
      );
    }
  }

  // The intent is spent; the done marker takes its place (see loadDone).
  await db.syncState.delete({ where: { key: key(token) } }).catch(() => {});
  const doneRec: DoneRecord = { userId, email: rec.email, sessionId, at: Date.now() };
  await db.syncState
    .upsert({
      where: { key: doneKey(token) },
      update: { cursor: JSON.stringify(doneRec) },
      create: { key: doneKey(token), cursor: JSON.stringify(doneRec) },
    })
    .catch(() => {});
  // The session hand-off: the client redeems this through the `signup-ticket`
  // provider so the shop lands on its dashboard already signed in, instead of
  // at the login wall with a password it typed two screens and one Stripe
  // round-trip ago.
  const ticket = await mintSigninTicket(userId);
  return { ok: true, email: rec.email, ticket };
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
