"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager, requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { TRADE_TYPES, parseTradeTypes } from "@/lib/tradeTypes";
import { geocodeAddress } from "@/lib/maps";
import { loadTeamActivity } from "@/lib/teamActivity";
import { toActivityEntries } from "@/components/v3/company-blueprint/company-data";

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

  // Keep the Lead Center pin in sync — branding is the other surface that can
  // edit the org address (see updateLeadProfile for the same policy).
  let geoData: { lat: number | null; lng: number | null; geocodedAt: Date | null } | null = null;
  if (data.address !== undefined) {
    const current = await db.organization.findUnique({
      where: { id: organizationId },
      select: { address: true },
    });
    if ((data.address ?? "") !== (current?.address ?? "")) {
      const geo = data.address ? await geocodeAddress({ address: data.address }) : null;
      geoData = geo
        ? { lat: geo.lat, lng: geo.lng, geocodedAt: new Date() }
        : { lat: null, lng: null, geocodedAt: null };
    }
  }

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
      ...(geoData ?? {}),
    },
  });
  revalidatePath("/dashboard/company");
  revalidatePath("/dashboard/settings/company");
}

// Lead Center matching profile — address + canonical trades feed the platform
// lead matcher. Saving a changed address re-geocodes; a geocode failure still
// saves the address but nulls lat/lng (the org drops out of matching until it
// resolves, and the dashboard banner surfaces that).
const leadProfileInput = z.object({
  address: z.string().trim().max(240).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  tradeTypes: z.array(z.enum(TRADE_TYPES)).max(TRADE_TYPES.length).optional(),
  // Free text under the "Other" chip. It has its own column because
  // tradeTypesJson is validated against the closed TRADE_TYPES vocabulary and
  // drops anything else on read (same rule the register form follows).
  otherTrade: z.string().trim().max(80).nullable().optional(),
  leadOffersEnabled: z.boolean().optional(),
});

export async function updateLeadProfile(raw: unknown) {
  const { organizationId } = await requireManager();
  const data = leadProfileInput.parse(raw);

  let geoData: { lat: number | null; lng: number | null; geocodedAt: Date | null } | null = null;
  if (data.address !== undefined) {
    const current = await db.organization.findUnique({
      where: { id: organizationId },
      select: { address: true },
    });
    if ((data.address ?? "") !== (current?.address ?? "")) {
      const geo = data.address ? await geocodeAddress({ address: data.address }) : null;
      geoData = geo
        ? { lat: geo.lat, lng: geo.lng, geocodedAt: new Date() }
        : { lat: null, lng: null, geocodedAt: null };
    }
  }

  await db.organization.update({
    where: { id: organizationId },
    data: {
      ...(data.address !== undefined && { address: data.address }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.tradeTypes !== undefined && { tradeTypesJson: JSON.stringify(data.tradeTypes) }),
      // Dropping "Other" drops the text with it — a named trade nobody can see
      // is a value that quietly keeps matching against a chip that is off.
      ...(data.tradeTypes !== undefined &&
        !data.tradeTypes.includes("Other") && { otherTrade: null }),
      ...(data.otherTrade !== undefined && { otherTrade: data.otherTrade || null }),
      ...(data.leadOffersEnabled !== undefined && { leadOffersEnabled: data.leadOffersEnabled }),
      ...(geoData ?? {}),
    },
  });
  revalidatePath("/dashboard/company");
  revalidatePath("/dashboard");
}

/**
 * Read-only seed for the handheld Company surface (mobile-company-v2), which
 * ResponsiveDashboardShell mounts props-less. Same guard and same reads as the
 * desktop page (app/dashboard/company/page.tsx): requireOrg() for the org row,
 * loadTeamActivity for members + feed, and the SAME toActivityEntries mapper —
 * plus the ActivityEvent id per entry, which the handheld feed needs for React
 * keys and its row-actions sheet.
 */
export async function getCompanySeed() {
  const { organizationId } = await requireOrg();
  const [org, activity] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId } }),
    loadTeamActivity(organizationId),
  ]);
  if (!org) throw new Error("Organization not found");

  const entries = toActivityEntries(activity.activities);
  return {
    org: {
      name: org.name,
      billingEmail: org.billingEmail ?? "",
      phone: org.phone ?? "",
      website: org.website ?? "",
      address: org.address ?? "",
      primaryColor: org.primaryColor ?? "",
      logoUrl: org.logoUrl,
      tradeTypes: parseTradeTypes(org.tradeTypesJson) as string[],
      leadOffersEnabled: org.leadOffersEnabled,
      publicProfileEnabled: org.publicProfileEnabled,
      landingHeroTitle: org.landingHeroTitle ?? "",
      landingHeroSubtitle: org.landingHeroSubtitle ?? "",
    },
    members: activity.members,
    // toActivityEntries maps rows 1:1 and in order, so index i is row i.
    activity: entries.map((e, i) => ({ ...e, id: activity.activities[i].id })),
  };
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
