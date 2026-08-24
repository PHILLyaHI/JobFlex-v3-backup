import { requirePlatformAdmin } from "@/lib/orgContext";
import { getSubscribersData } from "@/actions/subscribers";
import { AdminSubscribersContent } from "@/components/v3/admin-subscribers/admin-subscribers-content";

export default async function AdminSubscribersPage() {
  await requirePlatformAdmin();
  const { rows, metrics, stripeEnabled, stripeLive, stripeError, truncated } =
    await getSubscribersData();

  return (
    <AdminSubscribersContent
      rows={rows.map((r) => ({
        ...r,
        currentPeriodEnd: r.currentPeriodEnd?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        changedAt: r.changedAt.toISOString(),
      }))}
      metrics={metrics}
      stripeEnabled={stripeEnabled}
      stripeLive={stripeLive}
      stripeError={stripeError}
      truncated={truncated}
    />
  );
}
