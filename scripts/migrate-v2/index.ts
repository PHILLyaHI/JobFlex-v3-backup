// Legacy JobFlex -> JobFlex v3 subscriber import.
//
//   OLD_DATABASE_URL=... TARGET_DATABASE_URL=... \
//     npx tsx scripts/migrate-v2/index.ts --email someone@example.com --target local [--dry-run]
//
//   ... --all-active-paid --target local --merge-into-existing
//
// See README.md for the full runbook. Each account is imported inside ONE
// interactive transaction, so a failure anywhere leaves that account untouched and
// --dry-run is simply "do all of it for real, then roll back". In batch mode the
// accounts are independent: one failing does not stop or undo the others.
import { disconnectAll, getReader, getWriter } from "./client";
import type { Reader, Writer } from "./client";
import { INTERNAL_ACCOUNTS, parseFlags, RollbackSignal, TX } from "./config";
import type { Flags } from "./config";
import { ensureLegacyPriceLedger } from "./ledger";
import { planSlug } from "./map";
import * as phases from "./phases";
import type { Ctx, Manifest, Tx } from "./phases";
import {
  findCompedSubscribers,
  findQuotes,
  findUserByEmail,
  findUsersByEmailOrCustomer,
} from "./source";
import type { PaidSubscriber } from "./source";
import { listLegacyPrices, loadStripeSubscriptions } from "./stripe";
import type { StripeCohort } from "./stripe";
import { rollback } from "./rollback";
import { verify } from "./verify";

interface Outcome {
  email: string;
  ok: boolean;
  plan?: string;
  created: number;
  failures: string[];
  error?: string;
  notes: string[];
}

async function runOne(
  reader: Reader,
  writer: Writer,
  flags: Flags,
  email: string,
  stripe: StripeCohort,
): Promise<Outcome> {
  const outcome: Outcome = { email, ok: false, created: 0, failures: [], notes: [] };
  const user = await findUserByEmail(reader, email);
  if (!user) {
    outcome.error = "not found in the old database";
    return outcome;
  }

  console.log(
    `\n${"─".repeat(72)}\n${flags.dryRun ? "DRY RUN" : "IMPORT"} · ${user.email} (${user.id}) -> ${flags.target}`,
  );

  const manifest: Manifest = {
    version: 2,
    email: user.email,
    oldUserId: user.id,
    organizationId: "",
    userId: "",
    target: flags.target,
    startedAt: new Date().toISOString(),
    argv: process.argv.slice(2),
    created: {},
    skipped: {},
    notes: [],
  };

  const stripeSub =
    stripe.byKey.get(user.email) ??
    (user.stripeCustomerId ? stripe.byKey.get(user.stripeCustomerId) : undefined);

  const quotes = await findQuotes(reader, user.id);
  const clientIds = [...new Set(quotes.map((q) => q.clientId).filter((c): c is string => !!c))];

  try {
    await writer.$transaction(async (tx) => {
      const ctx: Ctx = {
        flags,
        reader,
        tx: tx as Tx,
        user,
        manifest,
        migratedUserIds: new Set([user.id]),
        clientIds: new Map(),
        stripeSub,
      };
      await phases.phaseIdentity(ctx);
      await phases.phaseClients(ctx, clientIds);
      await phases.phaseProposals(ctx, quotes);
      await phases.phaseCalendar(ctx, quotes);
      await phases.phaseMessages(ctx);
      await phases.phaseLeads(ctx);
      await phases.writeManifest(ctx);
      if (flags.dryRun) throw new RollbackSignal();
    }, TX);
  } catch (err) {
    if (!(err instanceof RollbackSignal)) {
      outcome.error = err instanceof Error ? err.message : String(err);
      console.log(`   !! ${outcome.error}`);
      return outcome;
    }
  }

  outcome.notes = manifest.notes;
  outcome.created = Object.values(manifest.created).reduce((a, ids) => a + ids.length, 0);
  const created = Object.entries(manifest.created)
    .map(([m, ids]) => `${ids.length} ${m}`)
    .join(" · ");
  console.log(`   created: ${created || "nothing"}`);

  if (flags.dryRun) {
    outcome.ok = true;
    return outcome;
  }

  // Local rehearsal only: the bcrypt hash is opaque, so a known password is the
  // only way to drive the real UI. Never on prod — the customer's own password is
  // what must work there.
  if (flags.localTestPassword) {
    if (flags.target !== "local") throw new Error("--local-test-password is refused against prod");
    // bcryptjs is CJS: under tsx the functions hang off `default`.
    const mod = await import("bcryptjs");
    const bcrypt = ((mod as { default?: typeof mod }).default ?? mod) as typeof mod;
    await writer.user.update({
      where: { id: manifest.userId },
      data: { hashedPassword: await bcrypt.hash(flags.localTestPassword, 10) },
    });
    console.log(`   !! local only: password overwritten with the test value`);
  }

  const sub = await writer.subscription.findUnique({ where: { organizationId: manifest.organizationId } });
  outcome.plan = sub ? `${sub.plan}/${sub.status}/${sub.provider}` : "none";

  for (const c of await verify(writer, manifest, flags.localTestPassword ? null : (user.password?.trim() ?? null))) {
    console.log(`   ${c.ok ? "ok  " : "FAIL"}  ${c.label} — ${c.detail}`);
    if (!c.ok) outcome.failures.push(c.label);
  }
  outcome.ok = outcome.failures.length === 0;
  return outcome;
}

/**
 * Who gets imported. Two sources, because neither alone is complete:
 *  - Stripe knows who is being charged; the old database's own status column has
 *    gone stale in both directions (TRIALING/CANCELED next to live subscriptions,
 *    ACTIVE next to canceled ones).
 *  - the old database alone knows the comped accounts — a paid tier with no Stripe
 *    subscription at all.
 * An account whose Stripe subscription exists but is no longer current is neither,
 * and is left out.
 */
async function selectCohort(
  reader: Reader,
  flags: Flags,
  stripe: StripeCohort,
): Promise<{ cohort: PaidSubscriber[]; skippedInternal: string[]; unmatched: StripeCohort["all"] }> {
  const fromStripe = await findUsersByEmailOrCustomer(
    reader,
    stripe.all.map((s) => s.email).filter(Boolean),
    stripe.all.map((s) => s.customerId).filter(Boolean),
  );
  const fromDb = await findCompedSubscribers(reader);

  const byEmail = new Map<string, PaidSubscriber>();
  for (const u of [...fromStripe, ...fromDb]) byEmail.set(u.email, u);

  const skippedInternal: string[] = [];
  if (!flags.includeInternal) {
    for (const email of INTERNAL_ACCOUNTS) {
      if (byEmail.delete(email)) skippedInternal.push(email);
    }
  }
  const cohort = [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email));
  const known = new Set(cohort.map((u) => u.email));
  const unmatched = stripe.all.filter((s) => !known.has(s.email) && !INTERNAL_ACCOUNTS.has(s.email));
  return { cohort, skippedInternal, unmatched };
}

async function main() {
  const flags = parseFlags();
  const reader = getReader();
  const writer = await getWriter(flags.target);

  // Stripe is read in every mode: a single --email import must still know
  // whether that account is a live subscriber or a comp.
  const stripe = await loadStripeSubscriptions(flags.includeTrialing);
  console.log(`\nStripe (${stripe.live ? "LIVE" : "test"} key): ${stripe.all.length} current subscription(s)`);

  if (flags.rollback) {
    const emails = flags.allActivePaid
      ? (await selectCohort(reader, flags, stripe)).cohort.map((u) => u.email)
      : [flags.email];
    for (const email of emails) {
      const user = await findUserByEmail(reader, email);
      if (!user) continue;
      await rollback(writer, user.id).catch((err) => console.log(`  skip ${email}: ${err.message}`));
    }
    return;
  }

  // The price ledger first, so the plan a Stripe-managed record is written with
  // is the same one every later sync will resolve for that price.
  const ledger = await ensureLegacyPriceLedger(writer, await listLegacyPrices(planSlug), flags.dryRun);
  console.log(
    `PlanPrice ledger: ${ledger.present} old price(s) already known, ${ledger.added.length}${flags.dryRun ? " would be" : ""} added as archived rows`,
  );

  let emails = [flags.email];
  if (flags.allActivePaid) {
    const { cohort, skippedInternal, unmatched } = await selectCohort(reader, flags, stripe);
    console.log(`\nImport cohort: ${cohort.length} account(s)\n`);
    console.log(
      "  EMAIL                                  BILLING                          DB SAYS              PW   QUOTES CLIENTS",
    );
    for (const u of cohort) {
      const live = stripe.byKey.get(u.email);
      const billing = live ? `${live.product} · ${live.status}` : "comped — hand grant";
      console.log(
        `  ${u.email.padEnd(38)} ${billing.padEnd(32)} ${`${u.plan}/${u.status}`.padEnd(20)} ${(u.has_password ? "yes" : "NO ").padEnd(4)} ${String(u.quotes).padStart(6)} ${String(u.clients).padStart(7)}`,
      );
    }
    if (skippedInternal.length) {
      console.log(`\n  skipped, internal: ${skippedInternal.join(", ")}  (--include-internal to import)`);
    }
    if (unmatched.length) {
      console.log(`\n  !! paying in Stripe with no matching account in the old app — nothing to migrate:`);
      for (const s of unmatched) console.log(`     ${s.email || "(no email)"} · ${s.product} · ${s.customerId}`);
    }
    emails = cohort.map((u) => u.email);
  }

  const outcomes: Outcome[] = [];
  for (const email of emails) outcomes.push(await runOne(reader, writer, flags, email, stripe));

  console.log(`\n${"═".repeat(72)}\nSUMMARY · ${flags.target}${flags.dryRun ? " · DRY RUN (nothing persisted)" : ""}\n`);
  console.log("  EMAIL                                  ROWS  PLAN / STATUS / PROVIDER     RESULT");
  for (const o of outcomes) {
    const result = o.error ? `ERROR: ${o.error.slice(0, 60)}` : o.ok ? "ok" : `checks failed: ${o.failures.join(", ")}`;
    console.log(`  ${o.email.padEnd(38)} ${String(o.created).padStart(5)}  ${(o.plan ?? "—").padEnd(28)} ${result}`);
  }
  const notes = outcomes.flatMap((o) => o.notes.map((n) => `${o.email}: ${n}`));
  if (notes.length) {
    console.log("\nnotes:");
    for (const n of notes) console.log(`  · ${n}`);
  }
  const bad = outcomes.filter((o) => !o.ok).length;
  console.log(`\n${outcomes.length - bad}/${outcomes.length} clean${bad ? ` · ${bad} need attention` : ""}`);
}

main()
  .catch((err) => {
    console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(disconnectAll);
