// Hire — Blueprint edition. Pixel-identical port of the canonical hire donor
// (jobflex-hire-blueprint_4.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// Child routes (/hub, /talent, /profile, /job-posts, /applications,
// /contracts, /new, /[id]) live under the (dashboard) route group and keep the
// classic layout.
//
// The applicant pipeline is NOT a fixture: the board is read from the database
// here and every stage move, note, conversion, delete and add in the sheet
// calls the real applicant server actions (see hire-behavior.ts). The query is
// the archived classic page's — same table, same ordering — so both editions
// describe the same pipeline.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { relative } from "@/lib/format";
import { HireContent } from "@/components/v3/hire-blueprint/hire-content";
import type { Applicant, HireColumnKey } from "@/components/v3/hire-blueprint/hire-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Hire",
  description: "Hire — the marketplace hub and the applicant pipeline on one sheet.",
};

/** `Applicant.status` is a plain String column; anything unrecognised lands in
 *  the first column rather than vanishing off the board. */
const COLUMN_KEYS = ["APPLIED", "INTERVIEWING", "HIRED", "REJECTED"] as const;
function asColumn(v: string): HireColumnKey {
  return (COLUMN_KEYS as readonly string[]).includes(v) ? (v as HireColumnKey) : "APPLIED";
}

export default async function HirePage() {
  let organizationId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Fhire");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  const rows = await db.applicant.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });

  const applicants: Applicant[] = rows.map((a) => ({
    id: a.id,
    name: a.fullName,
    email: a.email,
    phone: a.phone,
    role: a.role,
    status: asColumn(a.status),
    source: a.source,
    age: relative(a.createdAt),
    notes: a.notes ?? "",
  }));

  return <HireContent applicants={applicants} />;
}
