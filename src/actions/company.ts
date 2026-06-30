"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";

const brandingInput = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  billingEmail: z.string().email().nullable().optional(),
  address: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  primaryColor: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
});

export async function updateBranding(raw: unknown) {
  const { organizationId } = await requireManager();
  const data = brandingInput.parse(raw);
  await db.organization.update({
    where: { id: organizationId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.billingEmail !== undefined && { billingEmail: data.billingEmail }),
      ...(data.address !== undefined && { address: data.address }),
      ...(data.website !== undefined && { website: data.website }),
      ...(data.primaryColor !== undefined && { primaryColor: data.primaryColor }),
      ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
    },
  });
  revalidatePath("/dashboard/company");
  revalidatePath("/dashboard/settings/company");
}

const landingInput = z.object({
  publicProfileEnabled: z.boolean().optional(),
  landingHeroTitle: z.string().nullable().optional(),
  landingHeroSubtitle: z.string().nullable().optional(),
  heroImageUrl: z.string().nullable().optional(),
  services: z.array(z.string()).optional(),
});

export async function updateLanding(raw: unknown) {
  const { organizationId } = await requireManager();
  const data = landingInput.parse(raw);
  await db.organization.update({
    where: { id: organizationId },
    data: {
      ...(data.publicProfileEnabled !== undefined && {
        publicProfileEnabled: data.publicProfileEnabled,
      }),
      ...(data.landingHeroTitle !== undefined && { landingHeroTitle: data.landingHeroTitle }),
      ...(data.landingHeroSubtitle !== undefined && {
        landingHeroSubtitle: data.landingHeroSubtitle,
      }),
      ...(data.heroImageUrl !== undefined && { heroImageUrl: data.heroImageUrl }),
      ...(data.services !== undefined && { servicesJson: JSON.stringify(data.services) }),
    },
  });
  revalidatePath("/dashboard/company/landing");
  revalidatePath("/homeowners");
}
