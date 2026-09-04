// The import itself: old rows in, v3 rows out.
//
// Everything runs inside ONE interactive transaction (see index.ts), so a failure
// anywhere leaves the target untouched and --dry-run is simply "do all of it, then
// throw". Every write is create-only: an id that already exists is left exactly as
// it is, because after cutover the customer's own edits must outrank ours.
import type { Writer } from "./client";
import type { Flags } from "./config";
import {
  accountId, activityId, discountId, foreignClientId, installmentId, jobId,
  lineItemId, manifestKey, membershipId, orgId as orgIdFor, participantId,
  snapshotId, subscriptionId,
} from "./config";
import * as map from "./map";
import type { Reader } from "./client";
import * as src from "./source";
import type { StripeSub } from "./stripe";

/** The interactive-transaction client: same models, no nested $transaction. */
export type Tx = Omit<Writer, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export interface Manifest {
  version: 2;
  email: string;
  oldUserId: string;
  organizationId: string;
  userId: string;
  target: string;
  startedAt: string;
  argv: string[];
  created: Record<string, string[]>;
  skipped: Record<string, number>;
  notes: string[];
  /**
   * Set when the import took over the password of an account that already existed
   * in v3. Kept so --rollback can put the previous credential back.
   */
  passwordTakeover?: { userId: string; previousHash: string | null; previousCredentialVersion: number };
  /** How this account's plan was recorded — a Stripe-managed row, or a hand grant. */
  billing?: "stripe" | "grant";
  /** Set when a paid old plan was written over an existing free/lapsed v3 one. */
  subscriptionUpgrade?: {
    organizationId: string;
    previousPlan: string;
    previousStatus: string;
    previousProvider: string;
    previousCurrentPeriodEnd: string | null;
    previousExternalSubId: string | null;
    previousStripePriceId: string | null;
  };
}

export interface Ctx {
  flags: Flags;
  reader: Reader;
  tx: Tx;
  user: src.OldUser;
  manifest: Manifest;
  /** Old user ids that exist in the target, so FK-bearing columns can be trusted. */
  migratedUserIds: Set<string>;
  /**
   * Old client id -> the id it actually has inside THIS organisation. Usually the
   * same, but a client owned by another account gets a per-org copy.
   */
  clientIds: Map<string, string>;
  /** The live Stripe subscription for this account, when there is one. */
  stripeSub?: StripeSub;
}

const note = (ctx: Ctx, msg: string) => {
  ctx.manifest.notes.push(msg);
  console.log(`   · ${msg}`);
};

const track = (ctx: Ctx, model: string, id: string) => {
  (ctx.manifest.created[model] ??= []).push(id);
};

const skip = (ctx: Ctx, model: string) => {
  ctx.manifest.skipped[model] = (ctx.manifest.skipped[model] ?? 0) + 1;
};

/**
 * Create the row unless its id is already present. Create-only on purpose: an
 * `update` clause would revert whatever the customer changed after cutover, which
 * is the opposite of what a re-run should do.
 */
interface Delegate {
  findUnique: (args: { where: { id: string }; select: { id: true } }) => Promise<{ id: string } | null>;
  create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
}

/**
 * An id we are about to reuse must not already belong to a different organisation.
 * The old app's hybrid tenancy lets one row be visible to two accounts, and without
 * this the second import would silently skip the row and leave its own proposals
 * pointing into someone else's workspace.
 */
async function assertOwnedByOrg(
  ctx: Ctx,
  model: { findUnique: (a: { where: { id: string }; select: { organizationId: true } }) => Promise<{ organizationId: string } | null> },
  modelName: string,
  id: string,
): Promise<void> {
  const row = await model.findUnique({ where: { id }, select: { organizationId: true } });
  if (row && row.organizationId !== ctx.manifest.organizationId) {
    throw new Error(
      `${modelName} ${id} already exists in organisation ${row.organizationId}, not ${ctx.manifest.organizationId}. Refusing to re-parent it — roll that import back first.`,
    );
  }
}

async function createIfAbsent(
  ctx: Ctx,
  model: Delegate,
  modelName: string,
  id: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const existing = await model.findUnique({ where: { id }, select: { id: true } });
  if (existing) {
    skip(ctx, modelName);
    return false;
  }
  await model.create({ data: { id, ...data } });
  track(ctx, modelName, id);
  return true;
}

// ── phase 1 — identity ────────────────────────────────────────────────────────

/**
 * Organization + User + Account + Membership + Subscription.
 *
 * Everything a migrated account needs to load the dashboard at all:
 *  - a Membership, or requireOrg() throws NoOrgError and every page redirects
 *  - Organization.deletedAt null, same reason
 *  - a non-empty address OR tradeTypesJson, or needsCompanySetup() bounces the
 *    OWNER to /auth/register?setup=1 on every single dashboard load
 *  - a Subscription that does not look lapsed, or the org lands on FREE limits
 */
export async function phaseIdentity(ctx: Ctx): Promise<void> {
  const { tx, user, flags } = ctx;
  const settings = await src.findSettings(ctx.reader, user.id);
  const specialties = await src.findCompanySpecialties(ctx.reader, user.id);

  // Identity is resolved BEFORE the organisation, because an account that already
  // exists in v3 must receive its old data inside the workspace it already uses —
  // a second organisation would be invisible to it (requireOrg resolves the oldest
  // live membership, and this tool never rewrites activeOrgId on an existing user).
  const byEmail = await tx.user.findUnique({ where: { email: user.email }, select: { id: true } });
  let userId = user.id;
  let organizationId = orgIdFor(user.id);
  let reuseOrg = false;
  let needsActiveOrg = false;

  if (byEmail && byEmail.id !== user.id) {
    if (!flags.mergeIntoExisting) {
      throw new Error(
        `${user.email} already exists in the target as ${byEmail.id}. Re-run with --merge-into-existing to attach this data to that account; its old JobFlex password takes over unless --keep-existing-password is passed.`,
      );
    }
    userId = byEmail.id;
    // Only inherit an organisation this account OWNS. Being a MANAGER somewhere
    // (a demo org, an employer's workspace) is not a home for a migrated
    // business — dropping a paying customer's 114 clients into someone else's
    // company is worse than giving them a fresh workspace.
    const home = await tx.membership.findFirst({
      where: { userId, role: "OWNER", organization: { deletedAt: null } },
      orderBy: { createdAt: "asc" },
      select: { organizationId: true },
    });
    if (home) {
      organizationId = home.organizationId;
      reuseOrg = true;
      note(ctx, `merging into the existing v3 account ${byEmail.id} and the organisation it owns, ${organizationId}`);
    } else {
      // They exist in v3 but own nothing: build them their own workspace and make
      // it the one they land in, or requireOrg would keep resolving the other
      // membership and they would never see any of this.
      needsActiveOrg = true;
      note(ctx, `existing v3 account ${byEmail.id} owns no organisation — giving it a dedicated migrated workspace`);
    }
  }
  ctx.manifest.organizationId = organizationId;
  ctx.manifest.userId = userId;

  const orgName =
    map.firstStr([settings?.companyName, user.businessName, user.name, user.email.split("@")[0]]) ?? "Workspace";
  const trades = specialties.length ? specialties : ["General Contractor"];
  const address = map.firstStr([settings?.companyAddress]);

  if (reuseOrg) {
    // Their own organisation, left exactly as it is; only flag it if the setup
    // gate would bounce them.
    const org = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { address: true, tradeTypesJson: true, name: true },
    });
    let existingTrades: unknown = [];
    try {
      existingTrades = JSON.parse(org?.tradeTypesJson ?? "[]");
    } catch {
      existingTrades = [];
    }
    if (!org?.address?.trim() && !(Array.isArray(existingTrades) && existingTrades.length)) {
      note(ctx, `existing organisation "${org?.name}" has no address or trade — its OWNER will be sent to the setup wizard`);
    }
  } else {
    // Slug must be deterministic so a re-run resolves to the same organisation.
    let slug = map.slugify(orgName);
    const slugOwner = await tx.organization.findUnique({ where: { slug }, select: { id: true } });
    if (slugOwner && slugOwner.id !== organizationId) slug = `${slug}-${user.id.slice(-6)}`;

    // The setup gate passes on an address OR a trade; the trade fallback guarantees it.
    if (!address) note(ctx, `no company address on file — setup gate satisfied via trades ${JSON.stringify(trades)}`);

    await createIfAbsent(ctx, tx.organization, "Organization", organizationId, {
      name: orgName,
      slug,
      billingEmail: user.email,
      phone: map.firstStr([settings?.companyPhone, user.phone]),
      address,
      website: map.firstStr([settings?.companyWebsite]),
      logoUrl: map.firstStr([settings?.companyLogo]),
      defaultTaxRate: map.normalizeTaxRate(settings?.taxRate),
      tradeTypesJson: JSON.stringify(trades),
      // A migrated customer has not opted into the platform lead cascade.
      leadOffersEnabled: false,
      createdAt: user.createdAt,
    });
  }

  const hash = user.password?.trim() ?? null;
  if (hash && !/^\$2[aby]\$\d\d\$.{53}$/.test(hash)) {
    throw new Error(`Unexpected password hash shape for ${user.email} — refusing to import it`);
  }
  if (!hash) note(ctx, `no password hash: this account signs in with Google, or needs a set-a-password mail`);

  // The account already existed in v3, and the old password is the one that has to
  // work — that is the whole promise of the migration. Taking the credential over
  // means the session minted under the previous password must end, exactly as
  // v3's own password reset does, so credentialVersion is bumped with it. The
  // previous values go in the manifest so --rollback can put them back.
  if (byEmail && byEmail.id !== user.id && hash && !flags.keepExistingPassword) {
    const before = await tx.user.findUnique({
      where: { id: userId },
      select: { hashedPassword: true, credentialVersion: true },
    });
    if (before?.hashedPassword !== hash) {
      ctx.manifest.passwordTakeover = {
        userId,
        previousHash: before?.hashedPassword ?? null,
        previousCredentialVersion: before?.credentialVersion ?? 0,
      };
      await tx.user.update({
        where: { id: userId },
        data: { hashedPassword: hash, credentialVersion: { increment: 1 } },
      });
      note(ctx, `password taken over: this account now signs in with its OLD JobFlex password, and any session opened under the previous one is invalidated`);
    }
  }

  const created = await createIfAbsent(ctx, tx.user, "User", userId, {
    email: user.email,
    name: user.name,
    image: user.image,
    phone: user.phone,
    // Ports verbatim: both apps use bcryptjs at cost 10, and the cost + salt live
    // inside the hash string, so the old password keeps working untouched.
    hashedPassword: hash,
    emailVerified: user.emailVerified,
    activeOrgId: organizationId,
    createdAt: user.createdAt,
    // credentialVersion is left at its default 0 — a change invalidates live sessions.
  });
  if (!created && !byEmail) note(ctx, `user ${userId} already present, left as-is`);
  if (needsActiveOrg) {
    await tx.user.update({ where: { id: userId }, data: { activeOrgId: organizationId } });
  }
  ctx.migratedUserIds.add(user.id);

  // Google link, so an account with no password can still get in.
  for (const acct of await src.findAccounts(ctx.reader, user.id)) {
    const id = accountId(acct.providerAccountId);
    const dupe = await tx.account.findFirst({
      where: { provider: acct.provider, providerAccountId: acct.providerAccountId },
      select: { id: true },
    });
    if (dupe) {
      skip(ctx, "Account");
      continue;
    }
    await createIfAbsent(ctx, tx.account, "Account", id, {
      userId,
      type: acct.type,
      provider: acct.provider,
      providerAccountId: acct.providerAccountId,
    });
  }

  const existingMembership = await tx.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { id: true },
  });
  if (existingMembership) skip(ctx, "Membership");
  else {
    await createIfAbsent(ctx, tx.membership, "Membership", membershipId(organizationId, userId), {
      userId,
      organizationId,
      role: "OWNER",
      createdAt: user.createdAt,
    });
  }

  // ── the subscription ──────────────────────────────────────────────────────
  // Two shapes, exactly the two v3 itself records (src/actions/adminUsers.ts):
  //
  //  · a live Stripe subscription -> a STRIPE record carrying Stripe's own ids,
  //    status, price and renewal date. From here on Stripe owns the row — the
  //    webhooks, the reconcile cron and the admin "Sync from Stripe" all rewrite
  //    it from Stripe's truth and name the plan through the PlanPrice ledger,
  //    which the batch seeds with the old prices (ledger.ts). So what is written
  //    here is exactly what every later sync will write too.
  //
  //  · a comped account (a paid tier in the old database, no Stripe subscription
  //    at all) -> a hand grant: provider MANUAL, no Stripe link, no period end.
  //    v3 never lets a sync overwrite a live hand grant, an ACTIVE grant with no
  //    period end never reads as lapsed, and MANUAL keeps it out of MRR.
  //
  // Anything else — an old subscription Stripe no longer considers current — is
  // not a paying account and is not imported at all (index.ts picks the cohort).
  const live = ctx.stripeSub;
  const plan = map.planSlug(live ? live.planKey : user.subscriptionPlan);
  const record = live
    ? {
        plan,
        status: live.status === "trialing" ? "TRIALING" : live.status === "past_due" ? "PAST_DUE" : "ACTIVE",
        provider: "STRIPE",
        externalCustomerId: live.customerId,
        externalSubId: live.subId,
        stripePriceId: live.priceId,
        currentPeriodEnd: live.currentPeriodEnd,
        trialEndsAt: live.trialEnd,
        canceledAt: null,
      }
    : {
        plan,
        status: "ACTIVE",
        provider: "MANUAL",
        externalCustomerId: user.stripeCustomerId,
        externalSubId: null,
        stripePriceId: null,
        currentPeriodEnd: null,
        trialEndsAt: null,
        canceledAt: null,
      };
  ctx.manifest.billing = live ? "stripe" : "grant";
  note(
    ctx,
    live
      ? `Stripe: ${live.product} (${live.status}), renews ${live.currentPeriodEnd.toISOString().slice(0, 10)} -> ${plan}, Stripe-managed record` +
          (map.subscriptionStatus(user.subscriptionStatus) !== record.status
            ? ` (the old database said ${user.subscriptionStatus})`
            : "")
      : `no Stripe subscription; old database ${user.subscriptionPlan}/${user.subscriptionStatus} -> ${plan} as a hand grant (MANUAL, no period end)`,
  );

  // Subscription is 1:1 with the organisation, so a merged-into org already has
  // one. Normally it stays untouched — except when it would leave a paying
  // customer on free or lapsed limits, which is the one case worth writing over.
  // The previous values go in the manifest so --rollback puts them back.
  const hasSub = await tx.subscription.findUnique({ where: { organizationId } });
  if (hasSub) {
    const stale =
      hasSub.plan.toUpperCase() === "FREE" ||
      map.isLapsed({
        status: hasSub.status,
        currentPeriodEnd: hasSub.currentPeriodEnd,
        trialEndsAt: hasSub.trialEndsAt,
      });
    if (plan !== "FREE" && stale) {
      ctx.manifest.subscriptionUpgrade = {
        organizationId,
        previousPlan: hasSub.plan,
        previousStatus: hasSub.status,
        previousProvider: hasSub.provider,
        previousCurrentPeriodEnd: hasSub.currentPeriodEnd?.toISOString() ?? null,
        previousExternalSubId: hasSub.externalSubId,
        previousStripePriceId: hasSub.stripePriceId,
      };
      await tx.subscription.update({ where: { organizationId }, data: record });
      note(ctx, `existing v3 subscription was ${hasSub.plan}/${hasSub.status} — replaced so the paid plan keeps running`);
    } else {
      skip(ctx, "Subscription");
    }
    return;
  }
  await createIfAbsent(ctx, tx.subscription, "Subscription", subscriptionId(organizationId), {
    organizationId,
    ...record,
  });
}

// ── phase 2 — clients ─────────────────────────────────────────────────────────

export async function phaseClients(ctx: Ctx, extraIds: string[] = []): Promise<void> {
  const own = await src.findClients(ctx.reader, ctx.user.id);
  const extra = await src.findExtraClients(ctx.reader, ctx.user.id, extraIds);

  const write = async (c: src.OldClient, id: string) =>
    createIfAbsent(ctx, ctx.tx.client, "Client", id, {
      organizationId: ctx.manifest.organizationId,
      name: map.firstStr([c.name]) ?? "Unnamed client",
      email: map.firstStr([c.email]),
      phone: map.firstStr([c.phone]),
      address: map.firstStr([c.address]),
      state: map.firstStr([c.state]),
      zip: map.firstStr([c.zip]),
      notes: map.firstStr([c.description]),
      // Soft-deleted clients come across: live quotes point at them, and they do
      // not count against the lifetime `clients` plan limit.
      deletedAt: c.deletedAt,
      createdAt: c.createdAt,
    });

  for (const c of own) {
    // Their own client keeps its id, unless another account already claimed it —
    // in which case this org gets its own copy rather than borrowing that row.
    const existing = await ctx.tx.client.findUnique({ where: { id: c.id }, select: { organizationId: true } });
    const id = !existing || existing.organizationId === ctx.manifest.organizationId
      ? c.id
      : foreignClientId(ctx.manifest.organizationId, c.id);
    if (id !== c.id) note(ctx, `client ${c.id} is already in another organisation — copied into this one as ${id}`);
    ctx.clientIds.set(c.id, id);
    await write(c, id);
  }

  for (const c of extra) {
    // Referenced by one of this account's quotes but owned by someone else: always
    // a per-organisation copy, so the proposal's client stays inside this tenant.
    const id = foreignClientId(ctx.manifest.organizationId, c.id);
    ctx.clientIds.set(c.id, id);
    await write(c, id);
  }
}

// ── phase 3 — proposals ───────────────────────────────────────────────────────

export async function phaseProposals(ctx: Ctx, quotes: src.OldQuote[]): Promise<void> {
  const organizationId = ctx.manifest.organizationId;
  let priceDrift = 0;
  let fallbacks = 0;
  let blobUrls = 0;

  for (const q of quotes) {
    const calc = map.asObject(q.calc);
    const money = map.money(calc, q.taxRate);
    const title =
      map.firstStr([q.title, q.projectName, calc.summary]) ?? "Proposal";
    const items = map.mapLineItems(q.lineItems, q.addOns, calc, title);
    if (items.fallback) fallbacks++;

    // The old app's own arithmetic does not always agree with its own line items —
    // calc.subtotalBeforeTax can differ from the sum of the lines it stored. The
    // figure the customer and their client actually saw is the calc one, so that
    // total is preserved exactly and the difference is carried explicitly:
    // a shortfall becomes an adjustment line, an excess becomes an order-level
    // adjustment off the subtotal. Either way Σ lines reconciles to the money on
    // the proposal, so v3's own recompute on the first save changes nothing.
    const lineSum = items.lines.reduce((a, l) => a + l.total, 0);
    const delta = money.subtotal - lineSum;
    let extraDiscount = 0;
    if (Math.abs(delta) > 0.01) {
      priceDrift++;
      if (delta > 0) {
        items.lines.push({
          name: "Estimate adjustment",
          description: "Carried over from JobFlex so the proposal total matches what was quoted.",
          measurementType: "LUMP_SUM",
          quantity: 1,
          unitPrice: delta,
          materialCost: 0,
          laborCost: 0,
          total: delta,
          position: items.lines.length,
        });
      } else {
        extraDiscount = -delta;
      }
    }
    const subtotal = items.lines.reduce((a, l) => a + l.total, 0);
    const discountTotal = money.discountTotal + extraDiscount;

    const photos = map.mapPhotos(q.beforeAfterPhotos);
    blobUrls += photos.blobUrls;

    // Money settled in the old app is the same terminal state as its COMPLETED,
    // so both land on v3's PAID — the status its Completed tab actually lists.
    const fullyPaid = q.invoice_count > 0 && q.invoice_paid === q.invoice_count;
    const status = fullyPaid ? "PAID" : map.proposalStatus(q.status);
    // Old rows can be marked paid without a paidAt; fall back to the last edit so
    // the card's "paid" plate carries a date instead of a blank.
    const paidAt = status === "PAID" ? (q.invoice_last_paid ?? q.updatedAt ?? q.acceptedAt ?? q.createdAt) : null;
    await assertOwnedByOrg(ctx, ctx.tx.proposal, "Proposal", q.id);
    const wasCreated = await createIfAbsent(ctx, ctx.tx.proposal, "Proposal", q.id, {
      publicId: q.publicId,
      organizationId,
      ownerId: ctx.manifest.userId,
      clientId: q.clientId ? (ctx.clientIds.get(q.clientId) ?? null) : null,
      title,
      description: map.firstStr([calc.summary]),
      scopeOfWork: map.firstStr([q.scope, calc.scope]),
      notes: map.firstStr([q.notes, calc.notes, calc.terms]),
      status,
      subtotal,
      discountTotal,
      taxRate: money.taxRate,
      taxTotal: money.taxTotal,
      total: money.total,
      // Pinned to zero: v3 recomputes subtotal as Σ quantity × sellUnitPrice on
      // every save, and a non-zero markup would silently re-price the proposal.
      materialMarkupPct: 0,
      laborMarkupPct: 0,
      overheadPct: 0,
      profitPct: 0,
      sentAt: q.sentAt,
      viewedAt: q.viewedAt,
      viewCount: q.viewCount ?? 0,
      acceptedAt: q.acceptedAt,
      acceptedIp: q.acceptanceIp,
      declinedAt: (q.status ?? "").toUpperCase() === "REJECTED" ? q.updatedAt : null,
      paidAt,
      beforePhotos: photos.before,
      afterPhotos: photos.after,
      createdAt: q.createdAt,
    });
    if (!wasCreated) continue;

    for (const line of items.lines) {
      await createIfAbsent(ctx, ctx.tx.lineItem, "LineItem", lineItemId(q.id, line.position), {
        proposalId: q.id,
        ...line,
      });
    }

    if (discountTotal > 0) {
      await createIfAbsent(ctx, ctx.tx.discount, "Discount", discountId(q.id), {
        proposalId: q.id,
        label: extraDiscount > 0 && money.discountTotal === 0 ? "Estimate adjustment" : "Discount",
        amount: discountTotal,
        isPercent: false,
      });
    }

    for (const inst of map.mapInstallments(calc)) {
      await createIfAbsent(ctx, ctx.tx.installment, "Installment", installmentId(q.id, inst.position), {
        proposalId: q.id,
        label: inst.label,
        amount: inst.amount,
        isPercent: inst.isPercent,
        position: inst.position,
        status: "UNPAID",
      });
    }

    // The original pricing, kept verbatim: the thing to diff against if a
    // migrated proposal ever re-prices.
    await createIfAbsent(ctx, ctx.tx.pricingSnapshot, "PricingSnapshot", snapshotId(q.id), {
      proposalId: q.id,
      organizationId,
      reason: "migrated",
      subtotal,
      discountTotal,
      taxRate: money.taxRate,
      taxTotal: money.taxTotal,
      total: money.total,
      lineItemsJson: JSON.stringify({ lineItems: q.lineItems, addOns: q.addOns, calc: q.calc }),
    });

    // acceptedBy has no column in v3; keep the signature in the activity feed.
    if (q.acceptedAt) {
      await createIfAbsent(ctx, ctx.tx.activityEvent, "ActivityEvent", activityId(q.id), {
        organizationId,
        proposalId: q.id,
        clientId: q.clientId ? (ctx.clientIds.get(q.clientId) ?? null) : null,
        kind: "ACCEPTED",
        summary: q.acceptedBy ? `Accepted by ${q.acceptedBy}` : "Proposal accepted",
        meta: JSON.stringify({ migrated: true, acceptedBy: q.acceptedBy, ip: q.acceptanceIp }),
        createdAt: q.acceptedAt,
      });
    }
  }

  if (fallbacks) note(ctx, `${fallbacks} proposal(s) had unparseable line items — carried as a single lump-sum line`);
  if (priceDrift) {
    note(ctx, `${priceDrift} proposal(s) where the old line items did not sum to the old stored subtotal — reconciled with an explicit adjustment, quoted total preserved`);
  }
  if (blobUrls) note(ctx, `${blobUrls} photo url(s) point at the OLD Vercel blob store and die if that project is removed`);
}

// ── phase 4 — calendar ────────────────────────────────────────────────────────

const TWO_HOURS = 2 * 60 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

export async function phaseCalendar(ctx: Ctx, quotes: src.OldQuote[]): Promise<void> {
  const organizationId = ctx.manifest.organizationId;
  const quoteById = new Map(quotes.map((q) => [q.id, q]));
  const events = await src.findJobEvents(ctx.reader, ctx.user.id);

  // One Job per quote, spanning that quote's events.
  const byQuote = new Map<string, src.OldJobEvent[]>();
  for (const e of events) if (e.quoteId && quoteById.has(e.quoteId)) {
    const list = byQuote.get(e.quoteId) ?? [];
    list.push(e);
    byQuote.set(e.quoteId, list);
  }

  for (const [quoteId, list] of byQuote) {
    const q = quoteById.get(quoteId)!;
    const starts = list.map((e) => e.startsAt.getTime());
    const ends = list.map((e) => (e.endsAt ?? new Date(e.startsAt.getTime() + TWO_HOURS)).getTime());
    await createIfAbsent(ctx, ctx.tx.job, "Job", jobId(quoteId), {
      organizationId,
      clientId: q.clientId ? (ctx.clientIds.get(q.clientId) ?? null) : null,
      proposalId: quoteId,
      title: map.firstStr([q.title, q.projectName]) ?? "Job",
      status: map.jobStatusFromEvents(list.map((e) => e.status)),
      scopeOfWork: map.firstStr([q.scope]),
      startsAt: new Date(Math.min(...starts)),
      endsAt: new Date(Math.max(...ends)),
    });
  }

  // Crew members are out of scope, so every calendar row is attributed to the
  // subscriber — which is also what puts it on their calendar.
  const creator = ctx.manifest.userId;

  for (const e of events) {
    const linkedJob = e.quoteId && byQuote.has(e.quoteId) ? jobId(e.quoteId) : null;
    await assertOwnedByOrg(ctx, ctx.tx.jobEvent, "JobEvent", e.id);
    await createIfAbsent(ctx, ctx.tx.jobEvent, "JobEvent", e.id, {
      organizationId,
      jobId: linkedJob,
      title: map.firstStr([e.title, linkedJob ? quoteById.get(e.quoteId!)?.title : null]) ?? "Job",
      startsAt: e.startsAt,
      // endsAt is required in v3; the old app allowed it to be missing.
      endsAt: e.endsAt ?? new Date(e.startsAt.getTime() + TWO_HOURS),
      notes: map.firstStr([e.notes]),
      createdById: creator,
    });
  }

  for (const a of await src.findAppointments(ctx.reader, ctx.user.id)) {
    const kind = map.firstStr([a.type])?.replace(/_/g, " ").toLowerCase() ?? "appointment";
    const who = map.firstStr([a.lead_name]);
    const title = who ? `${kind[0].toUpperCase()}${kind.slice(1)} — ${who}` : `${kind[0].toUpperCase()}${kind.slice(1)}`;
    const notes = [map.firstStr([a.notes]), map.firstStr([a.customerNotes]), a.location ? `Location: ${a.location}` : null]
      .filter(Boolean)
      .join("\n");
    await assertOwnedByOrg(ctx, ctx.tx.appointment, "Appointment", a.id);
    await createIfAbsent(ctx, ctx.tx.appointment, "Appointment", a.id, {
      organizationId,
      // leadId is attached in phase 6, once the Lead rows exist.
      createdById: creator,
      title,
      status: map.appointmentStatus(a.status),
      startsAt: a.startAt,
      endsAt: a.endAt ?? new Date(a.startAt.getTime() + ONE_HOUR),
      notes: notes || null,
      createdAt: a.createdAt,
    });
  }
}

// ── phase 5 — messages ────────────────────────────────────────────────────────

/**
 * Old threads are keyed per (jobEvent, worker); v3's Conversation.jobId is @unique,
 * so several old threads would collide on one job. They come across as DIRECT
 * threads with the counterpart's name in the title instead.
 *
 * The owner participant row is what makes a thread visible at all: the inbox query
 * shows a conversation only to its participants (or to someone who authored a
 * message in it).
 */
export async function phaseMessages(ctx: Ctx): Promise<void> {
  const conversations = (await src.findConversations(ctx.reader, ctx.user.id)).filter((c) => !c.archived);
  if (!conversations.length) return;

  for (const c of conversations) {
    const label = map.firstStr([c.job_title]) ?? "Conversation";
    const who = map.firstStr([c.worker_name]);
    await assertOwnedByOrg(ctx, ctx.tx.conversation, "Conversation", c.id);
    await createIfAbsent(ctx, ctx.tx.conversation, "Conversation", c.id, {
      organizationId: ctx.manifest.organizationId,
      jobId: null,
      kind: "DIRECT",
      title: who ? `${label} — ${who}` : label,
      createdAt: c.createdAt,
    });
    await createIfAbsent(ctx, ctx.tx.conversationParticipant, "ConversationParticipant", participantId(c.id, ctx.manifest.userId), {
      conversationId: c.id,
      userId: ctx.manifest.userId,
      lastReadAt: c.lastReadByOwnerAt,
      createdAt: c.createdAt,
    });
  }

  for (const m of await src.findMessages(ctx.reader, conversations.map((c) => c.id))) {
    const author =
      m.authorId && ctx.migratedUserIds.has(m.authorId)
        ? ctx.manifest.userId
        : (m.authorType ?? "").toUpperCase() === "ADMIN"
          ? ctx.manifest.userId
          : null;
    await createIfAbsent(ctx, ctx.tx.message, "Message", m.id, {
      conversationId: m.conversationId,
      authorId: author,
      // body is NOT NULL in v3; attachment-only messages had none.
      body: map.firstStr([m.body]) ?? "(no text)",
      createdAt: m.createdAt,
    });
  }
}

// ── phase 6 — leads ───────────────────────────────────────────────────────────

export async function phaseLeads(ctx: Ctx): Promise<void> {
  const leads = await src.findLeads(ctx.reader, ctx.user.id);
  const known = new Set<string>();
  for (const l of leads) {
    const photos = map.asArray(l.photos).filter((p): p is string => typeof p === "string");
    await assertOwnedByOrg(ctx, ctx.tx.lead, "Lead", l.id);
    const ok = await createIfAbsent(ctx, ctx.tx.lead, "Lead", l.id, {
      organizationId: ctx.manifest.organizationId,
      name: map.firstStr([l.name]) ?? "Unnamed lead",
      email: map.firstStr([l.email]),
      phone: map.firstStr([l.phone]),
      address: map.firstStr([l.address]),
      state: map.firstStr([l.state]),
      zip: map.firstStr([l.zip]),
      projectType: map.firstStr([l.projectType]),
      description: map.firstStr([l.description]),
      source: map.firstStr([l.source]),
      status: map.firstStr([l.status]) ?? "NEW",
      photos: JSON.stringify(photos),
      contactedAt: l.contactedAt,
      assignedToId: l.assignedUserId && ctx.migratedUserIds.has(l.assignedUserId) ? ctx.manifest.userId : null,
      claimedById: l.claimedById && ctx.migratedUserIds.has(l.claimedById) ? ctx.manifest.userId : null,
      claimedAt: l.claimedAt,
      createdAt: l.createdAt,
    });
    void ok;
    known.add(l.id);
  }

  // Now that the Leads exist, restore the appointment links dropped in phase 4.
  for (const a of await src.findAppointments(ctx.reader, ctx.user.id)) {
    if (!a.leadId || !known.has(a.leadId)) continue;
    await ctx.tx.appointment.updateMany({ where: { id: a.id, leadId: null }, data: { leadId: a.leadId } });
  }
}

// ── manifest ──────────────────────────────────────────────────────────────────

/**
 * SyncState is v3's only generic key/value store; the manifest drives --rollback.
 *
 * The id lists are MERGED with whatever a previous run recorded. A re-run creates
 * nothing (everything is already present), and overwriting the manifest with that
 * empty result would quietly destroy the ability to undo the original import.
 */
export async function writeManifest(ctx: Ctx): Promise<void> {
  const key = manifestKey(ctx.user.id);
  const prior = await ctx.tx.syncState.findUnique({ where: { key } });
  const created: Record<string, string[]> = {};
  let previous: Partial<Manifest> = {};
  if (prior) {
    try {
      previous = JSON.parse(prior.cursor) as Manifest;
    } catch {
      previous = {};
    }
  }
  for (const source of [previous.created ?? {}, ctx.manifest.created]) {
    for (const [model, ids] of Object.entries(source)) {
      created[model] = [...new Set([...(created[model] ?? []), ...ids])];
    }
  }
  const cursor = JSON.stringify({
    ...ctx.manifest,
    created,
    // The first run is the one that captured the pre-import credential.
    passwordTakeover: previous.passwordTakeover ?? ctx.manifest.passwordTakeover,
    subscriptionUpgrade: previous.subscriptionUpgrade ?? ctx.manifest.subscriptionUpgrade,
    finishedAt: new Date().toISOString(),
  });
  await ctx.tx.syncState.upsert({ where: { key }, create: { key, cursor }, update: { cursor } });
}
