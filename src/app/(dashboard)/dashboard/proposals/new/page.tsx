import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProposalEditor } from "@/components/v3/proposal-builder-a/ProposalEditor";
import { ResetDraft } from "./reset-draft";

export default async function NewProposalPage() {
  const { organizationId } = await requireOrg();
  const [clients, projects, org] = await Promise.all([
    db.client.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        zip: true,
      },
    }),
    db.project.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, defaultTaxRate: true, materialMarkupPct: true, laborMarkupPct: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="New proposal"
        title="Manual builder"
        description="Hand-craft every line. Live preview on the right mirrors what the client will see."
      />
      <ResetDraft
        defaultTaxRate={org?.defaultTaxRate ?? 0}
        materialMarkupPct={org?.materialMarkupPct ?? 0}
        laborMarkupPct={org?.laborMarkupPct ?? 0}
      />
      <ProposalEditor
        clients={clients}
        projects={projects}
        orgName={org?.name ?? undefined}
      />
    </>
  );
}
