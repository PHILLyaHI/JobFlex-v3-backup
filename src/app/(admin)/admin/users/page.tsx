import { requirePlatformAdmin } from "@/lib/orgContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { db } from "@/lib/db";
import { listAdminUsers } from "@/actions/adminUsers";
import { UsersClient } from "./users-client";

export default async function AdminUsersPage() {
  const me = await requirePlatformAdmin();

  const [users, plans] = await Promise.all([
    listAdminUsers(),
    db.pricingPlan.findMany({ orderBy: { order: "asc" }, select: { slug: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Users"
        description="Every account on the platform. Edit a user's details, or set the pricing plan for their organization."
      />
      <UsersClient
        users={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
        plans={plans}
        currentUserId={me.id}
      />
    </>
  );
}
