import type { NextRequest } from "next/server";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { isEagleViewEnabled, getReportFile, EV_FILE } from "@/lib/eagleview";

export const runtime = "nodejs";

// Streams an EagleView deliverable (PDF report / DXF) for a report the caller's
// org has loaded. The EagleView key stays server-side; the browser only sees
// this route. /api is not covered by middleware, so auth is enforced here.
const ALLOWED: Record<number, { type: string; disposition: "inline" | "attachment"; ext: string }> = {
  [EV_FILE.REPORT_PDF]: { type: "application/pdf", disposition: "inline", ext: "pdf" },
  [EV_FILE.AUTOCAD_DXF]: { type: "application/dxf", disposition: "attachment", ext: "dxf" },
};

export async function GET(req: NextRequest) {
  let organizationId: string;
  try {
    ({ organizationId } = await requireOrg());
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isEagleViewEnabled()) return new Response("EagleView not configured", { status: 503 });

  const url = new URL(req.url);
  const reportId = Number(url.searchParams.get("reportId"));
  const fileType = Number(url.searchParams.get("fileType"));
  const spec = ALLOWED[fileType];
  if (!Number.isFinite(reportId) || !spec) return new Response("Bad request", { status: 400 });

  // Tenant scope: only reports this org has actually loaded/ordered.
  const owned = await db.eagleViewReport.findUnique({
    where: { organizationId_reportId: { organizationId, reportId } },
    select: { id: true },
  });
  if (!owned) return new Response("Not found", { status: 404 });

  try {
    const ev = await getReportFile(reportId, fileType);
    if (!ev.ok || !ev.body) {
      return new Response(`EagleView file unavailable (${ev.status})`, { status: 502 });
    }
    return new Response(ev.body, {
      headers: {
        "Content-Type": spec.type,
        "Content-Disposition": `${spec.disposition}; filename="roof-${reportId}.${spec.ext}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err: any) {
    return new Response(err?.message ?? "Failed to fetch file", { status: 502 });
  }
}
