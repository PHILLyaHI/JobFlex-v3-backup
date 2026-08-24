"use client";

// ADMIN LEAD CENTER — BLUEPRINT
// /admin/lead-center
//
// The platform's routing desk: every homeowner request (PlatformLead) with its
// 24h offer cascade, the shops it could go to and why, and the escape hatch
// for the manual queue. Everything here is read from the database by the
// server page; the only writes are the two existing admin actions
// (manualAssignPlatformLead / requeuePlatformLead). The page is a server
// component, so `router.refresh()` is the update.
//
// The site plan is a schematic, not a tile map: real lead coordinates are
// projected into the frame's bounding box server-side and drawn as the
// system's square pins. Leads without a geocode are counted, not plotted.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toast";
import { relative, shortDate } from "@/lib/format";
import { manualAssignPlatformLead, requeuePlatformLead } from "@/actions/adminLeadCenter";
import {
  Chip,
  Empty,
  Ic,
  Sheet,
  type Tone,
  actionError,
  cx,
  useMdl,
  useReveal,
} from "@/components/v3/admin-influencers/admin-ui";
import ui from "@/components/v3/admin-influencers/admin-ui.module.css";
import styles from "./lead-center.module.css";

/* ============================================================
   DTOs — shaped by the server page
   ============================================================ */

/** One scoring-snapshot entry (matching.ts Candidate, parsed from rankingJson). */
export interface RankEntry {
  orgId: string;
  orgName: string;
  score: number;
  distanceMi: number | null;
  distanceScore: number;
  ratingScore: number;
  respScore: number;
  fallback: boolean;
}

export interface OfferDTO {
  id: string;
  orgName: string;
  attempt: number;
  status: string;
  score: number;
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
}

export interface PlatformLeadDTO {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  projectType: string | null;
  description: string | null;
  detectedTrade: string | null;
  aiConfidence: number | null;
  geocoded: boolean;
  status: string; // MATCHING | OFFERED | MATCHED | MANUAL_QUEUE
  attemptCount: number;
  queueReason: string | null; // NO_CANDIDATES | EXHAUSTED
  matchedOrgName: string | null;
  matchedAt: string | null;
  manuallyAssigned: boolean;
  createdAt: string;
  ranking: RankEntry[];
  offers: OfferDTO[];
  activeOffer: { orgName: string; attempt: number; expiresAt: string; score: number } | null;
}

export interface OrgPickDTO {
  id: string;
  name: string;
  trades: string[];
  geocoded: boolean;
  offersEnabled: boolean;
}

export interface StatsDTO {
  todayCreated: number;
  todayMatched: number;
  todayByTrade: { trade: string; n: number }[];
  tradeDist: { trade: string; n: number; pct: number }[];
  acceptRatePct: number | null;
  firstOfferPct: number | null;
  medianAcceptMin: number | null;
  routedTotal: number;
  routedDeltaPct: number | null;
  /** 34 days, oldest first. */
  series: { day: string; leads: number; matched: number }[];
  openOffers: number;
  expiringSoon: number;
  queue: number;
  /** Percent coordinates inside the plan frame. */
  mapPoints: { id: string; x: number; y: number; status: string }[];
  mapCities: { name: string; x: number; y: number }[];
  ungeocoded: number;
}

/* ============================================================
   VOCABULARY
   ============================================================ */

const TRADE_ICON: Record<string, string> = {
  Roofing: "roof",
  Fencing: "fence",
  Decking: "fence",
  "General Contractor": "hardhat",
  "Kitchen & Bath": "building",
  Remodeling: "building",
  Flooring: "grid",
  Tile: "grid",
  Landscaping: "target",
  Electrical: "bulb",
  Plumbing: "box",
  HVAC: "box",
  Siding: "building",
  Painting: "pen",
};
function tradeIcon(trade: string | null): string {
  return (trade && TRADE_ICON[trade]) || "target";
}

function shortId(id: string): string {
  return "#LD-" + id.slice(-4).toUpperCase();
}

function pct(n: number | null): string {
  return n == null ? "—" : `${Math.round(n)}`;
}

function statusTone(l: PlatformLeadDTO): { tone: Tone; label: string } {
  switch (l.status) {
    case "OFFERED":
      return { tone: "wait", label: "Offered" };
    case "MATCHING":
      return { tone: "mute", label: "Matching" };
    case "MATCHED":
      return l.manuallyAssigned ? { tone: "bp", label: "Routed" } : { tone: "ok", label: "Accepted" };
    case "MANUAL_QUEUE":
      return { tone: "mute", label: "Queue" };
    default:
      return { tone: "mute", label: l.status };
  }
}

type Tab = "ALL" | "OFFERED" | "MATCHED" | "QUEUE";
const TABS: { key: Tab; label: string; match: (l: PlatformLeadDTO) => boolean }[] = [
  { key: "ALL", label: "All", match: () => true },
  { key: "OFFERED", label: "Offered", match: (l) => l.status === "OFFERED" || l.status === "MATCHING" },
  { key: "MATCHED", label: "Matched", match: (l) => l.status === "MATCHED" },
  { key: "QUEUE", label: "Queue", match: (l) => l.status === "MANUAL_QUEUE" },
];

/** The score the row shows: the live offer's, else the last offer's, else the top candidate's. */
function rowScore(l: PlatformLeadDTO): number | null {
  if (l.activeOffer) return l.activeOffer.score;
  const last = l.offers[l.offers.length - 1];
  if (last) return last.score;
  return l.ranking[0]?.score ?? null;
}

/** Where the lead is headed, for the Location column's second line. */
function destination(l: PlatformLeadDTO): string {
  if (l.activeOffer) return l.activeOffer.orgName;
  if (l.status === "MATCHED") return l.matchedOrgName ?? "—";
  if (l.status === "MANUAL_QUEUE") return "Admin queue";
  return "ranking…";
}

/* ============================================================
   PAGE
   ============================================================ */

type DetailHandle = { open: (lead: PlatformLeadDTO) => void };

export function AdminLeadCenterContent({
  leads,
  orgs,
  stats,
}: {
  leads: PlatformLeadDTO[];
  orgs: OrgPickDTO[];
  stats: StatsDTO;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  useReveal(rootRef);

  const [tab, setTab] = useState<Tab>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bannerGone, setBannerGone] = useState(false);
  const detailRef = useRef<DetailHandle | null>(null);

  const counts = useMemo(() => {
    const c = {} as Record<Tab, number>;
    for (const t of TABS) c[t.key] = leads.filter((l) => t.match(l)).length;
    return c;
  }, [leads]);
  const rows = useMemo(() => {
    const t = TABS.find((x) => x.key === tab) ?? TABS[0];
    return leads.filter((l) => t.match(l));
  }, [leads, tab]);

  const byId = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);

  const openLead = useCallback(
    (id: string) => {
      const l = byId.get(id);
      if (!l) return;
      setSelectedId(id);
      detailRef.current?.open(l);
    },
    [byId],
  );

  const matchable = orgs.filter((o) => o.offersEnabled && o.geocoded && o.trades.length > 0);

  const bannerText = (() => {
    const parts: string[] = [];
    if (stats.expiringSoon > 0)
      parts.push(`${stats.expiringSoon} offer${stats.expiringSoon === 1 ? "" : "s"} expire inside the next 12 hours`);
    if (stats.queue > 0)
      parts.push(`${stats.queue} lead${stats.queue === 1 ? "" : "s"} waiting in the manual queue`);
    return parts.join(" · ");
  })();

  return (
    <div ref={rootRef} className={styles.root}>
      {bannerText && !bannerGone ? (
        <div className={cx(styles.banner, "rv")} role="status">
          <Ic name="clock" />
          <div className={styles.bannerBody}>
            <div className={styles.bannerKicker}>Cascade running</div>
            <div className={styles.bannerTxt}>
              {bannerText}. Unclaimed leads drop to the queue after the third attempt.
            </div>
          </div>
          <button
            type="button"
            className={cx("btn", ui.btnGhost, ui.btnSm)}
            style={{ marginLeft: "auto" }}
            onClick={() => setBannerGone(true)}
            aria-label="Dismiss"
          >
            <Ic name="x" />
          </button>
        </div>
      ) : null}

      <div className="page-head rv">
        <div>
          <div className="kicker">Platform lead routing · 24h cascade · 3 attempts</div>
          <h1 className="page-title">Lead Center</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" type="button" onClick={() => router.refresh()}>
            <Ic name="undo" />
            Refresh
          </button>
          <button className="btn btn-primary" type="button" onClick={() => setTab("QUEUE")}>
            <Ic name="target" />
            Manual queue · {stats.queue}
          </button>
        </div>
      </div>

      <div className={styles.grid}>
        {/* ── rail ─────────────────────────────────────────── */}
        <div className={styles.col}>
          <FlowCard stats={stats} />
          <TradeCard rows={stats.tradeDist} />
          <ResponseCard stats={stats} />
        </div>

        {/* ── main ─────────────────────────────────────────── */}
        <div className={styles.col}>
          <PlanCard stats={stats} byId={byId} selectedId={selectedId} onPick={openLead} />

          <section className="card rv">
            <div className={cx("card-head", ui.cardHead)}>
              <div className="card-titles">
                <div className="card-title">Lead offers</div>
              </div>
              {stats.openOffers > 0 ? (
                <span className={styles.live}>
                  <span className={styles.liveDot} />
                  {stats.openOffers} live
                </span>
              ) : null}
              <div className={ui.filters} role="group" aria-label="Filter leads">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={cx(ui.filter, tab === t.key && ui.filterOn)}
                    aria-pressed={tab === t.key}
                    onClick={() => setTab(t.key)}
                  >
                    {t.label}
                    <i>{counts[t.key]}</i>
                  </button>
                ))}
              </div>
            </div>

            {rows.length === 0 ? (
              <Empty>
                {leads.length === 0
                  ? "No homeowner requests yet. Submissions at /homeowners land here."
                  : `Nothing in ${TABS.find((t) => t.key === tab)?.label.toLowerCase()}.`}
              </Empty>
            ) : (
              <div className={ui.tbl} role="table" aria-label="Platform leads">
                <div className={cx(ui.tr, ui.th, styles.cols)} role="row">
                  <span>Lead</span>
                  <span>Homeowner</span>
                  <span>Location → shop</span>
                  <span>Match</span>
                  <span>Expires</span>
                  <span>Status</span>
                </div>
                {rows.map((l) => (
                  <LedgerRow
                    key={l.id}
                    lead={l}
                    selected={l.id === selectedId}
                    onOpen={() => openLead(l.id)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="card rv">
            <div className="card-head">
              <div className="card-titles">
                <div className="card-title">Contractors</div>
                <div className="card-sub">
                  <b>{matchable.length}</b> of {orgs.length} can receive offers — a shop needs trades, an address
                  and offers switched on.
                </div>
              </div>
            </div>
            {orgs.length === 0 ? (
              <Empty>No organizations.</Empty>
            ) : (
              <div className={ui.tbl} role="table" aria-label="Contractors">
                <div className={cx(ui.tr, ui.th, styles.orgCols)} role="row">
                  <span>Shop</span>
                  <span>Trades</span>
                  <span>Eligibility</span>
                </div>
                {[...orgs]
                  .sort((a, b) => Number(isMatchable(b)) - Number(isMatchable(a)) || a.name.localeCompare(b.name))
                  .map((o) => (
                    <div key={o.id} className={cx(ui.tr, styles.orgCols)} role="row">
                      <div className={ui.tdWide}>
                        <div className={ui.tdName} title={o.name}>
                          {o.name}
                        </div>
                      </div>
                      <div>
                        <span className={ui.tdLbl}>Trades</span>
                        {o.trades.length ? (
                          <span className={styles.orgTrades}>
                            {o.trades.map((t) => (
                              <span key={t} className={styles.orgTrade}>
                                {t}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className={styles.mono}>none set</span>
                        )}
                      </div>
                      <div>
                        <span className={ui.tdLbl}>Eligibility</span>
                        <Chip tone={isMatchable(o) ? "ok" : "mute"}>{eligibility(o)}</Chip>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <DetailSheet handleRef={detailRef} orgs={orgs} onClosed={() => setSelectedId(null)} />
    </div>
  );
}

function isMatchable(o: OrgPickDTO): boolean {
  return o.offersEnabled && o.geocoded && o.trades.length > 0;
}
function eligibility(o: OrgPickDTO): string {
  if (!o.offersEnabled) return "Paused";
  if (!o.geocoded) return "No address";
  if (!o.trades.length) return "No trades";
  return "Matchable";
}

/* ============================================================
   LEDGER ROW
   ============================================================ */

function LedgerRow({
  lead,
  selected,
  onOpen,
}: {
  lead: PlatformLeadDTO;
  selected: boolean;
  onOpen: () => void;
}) {
  const st = statusTone(lead);
  const score = rowScore(lead);
  const place = [lead.city, lead.state].filter(Boolean).join(", ") || lead.zip || "—";
  return (
    <div
      className={cx(ui.tr, styles.cols, styles.trClick, selected && styles.trOn)}
      role="row"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className={styles.lid}>
        <span className={styles.lidIc}>
          <Ic name={tradeIcon(lead.detectedTrade)} />
        </span>
        <span className={styles.lidNo}>{shortId(lead.id)}</span>
      </div>
      <div className={ui.tdWide}>
        <span className={ui.tdLbl}>Homeowner</span>
        <div className={ui.tdName} title={lead.name}>
          {lead.name}
        </div>
        <div className={ui.tdSub}>{lead.detectedTrade ?? lead.projectType ?? "Unclassified"}</div>
      </div>
      <div className={ui.tdWide}>
        <span className={ui.tdLbl}>Location → shop</span>
        <span className={styles.route}>
          <span className={styles.rail}>
            <span className={styles.railSq} />
            <span className={styles.railLine} />
            <span className={cx(styles.railSq, styles.railEnd)} />
          </span>
          <span style={{ minWidth: 0 }}>
            <div className={ui.tdName} title={place}>
              {place}
            </div>
            <div className={ui.tdSub}>{destination(lead)}</div>
          </span>
        </span>
      </div>
      <div className={ui.tdNum}>
        <span className={ui.tdLbl}>Match</span>
        {score == null ? (
          <span className={styles.mono}>no candidates</span>
        ) : (
          <>
            <span className={styles.score}>
              {Math.round(score * 100)}
              <i> / 100</i>
            </span>
            {lead.attemptCount > 0 ? (
              <div className={styles.mono}>offer {Math.min(lead.attemptCount, 3)} / 3</div>
            ) : null}
          </>
        )}
      </div>
      <div className={ui.tdNum}>
        <span className={ui.tdLbl}>Expires</span>
        <ExpiresCell lead={lead} />
      </div>
      <div>
        <span className={ui.tdLbl}>Status</span>
        <Chip tone={st.tone}>{st.label}</Chip>
      </div>
    </div>
  );
}

function ExpiresCell({ lead }: { lead: PlatformLeadDTO }) {
  if (lead.status === "OFFERED" && lead.activeOffer) {
    return <Countdown until={lead.activeOffer.expiresAt} />;
  }
  if (lead.status === "MATCHED") {
    return (
      <span className={styles.mono}>
        {lead.manuallyAssigned ? "manually routed" : `accepted ${lead.matchedAt ? relative(lead.matchedAt) : ""}`}
      </span>
    );
  }
  if (lead.status === "MANUAL_QUEUE") {
    return (
      <span className={styles.mono}>{lead.queueReason === "NO_CANDIDATES" ? "no candidates" : "3 strikes · 24h"}</span>
    );
  }
  return <span className={styles.mono}>ranking…</span>;
}

function Countdown({ until }: { until: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <span className={styles.countdown}>
      <span className={styles.liveDot} />
      {s === 0 ? "expiring…" : `${hh}:${mm}:${ss}`}
    </span>
  );
}

/* ============================================================
   RAIL — today's flow / by trade / match & response
   ============================================================ */

const GAUGE_D = "M8 70 C 74 92 150 92 208 70 C 258 51 292 44 312 40";

function FlowCard({ stats }: { stats: StatsDTO }) {
  const ratio = stats.todayCreated > 0 ? stats.todayMatched / stats.todayCreated : 0;
  const pathRef = useRef<SVGPathElement>(null);
  const [mark, setMark] = useState<{ x: number; y: number; shown: number } | null>(null);

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const len = path.getTotalLength();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const place = (at: number) => {
      const p = path.getPointAtLength(len * at);
      path.style.strokeDasharray = `${len * at} ${len}`;
      setMark({ x: p.x, y: p.y, shown: Math.round(ratio * 100 * (ratio > 0 ? at / ratio : 1)) });
    };
    if (reduced) {
      place(ratio);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - t0) / 850, 1);
      const e = 1 - Math.pow(1 - t, 3);
      place(ratio * e);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ratio]);

  return (
    <section className="card rv">
      <div className="card-head">
        <div className="card-titles">
          <div className="card-title">Today&apos;s lead flow</div>
        </div>
      </div>

      <div className={styles.intake}>
        <div className={styles.intakeHead}>
          <span>Intake by trade</span>
          <span>today</span>
        </div>
        <div className={styles.pills}>
          {stats.todayByTrade.length === 0 ? (
            <span className={styles.pillEmpty}>No requests yet today</span>
          ) : (
            stats.todayByTrade.map((t) => (
              <span key={t.trade} className={styles.pill}>
                <Ic name={tradeIcon(t.trade)} />
                <span className={styles.pillLbl}>{t.trade}</span>
                <span className={styles.pillN}>{t.n}</span>
              </span>
            ))
          )}
        </div>
      </div>

      <div className={styles.gauge}>
        <svg viewBox="0 0 320 96" aria-hidden="true">
          <path className={styles.gTrack} d={GAUGE_D} />
          <path ref={pathRef} className={styles.gVal} d={GAUGE_D} style={{ strokeDasharray: "0 1000" }} />
          {mark ? <rect className={styles.gMark} x={mark.x - 5.5} y={mark.y - 5.5} width="11" height="11" rx="1" /> : null}
        </svg>
        {mark ? (
          <div className={styles.gTip} style={{ left: `${(mark.x / 320) * 100}%`, top: `${(mark.y / 96) * 100}%` }}>
            {mark.shown}%
          </div>
        ) : null}
        <div className={styles.gAxis}>
          <span className={styles.mono}>0%</span>
          <span className={styles.mono}>100%</span>
        </div>
      </div>

      <div className={styles.gCap}>
        <span className={styles.mono}>Matched today</span>
        <span className={styles.gCapVal}>
          {stats.todayMatched}
          <i> / {stats.todayCreated}</i>
        </span>
      </div>
    </section>
  );
}

const SEGS = 26;

function TradeCard({ rows }: { rows: StatsDTO["tradeDist"] }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <section className="card rv">
      <div className="card-head">
        <div className="card-titles">
          <div className="card-title">Leads by trade</div>
          <div className="card-sub">Last 30 days</div>
        </div>
      </div>
      {rows.length === 0 ? (
        <Empty>No classified leads in the last 30 days.</Empty>
      ) : (
        rows.map((r, ri) => {
          const lit = ready ? Math.round((r.pct / 100) * SEGS) : 0;
          return (
            <div key={r.trade} className={styles.tradeRow}>
              <span className={styles.tradeName} title={r.trade}>
                <Ic name={tradeIcon(r.trade)} />
                <span>{r.trade}</span>
              </span>
              <span className={styles.tradeN}>{r.n}</span>
              <span className={styles.segbar} aria-hidden="true">
                {Array.from({ length: SEGS }, (_, i) => (
                  <span
                    key={i}
                    className={cx(styles.seg, i < lit && styles.segOn)}
                    style={{ transitionDelay: `${ri * 90 + i * 22}ms` }}
                  />
                ))}
              </span>
              <span className={styles.tradePct}>{r.pct}%</span>
            </div>
          );
        })
      )}
    </section>
  );
}

function ResponseCard({ stats }: { stats: StatsDTO }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const series = stats.series;
  const maxLeads = Math.max(1, ...series.map((d) => d.leads));
  const maxMatched = Math.max(1, ...series.map((d) => d.matched));
  const bars = series.map((d, i) => {
    const h = Math.round(((d.leads / maxLeads) * 50 + (d.leads > 0 ? 4 : 1)) * 10) / 10;
    return { x: 4 + i * 8, h, y: Math.round((62 - h) * 10) / 10, dim: i >= series.length - 6 };
  });
  const line = series
    .map((d, i) => `${4 + i * 8 + 2},${Math.round((58 - (d.matched / maxMatched) * 40) * 10) / 10}`)
    .join(" L");
  const first = series[0]?.day;
  const last = series[series.length - 1]?.day;

  return (
    <section className="card rv">
      <div className="card-head">
        <div className="card-titles">
          <div className="card-title">Match &amp; response</div>
          <div className="card-sub">Last 30 days</div>
        </div>
      </div>
      <div className={styles.mr}>
        <div className={styles.mrCell}>
          <div className={styles.mrLbl}>Accept rate</div>
          <div className={cx(styles.mrVal, styles.mrAccent)}>
            {pct(stats.acceptRatePct)}
            <i>%</i>
          </div>
          <div className={styles.mrSub}>first offer {pct(stats.firstOfferPct)}%</div>
        </div>
        <div className={styles.mrCell}>
          <div className={styles.mrLbl}>Avg. accept</div>
          <div className={styles.mrVal}>
            {stats.medianAcceptMin == null
              ? "—"
              : stats.medianAcceptMin >= 90
                ? (stats.medianAcceptMin / 60).toFixed(1)
                : Math.round(stats.medianAcceptMin)}
            <i> {stats.medianAcceptMin != null && stats.medianAcceptMin >= 90 ? "h" : "min"}</i>
          </div>
          <div className={styles.mrSub}>window 24 h</div>
        </div>
        <div className={styles.mrCell}>
          <div className={styles.mrLbl}>Leads routed</div>
          <div className={styles.mrVal}>{stats.routedTotal.toLocaleString("en-US")}</div>
          <div className={styles.mrSub}>
            {stats.routedDeltaPct == null
              ? "all time"
              : `${stats.routedDeltaPct >= 0 ? "+" : ""}${Math.round(stats.routedDeltaPct)}% vs prior 30d`}
          </div>
        </div>
      </div>
      <div className={cx(styles.mini, ready && styles.ready)}>
        <svg viewBox="0 0 276 70" aria-hidden="true">
          <g>
            {bars.map((b, i) => (
              <rect
                key={i}
                className={cx(styles.miniBar, b.dim && styles.miniBarDim)}
                x={b.x}
                y={b.y}
                width="4"
                height={b.h}
                style={{ transitionDelay: `${i * 14}ms` }}
              />
            ))}
          </g>
          {series.length > 1 ? <path className={styles.miniLine} pathLength={1} d={`M${line}`} /> : null}
          <line x1="0" y1="62.5" x2="276" y2="62.5" stroke="var(--ink)" strokeWidth="1.5" />
        </svg>
      </div>
      <div className={styles.miniAxis}>
        <span className={styles.mono}>{first ? shortDate(first) : ""}</span>
        <span className={styles.mono}>{last ? shortDate(last) : ""}</span>
      </div>
    </section>
  );
}

/* ============================================================
   SITE PLAN
   ============================================================ */

function PlanCard({
  stats,
  byId,
  selectedId,
  onPick,
}: {
  stats: StatsDTO;
  byId: Map<string, PlatformLeadDTO>;
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  const plotted = stats.mapPoints.length;
  const active = selectedId ? byId.get(selectedId) : null;
  const activeOnMap = active && stats.mapPoints.some((p) => p.id === active.id) ? active : null;

  return (
    <section className={cx("card rv", styles.mapCard)}>
      <div className={styles.mapFrame}>
        <svg className={styles.plan} viewBox="0 0 800 440" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect width="800" height="440" fill="#1854a0" />
          <g stroke="rgba(255,255,255,0.10)" strokeWidth="1">
            {Array.from({ length: 18 }, (_, i) => (
              <line key={`mh${i}`} x1="0" y1={i * 25} x2="800" y2={i * 25} />
            ))}
            {Array.from({ length: 32 }, (_, i) => (
              <line key={`mv${i}`} x1={i * 25} y1="0" x2={i * 25} y2="440" />
            ))}
          </g>
          <g stroke="rgba(255,255,255,0.85)" strokeWidth="3">
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`h${i}`} x1="0" y1={30 + i * 50} x2="800" y2={30 + i * 50} />
            ))}
            {Array.from({ length: 13 }, (_, i) => (
              <line key={`v${i}`} x1={40 + i * 62} y1="0" x2={40 + i * 62} y2="440" />
            ))}
          </g>
          <g
            fill="rgba(255,255,255,0.85)"
            fontFamily="JetBrains Mono, monospace"
            fontSize="12"
            fontWeight="600"
            letterSpacing="2"
          >
            {stats.mapCities.map((c) => (
              <text key={c.name} x={(c.x / 100) * 800} y={(c.y / 100) * 440 - 18} textAnchor="middle">
                {c.name.toUpperCase()}
              </text>
            ))}
          </g>
          <g stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" fill="none">
            <path d="M40 418h70M40 412v12M110 412v12" />
          </g>
          <text x="118" y="423" fill="rgba(255,255,255,0.85)" fontFamily="JetBrains Mono, monospace" fontSize="10">
            LEADS · 30 D
          </text>
        </svg>

        <div className={styles.overlays}>
          <div className={styles.chipbar}>
            <span className={styles.mapChip}>
              <Ic name="pin" />
              {plotted} plotted
              {stats.ungeocoded > 0 ? <i>· {stats.ungeocoded} without a pin</i> : null}
            </span>
          </div>

          {plotted === 0 ? (
            <div className={styles.mapEmpty}>
              <span>No geocoded leads in the last 30 days.</span>
            </div>
          ) : null}

          {stats.mapPoints.map((p) => {
            const isActive = p.id === selectedId;
            const l = byId.get(p.id);
            return (
              <button
                key={p.id}
                type="button"
                className={cx(
                  styles.pin,
                  p.status === "OFFERED" && styles.pinLive,
                  p.status === "MANUAL_QUEUE" && styles.pinQueue,
                  isActive && styles.pinActive,
                )}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                onClick={() => onPick(p.id)}
                aria-label={l ? `${shortId(l.id)} ${l.name}` : "lead"}
              >
                {isActive && activeOnMap ? (
                  <span className={styles.pinTip}>
                    <Ic name={tradeIcon(activeOnMap.detectedTrade)} />
                    <span>
                      <span className={styles.pinTipId}>{shortId(activeOnMap.id)}</span>
                      <span className={styles.pinTipSub}>
                        {activeOnMap.detectedTrade ?? "project"} · {activeOnMap.city ?? activeOnMap.zip ?? "—"}
                      </span>
                    </span>
                  </span>
                ) : null}
                <span className={styles.pinSq} />
                <span className={styles.pinStem} />
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.legend}>
        <span className={styles.leg}>
          <span className={styles.legSq} />
          Matched
        </span>
        <span className={styles.leg}>
          <span className={cx(styles.legSq, styles.legLive)} />
          Offer open
        </span>
        <span className={styles.leg}>
          <span className={cx(styles.legSq, styles.legQueue)} />
          Queue
        </span>
        <span className={styles.leg}>
          <span className={cx(styles.legSq, styles.legActive)} />
          Selected
        </span>
        <span className={cx(styles.leg, styles.legRight)}>{plotted} leads plotted</span>
      </div>
    </section>
  );
}

/* ============================================================
   DETAIL SHEET — ranking, offers, assign, requeue
   ============================================================ */

function DetailSheet({
  handleRef,
  orgs,
  onClosed,
}: {
  handleRef: React.RefObject<DetailHandle | null>;
  orgs: OrgPickDTO[];
  onClosed: () => void;
}) {
  const router = useRouter();
  const [lead, setLead] = useState<PlatformLeadDTO | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { ref: mdlRef, open: openDialog, close: closeDialog } = useMdl();
  const close = useCallback(() => {
    closeDialog();
    onClosed();
  }, [closeDialog, onClosed]);

  const open = useCallback(
    (l: PlatformLeadDTO) => {
      setLead(l);
      setError(null);
      setBusy(null);
      openDialog();
    },
    [openDialog],
  );
  useEffect(() => {
    handleRef.current = { open };
  }, [handleRef, open]);

  async function assign(org: OrgPickDTO) {
    if (busy || !lead) return;
    setBusy(org.id);
    setError(null);
    try {
      await manualAssignPlatformLead(lead.id, org.id);
      toast.success("Lead routed", `${lead.name} is in ${org.name}'s Incoming tab.`);
      close();
      router.refresh();
    } catch (err) {
      setError(actionError(err));
    } finally {
      setBusy(null);
    }
  }

  async function requeue() {
    if (busy || !lead) return;
    setBusy("requeue");
    setError(null);
    try {
      await requeuePlatformLead(lead.id);
      toast.success("Sent to cascade", "Attempts reset; shops already offered are skipped.");
      close();
      router.refresh();
    } catch (err) {
      setError(actionError(err));
    } finally {
      setBusy(null);
    }
  }

  const ordered = [...orgs].sort((a, b) => {
    if (!lead) return 0;
    const ra = lead.ranking.findIndex((r) => r.orgId === a.id);
    const rb = lead.ranking.findIndex((r) => r.orgId === b.id);
    const ka = ra === -1 ? 999 : ra;
    const kb = rb === -1 ? 999 : rb;
    return ka - kb || Number(isMatchable(b)) - Number(isMatchable(a)) || a.name.localeCompare(b.name);
  });

  return (
    <Sheet
      mdlRef={mdlRef}
      title={lead ? shortId(lead.id) : "Lead"}
      titleId="lcDetailTitle"
      size="lg"
      onClose={close}
      error={error}
      foot={
        lead ? (
          <>
            <button className="btn btn-ghost" type="button" onClick={close} disabled={busy !== null}>
              Close
            </button>
            {lead.status === "MANUAL_QUEUE" ? (
              <button
                className={cx("btn btn-primary", busy === "requeue" && ui.btnBusy)}
                type="button"
                onClick={requeue}
                disabled={busy !== null}
              >
                <Ic name="send" />
                {busy === "requeue" ? "Sending…" : "Send to cascade"}
              </button>
            ) : null}
          </>
        ) : null
      }
    >
      {!lead ? null : (
        <>
          <div className={styles.dHead}>
            <div style={{ minWidth: 0 }}>
              <div className={styles.dName}>{lead.name}</div>
              <div className={styles.dSub}>
                {lead.detectedTrade ?? lead.projectType ?? "Unclassified"}
                {lead.aiConfidence != null ? ` · ${Math.round(lead.aiConfidence * 100)}% confidence` : ""}
                {" · "}
                {[lead.city, lead.state, lead.zip].filter(Boolean).join(", ") || "no location"}
                {lead.geocoded ? "" : " · not geocoded"}
              </div>
              <div className={styles.dSub}>
                {lead.email}
                {lead.phone ? ` · ${lead.phone}` : ""}
                {" · "}submitted {relative(lead.createdAt)}
              </div>
            </div>
            <Chip tone={statusTone(lead).tone}>{statusTone(lead).label}</Chip>
          </div>

          {lead.description ? <div className={styles.dDesc}>{lead.description}</div> : null}

          <div className={styles.dSec}>Ranking · why each shop placed where it did</div>
          {lead.ranking.length === 0 ? (
            <Empty>No eligible shop at submission time.</Empty>
          ) : (
            <div className={styles.rank}>
              <div className={cx(styles.rankRow, styles.rankHead)}>
                <span>#</span>
                <span>Shop</span>
                <span className={cx(styles.rankN, styles.rankHide)}>Dist</span>
                <span className={cx(styles.rankN, styles.rankHide)}>Rating</span>
                <span className={cx(styles.rankN, styles.rankHide)}>Resp</span>
                <span className={styles.rankN}>Total</span>
              </div>
              {lead.ranking.map((r, i) => (
                <div key={r.orgId} className={styles.rankRow}>
                  <span className={styles.rankNo}>{i + 1}</span>
                  <span className={styles.rankOrg} title={r.orgName}>
                    {r.orgName}
                  </span>
                  <span className={cx(styles.rankN, styles.rankHide)}>
                    {r.distanceMi == null ? (r.fallback ? "zip" : "—") : `${r.distanceMi} mi`}
                  </span>
                  <span className={cx(styles.rankN, styles.rankHide)}>{Math.round(r.ratingScore * 100)}</span>
                  <span className={cx(styles.rankN, styles.rankHide)}>{Math.round(r.respScore * 100)}</span>
                  <span className={cx(styles.rankN, styles.rankTot)}>{Math.round(r.score * 100)}</span>
                </div>
              ))}
            </div>
          )}

          <div className={styles.dSec}>Offers</div>
          {lead.offers.length === 0 ? (
            <Empty>No offers sent.</Empty>
          ) : (
            <div className={styles.tl}>
              {lead.offers.map((o) => (
                <div key={o.id} className={styles.tlRow}>
                  <span title={o.orgName}>
                    {o.attempt}. {o.orgName}
                  </span>
                  <span className={styles.mono}>
                    {o.status === "OFFERED"
                      ? "open"
                      : o.status.toLowerCase() + (o.respondedAt ? ` ${relative(o.respondedAt)}` : "")}
                  </span>
                  <Chip tone={OFFER_TONE[o.status] ?? "mute"}>{Math.round(o.score * 100)}</Chip>
                </div>
              ))}
            </div>
          )}

          {lead.status !== "MATCHED" ? (
            <>
              <div className={styles.dSec}>Route manually · lands in the shop&apos;s Incoming tab</div>
              <div className={styles.assign}>
                {ordered.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={styles.assignBtn}
                    disabled={busy !== null}
                    onClick={() => assign(o)}
                  >
                    <Ic name={isMatchable(o) ? "check" : "ban"} />
                    <span>{o.name}</span>
                    <i>{busy === o.id ? "routing…" : eligibility(o)}</i>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className={cx(styles.dSec)} style={{ marginBottom: 0 }}>
              Matched with {lead.matchedOrgName ?? "a shop"}
              {lead.matchedAt ? ` · ${shortDate(lead.matchedAt)}` : ""}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

const OFFER_TONE: Record<string, Tone> = {
  OFFERED: "wait",
  ACCEPTED: "ok",
  DECLINED: "bad",
  EXPIRED: "mute",
  CANCELLED: "mute",
};
