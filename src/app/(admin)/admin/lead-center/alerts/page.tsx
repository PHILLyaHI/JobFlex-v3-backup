// Admin · Lead alerts — /admin/lead-center/alerts (2026-10-03).
//
// Owner: "if any lead comes in, email the admins that it came into the Lead
// Center and say take an action — and text the admins; we will set up which
// phone numbers." Who gets the email, which phones get texts (each confirmed
// with a code), when a waiting request is reminded about, quiet nights, a
// test, and the last alert texts with what happened to them. The engine and
// its rules: lib/leadCenter/alerts.

import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { isEmailEnabled } from "@/lib/sdk/resend";
import { twilioSettings } from "@/lib/sdk/twilio";
import { jobflexSender } from "@/lib/sms/jobflexSender";
import {
  ALERT_TIME_ZONES,
  REMIND_CHOICES,
  alertEmailsFor,
  fallbackAlertEmails,
  isQuietHour,
  readLeadAlertSettings,
} from "@/lib/leadCenter/alerts";
import { LeadAlertsContent, type LeadAlertsPageData } from "@/components/v3/admin-lead-alerts/lead-alerts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex Admin · Lead alerts",
  description: "Who hears that a homeowner request came in, and when it still needs a person.",
};

function pretty(e164: string): string {
  const d = e164.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}` : e164;
}

export default async function AdminLeadAlertsPage() {
  await requirePlatformAdmin();
  const settings = await readLeadAlertSettings();
  const [twilio, sender, waiting, recent] = await Promise.all([
    twilioSettings().catch(() => null),
    jobflexSender().catch(() => null),
    db.platformLead.count({ where: { status: "MANUAL_QUEUE", isTest: false } }).catch(() => 0),
    db.smsMessage
      .findMany({
        where: { direction: "OUT", kind: { startsWith: "jobflex-admin" } },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { id: true, to: true, kind: true, status: true, error: true, createdAt: true },
      })
      .catch(() => []),
  ]);
  const names = new Map(settings.phones.map((p) => [p.phone, p.name]));
  const data: LeadAlertsPageData = {
    emails: settings.emails,
    emailsInUse: alertEmailsFor(settings),
    defaultEmails: fallbackAlertEmails(),
    emailReady: isEmailEnabled(),
    textsOn: settings.textsOn,
    phones: settings.phones.map((p) => ({ id: p.id, name: p.name, phone: pretty(p.phone), confirmed: Boolean(p.verifiedAt), on: p.on, quietNights: p.quietNights })),
    texting: !twilio ? "off" : sender ? "approved" : "waiting",
    sender: sender ? pretty(sender) : null,
    remindAfterMin: settings.remindAfterMin,
    timeZone: settings.timeZone,
    quietNow: isQuietHour(settings.timeZone),
    waiting,
    remindChoices: [...REMIND_CHOICES],
    zones: ALERT_TIME_ZONES.map(([value, label]) => ({ value, label })),
    recent: recent.map((r) => ({
      id: r.id,
      to: names.get(r.to) ? `${names.get(r.to)} · …${r.to.slice(-4)}` : `…${r.to.slice(-4)}`,
      kind: (r.kind ?? "").replace(/^jobflex-admin-/, ""),
      status: r.status,
      error: r.error,
      at: r.createdAt.toISOString(),
    })),
  };
  return <LeadAlertsContent data={data} />;
}
