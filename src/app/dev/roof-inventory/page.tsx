// DEV-ONLY PREVIEW (2026-09-22) — the roofing inventory redesign on fixture
// data, because the shared dev server's database is a production copy where no
// test account may sign in. 404 in production.
//
//   /dev/roof-inventory                      the desktop redesign inside the real shell
//   /dev/roof-inventory?view=mobile          the handheld build (read it at 390 wide)
//   /dev/roof-inventory?view=live            the current live board, same data, for before/after
//   &state=full | clear | empty              a busy shelf (default), a covered one, a new account
//   &write=0                                 a sales / estimator role: every write hidden
//
// Buttons that write call the real server actions and fail harmlessly here
// (there is no session). Never press "Email order" anywhere: on a signed-in
// page it emails the supplier for real.

import { notFound } from "next/navigation";
import { ResponsiveDashboardShell } from "@/components/v3/responsive-shell/responsive-dashboard-shell";
import { TradeBoard } from "@/components/v3/trade-board/trade-board";
import { RoofInventory } from "@/components/v3/roof-inventory-claude/roof-inventory";
import { MobileRoofInventory } from "@/components/v3/mobile-roof-inventory-claude/mobile-roof-inventory";
import { roofFixture, type FixtureState } from "@/components/v3/roof-inventory-claude/fixture";

export const dynamic = "force-dynamic";

export default async function RoofInventoryPreview({ searchParams }: { searchParams: Promise<{ view?: string; state?: string; write?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { view, state, write } = await searchParams;
  const s: FixtureState = state === "clear" || state === "empty" ? state : "full";
  const { data, facts } = roofFixture(s);
  const canWrite = write !== "0";
  if (view === "mobile") return <MobileRoofInventory data={data} facts={facts} canWrite={canWrite} />;
  return (
    <ResponsiveDashboardShell user={{ name: "Preview", role: "Owner" }} identity={{ role: "OWNER", name: "Preview" }}>
      {view === "live" ? <TradeBoard data={data} facts={facts} canWrite={canWrite} /> : <RoofInventory data={data} facts={facts} canWrite={canWrite} />}
    </ResponsiveDashboardShell>
  );
}
