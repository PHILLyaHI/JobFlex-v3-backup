"use client";

// Traffic (2026-10-01 redesign): four sections in the order the owner reads
// them — Live now, Signups, Reports (one date scope over audience, conversion
// and the explorer) and the Ad links tool, closed at the foot. Each figure
// appears once; explanations sit in disclosures next to what they explain.
import Link from "next/link";
import { getAdsManagerClicks } from "@/actions/trafficClicks";
import { downloadText, reportToCsv } from "@/lib/traffic-export";
import { toast } from "@/components/ui/toast-store";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowDownToLine, ArrowUpRight, BarChart3, ChevronRight, FlaskConical, Info, RefreshCw, SlidersHorizontal, Users } from "lucide-react";
import { getSignupAttribution, getTrafficDashboard, getTrafficExperimentsAction, getTrafficStageVisitors } from "@/actions/trafficDashboard";
import { conversionInterval, pageLabel, percent, staleLabel, type ExperimentResult, type SignupAttribution, type StageVisitor, type StageVisitorsReport, type TrafficFilters, type TrafficReport } from "@/lib/traffic-contract";
import { dateInZone, shiftDate } from "@/lib/traffic-query";
import { Sheet, useMdl } from "@/components/v3/admin-influencers/admin-ui";
import { TrafficChart } from "./traffic-chart";
import { TrafficDatePicker } from "./traffic-date-picker";
import { AdsReconciliation, DailyPeople } from "./daily-tables";
import { TRAFFIC_SINCE, TRAFFIC_SINCE_SHORT, TRAFFIC_SINCE_LABEL } from "@/lib/traffic-visitor";
import { LivePanel } from "./live-panel";
import { SignupLedgerPanel } from "./signup-ledger";
import { AdLinks } from "./ad-links";
import type { LiveReport, SignupLedger } from "@/lib/traffic-live";
import s from "./traffic.module.css";

const n = (v: number | null | undefined) => v == null ? "--" : v.toLocaleString("en-US");
const rate = (v: number | null) => v == null ? "--" : `${v.toFixed(1)}%`;
const pageKeys = ["/", "/auth/login", "/auth/register", "registration:1", "registration:2", "registration:3"];
const dimensions = { sources: "Sources", referrers: "Referrers", campaigns: "Campaigns", devices: "Devices", browsers: "Browsers", countries: "Countries", terms: "Campaign terms" } as const;
type Dimension = keyof typeof dimensions;
function delta(current: number | undefined, previous: number | undefined) {
  if (current == null || previous == null) return "no comparison";
  if (!previous) return current ? "no previous baseline" : "no change";
  const d = (current - previous) / previous * 100;
  return `${d > 0 ? "+" : ""}${d.toFixed(1)}% vs previous period`;
}
function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  // `bp-sel-in` is load-bearing: the wrapper draws the chevron, and only that class removes the native one.
  return <label className={s.filterLabel}><span>{label}</span><div className={`bp-sel ${s.selectWrap}`}><select className="bp-sel-in" aria-label={label} value={value} onChange={e => onChange(e.target.value)}>{children}</select></div></label>;
}
/** Top values of one visitor attribute, for the drill-down summary. */
function tally(rows: StageVisitor[], pick: (v: StageVisitor) => string, limit = 4) {
  const counts = new Map<string, number>();
  for (const row of rows) { const key = pick(row) || "Unknown"; counts.set(key, (counts.get(key) || 0) + 1); }
  return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}
async function exportReport(report: TrafficReport, ledger: SignupLedger | null) {
  try {
    const [clicks, experiments] = await Promise.all([
      getAdsManagerClicks({ days: report.points.map((p) => p.date) }).catch(() => ({})),
      getTrafficExperimentsAction({ ...report.filters }),
    ]);
    downloadText(`jobflex-traffic-${report.filters.from}-${report.filters.to}.csv`, reportToCsv({ ...report, experiments }, ledger, clicks), "text/csv;charset=utf-8;");
  } catch {
    toast.error("Could not export", "Experiment results are unavailable. Retry when analytics reconnects.");
  }
}

const signupDimensions = { landingIndustry: "Landing trade", signupVariant: "Landing variant", utmSource: "utm_source", utmMedium: "utm_medium", utmCampaign: "utm_campaign", utmContent: "utm_content" } as const;
type SignupDimension = keyof typeof signupDimensions;
const outcomeRows = [["Trial attempts", "trialAttempts"], ["Purchase attempts", "purchaseAttempts"], ["Trials started", "trials"], ["Subscriptions purchased", "purchases"], ["Other activations", "other"]] as const;

export function AdminTrafficContent({ data, deferred = false, signups: initialSignups = null, live = null, ledger = null }: { data: TrafficReport; deferred?: boolean; signups?: SignupAttribution | null; live?: LiveReport | null; ledger?: SignupLedger | null }) {
  const [report, setReport] = useState(data);
  const [signups, setSignups] = useState(initialSignups);
  const [signupDimension, setSignupDimension] = useState<SignupDimension>("landingIndustry");
  const [draft, setDraft] = useState(data.filters);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const request = useRef(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tab, setTab] = useState<"pages" | "acquisition" | "experiments">("pages");
  const [dimension, setDimension] = useState<Dimension>("sources");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"visitors" | "pageviews" | "returningVisitors">("visitors");
  const [pageIndex, setPageIndex] = useState(0);
  const [experiment, setExperiment] = useState("");
  const [control, setControl] = useState("");
  const filters = report.filters;
  const t = report.totals;
  const update = (changes: Partial<TrafficFilters>) => setDraft(d => ({ ...d, ...changes }));
  function load(next: TrafficFilters) {
    const id = ++request.current;
    setError("");
    startTransition(async () => {
      try {
        const [result, attributed] = await Promise.all([getTrafficDashboard({ ...next }), getSignupAttribution({ ...next }).catch(() => null)]);
        if (id === request.current) { setReport(result); setDraft(result.filters); setSignups(attributed); }
      } catch (err) { if (id === request.current) setError(err instanceof Error ? err.message : "Could not refresh traffic."); }
    });
  }
  // The page painted before the PostHog report was ready (page.tsx): ask for
  // it now — the server's in-flight queries answer, nothing runs twice.
  const asked = useRef(false);
  useEffect(() => {
    if (!deferred || asked.current) return;
    asked.current = true;
    load(data.filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);
  function apply(changes: Partial<TrafficFilters>) {
    const next = { ...filters, ...changes };
    setDraft(next); load(next);
  }
  const changed = JSON.stringify(draft) !== JSON.stringify(filters);
  const options = <K extends "pages" | "sources" | "devices" | "hosts">(key: K) => Array.from(new Set([...data[key], ...report[key]].map(p => "page" in p ? p.page : p.name)));
  const availablePages = Array.from(new Set([...pageKeys, ...options("pages"), filters.page].filter(Boolean)));
  const rows = report.pages.filter(p => (p.page + " " + pageLabel(p.page)).toLowerCase().includes(search.toLowerCase())).sort((a, b) => b[sort] - a[sort]);
  const pageCount = Math.max(1, Math.ceil(rows.length / 20));
  const visiblePage = Math.min(pageIndex, pageCount - 1);
  const acquisition = report[dimension];
  // The A/B bench loads when its tab opens, not with the page (2026-10-01).
  const [exp, setExp] = useState<{ key: string; rows: ExperimentResult[]; failed: boolean } | null>(null);
  const expKey = JSON.stringify([filters, report.fetchedAt]);
  useEffect(() => {
    if (tab !== "experiments" || exp?.key === expKey) return;
    let live = true;
    getTrafficExperimentsAction({ ...filters }).then(rows => { if (live) setExp({ key: expKey, rows, failed: false }); }).catch(() => { if (live) setExp({ key: expKey, rows: [], failed: true }); });
    return () => { live = false; };
  }, [tab, expKey, exp?.key, filters]);
  const experimentRows = exp?.key === expKey ? exp.rows : [];
  const experimentNames = Array.from(new Set(experimentRows.map(e => e.experiment)));
  const selectedExperiment = experimentNames.includes(experiment) ? experiment : experimentNames[0] || "";
  const variants = experimentRows.filter(e => e.experiment === selectedExperiment);
  const baseline = variants.find(v => v.variant === control) || variants.find(v => v.variant === "control") || variants[0];
  const funnelEnd = report.funnel.at(-1);
  const stepCoverageDate = report.firstStepAt ? dateInZone(new Date(report.firstStepAt), filters.timezone) : null;
  const coverageIncomplete = !stepCoverageDate || filters.from <= stepCoverageDate;
  const failed = (name: string) => name === "experiments" ? exp?.key === expKey && exp.failed : report.errors.some(e => e.startsWith(name + ":"));
  const today = dateInZone(new Date(), draft.timezone);
  const activeFilters = [draft.page, draft.source, draft.device, draft.host, draft.audience !== "all", draft.environment !== "production"].filter(Boolean).length;
  const statusOk = report.status === "ok" && !report.errors.length && !report.stale;
  const updatedAt = new Date(report.fetchedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: filters.timezone });

  // Stage drill-down: who reached a funnel stage, with device, place and source.
  const [drill, setDrill] = useState<{ id: string; label: string } | null>(null);
  const [drillReport, setDrillReport] = useState<StageVisitorsReport | null>(null);
  const [drillError, setDrillError] = useState("");
  const [drillPending, setDrillPending] = useState(false);
  const drillRequest = useRef(0);
  const sheet = useMdl();
  function inspect(stage: { id: string; label: string }) {
    const id = ++drillRequest.current;
    setDrill(stage); setDrillReport(null); setDrillError(""); setDrillPending(true);
    sheet.open();
    getTrafficStageVisitors({ ...filters }, stage.id)
      .then(result => { if (id === drillRequest.current) setDrillReport(result); })
      .catch(err => { if (id === drillRequest.current) setDrillError(err instanceof Error ? err.message : "Could not load visitors."); })
      .finally(() => { if (id === drillRequest.current) setDrillPending(false); });
  }
  const when = (iso: string) => iso ? new Intl.DateTimeFormat("en-US", { timeZone: filters.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "--";
  const stageLabel = (id: string) => report.funnel.find(stage => stage.id === id)?.label || id || "--";
  const visitors = drillReport?.visitors ?? [];
  const place = (v: StageVisitor) => [v.city, v.region, v.country].filter(Boolean).join(", ");

  // Funnel limits that change how the numbers read stay visible; the rest is
  // in "About these numbers".
  const funnelNotes = [
    !report.firstStepAt && !failed("overview") && "Step tracking starts with this release. Earlier step conversions are not available.",
    stepCoverageDate && coverageIncomplete && `Step tracking covers this range only from ${stepCoverageDate}. Rates from landing are hidden.`,
    filters.page && "The page filter does not apply to this funnel.",
  ].filter(Boolean) as string[];

  return <div className={s.root} aria-busy={pending}>
    <div className={s.hint}>Saved October 1 layout · current analytics data · <Link href="/admin/traffic">Compare with redesigned Traffic →</Link></div>
    <header className={s.header}>
      <h1>Traffic v2<span>.</span></h1>
      <div className={s.headerMeta}>
        <span className={s.status} data-state={statusOk ? "ok" : "warning"}><i/>{deferred && !report.totals && !error ? "Loading PostHog…" : report.status === "disabled" ? "PostHog not connected" : report.status !== "ok" || report.stale ? "PostHog unavailable" : report.errors.length ? "Partial data" : "PostHog connected"}</span>
        <span className={s.updated}>{pending ? "Querying PostHog…" : `Report updated ${updatedAt}`}</span>
        {/* Every figure counts from the ad launch; this brings the earlier history back. */}
        <label className={s.chip} title={`Every figure counts from ${TRAFFIC_SINCE_LABEL} (the ad launch) unless this is on`}><input type="checkbox" checked={filters.fullHistory} disabled={pending} onChange={e => apply({ fullHistory: e.target.checked })}/>Full history</label>
      </div>
    </header>

    {/* Who is on the site this minute, where from, how far they got (2026-09-28). */}
    {live ? <LivePanel initial={live} timezone={filters.timezone} fullHistory={filters.fullHistory}/>
      : <div className={s.card}><div className={s.kpis} data-cols="2">
        <div className={s.kpi} data-lead="true"><span>Visitors today</span><strong>{n(report.today)}</strong><small>selected host &amp; environment</small></div>
        <div className={s.kpi}><span>{filters.fullHistory ? "All-time visitors" : "Visitors since " + TRAFFIC_SINCE_SHORT}</span><strong>{n(report.lifetime)}</strong><small>live view unavailable</small></div>
      </div></div>}
    {/* Every signup, kept — the live view above only holds half an hour. */}
    {ledger && <SignupLedgerPanel initial={ledger} timezone={filters.timezone} fullHistory={filters.fullHistory}/>}

    {report.stale && <div className={s.notice} role="status"><Info size={16}/><strong>{staleLabel(report.stale, filters.timezone)}</strong></div>}
    <section className={s.section} id="reports" aria-labelledby="traffic-reports-title">
      <header className={s.sectionHead}>
        <div className={s.sectionTitle}>
          <span className={s.sectionIcon} aria-hidden="true"><BarChart3 size={22}/></span>
          <div>
            <h2 id="traffic-reports-title">Reports</h2>
            <p className={s.sectionMeta}>{filters.from} to {filters.to} · {filters.timezone} · {filters.fullHistory ? "full history" : `since ${TRAFFIC_SINCE_LABEL}`}{filters.page ? ` · ${pageLabel(filters.page)}` : ""}{filters.audience !== "all" ? ` · ${filters.audience} visitors` : ""}</p>
          </div>
        </div>
        <div className={s.sectionTools}>
          <button className={s.button} onClick={() => void exportReport(report, ledger)} disabled={(!t && !signups) || pending}><ArrowDownToLine size={15}/>Export CSV</button>
          <button className={s.iconButton} aria-label="Refresh report" onClick={() => load(filters)} disabled={pending}><RefreshCw size={16} className={pending ? s.spin : ""}/></button>
        </div>
      </header>

      {/* The scope: one bar that every report below reads from. */}
      <div className={s.scope} aria-label="Report scope">
        <div className={s.scopeRow}>
          <TrafficDatePicker from={draft.from} to={draft.to} timezone={draft.timezone} min={draft.fullHistory ? undefined : TRAFFIC_SINCE} onChange={(from, to) => update({ from, to })}/>
          <div className={s.segment} role="group" aria-label="Quick ranges">{[1, 7, 14, 30, 90].map(days => <button key={days} aria-pressed={draft.from === shiftDate(today, 1 - days) && draft.to === today} onClick={() => update({ from: shiftDate(today, 1 - days), to: today })}>{days === 1 ? "Today" : `${days}D`}</button>)}</div>
          <button type="button" className={s.button} aria-expanded={filtersOpen} aria-controls="traffic-filters" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={15}/>Filters{activeFilters > 0 && <em className={s.count}>{activeFilters}</em>}</button>
          <div className={s.scopeActions}>
            {changed && <span className={s.unsaved}>Not applied yet</span>}
            <button className={s.textButton} onClick={() => { const next = { ...data.filters, from: shiftDate(today, -29), to: today }; setDraft(next); load(next); }} disabled={pending}>Reset</button>
            <button className={s.primary} onClick={() => load(draft)} disabled={pending || !changed}>{pending ? "Updating…" : "Apply"}</button>
          </div>
        </div>
        {filtersOpen && <div className={s.filters} id="traffic-filters">
          <Select label="Page / screen" value={draft.page} onChange={page => update({ page })}><option value="">All pages</option>{availablePages.map(p => <option key={p} value={p}>{pageLabel(p)}</option>)}</Select>
          <Select label="Audience" value={draft.audience} onChange={audience => update({ audience: audience as TrafficFilters["audience"] })}><option value="all">All visitors</option><option value="new">New visitors</option><option value="returning">Returning visitors</option></Select>
          <Select label="Source" value={draft.source} onChange={source => update({ source })}><option value="">All sources</option>{options("sources").map(name => <option key={name}>{name}</option>)}</Select>
          <Select label="Device" value={draft.device} onChange={device => update({ device })}><option value="">All devices</option>{options("devices").map(name => <option key={name} value={name === "Unknown" ? "__unknown__" : name}>{name}</option>)}</Select>
          <Select label="Environment" value={draft.environment} onChange={environment => update({ environment: environment as TrafficFilters["environment"] })}><option value="production">www.jobflex.app</option><option value="all">www.jobflex.app + localhost</option><option value="development">Localhost only</option></Select>
          <Select label="Hostname" value={draft.host} onChange={host => update({ host })}><option value="">All hostnames</option>{options("hosts").filter(Boolean).map(name => <option key={name} value={name === "Unknown" ? "__unknown__" : name}>{name}</option>)}</Select>
          <Select label="Timezone" value={draft.timezone} onChange={timezone => update({ timezone })}>{Array.from(new Set([draft.timezone, "America/Los_Angeles", "America/New_York", "Europe/London", "UTC"])).map(z => <option key={z}>{z}</option>)}</Select>
        </div>}
      </div>

      {(error || report.message || report.errors.length > 0) && <div className={s.notice} role="alert"><Info size={18}/><div><strong>{error || report.message || "Some reports are unavailable."}</strong>{report.errors.length > 0 && <details><summary>Query details</summary>{report.errors.map(e => <p key={e}>{e}</p>)}</details>}</div></div>}

      {/* ── Audience ── */}
      <div className={s.card}>
        <div className={s.cardHead}><div><h3>Audience</h3><p className={s.cardMeta}>{filters.page ? pageLabel(filters.page) : "All pages"}</p></div></div>
        <div className={s.kpis} data-cols="7">
          <div className={s.kpi} data-lead="true"><span>Visitors</span><strong>{n(t?.visitors)}</strong><small>{delta(t?.visitors, report.previous?.visitors)}</small></div>
          <div className={s.kpi}><span>People (est.)</span><strong>{n(report.people?.people)}</strong><small>{report.people && t?.visitors ? `${n(report.people.inAppVisitors)} in-app clicks → ${n(report.people.inAppPeople)} people` : "address + browser"}</small></div>
          <div className={s.kpi}><span>New</span><strong>{n(t?.newVisitors)}</strong><small>{rate(t ? percent(t.newVisitors, t.visitors) : null)} of visitors</small></div>
          <div className={s.kpi}><span>Returning</span><strong>{n(t?.returningVisitors)}</strong><small>{rate(t ? percent(t.returningVisitors, t.visitors) : null)} of visitors</small></div>
          <div className={s.kpi}><span>Repeat</span><strong>{n(t?.repeatVisitors)}</strong><small>2+ sessions in range</small></div>
          <div className={s.kpi}><span>Sessions</span><strong>{n(t?.sessions)}</strong><small>{t?.visitors ? (t.sessions / t.visitors).toFixed(2) : "--"} per visitor</small></div>
          <div className={s.kpi}><span>{filters.page.startsWith("registration:") ? "Screen views" : "Pageviews"}</span><strong>{n(t?.pageviews)}</strong><small>{delta(t?.pageviews, report.previous?.pageviews)}</small></div>
        </div>
        <TrafficChart points={report.points}/>
      </div>

      {report.points.length > 0 && <DailyPeople points={report.points}/>}
      {report.points.length > 0 && <AdsReconciliation points={report.points}/>}

      {/* ── Conversion ── */}
      <div className={s.card}>
        <div className={s.cardHead}><div><h3>Visit to signup</h3><p className={s.cardMeta}>Landing entrants in range · unique visitors, in order</p></div><div className={s.cardTools}><Select label="Flow" value={filters.flow} onChange={flow => apply({ flow: flow as TrafficFilters["flow"] })}><option value="all">All flows</option><option value="standard">Email signup</option><option value="google">Google signup</option></Select><Select label="Window" value={String(filters.windowDays)} onChange={v => apply({ windowDays: Number(v) })}>{[1, 7, 14].map(d => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}</Select><Select label="Billing" value={filters.billingMode} onChange={v => apply({ billingMode: v as TrafficFilters["billingMode"] })}><option value="live">Live only</option><option value="test">Test only</option><option value="all">Live + test</option></Select></div></div>
        {funnelNotes.length > 0 && <div className={s.cardNote}><Info size={16}/><span>{funnelNotes.join(" ")}</span></div>}
        <div className={s.funnelLayout}>
          <div className={s.funnelTable}><div className={s.funnelHeading}><span>Stage <em>· select one to see who reached it</em></span><span>Visitors</span><span>Step</span><span>From landing</span></div>
            {report.funnel.map((stage, i) => {
              const untracked = !report.firstStepAt && i >= 2;
              const base = report.funnel[0]?.visitors || 0;
              const prev = report.funnel[i - 1]?.visitors || 0;
              return <button type="button" className={s.funnelRow} key={stage.id} disabled={untracked || pending} aria-pressed={drill?.id === stage.id && sheet.isOpen} aria-label={`${stage.label}: ${untracked ? "not tracked" : n(stage.visitors) + " visitors"}. Show who reached this stage.`} onClick={() => inspect(stage)}><span className={s.stage}><span className={s.stageNumber}>{String(i + 1).padStart(2, "0")}</span><span className={s.stageBody}><b>{stage.label}<ChevronRight size={15} aria-hidden="true"/></b><span className={s.funnelBar}><span style={{ width: `${untracked ? 0 : percent(stage.visitors, base) ?? 0}%` }}/></span>{i > 0 && !untracked && !(i === 2 && coverageIncomplete) && <small>{n(Math.max(0, prev - stage.visitors))} dropped</small>}</span></span><strong>{untracked ? "--" : n(stage.visitors)}</strong><span>{untracked || !i || (i === 2 && coverageIncomplete) ? "--" : rate(percent(stage.visitors, prev))}</span><span>{untracked || (i >= 2 && coverageIncomplete) ? "--" : rate(percent(stage.visitors, base))}</span></button>;
            })}
            {!report.funnel.length && <div className={s.empty}>Funnel unavailable. Retry the report.</div>}
          </div>
          <aside className={s.plate} aria-label="Registration totals">
            <span className={s.plateLabel}>Registered organizations</span>
            <strong>{n(signups?.total)}</strong>
            <span className={s.plateSub}>{filters.from} to {filters.to} · database</span>
            {!signups && <p role="status" className={s.plateWarn}>Registration total unavailable. Refresh to retry.</p>}
            <dl className={s.outcomes}>
              <div data-key="true"><dt>Tracked funnel signups</dt><dd>{report.firstStepAt && funnelEnd ? n(funnelEnd.visitors) : "--"}</dd></div>
              <div data-key="true"><dt>Tracked conversion</dt><dd>{!coverageIncomplete && funnelEnd ? rate(percent(funnelEnd.visitors, report.funnel[0]?.visitors || 0)) : "--"}</dd></div>
              {outcomeRows.map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{report.firstStepAt ? n(report.funnelOutcomes?.[key]) : "--"}</dd></div>)}
            </dl>
          </aside>
        </div>
        {/* Landing variant d vs e (landing-e pass A): signup starts → verified signups, per arm. */}
        {!!report.variants.length && <div className={s.cardBlock}><h4 className={s.blockTitle}>Landing variants</h4><div className={s.tableScroll}><table className={s.table}><thead><tr><th>Variant</th><th>Signup starts</th><th>Verified signups</th><th>Start → complete</th></tr></thead><tbody>{report.variants.map(v => <tr key={v.variant}><td><b>{v.variant === "e" ? "e / landing-e" : "d / landing"}</b></td><td><b>{n(v.started)}</b></td><td>{n(v.completed)}</td><td>{coverageIncomplete ? "--" : rate(percent(v.completed, v.started))}</td></tr>)}</tbody></table></div></div>}
        <details className={s.cardDisclosure}><summary><Info size={15}/>About these numbers</summary><ul>
          <li><b>Registered organizations</b> is the database count: one per organization, across all signup flows, billing modes and traffic sources. Missing analytics events never reduce it; deleted organizations are excluded. A registration is not necessarily a paid subscription.</li>
          <li><b>Tracked</b> figures need every funnel step recorded in PostHog, so a real signup can be missing from them.</li>
          <li><b>Attempt</b> = button clicked. <b>Verified</b> = Stripe confirmed and the account was created. {filters.billingMode === "live" ? "Test checkouts are excluded." : filters.billingMode === "test" ? "Only test checkout outcomes are shown." : "Live and test outcomes are included."} Attempts cannot know the billing mode yet.</li>
          {filters.flow === "all" && <li>Email and Google signups are combined and counted once per visitor. The email-only Account step is left out because Google skips it.</li>}
          <li>{filters.windowDays}-day window from the first eligible landing. Recent cohorts may still convert.</li>
        </ul></details>
      </div>

      {/* ── Explore ── */}
      <div className={s.card}>
        <div className={s.exploreTabs} role="tablist" aria-label="Detailed reports">{(["pages", "acquisition", "experiments"] as const).map(key => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{key === "pages" ? "Pages" : key === "acquisition" ? "Acquisition" : "A/B tests"}<span>{key === "pages" ? n(report.pages.length) : key === "acquisition" ? n(report.sources.length) : n(experimentNames.length)}</span></button>)}</div>
        {tab === "pages" && <div className={s.exploreBody}>
          <div className={s.exploreHead}>
            <div className={s.tabs} role="group" aria-label="Page shortcuts">{pageKeys.map(p => <button key={p} aria-pressed={filters.page === p} onClick={() => apply({ page: p })}>{pageLabel(p)}</button>)}{filters.page && <button onClick={() => apply({ page: "" })}>Clear</button>}</div>
            <div className={s.pageTools}><input type="search" className={s.input} aria-label="Find a page" placeholder="Find a page…" value={search} onChange={e => { setSearch(e.target.value); setPageIndex(0); }}/><Select label="Sort" value={sort} onChange={v => { setSort(v as typeof sort); setPageIndex(0); }}><option value="visitors">Visitors</option><option value="pageviews">Views</option><option value="returningVisitors">Returning</option></Select></div>
          </div>
          <div className={s.tableScroll}><table className={s.table}><thead><tr><th>Page / screen</th><th>Visitors</th><th>New</th><th>Returning</th><th>Repeat</th><th>Sessions</th><th>Views</th></tr></thead><tbody>{rows.slice(visiblePage * 20, (visiblePage + 1) * 20).map(p => <tr key={p.page} data-selected={filters.page === p.page}><td><button className={s.pageLink} onClick={() => apply({ page: p.page })} title="Filter the reports to this page"><span>{pageLabel(p.page)}{pageLabel(p.page) !== p.page && <small>{p.page}</small>}</span></button></td><td><b>{n(p.visitors)}</b></td><td>{n(p.newVisitors)}</td><td>{n(p.returningVisitors)}<small>{rate(percent(p.returningVisitors, p.visitors))}</small></td><td>{n(p.repeatVisitors)}</td><td>{n(p.sessions)}</td><td>{n(p.pageviews)}</td></tr>)}</tbody></table></div>
          {rows.length > 20 && <div className={s.pagination}><span>{visiblePage * 20 + 1}–{Math.min(rows.length, (visiblePage + 1) * 20)} of {rows.length}</span><button className={s.button} disabled={visiblePage === 0} onClick={() => setPageIndex(visiblePage - 1)}>Previous</button><button className={s.button} disabled={visiblePage === pageCount - 1} onClick={() => setPageIndex(visiblePage + 1)}>Next</button></div>}
          {!rows.length && <div className={s.empty}>{failed("pages") ? "Page report unavailable." : "No matching page activity in this range."}</div>}
        </div>}

        {tab === "acquisition" && <div className={s.exploreBody}>
          <div className={s.tabs} role="group" aria-label="Dimension">{Object.entries(dimensions).map(([key, label]) => <button key={key} aria-pressed={dimension === key} onClick={() => setDimension(key as Dimension)}>{label}</button>)}</div>
          <div className={s.tableScroll}><table className={s.table}><thead><tr><th>{dimensions[dimension]}</th><th>Visitors</th><th>Sessions</th><th>Signups</th><th>Signup rate</th></tr></thead><tbody>{acquisition.map(row => <tr key={row.name}><td><div className={s.sourceName}>{dimension === "sources" ? <button onClick={() => apply({ source: row.name })} title="Filter the reports to this source">{row.name}</button> : <b>{row.name === " /  / " ? "No UTM campaign" : row.name}</b>}<div className={s.sourceBar}><span style={{ width: `${percent(row.visitors, acquisition[0]?.visitors || 1) ?? 0}%` }}/></div></div></td><td><b>{n(row.visitors)}</b></td><td>{n(row.sessions)}</td><td>{report.firstStepAt ? n(row.conversions) : "--"}</td><td>{coverageIncomplete ? "--" : rate(percent(row.conversions, row.visitors))}</td></tr>)}</tbody></table>{!acquisition.length && <div className={s.empty}>{failed("breakdowns") ? "Acquisition report unavailable." : "No recorded data for this dimension."}</div>}</div>
          <p className={s.hint}>Session-entry attribution, top 20. Signups are verified within the conversion window after a visit.{coverageIncomplete && " Signup rates are hidden until the range has full tracking coverage."}</p>
          {signups && <div className={s.subBlock}>
            <div className={s.subHead}><h4 className={s.blockTitle}>Signups by landing trade and campaign</h4><span className={s.cardMeta}>{n(signups.total)} signups · database</span></div>
            <div className={s.tabs} role="group" aria-label="Signup dimension">{Object.entries(signupDimensions).map(([key, label]) => <button key={key} aria-pressed={signupDimension === key} onClick={() => setSignupDimension(key as SignupDimension)}>{label}</button>)}</div>
            <div className={s.tableScroll}><table className={s.table}><thead><tr><th>{signupDimensions[signupDimension]}</th><th>Signups</th><th>Share</th></tr></thead><tbody>{signups.dimensions[signupDimension].map(row => <tr key={row.name}><td><b>{row.name}</b></td><td><b>{n(row.signups)}</b></td><td>{rate(percent(row.signups, signups.total))}</td></tr>)}</tbody></table>{!signups.dimensions[signupDimension].length && <div className={s.empty}>No signups in this range.</div>}</div>
          </div>}
          <details className={s.cardDisclosure} data-inline="true"><summary><Info size={15}/>What sources can and can&apos;t show</summary><ul>
            <li>Google, Bing, Instagram and other referrers appear when the browser passes them. Tagged links also carry campaign and medium.</li>
            <li>Exact organic searches and browsing history are usually private. Missing referrers appear as direct / unknown. One visitor can use several sources; privacy settings and blockers reduce coverage.</li>
            <li>Campaign terms come from <code>utm_term</code>, not organic search queries. For search queries use <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer">Google Search Console</a> or <a href="https://www.bing.com/webmasters" target="_blank" rel="noreferrer">Bing Webmaster Tools</a>.</li>
          </ul></details>
        </div>}

        {tab === "experiments" && <div className={s.exploreBody}>
          {!variants.length ? failed("experiments") ? <div className={s.empty}>Experiment results are unavailable. Retry the report.</div> : <div className={s.experimentEmpty}><span className={s.sectionIcon} aria-hidden="true"><FlaskConical size={20}/></span><div><h4>No experiment exposures in this range</h4><p>When a test runs, this compares visitors who actually saw each version — not everyone who visited.</p></div></div> : <>
            <div className={s.experimentControls}><Select label="Experiment" value={selectedExperiment} onChange={setExperiment}>{experimentNames.map(name => <option key={name}>{name}</option>)}</Select><Select label="Compare against" value={baseline?.variant || ""} onChange={setControl}>{variants.map(v => <option key={v.variant}>{v.variant}</option>)}</Select></div>
            <div className={s.tableScroll}><table className={s.table}><thead><tr><th>Variant</th><th>Exposed</th><th>Attempts</th><th>Attempt rate</th><th>Verified</th><th>Signup rate</th><th>Lift</th><th>95% interval</th></tr></thead><tbody>{variants.map(v => {
              const r = percent(v.completed, v.visitors);
              const b = baseline ? percent(baseline.completed, baseline.visitors) : null;
              const ci = conversionInterval(v.completed, v.visitors);
              return <tr key={v.variant}><td><b>{v.variant}</b>{v === baseline && <small>Baseline</small>}</td><td>{n(v.visitors)}</td><td>{n(v.attempts)}</td><td>{rate(percent(v.attempts, v.visitors))}</td><td>{n(v.completed)}</td><td><b>{rate(r)}</b></td><td>{v === baseline ? "--" : b && r != null ? `${((r / b - 1) * 100).toFixed(1)}%` : "--"}</td><td>{ci ? `${rate(ci[0])} to ${rate(ci[1])}` : "--"}</td></tr>;
            })}</tbody></table></div>
            <p className={s.hint}>{n(variants.reduce((sum, v) => sum + v.mixedVisitors, 0))} visitors with mixed exposures excluded. The page filter does not apply. Rates use a {filters.windowDays}-day window after first exposure. No automatic winner: the 95% Wilson interval shows uncertainty in each rate, not significance between variants.</p>
          </>}
          {failed("experiments") && <div className={s.notice}>Experiment results could not be loaded. This does not mean no experiments exist.</div>}
        </div>}
      </div>
    </section>

    {/* The tagged link for every ad and post (2026-09-29) — a tool, closed by default. */}
    <AdLinks/>

    <Sheet mdlRef={sheet.ref} title={drill ? `${drill.label} / who reached it` : "Stage visitors"} titleId="trafficStageVisitors" size="drawer" onClose={sheet.close} error={drillError || null}>
      <div className={s.drill}>
        <div className={s.drillLead}><Users size={18}/><div><strong>{drillPending ? "Loading" : n(drillReport?.total)}</strong><span>{drillPending ? "Querying PostHog…" : `visitor${drillReport?.total === 1 ? "" : "s"} reached ${drill?.label ?? "this stage"} / ${filters.from} to ${filters.to}`}</span></div></div>
        {visitors.length > 0 && <div className={s.drillSummary}>
          {([["Devices", (v: StageVisitor) => v.device], ["Countries", (v: StageVisitor) => v.country], ["Sources", (v: StageVisitor) => v.source]] as const).map(([label, pick]) => <div key={label}><h3>{label}</h3><ul>{tally(visitors, pick).map(item => <li key={item.name}><span>{item.name}</span><b>{n(item.count)}</b><i style={{ width: `${percent(item.count, visitors.length) ?? 0}%` }}/></li>)}</ul></div>)}
        </div>}
        {drillPending && <div className={s.drillSkeleton} aria-hidden="true">{[0, 1, 2, 3].map(i => <span key={i}/>)}</div>}
        {!drillPending && !drillError && drillReport && !visitors.length && <div className={s.empty}>No visitors reached this stage in the selected range.</div>}
        {visitors.length > 0 && <ol className={s.drillList} aria-label="Visitors">
          {visitors.map(v => <li key={v.id}>
            <div className={s.drillWho}><b>{[v.device, v.browser, v.os].filter(Boolean).join(" / ") || "Unknown device"}</b><span>{place(v) || "Unknown location"}</span><span>{v.source || "Direct / unknown"}{v.referrer && v.referrer !== v.source ? ` / ${v.referrer}` : ""}{v.campaign ? ` / ${v.campaign}` : ""}</span></div>
            <div className={s.drillFacts}><span><em>Reached</em>{when(v.reachedAt)}</span><span><em>Got to</em>{stageLabel(v.furthest)}</span><span><em>Activity</em>{n(v.sessions)} session{v.sessions === 1 ? "" : "s"} / {n(v.views)} view{v.views === 1 ? "" : "s"}</span>{v.personUrl && <a href={v.personUrl} target="_blank" rel="noreferrer">PostHog profile <ArrowUpRight size={13}/></a>}</div>
          </li>)}
        </ol>}
        {drillReport && drillReport.total > visitors.length && <p className={s.hint}>Showing the {n(visitors.length)} most recent of {n(drillReport.total)}. Narrow the date range for the rest.</p>}
        <p className={s.hint}>Device and browser come from the visitor&apos;s own browser. Location is estimated from IP address and can be approximate. Source is the first thing recorded in the landing session. Activity counts inside the {filters.windowDays}-day conversion window.</p>
      </div>
    </Sheet>
  </div>;
}
