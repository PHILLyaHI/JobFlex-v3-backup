import { PageHeader } from "@/components/ui/PageHeader";
import { isOpenAIEnabled } from "@/lib/sdk/openai";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { EstimatorStudio } from "./estimator-studio";

export default async function AdvancedAiPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;

  // When launched from a client's detail page, pre-link the resulting proposal
  // to that client. Validate the id against the active org before trusting it.
  let client: { id: string; name: string } | null = null;
  if (clientId) {
    const { organizationId } = await requireOrg();
    client = await db.client.findFirst({
      where: { id: clientId, organizationId },
      select: { id: true, name: true },
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Sales · AI"
        title="Smart Proposal"
        description="Describe the job and AI prices real materials (live retail links), labor, and scope — separate material and labor breakdowns. Tune anything, then convert to a proposal in one click."
      />
      <EstimatorStudio
        aiEnabled={isOpenAIEnabled()}
        clientId={client?.id ?? null}
        clientName={client?.name ?? null}
      />
    </>
  );
}
