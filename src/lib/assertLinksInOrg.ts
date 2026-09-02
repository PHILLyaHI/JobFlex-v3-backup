import { db } from "@/lib/db";

// Tenant guard for client-supplied foreign keys. Ids for a lead / client /
// proposal / job arrive from the browser and would otherwise let a crafted
// request attach ANOTHER organization's records to this org's rows — after
// which every relation-following reader (job detail, PDF, sendProposal, review
// requests) renders and emails the foreign tenant's customer. Call before any
// create/update that writes one of these ids.
export async function assertLinksInOrg(
  organizationId: string,
  d: {
    leadId?: string | null;
    clientId?: string | null;
    proposalId?: string | null;
    jobId?: string | null;
  },
): Promise<void> {
  if (d.leadId) {
    const row = await db.lead.findUnique({
      where: { id: d.leadId },
      select: { organizationId: true },
    });
    if (!row || row.organizationId !== organizationId) throw new Error("Lead not found");
  }
  if (d.clientId) {
    const row = await db.client.findUnique({
      where: { id: d.clientId },
      select: { organizationId: true },
    });
    if (!row || row.organizationId !== organizationId) throw new Error("Client not found");
  }
  if (d.proposalId) {
    const row = await db.proposal.findUnique({
      where: { id: d.proposalId },
      select: { organizationId: true },
    });
    if (!row || row.organizationId !== organizationId) throw new Error("Proposal not found");
  }
  if (d.jobId) {
    const row = await db.job.findUnique({
      where: { id: d.jobId },
      select: { organizationId: true },
    });
    if (!row || row.organizationId !== organizationId) throw new Error("Job not found");
  }
}
