// Admin · Users & subscriptions — Blueprint edition.
//
// Database control over every account and the org Subscription record. The
// admin layout mounts the blueprint shell; this page renders only the
// `.content` children through components/v3/admin-users.
//
// The strip and the table come from ONE read (getAdminUsersData) so they
// describe the same set: subscription state merged from live Stripe when
// Stripe answers, from the platform's own rows otherwise.

import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getAdminUsersData } from "@/actions/adminUsers";
import { AdminUsersContent, type AdminUserDTO } from "@/components/v3/admin-users/admin-users-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex Admin · Users",
  description: "Accounts, organizations and subscriptions.",
};

export default async function AdminUsersPage() {
  const me = await requirePlatformAdmin();

  const [data, plans] = await Promise.all([
    getAdminUsersData(),
    db.pricingPlan.findMany({ orderBy: { order: "asc" }, select: { slug: true, name: true } }),
  ]);

  const rows: AdminUserDTO[] = data.rows.map((u) => ({
    ...u,
    currentPeriodEnd: u.currentPeriodEnd?.toISOString() ?? null,
    trialEndsAt: u.trialEndsAt?.toISOString() ?? null,
    canceledAt: u.canceledAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <AdminUsersContent
      users={rows}
      plans={plans}
      summary={data.summary}
      source={data.source}
      meId={me.id}
    />
  );
}
