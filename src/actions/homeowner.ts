"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { detectTrade } from "@/lib/ai/detectTrade";
import { geocodeAddress } from "@/lib/maps";
import { startCascade } from "@/lib/leadCenter/cascade";

const homeownerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  projectType: z.string().optional(),
  description: z.string().min(1),
  referralCode: z.string().optional(),
});

// Public intake → Lead Center. A submission becomes a platform-owned
// PlatformLead that the cascade engine routes to the best-matching org (the
// org-scoped Lead row is created only when a contractor accepts). Everything
// after the two inserts is best-effort: AI, geocoding, matching, and email can
// all fail without losing the homeowner's request — the cron sweep re-drives
// leads stuck in MATCHING.
export async function submitHomeownerRequest(raw: unknown) {
  const data = homeownerSchema.parse(raw);

  const req = await db.homeownerRequest.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      address: data.address,
      zip: data.zip,
      projectType: data.projectType,
      description: data.description,
    },
  });

  const [detected, geo] = await Promise.all([
    detectTrade(`${data.projectType ?? ""}\n${data.description}`).catch(() => null),
    geocodeAddress({
      address: data.address,
      city: data.city,
      state: data.state,
      zip: data.zip,
    }).catch(() => null),
  ]);

  const platformLead = await db.platformLead.create({
    data: {
      homeownerRequestId: req.id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      address: data.address,
      city: data.city,
      state: data.state,
      zip: data.zip,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      projectType: data.projectType,
      description: data.description,
      detectedTrade: detected?.trade ?? null,
      aiConfidence: detected?.confidence ?? null,
    },
  });

  try {
    await startCascade(platformLead.id);
  } catch (err) {
    console.warn("[homeowner] cascade failed — cron will re-drive:", err);
  }

  try {
    const { notifyHomeownerRequestReceived } = await import("@/lib/notify");
    await notifyHomeownerRequestReceived(platformLead.id);
  } catch (err) {
    console.warn("[homeowner] confirmation notify failed:", err);
  }

  // Record referral conversion if a valid ref code accompanied the submission
  if (data.referralCode) {
    try {
      const { recordReferralConversion } = await import("./referrals");
      await recordReferralConversion(data.referralCode, data.email);
    } catch (err) {
      console.warn("[homeowner] referral tracking failed:", err);
    }
  }

  return { ok: true, platformLeadId: platformLead.id };
}
