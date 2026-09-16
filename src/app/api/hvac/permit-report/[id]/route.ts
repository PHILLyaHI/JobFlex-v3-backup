import { NextResponse, type NextRequest } from "next/server";
import { requireEstimatorOrManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { coolCalcConfig, coolCalcFetchReport } from "@/lib/hvac/coolcalc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/hvac/permit-report/[id]
//
// The Cool Calc MJ8 report for a saved HVAC estimate, fetched with the
// SERVER's credentials and streamed through, so the contractor (and the
// proposal) get a link that works without a Cool Calc login. Org-scoped like
// every other read of HvacEstimate; the content type is whatever Cool Calc
// serves (the docs do not fix it).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let organizationId: string;
  try {
    ({ organizationId } = await requireEstimatorOrManager());
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const cfg = coolCalcConfig();
  if (!cfg) return NextResponse.json({ ok: false, error: "Cool Calc isn't connected on this server." }, { status: 503 });
  let row: { permitJson: string | null } | null = null;
  try {
    row = await db.hvacEstimate.findFirst({ where: { id, organizationId }, select: { permitJson: true } });
  } catch {
    return NextResponse.json({ ok: false, error: "The HVAC tables aren't in this database yet." }, { status: 503 });
  }
  let reportUrl = "";
  try { reportUrl = String((JSON.parse(row?.permitJson ?? "{}") as { reportUrl?: string }).reportUrl ?? ""); } catch { /* no permit */ }
  if (!row || !reportUrl.startsWith(cfg.baseUrl)) return NextResponse.json({ ok: false, error: "No Cool Calc report is linked to this estimate." }, { status: 404 });
  try {
    const rep = await coolCalcFetchReport(cfg, reportUrl);
    if (!rep.ok) return NextResponse.json({ ok: false, error: rep.error }, { status: 502 });
    return new NextResponse(Buffer.from(rep.bytes), { headers: { "Content-Type": rep.contentType, "Cache-Control": "private, no-store", "Content-Disposition": `inline; filename="manual-j-${id.slice(-6)}${rep.contentType.includes("pdf") ? ".pdf" : ""}"` } });
  } catch (err) {
    console.error("[api/hvac/permit-report] failed:", err);
    return NextResponse.json({ ok: false, error: "Couldn't fetch the report from Cool Calc." }, { status: 502 });
  }
}
