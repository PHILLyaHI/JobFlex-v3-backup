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

// Reuse a prior geocode for the SAME address instead of paying Google again.
// Public-intake addresses are almost always unique, so this only saves the
// occasional duplicate submission — but a redundant paid call is cheap to avoid.
// Best-effort: only reuses when a real street line is present (a zip/city-only
// match could reuse a coarse/wrong pin) and a prior lead already has coordinates;
// any miss or error falls through to a live geocode. Exact match on the stored
// parts — case/whitespace variants won't dedup (that would need a normalized
// column, i.e. a schema change, which we're not making here).
async function geocodeOrReuse(parts: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): Promise<{ lat: number; lng: number } | null> {
  const street = parts.address?.trim();
  if (street) {
    try {
      const prior = await db.platformLead.findFirst({
        where: {
          address: parts.address ?? null,
          city: parts.city ?? null,
          state: parts.state ?? null,
          zip: parts.zip ?? null,
          lat: { not: null },
          lng: { not: null },
        },
        select: { lat: true, lng: true },
        orderBy: { createdAt: "desc" },
      });
      if (prior?.lat != null && prior?.lng != null) {
        return { lat: prior.lat, lng: prior.lng };
      }
    } catch {
      // Reuse lookup is best-effort — fall through to a live geocode on any error.
    }
  }
  return geocodeAddress(parts);
}

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
    geocodeOrReuse({
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
