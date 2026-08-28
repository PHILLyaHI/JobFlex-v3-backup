/**
 * The Instant order ledger, from the command line.
 *
 *   npx tsx scripts/qa/roof/instant-orders.ts             list every order
 *   npx tsx scripts/qa/roof/instant-orders.ts --collect   also try to fetch
 *                                                         each pending order
 *
 * Collecting is FREE: the order was paid for when EagleView accepted it, and
 * result/{id} only retrieves what that payment bought. A pending row that
 * collects becomes `complete` with the answer stored, and the next measurement
 * of its address reuses it without ordering again. Orders whose id was lost
 * before the ledger existed (the two 12117 202nd St SE timeouts of 2026-08-26)
 * are not here and cannot be recovered by anyone.
 */
import { loadHarnessEnv } from "./env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

loadHarnessEnv();
const req = createRequire(resolve(process.cwd(), "package.json"));

import { pollInstantResult } from "../../../src/lib/eagleview";

const COLLECT = process.argv.includes("--collect");

interface OrderRow {
  id: string;
  addressKey: string;
  address: string | null;
  requestId: string;
  status: string;
  instantJson: string | null;
  error: string | null;
  createdAt: Date;
}

async function main() {
  const { PrismaClient } = req("@prisma/client") as { PrismaClient: new () => never };
  const db = new (PrismaClient as never)() as {
    instantOrder: {
      findMany: (a?: unknown) => Promise<OrderRow[]>;
      update: (a: unknown) => Promise<unknown>;
    };
    $disconnect: () => Promise<void>;
  };

  const rows = await db.instantOrder.findMany({ orderBy: { createdAt: "asc" } });
  if (!rows.length) {
    console.log("the ledger is empty — no Instant orders have been placed since it exists");
    await db.$disconnect();
    return;
  }

  console.log(`${rows.length} order(s):`);
  for (const r of rows) {
    console.log(
      `  ${r.createdAt.toISOString()}  ${r.status.padEnd(8)}  ${r.requestId}  ${r.address ?? r.addressKey}` +
        (r.error ? `  — ${r.error.slice(0, 80)}` : ""),
    );
  }

  const pending = rows.filter((r) => r.status === "pending");
  if (!pending.length) {
    console.log("nothing pending — nothing to collect");
  } else if (!COLLECT) {
    console.log(`${pending.length} pending — rerun with --collect to try fetching them (free: already paid for)`);
  } else {
    for (const r of pending) {
      process.stdout.write(`  collecting ${r.requestId} (${r.address ?? r.addressKey})… `);
      try {
        // One immediate check (maxWaitMs 0 → a single poll, no sleep).
        const got = await pollInstantResult(r.requestId, { address: r.address ?? "" }, r.address ?? "", 0);
        if (got) {
          await db.instantOrder.update({
            where: { id: r.id },
            data: { status: "complete", instantJson: JSON.stringify(got) },
          });
          console.log(`COMPLETE — ${got.totals.areaSqft.toFixed(0)} sq ft, ${got.totals.facetCount ?? "?"} facets stored`);
        } else {
          console.log("still processing — try again later");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/^Property Data request /.test(msg) && /fail|error|reject/i.test(msg)) {
          await db.instantOrder.update({ where: { id: r.id }, data: { status: "failed", error: msg } });
          console.log(`FAILED for good — ${msg}`);
        } else {
          console.log(`transport error, order still pending — ${msg}`);
        }
      }
    }
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
