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

  const leads = await db.lead.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });

  const rows = leads.map((l) => ({
    id: l.id,
    name: l.name,
    email: l.email ?? "",
    phone: l.phone ?? "",
    projectType: l.projectType ?? "",
    status: l.status,
    source: l.source ?? "",
    aiCategory: l.aiCategory ?? "",
    aiConfidence: l.aiConfidence ?? "",
    createdAt: l.createdAt,
  }));
  const csv = toCsv(rows, [
    "id",
    "name",
    "email",
    "phone",
    "projectType",
    "status",
    "source",
    "aiCategory",
    "aiConfidence",
    "createdAt",
  ]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads.csv"`,
    },
  });
}
