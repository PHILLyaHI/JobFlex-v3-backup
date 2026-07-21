import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StaggerGrid } from "@/components/ui/StaggerGrid";
import { CallLogTable, type CallRow } from "@/components/phone/CallLogTable";
import { isTwilioEnabled } from "@/lib/sdk/twilio";

export default async function PhonePage() {
  const { organizationId } = await requireOrg();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  const [calls, todayCount, weekCount, leadsCreated] = await Promise.all([
    db.aiPhoneCall.findMany({
      where: { organizationId },
      orderBy: { startedAt: "desc" },
      take: 100,
    }),
    db.aiPhoneCall.count({
      where: { organizationId, startedAt: { gte: startOfDay } },
    }),
    db.aiPhoneCall.count({
      where: { organizationId, startedAt: { gte: startOfWeek } },
    }),
    db.aiPhoneCall.count({
      where: { organizationId, leadId: { not: null }, startedAt: { gte: startOfWeek } },
    }),
  ]);

  const rows: CallRow[] = calls.map((c) => ({
    id: c.id,
    fromNumber: c.fromNumber,
    toNumber: c.toNumber,
    direction: c.direction,
    status: c.status,
    durationSeconds: c.durationSeconds,
    recordingUrl: c.recordingUrl,
    transcript: c.transcript,
    summary: c.summary,
    leadId: c.leadId,
    startedAt: c.startedAt,
  }));

  const appUrl = await appBaseUrl();
  const webhookUrl = `${process.env.TWILIO_APP_URL ?? appUrl}/api/twilio/voice`;

  return (
    <>
      <PageHeader
        eyebrow="Automation · AI"
        title="Phone"
        description="Inbound calls are recorded, transcribed, and auto-summarized. Qualifying calls become leads automatically."
      />

      {!isTwilioEnabled() && (
        <div className="paper-card p-4 mb-5 flex items-start gap-3 border-l-[3px] border-l-amber-400">
          <div className="text-[12px] leading-relaxed">
            <div className="font-medium text-[color:var(--ink)]">Twilio isn't configured.</div>
            <div className="text-[color:var(--ink-muted)] mt-0.5">
              Add <code className="font-mono text-[11px]">TWILIO_ACCOUNT_SID</code>,{" "}
              <code className="font-mono text-[11px]">TWILIO_AUTH_TOKEN</code>, and{" "}
              <code className="font-mono text-[11px]">TWILIO_PHONE_NUMBER</code>. Point your
              Twilio number's voice webhook at the URL below.
            </div>
          </div>
        </div>
      )}

      <StaggerGrid className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Calls today" value={String(todayCount)} />
        <StatCard label="Calls · 7d" value={String(weekCount)} />
        <StatCard
          label="Auto-leads · 7d"
          value={String(leadsCreated)}
          hint="Created from transcripts"
        />
      </StaggerGrid>

      <CallLogTable rows={rows} webhookUrl={webhookUrl} />
    </>
  );
}
