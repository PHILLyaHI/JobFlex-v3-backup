// THE CLOVER GAP — the one-off repair (2026-10-01).
//
//   npx tsx --tsconfig tsconfig.json scripts/billing/clover-backfill.ts --prod [--since 2026-09-24]            # dry run
//   npx tsx --tsconfig tsconfig.json scripts/billing/clover-backfill.ts --prod --fix                           # write
//   npx tsx --tsconfig tsconfig.json scripts/billing/clover-backfill.ts --prod --fix --credit-rewards          # + referral credits on Stripe
//
// While the production webhook endpoint ran on 2025-11-17.clover, the handlers
// read fields that version no longer sends (lib/stripeCompat has the list), and
// every one of them failed SILENTLY: the events were answered 200 and recorded
// PROCESSED, so a resend is now a "duplicate" and repairs nothing. What was lost:
//
//   · commissions — invoice.paid skipped every invoice as "not-paid";
//   · refunds of those charges — charge.refunded found no invoice, parked nothing;
//   · referral conversions and the referrers' credits — same guard;
//   · PAST_DUE — invoice.payment_failed found no subscription;
//   · the mirror — every customer.subscription.* wrote null over the renewal
//     date and the applied code, and a partner's new client got NO attribution
//     (the discount moved to `discounts`), so later invoices have nothing to accrue to.
//
// This walks Stripe for the window and replays the SAME handlers, now fixed:
//   1. every subscription whose mirror disagrees with Stripe, or that carries a
//      partner code without an attribution → syncSubscriptionFromStripe;
//   2. every paid invoice of the window, oldest first → accrueForInvoice, and
//      → processReferralEffectsForInvoice (conversions; the credit itself is a
//      Stripe write and needs --credit-rewards);
//   3. every refund of the window → reverseForCharge, so a refund of a charge
//      accrued now, or accrued before the window, takes its share back.
// Every effect is keyed (accrue:<invoice>, reverse:<charge>:…, refcredit:<id>),
// so a second run, or a window that overlaps healthy days, changes nothing.
//
// DRY RUN BY DEFAULT: Stripe and the database are only read, and the report
// says what --fix would write. The dry run's commission figures come from a
// read-only walk of accrueForInvoice's own rules; --fix runs the real handlers
// and prints what each one returned.
//
// --prod: the production database. The URL is read from
// C:\Users\ivana\Downloads\prod-db-url.txt into memory and the file is deleted
// at once (each run needs the file again); a Postgres Prisma client is
// generated beside this run in .cache/clover-backfill. The LIVE key from
// .env.local is required. Without --prod: the local database and the test key
// only (the sandbox rehearsal). Mail goes to .cache/clover-backfill/outbox,
// never out; analytics are off.

import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { spawnSync } from "node:child_process";
import type Stripe from "stripe";

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, ".cache/clover-backfill");
const URL_FILE = "C:/Users/ivana/Downloads/prod-db-url.txt";
const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const opt = (n: string) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const PROD = flag("--prod");
const FIX = flag("--fix");
const CREDIT = flag("--credit-rewards");
const SINCE = new Date(opt("--since") ?? "2026-09-24T00:00:00Z");
const UNTIL = opt("--until") ? new Date(opt("--until")!) : new Date();
if (Number.isNaN(SINCE.getTime()) || Number.isNaN(UNTIL.getTime())) throw new Error("--since / --until: not a date");
fs.mkdirSync(OUT, { recursive: true });

// ── environment, before any app module loads ───────────
function loadEnv() {
  // Next's own loader: .env.local, then .env; a variable already set wins.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { loadEnvConfig } = require("@next/env") as typeof import("@next/env");
  loadEnvConfig(ROOT, true, { info: () => {}, error: console.error });
  process.env.EMAIL_DEV_OUTBOX = path.join(OUT, "outbox");
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "";
  process.env.META_CAPI_ACCESS_TOKEN = "";
  delete process.env.STRIPE_MOCK_FILE;
  // Live writes only for the referral credit, and only when asked for.
  process.env.STRIPE_ALLOW_LIVE_WRITES = FIX && CREDIT ? "true" : "";
}

function openProductionDatabase(): string {
  const raw = fs.readFileSync(URL_FILE, "utf8");
  fs.unlinkSync(URL_FILE);
  const url = raw.split(/\r?\n/).map((l) => l.trim()).find((l) => /^postgres(ql)?:\/\//i.test(l));
  if (!url) throw new Error("no postgres url in the file (file deleted)");
  const host = new URL(url).hostname;
  if (!/neon\.tech$/.test(host)) throw new Error(`not a Neon host: ${host}`);
  process.env.POSTGRES_URL = url;
  process.env.POSTGRES_URL_NON_POOLING = url;
  process.env.DATABASE_URL = url;

  // The app's schema with the production datasource (scripts/prisma-production-schema.js),
  // generated into its own folder so the shared node_modules client stays SQLite.
  const dir = path.join(OUT, "prisma-pg");
  fs.mkdirSync(dir, { recursive: true });
  const schema = fs
    .readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8")
    .replace(/datasource db \{[\s\S]*?\n\}/, `datasource db {\n  provider  = "postgresql"\n  url       = env("POSTGRES_URL")\n  directUrl = env("POSTGRES_URL_NON_POOLING")\n}`)
    .replace(/generator client \{[\s\S]*?\n\}/, `generator client {\n  provider = "prisma-client-js"\n  output   = "${path.join(dir, "client").replace(/\\/g, "/")}"\n}`);
  fs.writeFileSync(path.join(dir, "schema.prisma"), schema);
  const gen = spawnSync("npx", ["--no-install", "prisma", "generate", "--schema", path.join(dir, "schema.prisma")], { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32" });
  if (gen.status !== 0) throw new Error(`prisma generate failed:\n${gen.stderr}`);
  const client = path.join(dir, "client", "index.js");
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "@prisma/client" || req === ".prisma/client" || req === ".prisma/client/default") return client;
    return orig.call(this, req, ...rest);
  };
  return host;
}

// ── report helpers ─────────────────────────────────────
const usd = (c: number | null | undefined) => (c == null ? "—" : `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toFixed(2)}`);
const day = (s: number | Date) => (s instanceof Date ? s : new Date(s * 1000)).toISOString().slice(0, 16).replace("T", " ");
const lines: string[] = [];
const say = (s = "") => {
  lines.push(s);
  console.log(s);
};

async function main() {
  loadEnv();
  let where: string;
  if (PROD) {
    where = `production (${openProductionDatabase()})`;
  } else {
    const url = process.env.DATABASE_URL ?? "";
    if (!/^file:/.test(url)) throw new Error("without --prod only a local SQLite database is allowed");
    where = `local (${url.replace(/^file:/, "")})`;
  }
  const live = (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_");
  if (PROD !== live) {
    throw new Error(PROD ? "--prod needs the LIVE key (STRIPE_SECRET_KEY=sk_live_…)" : "a live key against a local database — refusing; blank STRIPE_SECRET_KEY for the sandbox");
  }

  // The app's modules, now that the client and the environment are in place.
  await import("../qa/_server-only");
  const { db } = await import("../../src/lib/db");
  const { getStripe } = await import("../../src/lib/sdk/stripe");
  const sync = await import("../../src/lib/stripeSync");
  const { processReferralEffectsForInvoice } = await import("../../src/lib/referralRewards");
  const C = await import("../../src/lib/stripeCompat");
  const { computeCommissionCents, commissionBasisCents, isWithinCommissionWindow } = await import("../../src/lib/commission");
  const stripe = getStripe();
  // Lists leave out objects on a test clock unless asked by clock; the sandbox
  // rehearsal runs on clocks, production has none.
  const clocks: Array<string | undefined> = [undefined];
  if (!live) for await (const c of stripe.testHelpers.testClocks.list({ limit: 100 })) clocks.push(c.id);
  const byClock = <T>(list: (clock: string | undefined) => AsyncIterable<T>) =>
    (async function* () {
      for (const c of clocks) yield* list(c);
    })();
  const clockArg = (c: string | undefined) => (c ? { test_clock: c } : {});

  say(`CLOVER BACKFILL — ${FIX ? "FIX" : "DRY RUN"} · ${where} · Stripe ${live ? "LIVE" : "test"} · window ${day(SINCE)} → ${day(UNTIL)} UTC`);
  say(`run at ${new Date().toISOString()}${FIX ? ` · referral credits ${CREDIT ? "ON (Stripe writes)" : "off (stay owed)"}` : ""}`);

  // ── 0. where the window came from ─────────────────────
  say("\n0 · EVIDENCE FOR THE WINDOW");
  const endpointId = opt("--endpoint") ?? "we_1SrleQ32nNmZaeo9PI1I5kZj";
  if (live) {
    const ep = await stripe.webhookEndpoints.retrieve(endpointId).catch((e: Error) => ({ error: e.message }));
    say(`  endpoint ${endpointId}: ${"error" in ep ? ep.error : `${ep.url} · api_version ${ep.api_version} · ${ep.status}`}`);
  }
  // Events Stripe still holds (30 days): the version each was rendered at.
  const seenVersions = new Map<string, { first: number; last: number; n: number }>();
  for await (const e of stripe.events.list({ created: { gte: Math.floor(SINCE.getTime() / 1000) - 7 * 86400 }, limit: 100 })) {
    const v = e.api_version ?? "?";
    const s = seenVersions.get(v) ?? { first: e.created, last: e.created, n: 0 };
    s.first = Math.min(s.first, e.created);
    s.last = Math.max(s.last, e.created);
    s.n++;
    seenVersions.set(v, s);
  }
  for (const [v, s] of seenVersions) say(`  events rendered at ${v}: ${s.n}, ${day(s.first)} → ${day(s.last)}`);
  // Our side: invoice.paid events recorded PROCESSED whose invoice has no accrual.
  const received = await db.webhookEvent.findMany({
    where: { provider: "STRIPE", type: { in: ["invoice.paid", "invoice.payment_failed", "customer.subscription.updated", "charge.refunded"] }, receivedAt: { gte: new Date(SINCE.getTime() - 7 * 86400_000) } },
    select: { eventId: true, type: true, status: true, receivedAt: true },
    orderBy: { receivedAt: "asc" },
  });
  const byType = new Map<string, number>();
  for (const r of received) byType.set(`${r.type} ${r.status}`, (byType.get(`${r.type} ${r.status}`) ?? 0) + 1);
  say(`  webhook events recorded since ${day(new Date(SINCE.getTime() - 7 * 86400_000))}: ${[...byType].map(([k, n]) => `${k} ×${n}`).join(", ") || "none"}`);
  if (received.length) say(`  first ${day(received[0].receivedAt)}, last ${day(received[received.length - 1].receivedAt)}`);
  const nullPeriod = await db.subscription.count({ where: { provider: "STRIPE", currentPeriodEnd: null, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } } });
  say(`  live Stripe mirror rows with no renewal date: ${nullPeriod}`);

  // ── 1. subscriptions ──────────────────────────────────
  say("\n1 · SUBSCRIPTIONS — mirror vs Stripe, and partner codes without an attribution");
  const mirrors = await db.subscription.findMany({ where: { provider: "STRIPE" } });
  const mirrorBySub = new Map(mirrors.filter((m) => m.externalSubId).map((m) => [m.externalSubId!, m]));
  const subs: Stripe.Subscription[] = [];
  for await (const s of byClock((c) => stripe.subscriptions.list({ status: "all", limit: 100, expand: ["data.discounts"], ...clockArg(c) }))) subs.push(s);
  const toSync: Stripe.Subscription[] = [];
  /** Attributions the sync step would create, by subscription — for the dry run's accruals. */
  const wouldAttribute = new Map<string, { promoId: string }>();
  for (const sub of subs) {
    const m = mirrorBySub.get(sub.id);
    const diffs: string[] = [];
    if (m) {
      const status = sync.mirrorStatusFor(sub);
      if (m.status !== status) diffs.push(`status ${m.status} → ${status}`);
      const end = C.subscriptionPeriodEndDate(sub);
      if ((m.currentPeriodEnd?.getTime() ?? null) !== (end?.getTime() ?? null) && !["CANCELED", "TRIAL_ENDED"].includes(status)) {
        diffs.push(`renewal ${m.currentPeriodEnd ? day(m.currentPeriodEnd) : "null"} → ${end ? day(end) : "null"}`);
      }
      const d = (await C.subscriptionDiscounts(sub, stripe))[0] ?? null;
      if ((m.appliedPromotionCodeId ?? null) !== (d?.promotionCodeId ?? null) || (m.appliedCouponId ?? null) !== (d?.couponId ?? null)) {
        diffs.push(`code ${m.appliedPromotionCodeId ?? m.appliedCouponId ?? "none"} → ${d?.promotionCodeId ?? d?.couponId ?? "none"}`);
      }
    }
    // A partner's code on a subscription the ledger knows nothing about.
    let promo = null;
    for (const d of await C.subscriptionDiscounts(sub, stripe)) {
      promo = await sync.resolvePromoCode(d, stripe);
      if (promo) break;
    }
    if (promo && !["canceled", "incomplete_expired"].includes(sub.status)) {
      const own = await db.attribution.findUnique({ where: { stripeSubscriptionId: sub.id }, select: { id: true } });
      const orgId = m?.organizationId ?? sub.metadata?.organizationId ?? null;
      const elsewhere = orgId ? await db.attribution.findFirst({ where: { organizationId: orgId }, select: { id: true } }) : null;
      if (!own && !elsewhere && orgId) {
        diffs.push(`attribution MISSING for code ${promo.code} → created`);
        wouldAttribute.set(sub.id, { promoId: promo.id });
      }
    }
    if (diffs.length) {
      toSync.push(sub);
      say(`  ${sub.id} · ${m?.organizationId ?? sub.metadata?.organizationId ?? "unmapped"} · Stripe ${sub.status}: ${diffs.join("; ")}`);
    }
  }
  say(`  ${subs.length} subscriptions read, ${toSync.length} to re-sync`);

  // ── 2 & 3. paid invoices of the window ────────────────
  say("\n2 · PAID INVOICES OF THE WINDOW — commission, refunds, referrals");
  const invoices: Stripe.Invoice[] = [];
  const inWindow = { gte: Math.floor(SINCE.getTime() / 1000), lte: Math.floor(UNTIL.getTime() / 1000) };
  // Invoices take no test_clock filter: a clock's are listed by its subscriptions.
  const clockSubs = subs.filter((s) => s.test_clock).map((s) => s.id);
  const invoicesOf = (status: "paid" | "open") =>
    (async function* () {
      yield* stripe.invoices.list({ status, limit: 100, created: inWindow });
      for (const id of clockSubs) yield* stripe.invoices.list({ status, limit: 100, created: inWindow, subscription: id });
    })();
  for await (const inv of invoicesOf("paid")) {
    if ((inv.amount_paid ?? 0) > 0 && C.invoiceSubscriptionId(inv)) invoices.push(inv);
  }
  invoices.sort((a, b) => a.created - b.created);
  const monthsSeen = new Map<string, number>(); // attribution id → qualifyingMonths as the walk goes
  let commissionTotal = 0;
  let reversalTotal = 0;
  const accrualPlan: Stripe.Invoice[] = [];
  const plannedByCharge = new Map<string, number>(); // charge → commission this run would accrue
  for (const inv of invoices) {
    const subId = C.invoiceSubscriptionId(inv)!;
    const mirror = mirrorBySub.get(subId);
    const head = `  ${inv.id} · ${day(inv.created)} · ${usd(inv.amount_paid)} · ${subId} · org ${mirror?.organizationId ?? "?"}`;
    let verdict: string;
    let commission = 0;
    const accrued = await db.commissionLedger.findUnique({ where: { idempotencyKey: `accrue:${inv.id}` }, select: { amountCents: true } });
    const chargeId = await C.invoiceChargeId(inv, stripe);
    if (accrued) {
      verdict = `already accrued ${usd(accrued.amountCents)}`;
    } else {
      // accrueForInvoice's rules, read-only.
      let attr = await db.attribution.findUnique({ where: { stripeSubscriptionId: subId }, include: { promoCode: true, influencer: true } });
      let via = "";
      if (!attr) {
        const from = await db.syncState.findUnique({ where: { key: `attributionFrom:${subId}` } }).catch(() => null);
        if (from) {
          attr = await db.attribution.findUnique({ where: { id: from.cursor }, include: { promoCode: true, influencer: true } });
          via = " (moved-on subscription)";
        }
      }
      if (!attr && mirror) {
        attr = await db.attribution.findFirst({ where: { organizationId: mirror.organizationId }, orderBy: { createdAt: "desc" }, include: { promoCode: true, influencer: true } });
        if (attr) via = " (carried from the client's earlier subscription)";
      }
      const planned = wouldAttribute.get(subId);
      if (!attr && planned) {
        const promo = await db.promoCode.findUnique({ where: { id: planned.promoId }, include: { influencer: true } });
        if (promo) {
          attr = { id: `new:${subId}`, status: "ACTIVE", qualifyingMonths: 0, influencerId: promo.influencerId, organizationId: mirror?.organizationId ?? null, promoCode: promo, influencer: promo.influencer } as never;
          via = " (attribution created by step 1)";
        }
      }
      if (!attr || attr.status !== "ACTIVE") verdict = "no commission: no active attribution";
      else if (await sync.isSelfReferral(attr.influencerId, attr.organizationId)) verdict = "no commission: self-referral";
      else if (["SUSPENDED", "TERMINATED"].includes(attr.influencer.status)) verdict = `no commission: partner ${attr.influencer.status}`;
      else {
        const months = monthsSeen.get(attr.id) ?? attr.qualifyingMonths;
        const isProration = inv.billing_reason === "subscription_update";
        if (!isWithinCommissionWindow(attr.promoCode, months)) verdict = `no commission: outside the window (${months} months counted)`;
        else if (isProration && attr.promoCode.commissionType === "FLAT") verdict = "no commission: FLAT on a proration";
        else {
          const basis = commissionBasisCents(attr.promoCode, { amountPaidCents: inv.amount_paid, subtotalCents: inv.subtotal ?? inv.amount_paid });
          commission = Math.min(computeCommissionCents(attr.promoCode, basis), inv.amount_paid);
          if (!isProration) monthsSeen.set(attr.id, months + 1);
          verdict = commission > 0 ? `ACCRUE ${usd(commission)} to ${attr.influencer.displayName} (${attr.promoCode.code})${via} · charge ${chargeId ?? "none"}` : "no commission: zero";
          commissionTotal += commission;
          if (commission > 0 && chargeId) plannedByCharge.set(chargeId, commission);
        }
      }
    }
    // Referral side.
    let referral = "";
    if (mirror) {
      const pending = await db.referralConversion.count({ where: { signupOrgId: mirror.organizationId, status: "PENDING" } });
      const owed = await db.referralConversion.count({ where: { status: "CONVERTED", rewardAppliedAt: null, OR: [{ signupOrgId: mirror.organizationId }, { code: { organizationId: mirror.organizationId } }] } });
      if (pending) referral += ` · referral: ${pending} PENDING → CONVERTED`;
      if (pending || owed) referral += ` · credits owed ${owed + pending}${CREDIT ? " (would be credited)" : " (stay owed without --credit-rewards)"}`;
    }
    say(`${head}\n      ${verdict}${referral}`);
    accrualPlan.push(inv);
  }
  say(`  ${invoices.length} paid invoices · commission to accrue ${usd(commissionTotal)}`);

  // Refunds: charge.refunded found no invoice on clover and reversed nothing.
  say("\n2b · REFUNDS OF THE WINDOW — the partner's share taken back");
  const refundedCharges = new Map<string, Stripe.Charge>();
  for await (const rf of stripe.refunds.list({ limit: 100, created: { gte: Math.floor(SINCE.getTime() / 1000), lte: Math.floor(UNTIL.getTime() / 1000) } })) {
    const id = C.refId(rf.charge);
    if (id && !refundedCharges.has(id)) refundedCharges.set(id, await stripe.charges.retrieve(id));
  }
  for (const [id, ch] of refundedCharges) {
    const ratio = ch.amount > 0 ? Math.min(1, ch.amount_refunded / ch.amount) : 0;
    const accruals = await db.commissionLedger.findMany({ where: { stripeChargeId: id, entryType: "ACCRUED" } });
    const amounts = accruals.filter((a) => a.state !== "VOID").map((a) => ({ inv: a.stripeInvoiceId, cents: a.amountCents }));
    if (plannedByCharge.has(id)) amounts.push({ inv: "this run", cents: plannedByCharge.get(id)! });
    let delta = 0;
    for (const a of amounts) {
      const prior = a.inv === "this run" ? 0 : -((await db.commissionLedger.aggregate({ where: { stripeInvoiceId: a.inv, entryType: "REVERSED" }, _sum: { amountCents: true } }))._sum.amountCents ?? 0);
      delta += Math.max(0, Math.round(a.cents * ratio) - prior);
    }
    reversalTotal += delta;
    say(`  ${id} · refunded ${usd(ch.amount_refunded)} of ${usd(ch.amount)} · ${amounts.length ? (delta ? `REVERSE ${usd(-delta)}` : "already reversed") : "no commission on it"}`);
  }
  if (!refundedCharges.size) say("  none");
  say(`  reversals ${usd(-reversalTotal)}`);

  // PAST_DUE: what the failed payments of the window left behind.
  say("\n3 · FAILED PAYMENTS OF THE WINDOW — PAST_DUE");
  let failed = 0;
  for await (const inv of invoicesOf("open")) {
    if (!inv.attempted) continue;
    const subId = C.invoiceSubscriptionId(inv);
    const sub = subs.find((s) => s.id === subId);
    const m = subId ? mirrorBySub.get(subId) : undefined;
    failed++;
    say(`  ${inv.id} · ${day(inv.created)} · ${usd(inv.amount_due)} · ${subId} · Stripe ${sub?.status ?? "?"} · mirror ${m?.status ?? "none"}${sub && m && m.status !== sync.mirrorStatusFor(sub) ? " → re-synced in step 1" : ""}`);
  }
  if (!failed) say("  none");

  if (!FIX) {
    say("\nDRY RUN — nothing written. --fix runs steps 1, 2 and 2b with the real handlers; 3 is repaired by step 1.");
    finish();
    await db.$disconnect();
    return;
  }

  // ── FIX ───────────────────────────────────────────────
  say("\nFIX");
  for (const sub of toSync) {
    const full = await stripe.subscriptions.retrieve(sub.id);
    await sync.syncSubscriptionFromStripe(full, stripe);
    const m = await db.subscription.findFirst({ where: { externalSubId: sub.id }, select: { status: true, currentPeriodEnd: true, appliedPromotionCodeId: true } });
    const a = await db.attribution.findUnique({ where: { stripeSubscriptionId: sub.id }, select: { status: true } });
    say(`  synced ${sub.id}: ${JSON.stringify(m)}${a ? ` · attribution ${a.status}` : ""}`);
  }
  for (const inv of accrualPlan) {
    const r = await sync.accrueForInvoice(inv, undefined, stripe);
    await processReferralEffectsForInvoice(inv);
    say(`  accrue ${inv.id}: ${JSON.stringify(r)}`);
  }
  for (const [id, ch] of refundedCharges) {
    say(`  refund ${id}: ${JSON.stringify(await sync.reverseForCharge(ch, undefined, stripe))}`);
  }
  say("\nDone. Run again without --fix: every line should read 'already accrued' and step 1 should be empty.");
  finish();
  await db.$disconnect();
}

function finish() {
  const file = path.join(OUT, `report-${FIX ? "fix" : "dry"}-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
  fs.writeFileSync(file, lines.join("\n") + "\n");
  console.log(`\nreport: ${path.relative(ROOT, file)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
