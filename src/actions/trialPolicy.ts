"use server";
// THE TRIAL CARD SWITCH (2026-10-07) — platform admin only; lib/trialPolicyServer.
import { requirePlatformAdmin } from "@/lib/orgContext";
import { setTrialRequiresCard, trialPolicyStatus, type TrialPolicyStatus } from "@/lib/trialPolicyServer";

type Result = { ok: true; policy: TrialPolicyStatus } | { ok: false; error: string };

export async function setTrialCardPolicyAction(input: Record<string, unknown> = {}): Promise<Result> {
  const admin = await requirePlatformAdmin();
  if (typeof input.requiresCard !== "boolean") return { ok: false, error: "Say whether a card is required." };
  try {
    await setTrialRequiresCard(input.requiresCard, admin.name || admin.email || null);
    return { ok: true, policy: await trialPolicyStatus() };
  } catch {
    return { ok: false, error: "The switch could not be saved. Try again." };
  }
}

export async function readTrialCardPolicyAction(): Promise<TrialPolicyStatus> {
  await requirePlatformAdmin();
  return trialPolicyStatus();
}
