import { PageHeader } from "@/components/ui/PageHeader";
import { db } from "@/lib/db";
import { CampaignsComposer, type CampaignRow } from "@/components/admin/CampaignsComposer";

export default async function AdminCampaignsPage() {
  const [campaigns, totalOrgs] = await Promise.all([
    db.announcement.findMany({
      where: { scope: "PLATFORM" },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.organization.count(),
  ]);

  const rows: CampaignRow[] = campaigns.map((c) => ({
    id: c.id,
    title: c.title,
    body: c.body,
    createdAt: c.createdAt,
    expiresAt: c.expiresAt,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Email campaigns"
        description="Send a platform-wide announcement that lands on every tenant's dashboard banner."
      />
      <CampaignsComposer history={rows} totalOrgs={totalOrgs} />
    </>
  );
}
