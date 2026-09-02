"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { detectTrade } from "@/lib/ai/detectTrade";
import { geocodeAddress } from "@/lib/maps";
import { startCascade } from "@/lib/leadCenter/cascade";
import { getRoutingMode, MANUAL_MODE_REASON } from "@/lib/leadCenter/routingMode";
import { suggestIntakeQuestions, type IntakeQuestion } from "@/lib/ai/homeownerQuestions";
import { enforceRateLimit, clientIp, rateLimitShared, MINUTE } from "@/lib/rateLimit";

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
  // Public, unauthenticated, and expensive downstream (AI, geocode, email, SMS
  // to a caller-supplied number): per-IP cap plus a platform-wide ceiling.
  await enforceRateLimit(`homeowner:${await clientIp()}`, 3, 10 * MINUTE, "requests");
  await enforceRateLimit("homeowner:global", 60, MINUTE, "requests");

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

  // AUTO routes it now; MANUAL parks it in the Lead Center queue for an admin
  // to place. The mode is a platform switch (lib/leadCenter/routingMode).
  try {
    if ((await getRoutingMode()) === "MANUAL") {
      await db.platformLead.update({
        where: { id: platformLead.id },
        data: { status: "MANUAL_QUEUE", queueReason: MANUAL_MODE_REASON },
      });
    } else {
      await startCascade(platformLead.id);
    }
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
      const { recordReferralConversion } = await import("@/lib/referralConversion");
      await recordReferralConversion(data.referralCode, data.email);
    } catch (err) {
      console.warn("[homeowner] referral tracking failed:", err);
    }
  }

  return { ok: true, platformLeadId: platformLead.id };
}

// ── Adaptive clarify questions ─────────────────────────────────────────────
// The wizard's step-2 questions, written from what the homeowner actually
// typed. Public, like the submission itself, so it carries its own brake: the
// call costs an OpenAI request and nothing else, and a caller who exceeds the
// window simply gets the wizard's static questions instead of an error.

const questionsInput = z.object({
  description: z.string().trim().min(1).max(2000),
  category: z.string().trim().max(60).nullable().optional(),
});

/** Per-instance brake, same shape support tickets use. Generous: a homeowner
 *  editing their description and re-refining is normal behaviour. */
const QUESTIONS_PER_WINDOW = 12;
const QUESTIONS_WINDOW_MS = 5 * 60 * 1000;

/**
 * 3-5 follow-up questions for this description, or null when the wizard should
 * keep its own static set (AI off, refused, rate-limited, thin brief).
 * Never throws — a failure here must not stop a homeowner sending the request.
 */
export async function suggestHomeownerQuestions(
  raw: unknown,
): Promise<{ questions: IntakeQuestion[] | null }> {
  let data: z.infer<typeof questionsInput>;
  try {
    data = questionsInput.parse(raw);
  } catch {
    return { questions: null };
  }
  // No session to key on — this runs before a homeowner has told us anything
  // about themselves, so the window is per client IP (cross-instance).
  const gate = await rateLimitShared(`homeowner-questions:${await clientIp()}`, QUESTIONS_PER_WINDOW, QUESTIONS_WINDOW_MS);
  if (!gate.ok) return { questions: null };
  try {
    return { questions: await suggestIntakeQuestions(data.description, data.category ?? null) };
  } catch {
    return { questions: null };
  }
}
