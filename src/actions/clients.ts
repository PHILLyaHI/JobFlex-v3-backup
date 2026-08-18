"use server";
import { z } from "zod";
import { requireSalesOrManager } from "@/lib/orgContext";
import { db } from "@/lib/db";

// Tight client shape returned to the v3 builder. Matches the columns the
// inline create/edit form writes; ignore notes/customFields/tags for now.
export type ClientRecord = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

const CLIENT_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  address: true,
  city: true,
  state: true,
  zip: true,
} as const;

// Empty strings come back from form inputs; normalise to null so we don't
// store "" alongside real values.
const trimOrNull = z
  .string()
  .optional()
  .transform((v) => {
    const t = (v ?? "").trim();
    return t.length === 0 ? null : t;
  });

// Notes is the one column that must survive a form that does not carry it.
// Every other field is written by every caller, so `undefined -> null` is a
// correct erase; notes is edited from the client record only, and the inline
// builder sheet never sends it. Returning `undefined` for an absent key makes
// Prisma SKIP the column instead of blanking what somebody typed elsewhere.
const notesInput = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : v.trim() || null));

const clientInput = z.object({
  name: z.string().min(1, "Name is required").max(120),
  email: trimOrNull,
  phone: trimOrNull,
  address: trimOrNull,
  city: trimOrNull,
  state: trimOrNull,
  zip: trimOrNull,
  notes: notesInput,
});

export type ClientInput = z.infer<typeof clientInput>;

// VIP isn't a Client column — it's modeled as an org-scoped "VIP" Tag. Kept out
// of `clientInput` so it can never be spread into db.client.create.
const createClientInput = clientInput.extend({ vip: z.boolean().optional() });

export async function createClient(raw: unknown): Promise<ClientRecord> {
  const { organizationId } = await requireSalesOrManager();
  const { vip, ...data } = createClientInput.parse(raw);
  const created = await db.client.create({
    data: { organizationId, ...data },
    select: CLIENT_SELECT,
  });
  if (vip) {
    // Upsert the org's VIP tag (unique on [organizationId, label]), then link it.
    const tag = await db.tag.upsert({
      where: { organizationId_label: { organizationId, label: "VIP" } },
      update: {},
      create: { organizationId, label: "VIP", color: "#1f7a52" },
    });
    await db.clientTag.create({ data: { clientId: created.id, tagId: tag.id } });
  }
  return created;
}

export async function updateClient(
  id: string,
  raw: unknown,
): Promise<ClientRecord> {
  const { organizationId } = await requireSalesOrManager();
  const existing = await db.client.findUnique({
    where: { id },
    select: { organizationId: true, deletedAt: true },
  });
  if (
    !existing ||
    existing.organizationId !== organizationId ||
    existing.deletedAt
  ) {
    throw new Error("Client not found");
  }
  const data = clientInput.parse(raw);
  const updated = await db.client.update({
    where: { id },
    data,
    select: CLIENT_SELECT,
  });
  return updated;
}
