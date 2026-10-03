// JOBFLEX'S OWN NUMBER, ONCE TWILIO APPROVES IT (2026-10-02) — server only.
//
// The JobFlex toll-free number carries one thing: JobFlex's own lead alerts
// to the companies that turned them on ("Text new leads to the company
// phone", Settings → Texting; notify.ts sendLeadSms). Everything a company
// says to its team, clients and crew leaves from its own number
// (registration.ts); sign-in codes go through Twilio Verify (verify.ts).
// The JobFlex number sends nothing until Twilio approves its verification
// (external reference "jobflex-platform-tollfree"): the answer is asked at
// most hourly and kept in SyncState. TWILIO_JOBFLEX_FROM overrides it.

import { db } from "@/lib/db";
import { twilioClient, twilioSettings } from "@/lib/sdk/twilio";

const KEY = "twilio:jobflex-sender";
export const JOBFLEX_VERIFICATION_REF = "jobflex-platform-tollfree";
const RECHECK_MS = 60 * 60_000;

/** The approved JobFlex number (E.164), or null while Twilio has not approved it. */
export async function jobflexSender(): Promise<string | null> {
  const fromEnv = process.env.TWILIO_JOBFLEX_FROM?.trim();
  if (fromEnv) return fromEnv;
  const kept = await db.syncState.findUnique({ where: { key: KEY }, select: { cursor: true, updatedAt: true } }).catch(() => null);
  if (kept && Date.now() - kept.updatedAt.getTime() < RECHECK_MS) return kept.cursor || null;
  const settings = await twilioSettings();
  if (!settings) return null;
  try {
    const client = await twilioClient(settings);
    const list = await client.messaging.v1.tollfreeVerifications.list({ limit: 50 });
    const approved = list.find((v) => v.externalReferenceId === JOBFLEX_VERIFICATION_REF && v.status === "TWILIO_APPROVED");
    const number = approved?.tollfreePhoneNumber ?? "";
    await db.syncState.upsert({ where: { key: KEY }, create: { key: KEY, cursor: number }, update: { cursor: number } });
    return number || null;
  } catch (err) {
    console.warn(`[sms/jobflex] could not ask Twilio about the JobFlex number: ${err instanceof Error ? err.message : String(err)}`);
    return kept?.cursor || null;
  }
}
