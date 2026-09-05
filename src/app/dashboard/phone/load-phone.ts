// Phone — the ONE loader both editions read.
//
// /dashboard/phone (desktop sheet + handheld build behind the viewport switch)
// and the /mobile-phone-v2 preview route call this. The call log, the three
// stat figures, the Twilio configuration state and the webhook URL are all
// read here — the same four queries, the same `isTwilioEnabled()` check and
// the same `TWILIO_APP_URL ?? appBaseUrl()` webhook the archived classic page
// used, so both editions describe the same line.

import { redirect } from "next/navigation";
import { NoOrgError, UnauthorizedError, requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { isTwilioEnabled } from "@/lib/sdk/twilio";
import { relative } from "@/lib/format";
import type { PhoneContentProps } from "@/components/v3/phone-blueprint/phone-content";
import type { Call, CallScriptLine } from "@/components/v3/phone-blueprint/phone-data";

export type PhoneProps = PhoneContentProps;

/** Speaker prefixes a transcript may carry, and which side of the sheet each
 *  belongs on. Twilio's raw transcription has no labels at all; OpenAI-shaped
 *  and hand-pasted transcripts usually do. */
const SPEAKER_LINE = /^([A-Za-z][A-Za-z ]{0,14}?)\s*[:：]\s*(.+)$/;
const AGENT_SPEAKERS = new Set(["agent", "shop", "rep", "receptionist", "you", "assistant", "ai"]);

/**
 * Split a transcript into the sheet's two-column script.
 *
 * All-or-nothing on purpose: if ANY non-blank line lacks a speaker prefix the
 * text is not a labelled dialogue, and guessing would attribute half a
 * conversation to the wrong person. The caller then renders `transcript` as one
 * block instead — which is what the classic sheet did with every transcript.
 */
function parseTranscript(raw: string | null): CallScriptLine[] {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const out: CallScriptLine[] = [];
  for (const line of lines) {
    const m = SPEAKER_LINE.exec(line);
    if (!m) return [];
    const who = AGENT_SPEAKERS.has(m[1].trim().toLowerCase()) ? "agent" : "caller";
    out.push([who, m[2].trim()]);
  }
  return out;
}

/**
 * @param nextPath where the login redirect should return to — the route that
 *   called this, so a preview URL comes back to the preview.
 */
export async function loadPhoneProps(nextPath: string): Promise<PhoneProps> {
  let organizationId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
    }
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

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
    db.aiPhoneCall.count({ where: { organizationId, startedAt: { gte: startOfDay } } }),
    db.aiPhoneCall.count({ where: { organizationId, startedAt: { gte: startOfWeek } } }),
    db.aiPhoneCall.count({
      where: { organizationId, leadId: { not: null }, startedAt: { gte: startOfWeek } },
    }),
  ]);

  const entries: Call[] = calls.map((c) => ({
    id: c.id,
    from: c.fromNumber,
    to: c.toNumber,
    dir: c.direction,
    status: c.status,
    dur: c.durationSeconds,
    rec: c.recordingUrl,
    lead: c.leadId,
    when: relative(c.startedAt),
    summary: c.summary,
    script: parseTranscript(c.transcript),
    transcript: c.transcript,
  }));

  const appUrl = await appBaseUrl();
  const webhookUrl = `${process.env.TWILIO_APP_URL ?? appUrl}/api/twilio/voice`;

  return {
    entries,
    stats: { today: todayCount, week: weekCount, leads: leadsCreated },
    webhookUrl,
    twilioConfigured: isTwilioEnabled(),
  };
}
