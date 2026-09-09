// Re-check EagleView Property Data entitlements — the manual reset.
//
// The account-level table EagleViewEntitlement remembers which packs EagleView
// accepted (live) and refused (denied, re-probed after a day). When the
// subscription changes on EagleView's side and you do not want to wait a day,
// run this: it forgets every verdict, so the NEXT Instant measure probes
// every pack again — pack by pack, paying only for the ones that are accepted.
// Nothing is ordered here; the probe happens on the next real measurement.
//
//   npx tsx --env-file=.env.local scripts/eagleview-recheck-entitlements.ts
//   npx tsx --env-file=.env.local scripts/eagleview-recheck-entitlements.ts --show   (print, do not reset)

import { readEntitlements, resetEntitlements } from "@/lib/eagleviewEntitlements";

async function main() {
  const show = process.argv.includes("--show");
  const before = await readEntitlements();
  const observed = [...before.values()].filter((r) => !r.assumed).length;
  console.log(`EagleViewEntitlement: ${observed} pack(s) on record, ${before.size - observed} assumed (starting state, not yet verified)`);
  for (const r of [...before.values()].sort((a, b) => a.pack.localeCompare(b.pack))) {
    console.log(`  ${r.pack}  ${r.status.padEnd(6)}  ${r.assumed ? "assumed         " : r.checkedAt.toISOString().slice(0, 16)}${r.error ? `  ${r.error.slice(0, 80)}` : ""}`);
  }
  if (show) return;
  const n = await resetEntitlements();
  console.log(`reset: ${n} row(s) removed — the next Instant measure re-probes every pack (only accepted packs are billed).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
