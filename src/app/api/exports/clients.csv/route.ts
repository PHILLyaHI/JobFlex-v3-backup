import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { requireFeatureOrThrow } from "@/lib/entitlements";
import { getOrgPlanById } from "@/lib/orgPlan";
import { toCsv } from "@/lib/csv";

export const runtime = "nodejs";

export async function GET() {
  const { organizationId } = await requireOrg();
  const plan = await getOrgPlanById(organizationId);
  try {
    requireFeatureOrThrow(plan, "csv_export");
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 403 });
  }

  const clients = await db.client.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });

  const rows = clients.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email ?? "",
    phone: c.phone ?? "",
    address: c.address ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
    zip: c.zip ?? "",
    createdAt: c.createdAt,
  }));
  const csv = toCsv(rows, [
    "id",
    "name",
    "email",
    "phone",
    "address",
    "city",
    "state",
    "zip",
    "createdAt",
  ]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clients.csv"`,
    },
  });
}
