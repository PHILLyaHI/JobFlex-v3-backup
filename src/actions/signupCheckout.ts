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
import { randomUUID, randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { TRADE_TYPES } from "@/lib/tradeTypes";
import type Stripe from "stripe";
import { bindAttributionToOrg } from "@/lib/attribution";
import { syncSubscriptionFromStripe } from "@/lib/stripeSync";
import { subscriptionPeriodEndDate } from "@/lib/stripeCompat";
import { getStripeClient, isStripeEnabled } from "@/lib/sdk/stripe";
import { getPlanBySlug } from "@/lib/planCatalogServer";
import { CUSTOM_PLAN_SLUG, normalizeCustomPages } from "@/lib/customPlan";
import { SubscriptionStatus } from "@/lib/prismaEnums";
import { enforceRateLimit, clientIp, HOUR } from "@/lib/rateLimit";
import { mintSigninTicket } from "@/lib/signinTicket";
import { readGoogleSignup } from "@/lib/googleSignup";
import { settleReferralsForSignupOrg } from "@/lib/referralRewards";
import { after } from "next/server";
import { captureSignupOutcome, trafficIdentitySchema } from "@/lib/traffic-capture-server";
import { fbcFromFbclid, sendMetaEvent, type MetaSignupContext } from "@/lib/metaCapi";
import { metaStartTrial } from "@/lib/metaSignupEvents";
import { sendWelcomeFirstEstimate } from "@/lib/email/welcome";
import { trackActivation } from "@/lib/activation-events";
import { trialRequiresCard } from "@/lib/trialPolicy";
import { createCardlessSubscription, nameOrgOnSubscription } from "@/lib/cardlessTrial";
import { writeCardlessRecord } from "@/lib/trialState";
import { cardlessTrialRefusal, markCardlessTrialUsed, trialRequestsPerIpHour } from "@/lib/trialGuard";
import { appBaseUrl } from "@/lib/appUrl";
import { renderEmail } from "@/lib/email/renderEmail";
import { sendEmail } from "@/lib/sdk/resend";
import { buildTrialConfirm } from "@/lib/email/build/trial";

/** How long an unpaid intent is honoured. Long enough to pay, short enough
 *  that an abandoned card never becomes an account a week later. */
const PENDING_TTL_MS = 2 * 60 * 60 * 1000;
/** How long a card-less trial's confirmation link stays good. */
const CONFIRM_TTL_MS = 24 * 60 * 60 * 1000;

const pendingSchema = z.object({
  analytics: trafficIdentitySchema.optional().catch(undefined),
  name: z.string().trim().min(1, "Enter your name").max(120),
  // Optional since 2026-10-01 (owner): the company step can be left blank.
  // A blank name becomes "<first name>'s company" in startPendingSignup.
  businessName: z.string().trim().max(120).default(""),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  // One of the two: a password, or the handle of a parked Google identity
  // (lib/googleSignup) whose email must match.
  password: z.string().min(8, "Password must be at least 8 characters").max(200).optional(),
  googleToken: z.string().min(20).max(80).optional(),
  companyAddress: z.string().trim().max(240).optional(),
  companyPhone: z.string().trim().max(40).optional(),
  tradeTypes: z.array(z.enum(TRADE_TYPES)).max(TRADE_TYPES.length).optional(),
  otherTrade: z.string().trim().max(80).optional(),
  /** The trade hero the visitor arrived through (`?industry=` on the landing),
   *  kept next to the promo/referral attribution so the signup can be read
   *  back to its campaign. Advisory only — never overrides tradeTypes. */
  landingIndustry: z.enum(TRADE_TYPES).optional(),
  /** The signup flow, recorded on the organization and carried on the
   *  completion event. "e" — landing-e's arm (pass A, 2026-09-11) — is the
   *  only flow since 2026-09-16; older organizations carry null ("d"). */
  signupVariant: z.enum(["e"]).optional(),
  /** The visit's utm_*, as the landing carried them (CRO stage 1, 2026-09-09). */
  utm: z
    .object({
      utm_source: z.string().trim().max(120).optional(),
      utm_medium: z.string().trim().max(120).optional(),
      utm_campaign: z.string().trim().max(120).optional(),
      utm_content: z.string().trim().max(120).optional(),
      utm_term: z.string().trim().max(120).optional(),
    })
    .optional(),
  attribution: z
    .object({ kind: z.enum(["promo", "ref"]), code: z.string().trim().min(3).max(40) })
    .nullish(),
  /** Meta Pixel context from the browser (2026-09-09): the marketing consent
   *  the banner recorded, the event ids the browser's own events carry (so
   *  the server copies deduplicate), and the pixel's cookies when consented. */
  meta: z
    .object({
      consent: z.boolean(),
      registrationEventId: z.string().min(8).max(80),
      checkoutEventId: z.string().min(8).max(80).optional(),
      fbp: z.string().max(120).optional(),
      fbc: z.string().max(400).optional(),
      /** Meta's click id from the register link (`?fbclid=`). A malformed one
       *  is dropped rather than failing the signup. */
      fbclid: z.string().regex(/^[\w-]{1,500}$/).optional().catch(undefined),
      sourceUrl: z.string().max(400).optional(),
    })
    .optional(),
  /** Add-on pages, when the custom plan is the one being bought. Stored with
   *  the intent so checkout and account creation price and record the SAME
   *  selection — the client never gets to name a price. */
  customPages: z.array(z.string().max(40)).max(40).optional(),
});

type PendingRecord = z.infer<typeof pendingSchema> extends infer T
  ? Omit<Extract<T, object>, "password" | "googleToken" | "meta"> & {
      /** The browser's Meta context plus, with consent, the request's IP and UA. */
      meta?: MetaSignupContext;
      /** Null for a Google-backed signup — the finished account signs in with Google. */
      hashedPassword: string | null;
      viaGoogle?: boolean;
      image?: string | null;
      createdAt: number;
      /** Set by requestCardlessTrial: the plan the card-less trial is for, and
       *  when the confirmation link went out (the intent then lives 24 hours). */
      cardless?: { planSlug: string; requestedAt: number };
    }
  : never;

function key(token: string): string {
  return `signup:${token}`;
}

/** The IP and user agent join the Meta context ONLY with marketing consent;
 *  without it the Conversions API gets the hashed email alone. The same goes
 *  for the click id: with consent, an fbc is built from `fbclid` when the
 *  pixel's _fbc cookie is missing (consent given after the landing, or the
 *  pixel blocked), and the fbclid is kept for the events that come later.
 *  fbp / fbc (2026-10-01): the request's own _fbp / _fbc cookies first, the
 *  values the browser put in the body when the request has none. */
async function metaContextFor(meta: z.infer<typeof pendingSchema>["meta"]): Promise<MetaSignupContext | undefined> {
  if (!meta) return undefined;
  const ctx: MetaSignupContext = { consent: meta.consent, registrationEventId: meta.registrationEventId, checkoutEventId: meta.checkoutEventId, sourceUrl: meta.sourceUrl };
  if (meta.consent) {
    let jarFbp: string | undefined;
    let jarFbc: string | undefined;
    try {
      const { cookies } = await import("next/headers");
      const jar = await cookies();
      jarFbp = jar.get("_fbp")?.value?.slice(0, 120) || undefined;
      jarFbc = jar.get("_fbc")?.value?.slice(0, 400) || undefined;
    } catch {
      /* no request cookies — the body's values stand */
    }
    ctx.fbp = jarFbp || meta.fbp;
    ctx.fbclid = meta.fbclid;
    ctx.fbc = jarFbc || meta.fbc || fbcFromFbclid(meta.fbclid, Date.now());
    try {
      const { headers } = await import("next/headers");
      const h = await headers();
      ctx.clientIp = await clientIp();
      ctx.userAgent = h.get("user-agent")?.slice(0, 400) ?? undefined;
    } catch {
      /* no request headers — the event goes without them */
    }
  }
  return ctx;
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
    analytics: data.analytics,
    name: data.name,
    businessName: data.businessName || `${data.name.split(/\s+/)[0]}'s company`,
    email: data.email,
    companyAddress: data.companyAddress,
    companyPhone: data.companyPhone,
    tradeTypes: data.tradeTypes,
    otherTrade: data.otherTrade,
    landingIndustry: data.landingIndustry,
    signupVariant: data.signupVariant,
    utm: data.utm,
    meta: await metaContextFor(data.meta),
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
  // Meta InitiateCheckout — the server copy of the event the browser fires as
  // this answer moves it to the plan step (same event_id, so the pair is one).
  const meta = record.meta;
  if (meta?.checkoutEventId) {
    const checkoutEventId = meta.checkoutEventId;
    after(() =>
      sendMetaEvent({
        eventName: "InitiateCheckout",
        eventId: checkoutEventId,
        sourceUrl: meta.sourceUrl ?? null,
        consent: meta.consent,
        user: { email: record.email, phone: record.companyPhone ?? null, fbp: meta.fbp, fbc: meta.fbc, clientIp: meta.clientIp, userAgent: meta.userAgent },
        custom: {
          content_category: record.landingIndustry ?? "default",
          utm_source: record.utm?.utm_source,
          utm_medium: record.utm?.utm_medium,
          utm_campaign: record.utm?.utm_campaign,
          utm_content: record.utm?.utm_content,
        },
      }),
    );
  }
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
    // A card-less trial waits on an email link, so it gets a day, counted from
    // the latest link sent; every other intent has the checkout's two hours.
    const alive = rec?.cardless
      ? Date.now() - rec.cardless.requestedAt <= CONFIRM_TTL_MS
      : Date.now() - (rec?.createdAt ?? 0) <= PENDING_TTL_MS;
    if (!rec?.email || !alive) return null;
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
  let stripeSubscription: Stripe.Subscription | null = null;
  let planSlug: string | null = null;
  let trialEnd: Date | null = null;
  let periodEnd: Date | null = null;
  let analyticsOutcome = "subscription_activated";
  let analyticsLive = false;
  // The page selection the customer actually PAID for. Stamped into the
  // Checkout session's metadata by the checkout route from the intent as it
  // was when the price was computed; read back from Stripe (immutable to the
  // client) rather than from the intent, which updatePendingSignupPages can
  // still rewrite after the session was priced.
  let paidCustomPages: string[] | null = null;
  // What the checkout charged, for Meta's StartTrial value.
  let checkoutAmount: number | null = null;
  let checkoutCurrency: string | null = null;

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
      analyticsLive = session.livemode;
      checkoutAmount = session.amount_total;
      checkoutCurrency = session.currency;
      if (session.payment_status === "paid" && (session.amount_total ?? 0) > 0) analyticsOutcome = "subscription_purchased";
      stripeCustomerId = typeof session.customer === "string" ? session.customer : null;
      const sub = session.subscription;
      if (sub && typeof sub !== "string") {
        if (sub.status === "trialing") analyticsOutcome = "trial_started";
        stripeSubscriptionId = sub.id;
        stripeSubscription = sub;
        trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
        periodEnd = subscriptionPeriodEndDate(sub);
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

  return createAccountFromPending(token, rec, {
    flow: sessionId ? "checkout" : "skip",
    sessionId,
    stripeCustomerId,
    stripeSubscriptionId,
    stripeSubscription,
    planSlug,
    trialEnd,
    periodEnd,
    paidCustomPages,
    analyticsOutcome,
    analyticsLive,
    checkoutAmount,
    checkoutCurrency,
  });
}

/**
 * THE CARD-LESS TRIAL, STEP ONE (TRIAL_REQUIRES_CARD off — lib/trialPolicy).
 * The plan step's "Start free trial" lands here instead of at Stripe
 * Checkout. Nothing is created yet (owner, 2026-10-01: "confirm before the
 * dashboard"): the brakes are checked (lib/trialGuard — per IP, per address,
 * per company domain), the plan is stamped on the intent, and a confirmation
 * link is emailed. Calling it again sends a fresh link (the old one stops
 * working). The account and the trial are created by confirmCardlessTrial.
 */
export async function requestCardlessTrial(
  token: string,
  planSlug: string,
): Promise<
  | {
      ok: true;
      email: string;
      resendAt: number;
      /** Set when no confirmation email is sent: the account exists already. */
      created?: { ticket: string | null; registrationEventId: string | null; subscriptionId: string | null };
    }
  | { ok: false; error: string; resendAt?: number }
> {
  if (trialRequiresCard()) return { ok: false, error: "Choose a plan to finish creating your account." };
  const rec = await loadPending(token);
  if (!rec) return { ok: false, error: "That signup expired. Start again." };
  const taken = await db.user.findUnique({ where: { email: rec.email }, select: { id: true } });
  if (taken) return { ok: false, error: "That email is already registered. Try signing in." };
  // THE BRAKES. A first request counts against the network (trials per IP per
  // hour); a resend counts against this signup only — RESEND_COOLDOWN_MS
  // between two links, RESEND_MAX in an hour — so asking for the email again
  // never spends a neighbour's trial.
  if (rec.cardless) {
    const wait = rec.cardless.requestedAt + RESEND_COOLDOWN_MS - Date.now();
    if (wait > 0) {
      return { ok: false, error: `Wait ${Math.ceil(wait / 1000)} s before sending another link.`, resendAt: rec.cardless.requestedAt + RESEND_COOLDOWN_MS };
    }
    try {
      await enforceRateLimit(`cardless-resend:${token}`, RESEND_MAX, HOUR, "confirmation emails");
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Too many confirmation emails. Try again later." };
    }
  } else {
    try {
      await enforceRateLimit(`cardless-trial:${await clientIp()}`, trialRequestsPerIpHour(), HOUR, "free trials from this network");
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Too many free trials. Try again later." };
    }
  }
  const refusal = await cardlessTrialRefusal(rec.email);
  if (refusal) return { ok: false, error: refusal };
  let planName = "Custom";
  if (planSlug !== CUSTOM_PLAN_SLUG) {
    const plan = await getPlanBySlug(planSlug);
    if (!plan || !plan.active || plan.isFree) return { ok: false, error: "That plan is not available." };
    planName = plan.name;
  }

  /* NO EMAIL CONFIRMATION FOR NOW (owner, 2026-10-01): the trial and the
     account are created right here and the browser is signed in with the
     ticket, the address left unverified. SIGNUP_CONFIRM_EMAIL=true brings
     back the emailed link (the code below). */
  if (!signupConfirmsEmail()) {
    const stamped: PendingRecord = { ...rec, cardless: { planSlug, requestedAt: Date.now() } };
    await db.syncState.upsert({ where: { key: key(token) }, update: { cursor: JSON.stringify(stamped) }, create: { key: key(token), cursor: JSON.stringify(stamped) } });
    const done = await finishCardlessTrial(token, { verified: false });
    if (!done.ok) return { ok: false, error: done.error };
    return { ok: true, email: done.email, resendAt: 0, created: { ticket: done.ticket, registrationEventId: done.registrationEventId, subscriptionId: done.subscriptionId } };
  }

  // The link: a random secret in the email, its hash in the store, pointing
  // at this intent. A new request replaces the old link.
  const secret = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(secret).digest("hex");
  const prev = await db.syncState.findUnique({ where: { key: confirmIndexKey(token) } }).catch(() => null);
  if (prev) await db.syncState.delete({ where: { key: confirmKey(prev.cursor) } }).catch(() => {});
  const next: PendingRecord = { ...rec, cardless: { planSlug, requestedAt: Date.now() } };
  await db.syncState.upsert({ where: { key: key(token) }, update: { cursor: JSON.stringify(next) }, create: { key: key(token), cursor: JSON.stringify(next) } });
  await db.syncState.upsert({ where: { key: confirmKey(hash) }, update: { cursor: token }, create: { key: confirmKey(hash), cursor: token } });
  await db.syncState.upsert({ where: { key: confirmIndexKey(token) }, update: { cursor: hash }, create: { key: confirmIndexKey(token), cursor: hash } });

  const base = (await appBaseUrl()).replace(/\/$/, "");
  const { subject, html } = renderEmail(
    buildTrialConfirm({ name: rec.name, planName, href: `${base}/auth/register/confirm?t=${secret}` }),
  );
  try {
    await sendEmail({ to: rec.email, subject, html });
  } catch (err) {
    console.error("[signup] trial confirmation email failed:", err);
    return { ok: false, error: "Couldn't send the confirmation email. Try again." };
  }
  return { ok: true, email: rec.email, resendAt: next.cardless!.requestedAt + RESEND_COOLDOWN_MS };
}

/** Whether the card-less trial waits for the emailed link. Off unless
 *  SIGNUP_CONFIRM_EMAIL=true (owner, 2026-10-01: not needed right now). */
function signupConfirmsEmail(): boolean {
  return process.env.SIGNUP_CONFIRM_EMAIL?.trim().toLowerCase() === "true";
}

/** A minute between two confirmation emails, and three resends an hour. */
const RESEND_COOLDOWN_MS = 60 * 1000;
const RESEND_MAX = 3;

/**
 * THE CARD-LESS TRIAL, STEP TWO: the link from the email. Proves the address,
 * then creates the trialing subscription (no payment method —
 * lib/cardlessTrial) and the same account the paid return creates, with
 * everything that waited for completePendingSignup — the welcome email, the
 * attribution, metaSignupJson, CompleteRegistration and StartTrial. Answers a
 * sign-in ticket the confirmation page redeems. Opening the link again within
 * fifteen minutes signs in again; later it says the shop is already set up.
 */
export async function confirmCardlessTrial(
  secret: string,
): Promise<
  | { ok: true; email: string; ticket: string | null; registrationEventId: string | null; subscriptionId: string | null }
  | { ok: false; error: string; done?: boolean; email?: string }
> {
  if (!secret || secret.length > 200) return { ok: false, error: "That link is not valid." };
  const hash = createHash("sha256").update(secret).digest("hex");
  const row = await db.syncState.findUnique({ where: { key: confirmKey(hash) } }).catch(() => null);
  if (!row) return { ok: false, error: "That link has expired or was replaced by a newer one. Start the signup again." };
  const res = await finishCardlessTrial(row.cursor, { verified: true });
  // Used once: the link is gone, and opening it again goes to sign-in (the
  // done marker answers `done`) instead of signing anybody in a second time.
  if (res.ok) await db.syncState.delete({ where: { key: confirmIndexKey(row.cursor) } }).catch(() => {});
  return res;
}

const confirmKey = (hash: string) => `signup-confirm:${hash}`;
const confirmIndexKey = (token: string) => `signup-confirm-of:${token}`;

/** The account and the trial, from an intent with a plan stamped on it. Not
 *  exported: the ways in are the emailed link (confirmCardlessTrial) and,
 *  while confirmation is off, requestCardlessTrial itself. */
async function finishCardlessTrial(
  token: string,
  opts: { verified: boolean },
): Promise<
  | { ok: true; email: string; ticket: string | null; registrationEventId: string | null; subscriptionId: string | null }
  | { ok: false; error: string; done?: boolean; email?: string }
> {
  if (trialRequiresCard()) return { ok: false, error: "Choose a plan to finish creating your account." };
  const rec = await loadPending(token);
  if (!rec?.cardless) {
    const done = await loadDone(token);
    if (done && done.sessionId === CARDLESS_SESSION) {
      return { ok: false, done: true, email: done.email, error: "This link was already used. Sign in to open your shop." };
    }
    return { ok: false, error: "This link has expired — links last 24 hours. Start the signup again." };
  }
  const taken = await db.user.findUnique({ where: { email: rec.email }, select: { id: true } });
  if (taken) return { ok: false, error: "That email is already registered. Try signing in." };
  const refusal = await cardlessTrialRefusal(rec.email);
  if (refusal) return { ok: false, error: refusal };

  const planSlug = rec.cardless.planSlug;
  const interval = "MONTH" as const;
  const customPages = planSlug === CUSTOM_PLAN_SLUG ? normalizeCustomPages(rec.customPages) : [];
  const started = await createCardlessSubscription({
    token,
    email: rec.email,
    businessName: rec.businessName,
    planSlug,
    interval,
    customPages,
    attribution: rec.attribution ?? null,
  });
  if (!started.ok) return { ok: false, error: started.error };
  const sub = started.subscription;
  const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;

  const created = await createAccountFromPending(token, rec, {
    flow: "cardless",
    sessionId: CARDLESS_SESSION,
    stripeCustomerId: started.customerId,
    stripeSubscriptionId: sub.id,
    stripeSubscription: sub,
    planSlug: started.planLabel,
    trialEnd,
    periodEnd: subscriptionPeriodEndDate(sub),
    paidCustomPages: started.customPages,
    analyticsOutcome: "trial_started",
    analyticsLive: sub.livemode,
    checkoutAmount: 0,
    checkoutCurrency: sub.currency ?? "usd",
  });
  if (!created.ok) {
    // The account could not be created (the address was taken a moment ago):
    // the trial it was for must not keep running in Stripe.
    try {
      const { stripe } = await getStripeClient();
      await stripe.subscriptions.cancel(sub.id);
    } catch (err) {
      console.warn("[signup] orphan card-less trial not cancelled:", err);
    }
    return created;
  }
  await writeCardlessRecord(created.orgId, {
    subId: sub.id,
    customerId: started.customerId,
    planSlug: started.planLabel,
    interval,
    customPages: started.customPages,
    mode: started.mode,
    startedAt: new Date().toISOString(),
    endsAt: (trialEnd ?? new Date()).toISOString(),
  });
  // The address is proven — the link was opened from it.
  if (opts.verified) {
    await db.user.update({ where: { id: created.userId }, data: { emailVerified: new Date() } }).catch(() => {});
  }
  await markCardlessTrialUsed(rec.email, created.orgId);
  after(() => nameOrgOnSubscription(sub.id, created.orgId));
  return { ok: true, email: created.email, ticket: created.ticket, registrationEventId: rec.meta?.registrationEventId ?? null, subscriptionId: sub.id };
}

/** The done record's "session" for a card-less trial — there is no Checkout. */
const CARDLESS_SESSION = "cardless";

/** What the account is created WITH: the Stripe side of a paid checkout, of
 *  a card-less trial, or nothing at all (the non-production skip). */
type AccountBilling = {
  flow: "checkout" | "cardless" | "skip";
  /** The Stripe Checkout session (paid flow), or the marker the done record
   *  replays against (card-less: "cardless"); null on the skip. */
  sessionId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscription: Stripe.Subscription | null;
  planSlug: string | null;
  trialEnd: Date | null;
  periodEnd: Date | null;
  /** The page selection the subscription was priced with (custom plan). */
  paidCustomPages: string[] | null;
  analyticsOutcome: string;
  analyticsLive: boolean;
  checkoutAmount: number | null;
  checkoutCurrency: string | null;
};

/**
 * The account itself: Organization + owner User + Membership, the
 * Subscription row, the Lead Center pin, the custom pages, the attribution,
 * the done marker, the sign-in ticket, and after the response the welcome
 * email, the analytics outcome and Meta's CompleteRegistration / StartTrial.
 * Shared by the paid return (completePendingSignup) and the card-less trial
 * (completeCardlessSignup) — split out of completePendingSignup unchanged
 * (2026-10-01), so the two flows create the same account.
 */
async function createAccountFromPending(
  token: string,
  rec: PendingRecord,
  billing: AccountBilling,
): Promise<
  | { ok: true; email: string; ticket: string | null; orgId: string; userId: string }
  | { ok: false; error: string }
> {
  const {
    sessionId,
    stripeCustomerId,
    stripeSubscriptionId,
    stripeSubscription,
    planSlug,
    trialEnd,
    periodEnd,
    paidCustomPages,
    analyticsOutcome,
    analyticsLive,
    checkoutAmount,
    checkoutCurrency,
  } = billing;
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
          // Where the signup came from — the landing's trade hero and the
          // visit's utm_*, first write, never overwritten (CRO stage 1).
          landingIndustry: rec.landingIndustry ?? null,
          signupVariant: rec.signupVariant ?? null,
          utmSource: rec.utm?.utm_source || null,
          utmMedium: rec.utm?.utm_medium || null,
          utmCampaign: rec.utm?.utm_campaign || null,
          utmContent: rec.utm?.utm_content || null,
          metaSignupJson: rec.meta ? JSON.stringify(rec.meta) : null,
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

  // Sent after the response, so it reads the subscription row written below.
  trackActivation("organization_created", orgId, { flow: billing.flow === "cardless" ? "cardless" : "checkout" });

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

  // LEAD CENTER ELIGIBILITY. The matcher hard-filters on a geocoded address
  // (lib/leadCenter/matching), so the pin has to be placed by the action that
  // CREATES the shop. This path never did it — only the legacy free-signup
  // action geocoded — so every shop created through checkout was born
  // invisible to routing while its own Company page read "Matching on".
  //
  // Same routine the Company profile save runs (lib/leadCenter/eligibility),
  // with one difference: a shop that cannot be placed is created with lead
  // offers OFF and the reason recorded, rather than left switched on and
  // silently unreachable. Best-effort — the account is already committed.
  try {
    const { geocodeOrgAddress } = await import("@/lib/leadCenter/eligibility");
    const geo = await geocodeOrgAddress(orgId, rec.companyAddress, { gateOnFailure: true });
    if (!geo.ok) {
      console.warn(`[signup] org ${orgId} not routable at creation: ${geo.reason}`);
    }
  } catch (err) {
    console.warn("[signup] geocode step failed:", err);
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

  // THE PARTNER'S ATTRIBUTION, written now rather than left to the webhook. At
  // session creation there was no organisation for the subscription's metadata
  // to name, so customer.subscription.created could not be mapped and wrote
  // nothing; the next event used to repair it — unless the shop upgraded first,
  // and the replacement carries no code. The subscription came back expanded
  // with the session above; on clover its discounts are ids, which takes one
  // Stripe call when a code was used. Best-effort: the webhook and the
  // reconcile cron still get their turn.
  if (stripeSubscription) {
    const client = isStripeEnabled() ? ((await getStripeClient().catch(() => null))?.stripe ?? null) : null;
    await syncSubscriptionFromStripe(stripeSubscription, client).catch((err) =>
      console.warn("[signup] subscription sync failed:", err),
    );
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
  if (sessionId && rec.analytics) {
    after(() => captureSignupOutcome(rec.analytics, billing.flow === "cardless" && stripeSubscriptionId ? stripeSubscriptionId : sessionId, analyticsOutcome, planSlug, analyticsLive, rec.landingIndustry ?? null, rec.utm ?? null, rec.signupVariant ?? null));
  }
  // The welcome email (landing-e pass A; every signup since 2026-09-16). Sent
  // after the response; a failure is logged, never shown — the account
  // already exists.
  {
    const welcome = {
      to: rec.email,
      name: rec.name,
      tradeTypes: rec.tradeTypes ?? [],
      landingIndustry: rec.landingIndustry ?? null,
      firstChargeAt: trialEnd ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      cardless: billing.flow === "cardless",
    };
    after(() => sendWelcomeFirstEstimate(welcome).catch((e) => console.warn("[signup] welcome email failed:", e)));
  }
  // Meta CompleteRegistration — the server copy of the browser's event (same
  // event_id). Goes with or without consent; consent decides whether fbp/fbc,
  // IP and UA ride along (lib/metaCapi).
  if (rec.meta) {
    const meta = rec.meta;
    after(() =>
      sendMetaEvent({
        eventName: "CompleteRegistration",
        eventId: meta.registrationEventId,
        sourceUrl: meta.sourceUrl ?? null,
        consent: meta.consent,
        user: { email: rec.email, phone: rec.companyPhone ?? null, fbp: meta.fbp, fbc: meta.fbc, clientIp: meta.clientIp, userAgent: meta.userAgent, externalId: orgId },
        custom: {
          industry: rec.landingIndustry ?? "default",
          plan: planSlug ?? "none",
          billing_mode: analyticsLive ? "live" : "test",
          utm_source: rec.utm?.utm_source,
          utm_medium: rec.utm?.utm_medium,
          utm_campaign: rec.utm?.utm_campaign,
          utm_content: rec.utm?.utm_content,
        },
      }),
    );
  }
  // Meta StartTrial on the return from Stripe. The webhook sends it too, but
  // when it arrives before this return has created the organization it finds
  // nothing to name and sent nothing; metaStartTrial sends it once either way.
  if (rec.meta && stripeSubscription?.status === "trialing") {
    const sub = stripeSubscription;
    after(() =>
      metaStartTrial(orgId, sub, { amountTotal: checkoutAmount, currency: checkoutCurrency }).catch((err) =>
        console.warn("[meta:capi] StartTrial failed", err),
      ),
    );
  }
  return { ok: true, email: rec.email, ticket, orgId, userId };
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
