// Plain server module (NOT "use server"). Auto-creates a Job + its calendar
// event from an accepted proposal. Called from the public accept route, which
// has no user session — so the organization is DERIVED from the proposal, never
// taken from a caller-supplied parameter (which would make this a cross-tenant
// write endpoint). Idempotent: dedupes on (organizationId, proposalId).
//
// Quota: intentionally ALLOW-BUT-COUNT — a homeowner accepting a proposal must
// never be blocked by the contractor's plan cap; the created Job/JobEvent still
// count toward usage. Authenticated callers must enforcePlanLimit BEFORE
// calling this (the dashboard actions in src/actions/jobs.ts do).
import { db } from "@/lib/db";
import { JobStatus } from "@/lib/prismaEnums";

export async function createJobFromProposalInternal(proposalId: string) {
  const proposal = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new Error("Not found");
  const { organizationId } = proposal;

  const existing = await db.job.findFirst({ where: { organizationId, proposalId } });
  if (existing) return { id: existing.id, created: false as const };

  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 7);
  startsAt.setHours(9, 0, 0, 0);
  const endsAt = new Date(startsAt);
  endsAt.setHours(14, 0, 0, 0);

  const job = await db.job.create({
    data: {
      organizationId,
      title: proposal.title,
      clientId: proposal.clientId,
      proposalId: proposal.id,
      status: JobStatus.SCHEDULED,
      scopeOfWork: proposal.scopeOfWork ?? null,
      startsAt,
      endsAt,
    },
  });

  await db.jobEvent.create({
    data: {
      organizationId,
      jobId: job.id,
      title: proposal.title,
      startsAt,
      endsAt,
      notes: "Auto-scheduled from accepted proposal.",
    },
  });

  return { id: job.id, created: true as const };
}
