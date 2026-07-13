"use server";
import { revalidatePath } from "next/cache";
import { requireSalesOrManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { enforcePlanLimit } from "@/lib/limitsEngine";

// The Twilio-webhook internals (startInboundCall / attachRecording /
// attachTranscript / summarizeAndMaybeCreateLead) used to live here as "use
// server" exports — i.e. unauthenticated POST endpoints that took a
// caller-supplied organizationId and could inject leads into any tenant. They
// now live in src/lib/aiPhoneCalls.ts (a plain server module, not invokable as
// actions) and are called only from the signature-verified Twilio routes.
// This file keeps the one genuinely session-guarded action below.

export async function createLeadFromCall(callId: string) {
  const { organizationId } = await requireSalesOrManager();
  const call = await db.aiPhoneCall.findUnique({ where: { id: callId } });
  if (!call || call.organizationId !== organizationId) throw new Error("Not found");
  if (call.leadId) return { leadId: call.leadId };

  // Manual staff action — gated. The webhook's automatic lead capture
  // (src/lib/aiPhoneCalls.ts) stays allow-but-count.
  await enforcePlanLimit(organizationId, "leads");

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
