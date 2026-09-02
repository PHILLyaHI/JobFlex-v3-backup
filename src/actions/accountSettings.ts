"use server";

// Personal + business account settings behind the blueprint Settings page
// (/dashboard/settings). Three writes and nothing else:
//
//   updateProfile           → the CURRENT user's own row (name, phone)
//   updateBusiness          → the org row (manager-gated)
//   updateNotificationPrefs → the CURRENT user's own notification blob
//
// Every other value the page saves already had an action: payment settings,
// Gmail and Meta go through src/actions/settings.ts, and the plan goes through
// checkout. Deliberately NO read helper is exported here — an exported async
// function in a "use server" module is a public RPC endpoint, so a read keyed
// by a caller-supplied id would be a data leak. The Settings page does its
// reads in the server component.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireManager, requireUser } from "@/lib/orgContext";
import { db } from "@/lib/db";

const SETTINGS_PATH = "/dashboard/settings";

/** "" from an emptied text input means "clear the column", not "store empty". */
function orNull(v: string | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  const t = v.trim();
  return t === "" ? null : t;
}

/* ─────────────────────────────── profile ─────────────────────────────── */

const profileSchema = z.object({
  name: z.string().trim().max(120),
  phone: z.string().trim().max(40),
});

/**
 * The signed-in user's own profile. Scoped to `session.user.id` — there is no
 * id parameter, so this can only ever write the caller's row.
 */
export async function updateProfile(raw: unknown) {
  const user = await requireUser();
  const data = profileSchema.parse(raw);
  await db.user.update({
    where: { id: user.id },
    data: { name: orNull(data.name), phone: orNull(data.phone) },
  });
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/* ────────────────────────────── business ─────────────────────────────── */

// Every field optional so one card can save its own slice: the Account pane's
// Business card sends name/address/website/phone, the Billing pane's Billing
// contact card sends billingEmail alone. An absent key is left untouched
// rather than blanked.
const businessSchema = z.object({
  name: z.string().trim().min(1, "Business name is required.").max(160).optional(),
  address: z.string().trim().max(300).optional(),
  website: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  billingEmail: z
    .union([z.literal(""), z.string().trim().email("Enter a valid billing email.").max(200)])
    .optional(),
});

/** Org identity. Manager-gated: a limited role may read the page, never edit it. */
export async function updateBusiness(raw: unknown) {
  const { organizationId } = await requireManager();
  const data = businessSchema.parse(raw);

  const patch: {
    name?: string;
    address?: string | null;
    website?: string | null;
    phone?: string | null;
    billingEmail?: string | null;
  } = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.address !== undefined) patch.address = orNull(data.address) ?? null;
  if (data.website !== undefined) patch.website = orNull(data.website) ?? null;
  if (data.phone !== undefined) patch.phone = orNull(data.phone) ?? null;
  if (data.billingEmail !== undefined) patch.billingEmail = orNull(data.billingEmail) ?? null;

  if (Object.keys(patch).length === 0) return { ok: true };

  await db.organization.update({ where: { id: organizationId }, data: patch });
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/* ──────────────────────────── notifications ──────────────────────────── */

// The whole preference blob is stored as one JSON-as-String column on User,
// hydrated whole on load — the same shape as the org's *SettingsJson columns.
// `matrix` is keyed by the event key with an [in-app, email, sms] triple.
const notificationSchema = z.object({
  matrix: z.record(z.string(), z.tuple([z.boolean(), z.boolean(), z.boolean()])),
  quietFrom: z.string().trim().max(10),
  quietTo: z.string().trim().max(10),
  digest: z.string().trim().max(10),
  sms: z.string().trim().max(40),
  muteWeekends: z.boolean(),
  desktopPush: z.boolean(),
  soundOnLead: z.boolean(),
});

/** The signed-in user's own notification matrix + delivery rules. */
export async function updateNotificationPrefs(raw: unknown) {
  const user = await requireUser();
  const data = notificationSchema.parse(raw);
  await db.user.update({
    where: { id: user.id },
    data: { notificationPrefsJson: JSON.stringify(data) },
  });
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}
