"use server";

// THE TRIAL WATCH'S READ (2026-09-24) — platform admin only.
//
// Every company signed up in the last TRIAL_WINDOW_DAYS, with what its
// members looked at (PageView), what they made (clients, proposals sent,
// jobs, leads), their email domains, and whether another trial in the window
// was seen on the same device — scored by lib/trialWatch. When the PageView
// table is not in this database yet, the page still lists the companies and
// the signals that need no page views, and says so.

import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { scoreTrial, sortAssessments, TRIAL_WINDOW_DAYS, WATCH_DAYS, type TrialAssessment, type ViewIn } from "@/lib/trialWatch";

export type TrialWatchData = {
  now: string;
  windowDays: number;
  watchDays: number;
  /** False when the PageView table could not be read — not pushed to this database yet. */
  viewsAvailable: boolean;
  rows: TrialAssessment[];
};

const countBy = (rows: Array<{ organizationId: string; _count: { _all: number } }>) => new Map(rows.map((r) => [r.organizationId, r._count._all]));

export async function getTrialWatch(): Promise<TrialWatchData> {
  await requirePlatformAdmin();
  const since = new Date(Date.now() - TRIAL_WINDOW_DAYS * 86_400_000);
  const orgs = await db.organization.findMany({
    where: { createdAt: { gte: since }, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      name: true,
      createdAt: true,
      subscription: { select: { plan: true, status: true, trialEndsAt: true } },
      memberships: { select: { role: true, user: { select: { email: true } } } },
    },
  });
  const ids = orgs.map((o) => o.id);
  if (!ids.length) return { now: new Date().toISOString(), windowDays: TRIAL_WINDOW_DAYS, watchDays: WATCH_DAYS, viewsAvailable: true, rows: [] };
  const inOrgs = { organizationId: { in: ids } };
  const [clients, proposals, sent, jobs, leads] = await Promise.all([
    db.client.groupBy({ by: ["organizationId"], where: inOrgs, _count: { _all: true } }),
    db.proposal.groupBy({ by: ["organizationId"], where: inOrgs, _count: { _all: true } }),
    db.proposal.groupBy({ by: ["organizationId"], where: { ...inOrgs, sentAt: { not: null } }, _count: { _all: true } }),
    db.job.groupBy({ by: ["organizationId"], where: inOrgs, _count: { _all: true } }),
    db.lead.groupBy({ by: ["organizationId"], where: inOrgs, _count: { _all: true } }).catch(() => [] as Array<{ organizationId: string; _count: { _all: number } }>),
  ]);
  const c = countBy(clients), p = countBy(proposals), s = countBy(sent), j = countBy(jobs), l = countBy(leads);

  let viewsAvailable = true;
  const viewsByOrg = new Map<string, ViewIn[]>();
  const orgsByDevice = new Map<string, Set<string>>();
  try {
    const views = await db.pageView.findMany({
      where: inOrgs,
      orderBy: { at: "asc" },
      take: 40_000,
      select: { organizationId: true, userId: true, route: true, at: true, ipHash: true, uaHash: true },
    });
    for (const v of views) {
      viewsByOrg.set(v.organizationId, [...(viewsByOrg.get(v.organizationId) ?? []), { route: v.route, at: v.at.toISOString(), userId: v.userId, ipHash: v.ipHash, uaHash: v.uaHash }]);
      if (v.ipHash && v.uaHash) {
        const key = `${v.uaHash}|${v.ipHash}`;
        orgsByDevice.set(key, (orgsByDevice.get(key) ?? new Set()).add(v.organizationId));
      }
    }
  } catch {
    viewsAvailable = false;
  }

  const rows = orgs.map((o) => {
    const views = viewsByOrg.get(o.id) ?? [];
    const others = new Set<string>();
    for (const v of views) if (v.ipHash && v.uaHash) for (const id of orgsByDevice.get(`${v.uaHash}|${v.ipHash}`) ?? []) if (id !== o.id) others.add(id);
    const owner = o.memberships.find((m) => m.role === "OWNER")?.user.email ?? o.memberships[0]?.user.email ?? null;
    return scoreTrial({
      id: o.id,
      name: o.name,
      createdAt: o.createdAt.toISOString(),
      plan: o.subscription?.plan ?? "FREE",
      status: o.subscription?.status ?? "FREE",
      trialEndsAt: o.subscription?.trialEndsAt?.toISOString() ?? null,
      ownerEmail: owner,
      emails: o.memberships.map((m) => m.user.email).filter((e): e is string => !!e),
      views,
      records: { clients: c.get(o.id) ?? 0, proposals: p.get(o.id) ?? 0, sent: s.get(o.id) ?? 0, jobs: j.get(o.id) ?? 0, leads: l.get(o.id) ?? 0 },
      sharedDeviceTrials: others.size,
    });
  });
  return { now: new Date().toISOString(), windowDays: TRIAL_WINDOW_DAYS, watchDays: WATCH_DAYS, viewsAvailable, rows: sortAssessments(rows) };
}
