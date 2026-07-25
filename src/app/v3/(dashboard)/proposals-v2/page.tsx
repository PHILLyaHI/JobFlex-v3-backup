// Proposals v2 — "THE PROPOSAL DESK" (Blueprint app shell).
// jobflex-page-styler build: unlike the standalone ledger sheet at
// /v3/proposals, this take brings the reference dashboard's REAL app
// shell (264px sidebar + topbar) to the proposals surface — KPI strip,
// clickable status funnel, estimate-style Proposal Book with client-side
// filter/sort/search, and two side cards. Live org data, read-only; the
// classic page at /dashboard/proposals stays untouched.
//
// Auth: middleware only matches /dashboard and /admin, so this page
// enforces its own redirect-to-login (same pattern as the other /v3
// experiments). Reads are org-wide — no role scoping here.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { requireOrg, NoOrgError } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { V3_PORTED_ROUTES } from "@/lib/v3/routes";
import { ProposalsDesk, type DeskRow, type DeskStatus } from "./proposals-v2-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Proposal Desk · Proposals v2 — JobFlex",
  description:
    "Blueprint-edition proposals desk: the status funnel, the proposal book, and what needs a signature — on one sheet.",
};

const DAY_MS = 86_400_000;

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export default async function ProposalsV2Page() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/login?next=${encodeURIComponent(V3_PORTED_ROUTES.proposalsV2)}`);
  }

  let organizationId: string;
  let userName: string;
  let roleLabel: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
    userName = ctx.user.name ?? ctx.user.email ?? "Operator";
    roleLabel = ctx.role
      ? ctx.role.charAt(0).toUpperCase() + ctx.role.slice(1).toLowerCase()
      : "Owner";
  } catch (err) {
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);

  const [proposals, won30Agg] = await Promise.all([
    db.proposal.findMany({
      where: { organizationId, status: { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        total: true,
        updatedAt: true,
        sentAt: true,
        validUntil: true,
        viewCount: true,
        client: { select: { name: true, city: true, state: true } },
        owner: { select: { name: true } },
      },
    }),
    db.proposal.aggregate({
      where: { organizationId, acceptedAt: { gte: thirtyDaysAgo } },
      _sum: { total: true },
    }),
  ]);

  // Date math happens once, server-side, so SSR and hydration agree.
  const rows: DeskRow[] = proposals.map((p) => {
    const awaitingDecision = p.status === "SENT" || p.status === "VIEWED";
    return {
      id: p.id,
      title: p.title,
      status: p.status as DeskStatus,
      total: p.total,
      viewCount: p.viewCount,
      clientName: p.client?.name ?? "Unassigned",
      clientPlace: p.client?.city
        ? `${p.client.city}${p.client.state ? `, ${p.client.state}` : ""}`
        : null,
      ownerName: p.owner?.name ?? null,
      updatedAtMs: p.updatedAt.getTime(),
      updatedLabel: dateFmt.format(p.updatedAt).toUpperCase(),
      waitDays:
        awaitingDecision && p.sentAt
          ? Math.max(0, Math.floor((now.getTime() - p.sentAt.getTime()) / DAY_MS))
          : null,
      leftDays: p.validUntil
        ? Math.floor((p.validUntil.getTime() - now.getTime()) / DAY_MS)
        : null,
    };
  });

  return (
    <ProposalsDesk
      rows={rows}
      won30={won30Agg._sum.total ?? 0}
      userName={userName}
      roleLabel={roleLabel}
      dateLabel={dateFmt.format(now)}
    />
  );
}
