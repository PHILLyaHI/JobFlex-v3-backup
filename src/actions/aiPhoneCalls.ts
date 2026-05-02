"use server";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getOpenAI, isOpenAIEnabled, OPENAI_MODEL } from "@/lib/sdk/openai";

export async function startInboundCall(
  callSid: string,
  from: string,
  to: string,
  organizationId: string,
) {
  const existing = await db.aiPhoneCall.findUnique({ where: { callSid } });
  if (existing) return existing;
  return db.aiPhoneCall.create({
    data: {
      organizationId,
      direction: "INBOUND",
      fromNumber: from,
      toNumber: to,
      status: "IN_PROGRESS",
      callSid,
    },
  });
}

export async function attachRecording(callSid: string, url: string, durationSeconds: number) {
  const call = await db.aiPhoneCall.findUnique({ where: { callSid } });
  if (!call) return null;
  return db.aiPhoneCall.update({
    where: { callSid },
    data: {
      recordingUrl: url,
      durationSeconds,
      status: "COMPLETED",
      endedAt: new Date(),
    },
  });
}

export async function attachTranscript(callSid: string, transcript: string) {
  const call = await db.aiPhoneCall.findUnique({ where: { callSid } });
  if (!call) return null;
  const updated = await db.aiPhoneCall.update({
    where: { callSid },
    data: { transcript },
  });
  // Kick off summarization in-line (best-effort)
  try {
    await summarizeAndMaybeCreateLead(updated.id);
  } catch (err) {
    console.warn("[attachTranscript] summarize failed:", err);
  }
  return updated;
}

async function summarizeAndMaybeCreateLead(callId: string) {
  const call = await db.aiPhoneCall.findUnique({ where: { id: callId } });
  if (!call || !call.transcript) return;
  if (!isOpenAIEnabled()) {
    // Fallback: first 120 chars as summary
    await db.aiPhoneCall.update({
      where: { id: callId },
      data: { summary: call.transcript.slice(0, 140) + (call.transcript.length > 140 ? "…" : "") },
    });
    return;
  }

  const client = getOpenAI();
  const completion = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'You summarize contractor phone-call transcripts. Return JSON: {summary: string (one sentence), shouldCreateLead: boolean, leadData: {name?: string, email?: string, phone?: string, projectType?: string, description?: string}}. shouldCreateLead = true when the caller describes a project and provides enough context to contact them back.',
      },
      { role: "user", content: call.transcript.slice(0, 4000) },
    ],
  });
  const text = completion.choices[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(text) as {
      summary?: string;
      shouldCreateLead?: boolean;
      leadData?: {
        name?: string;
        email?: string;
        phone?: string;
        projectType?: string;
        description?: string;
      };
    };
    await db.aiPhoneCall.update({
      where: { id: callId },
      data: { summary: parsed.summary ?? null },
    });
    if (parsed.shouldCreateLead && parsed.leadData) {
      const lead = await db.lead.create({
        data: {
          organizationId: call.organizationId,
          name: parsed.leadData.name ?? call.fromNumber,
          email: parsed.leadData.email ?? null,
          phone: parsed.leadData.phone ?? call.fromNumber,
          projectType: parsed.leadData.projectType ?? null,
          description: parsed.leadData.description ?? null,
          source: "phone",
          aiCategory: parsed.leadData.projectType ?? null,
        },
      });
      await db.aiPhoneCall.update({
        where: { id: callId },
        data: { leadId: lead.id },
      });
      await db.activityEvent.create({
        data: {
          organizationId: call.organizationId,
          leadId: lead.id,
          kind: "CALL",
          summary: `Auto-created lead from inbound call ${call.fromNumber}`,
        },
      });
    }
  } catch (err) {
    console.warn("[summarize] parse failed:", err);
  }
}

export async function createLeadFromCall(callId: string) {
  const { organizationId } = await requireOrg();
  const call = await db.aiPhoneCall.findUnique({ where: { id: callId } });
  if (!call || call.organizationId !== organizationId) throw new Error("Not found");
  if (call.leadId) return { leadId: call.leadId };

  const lead = await db.lead.create({
    data: {
      organizationId,
      name: call.fromNumber,
      phone: call.fromNumber,
      description: call.transcript?.slice(0, 1000) ?? null,
      source: "phone",
    },
  });
  await db.aiPhoneCall.update({
    where: { id: callId },
    data: { leadId: lead.id },
  });
  revalidatePath("/dashboard/phone");
  return { leadId: lead.id };
}
