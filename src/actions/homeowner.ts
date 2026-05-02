"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { categorizeLead } from "@/actions/ai";

const homeownerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  address: z.string().optional(),
  zip: z.string().optional(),
  projectType: z.string().optional(),
  description: z.string().min(1),
  referralCode: z.string().optional(),
});

export async function submitHomeownerRequest(raw: unknown) {
  const data = homeownerSchema.parse(raw);

  const defaultOrg = await db.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!defaultOrg) throw new Error("No organizations configured yet");

  const req = await db.homeownerRequest.create({
    data: {
      ...data,
      organizationId: defaultOrg.id,
    },
  });

  const categorization = await categorizeLead(
    `${data.projectType ?? ""}\n${data.description}`,
  ).catch(() => null);

  const lead = await db.lead.create({
    data: {
      organizationId: defaultOrg.id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      address: data.address,
      zip: data.zip,
      projectType: data.projectType,
      description: data.description,
      source: "homeowner-form",
      aiCategory: categorization?.category ?? null,
      aiConfidence: categorization?.confidence ?? null,
    },
  });

  await db.homeownerRequest.update({
    where: { id: req.id },
    data: { convertedLeadId: lead.id },
  });

  await db.activityEvent.create({
    data: {
      organizationId: defaultOrg.id,
      leadId: lead.id,
      kind: "CREATED",
      summary: `New homeowner request: ${lead.name} · ${lead.projectType ?? "general inquiry"}`,
    },
  });

  // Best-effort email + SMS notify to the owner / assigned user
  try {
    const { notifyLeadCreated } = await import("./notify");
    await notifyLeadCreated(lead.id);
  } catch (err) {
    console.warn("[homeowner] notify failed:", err);
  }

  // Record referral conversion if a valid ref code accompanied the signup
  if (data.referralCode) {
    try {
      const { recordReferralConversion } = await import("./referrals");
      await recordReferralConversion(data.referralCode, data.email);
    } catch (err) {
      console.warn("[homeowner] referral tracking failed:", err);
    }
  }

  return { ok: true, leadId: lead.id };
}
