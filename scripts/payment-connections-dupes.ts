// READ-ONLY (2026-09-20): Stripe accounts joined to more than one workspace.
//
// The schema now carries @@unique([stripeAccountId, provider]) on
// PaymentConnection. Before that index is applied to a database, run this
// against it: any group below would make the migration fail, and each is a
// decision for the operator (which workspace keeps the account).
//
//   npx tsx --tsconfig tsconfig.json scripts/payment-connections-dupes.ts
//
// Needs DATABASE_URL of the target. Prints org ids and account ids, no secrets.
// The same question in SQL, for a production console:
//   SELECT "stripeAccountId", provider, count(*) AS rows
//   FROM "PaymentConnection"
//   WHERE "stripeAccountId" IS NOT NULL
//   GROUP BY 1, 2 HAVING count(*) > 1;
import { db } from "../src/lib/db";

async function main() {
  const rows = await db.paymentConnection.findMany({
    where: { stripeAccountId: { not: null } },
    select: { id: true, organizationId: true, provider: true, stripeAccountId: true, status: true, connectedAt: true },
    orderBy: { connectedAt: "asc" },
  });
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.provider}:${r.stripeAccountId}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const dupes = [...groups.entries()].filter(([, g]) => g.length > 1);
  console.log(`${rows.length} Stripe-joined row(s), ${dupes.length} account(s) held by more than one workspace.`);
  for (const [k, g] of dupes) {
    console.log(`  ${k}`);
    for (const r of g) console.log(`     org ${r.organizationId}  row ${r.id}  ${r.status}  since ${r.connectedAt.toISOString().slice(0, 10)}`);
  }
  if (dupes.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
