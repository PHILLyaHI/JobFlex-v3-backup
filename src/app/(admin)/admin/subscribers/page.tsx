import { requirePlatformAdmin } from "@/lib/orgContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { getSubscribersData } from "@/actions/subscribers";
import { SubscribersClient } from "./subscribers-client";

export default async function AdminSubscribersPage() {
  await requirePlatformAdmin();
  const { rows, metrics, stripeLive, truncated } = await getSubscribersData();

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Subscribers"
        description="Sourced live from Stripe subscriptions, enriched with JobFlex account data."
      />
      <SubscribersClient
        rows={rows.map((r) => ({ ...r, currentPeriodEnd: r.currentPeriodEnd?.toISOString() ?? null, createdAt: r.createdAt.toISOString() }))}
        metrics={metrics}
        stripeLive={stripeLive}
        truncated={truncated}
      />
    </>
  );
}
