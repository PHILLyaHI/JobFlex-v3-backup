import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { isOpenAIEnabled } from "@/lib/sdk/openai";
import { AiStudio } from "./ai-studio";

export default async function AiProposalPage() {
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
        eyebrow="AI · draft"
        title="AI proposal studio"
        description="Describe the job in plain English. JobFlex drafts the line items, materials, labor, scope, and a payment schedule — you review, edit, and send."
      />
      <AiStudio
        clients={clients}
        aiEnabled={isOpenAIEnabled()}
        orgName={org?.name ?? ""}
        defaultTaxRate={org?.defaultTaxRate ?? 0}
      />
    </>
  );
}
