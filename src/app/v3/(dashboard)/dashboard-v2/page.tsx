// Dashboard v2 — "THE OPERATIONS SHEET"
// Blueprint / drafting-table brutalism ported from the landing reference
// (jobflex-landing-full.html). Standalone v3 experiment page: owns the full
// viewport, brings its own cell-grid nav, and renders live org data as an
// engineering drawing of the business. Zero client JS — all motion is CSS.

import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { requireOrg, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { money, shortDate, longDate, relative } from "@/lib/format";
import styles from "./v2.module.css";
import { FluidScale } from "@/components/v3/fluid-scale";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Operations Sheet · Dashboard v2 — JobFlex",
  description: "Blueprint-edition dashboard: revenue, pipeline, and the next moves on one sheet.",
};

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-inter",
  display: "swap",
});

const ACTIVE_PIPELINE = { notIn: ["DECLINED", "ARCHIVED", "EXPIRED"] };

const PIPE_COLUMNS = [
  { key: "NEW", label: "New" },
  { key: "ROUTED", label: "Routed" },
  { key: "CLAIMED", label: "Claimed" },
  { key: "CONTACTED", label: "Contacted" },
  { key: "QUOTED", label: "Quoted" },
  { key: "WON", label: "Won" },
  { key: "LOST", label: "Lost" },
] as const;

const EV_FILLS = [styles.evInk, styles.evBp, styles.evSky, styles.evPaper];

export default async function DashboardV2Page() {
  let organizationId: string;
  let userName: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
    userName = ctx.user.name ?? ctx.user.email ?? "Operator";
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(now.getDate() - 60);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  // Current week, Sunday 00:00 → next Sunday 00:00 (calendar convention).
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const [
    org,
    proposals,
    recentLeads,
    leadGroups,
    paymentsLast30,
    prevRevenueAgg,
    pipelineAgg,
    activeProposalCount,
    openProposals,
    acceptedProposals,
    newLeads7,
    newLeadsTotal,
    unviewedProposals,
    viewedProposals,
    activities,
    jobEvents,
    weekEvents,
  ] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    db.proposal.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      take: 7,
      include: { client: { select: { name: true } } },
    }),
    db.lead.findMany({
      where: { organizationId, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, name: true, status: true },
    }),
    db.lead.groupBy({
      by: ["status"],
      where: { organizationId, status: { not: "ARCHIVED" } },
      _count: { _all: true },
    }),
    db.payment.findMany({
      where: { organizationId, status: "PAID", paidAt: { gte: thirtyDaysAgo } },
      orderBy: { paidAt: "desc" },
      select: { amount: true, paidAt: true },
    }),
    db.payment.aggregate({
      where: { organizationId, status: "PAID", paidAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      _sum: { amount: true },
    }),
    db.proposal.aggregate({
      where: { organizationId, status: ACTIVE_PIPELINE },
      _sum: { total: true },
    }),
    db.proposal.count({ where: { organizationId, status: ACTIVE_PIPELINE } }),
    db.proposal.count({ where: { organizationId, status: { in: ["DRAFT", "SENT", "VIEWED"] } } }),
    db.proposal.count({ where: { organizationId, status: { in: ["ACCEPTED", "PAID"] } } }),
    db.lead.count({ where: { organizationId, createdAt: { gte: sevenDaysAgo } } }),
    db.lead.count({ where: { organizationId, status: "NEW" } }),
    db.proposal.count({ where: { organizationId, status: "SENT", viewCount: 0 } }),
    db.proposal.count({ where: { organizationId, status: "VIEWED" } }),
    db.activityEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, kind: true, summary: true, createdAt: true },
    }),
    db.jobEvent.findMany({
      where: { organizationId, startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 4,
      select: { id: true, title: true, startsAt: true, notes: true },
    }),
    db.jobEvent.findMany({
      where: { organizationId, startsAt: { gte: weekStart, lt: weekEnd } },
      orderBy: { startsAt: "asc" },
      select: { id: true, title: true, startsAt: true },
    }),
  ]);

  const orgName = org?.name ?? "Your Company";
  const totalRevenue = paymentsLast30.reduce((acc, p) => acc + p.amount, 0);
  const prevRevenue = prevRevenueAgg._sum.amount ?? 0;
  const pipelineValue = pipelineAgg._sum.total ?? 0;

  const deltaPct =
    prevRevenue > 0 ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100) : null;

  const attention = newLeadsTotal + unviewedProposals + viewedProposals;

  // 30-day revenue bars.
  const spark = buildSparkline(paymentsLast30);
  const sparkMax = Math.max(...spark.map((d) => d.revenue));
  const maxIdx = sparkMax > 0 ? spark.findIndex((d) => d.revenue === sparkMax) : -1;

  // Which weekdays hold at least one event (for the day-strip dots).
  const dayHasEvent = new Array<boolean>(7).fill(false);
  for (const ev of weekEvents) {
    const idx = Math.floor((ev.startsAt.getTime() - weekStart.getTime()) / 86400000);
    if (idx >= 0 && idx < 7) dayHasEvent[idx] = true;
  }

  const pipeCounts = new Map(leadGroups.map((g) => [g.status, g._count._all]));
  const leadsByStatus = new Map<string, string[]>();
  for (const l of recentLeads) {
    const bucket = leadsByStatus.get(l.status) ?? [];
    if (bucket.length < 2) {
      bucket.push(l.name);
      leadsByStatus.set(l.status, bucket);
    }
  }

  const nextJob = jobEvents[0] ?? null;
  const tickerFacts = [
    { label: "Revenue 30d", value: money(totalRevenue) },
    { label: "Pipeline", value: money(pipelineValue) },
    { label: "Open proposals", value: String(openProposals) },
    { label: "Accepted", value: String(acceptedProposals) },
    { label: "New leads 7d", value: String(newLeads7) },
    { label: "Unopened", value: String(unviewedProposals) },
    nextJob
      ? { label: "Next on site", value: `${nextJob.title} · ${shortDate(nextJob.startsAt)}` }
      : { label: "Calendar", value: "Clear" },
    { label: "Sheet 01", value: "Live" },
  ];

  return (
    <div className={`${inter.variable} ${styles.sheet}`}>
      <FluidScale />
      {/* ── NAV — cell grid ─────────────────────────────────────────── */}
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
        <Link href={"/dashboard/proposals" as Route} className={`${styles.navCell} ${styles.navMid}`}>
          Proposals
        </Link>
        <Link href={"/dashboard/leads" as Route} className={`${styles.navCell} ${styles.navMid}`}>
          Leads
        </Link>
        <Link href={"/dashboard/jobs" as Route} className={`${styles.navCell} ${styles.navMid}`}>
          Jobs
        </Link>
        <Link href={"/dashboard/calendar" as Route} className={`${styles.navCell} ${styles.navMid}`}>
          Schedule
        </Link>
        <Link href={"/dashboard" as Route} className={styles.navGhost}>
          Classic
        </Link>
        <Link href={"/dashboard/proposals/new" as Route} className={styles.navCta}>
          + New Proposal
        </Link>
      </nav>

      {/* ── HERO — greeting + drafting title block ──────────────────── */}
      <header className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.gridLight} aria-hidden />
          <span className={`${styles.coord} ${styles.coordTR}`} aria-hidden>
            A·01
          </span>
          <div className={styles.heroInner}>
            <span className={`${styles.kicker} ${styles.rv} ${styles.d1}`}>
              <span className={styles.kickerDot} aria-hidden />
              Operations Sheet · {shortDate(now)} · Live
            </span>
            <h1 className={`${styles.title} ${styles.rv} ${styles.d2}`}>
              Good <span className={styles.titleInv}>{greeting()}.</span>
            </h1>
            <div className={`${styles.titleRow2} ${styles.rv} ${styles.d3}`}>
              {attention > 0 ? (
                <>
                  <span className={styles.titleNum}>{attention}</span>
                  <span>need you</span>
                </>
              ) : (
                <>
                  <span className={`${styles.titleNum} ${styles.titleNumZero}`}>00</span>
                  <span>all clear</span>
                </>
              )}
            </div>
            <p className={`${styles.tagline} ${styles.rv} ${styles.d4}`}>
              <strong>{plural(newLeadsTotal, "new lead")}</strong> to triage,{" "}
              <strong>{plural(unviewedProposals, "unopened proposal")}</strong> and{" "}
              <strong>{viewedProposals} awaiting a decision</strong> — the board is live for{" "}
              {orgName}.
            </p>
            <div className={`${styles.ctaRow} ${styles.rv} ${styles.d5}`}>
              <Link href={"/dashboard/advanced-ai" as Route} className={styles.ctaPrimary}>
                Draft with AI <span aria-hidden>→</span>
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
            REF · OPS-SHEET-01
          </span>
          <div className={`${styles.heroRightInner} ${styles.rv} ${styles.d3}`}>
            <div className={styles.panelLabel}>
              <span className={styles.panelLabelLine} aria-hidden />
              Title Block
            </div>
            <div className={styles.titleBlock}>
              <div className={styles.tbHead}>
                <span>
                  Operations <em>Sheet</em>
                </span>
                <span className={styles.tbHeadDot} aria-hidden />
              </div>
              <div className={styles.tbRow}>
                <span className={styles.tbLabel}>Company</span>
                <span className={styles.tbValue}>{orgName}</span>
              </div>
              <div className={styles.tbRow}>
                <span className={styles.tbLabel}>Drawn by</span>
                <span className={styles.tbValue}>{userName}</span>
              </div>
              <div className={styles.tbRow}>
                <span className={styles.tbLabel}>Date</span>
                <span className={styles.tbValue}>{longDate(now)}</span>
              </div>
              <div className={styles.tbRow}>
                <span className={styles.tbLabel}>Sheet</span>
                <span className={styles.tbValue}>
                  01 — Overview · <em>Rev V2</em>
                </span>
              </div>
              <div className={styles.tbLegend}>
                <span className={styles.tbLegendCell}>
                  Scale <strong>1 : 1</strong>
                </span>
                <span className={styles.tbLegendCell}>
                  Units <strong>USD</strong>
                </span>
                <span className={styles.tbLegendCell}>
                  Status <strong>Live</strong>
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
      <section className={styles.statBand} aria-label="Key numbers">
        <div className={`${styles.statCell} ${styles.rv} ${styles.d2}`}>
          <div className={styles.statLabel}>Revenue · 30 days</div>
          <div className={`${styles.statValue} ${styles.statBlue}`}>{money(totalRevenue)}</div>
          <div className={styles.statSub}>
            {deltaPct !== null ? (
              <>
                <span
                  className={`${styles.statDelta} ${deltaPct >= 0 ? styles.deltaUp : styles.deltaDown}`}
                >
                  {deltaPct >= 0 ? "+" : ""}
                  {deltaPct}%
                </span>{" "}
                vs prior 30 days
              </>
            ) : (
              "Collected across all providers"
            )}
          </div>
        </div>
        <div className={`${styles.statCell} ${styles.statCellInk} ${styles.rv} ${styles.d3}`}>
          <div className={styles.statLabel}>Pipeline value</div>
          <div className={`${styles.statValue} ${styles.statSky}`}>{money(pipelineValue)}</div>
          <div className={styles.statSub}>{plural(activeProposalCount, "active proposal")}</div>
        </div>
        <div className={`${styles.statCell} ${styles.rv} ${styles.d4}`}>
          <div className={styles.statLabel}>Open proposals</div>
          <div className={styles.statValue}>{openProposals}</div>
          <div className={styles.statSub}>
            {acceptedProposals > 0 ? (
              <>
                <span className={`${styles.statDelta} ${styles.deltaUp}`}>
                  {acceptedProposals} won
                </span>{" "}
                and counting
              </>
            ) : (
              "Draft · sent · viewed"
            )}
          </div>
        </div>
        <div className={`${styles.statCell} ${styles.rv} ${styles.d5}`}>
          <div className={styles.statLabel}>New leads · 7 days</div>
          <div className={styles.statValue}>{newLeads7}</div>
          <div className={styles.statSub}>AI-categorized, ready to triage</div>
        </div>
      </section>

      {/* ── TICKER ───────────────────────────────────────────────────── */}
      <div className={styles.ticker} aria-label="Live company facts">
        <div className={styles.tickerTrack}>
          <div className={styles.tickerSeq}>
            {tickerFacts.map((f) => (
              <span key={f.label} className={styles.pill}>
                <span className={styles.pillIco} aria-hidden />
                {f.label} · <strong>{f.value}</strong>
              </span>
            ))}
          </div>
          <div className={styles.tickerSeq} aria-hidden>
            {tickerFacts.map((f) => (
              <span key={f.label} className={styles.pill}>
                <span className={styles.pillIco} aria-hidden />
                {f.label} · <strong>{f.value}</strong>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── WORK ZONE — revenue trace + week schedule ────────────────── */}
      <section className={styles.workZone} aria-label="Money and schedule">
        <div className={`${styles.zoneCol} ${styles.revField}`}>
          <div className={styles.gridDark} aria-hidden />
          <div className={`${styles.revInner} ${styles.rv} ${styles.d3}`}>
            <div className={styles.revCard}>
              <div className={styles.revHead}>
                <span>Cash Collected · 30 Day Trace</span>
                <span className={styles.revHeadRight}>
                  <span className={styles.ledgerDot} aria-hidden />
                  Live
                </span>
              </div>
              <div className={styles.revBody}>
                <div className={styles.revAmtLabel}>
                  <span>Total received</span>
                  <span className={styles.revTag}>Paid</span>
                </div>
                <div className={styles.revAmt}>{money(totalRevenue)}</div>
                <div
                  className={styles.bars}
                  role="img"
                  aria-label={`Daily revenue for the last 30 days, totaling ${money(totalRevenue)}`}
                >
                  {spark.map((d, i) => (
                    <span
                      key={d.iso}
                      className={`${styles.bar} ${i === maxIdx ? styles.barMax : ""}`}
                      style={{
                        height: `${sparkMax > 0 ? Math.max(4, Math.round((d.revenue / sparkMax) * 100)) : 4}%`,
                        animationDelay: `${0.4 + i * 0.022}s`,
                      }}
                    />
                  ))}
                  {sparkMax === 0 && <span className={styles.barsEmpty}>No payments · last 30 days</span>}
                </div>
                <div className={styles.revMeta}>
                  <span>{shortDate(thirtyDaysAgo)} — {shortDate(now)}</span>
                  <span>Prior 30d · {money(prevRevenue)}</span>
                </div>
              </div>
              <div className={styles.txs}>
                {paymentsLast30.slice(0, 3).map((p, i) => (
                  <div key={`${p.paidAt?.toISOString() ?? "x"}-${i}`} className={styles.tx}>
                    <span className={styles.txDot} aria-hidden />
                    <span>Payment received</span>
                    <span className={styles.txDate}>{shortDate(p.paidAt)}</span>
                    <strong>{money(p.amount)}</strong>
                  </div>
                ))}
                {paymentsLast30.length === 0 && (
                  <div className={styles.txEmpty}>No transactions on record — yet</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className={`${styles.zoneCol} ${styles.schedField}`}>
          <div className={styles.gridLight} aria-hidden />
          <div className={`${styles.schedCard} ${styles.rv} ${styles.d4}`}>
            <div className={styles.schedHead}>
              <span>Week of {shortDate(weekStart)}</span>
              <span className={styles.schedLive}>{weekEvents.length} booked</span>
            </div>
            <div className={styles.schedBody}>
              <div className={styles.days}>
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                  <span
                    key={i}
                    className={`${styles.day} ${i === now.getDay() ? styles.dayToday : ""}`}
                  >
                    {d}
                    {dayHasEvent[i] && <span className={styles.dayDot} aria-hidden />}
                  </span>
                ))}
              </div>
              {weekEvents.length > 0 ? (
                <div className={styles.evBars}>
                  {weekEvents.slice(0, 5).map((ev, i) => (
                    <div
                      key={ev.id}
                      className={`${styles.evBar} ${EV_FILLS[i % EV_FILLS.length]}`}
                      style={{ animationDelay: `${0.5 + i * 0.12}s` }}
                    >
                      <span>{ev.title}</span>
                      <em>{weekday(ev.startsAt)}</em>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.evEmpty}>Clear week — nothing booked</div>
              )}
              <div className={styles.schedFoot}>
                <Link href={"/dashboard/calendar" as Route}>Open calendar →</Link>
                <span>
                  {weekEvents.length > 5 ? `+${weekEvents.length - 5} more · ` : ""}
                  {plural(weekEvents.length, "event")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PIPELINE BOARD — dark section ────────────────────────────── */}
      <section className={styles.pipeSec} aria-label="Lead pipeline">
        <div className={styles.gridDark} aria-hidden />
        <div className={styles.gridDarkLg} aria-hidden />
        <span
          className={`${styles.coord} ${styles.coordTR} ${styles.coordLight}`}
          aria-hidden
        >
          B·02
        </span>
        <div className={styles.ct}>
          <div className={styles.pipeHead}>
            <div>
              <span className={styles.kickerSky}>
                <span className={styles.kickerSkyDot} aria-hidden />
                Lead Pipeline
              </span>
              <h2 className={styles.pipeH2}>
                Work in <em>motion</em>
              </h2>
            </div>
            <p className={styles.pipeSub}>
              <span className={styles.pipeSubNum}>Status</span>
              Every lead on the board, from first contact to signed work. Counts are live across
              the whole company.
            </p>
          </div>

          <div className={styles.board}>
            {PIPE_COLUMNS.map((col) => {
              const count = pipeCounts.get(col.key) ?? 0;
              const names = leadsByStatus.get(col.key) ?? [];
              return (
                <div key={col.key} className={styles.boardCell}>
                  <div
                    className={`${styles.boardCount} ${
                      count === 0
                        ? styles.boardCountZero
                        : col.key === "NEW"
                          ? styles.boardCountHot
                          : col.key === "WON"
                            ? styles.boardCountWon
                            : ""
                    }`}
                  >
                    {String(count).padStart(2, "0")}
                  </div>
                  <div className={styles.boardLabel}>{col.label}</div>
                  <div className={styles.boardLeads}>
                    {names.length > 0 ? (
                      names.map((n, i) => (
                        <span key={i} className={styles.boardLead}>
                          {n}
                        </span>
                      ))
                    ) : (
                      <span className={styles.boardNone}>—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Link href={"/dashboard/leads" as Route} className={styles.punch}>
            {newLeadsTotal > 0 ? (
              <>
                <span className={styles.punchL}>Waiting in the inbox</span>
                <span className={styles.punchArrow} aria-hidden>
                  →
                </span>
                <span className={styles.punchR}>
                  {plural(newLeadsTotal, "new lead")} to triage
                </span>
                <span className={styles.punchTag}>Open lead center</span>
              </>
            ) : (
              <>
                <span className={styles.punchL}>Inbox clear</span>
                <span className={styles.punchArrow} aria-hidden>
                  →
                </span>
                <span className={styles.punchR}>Pipeline is all yours</span>
                <span className={styles.punchTag}>Open lead center</span>
              </>
            )}
          </Link>
        </div>
      </section>

      {/* ── LEDGER ZONE — proposals + site log + next on site ────────── */}
      <section className={styles.ledgerZone} aria-label="Proposals and activity">
        <div className={styles.gridLight} aria-hidden />
        <span className={`${styles.coord} ${styles.coordTR}`} aria-hidden>
          C·03
        </span>
        <div className={styles.ledgerGrid}>
          <div>
            <span className={styles.zoneKicker}>
              <span className={styles.kickerDot} aria-hidden />
              Proposal Ledger
            </span>
            <div className={styles.ledger}>
              <div className={styles.ledgerHead}>
                <span>
                  Latest <em>Proposals</em>
                </span>
                <span>
                  <span className={styles.ledgerDot} aria-hidden />
                  Live
                </span>
              </div>
              {proposals.length > 0 ? (
                <div className={styles.ledgerRows}>
                  {proposals.map((p, i) => (
                    <Link
                      key={p.id}
                      href={`/dashboard/proposals/${p.id}` as Route}
                      className={styles.ledgerRow}
                    >
                      <span className={styles.ledgerNum}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className={styles.ledgerName}>
                        <strong>{p.title}</strong>
                        <span>
                          {p.client?.name ?? "Unassigned"} · {shortDate(p.updatedAt)}
                        </span>
                      </span>
                      <span className={`${styles.chip} ${chipClass(p.status)}`}>{p.status}</span>
                      <span className={styles.ledgerPrice}>{money(p.total)}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className={styles.ledgerEmpty}>
                  <div className={styles.ledgerEmptyBox}>
                    No proposals on file —{" "}
                    <Link href={"/dashboard/proposals/new" as Route}>draft no. 001 →</Link>
                  </div>
                </div>
              )}
              <div className={styles.ledgerTotal}>
                <span className={styles.ledgerTotalLbl}>Open pipeline</span>
                <span className={styles.ledgerTotalVal}>{money(pipelineValue)}</span>
              </div>
              <div className={styles.ledgerFoot}>
                <Link href={"/dashboard/proposals" as Route}>View full ledger →</Link>
                <span className={styles.stampInk}>Tracked</span>
              </div>
            </div>
          </div>

          <div className={styles.sideStack}>
            <div>
              <span className={styles.zoneKicker}>
                <span className={styles.kickerDot} aria-hidden />
                Site Log
              </span>
              <div className={styles.logCard}>
                <div className={styles.logHead}>
                  <span>Recent activity</span>
                  <span>Last {activities.length || 0}</span>
                </div>
                {activities.length > 0 ? (
                  <div className={styles.logRows}>
                    {activities.map((a, i) => (
                      <div key={a.id} className={styles.logRow}>
                        <span className={styles.logNum}>{String(i + 1).padStart(2, "0")}</span>
                        <span className={styles.logTxt}>{a.summary}</span>
                        <span className={styles.logTime}>{relative(a.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.logEmpty}>Quiet out there</div>
                )}
              </div>
            </div>

            <div>
              <span className={styles.zoneKicker}>
                <span className={styles.kickerDot} aria-hidden />
                Next On Site
              </span>
              <div className={styles.jobsCard}>
                <div className={styles.jobsHead}>
                  <span>Upcoming jobs</span>
                  <span>{jobEvents.length} scheduled</span>
                </div>
                <div className={styles.jobRows}>
                  {jobEvents.length > 0 ? (
                    jobEvents.map((j) => (
                      <div key={j.id} className={styles.jobRow}>
                        <span className={styles.jobDate} aria-hidden>
                          <em>{monthShort(j.startsAt)}</em>
                          <strong>{j.startsAt.getDate()}</strong>
                        </span>
                        <span className={styles.jobInfo}>
                          <strong>{j.title}</strong>
                          <span>
                            {longDate(j.startsAt)} — {j.notes ?? "scheduled"}
                          </span>
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className={styles.jobsEmpty}>Calendar clear — book the next install</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER STRIP ─────────────────────────────────────────────── */}
      <footer className={styles.foot}>
        <span className={styles.footLeft}>
          JobFlex · Operations Sheet <em>01</em> · Generated {longDate(now)}
        </span>
        <span className={styles.footRight}>
          <Link href={"/dashboard" as Route} className={styles.footLink}>
            Back to classic →
          </Link>
          <span className={styles.stampSky}>V2 · Blueprint Edition</span>
        </span>
      </footer>
    </div>
  );
}

/* ── helpers ──────────────────────────────────────────────────────── */

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function weekday(d: Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(d).toUpperCase();
}

function monthShort(d: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(d).toUpperCase();
}

function chipClass(status: string) {
  if (status === "ACCEPTED" || status === "PAID") return styles.chipWon;
  if (status === "SENT" || status === "VIEWED") return styles.chipSent;
  if (status === "DECLINED" || status === "EXPIRED" || status === "ARCHIVED")
    return styles.chipDead;
  return styles.chipDraft;
}

function buildSparkline(payments: { amount: number; paidAt: Date | null }[]) {
  const days: { revenue: number; iso: string }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    const sum = payments
      .filter((p) => p.paidAt && p.paidAt.toISOString().slice(0, 10) === key)
      .reduce((acc, p) => acc + p.amount, 0);
    days.push({ revenue: sum, iso: key });
  }
  return days;
}
