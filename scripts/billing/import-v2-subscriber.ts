// PAYING SUBSCRIBERS LEFT IN THE OLD APP — carried over one by one (2026-10-01).
//
//   npx tsx --tsconfig tsconfig.json scripts/billing/import-v2-subscriber.ts --prod                 # dry run
//   npx tsx --tsconfig tsconfig.json scripts/billing/import-v2-subscriber.ts --prod --fix           # write, mail, tag Stripe
//   … --subs sub_a,sub_b        other subscriptions than the two below
//
// Two live subscriptions carry the old app's metadata (userId / planId of v2)
// and point at nobody here: no user, no organisation, no row. For each:
//   1. a User (the Stripe customer's email and name, no password), an
//      Organization (the customer's name, else the email before "@"; no trade),
//      an OWNER Membership;
//   2. the subscription row, written by the webhook's own handler
//      (syncSubscriptionFromStripe) — plan from the price ledger, status and
//      renewal date from Stripe, the plan's limits with it;
//   3. organizationId and userId into the subscription's metadata on Stripe —
//      the only live write, metadata only — so every later event maps itself.
//      The old userId is kept as v2UserId;
//   4. "Your JobFlex account is ready — set your password": the ordinary reset
//      token (/auth/reset?token=…, stored hashed), minted for 24 hours.
//
// DRY RUN BY DEFAULT: reads only, says what would be created, and writes each
// email's preview to .cache/import-v2/. The same email is in /dev/emails
// (18b · buildAccountReady). --fix writes. Idempotent: the import is recorded
// in SyncState v2import:<subscription>; a second run reuses the user and the
// organisation, re-asserts the row and the metadata, and sends no second
// email (--resend-mail sends a fresh link on purpose).

import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import type Stripe from "stripe";
import { ROOT, openEnvironment } from "./_prod";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const opt = (n: string) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const PROD = flag("--prod");
const FIX = flag("--fix");
const RESEND = flag("--resend-mail");
const SUBS = (opt("--subs") ?? "sub_1U7gmG32nNmZaeo9jN8YkVHE,sub_1TO6C732nNmZaeo9xpFgn6GQ").split(",").map((s) => s.trim()).filter(Boolean);
const OUT = path.join(ROOT, ".cache/import-v2");
const LINK_TTL_MS = 24 * 60 * 60 * 1000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

type ImportRecord = { userId: string; orgId: string; mailedAt?: string };

async function main() {
  const { where } = openEnvironment({ prod: PROD, out: OUT, allowLiveWrites: false });
  // On production with --fix the email goes out for real; anything else lands in the outbox.
  if (PROD && FIX) {
    delete process.env.EMAIL_DEV_OUTBOX;
    if (process.env.DEV_EMAIL_OVERRIDE?.trim()) throw new Error("DEV_EMAIL_OVERRIDE is set — the email would go to the wrong inbox; refusing");
  }
  const BASE = PROD ? "https://www.jobflex.app" : "http://localhost:3000";

  await import("../qa/_server-only");
  const { db } = await import("../../src/lib/db");
  const { getStripe } = await import("../../src/lib/sdk/stripe");
  const { syncSubscriptionFromStripe, mirrorStatusFor } = await import("../../src/lib/stripeSync");
  const { subscriptionPeriodEndDate } = await import("../../src/lib/stripeCompat");
  const { parsePlanLimits } = await import("../../src/lib/planLimits");
  const { slugify, uniqueOrgSlug } = await import("../../src/lib/orgSlug");
  const { renderEmail } = await import("../../src/lib/email/renderEmail");
  const { buildAccountReady } = await import("../../src/lib/email/build/platform");
  const { sendEmail, isResendEnabled, EMAIL_FROM } = await import("../../src/lib/sdk/resend");
  const stripe = getStripe();

  // The sender. .env.local may carry a development sender (Resend's shared
  // onboarding@resend.dev delivers only to the Resend account's own inbox), so
  // production mail takes --from, and refuses a resend.dev sender outright.
  const FROM = opt("--from") ?? EMAIL_FROM;
  if (PROD && FIX && /@resend\.dev>?$/i.test(FROM)) throw new Error(`the sender is ${FROM} — Resend's test address delivers to nobody else; pass --from "JobFlex <app@jobflex.app>"`);
  const transport = process.env.EMAIL_DEV_OUTBOX ? `dev outbox ${path.relative(ROOT, process.env.EMAIL_DEV_OUTBOX)}` : isResendEnabled() ? "Resend" : process.env.SMTP_HOST ? "SMTP" : "NONE — would not be sent";
  console.log(`IMPORT V2 SUBSCRIBERS — ${FIX ? "FIX" : "DRY RUN"} · ${where} · Stripe ${PROD ? "LIVE" : "test"} · mail via ${transport}, from ${FROM}${PROD && /@resend\.dev>?$/i.test(FROM) ? " (a TEST sender — --fix refuses it; pass --from)" : ""} · links to ${BASE}`);

  const limitsText = (json: string | null) => {
    const l = parsePlanLimits(json) as { [k: string]: number | null | undefined };
    const keys = Object.keys(l).filter((k) => l[k] != null);
    return keys.length ? keys.map((k) => `${k} ${l[k]}`).join(", ") : "unlimited";
  };

  for (const subId of SUBS) {
    console.log(`\n── ${subId}`);
    const sub = await stripe.subscriptions.retrieve(subId, { expand: ["customer"] });
    const cus = sub.customer as Stripe.Customer | Stripe.DeletedCustomer;
    if ("deleted" in cus && cus.deleted) {
      console.log("  the customer is deleted on Stripe — skipped");
      continue;
    }
    const customer = cus as Stripe.Customer;
    const email = (customer.email ?? "").trim().toLowerCase();
    if (!email) {
      console.log("  the customer has no email — skipped");
      continue;
    }
    const name = customer.name?.trim() || null;
    const orgName = name || email.split("@")[0];
    const priceId = sub.items.data[0]?.price?.id ?? "";
    const ledger = await db.planPrice.findUnique({ where: { stripePriceId: priceId } });
    const plans = await db.pricingPlan.findMany({ select: { slug: true, name: true, limitsJson: true } });
    const plan = ledger ? plans.find((p) => p.slug.toLowerCase() === ledger.planSlug.toLowerCase()) ?? null : null;
    const periodEnd = subscriptionPeriodEndDate(sub);
    console.log(`  Stripe: ${sub.status} · ${sub.items.data.map((i) => `$${((i.price.unit_amount ?? 0) / 100).toFixed(2)}/${i.price.recurring?.interval}`).join(" + ")} · renews ${periodEnd?.toISOString().slice(0, 10) ?? "—"} · ${customer.id} ${email} "${name ?? ""}"`);
    console.log(`  metadata now: ${JSON.stringify(sub.metadata ?? {})}`);
    if (!["active", "trialing", "past_due"].includes(sub.status)) {
      console.log("  not live on Stripe — skipped");
      continue;
    }
    if (!ledger || !plan) {
      console.log(`  price ${priceId} is not in the price ledger (PlanPrice) — the plan cannot be named; skipped`);
      continue;
    }

    // What already exists — the record of an earlier run, or a user with this email.
    const key = `v2import:${sub.id}`;
    const prior = await db.syncState.findUnique({ where: { key } }).catch(() => null);
    const record: ImportRecord | null = prior ? (JSON.parse(prior.cursor) as ImportRecord) : null;
    const existingUser = await db.user.findFirst({
      where: { email: { in: [...new Set([email, customer.email ?? email])] } },
      select: { id: true, name: true, hashedPassword: true, memberships: { select: { organizationId: true, role: true } } },
    });
    if (existingUser && (!record || record.userId !== existingUser.id)) {
      console.log(`  A USER WITH THIS EMAIL ALREADY EXISTS (${existingUser.id}, ${existingUser.memberships.map((m) => `${m.role} of ${m.organizationId}`).join(", ") || "no organisation"}) and this script did not create it — not touched; link it with reconcile-subscription-rows instead`);
      continue;
    }
    const otherRow = await db.subscription.findFirst({ where: { externalSubId: sub.id } });
    if (otherRow && otherRow.organizationId !== record?.orgId) {
      console.log(`  a row already names this subscription (organisation ${otherRow.organizationId}) — not touched`);
      continue;
    }

    const slugBase = slugify(orgName);
    const slugTaken = !record && (await db.organization.findUnique({ where: { slug: slugBase }, select: { id: true } }));
    const metaAfter: { [k: string]: string } = { ...(sub.metadata ?? {}) };
    if (sub.metadata?.userId && !sub.metadata.v2UserId && sub.metadata.userId !== record?.userId) metaAfter.v2UserId = sub.metadata.userId;

    console.log(`  ${record ? `already imported: user ${record.userId}, organisation ${record.orgId}${record.mailedAt ? `, mailed ${record.mailedAt}` : ""}` : "will create:"}`);
    if (!record) {
      console.log(`    User          email ${email} · name ${name ?? "—"} · no password · active organisation = the new one`);
      console.log(`    Organization  "${orgName}" · slug ${slugTaken ? `${slugBase}-<4 hex> (${slugBase} is taken)` : slugBase} · billing email ${email} · no trade, no address`);
      console.log(`    Membership    OWNER`);
    }
    console.log(`    Subscription  ${plan.slug.toUpperCase()} (${plan.name}) · ${mirrorStatusFor(sub)} · STRIPE · sub ${sub.id} · customer ${customer.id} · price ${priceId} · renews ${periodEnd?.toISOString() ?? "—"}`);
    console.log(`    limits        ${limitsText(plan.limitsJson)}`);
    console.log(`    Stripe metadata → ${JSON.stringify({ ...metaAfter, organizationId: record?.orgId ?? "<new organisation id>", userId: record?.userId ?? "<new user id>" })}`);

    const preview = renderEmail(buildAccountReady({ name, email, workspace: orgName, planName: plan.name, href: `${BASE}/auth/reset?token=<minted at send, 24 hours>` }));
    const previewFile = path.join(OUT, `preview-${sub.id}.html`);
    fs.writeFileSync(previewFile, `<!-- to: ${email} | subject: ${preview.subject} -->\n${preview.html}`);
    const willMail = !record?.mailedAt || RESEND;
    console.log(`    Email         ${willMail ? "" : "(already sent — not again) "}to ${email} · "${preview.subject}" · link ${BASE}/auth/reset?token=… valid 24 h · preview ${path.relative(ROOT, previewFile)}`);

    if (!FIX) continue;

    // 1. user, organisation, membership — one transaction, or reuse the record's.
    let ids = record;
    if (!ids) {
      const slug = await uniqueOrgSlug(slugBase);
      ids = await db.$transaction(async (tx) => {
        const org = await tx.organization.create({ data: { name: orgName, slug, billingEmail: email }, select: { id: true } });
        const user = await tx.user.create({ data: { email, name, activeOrgId: org.id }, select: { id: true } });
        await tx.membership.create({ data: { userId: user.id, organizationId: org.id, role: "OWNER" } });
        return { userId: user.id, orgId: org.id };
      });
      await db.syncState.create({ data: { key, cursor: JSON.stringify(ids) } });
      console.log(`  created user ${ids.userId}, organisation ${ids.orgId} (${slug})`);
    }

    // 2. the row, by the webhook's handler, as if the event already named the organisation.
    await syncSubscriptionFromStripe({ ...sub, metadata: { ...(sub.metadata ?? {}), organizationId: ids.orgId } }, stripe);
    const row = await db.subscription.findUnique({ where: { organizationId: ids.orgId } });
    console.log(`  row: ${row ? `${row.plan} ${row.status} ${row.provider} sub=${row.externalSubId} cust=${row.externalCustomerId} renews ${row.currentPeriodEnd?.toISOString() ?? "—"}` : "NOT WRITTEN — look at the sync"}`);

    // 3. Stripe metadata — the one live write.
    const wanted = { ...metaAfter, organizationId: ids.orgId, userId: ids.userId };
    const same = Object.entries(wanted).every(([k, v]) => sub.metadata?.[k] === v);
    if (!same) await stripe.subscriptions.update(sub.id, { metadata: wanted });
    const check = await stripe.subscriptions.retrieve(sub.id);
    console.log(`  Stripe metadata ${same ? "already set" : "written"}: ${JSON.stringify(check.metadata)}`);

    // 4. the email, once.
    if (willMail) {
      await db.verificationToken.deleteMany({ where: { identifier: email } });
      const rawToken = randomBytes(32).toString("hex");
      await db.verificationToken.create({ data: { identifier: email, token: sha256(rawToken), expires: new Date(Date.now() + LINK_TTL_MS) } });
      const mail = renderEmail(buildAccountReady({ name, email, workspace: orgName, planName: plan.name, href: `${BASE}/auth/reset?token=${rawToken}` }));
      const sent = await sendEmail({ to: email, subject: mail.subject, html: mail.html, from: FROM });
      const done: ImportRecord = { ...ids, mailedAt: new Date().toISOString() };
      await db.syncState.update({ where: { key }, data: { cursor: JSON.stringify(done) } });
      console.log(`  email: ${sent.skipped ? `NOT sent (${sent.id})` : `sent, id ${sent.id}`} · link valid until ${new Date(Date.now() + LINK_TTL_MS).toISOString()}`);
    }
  }
  if (!FIX) console.log("\nDRY RUN — nothing written. --fix creates, writes the row, tags Stripe and sends the emails.");
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
