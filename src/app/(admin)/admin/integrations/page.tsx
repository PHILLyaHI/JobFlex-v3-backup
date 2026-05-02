import { PageHeader } from "@/components/ui/PageHeader";
import { getIntegrationStatuses } from "@/lib/sdk/integrations";
import { IntegrationsGrid } from "@/components/admin/IntegrationsGrid";

export default function AdminIntegrationsPage() {
  const items = getIntegrationStatuses();
  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Integrations"
        description="External services connected through the JobFlex SDK wrappers. Each card respects graceful no-op when keys are missing."
      />
      <IntegrationsGrid items={items} />
    </>
  );
}
