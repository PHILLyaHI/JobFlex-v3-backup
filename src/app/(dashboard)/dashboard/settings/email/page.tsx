import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmailTemplateEditor, type EmailTemplateRow } from "@/components/comms/EmailTemplateEditor";
import { isResendEnabled } from "@/lib/sdk/resend";

export default async function EmailSettingsPage() {
  const { organizationId } = await requireOrg();
  const [templates, org] = await Promise.all([
    db.emailTemplate.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    }),
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
  ]);

  const rows: EmailTemplateRow[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    subject: t.subject,
    body: t.body,
    category: t.category,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Email templates"
        description="Reusable, variable-aware email copy. Templates power Send / Thank-you / Reminder flows and any follow-up rule."
      />
      {!isResendEnabled() && (
        <div className="paper-card p-4 mb-5 flex items-start gap-3 border-l-[3px] border-l-amber-400">
          <div className="text-[12px] leading-relaxed">
            <div className="font-medium text-[color:var(--ink)]">Resend isn't configured.</div>
            <div className="text-[color:var(--ink-muted)] mt-0.5">
              Templates still save, and the preview works, but outgoing emails will be no-op logs
              until <code className="font-mono text-[11px]">RESEND_API_KEY</code> is set.
            </div>
          </div>
        </div>
      )}
      <EmailTemplateEditor templates={rows} orgName={org?.name ?? "Your company"} />
    </>
  );
}
