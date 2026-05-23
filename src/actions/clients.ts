"use server";
import { z } from "zod";
import { requireOrg } from "@/lib/orgContext";
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

const clientInput = z.object({
  name: z.string().min(1, "Name is required").max(120),
  email: trimOrNull,
  phone: trimOrNull,
  address: trimOrNull,
  city: trimOrNull,
  state: trimOrNull,
  zip: trimOrNull,
});

export type ClientInput = z.infer<typeof clientInput>;

export async function createClient(raw: unknown): Promise<ClientRecord> {
  const { organizationId } = await requireOrg();
  const data = clientInput.parse(raw);
  const created = await db.client.create({
    data: { organizationId, ...data },
    select: CLIENT_SELECT,
  });
  return created;
}

export async function updateClient(
  id: string,
  raw: unknown,
): Promise<ClientRecord> {
  const { organizationId } = await requireOrg();
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
