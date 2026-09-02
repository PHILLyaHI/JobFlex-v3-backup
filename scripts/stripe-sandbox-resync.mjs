// Re-point the plan catalog at the Stripe account the CURRENT key belongs to.
//
// WHY THIS EXISTS. PlanPrice mirrors Stripe product/price ids, and those ids
// are per-account AND per-mode: the live account's price_… ids do not exist in
// a sandbox, so after swapping STRIPE_SECRET_KEY the signup checkout would
// post a live price id to the test API and 400. The admin auto-sync cannot
// repair this on its own — it reuses the mirrored product id and skips any
// (slug, interval) whose mirrored amount already matches, both of which are
// exactly wrong across an account switch.
//
// WHAT IT DOES. For every active, paid PricingPlan: create a fresh Product and
// fresh recurring Price(s) on the account the key reaches, then replace that
// plan's PlanPrice rows with the new mirrors. Rows for other plans are left
// alone; nothing is written to the OLD account (its products simply stop being
// referenced — switch back by running this again under the old key).
//
// RUN:  node scripts/stripe-sandbox-resync.mjs        (from the repo root;
//       reads STRIPE_SECRET_KEY and DATABASE_URL from .env.local)
// Safe to re-run: each run mints fresh prices and repoints the mirror.
//
// Standalone .mjs on purpose — no "@/lib" aliases, so it runs under plain node
// with no build step, the same shape as scripts/backfill-job-conversations.mjs.

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");

// .env.local is not auto-loaded outside Next — same gotcha as the Prisma CLI.
for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=("?)(.*)\2\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[3];
}
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = "file:./prisma/dev.db";
// Prisma resolves a relative sqlite path against the schema dir; normalise.
if (process.env.DATABASE_URL === "file:./dev.db") process.env.DATABASE_URL = "file:./prisma/dev.db";

const Stripe = require(path.join(root, "node_modules/stripe"));
const { PrismaClient } = require(path.join(root, "node_modules/@prisma/client"));

const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!key) {
  console.error("STRIPE_SECRET_KEY is not set.");
  process.exit(1);
}
const mode = key.startsWith("sk_live_") ? "LIVE" : "test/sandbox";
if (mode === "LIVE" && process.env.STRIPE_ALLOW_LIVE_WRITES !== "true") {
  console.error("Refusing to mint products on a LIVE key without STRIPE_ALLOW_LIVE_WRITES=true.");
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2024-06-20" });
const db = new PrismaClient();

const plans = await db.pricingPlan.findMany({ where: { active: true } });
console.log(`Account mode: ${mode}. ${plans.length} active plan(s).`);

for (const plan of plans) {
  const specs = [
    { interval: "MONTH", recurring: "month", amount: plan.priceCents },
    { interval: "YEAR", recurring: "year", amount: plan.yearlyPriceCents },
  ].filter((s) => s.amount && s.amount > 0);
  if (!specs.length) {
    console.log(`- ${plan.slug}: free, skipped`);
    continue;
  }

  const product = await stripe.products.create({
    name: plan.name,
    metadata: { planSlug: plan.slug },
  });

  for (const spec of specs) {
    const price = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: spec.amount,
      recurring: { interval: spec.recurring },
      metadata: { planSlug: plan.slug, interval: spec.interval },
    });
    await db.$transaction([
      db.planPrice.deleteMany({ where: { planSlug: plan.slug, interval: spec.interval } }),
      db.planPrice.create({
        data: {
          planSlug: plan.slug,
          interval: spec.interval,
          unitAmountCents: spec.amount,
          currency: "usd",
          stripeProductId: product.id,
          stripePriceId: price.id,
          active: true,
        },
      }),
    ]);
    console.log(`- ${plan.slug} ${spec.interval}: $${(spec.amount / 100).toFixed(2)} -> ${price.id}`);
  }
}

await db.$disconnect();
console.log("Done. Checkout now prices from this account.");
