// THE CLIENT'S TEXTS (2026-09-24) — server only.
//
// Two texts a homeowner is glad to get, and no more: the proposal link the
// moment it is sent, and a reminder the evening before a visit. Both are
// off with one switch in the company's Text messages card (smsClientsOn),
// both need a phone on the client, both carry the company's name and the
// STOP line, and both go through the same rules as every other text.

import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { zonedParts } from "@/lib/booking";
import { atLocalHour } from "@/lib/servicePlans";
import { toE164 } from "@/lib/phone";
import { brand, clip, money, spanLabel, streetOf } from "./format";
import { sendText } from "./send";

const REMINDER_HOUR = 18;

function log(what: string, err: unknown) {
  console.error(`[sms/clients] ${what}: ${err instanceof Error ? err.message : String(err)}`);
}

/** "Ridgeline Roofing: your proposal "Roof replacement" ($11,306.52) is ready — see it and accept here: <link>. Reply STOP to opt out." */
export function clientProposalText(org: string | null, title: string, total: number, link: string): string {
  return brand(org, `your proposal "${clip(title, 50)}" (${money(total)}) is ready — see it and accept here: ${link} Reply STOP to opt out.`);
}

/** "Ridgeline Roofing: reminder — we're scheduled at 4567 Rainier Ave S tomorrow, Fri Sep 25, 9 AM. Reply here with any questions." */
export function clientReminderText(org: string | null, slot: { title: string; startsAt: Date; endsAt?: Date | null; address?: string | null }, tz: string): string {
  const where = streetOf(slot.address);
  return brand(org, `reminder — we're scheduled${where ? ` at ${where}` : ""} tomorrow, ${spanLabel(slot.startsAt, slot.endsAt, tz)} (${clip(slot.title, 40)}). Reply here with any questions.`);
}

/** The proposal just went out by email; the client's phone gets the link too. */
export async function textClientProposalSent(proposalId: string): Promise<void> {
  try {
    const p = await db.proposal.findUnique({
      where: { id: proposalId },
      select: { title: true, total: true, publicId: true, organizationId: true, client: { select: { phone: true } }, organization: { select: { name: true, smsClientsOn: true } } },
    });
    if (!p?.client?.phone || !p.organization.smsClientsOn) return;
    const to = toE164(p.client.phone);
    if (!to) return;
    const link = `${await appBaseUrl()}/portal/q/${p.publicId}`;
    await sendText({ organizationId: p.organizationId, to, body: clientProposalText(p.organization.name, p.title, p.total, link), kind: "client-proposal" });
  } catch (err) {
    log("proposal", err);
  }
}

/**
 * The evening before a visit, 6 PM company time: every appointment tomorrow
 * with a client phone on it, once. Part of the hourly tick.
 */
export async function runClientReminders(now = new Date()): Promise<number> {
  let sent = 0;
  const orgs = await db.organization.findMany({ where: { smsClientsOn: true, deletedAt: null }, select: { id: true, name: true, timezone: true } });
  for (const org of orgs) {
    try {
      const tz = org.timezone || "America/New_York";
      const local = zonedParts(now, tz);
      if (local.h !== REMINDER_HOUR) continue;
      const day = new Date(Date.UTC(local.y, local.m - 1, local.d + 1));
      const from = atLocalHour(day, 0, tz);
      const to = new Date(from.getTime() + 86_400_000);
      const apts = await db.appointment.findMany({
        where: { organizationId: org.id, startsAt: { gte: from, lt: to }, status: "SCHEDULED", OR: [{ client: { phone: { not: null } } }, { lead: { phone: { not: null } } }] },
        select: { id: true, title: true, startsAt: true, endsAt: true, client: { select: { phone: true, address: true } }, lead: { select: { phone: true, address: true } } },
      });
      const kind = `client-reminder-${day.toISOString().slice(0, 10)}`;
      for (const a of apts) {
        const phone = toE164(a.client?.phone ?? a.lead?.phone ?? null);
        if (!phone) continue;
        const said = await db.smsMessage.findFirst({ where: { to: phone, kind, direction: "OUT" }, select: { id: true } });
        if (said) continue;
        const r = await sendText({ organizationId: org.id, to: phone, body: clientReminderText(org.name, { title: a.title, startsAt: a.startsAt, endsAt: a.endsAt, address: a.client?.address ?? a.lead?.address ?? null }, tz), kind });
        if (r.ok) sent++;
      }
    } catch (err) {
      log(`reminders for ${org.id}`, err);
    }
  }
  return sent;
}
