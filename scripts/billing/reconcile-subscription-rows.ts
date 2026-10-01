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
// Production: --prod (scripts/billing/_prod.ts — Downloads\prod-db-url.txt,
// read once and deleted, and the LIVE key), dry run first; the before/after
// SQL is in scripts/billing/prod-subscription-audit.sql.
//
// TWO REPORTS BESIDE IT (2026-10-01), never written by --fix:
//   · LINK — a live Stripe subscription no row names (or the ones given with
//     --subs sub_a,sub_b): the organisation it belongs to, found by
//     metadata.organizationId / metadata.userId (reliable), then the customer
//     id on an organisation's row or attribution, then the customer's email as
//     an OWNER (leads, not proof); that organisation's plan and limits here,
//     the plan on Stripe, and what the row would become. --hold sub_x marks one
//     as shown only.
//   · PAYS ON STRIPE, FREE HERE — every paying subscription on the account
//     against the plan its organisation is on here.

import path from "node:path";
import type Stripe from "stripe";
import { ROOT, openEnvironment } from "./_prod";

const FIX = process.argv.includes("--fix");
const CANCEL = process.argv.includes("--cancel-losers");
const PROD = process.argv.includes("--prod");
const listOpt = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? (process.argv[i + 1] ?? "").split(",").map((x) => x.trim()).filter(Boolean) : [];
};

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
  const { where } = openEnvironment({ prod: PROD, out: path.join(ROOT, ".cache/reconcile-subscriptions"), allowLiveWrites: CANCEL });
  console.log(`reconcile-subscription-rows · ${where}`);
  await import("../qa/_server-only");
  const { db } = await import("../../src/lib/db");
  const { getStripe, isStripeEnabled } = await import("../../src/lib/sdk/stripe");
  const { mirrorInvariantViolations, readPlanGrant, clearPlanGrant, LIVE_STRIPE_STATUSES } = await import("../../src/lib/planGrant");
  const { recordMirrorReference } = await import("../../src/lib/subscriptionRecord");
  const { subscriptionPeriodEndDate } = await import("../../src/lib/stripeCompat");

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
            currentPeriodEnd: subscriptionPeriodEndDate(s),
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

  if (stripe) await whoPaysForWhat();
  await db.$disconnect();

  // ── LINK and PAYS ON STRIPE, FREE HERE — reports only ──
  async function whoPaysForWhat() {
    const { getOrgLimitUsage } = await import("../../src/lib/limitsEngine");
    const { parsePlanLimits } = await import("../../src/lib/planLimits");
    const HOLD = new Set(listOpt("--hold"));
    const ONLY = new Set(listOpt("--subs"));
    const usd = (c: number | null | undefined) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);
    const day = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);
    const plans = await db.pricingPlan.findMany({ select: { id: true, slug: true, name: true, priceCents: true, limitsJson: true } });
    const planBySlug = new Map(plans.map((p) => [p.slug.toUpperCase(), p]));
    const orgs = new Map((await db.organization.findMany({ select: { id: true, name: true, slug: true } })).map((o) => [o.id, o]));
    const orgLabel = (id: string) => (orgs.get(id) ? `${orgs.get(id)!.name} (${orgs.get(id)!.slug}, ${id})` : `${id} — no such organisation`);
    const rowBySub = new Map(rows.filter((r) => r.externalSubId).map((r) => [r.externalSubId as string, r]));
    const rowByOrg = new Map(rows.map((r) => [r.organizationId, r]));
    const all: Stripe.Subscription[] = [];
    for await (const s of stripe!.subscriptions.list({ status: "all", limit: 100, expand: ["data.customer"] })) all.push(s);
    const liveIds = new Set(all.filter((s) => LIVE_STRIPE_STATUSES.has(s.status)).map((s) => s.id));

    const customerOf = (s: Stripe.Subscription) =>
      typeof s.customer === "object" && !("deleted" in s.customer && s.customer.deleted) ? (s.customer as Stripe.Customer) : null;
    const cents = (s: Stripe.Subscription) => s.items.data.reduce((n, i) => n + (i.price.unit_amount ?? 0) * (i.quantity ?? 1), 0);
    const priceText = (s: Stripe.Subscription) => s.items.data.map((i) => `${usd(i.price.unit_amount)}/${i.price.recurring?.interval ?? "?"}`).join(" + ");
    const stripePlan = (s: Stripe.Subscription) => {
      const priceId = s.items.data[0]?.price?.id ?? "";
      const slug = slugByPrice.get(priceId) ?? [s.metadata?.planSlug, s.metadata?.planTier].map((x) => x?.toUpperCase()).find((x) => x && catalog.has(x)) ?? null;
      const byId = s.metadata?.planId ? plans.find((p) => p.id === s.metadata.planId || p.slug.toUpperCase() === s.metadata.planId.toUpperCase()) : undefined;
      const plan = (slug ? planBySlug.get(slug) : undefined) ?? byId ?? null;
      return { slug: plan ? plan.slug.toUpperCase() : slug, plan, how: slug ? (slugByPrice.has(priceId) ? "price ledger" : "metadata.planSlug") : byId ? "metadata.planId" : "unknown" };
    };
    const limitsText = (l: Record<string, number | null | undefined>) => {
      const keys = Object.keys(l).filter((k) => l[k] != null);
      return keys.length ? keys.map((k) => `${k} ${l[k]}`).join(", ") : "unlimited";
    };

    type Link = { orgId: string; how: string; reliable: boolean };
    async function linksOf(s: Stripe.Subscription): Promise<{ links: Link[]; notes: string[] }> {
      const links: Link[] = [];
      const notes: string[] = [];
      const add = (l: Link) => {
        if (!orgs.has(l.orgId)) notes.push(`${l.how} names ${l.orgId}: no such organisation here`);
        else if (!links.some((x) => x.orgId === l.orgId)) links.push(l);
      };
      const md = s.metadata ?? {};
      if (md.organizationId) add({ orgId: md.organizationId, how: "metadata.organizationId", reliable: true });
      if (md.userId) {
        const u = await db.user.findUnique({ where: { id: md.userId }, select: { email: true, memberships: { select: { organizationId: true, role: true } } } });
        if (!u) notes.push(`metadata.userId ${md.userId}: no such user`);
        for (const m of (u?.memberships ?? []).sort((a, b) => (a.role === "OWNER" ? -1 : b.role === "OWNER" ? 1 : 0))) {
          add({ orgId: m.organizationId, how: `metadata.userId → ${u!.email} as ${m.role}`, reliable: true });
        }
      }
      if (md.planId) notes.push(`metadata.planId ${md.planId} → ${plans.find((p) => p.id === md.planId || p.slug.toUpperCase() === md.planId.toUpperCase())?.slug ?? "no such plan"}`);
      const cus = typeof s.customer === "string" ? s.customer : s.customer.id;
      for (const r of rows.filter((r) => r.externalCustomerId === cus)) add({ orgId: r.organizationId, how: `customer ${cus} on the organisation's subscription row`, reliable: false });
      for (const a of await db.attribution.findMany({ where: { stripeCustomerId: cus }, select: { organizationId: true } })) {
        if (a.organizationId) add({ orgId: a.organizationId, how: `customer ${cus} on a partner attribution`, reliable: false });
      }
      const email = customerOf(s)?.email;
      if (email) {
        const u = await db.user.findFirst({ where: { email: { in: [...new Set([email, email.toLowerCase()])] } }, select: { memberships: { where: { role: "OWNER" }, select: { organizationId: true } } } });
        for (const m of u?.memberships ?? []) add({ orgId: m.organizationId, how: `customer email ${email} is its OWNER`, reliable: false });
        if (!u) notes.push(`no user with the customer's email ${email}`);
        else if (!u.memberships.length) notes.push(`the user ${email} owns no organisation`);
      }
      return { links, notes };
    }

    async function orgState(orgId: string) {
      const row = rowByOrg.get(orgId);
      const usage = await getOrgLimitUsage(orgId, { actorId: null }).catch(() => null);
      const limits = usage ? Object.fromEntries(usage.map((u) => [u.resource, u.limit])) : {};
      const rowText = row
        ? `${row.plan} ${row.status} ${row.provider} sub=${row.externalSubId ?? "—"}${row.externalSubId ? (liveIds.has(row.externalSubId) ? " (live on Stripe)" : " (not live on Stripe)") : ""}`
        : "no subscription row (FREE)";
      const free = !row || ["FREE", "NONE"].includes(row.plan.toUpperCase()) || !["ACTIVE", "TRIALING", "PAST_DUE"].includes(row.status);
      return { row, rowText, limits, free };
    }

    // ── LINK ──
    const scope = all.filter((s) => (ONLY.size ? ONLY.has(s.id) : LIVE_STRIPE_STATUSES.has(s.status) && !rowBySub.has(s.id)));
    console.log(`\nLINK — ${ONLY.size ? `the ${ONLY.size} subscription(s) asked for` : "live Stripe subscriptions no row names"}: ${scope.length}`);
    for (const s of scope) {
      const cus = customerOf(s);
      const sp = stripePlan(s);
      console.log(`\n${s.id} · Stripe ${s.status} · ${priceText(s)} · since ${day(s.created)} · ${cus?.id ?? s.customer} ${cus?.email ?? ""} "${cus?.name ?? ""}"${HOLD.has(s.id) ? " · HELD — shown only, not to be written" : ""}`);
      console.log(`  metadata ${JSON.stringify(s.metadata ?? {})}`);
      console.log(`  plan on Stripe: ${sp.slug ?? "?"} (${sp.how})${sp.plan ? ` — ${sp.plan.name}, ${usd(sp.plan.priceCents)}/mo · limits ${limitsText(parsePlanLimits(sp.plan.limitsJson) as Record<string, number | null>)}` : ""}`);
      const { links, notes } = await linksOf(s);
      for (const n of notes) console.log(`  · ${n}`);
      if (!links.length) {
        console.log("  NO ORGANISATION FOUND — nothing to link; a person has to say whose this is");
        continue;
      }
      for (const [i, l] of links.entries()) console.log(`  ${i === 0 ? "→" : " "} ${orgLabel(l.orgId)} by ${l.how} — ${l.reliable ? "RELIABLE" : "a lead, not proof"}`);
      const target = links[0];
      const st = await orgState(target.orgId);
      console.log(`  here now: ${st.rowText}`);
      console.log(`  limits now: ${limitsText(st.limits)}`);
      const live = st.row?.externalSubId && st.row.externalSubId !== s.id && liveIds.has(st.row.externalSubId);
      const comp = st.row?.provider === "MANUAL" && st.row.status === "ACTIVE";
      const would = `row → ${sp.slug ?? st.row?.plan ?? "?"} ${statusOf(s.status)} STRIPE sub=${s.id} cust=${cus?.id ?? s.customer}`;
      console.log(
        `  would change: ${live ? `CONFLICT — the row follows ${st.row!.externalSubId}, also live; the reconcile above ranks the two` : comp ? `the comp ${st.row!.plan} gives way to the paid subscription: ${would}` : would}${HOLD.has(s.id) ? " — HELD, not written" : target.reliable ? "" : " — only after a person confirms the link"}`,
      );
    }

    // ── PAYS ON STRIPE, FREE HERE ──
    const paying = all.filter((s) => ["active", "past_due", "unpaid"].includes(s.status) && cents(s) > 0);
    console.log(`\nPAYS ON STRIPE, FREE HERE — ${all.length} subscriptions on the account, ${paying.length} paying (active / past_due / unpaid, price > 0)`);
    let bad = 0;
    for (const s of paying) {
      const named = rowBySub.get(s.id);
      const orgId = named?.organizationId ?? (await linksOf(s)).links[0]?.orgId ?? null;
      const sp = stripePlan(s);
      const st = orgId ? await orgState(orgId) : null;
      const ok = Boolean(named) && st && !st.free && st.row?.externalSubId === s.id;
      if (!ok) bad++;
      console.log(
        `  ${ok ? "ok      " : "MISMATCH"} ${s.id} · ${priceText(s)} · Stripe ${s.status} ${sp.slug ?? "?"} · ${customerOf(s)?.email ?? ""} · ${orgId ? orgLabel(orgId) : "no organisation"} · here ${st ? st.rowText : "—"}${named ? "" : " · no row names this subscription"}`,
      );
    }
    console.log(`  ${bad} mismatch(es) of ${paying.length}.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
