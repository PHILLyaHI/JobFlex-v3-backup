import { NextResponse } from "next/server";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { requireFeatureOrThrow } from "@/lib/entitlements";
import { getOrgPlanById } from "@/lib/orgPlan";
import { toCsv } from "@/lib/csv";

export const runtime = "nodejs";

export async function GET() {
  const { organizationId } = await requireManager();
  const plan = await getOrgPlanById(organizationId);
  try {
    requireFeatureOrThrow(plan, "csv_export");
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 403 });
  }

  const proposals = await db.proposal.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: { client: { select: { name: true, email: true } } },
  });

  const rows = proposals.map((p) => ({
    id: p.id,
    publicId: p.publicId,
    title: p.title,
    status: p.status,
    total: p.total,
    currency: p.currency,
    clientName: p.client?.name ?? "",
    clientEmail: p.client?.email ?? "",
    createdAt: p.createdAt,
    sentAt: p.sentAt,
    acceptedAt: p.acceptedAt,
    paidAt: p.paidAt,
    viewCount: p.viewCount,
  }));
  const csv = toCsv(rows, [
    "id",
    "publicId",
    "title",
    "status",
    "total",
    "currency",
    "clientName",
    "clientEmail",
    "createdAt",
    "sentAt",
    "acceptedAt",
    "paidAt",
    "viewCount",
  ]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="proposals.csv"`,
    },
  });
}
