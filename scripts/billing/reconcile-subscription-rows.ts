// ONE SUBSCRIPTION OF RECORD PER ORGANIZATION — the one-off repair (owner, 2026-09-22).
//
//   npx tsx --tsconfig tsconfig.json scripts/billing/reconcile-subscription-rows.ts            # dry run (default)
//   npx tsx --tsconfig tsconfig.json scripts/billing/reconcile-subscription-rows.ts --fix      # write the mirror
//   npx tsx --tsconfig tsconfig.json scripts/billing/reconcile-subscription-rows.ts --fix --cancel-losers
//                                                                                              # ALSO cancel the losing Stripe subscriptions
//
// Subscription.organizationId is @unique, so "an organization with two rows"
// cannot exist in the database. What the admin sheet used to leave behind
// (until 2026-09-22) is one row HERE and one or more subscriptions THERE, on
// Stripe: a MANUAL comp beside a trial that kept billing, or two live Stripe
// subscriptions after a checkout that replaced nothing. This script lists every
// organization whose candidates disagree and keeps ONE by the owner's rule:
//
//     paid active on Stripe  >  comp (MANUAL, live)  >  trialing on Stripe  >  everything else
//
// The winner defines the mirror row. A Stripe loser is REPORTED with the
// cancel command; it is cancelled only with --cancel-losers (never by default —
// on production that is the owner's call, one organization at a time). A comp
// that loses to a paid subscription keeps its record removed (the customer is
// paying; the product must read the paid plan).
//
// STRIPE IS READ, NEVER WRITTEN, unless --cancel-losers is given. No key, no
// Stripe: the script then reports the mirror side only (rows whose shape is
// inconsistent — lib/planGrant.mirrorInvariantViolations).
//
// Production: run with the production database (POSTGRES_URL through the
// production Prisma client — see docs/ADMIN_CONSOLE.md "local → production")
// and the LIVE key, dry run first; the before/after SQL is in
// scripts/billing/prod-subscription-audit.sql.

import type Stripe from "stripe";
import { db } from "../../src/lib/db";
import { getStripe, isStripeEnabled } from "../../src/lib/sdk/stripe";
import { mirrorInvariantViolations, readPlanGrant, clearPlanGrant, LIVE_STRIPE_STATUSES } from "../../src/lib/planGrant";
import { recordMirrorReference } from "../../src/lib/subscriptionRecord";

const FIX = process.argv.includes("--fix");
const CANCEL = process.argv.includes("--cancel-losers");

type Candidate =
  | { kind: "stripe"; sub: Stripe.Subscription; rank: number; label: string }
  | { kind: "comp"; rank: number; label: string };

function rankStripe(s: Stripe.Subscription): number {
  if (s.status === "active" || s.status === "past_due" || s.status === "unpaid") return 4;
  if (s.status === "trialing") return 2;
  return 0;
}

function statusOf(s: Stripe.Subscription.Status): string {
  switch (s) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    default:
      return "PAST_DUE";
  }
}

async function main() {
  const rows = await db.subscription.findMany({ include: { organization: { select: { name: true, slug: true } } } });
  const ledger = await db.planPrice.findMany({ select: { stripePriceId: true, planSlug: true } });
  const slugByPrice = new Map(ledger.map((p) => [p.stripePriceId, p.planSlug.toUpperCase()]));
  const catalog = new Set((await db.pricingPlan.findMany({ select: { slug: true } })).map((p) => p.slug.toUpperCase()));

  const stripeOn = isStripeEnabled();
  const stripe = stripeOn ? getStripe() : null;
  // Every subscription on the account, grouped by organization the way the
  // sync links them: metadata.organizationId, else the mirror's ids.
  const byOrg = new Map<string, Stripe.Subscription[]>();
  if (stripe) {
    let startingAfter: string | undefined;
    const bySub = new Map(rows.filter((r) => r.externalSubId).map((r) => [r.externalSubId as string, r.organizationId]));
    const byCust = new Map(rows.filter((r) => r.externalCustomerId).map((r) => [r.externalCustomerId as string, r.organizationId]));
    for (let page = 0; page < 20; page++) {
      const res = await stripe.subscriptions.list({ status: "all", limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) });
      for (const s of res.data) {
        const cust = typeof s.customer === "string" ? s.customer : s.customer.id;
        const org = s.metadata?.organizationId || bySub.get(s.id) || byCust.get(cust);
        if (!org) continue;
        byOrg.set(org, [...(byOrg.get(org) ?? []), s]);
      }
      if (!res.has_more || res.data.length === 0) break;
      startingAfter = res.data[res.data.length - 1].id;
    }
  }

  let flagged = 0;
  let fixed = 0;
  const lines: string[] = [];
  for (const row of rows) {
    const grant = await readPlanGrant(row.organizationId);
    const violations = mirrorInvariantViolations(row, grant);
    const live = (byOrg.get(row.organizationId) ?? []).filter((s) => LIVE_STRIPE_STATUSES.has(s.status));
    const comp = row.provider === "MANUAL" && row.status === "ACTIVE";
    const candidates: Candidate[] = [
      ...live.map((s) => ({ kind: "stripe" as const, sub: s, rank: rankStripe(s), label: `${s.id} ${s.status} ${s.items.data[0]?.price?.id ?? ""}` })),
      ...(comp ? [{ kind: "comp" as const, rank: 3, label: `comp ${row.plan}${grant?.endsAt ? " until " + grant.endsAt.slice(0, 10) : ""}` }] : []),
    ].sort((a, b) => b.rank - a.rank || (a.kind === "stripe" && b.kind === "stripe" ? b.sub.created - a.sub.created : 0));

    const mirrorNamesLive = row.externalSubId ? live.some((s) => s.id === row.externalSubId) : false;
    const disagree = candidates.length > 1 || (candidates.length === 1 && candidates[0].kind === "stripe" && !mirrorNamesLive) || (candidates.length === 0 && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(row.status) && row.provider === "STRIPE" && stripeOn);
    if (!disagree && violations.length === 0) continue;
    flagged += 1;
    const org = `${row.organization.name} (${row.organization.slug}, ${row.organizationId})`;
    lines.push(`\n${org}`);
    lines.push(`  mirror: ${row.plan} ${row.status} ${row.provider} sub=${row.externalSubId ?? "—"} cust=${row.externalCustomerId ?? "—"}`);
    for (const v of violations) lines.push(`  ! ${v}`);
    for (const [i, c] of candidates.entries()) lines.push(`  ${i === 0 ? "KEEP " : "drop "} ${c.label} (rank ${c.rank})`);
    if (!candidates.length) {
      // A row that never named a Stripe object is a demo / self-serve row
      // (actions/billing.setOrgPlan without Stripe) — reported, never written.
      const neverLinked = !row.externalSubId && !row.externalCustomerId;
      lines.push(
        neverLinked
          ? `  no Stripe link at all — a demo/self-serve row; left as it is`
          : `  no live candidate — the mirror claims ${row.status} but Stripe holds nothing live: mark CANCELED${FIX ? " (done)" : ""}`,
      );
      if (FIX && !neverLinked) {
        await db.subscription.update({ where: { organizationId: row.organizationId }, data: { status: "CANCELED", canceledAt: row.canceledAt ?? new Date() } });
        fixed += 1;
      }
      continue;
    }
    const winner = candidates[0];
    if (winner.kind === "stripe") {
      const s = winner.sub;
      const priceId = s.items.data[0]?.price?.id ?? null;
      const slug = (priceId && slugByPrice.get(priceId)) || [s.metadata?.planSlug, s.metadata?.planTier].map((x) => x?.toUpperCase()).find((x) => x && catalog.has(x)) || row.plan;
      lines.push(`  → mirror follows ${s.id}: ${slug} ${statusOf(s.status)} STRIPE${FIX ? " (written)" : ""}`);
      if (FIX) {
        await db.subscription.update({
          where: { organizationId: row.organizationId },
          data: {
            plan: slug,
            status: statusOf(s.status),
            provider: "STRIPE",
            externalCustomerId: typeof s.customer === "string" ? s.customer : s.customer.id,
            externalSubId: s.id,
            stripePriceId: priceId,
            currentPeriodEnd: s.current_period_end ? new Date(s.current_period_end * 1000) : null,
            trialEndsAt: s.trial_end ? new Date(s.trial_end * 1000) : null,
            canceledAt: s.cancel_at_period_end && s.canceled_at ? new Date(s.canceled_at * 1000) : null,
          },
        });
        await clearPlanGrant(row.organizationId);
        await recordMirrorReference(row.organizationId, s.created * 1000);
        fixed += 1;
      }
    } else {
      lines.push(`  → the comp stands; the mirror stays MANUAL ${row.plan}`);
    }
    for (const c of candidates.slice(1)) {
      if (c.kind !== "stripe") continue;
      const action = c.sub.status === "trialing" ? "cancel now (nothing bills at the trial's end)" : "cancel at the period end";
      if (CANCEL && stripe) {
        if (c.sub.status === "trialing") await stripe.subscriptions.cancel(c.sub.id, { prorate: false, invoice_now: false });
        else await stripe.subscriptions.update(c.sub.id, { cancel_at_period_end: true });
        lines.push(`  ✂ ${c.sub.id}: ${action} — DONE`);
      } else {
        lines.push(`  ✂ ${c.sub.id}: ${action} — run with --cancel-losers, or in the Stripe dashboard`);
      }
    }
  }

  console.log(`${FIX ? "FIX" : "DRY RUN"} · ${rows.length} mirror rows · Stripe ${stripeOn ? "read" : "not configured (mirror side only)"}`);
  console.log(lines.join("\n") || "\nNothing to settle: every organization has one subscription of record.");
  console.log(`\n${flagged} organization(s) flagged${FIX ? `, ${fixed} mirror row(s) written` : ""}.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
