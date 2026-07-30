// Live workers page. Renders the v3 WorkersLedger from
// src/components/v3/workers-new/. The /v3/workers-new route renders the same
// component against the same data shape.

import { redirect } from "next/navigation";
import { requireOrg, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { db } from "@/lib/db";
import {
  WorkersLedger,
  type LedgerEntry,
} from "@/components/v3/workers-new/workers-ledger";

export const dynamic = "force-dynamic";

function parseSpec(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export default async function WorkersPage() {
  let organizationId: string | null = null;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  const workers = await db.workerProfile.findMany({
    where: { organizationId: organizationId! },
    orderBy: { displayName: "asc" },
    include: {
      user: { select: { email: true } },
      assignments: {
        where: { job: { status: { in: ["SCHEDULED", "IN_PROGRESS"] } } },
        select: {
          id: true,
          status: true,
          job: { select: { id: true, title: true, status: true } },
        },
      },
    },
  });

  // Membership carries the role (INSTALLER/SALES/ESTIMATOR/MANAGER/…); map it in
  // by user so the unified roster shows each member's role.
  const memberships = await db.membership.findMany({
    where: { organizationId: organizationId! },
    select: { userId: true, role: true },
  });
  const roleByUser = new Map(memberships.map((m) => [m.userId, m.role]));

  const entries: LedgerEntry[] = workers.map((w, i) => ({
    id: w.id,
    folio: i + 1,
    name: w.displayName,
    email: w.user?.email ?? null,
    phone: w.phone,
    specialties: parseSpec(w.specialties),
    hourlyRate: w.hourlyRate,
    token: w.token,
    inviteStatus: w.inviteStatus,
    role: roleByUser.get(w.userId) ?? "INSTALLER",
    joinedISO: w.createdAt.toISOString(),
    activeJobs: w.assignments.map((a) => ({
      id: a.id,
      status: a.status,
      jobId: a.job.id,
      jobTitle: a.job.title,
      jobStatus: a.job.status,
    })),
  }));

  return <WorkersLedger entries={entries} />;
}
