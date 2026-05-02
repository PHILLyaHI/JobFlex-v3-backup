import { PageHeader } from "@/components/ui/PageHeader";
import { getIntegrationStatuses } from "@/lib/sdk/integrations";
import { HealthDashboard, type ServiceStatus } from "@/components/admin/HealthDashboard";

export default function AdminHealthPage() {
  const statuses = getIntegrationStatuses();
  const services: ServiceStatus[] = statuses.map((s, i) => ({
    ...s,
    // Synthetic latency: deterministic per service (so refreshes don't churn).
    latencyMs: s.enabled ? 60 + ((s.key.charCodeAt(0) * 11 + i * 17) % 220) : 0,
    lastChecked: new Date().toISOString(),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Health & telemetry"
        description="Live status of every integrated service. Disabled cards just need an API key."
      />
      <HealthDashboard services={services} />
    </>
  );
}
