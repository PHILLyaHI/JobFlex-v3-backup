// PROJECT DETAIL — the one server read behind both routes that render a
// project (/dashboard/projects/[id] and the handheld /mobile-project-detail-v2/
// [id]), so the two can never describe the same project differently.
// Server-only: it takes the caller's organization and answers null for a
// project that is not theirs.

import { db } from "@/lib/db";
import { contractTotal } from "@/lib/contractTotal";
import type { PdAvailProposal, PdJob, PdLooseProposal, PdProject, PdProposal } from "./project-detail-data";

export type ProjectDetailProps = {
  project: PdProject;
  jobs: PdJob[];
  proposals: PdProposal[];
  availableProposals: PdAvailProposal[];
  /** The project's client's proposals that are in no project yet. */
  looseProposals: PdLooseProposal[];
};

export async function loadProjectDetail(id: string, organizationId: string): Promise<ProjectDetailProps | null> {
  const project = await db.project.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      // The project's own proposals (Proposal.projectId, 2026-09-18), with the
      // change orders that move each one's contract.
      proposals: {
        where: { status: { not: "ARCHIVED" } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          status: true,
          total: true,
          updatedAt: true,
          client: { select: { name: true } },
          changeOrders: { where: { status: { in: ["DRAFT", "SENT", "APPROVED"] } }, select: { status: true, total: true } },
        },
      },
      jobs: {
        include: {
          client: { select: { name: true } },
          // The contract behind the job: original → approved changes → current.
          proposal: { select: { total: true, changeOrders: { where: { status: "APPROVED" }, select: { status: true, total: true } } } },
        },
        orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!project || project.organizationId !== organizationId) return null;

  // Attach candidates: the org's live proposals that are not on this project —
  // the project's own client's first, then the rest, newest first.
  const candidates = await db.proposal.findMany({
    where: { organizationId, status: { not: "ARCHIVED" }, OR: [{ projectId: null }, { projectId: { not: project.id } }] },
    select: {
      id: true,
      title: true,
      status: true,
      total: true,
      clientId: true,
      client: { select: { name: true } },
      project: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const isMine = (clientId: string | null) => Boolean(project.clientId && clientId === project.clientId);
  const looseProposals = candidates
    .filter((p) => isMine(p.clientId) && !p.project)
    .map((p) => ({ id: p.id, title: p.title, total: p.total }));
  const availableProposals = [...candidates]
    .sort((a, b) => Number(isMine(b.clientId)) - Number(isMine(a.clientId)))
    .map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      total: p.total,
      clientName: p.client?.name ?? null,
      projectName: p.project?.name ?? null,
      blocked: null,
    }));

  return {
    project: {
        id: project.id,
        name: project.name,
        startsAt: project.startsAt,
        endsAt: project.endsAt,
        budget: project.budget,
        client: project.client,
    },
    proposals: project.proposals.map((p) => {
        const approved = p.changeOrders.filter((c) => c.status === "APPROVED");
        const pending = p.changeOrders.filter((c) => c.status !== "APPROVED");
        return {
        id: p.id,
        title: p.title,
        status: p.status,
        total: p.total,
        contract: contractTotal(p.total, p.changeOrders),
        clientName: p.client?.name ?? null,
        updatedAt: p.updatedAt,
        co: {
          count: p.changeOrders.length,
          approved: approved.length,
          pending: pending.length,
          approvedTotal: approved.reduce((n, c) => n + (c.total ?? 0), 0),
          pendingTotal: pending.reduce((n, c) => n + (c.total ?? 0), 0),
        },
      };
    }),
    jobs: project.jobs.map((j) => ({
      id: j.id,
      title: j.title,
      status: j.status,
      startsAt: j.startsAt,
      endsAt: j.endsAt,
      clientName: j.client?.name ?? null,
      contract: j.proposal
        ? {
            original: j.proposal.total,
            changes: Math.round((contractTotal(j.proposal.total, j.proposal.changeOrders) - j.proposal.total) * 100) / 100,
            current: contractTotal(j.proposal.total, j.proposal.changeOrders),
          }
        : null,
    })),
    availableProposals,
    looseProposals,
  };
}
