"use client";

// ADMIN LEAD CENTER — BLUEPRINT
// /admin/lead-center
//
// The platform's routing desk: every homeowner request (PlatformLead), where it
// went, and the escape hatch when it went nowhere. Data is read by the server
// page; the only writes are the two admin actions (manualAssignPlatformLead /
// requeuePlatformLead), and `router.refresh()` is the update.
//
// ── WHAT THIS PAGE IS FOR, AND THE 2026-08-27 REBUILD ─────────────────────
// One question brings anyone here: WHERE IS THIS HOMEOWNER'S REQUEST. The first
// build answered it fourth. Above the leads sat three analytics cards (an arc
// gauge, a 26-segment trade bar, a 34-day sparkline beside three KPIs), a
// full-bleed schematic map, and a contractor roster that listed every shop that
// could NOT take a lead as loudly as the two that could — on a platform with
// one lead a day, every one of those was a chart of nothing.
//
// The rebuild is subtraction, and the rules it follows:
//   · ONE JOB PER BLOCK. Status → Leads → Coverage, in that order, top to
//     bottom. Three sections, each answering a different question.
//   · NO CHART WITHOUT DATA. A figure that has nothing to plot is not rendered
//     dim or drawn as an em-dash — it is not rendered. Placeholders were the
//     single biggest source of text on the page.
//   · SAY IT ONCE. "1 plotted" and "1 leads plotted" were the same fact twice;
//     a Status chip and an Expires column carried the same state; the routing
//     rules were recited in the kicker on every visit.
//   · A ROW IS FOUR COLUMNS, NOT SIX. Lead / homeowner / where it went /
//     status. The score and the attempt count are detail, and detail lives in
//     the sheet.
// The visual system (2px ink frames, hard offset shadows, mono annotation
// layer) is unchanged — this is an editing pass, not a re-skin.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toast";
import { relative, shortDate } from "@/lib/format";
import {
  manualAssignPlatformLead,
  requeuePlatformLead,
  routeAllWaitingLeads,
  setLeadRoutingMode,
} from "@/actions/adminLeadCenter";
import type { RoutingMode } from "@/lib/leadCenter/routingMode";
import { LeadMap, type MapFilter } from "./lead-map";
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
  /** Real coordinates, for the map. Null when the address could not be geocoded. */
  lat: number | null;
  lng: number | null;
  status: string; // MATCHING | OFFERED | MATCHED | MANUAL_QUEUE
  attemptCount: number;
  queueReason: string | null; // NO_CANDIDATES | EXHAUSTED
  matchedOrgName: string | null;
  /** The contractor this row names, if any — matched, else the live offer's. */
  wentToOrgId: string | null;
  matchedAt: string | null;
  manuallyAssigned: boolean;
  /** The shop-side Lead row's status: ROUTED until someone at the shop accepts
   *  it, then CLAIMED / whatever their pipeline moved it to. Null when the lead
   *  has not been matched. */
  shopLeadStatus: string | null;
  createdAt: string;
  ranking: RankEntry[];
  offers: OfferDTO[];
  activeOffer: { orgName: string; attempt: number; expiresAt: string; score: number } | null;
}

/** A CONTRACTOR — one of our shops, not a homeowner. */
export interface OrgPickDTO {
  id: string;
  name: string;
  trades: string[];
  otherTrade: string | null;
  geocoded: boolean;
  lat: number | null;
  lng: number | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  offersEnabled: boolean;
  offersReceived: number;
  offersAccepted: number;
  leadsMatched: number;
  joinedAt: string;
}

export interface StatsDTO {
  todayCreated: number;
  todayMatched: number;
  /** Up to 6 trades, biggest first, over 30 days. */
  tradeDist: { trade: string; n: number; pct: number }[];
  acceptRatePct: number | null;
  medianAcceptMin: number | null;
  routedTotal: number;
  openOffers: number;
  expiringSoon: number;
  queue: number;
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

function statusTone(l: PlatformLeadDTO): { tone: Tone; label: string } {
  switch (l.status) {
    case "OFFERED":
      return { tone: "wait", label: "Offered" };
    case "MATCHING":
      return { tone: "mute", label: "Matching" };
    case "MATCHED":
      // "Matched" used to cover both a shop that accepted and one that has not
      // opened the tab yet. Those are different answers, so they read
      // differently.
      return l.shopLeadStatus === "ROUTED"
        ? { tone: "bp", label: "With shop" }
        : { tone: "ok", label: "Accepted" };
    case "MANUAL_QUEUE":
      return { tone: "mute", label: "Queue" };
    default:
      return { tone: "mute", label: l.status };
  }
}

type Tab = "ALL" | "OFFERED" | "MATCHED" | "QUEUE";
const TABS: { key: Tab; label: string; match: (l: PlatformLeadDTO) => boolean }[] = [
  { key: "ALL", label: "All", match: () => true },
  { key: "OFFERED", label: "Open", match: (l) => l.status === "OFFERED" || l.status === "MATCHING" },
  { key: "MATCHED", label: "Routed", match: (l) => l.status === "MATCHED" },
  { key: "QUEUE", label: "Queue", match: (l) => l.status === "MANUAL_QUEUE" },
];

/** The score the row shows: the live offer's, else the last offer's, else the top candidate's. */
function rowScore(l: PlatformLeadDTO): number | null {
  if (l.activeOffer) return l.activeOffer.score;
  const last = l.offers[l.offers.length - 1];
  if (last) return last.score;
  return l.ranking[0]?.score ?? null;
}

/** Where the lead is, in one phrase — the answer the page exists to give. */
function destination(l: PlatformLeadDTO): string {
  if (l.activeOffer) return l.activeOffer.orgName;
  if (l.status === "MATCHED") return l.matchedOrgName ?? "a shop";
  if (l.status === "MANUAL_QUEUE") return "Nobody yet";
  return "Ranking shops…";
}

/** The small line under it: why it is there, or how long is left. */
function destinationNote(l: PlatformLeadDTO): string {
  const score = rowScore(l);
  const match = score == null ? "" : `match ${Math.round(score * 100)}`;
  if (l.status === "OFFERED") {
    return [`offer ${Math.min(Math.max(l.attemptCount, 1), 3)} of 3`, match].filter(Boolean).join(" · ");
  }
  if (l.status === "MATCHED") {
    const how = l.manuallyAssigned ? "routed by hand" : "accepted";
    return [how, l.matchedAt ? relative(l.matchedAt) : ""].filter(Boolean).join(" · ");
  }
  if (l.status === "MANUAL_QUEUE") {
    if (l.queueReason === "NO_CANDIDATES") return "no contractor covers this";
    // Manual mode parks every request here on purpose — saying "3 offers, no
    // takers" about a lead nobody was offered is the page lying to itself.
    if (l.queueReason === "MANUAL_MODE") return "waiting for you";
    return "3 offers, no takers";
  }
  return match;
}

function place(l: PlatformLeadDTO): string {
  return [l.city, l.state].filter(Boolean).join(", ") || l.zip || "no location";
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
   PAGE
   ============================================================ */

type DetailHandle = { open: (lead: PlatformLeadDTO) => void };

export function AdminLeadCenterContent({
  leads,
  orgs,
  stats,
  routingMode,
}: {
  leads: PlatformLeadDTO[];
  orgs: OrgPickDTO[];
  stats: StatsDTO;
  routingMode: RoutingMode;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  useReveal(rootRef);

  const [tab, setTab] = useState<Tab>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailRef = useRef<DetailHandle | null>(null);
  const shopRef = useRef<ShopHandle | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  /** The lead the map is currently placing, if any: picking a lead pin arms
   *  the map, and the next shop you click is offered that lead. */
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [mapFilter, setMapFilter] = useState<MapFilter>("leads");
  const [mode, setMode] = useState<RoutingMode>(routingMode);
  const [modeBusy, setModeBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

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

  const shopById = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);

  /** A lead pin: arm the map with it and show the shops, so the next click is
   *  the answer to "who should get this". */
  const armLead = useCallback((id: string) => {
    setPlacingId(id);
    setSelectedId(id);
    setMapFilter("both");
  }, []);

  /** A shop pin or a shop row. With a lead armed the sheet asks whether to send
   *  it; without one it is just the contractor's record. */
  const openShop = useCallback(
    (id: string) => {
      const o = shopById.get(id);
      if (!o) return;
      shopRef.current?.open(o, placingId ? (byId.get(placingId) ?? null) : null);
    },
    [shopById, byId, placingId],
  );

  async function switchMode(next: RoutingMode) {
    if (modeBusy || next === mode) return;
    setModeBusy(true);
    const prev = mode;
    setMode(next);
    try {
      await setLeadRoutingMode(next);
      toast.success(
        next === "AUTO" ? "Routing automatically" : "Routing by hand",
        next === "AUTO"
          ? "New requests go straight to the best-matching shop."
          : "New requests wait here until you send them.",
      );
      router.refresh();
    } catch (err) {
      setMode(prev);
      toast.error("Couldn't change the mode", actionError(err));
    } finally {
      setModeBusy(false);
    }
  }

  async function routeAll() {
    if (bulkBusy) return;
    setBulkBusy(true);
    try {
      const res = await routeAllWaitingLeads();
      toast.success(
        `${res.routed} routed`,
        res.skipped > 0 ? `${res.skipped} had no eligible shop and stayed put.` : "Every waiting lead has a shop.",
      );
      router.refresh();
    } catch (err) {
      toast.error("Couldn't route them", actionError(err));
    } finally {
      setBulkBusy(false);
    }
  }

  const waiting = leads.filter((l) => l.status === "MANUAL_QUEUE" || l.status === "MATCHING").length;

  return (
    <div ref={rootRef} className={styles.root}>
      <div className="page-head rv">
        <div>
          <div className="kicker">Platform routing</div>
          <h1 className="page-title">Lead Center</h1>
        </div>
        <div className="page-actions">
          {/* WHO DECIDES. Automatic hands a new request to the best-scoring
              shop the moment it lands; Manual holds every request here until
              somebody sends it. One switch, because it is one decision. */}
          <div className={styles.modeSw} role="group" aria-label="Routing mode">
            {(["AUTO", "MANUAL"] as RoutingMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={cx(styles.modeBtn, mode === m && styles.modeOn)}
                aria-pressed={mode === m}
                disabled={modeBusy}
                onClick={() => void switchMode(m)}
              >
                <Ic name={m === "AUTO" ? "send" : "target"} />
                {m === "AUTO" ? "Automatic" : "Manual"}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost" type="button" onClick={() => router.refresh()}>
            <Ic name="undo" />
            Refresh
          </button>
          {/* Manual mode's bulk escape: send everything waiting to its best
              match in one pass. Only offered when there is something waiting. */}
          {waiting > 0 ? (
            <button
              className={cx("btn btn-primary", bulkBusy && ui.btnBusy)}
              type="button"
              disabled={bulkBusy}
              onClick={() => void routeAll()}
            >
              <Ic name="check" />
              {bulkBusy ? "Routing…" : `Route all ${waiting}`}
            </button>
          ) : null}
        </div>
      </div>

      <StatusCard stats={stats} />

      <section className={cx("card rv", styles.ledgerCard)}>
        <div className={cx("card-head", ui.cardHead)}>
          <div className="card-titles">
            <div className="card-title">Leads</div>
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
              ? "No homeowner requests yet."
              : `Nothing ${TABS.find((t) => t.key === tab)?.label.toLowerCase()}.`}
          </Empty>
        ) : (
          <div className={ui.tbl} role="table" aria-label="Platform leads">
            <div className={cx(ui.tr, ui.th, styles.cols)} role="row">
              <span>Lead</span>
              <span>Homeowner</span>
              <span>Went to</span>
              <span>Status</span>
            </div>
            {rows.map((l) => (
              <LedgerRow
                key={l.id}
                lead={l}
                selected={l.id === selectedId}
                onOpen={() => openLead(l.id)}
                onOpenShop={openShop}
              />
            ))}
          </div>
        )}
      </section>

      <div ref={mapRef}>
        <MapCard
        leads={leads}
        orgs={orgs}
        filter={mapFilter}
        onFilter={setMapFilter}
        placing={placingId ? (byId.get(placingId) ?? null) : null}
        onClearPlacing={() => setPlacingId(null)}
        onPickLead={armLead}
        onPickShop={openShop}
        onOpenLead={openLead}
        />
      </div>

      <div className={styles.two}>
        <ShopsCard orgs={orgs} onOpen={openShop} />
        <AlgorithmCard />
      </div>

      <DetailSheet
        handleRef={detailRef}
        orgs={orgs}
        onClosed={() => setSelectedId(null)}
        onPlace={(id) => {
          armLead(id);
          mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />
      <ShopSheet handleRef={shopRef} onSent={() => setPlacingId(null)} />
    </div>
  );
}

/* ============================================================
   STATUS — the four numbers, and nothing that has no data
   ============================================================ */

function StatusCard({ stats }: { stats: StatsDTO }) {
  const cells: { label: string; value: string; tone?: "live" | "warn" }[] = [
    { label: "New today", value: String(stats.todayCreated) },
    { label: "Matched today", value: String(stats.todayMatched) },
    { label: "Offers open", value: String(stats.openOffers), tone: stats.openOffers ? "live" : undefined },
    { label: "Need routing", value: String(stats.queue), tone: stats.queue ? "warn" : undefined },
  ];

  // The 30-day facts, as one line of prose, and only the parts that exist.
  const facts: string[] = [];
  if (stats.acceptRatePct != null) facts.push(`${Math.round(stats.acceptRatePct)}% of offers accepted`);
  if (stats.medianAcceptMin != null) {
    const m = stats.medianAcceptMin;
    facts.push(m >= 90 ? `${(m / 60).toFixed(1)} h to accept` : `${Math.round(m)} min to accept`);
  }
  if (stats.routedTotal > 0) facts.push(`${stats.routedTotal.toLocaleString("en-US")} routed all time`);

  return (
    <section className="card rv">
      <div className={styles.kpis}>
        {cells.map((c) => (
          <div key={c.label} className={styles.kpi}>
            <div className={styles.kpiLbl}>{c.label}</div>
            <div
              className={cx(
                styles.kpiVal,
                c.tone === "live" && styles.kpiLive,
                c.tone === "warn" && styles.kpiWarn,
              )}
            >
              {c.value}
            </div>
          </div>
        ))}
      </div>

      {facts.length || stats.tradeDist.length ? (
        <div className={styles.statusFoot}>
          {facts.length ? <div className={styles.facts}>Last 30 days · {facts.join(" · ")}</div> : null}
          {stats.tradeDist.length ? (
            <div className={styles.trades}>
              {stats.tradeDist.slice(0, 4).map((t) => (
                <span key={t.trade} className={styles.trade}>
                  <Ic name={tradeIcon(t.trade)} />
                  <span className={styles.tradeName}>{t.trade}</span>
                  <span className={styles.tradeBar} aria-hidden="true">
                    <span style={{ width: `${Math.max(6, t.pct)}%` }} />
                  </span>
                  <span className={styles.tradeN}>{t.n}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/* ============================================================
   LEDGER ROW
   ============================================================ */

function LedgerRow({
  lead,
  selected,
  onOpen,
  onOpenShop,
}: {
  lead: PlatformLeadDTO;
  selected: boolean;
  onOpen: () => void;
  /** The row names two records: a homeowner and a contractor. Each name opens
   *  its own, so the row is two handles rather than one. */
  onOpenShop: (id: string) => void;
}) {
  const st = statusTone(lead);
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
        {/* The name is the handle for everything about this person, so it looks
            like one. The whole row opens the sheet; this is the affordance. */}
        <div className={cx(ui.tdName, styles.nameLink)} title={lead.name}>
          {lead.name}
        </div>
        <div className={ui.tdSub}>
          {lead.detectedTrade ?? lead.projectType ?? "Unclassified"} · {place(lead)}
        </div>
      </div>

      <div className={ui.tdWide}>
        <span className={ui.tdLbl}>Went to</span>
        {lead.wentToOrgId ? (
          <button
            type="button"
            className={cx(ui.tdName, styles.nameLink, styles.cellBtn)}
            title={destination(lead)}
            onClick={(e) => {
              // The row itself opens the homeowner; this cell opens the shop.
              e.stopPropagation();
              onOpenShop(lead.wentToOrgId as string);
            }}
          >
            {destination(lead)}
          </button>
        ) : (
          <div className={ui.tdName} title={destination(lead)}>
            {destination(lead)}
          </div>
        )}
        <div className={ui.tdSub}>{destinationNote(lead)}</div>
      </div>

      <div className={styles.statusCell}>
        <span className={ui.tdLbl}>Status</span>
        <Chip tone={st.tone}>{st.label}</Chip>
        {/* The countdown is the one thing a chip cannot say: how long is left. */}
        {lead.status === "OFFERED" && lead.activeOffer ? (
          <Countdown until={lead.activeOffer.expiresAt} />
        ) : null}
      </div>
    </div>
  );
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
  return (
    <span className={styles.countdown}>{s === 0 ? "expiring" : `${hh}:${mm} left`}</span>
  );
}

/* ============================================================
   SHOPS — the contractors, and who can take a lead
   ============================================================ */

function ShopsCard({ orgs, onOpen }: { orgs: OrgPickDTO[]; onOpen: (id: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const ready = orgs.filter(isMatchable).sort((a, b) => a.name.localeCompare(b.name));
  const notReady = orgs.filter((o) => !isMatchable(o)).sort((a, b) => a.name.localeCompare(b.name));

  const row = (o: OrgPickDTO, off?: boolean) => (
    <button key={o.id} type="button" className={styles.shop} onClick={() => onOpen(o.id)}>
      <span className={cx(styles.shopName, styles.nameLink, off && styles.shopOff)} title={o.name}>
        {o.name}
      </span>
      {off ? (
        <Chip tone="mute">{eligibility(o)}</Chip>
      ) : (
        <span className={styles.shopTrades}>
          {o.trades.slice(0, 3).map((t) => (
            <span key={t} className={styles.shopTrade}>
              {t}
            </span>
          ))}
          {o.trades.length > 3 ? <span className={styles.shopTrade}>+{o.trades.length - 3}</span> : null}
        </span>
      )}
    </button>
  );

  return (
    <section className="card rv">
      <div className="card-head">
        <div className="card-titles">
          <div className="card-title">Contractors</div>
          <div className="card-sub">
            {ready.length} of {orgs.length} can receive offers.
          </div>
        </div>
      </div>

      {ready.length === 0 ? (
        <Empty>No contractor can receive offers yet — each needs trades, an address and offers on.</Empty>
      ) : (
        <div className={styles.shops}>{ready.map((o) => row(o))}</div>
      )}

      {/* The shops that cannot take a lead are a to-do list, not a roster: they
          collapse to one line until somebody asks. */}
      {notReady.length ? (
        <div className={styles.notReady}>
          <button
            type="button"
            className={cx(styles.disclose, showAll && styles.discloseOn)}
            onClick={() => setShowAll((v) => !v)}
          >
            <Ic name="chev" />
            {notReady.length} not ready
          </button>
          {showAll ? <div className={styles.shops}>{notReady.map((o) => row(o, true))}</div> : null}
        </div>
      ) : null}
    </section>
  );
}

/* ============================================================
   MAP — leads in red, contractors in blue
   ============================================================ */

const FILTERS: { key: MapFilter; label: string }[] = [
  { key: "leads", label: "Leads" },
  { key: "shops", label: "Contractors" },
  { key: "both", label: "Both" },
];

function MapCard({
  leads,
  orgs,
  filter,
  onFilter,
  placing,
  onClearPlacing,
  onPickLead,
  onPickShop,
  onOpenLead,
}: {
  leads: PlatformLeadDTO[];
  orgs: OrgPickDTO[];
  filter: MapFilter;
  onFilter: (f: MapFilter) => void;
  placing: PlatformLeadDTO | null;
  onClearPlacing: () => void;
  onPickLead: (id: string) => void;
  onPickShop: (id: string) => void;
  onOpenLead: (id: string) => void;
}) {
  const mapLeads = useMemo(
    () =>
      leads
        .filter((l) => l.lat != null && l.lng != null)
        .map((l) => ({
          id: l.id,
          name: l.name,
          lat: l.lat as number,
          lng: l.lng as number,
          status: l.status,
          trade: l.detectedTrade,
          city: l.city,
        })),
    [leads],
  );
  const mapShops = useMemo(
    () =>
      orgs
        .filter((o) => o.lat != null && o.lng != null)
        .map((o) => ({
          id: o.id,
          name: o.name,
          lat: o.lat as number,
          lng: o.lng as number,
          matchable: isMatchable(o),
        })),
    [orgs],
  );

  const missing = leads.length - mapLeads.length;

  return (
    <section className={cx("card rv", styles.mapCard)}>
      <div className={cx("card-head", styles.mapHead)}>
        <div className="card-titles">
          <div className="card-title">Map</div>
        </div>
        <div className={ui.filters} role="group" aria-label="What the map shows">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={cx(ui.filter, filter === f.key && ui.filterOn)}
              aria-pressed={filter === f.key}
              onClick={() => onFilter(f.key)}
            >
              {f.label}
              <i>{f.key === "leads" ? mapLeads.length : f.key === "shops" ? mapShops.length : mapLeads.length + mapShops.length}</i>
            </button>
          ))}
        </div>
      </div>

      {/* Armed: the next contractor clicked is offered this lead. The bar is
          the only thing standing between a click and a real assignment, so it
          names the homeowner and stays until it is cleared. */}
      {placing ? (
        <div className={styles.placing}>
          <span className={styles.placingDot} />
          <span className={styles.placingTxt}>
            Sending <b>{placing.name}</b> · {placing.detectedTrade ?? "project"} — click a contractor on the map.
          </span>
          <button type="button" className={styles.placingBtn} onClick={() => onOpenLead(placing.id)}>
            Lead details
          </button>
          <button type="button" className={styles.placingBtn} onClick={onClearPlacing}>
            Cancel
          </button>
        </div>
      ) : null}

      <LeadMap
        leads={mapLeads}
        shops={mapShops}
        filter={filter}
        selectedLeadId={placing?.id ?? null}
        onPickLead={onPickLead}
        onPickShop={onPickShop}
        className={styles.mapHost}
      />

      <div className={styles.legend}>
        <span className={styles.leg}>
          <span className={cx(styles.legSq, styles.legLead)} />
          Homeowner lead
        </span>
        <span className={styles.leg}>
          <span className={cx(styles.legSq, styles.legShop)} />
          Contractor
        </span>
        <span className={styles.leg}>Click a lead, then a contractor, to send it.</span>
        {missing > 0 ? (
          <span className={cx(styles.leg, styles.legRight)}>{missing} without an address</span>
        ) : null}
      </div>
    </section>
  );
}

/* ============================================================
   HOW THE MATCH IS MADE — the algorithm, drawn
   ============================================================ */

/** The live numbers from lib/leadCenter/matching.ts and cascade.ts. If those
 *  move, these move with them — the diagram is documentation that has to stay
 *  true, not decoration. */
const FACTORS = [
  { label: "Distance", weight: 45, note: "≈50 mi falloff" },
  { label: "Rating", weight: 35, note: "reviews, 4.0 prior" },
  { label: "Response", weight: 20, note: "past accept speed" },
];

function AlgorithmCard() {
  return (
    <section className="card rv">
      <div className="card-head">
        <div className="card-titles">
          <div className="card-title">How a lead is matched</div>
        </div>
      </div>

      {/* Step 1 — the gate. Three yes/no conditions, drawn as three blocks. */}
      <div className={styles.algoStep}>
        <span className={styles.algoNo}>1</span>
        <span className={styles.algoLbl}>Who is eligible</span>
      </div>
      <div className={styles.gates}>
        {["Offers on", "Has an address", "Covers the trade"].map((g) => (
          <span key={g} className={styles.gate}>
            <Ic name="check" />
            {g}
          </span>
        ))}
      </div>

      {/* Step 2 — the score. Bars sized by weight; the label carries the number
          so the picture and the figure agree. */}
      <div className={styles.algoStep}>
        <span className={styles.algoNo}>2</span>
        <span className={styles.algoLbl}>Score each one</span>
      </div>
      <div className={styles.factors}>
        {FACTORS.map((f) => (
          <div key={f.label} className={styles.factor}>
            <span className={styles.factorName}>{f.label}</span>
            <span className={styles.factorBar}>
              <span style={{ width: `${f.weight}%` }} />
            </span>
            <span className={styles.factorPct}>{f.weight}%</span>
            <span className={styles.factorNote}>{f.note}</span>
          </div>
        ))}
      </div>

      {/* Step 3 — the cascade. Three attempts, then here. */}
      <div className={styles.algoStep}>
        <span className={styles.algoNo}>3</span>
        <span className={styles.algoLbl}>Offer in order</span>
      </div>
      <div className={styles.cascade}>
        {[1, 2, 3].map((n) => (
          <span key={n} className={styles.casStep}>
            <span className={styles.casNo}>#{n}</span>
            <span className={styles.casTime}>24 h</span>
          </span>
        ))}
        <span className={styles.casArrow}>
          <Ic name="arrow" />
        </span>
        <span className={cx(styles.casStep, styles.casEnd)}>
          <span className={styles.casNo}>Queue</span>
          <span className={styles.casTime}>you route it</span>
        </span>
      </div>
    </section>
  );
}

/* ============================================================
   DETAIL SHEET — who they are, where the lead went, what you can do
   ============================================================ */

function DetailSheet({
  handleRef,
  orgs,
  onClosed,
  onPlace,
}: {
  handleRef: React.RefObject<DetailHandle | null>;
  orgs: OrgPickDTO[];
  onClosed: () => void;
  /** Hand this lead to the map: it arms, and the next contractor clicked gets
   *  it. The same journey as clicking the lead's pin, from the row. */
  onPlace: (id: string) => void;
}) {
  const router = useRouter();
  const [lead, setLead] = useState<PlatformLeadDTO | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllShops, setShowAllShops] = useState(false);
  const [showRanking, setShowRanking] = useState(false);

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
      setShowAllShops(false);
      setShowRanking(false);
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
      toast.success("Lead routed", `${lead.name} is in ${org.name}'s Incoming tab to accept.`);
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

  // Shops the lead can actually go to come first, and the rest stay behind a
  // disclosure — routing to a shop with no address is a thing an admin can do,
  // not a thing the list should suggest.
  const ranked = (a: OrgPickDTO, b: OrgPickDTO) => {
    if (!lead) return a.name.localeCompare(b.name);
    const ra = lead.ranking.findIndex((r) => r.orgId === a.id);
    const rb = lead.ranking.findIndex((r) => r.orgId === b.id);
    return (ra === -1 ? 999 : ra) - (rb === -1 ? 999 : rb) || a.name.localeCompare(b.name);
  };
  const readyShops = orgs.filter(isMatchable).sort(ranked);
  const otherShops = orgs.filter((o) => !isMatchable(o)).sort(ranked);

  return (
    <Sheet
      mdlRef={mdlRef}
      title={lead ? `${lead.name} · ${shortId(lead.id)}` : "Lead"}
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
            {lead.status !== "MATCHED" ? (
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  onPlace(lead.id);
                  close();
                }}
              >
                <Ic name="pin" />
                Pick on the map
              </button>
            ) : null}
            {lead.status === "MANUAL_QUEUE" ? (
              <button
                className={cx("btn btn-primary", busy === "requeue" && ui.btnBusy)}
                type="button"
                onClick={requeue}
                disabled={busy !== null}
              >
                <Ic name="send" />
                {busy === "requeue" ? "Sending…" : "Try the cascade again"}
              </button>
            ) : null}
          </>
        ) : null
      }
    >
      {!lead ? null : (
        <>
          {/* WHERE IS IT — the sentence the admin came for, first and in plain
              words. Everything below is the evidence for it. */}
          <div className={styles.dLede}>
            <Chip tone={statusTone(lead).tone}>{statusTone(lead).label}</Chip>
            <span>{whereItStands(lead)}</span>
          </div>

          {/* WHO THEY ARE — reachable, not just readable: the email and the
              phone are links, because the next thing an admin does with them is
              get in touch. */}
          <div className={styles.dSec}>Homeowner</div>
          <div className={styles.fields}>
            <Field label="Email">
              <a className={styles.link} href={`mailto:${lead.email}`}>
                {lead.email}
              </a>
            </Field>
            <Field label="Phone">
              {lead.phone ? (
                <a className={styles.link} href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}>
                  {lead.phone}
                </a>
              ) : (
                <span className={styles.dim}>not given</span>
              )}
            </Field>
            <Field label="Address">
              {[lead.address, place(lead)].filter(Boolean).join(" · ")}
              {lead.geocoded ? "" : " · no map pin"}
            </Field>
            <Field label="Trade">
              {lead.detectedTrade ?? lead.projectType ?? "Unclassified"}
              {lead.aiConfidence != null ? (
                <span className={styles.dim}> · {Math.round(lead.aiConfidence * 100)}% sure</span>
              ) : null}
            </Field>
          </div>

          {lead.description ? (
            <>
              <div className={styles.dSec}>What they asked for</div>
              <div className={styles.dDesc}>{lead.description}</div>
            </>
          ) : null}

          {/* THE TRAIL — only when there is one. Three empty boxes under three
              headings was most of the old sheet. */}
          {lead.offers.length ? (
            <>
              <div className={styles.dSec}>Offers sent</div>
              <div className={styles.tl}>
                {lead.offers.map((o) => (
                  <div key={o.id} className={styles.tlRow}>
                    <span title={o.orgName}>
                      {o.attempt}. {o.orgName}
                    </span>
                    <span className={styles.mono}>
                      {o.status === "OFFERED"
                        ? "waiting"
                        : o.status.toLowerCase() + (o.respondedAt ? ` ${relative(o.respondedAt)}` : "")}
                    </span>
                    <Chip tone={OFFER_TONE[o.status] ?? "mute"}>{Math.round(o.score * 100)}</Chip>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {lead.ranking.length ? (
            <>
              <button
                type="button"
                className={cx(styles.disclose, showRanking && styles.discloseOn)}
                onClick={() => setShowRanking((v) => !v)}
              >
                <Ic name="chev" />
                Why these shops ({lead.ranking.length} scored)
              </button>
              {showRanking ? (
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
              ) : null}
            </>
          ) : null}

          {lead.status !== "MATCHED" ? (
            <>
              <div className={styles.dSec}>Route it by hand</div>
              <div className={styles.assign}>
                {(showAllShops ? readyShops.concat(otherShops) : readyShops).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={styles.assignBtn}
                    disabled={busy !== null}
                    onClick={() => assign(o)}
                  >
                    <Ic name={isMatchable(o) ? "check" : "ban"} />
                    <span>{o.name}</span>
                    <i>{busy === o.id ? "routing…" : isMatchable(o) ? "" : eligibility(o)}</i>
                  </button>
                ))}
                {readyShops.length === 0 && !showAllShops ? (
                  <Empty>No shop is set up to take this lead yet.</Empty>
                ) : null}
                {otherShops.length ? (
                  <button
                    type="button"
                    className={cx(styles.disclose, showAllShops && styles.discloseOn)}
                    onClick={() => setShowAllShops((v) => !v)}
                  >
                    <Ic name="chev" />
                    {showAllShops ? "Hide" : `Show ${otherShops.length} not set up`}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

/** One plain sentence: where this request stands right now. */
function whereItStands(l: PlatformLeadDTO): string {
  switch (l.status) {
    case "MATCHED": {
      const shop = l.matchedOrgName ?? "a shop";
      const when = l.matchedAt ? ` on ${shortDate(l.matchedAt)}` : "";
      return l.shopLeadStatus === "ROUTED"
        ? `Sent to ${shop}${when} — waiting for them to accept it.`
        : `${shop} accepted it${when}.`;
    }
    case "OFFERED":
      return l.activeOffer
        ? `Offered to ${l.activeOffer.orgName} — attempt ${l.activeOffer.attempt} of 3, 24 hours to answer.`
        : "An offer is open.";
    case "MANUAL_QUEUE":
      if (l.queueReason === "NO_CANDIDATES") {
        return "No contractor covers this trade or area — route it by hand.";
      }
      if (l.queueReason === "MANUAL_MODE") {
        return "Held for you: routing is set to manual, so nothing was offered.";
      }
      return "Three contractors passed or ran out of time — route it by hand.";
    default:
      return "Ranking shops now.";
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldLbl}>{label}</div>
      <div className={styles.fieldVal}>{children}</div>
    </div>
  );
}

const OFFER_TONE: Record<string, Tone> = {
  OFFERED: "wait",
  ACCEPTED: "ok",
  DECLINED: "bad",
  EXPIRED: "mute",
  CANCELLED: "mute",
};

/* ============================================================
   CONTRACTOR SHEET — the shop's record, and the send-this-lead confirm
   ============================================================ */

type ShopHandle = { open: (shop: OrgPickDTO, lead: PlatformLeadDTO | null) => void };

function ShopSheet({
  handleRef,
  onSent,
}: {
  handleRef: React.RefObject<ShopHandle | null>;
  onSent: () => void;
}) {
  const router = useRouter();
  const [shop, setShop] = useState<OrgPickDTO | null>(null);
  const [lead, setLead] = useState<PlatformLeadDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { ref: mdlRef, open: openDialog, close: closeDialog } = useMdl();
  const close = useCallback(() => closeDialog(), [closeDialog]);

  const open = useCallback(
    (s: OrgPickDTO, l: PlatformLeadDTO | null) => {
      setShop(s);
      setLead(l);
      setError(null);
      setBusy(false);
      openDialog();
    },
    [openDialog],
  );
  useEffect(() => {
    handleRef.current = { open };
  }, [handleRef, open]);

  async function send() {
    if (!shop || !lead || busy) return;
    setBusy(true);
    setError(null);
    try {
      await manualAssignPlatformLead(lead.id, shop.id);
      toast.success("Lead sent", `${lead.name} is in ${shop.name}'s Incoming tab to accept.`);
      close();
      onSent();
      router.refresh();
    } catch (err) {
      setError(actionError(err));
    } finally {
      setBusy(false);
    }
  }

  const acceptPct =
    shop && shop.offersReceived > 0 ? Math.round((shop.offersAccepted / shop.offersReceived) * 100) : null;

  return (
    <Sheet
      mdlRef={mdlRef}
      title={shop ? shop.name : "Contractor"}
      titleId="lcShopTitle"
      size="md"
      onClose={close}
      error={error}
      foot={
        shop ? (
          <>
            <button className="btn btn-ghost" type="button" onClick={close} disabled={busy}>
              Close
            </button>
            {lead ? (
              <button
                className={cx("btn btn-primary", busy && ui.btnBusy)}
                type="button"
                onClick={() => void send()}
                disabled={busy}
              >
                <Ic name="send" />
                {busy ? "Sending…" : `Send ${lead.name}`}
              </button>
            ) : null}
          </>
        ) : null
      }
    >
      {!shop ? null : (
        <>
          <div className={styles.dLede}>
            <Chip tone={isMatchable(shop) ? "ok" : "mute"}>{eligibility(shop)}</Chip>
            <span>
              {shop.trades.length
                ? `Takes ${shop.trades.join(", ")}${shop.otherTrade ? `, ${shop.otherTrade}` : ""}.`
                : "No trades picked yet, so nothing can be matched to them."}
            </span>
          </div>

          <div className={styles.dSec}>Contact</div>
          <div className={styles.fields}>
            <Field label="Email">
              {shop.email ? (
                <a className={styles.link} href={`mailto:${shop.email}`}>
                  {shop.email}
                </a>
              ) : (
                <span className={styles.dim}>not set</span>
              )}
            </Field>
            <Field label="Phone">
              {shop.phone ? (
                <a className={styles.link} href={`tel:${shop.phone.replace(/[^\d+]/g, "")}`}>
                  {shop.phone}
                </a>
              ) : (
                <span className={styles.dim}>not set</span>
              )}
            </Field>
            <Field label="Address">
              {shop.address || <span className={styles.dim}>not set</span>}
              {shop.address && !shop.geocoded ? <span className={styles.dim}> · no map pin</span> : null}
            </Field>
            <Field label="With us since">{shortDate(shop.joinedAt)}</Field>
          </div>

          <div className={styles.dSec}>Track record</div>
          <div className={styles.fields}>
            <Field label="Offers seen">{shop.offersReceived}</Field>
            <Field label="Accepted">
              {shop.offersAccepted}
              {acceptPct != null ? <span className={styles.dim}> · {acceptPct}%</span> : null}
            </Field>
            <Field label="Leads held">{shop.leadsMatched}</Field>
            <Field label="Offers">{shop.offersEnabled ? "On" : "Paused"}</Field>
          </div>

          {/* WHAT IS ABOUT TO HAPPEN. The confirm button says the homeowner's
              name; this says what they asked for, so the decision is made on
              the job and not on a name alone. */}
          {lead ? (
            <>
              <div className={styles.dSec}>The lead you are sending</div>
              <div className={styles.dDesc}>
                <b>{lead.name}</b> · {lead.detectedTrade ?? lead.projectType ?? "Unclassified"} ·{" "}
                {place(lead)}
                {lead.description ? (
                  <>
                    <br />
                    {lead.description}
                  </>
                ) : null}
              </div>
            </>
          ) : null}
        </>
      )}
    </Sheet>
  );
}
