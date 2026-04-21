import { requireUser } from "@/lib/orgContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { db } from "@/lib/db";

export default async function AdminHome() {
  await requireUser();
  const [orgs, users, subs, proposals] = await Promise.all([
    db.organization.count(),
    db.user.count(),
    db.subscription.count(),
    db.proposal.count(),
  ]);

  return (
    <main className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="Platform"
        title="Admin"
        description="Global oversight for the JobFlex platform."
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric label="Organizations" value={orgs} />
        <Metric label="Users" value={users} />
        <Metric label="Subscriptions" value={subs} />
        <Metric label="Proposals" value={proposals} />
      </div>
      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle>Admin surfaces</CardTitle>
            <CardSubtitle>Deep implementations land in the next session.</CardSubtitle>
          </div>
          <Badge tone="warn">Scaffolded</Badge>
        </CardHeader>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[13px]">
          {["Users & roles", "Pricing plans", "Promotions", "Support tickets", "System announcements", "Specialty library", "Audit log", "Platform metrics"].map(
            (s) => (
              <li key={s} className="paper-card px-4 py-2.5">
                {s}
              </li>
            ),
          )}
        </ul>
      </Card>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="paper-card p-5">
      <div className="quiet-caps">{label}</div>
      <div className="stat-numeric text-[36px] mt-2">{value}</div>
    </div>
  );
}
