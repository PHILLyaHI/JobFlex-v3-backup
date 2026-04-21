import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProposalEditor } from "@/components/proposal/ProposalEditor";
import { ResetDraft } from "./reset-draft";

export default async function NewProposalPage() {
  const { organizationId } = await requireOrg();
  const [clients, org] = await Promise.all([
    db.client.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true, defaultTaxRate: true } }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="New proposal"
        title="Manual builder"
        description="Hand-craft every line. Live preview on the right mirrors what the client will see."
      />
      <ResetDraft defaultTaxRate={org?.defaultTaxRate ?? 0} />
      <ProposalEditor clients={clients} orgName={org?.name} />
    </>
  );
}
