import "server-only";
// WHO MAY USE THE DECK ESTIMATOR (2026-10-04). Owner: "Deck Estimator should
// be the name and mark it coming soon, but let it be available to work and
// test for admin." Every account sees the sidebar row with its Coming soon
// mark and a coming-soon page at the URL; a platform admin (the flag on the
// user, or the admin console's own sign-in) and the owner's early-access
// account get the working estimator. The page and both server actions ask
// this one function.
import { db } from "@/lib/db";
import { readAdminCookie } from "@/lib/adminAuth";
import { canSeeEarlyAccess } from "@/lib/earlyAccess";

export async function canUseDeckEstimator(user: { id: string; email?: string | null }): Promise<boolean> {
  if (canSeeEarlyAccess(user.email)) return true;
  try {
    const row = await db.user.findUnique({ where: { id: user.id }, select: { isPlatformAdmin: true } });
    if (row?.isPlatformAdmin) return true;
  } catch {
    /* fall through to the admin cookie */
  }
  try {
    return !!(await readAdminCookie());
  } catch {
    return false;
  }
}
