// Proposals v3 — "THE PROPOSAL LEDGER" (Sheet 02, Blueprint edition).
// jobflex-page-styler port in the dashboard-v2 family: server component,
// live org data, zero client JS — all motion is CSS. The live page at
// /dashboard/proposals stays untouched; filters run through ?status=
// searchParams so every view is a shareable URL.
//
// Auth: middleware only matches /dashboard and /admin, so this page enforces
// its own redirect-to-login (same pattern as /v3/proposals-c). Reads are
// org-wide like the other v3 experiments — no role scoping here.

import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { money, shortDate, longDate } from "@/lib/format";
import { V3_PORTED_ROUTES } from "@/lib/v3/routes";
import { ProposalsLedger, isFilterKey, type FilterKey, type LedgerRow } from "./ledger";
import styles from "./proposals.module.css";
import { FluidScale } from "@/components/v3/fluid-scale";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Proposal Ledger · Proposals v3 — JobFlex",
  description:
    "Blueprint-edition proposals: every quote on one sheet — status, views, and totals, live.",
};

export default async function ProposalsBlueprintPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/login?next=${encodeURIComponent(V3_PORTED_ROUTES.proposalsBlueprint)}`);
  }

  const { organizationId, user } = await requireOrg();
  const userName = user.name ?? user.email ?? "Operator";

  const sp = await searchParams;
  const rawStatus = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const active: FilterKey = isFilterKey(rawStatus) ? rawStatus : "ALL";

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const [org, groups, accepted30, proposals] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    db.proposal.groupBy({
      by: ["status"],
      where: { organizationId, status: { not: "ARCHIVED" } },
      _count: { _all: true },
      _sum: { total: true },
    }),
    db.proposal.aggregate({
      where: { organizationId, acceptedAt: { gte: thirtyDaysAgo } },
      _count: { _all: true },
      _sum: { total: true },
    }),
    db.proposal.findMany({
      where: {
        organizationId,
        status: active === "ALL" ? { not: "ARCHIVED" } : active,
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        total: true,
        updatedAt: true,
        viewCount: true,
        client: { select: { name: true, city: true, state: true } },
        owner: { select: { name: true } },
      },
    }),
  ]);

  const orgName = org?.name ?? "Your Company";

  const countOf = new Map(groups.map((g) => [g.status, g._count._all]));
  const sumOf = new Map(groups.map((g) => [g.status, g._sum.total ?? 0]));
  const at = (s: string) => countOf.get(s) ?? 0;
  const sum = (s: string) => sumOf.get(s) ?? 0;

  const totalCount = groups.reduce((acc, g) => acc + g._count._all, 0);
  const openCount = at("DRAFT") + at("SENT") + at("VIEWED");
  const openValue = sum("DRAFT") + sum("SENT") + sum("VIEWED");
  const awaiting = at("SENT") + at("VIEWED");
  const wins = at("ACCEPTED") + at("PAID");
  const losses = at("DECLINED") + at("EXPIRED");
  const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : null;
  const accepted30Count = accepted30._count._all;
  const accepted30Sum = accepted30._sum.total ?? 0;

  const rows: LedgerRow[] = proposals.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    total: p.total,
    updatedAt: p.updatedAt,
    viewCount: p.viewCount,
    clientName: p.client?.name ?? "Unassigned",
    clientPlace: p.client?.city
      ? `${p.client.city}${p.client.state ? `, ${p.client.state}` : ""}`
      : null,
    ownerName: p.owner?.name ?? null,
  }));

  return (
    <div className={styles.sheet}>
      <FluidScale />
      {/* ── NAV — cell grid (family shell) ──────────────────────────── */}
      <nav className={styles.nav} aria-label="Operations">
        <div className={styles.navBrand}>
          <span className={styles.navLogo} aria-hidden>
            <span className={styles.navMark} />
          </span>
          <span className={styles.navBrandTxt}>
            JobFlex <em>OPS</em>
          </span>
        </div>
        <div className={styles.navSpacer} />
        <Link
          href={"/v3/dashboard-v2" as Route}
          className={`${styles.navCell} ${styles.navMid}`}
        >
          Overview
        </Link>
        <Link href={"/dashboard/leads" as Route} className={`${styles.navCell} ${styles.navMid}`}>
          Leads
        </Link>
        <Link href={"/dashboard/jobs" as Route} className={`${styles.navCell} ${styles.navMid}`}>
          Jobs
        </Link>
        <Link
          href={"/dashboard/calendar" as Route}
          className={`${styles.navCell} ${styles.navMid}`}
        >
          Schedule
        </Link>
        <Link href={"/dashboard/proposals" as Route} className={styles.navGhost}>
          Classic
        </Link>
        <Link href={"/dashboard/proposals/new" as Route} className={styles.navCta}>
          + New Estimate
        </Link>
      </nav>

      {/* ── HERO — page head + drafting title block ─────────────────── */}
      <header className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.gridLight} aria-hidden />
          <span className={`${styles.coord} ${styles.coordTR}`} aria-hidden>
            A·02
          </span>
          <div className={styles.heroInner}>
            <span className={`${styles.kicker} ${styles.rv} ${styles.d1}`}>
              <span className={styles.kickerDot} aria-hidden />
              Proposal Ledger · {shortDate(now)} · Live
            </span>
            <h1 className={`${styles.title} ${styles.rv} ${styles.d2}`}>
              Proposal <span className={styles.titleInv}>Ledger.</span>
            </h1>
            <div className={`${styles.titleRow2} ${styles.rv} ${styles.d3}`}>
              {openCount > 0 ? (
                <>
                  <span className={styles.titleNum}>{String(openCount).padStart(2, "0")}</span>
                  <span>in flight</span>
                </>
              ) : (
                <>
                  <span className={`${styles.titleNum} ${styles.titleNumZero}`}>00</span>
                  <span>all settled</span>
                </>
              )}
            </div>
            <p className={`${styles.tagline} ${styles.rv} ${styles.d4}`}>
              <strong>{awaiting} awaiting a decision</strong>,{" "}
              <strong>{money(openValue)} open</strong> and {accepted30Count} accepted in the
              last 30 days — the ledger is live for {orgName}.
            </p>
            <div className={`${styles.ctaRow} ${styles.rv} ${styles.d5}`}>
              <Link href={"/dashboard/proposals/ai" as Route} className={styles.ctaPrimary}>
                Smart Proposal <span aria-hidden>→</span>
              </Link>
              <Link href={"/dashboard/proposals/new" as Route} className={styles.ctaGhost}>
                Manual proposal
              </Link>
            </div>
          </div>
        </div>

        <div className={styles.heroRight}>
          <div className={styles.gridDark} aria-hidden />
          <div className={styles.gridDarkLg} aria-hidden />
          <span className={`${styles.coord} ${styles.coordBL} ${styles.coordLight}`} aria-hidden>
            REF · LEDGER-02
          </span>
          <div className={`${styles.heroRightInner} ${styles.rv} ${styles.d3}`}>
            <div className={styles.panelLabel}>
              <span className={styles.panelLabelLine} aria-hidden />
              Title Block
            </div>
            <div className={styles.titleBlock}>
              <div className={styles.tbHead}>
                <span>
                  Proposal <em>Ledger</em>
                </span>
                <span className={styles.tbHeadDot} aria-hidden />
              </div>
              <div className={styles.tbRow}>
                <span className={styles.tbLabel}>Company</span>
                <span className={styles.tbValue}>{orgName}</span>
              </div>
              <div className={styles.tbRow}>
                <span className={styles.tbLabel}>Prepared by</span>
                <span className={styles.tbValue}>{userName}</span>
              </div>
              <div className={styles.tbRow}>
                <span className={styles.tbLabel}>Date</span>
                <span className={styles.tbValue}>{longDate(now)}</span>
              </div>
              <div className={styles.tbRow}>
                <span className={styles.tbLabel}>Sheet</span>
                <span className={styles.tbValue}>
                  02 — Proposals · <em>Rev V3</em>
                </span>
              </div>
              <div className={styles.tbLegend}>
                <span className={styles.tbLegendCell}>
                  Open <strong>{money(openValue)}</strong>
                </span>
                <span className={styles.tbLegendCell}>
                  Won 30d <strong>{money(accepted30Sum)}</strong>
                </span>
                <span className={styles.tbLegendCell}>
                  Win rate <strong>{winRate !== null ? `${winRate}%` : "—"}</strong>
                </span>
              </div>
              <div className={styles.tbFoot}>
                <span className={styles.tbFootLeft}>
                  <span className={styles.tbCheck} aria-hidden>
                    ✓
                  </span>
                  Approved for work
                </span>
                <span className={styles.stamp}>Blueprint</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── STAT BAND ────────────────────────────────────────────────── */}
      <section className={styles.statBand} aria-label="Proposal numbers">
        <div className={`${styles.statCell} ${styles.rv} ${styles.d2}`}>
          <div className={styles.statLabel}>Open pipeline</div>
          <div className={`${styles.statValue} ${styles.statBlue}`}>{money(openValue)}</div>
          <div className={styles.statSub}>
            {openCount} in flight — draft · sent · viewed
          </div>
        </div>
        <div className={`${styles.statCell} ${styles.statCellInk} ${styles.rv} ${styles.d3}`}>
          <div className={styles.statLabel}>Awaiting decision</div>
          <div className={`${styles.statValue} ${styles.statSky}`}>{awaiting}</div>
          <div className={styles.statSub}>Sent and viewed, unanswered</div>
        </div>
        <div className={`${styles.statCell} ${styles.rv} ${styles.d4}`}>
          <div className={styles.statLabel}>Accepted · 30 days</div>
          <div className={styles.statValue}>{accepted30Count}</div>
          <div className={styles.statSub}>
            {accepted30Sum > 0 ? (
              <>
                <span className={`${styles.statDelta} ${styles.deltaUp}`}>
                  {money(accepted30Sum)}
                </span>{" "}
                signed
              </>
            ) : (
              "Nothing signed yet this month"
            )}
          </div>
        </div>
        <div className={`${styles.statCell} ${styles.rv} ${styles.d5}`}>
          <div className={styles.statLabel}>Win rate · all time</div>
          <div className={styles.statValue}>{winRate !== null ? `${winRate}%` : "—"}</div>
          <div className={styles.statSub}>
            {wins} won · {losses} lost
          </div>
        </div>
      </section>

      {/* ── LEDGER ZONE — filters + sheet rows ───────────────────────── */}
      <section className={styles.ledgerZone} aria-label="Proposal ledger">
        <div className={styles.gridLight} aria-hidden />
        <span className={`${styles.coord} ${styles.coordTR}`} aria-hidden>
          B·02
        </span>
        <div className={styles.ledgerWrap}>
          <span className={styles.zoneKicker}>
            <span className={styles.kickerDotSm} aria-hidden />
            Sheet Rows
          </span>
          <ProposalsLedger rows={rows} counts={countOf} totalCount={totalCount} active={active} />
        </div>
      </section>

      {/* ── FOOTER STRIP ─────────────────────────────────────────────── */}
      <footer className={styles.foot}>
        <span className={styles.footLeft}>
          JobFlex · Proposal Ledger <em>02</em> · Generated {longDate(now)}
        </span>
        <span className={styles.footRight}>
          <Link href={"/dashboard/proposals" as Route} className={styles.footLink}>
            Back to classic →
          </Link>
          <span className={styles.stampSky}>V3 · Blueprint Edition</span>
        </span>
      </footer>
    </div>
  );
}
