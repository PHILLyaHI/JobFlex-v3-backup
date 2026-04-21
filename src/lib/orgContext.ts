import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class NoOrgError extends Error {
  constructor(message = "No active organization") {
    super(message);
    this.name = "NoOrgError";
  }
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  return session.user;
}

export async function requireOrg() {
  const user = await requireUser();
  if (!user.activeOrgId) {
    const m = await db.membership.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    if (!m) throw new NoOrgError();
    return { user, organizationId: m.organizationId, role: m.role };
  }
  const m = await db.membership.findFirst({
    where: { userId: user.id, organizationId: user.activeOrgId },
  });
  if (!m) throw new NoOrgError();
  return { user, organizationId: m.organizationId, role: m.role };
}
