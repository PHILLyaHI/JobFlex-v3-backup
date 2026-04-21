import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { getIntegrationStatuses } from "@/lib/sdk/integrations";

export default async function SettingsPage() {
  const { organizationId, user } = await requireOrg();
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  const statuses = getIntegrationStatuses();

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Your profile, your workspace, your integrations."
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Profile</CardTitle>
              <CardSubtitle>Your personal account</CardSubtitle>
            </div>
          </CardHeader>
          <div className="space-y-4">
            <Input label="Full name" defaultValue={user.name ?? ""} />
            <Input label="Email" defaultValue={user.email ?? ""} disabled />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Workspace</CardTitle>
              <CardSubtitle>Organization defaults</CardSubtitle>
            </div>
          </CardHeader>
          <div className="space-y-4">
            <Input label="Company name" defaultValue={org?.name ?? ""} />
            <Input label="Billing email" defaultValue={org?.billingEmail ?? ""} />
            <Input label="Default tax rate" defaultValue={String(org?.defaultTaxRate ?? 0)} hint="Decimal (0.06 = 6%)" />
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Integrations</CardTitle>
              <CardSubtitle>Environment-driven — add keys to .env.local to enable.</CardSubtitle>
            </div>
          </CardHeader>
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {statuses.map((s) => (
              <li key={s.key} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[color:var(--ink)]">{s.name}</span>
                    {s.enabled ? (
                      <Badge tone="success" dot>
                        Active
                      </Badge>
                    ) : (
                      <Badge tone="neutral">Disabled</Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">{s.purpose}</div>
                </div>
                <div className="text-[11px] text-[color:var(--ink-faint)] font-mono shrink-0">
                  {s.envKeys.join(" · ")}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
