"use server";

// Admin · Smart Proposal prompts (/admin/prompts): read a specialty's current
// text, save or reset an override, and compose the exact prompt a brief
// sends. Platform-admin gated. The rules live in lib/estimate/promptAdmin;
// the rows in the PromptOverride table (lib/estimate/promptOverrides reads
// them on every generate).

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { loadPromptOverrides } from "@/lib/estimate/promptOverrides";
import {
  checkOverride,
  composePreview,
  specialtyDetail,
  type PromptPreview,
  type SpecialtyPromptDetail,
} from "@/lib/estimate/promptAdmin";

const TABLE_MISSING = /does not exist|no such table|relation .* PromptOverride|promptOverride/i;

export async function getSpecialtyPromptDetail(id: string): Promise<SpecialtyPromptDetail | null> {
  await requirePlatformAdmin();
  const overrides = await loadPromptOverrides();
  return specialtyDetail(String(id ?? ""), overrides);
}

const saveInput = z.object({ key: z.string().min(1).max(120), body: z.string().max(200_000) });

export async function savePromptOverride(
  raw: unknown,
): Promise<{ ok: true; savedAt: string | null; customized: boolean } | { ok: false; error: string }> {
  const admin = await requirePlatformAdmin();
  const parsed = saveInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid prompt payload." };
  const { key, body } = parsed.data;
  const checked = checkOverride(key, body);
  if (!checked.ok) return checked;
  try {
    if (checked.clear) {
      await db.promptOverride.deleteMany({ where: { key } });
      revalidatePath("/admin/prompts");
      return { ok: true, savedAt: null, customized: false };
    }
    const row = await db.promptOverride.upsert({
      where: { key },
      create: { key, body: checked.body, updatedBy: admin.email },
      update: { body: checked.body, updatedBy: admin.email },
    });
    revalidatePath("/admin/prompts");
    return { ok: true, savedAt: row.updatedAt.toISOString(), customized: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: TABLE_MISSING.test(msg)
        ? "The prompt table isn't in this database yet — it lands with the next deploy."
        : `Couldn't save — ${msg.slice(0, 160)}`,
    };
  }
}

export async function resetPromptOverride(key: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePlatformAdmin();
  const k = String(key ?? "");
  if (!k || k.length > 120) return { ok: false, error: "Unknown prompt key." };
  try {
    await db.promptOverride.deleteMany({ where: { key: k } });
    revalidatePath("/admin/prompts");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: TABLE_MISSING.test(msg) ? "Nothing saved yet — the default already applies." : `Couldn't reset — ${msg.slice(0, 160)}` };
  }
}

const previewInput = z.object({
  description: z.string().trim().min(3).max(6000),
  location: z.string().trim().max(200).optional().nullable(),
  specialtyId: z.string().trim().max(80).optional().nullable(),
});

export async function composePromptPreview(raw: unknown): Promise<{ ok: true; data: PromptPreview } | { ok: false; error: string }> {
  await requirePlatformAdmin();
  const parsed = previewInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Type a brief of at least three characters." };
  const overrides = await loadPromptOverrides();
  const data = composePreview(
    {
      description: parsed.data.description,
      location: parsed.data.location || null,
      specialtyId: parsed.data.specialtyId || null,
      companyName: "Your Company",
    },
    overrides,
  );
  return { ok: true, data };
}
