"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  isPlatformAdmin: boolean;
  orgId: string | null;
  orgName: string | null;
  /** The org's current plan (Subscription.plan), or "NONE" when none. */
  plan: string;
  planStatus: string;
  /** How many members share this org (plan is org-wide, not per-user). */
  orgMemberCount: number;
  createdAt: Date;
}

/** Pick the user's primary org: OWNER membership → active org → first membership. */
function primaryOrg(u: {
  activeOrgId: string | null;
  memberships: { role: string; organizationId: string; organization: { id: string; name: string } }[];
}) {
  const owner = u.memberships.find((m) => m.role === "OWNER");
  const active = u.memberships.find((m) => m.organizationId === u.activeOrgId);
  return (owner ?? active ?? u.memberships[0])?.organization ?? null;
}

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  await requirePlatformAdmin();

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      isPlatformAdmin: true,
      createdAt: true,
      activeOrgId: true,
      memberships: {
        select: {
          role: true,
          organizationId: true,
          organization: { select: { id: true, name: true } },
        },
      },
    },
  });

  const orgIds = Array.from(
    new Set(users.map((u) => primaryOrg(u)?.id).filter(Boolean) as string[]),
  );
  const [subs, memberCounts] = await Promise.all([
    orgIds.length
      ? db.subscription.findMany({
          where: { organizationId: { in: orgIds } },
          select: { organizationId: true, plan: true, status: true },
        })
      : Promise.resolve([]),
    db.membership.groupBy({ by: ["organizationId"], _count: true }),
  ]);
  const subByOrg = new Map(subs.map((s) => [s.organizationId, s]));
  const countByOrg = new Map(memberCounts.map((m) => [m.organizationId, m._count]));

  return users.map((u) => {
    const org = primaryOrg(u);
    const sub = org ? subByOrg.get(org.id) : null;
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      isPlatformAdmin: u.isPlatformAdmin,
      orgId: org?.id ?? null,
      orgName: org?.name ?? null,
      plan: sub?.plan ?? "NONE",
      planStatus: sub?.status ?? "NONE",
      orgMemberCount: org ? (countByOrg.get(org.id) ?? 1) : 0,
      createdAt: u.createdAt,
    };
  });
}

const updateInput = z.object({
  userId: z.string().min(1),
  email: z.string().email().optional(),
  name: z.string().nullable().optional(),
  /** PricingPlan.slug to assign to the user's org, or undefined to leave unchanged. */
  planSlug: z.string().optional(),
});

export async function updateAdminUser(raw: unknown) {
  await requirePlatformAdmin();
  const data = updateInput.parse(raw);

  // 1) Profile fields (email/name). Normalize email to match the auth layer,
  // which always lowercases+trims on login (auth.ts) — storing it as-typed would
  // lock the user out and could spawn a duplicate Google account.
  if (data.email !== undefined || data.name !== undefined) {
    const email = data.email !== undefined ? data.email.trim().toLowerCase() : undefined;
    if (email) {
      const clash = await db.user.findFirst({
        where: { email, NOT: { id: data.userId } },
        select: { id: true },
      });
      if (clash) throw new Error("That email is already in use by another account.");
    }
    try {
      await db.user.update({
        where: { id: data.userId },
        data: {
          ...(email !== undefined ? { email } : {}),
          ...(data.name !== undefined ? { name: data.name } : {}),
        },
      });
    } catch (err) {
      // The DB @unique is the real guard — translate a race/casing collision
      // that slipped past the pre-check into the same friendly message.
      if (err && typeof err === "object" && (err as { code?: string }).code === "P2002") {
        throw new Error("That email is already in use by another account.");
      }
      throw err;
    }
  }

  // 2) Plan assignment — set the user's primary org Subscription to the chosen plan.
  if (data.planSlug !== undefined) {
    const plan = await db.pricingPlan.findFirst({ where: { slug: data.planSlug } });
    if (!plan) throw new Error("Unknown pricing plan.");

    const user = await db.user.findUnique({
      where: { id: data.userId },
      select: {
        activeOrgId: true,
        memberships: {
          select: { role: true, organizationId: true, organization: { select: { id: true, name: true } } },
        },
      },
    });
    const org = user ? primaryOrg(user) : null;
    if (!org) throw new Error("User has no organization to assign a plan to.");

    // Store the UPPERCASE canonical form. The limits engine matches
    // PricingPlan.slug ↔ Subscription.plan case-insensitively, AND the separate
    // tier feature-gating (entitlements.ts) compares case-SENSITIVELY against
    // FREE/STARTER/PROFESSIONAL/ENTERPRISE — so a tier-named slug must be stored
    // uppercase or the user would be silently downgraded to FREE features.
    const tier = plan.slug.toUpperCase();

    // Manual admin override (does NOT create a Stripe subscription). provider
    // MANUAL flags it; currentPeriodEnd null → monthly limits use the calendar
    // month (not a stale Stripe billing day).
    await db.subscription.upsert({
      where: { organizationId: org.id },
      update: { plan: tier, status: "ACTIVE", provider: "MANUAL", currentPeriodEnd: null },
      create: { organizationId: org.id, plan: tier, status: "ACTIVE", provider: "MANUAL", currentPeriodEnd: null },
    });
  }

  revalidatePath("/admin/users");
}
