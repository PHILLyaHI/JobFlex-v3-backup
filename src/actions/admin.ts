"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/orgContext";
import { db } from "@/lib/db";

// ── Pricing plans ─────────────────────────────────────

const planInput = z.object({
  id: z.string().optional(),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  priceCents: z.number().min(0),
  interval: z.enum(["month", "year"]),
  order: z.number().default(0),
  features: z.array(z.string()).default([]),
});

export async function upsertPricingPlan(raw: unknown) {
  await requireUser();
  const data = planInput.parse(raw);
  if (data.id) {
    await db.pricingPlan.update({
      where: { id: data.id },
      data: {
        slug: data.slug,
        name: data.name,
        description: data.description ?? null,
        priceCents: data.priceCents,
        interval: data.interval,
        order: data.order,
        features: JSON.stringify(data.features),
      },
    });
  } else {
    await db.pricingPlan.create({
      data: {
        slug: data.slug,
        name: data.name,
        description: data.description ?? null,
        priceCents: data.priceCents,
        interval: data.interval,
        order: data.order,
        features: JSON.stringify(data.features),
      },
    });
  }
  revalidatePath("/admin/plans");
}

export async function deletePricingPlan(id: string) {
  await requireUser();
  await db.pricingPlan.delete({ where: { id } });
  revalidatePath("/admin/plans");
}

// ── Specialties ───────────────────────────────────────

export async function upsertSpecialty(raw: {
  id?: string;
  organizationId: string;
  name: string;
  promptPreamble?: string | null;
}) {
  await requireUser();
  if (raw.id) {
    await db.specialty.update({
      where: { id: raw.id },
      data: { name: raw.name, promptPreamble: raw.promptPreamble ?? null },
    });
  } else {
    await db.specialty.create({
      data: {
        organizationId: raw.organizationId,
        name: raw.name,
        promptPreamble: raw.promptPreamble ?? null,
      },
    });
  }
  revalidatePath("/admin/specialties");
}

export async function deleteSpecialty(id: string) {
  await requireUser();
  await db.specialty.delete({ where: { id } });
  revalidatePath("/admin/specialties");
}

// ── Support tickets ───────────────────────────────────

export async function updateTicketStatus(id: string, status: string) {
  await requireUser();
  await db.supportTicket.update({ where: { id }, data: { status } });
  revalidatePath("/admin/support");
}

// ── Platform-wide email campaigns ─────────────────────
// Reuses the existing Announcement model with `scope = "PLATFORM"`.
// Every tenant's AnnouncementBanner picks these up because the banner
// reads any Announcement targeting the org *or* the platform.

const campaignInput = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  expiresInDays: z.number().min(1).max(365).optional(),
});

export async function sendPlatformCampaign(raw: unknown) {
  const user = await requireUser();
  const data = campaignInput.parse(raw);

  // We need *some* organizationId for the FK; pick the user's first
  // membership as the "issuer" — the ANNOUNCEMENT.scope=PLATFORM is what
  // actually marks it as cross-tenant.
  const m = await db.membership.findFirst({
    where: { userId: user.id, role: { in: ["OWNER", "ADMIN"] } },
    select: { organizationId: true },
  });
  if (!m) throw new Error("Need an admin/owner membership to issue platform campaigns.");

  const expiresAt = data.expiresInDays
    ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const created = await db.announcement.create({
    data: {
      organizationId: m.organizationId, // issuer org for FK; not used for visibility
      title: data.title,
      body: data.body,
      scope: "PLATFORM",
      priority: 1,
      expiresAt,
    },
  });

  revalidatePath("/admin/campaigns");
  revalidatePath("/dashboard"); // banner re-renders
  return { id: created.id };
}

export async function deletePlatformCampaign(id: string) {
  await requireUser();
  await db.announcement.delete({ where: { id } });
  revalidatePath("/admin/campaigns");
  revalidatePath("/dashboard");
}
