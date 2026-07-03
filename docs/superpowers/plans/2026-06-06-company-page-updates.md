# Company Page Updates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **No test framework is installed** (per CLAUDE.md), so TDD steps are replaced with
> `npm run typecheck` verification. **Do not auto-commit** — CLAUDE.md: commit only when the
> user explicitly asks. Commits are deferred to a single optional step at the end.

**Goal:** Gate the Landing tab as "coming soon" (builder preserved), add a Team Activity feed
to the Team tab, and move Subscription from a company tab to a main-sidebar page — plus the
server-action events that feed the activity timeline.

**Architecture:** Pure frontend + server-action work on the live `(dashboard)` surfaces. The
activity feed reads the existing `ActivityEvent` table; three new event kinds (EDITED,
SCHEDULED, COMPLETED) are emitted from existing server actions. No schema change / no `db push`.

**Tech Stack:** Next.js 16 App Router (RSC), React 19, TypeScript, Tailwind, Prisma (SQLite),
Impeccable design primitives (`Avatar`, `Badge`, `EmptyState`, `ComingSoon`, `PageHeader`).

Spec: `docs/superpowers/specs/2026-06-05-company-page-updates-design.md`

---

### Task 1: Add activity kinds to the enum

**Files:**
- Modify: `src/lib/prismaEnums.ts:99-112`

- [ ] **Step 1: Add EDITED / SCHEDULED / COMPLETED to `ActivityKind`**

Replace the `ActivityKind` const so it includes the new kinds:

```ts
export const ActivityKind = {
  CREATED: "CREATED",
  UPDATED: "UPDATED",
  EDITED: "EDITED",
  SENT: "SENT",
  VIEWED: "VIEWED",
  ACCEPTED: "ACCEPTED",
  DECLINED: "DECLINED",
  SCHEDULED: "SCHEDULED",
  PAID: "PAID",
  COMPLETED: "COMPLETED",
  NOTE: "NOTE",
  CALL: "CALL",
  EMAIL: "EMAIL",
  SMS: "SMS",
} as const;
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → no new errors.

---

### Task 2: Emit EDITED + accurate status kinds (proposals.ts)

**Files:**
- Modify: `src/actions/proposals.ts` (update branch of `saveProposal`, ~L112-116; `updateProposalStatus`, ~L230-238)

- [ ] **Step 1: Emit an EDITED event after a successful update**

Find:
```ts
    const refreshed = await db.proposal.findUnique({
      where: { id: proposalId },
      select: { id: true, publicId: true },
    });
    revalidatePath("/dashboard/proposals");
```
Replace with:
```ts
    const refreshed = await db.proposal.findUnique({
      where: { id: proposalId },
      select: { id: true, publicId: true },
    });
    await db.activityEvent.create({
      data: {
        organizationId,
        actorId: user.id,
        proposalId: data.id,
        clientId: data.clientId ?? null,
        kind: "EDITED",
        summary: `Edited "${data.title}"`,
      },
    });
    revalidatePath("/dashboard/proposals");
```

- [ ] **Step 2: Make `updateProposalStatus` emit specific kinds**

Find:
```ts
  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      proposalId: id,
      kind: status === "PAID" ? "PAID" : "UPDATED",
      summary: `${p.title} → ${status}`,
    },
  });
```
Replace with:
```ts
  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      proposalId: id,
      clientId: p.clientId ?? null,
      kind:
        status === "ACCEPTED" || status === "DECLINED" || status === "PAID" || status === "SENT"
          ? status
          : "UPDATED",
      summary: `${p.title} → ${status}`,
    },
  });
```

- [ ] **Step 3: Typecheck** — `npm run typecheck` → no new errors.

---

### Task 3: Emit SCHEDULED + COMPLETED events (jobs.ts)

**Files:**
- Modify: `src/actions/jobs.ts` (`createJob` L23-58; `updateJob` L60-92; `createJobFromProposal` L94-148; `scheduleJobFromTray` L283-324)

- [ ] **Step 1: `createJob` — attribute + emit SCHEDULED**

Find:
```ts
export async function createJob(raw: unknown) {
  const { organizationId } = await requireOrg();
```
Replace with:
```ts
export async function createJob(raw: unknown) {
  const { organizationId, user } = await requireOrg();
```

Then find:
```ts
  if (starts) {
    await db.jobEvent.create({
      data: {
        organizationId,
        jobId: job.id,
        title: job.title,
        startsAt: starts,
        endsAt: ends ?? new Date(starts.getTime() + 1000 * 60 * 60 * 4),
        notes: data.notes ?? null,
      },
    });
  }

  revalidatePath("/dashboard/jobs");
```
Replace with:
```ts
  if (starts) {
    await db.jobEvent.create({
      data: {
        organizationId,
        jobId: job.id,
        title: job.title,
        startsAt: starts,
        endsAt: ends ?? new Date(starts.getTime() + 1000 * 60 * 60 * 4),
        notes: data.notes ?? null,
      },
    });
    await db.activityEvent.create({
      data: {
        organizationId,
        actorId: user.id,
        proposalId: job.proposalId ?? null,
        clientId: job.clientId ?? null,
        kind: "SCHEDULED",
        summary: `Scheduled "${job.title}" — starts ${starts.toLocaleDateString()}`,
      },
    });
  }

  revalidatePath("/dashboard/jobs");
```

- [ ] **Step 2: `updateJob` — attribute + emit COMPLETED**

Find:
```ts
export async function updateJob(id: string, raw: Partial<z.infer<typeof jobInput>>) {
  const { organizationId } = await requireOrg();
```
Replace with:
```ts
export async function updateJob(id: string, raw: Partial<z.infer<typeof jobInput>>) {
  const { organizationId, user } = await requireOrg();
```

Then find:
```ts
  // Auto-create review request when the job transitions to COMPLETED
  if (raw.status === "COMPLETED" && existing.status !== "COMPLETED") {
    try {
      const { createReviewRequestInternal } = await import("./reviewRequests");
      await createReviewRequestInternal(id, organizationId);
    } catch (err) {
      console.warn("[updateJob] review request failed:", err);
    }
  }
```
Replace with:
```ts
  // Auto-create review request when the job transitions to COMPLETED
  if (raw.status === "COMPLETED" && existing.status !== "COMPLETED") {
    try {
      const { createReviewRequestInternal } = await import("./reviewRequests");
      await createReviewRequestInternal(id, organizationId);
    } catch (err) {
      console.warn("[updateJob] review request failed:", err);
    }
    await db.activityEvent.create({
      data: {
        organizationId,
        actorId: user.id,
        proposalId: existing.proposalId ?? null,
        clientId: existing.clientId ?? null,
        kind: "COMPLETED",
        summary: `Completed "${existing.title}"`,
      },
    });
  }
```

- [ ] **Step 3: `createJobFromProposal` — attribute + SCHEDULED kind**

Find:
```ts
export async function createJobFromProposal(proposalId: string) {
  const { organizationId } = await requireOrg();
```
Replace with:
```ts
export async function createJobFromProposal(proposalId: string) {
  const { organizationId, user } = await requireOrg();
```

Then find:
```ts
  await db.activityEvent.create({
    data: {
      organizationId,
      proposalId: proposal.id,
      clientId: proposal.clientId,
      kind: "CREATED",
      summary: `Job created from accepted proposal "${proposal.title}"`,
    },
  });
```
Replace with:
```ts
  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      proposalId: proposal.id,
      clientId: proposal.clientId,
      kind: "SCHEDULED",
      summary: `Scheduled "${proposal.title}" — starts ${startsAt.toLocaleDateString()}`,
    },
  });
```

- [ ] **Step 4: `scheduleJobFromTray` — SCHEDULED kind + relations**

Find:
```ts
  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      kind: "UPDATED",
      summary: `Scheduled "${job.title}" for ${day.toLocaleDateString()}`,
    },
  });
```
Replace with:
```ts
  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      proposalId: job.proposalId ?? null,
      clientId: job.clientId ?? null,
      kind: "SCHEDULED",
      summary: `Scheduled "${job.title}" for ${day.toLocaleDateString()}`,
    },
  });
```

- [ ] **Step 5: Typecheck** — `npm run typecheck` → no new errors.

---

### Task 4: Build the TeamActivity component

**Files:**
- Create: `src/components/company/TeamActivity.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";
import * as React from "react";
import { Activity } from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

type Tone = "neutral" | "accent" | "success" | "warn" | "danger" | "info";

export type TeamActivityRow = {
  id: string;
  kind: string;
  summary: string;
  createdAt: string; // ISO string
  actorId: string | null;
  actorName: string | null;
};

const KIND_LABEL: Record<string, string> = {
  CREATED: "Created",
  EDITED: "Edited",
  SENT: "Sent",
  VIEWED: "Viewed",
  ACCEPTED: "Accepted",
  PAID: "Paid",
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  DECLINED: "Declined",
  UPDATED: "Updated",
};

const KIND_TONE: Record<string, Tone> = {
  CREATED: "neutral",
  EDITED: "neutral",
  SENT: "info",
  VIEWED: "neutral",
  ACCEPTED: "success",
  PAID: "success",
  SCHEDULED: "warn",
  COMPLETED: "success",
  DECLINED: "danger",
  UPDATED: "neutral",
};

const PAGE = 15;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(d);
}

function timeOfDay(iso: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );
}

export function TeamActivity({ activities }: { activities: TeamActivityRow[] }) {
  const [filter, setFilter] = React.useState<string | null>(null);
  const [visible, setVisible] = React.useState(PAGE);

  const actors = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const a of activities) {
      if (a.actorId) map.set(a.actorId, a.actorName ?? "Member");
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [activities]);

  const filtered = React.useMemo(
    () => (filter ? activities.filter((a) => a.actorId === filter) : activities),
    [activities, filter],
  );

  const shown = filtered.slice(0, visible);

  const groups: { label: string; rows: TeamActivityRow[] }[] = [];
  for (const row of shown) {
    const label = dayLabel(row.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }

  return (
    <section className="mt-8">
      <div className="quiet-caps mb-1">Team activity</div>
      <h2 className="font-display text-[20px] tracking-[-0.015em] mb-4">Who did what</h2>

      {actors.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-5">
          <Chip
            active={filter === null}
            onClick={() => {
              setFilter(null);
              setVisible(PAGE);
            }}
          >
            All
          </Chip>
          {actors.map((a) => (
            <Chip
              key={a.id}
              active={filter === a.id}
              onClick={() => {
                setFilter(a.id);
                setVisible(PAGE);
              }}
            >
              {a.name}
            </Chip>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Activity className="h-5 w-5" />}
          title="No team activity yet"
          description="Proposal and job activity from your team will show up here."
        />
      ) : (
        <div className="paper-card divide-y divide-[color:var(--ink-line)]">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="quiet-caps px-4 pt-4 pb-2 text-[color:var(--ink-faint)]">
                {g.label}
              </div>
              <ul>
                {g.rows.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-black/[0.012] transition-colors"
                  >
                    <Avatar name={row.actorName ?? "Client"} size={32} className="mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-[13px] font-medium text-[color:var(--ink)]">
                        {row.actorName ?? "Client"}
                      </span>
                      <p className="mt-0.5 text-[12.5px] leading-snug text-[color:var(--ink-soft)]">
                        {row.summary}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[11px] tabular text-[color:var(--ink-faint)]">
                        {timeOfDay(row.createdAt)}
                      </span>
                      <Badge tone={KIND_TONE[row.kind] ?? "neutral"}>
                        {KIND_LABEL[row.kind] ?? row.kind}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {visible < filtered.length && (
            <div className="p-3 text-center">
              <button
                onClick={() => setVisible((v) => v + PAGE)}
                className="text-[12px] font-medium text-[color:var(--accent)] hover:underline"
              >
                Show more
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center rounded-full px-3 text-[12px] font-medium transition-colors",
        active
          ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
          : "text-[color:var(--ink-muted)] hover:bg-black/[0.04] hairline",
      )}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → no new errors.

---

### Task 5: Wire TeamActivity into the Team tab

**Files:**
- Modify: `src/app/(dashboard)/dashboard/company/team/page.tsx` (full rewrite)

- [ ] **Step 1: Fetch activity and render the feed below the member list**

```tsx
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { TeamClient } from "../../settings/team/team-client";
import { TeamActivity, type TeamActivityRow } from "@/components/company/TeamActivity";

export default async function CompanyTeamPage() {
  const { organizationId } = await requireOrg();

  const [memberships, invites, events] = await Promise.all([
    db.membership.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.invite.findMany({
      where: { organizationId, acceptedAt: null },
      include: { invitedBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.activityEvent.findMany({
      where: { organizationId },
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
  ]);

  const activities: TeamActivityRow[] = events.map((e) => ({
    id: e.id,
    kind: e.kind,
    summary: e.summary,
    createdAt: e.createdAt.toISOString(),
    actorId: e.actorId,
    actorName: e.actor?.name ?? e.actor?.email ?? null,
  }));

  return (
    <>
      <TeamClient
        members={memberships.map((m) => ({
          id: m.id,
          userId: m.userId,
          name: m.user?.name ?? null,
          email: m.user?.email ?? "",
          role: m.role,
          joinedAt: m.createdAt,
        }))}
        invites={invites.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          token: i.token,
          invitedByName: i.invitedBy?.name ?? i.invitedBy?.email ?? null,
          expiresAt: i.expiresAt,
          createdAt: i.createdAt,
        }))}
      />
      <TeamActivity activities={activities} />
    </>
  );
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → no new errors.

---

### Task 6: Landing tab → coming-soon (builder preserved)

**Files:**
- Modify: `src/components/ui/ComingSoon.tsx` (add optional `items` prop)
- Modify: `src/app/(dashboard)/dashboard/company/landing/page.tsx` (full rewrite)

- [ ] **Step 1: Add an optional `items` prop to ComingSoon**

Replace the file body with:
```tsx
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Construction } from "lucide-react";

export function ComingSoon({
  eyebrow,
  title,
  description,
  body,
  items,
}: {
  eyebrow?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  body?: string;
  items?: string[];
}) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <EmptyState
        icon={<Construction className="h-5 w-5" />}
        title="Coming in the next session"
        description={
          body ??
          "The schema, API, and nav for this page are scaffolded. The interactive view lands next — the rest of the app already works."
        }
        action={
          items && items.length > 0 ? (
            <ul className="flex flex-wrap items-center justify-center gap-2">
              {items.map((it) => (
                <li
                  key={it}
                  className="inline-flex items-center rounded-full bg-black/[0.05] px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--ink-soft)]"
                >
                  {it}
                </li>
              ))}
            </ul>
          ) : undefined
        }
      />
    </>
  );
}
```

- [ ] **Step 2: Gate the landing page behind a `boolean` flag**

Replace the landing page file with:
```tsx
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { LandingBuilder } from "@/components/company/LandingBuilder";
import { ComingSoon } from "@/components/ui/ComingSoon";

// Flip to true to re-enable the (already-built) landing builder. Typed as `boolean`
// so the builder code path below stays type-checked while the flag is off.
const LANDING_BUILDER_ENABLED: boolean = false;

export default async function CompanyLandingPage() {
  if (!LANDING_BUILDER_ENABLED) {
    return (
      <ComingSoon
        eyebrow="Landing builder"
        title="Coming soon"
        description="Your public landing page — a branded page that turns visitors into leads — is in production right now."
        body="We're putting the finishing touches on it. Here's what's shipping:"
        items={["Hero editor", "Services & trades", "Live preview", "One-click publish"]}
      />
    );
  }

  const { organizationId } = await requireOrg();
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org) notFound();

  return (
    <LandingBuilder
      org={{
        id: org.id,
        name: org.name,
        primaryColor: org.primaryColor,
        publicProfileEnabled: org.publicProfileEnabled,
        landingHeroTitle: org.landingHeroTitle,
        landingHeroSubtitle: org.landingHeroSubtitle,
        heroImageUrl: org.heroImageUrl,
        servicesJson: org.servicesJson,
      }}
    />
  );
}
```

- [ ] **Step 3: Typecheck** — `npm run typecheck` → no new errors.

---

### Task 7: Move Subscription out of company tabs into the sidebar

**Files:**
- Create: `src/app/(dashboard)/dashboard/subscription/page.tsx` (relocated page)
- Modify: `src/app/(dashboard)/dashboard/company/subscription/page.tsx` (→ redirect)
- Modify: `src/components/company/CompanyTabs.tsx` (remove tab + import)
- Modify: `src/components/layout/Sidebar.tsx` (add nav item + link footer)

- [ ] **Step 1: Create the relocated subscription page**

Create `src/app/(dashboard)/dashboard/subscription/page.tsx` with the existing subscription
page content, a `PageHeader`, and the corrected `plan-actions` import depth (`../settings/...`):

```tsx
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { PlanFeatureMatrix } from "@/components/billing/PlanFeatureMatrix";
import { PlanActions } from "../settings/account/plan-actions";
import { money, longDate } from "@/lib/format";
import { getOrgPlan, type Plan } from "@/lib/entitlements";

const STATUS_TONES: Record<
  string,
  "success" | "warn" | "danger" | "accent" | "neutral"
> = {
  ACTIVE: "success",
  TRIALING: "accent",
  PAST_DUE: "danger",
  CANCELED: "danger",
  EXPIRED: "danger",
  FREE: "neutral",
};

const PLAN_QUOTAS: Record<Plan, { proposalsPerMonth: number; aiDraftsPerMonth: number }> = {
  FREE: { proposalsPerMonth: 5, aiDraftsPerMonth: 3 },
  STARTER: { proposalsPerMonth: 25, aiDraftsPerMonth: 25 },
  PROFESSIONAL: { proposalsPerMonth: 200, aiDraftsPerMonth: 200 },
  ENTERPRISE: { proposalsPerMonth: 9999, aiDraftsPerMonth: 9999 },
};

export default async function SubscriptionPage() {
  const { organizationId } = await requireOrg();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [sub, payments, proposalsThisMonth, aiDraftsThisMonth] = await Promise.all([
    db.subscription.findUnique({ where: { organizationId } }),
    db.payment.findMany({
      where: { organizationId, status: "PAID" },
      orderBy: { paidAt: "desc" },
      take: 8,
    }),
    db.proposal.count({
      where: { organizationId, createdAt: { gte: monthStart } },
    }),
    db.aiDraft.count({
      where: { organizationId, createdAt: { gte: monthStart } },
    }),
  ]);

  const plan: Plan = getOrgPlan(sub);
  const status = sub?.status ?? "FREE";
  const quotas = PLAN_QUOTAS[plan];

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Account" title="Subscription" description="Your plan, usage, and billing." />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Your plan</CardTitle>
              <CardSubtitle>Active subscription</CardSubtitle>
            </div>
            <Badge tone={STATUS_TONES[status] ?? "neutral"}>
              {status.replace("_", " ").toLowerCase()}
            </Badge>
          </CardHeader>
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="quiet-caps mb-2">Plan</div>
              <div className="font-display text-[42px] tracking-[-0.02em] leading-none">
                {labelFor(plan)}
              </div>
              {sub?.currentPeriodEnd && (
                <div className="text-[12px] text-[color:var(--ink-muted)] mt-3 tabular">
                  Next bill · {longDate(sub.currentPeriodEnd)}
                </div>
              )}
            </div>
            <PlanActions currentPlan={plan} />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>This cycle</CardTitle>
              <CardSubtitle>Recent payments</CardSubtitle>
            </div>
          </CardHeader>
          {payments.length === 0 ? (
            <p className="text-[12px] text-[color:var(--ink-muted)]">No payments yet.</p>
          ) : (
            <ul className="divide-y divide-[color:var(--ink-line)]">
              {payments.slice(0, 4).map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-[12.5px] font-medium text-[color:var(--ink)]">
                      {p.method ?? p.provider.toLowerCase()}
                    </div>
                    <div className="text-[10px] text-[color:var(--ink-muted)] tabular">
                      {longDate(p.paidAt ?? p.createdAt)}
                    </div>
                  </div>
                  <span className="font-display tabular text-[14px]">{money(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Usage bars */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Usage · this month</CardTitle>
            <CardSubtitle>
              Resets on the 1st. Hitting a limit triggers a soft upgrade prompt.
            </CardSubtitle>
          </div>
        </CardHeader>
        <div className="space-y-4">
          <UsageBar
            label="Proposals created"
            used={proposalsThisMonth}
            limit={quotas.proposalsPerMonth}
          />
          <UsageBar
            label="AI drafts generated"
            used={aiDraftsThisMonth}
            limit={quotas.aiDraftsPerMonth}
          />
        </div>
      </Card>

      <div>
        <div className="quiet-caps mb-1">Plans</div>
        <h2 className="font-display text-[20px] tracking-[-0.015em] mb-4">Feature matrix</h2>
        <PlanFeatureMatrix currentPlan={plan} />
      </div>
    </div>
  );
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, (used / Math.max(1, limit)) * 100);
  const tone = pct >= 90 ? "#E11D48" : pct >= 60 ? "#C89450" : "var(--accent)";
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-[color:var(--ink-soft)] font-medium">{label}</span>
        <span className="tabular text-[color:var(--ink-muted)]">
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 mt-1.5 rounded-full bg-black/[0.05] overflow-hidden">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${pct}%`, background: tone }}
        />
      </div>
    </div>
  );
}

function labelFor(p: Plan) {
  return (
    {
      FREE: "Free",
      STARTER: "Starter",
      PROFESSIONAL: "Professional",
      ENTERPRISE: "Enterprise",
    } as const
  )[p];
}
```

- [ ] **Step 2: Replace the old company subscription page with a redirect**

Overwrite `src/app/(dashboard)/dashboard/company/subscription/page.tsx`:
```tsx
import { redirect } from "next/navigation";

export default function CompanySubscriptionRedirect() {
  redirect("/dashboard/subscription");
}
```

- [ ] **Step 3: Remove the Subscription tab from CompanyTabs**

In `src/components/company/CompanyTabs.tsx`:

Change the import (drop `CreditCard`):
```tsx
import { Palette, Globe, Users } from "lucide-react";
```
Remove the Subscription entry so `TABS` is:
```tsx
const TABS = [
  { href: "/dashboard/company", label: "Branding", icon: <Palette className="h-3.5 w-3.5" /> },
  { href: "/dashboard/company/landing", label: "Landing builder", icon: <Globe className="h-3.5 w-3.5" /> },
  { href: "/dashboard/company/team", label: "Team", icon: <Users className="h-3.5 w-3.5" /> },
];
```

- [ ] **Step 4: Add the Subscription nav item + clickable plan footer in Sidebar**

In `src/components/layout/Sidebar.tsx`:

Add `CreditCard` to the lucide-react import (append to the existing list before the closing brace), e.g. add a line `  CreditCard,` among the icon imports.

In the `Account` group, add the subscription item after Company:
```tsx
  {
    title: "Account",
    items: [
      { href: "/dashboard/company", label: "Company", icon: <Building2 className="h-4 w-4" /> },
      { href: "/dashboard/subscription", label: "Subscription", icon: <CreditCard className="h-4 w-4" /> },
      { href: "/dashboard/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
    ],
  },
```

Make the plan-status footer a link — replace:
```tsx
      <div className="p-3 border-t border-[color:var(--ink-line)]">
        <div className="paper-card p-3 text-[11px] leading-relaxed text-[color:var(--ink-muted)]">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="quiet-caps !mb-0">Live</span>
          </div>
          <p>Professional plan · 12 days left in cycle</p>
        </div>
      </div>
```
with:
```tsx
      <div className="p-3 border-t border-[color:var(--ink-line)]">
        <Link
          href="/dashboard/subscription"
          className="block paper-card p-3 text-[11px] leading-relaxed text-[color:var(--ink-muted)] transition-colors hover:bg-black/[0.02]"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="quiet-caps !mb-0">Live</span>
          </div>
          <p>Professional plan · 12 days left in cycle</p>
        </Link>
      </div>
```

- [ ] **Step 5: Typecheck** — `npm run typecheck` → no new errors.

---

### Task 8: Full verification

- [ ] **Step 1: Typecheck the whole project** — `npm run typecheck` → clean.
- [ ] **Step 2: Run `npm run dev`** and manually verify (mobile + desktop viewport):
  - Company → **Landing** tab shows the coming-soon placeholder with the "what's shipping" chips; only 3 tabs remain (no Subscription).
  - Company → **Team** tab shows the member list, then the **Team activity** feed below it; filter chips switch the actor; day groups + tonal pills render; "Show more" works; empty state shows when there's no activity.
  - **Sidebar** shows **Subscription** under Account; clicking it loads `/dashboard/subscription`; the plan-status footer links there too; `/dashboard/company/subscription` redirects to it.
  - Perform an edit / schedule / mark-a-job-complete and confirm EDITED / SCHEDULED / COMPLETED rows appear in the Team activity feed, attributed to you.
- [ ] **Step 3: Offer to commit** (do NOT auto-commit — CLAUDE.md). Suggested grouping:
  - `feat(company): gate landing builder behind coming-soon`
  - `feat(team): add team activity feed to company team tab`
  - `feat(billing): move subscription from company tab to sidebar`
  - `feat(activity): record edited/scheduled/completed activity events`

---

## Self-Review

- **Spec coverage:** Landing coming-soon (T6) ✓ · Team activity feed timeline+chips (T4/T5) ✓ ·
  Subscription tab→sidebar + relocation + redirect (T7) ✓ · EDITED/SCHEDULED/COMPLETED events
  (T1–T3) ✓ · ACCEPTED kind accuracy (T2) ✓ · design-system primitives only (T4) ✓.
- **Placeholder scan:** none — every step has full code.
- **Type consistency:** `TeamActivityRow` defined in T4 and imported in T5; `actorName`/`actorId`
  shapes match; `kind` strings align with the `ActivityKind` additions in T1 and the
  `KIND_LABEL`/`KIND_TONE` maps in T4. `PlanActions` import depth corrected for the new location.
- **No migration:** confirmed — `ActivityEvent.kind` is free-text; no `schema.prisma` change.
