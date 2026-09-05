"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowDownToLine, ArrowUpRight, RefreshCw, SlidersHorizontal, FlaskConical, Info } from "lucide-react";
import { getTrafficDashboard } from "@/actions/trafficDashboard";
import { conversionInterval, pageLabel, percent, type TrafficFilters, type TrafficReport } from "@/lib/traffic-contract";
import { dateInZone, shiftDate } from "@/lib/traffic-query";
import { TrafficChart } from "./traffic-chart";
import { TrafficDatePicker } from "./traffic-date-picker";
import s from "./traffic.module.css";

const n = (v: number | null | undefined) => v == null ? "--" : v.toLocaleString("en-US");
const rate = (v: number | null) => v == null ? "--" : `${v.toFixed(1)}%`;
const pageKeys = ["/", "/auth/login", "/auth/register", "registration:1", "registration:2", "registration:3"];
const dimensions = { sources: "Sources", referrers: "Referrers", campaigns: "Campaigns", devices: "Devices", browsers: "Browsers", countries: "Countries", terms: "Campaign terms" } as const;
type Dimension = keyof typeof dimensions;
function delta(current: number | undefined, previous: number | undefined) {
  if (current == null || previous == null) return "Comparison unavailable";
  if (!previous) return current ? "No previous baseline" : "No change";
  const d = (current - previous) / previous * 100;
  return `${d > 0 ? "+" : ""}${d.toFixed(1)}% vs previous period`;
}
function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return <label className={s.filterLabel}><span>{label}</span><div className={`bp-sel ${s.selectWrap}`}><select value={value} onChange={e => onChange(e.target.value)}>{children}</select></div></label>;
}
function csvCell(value: unknown) {
  const text = String(value ?? "");
  return '"' + (/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""') + '"';
}
function exportReport(report: TrafficReport) {
  const coverageIncomplete = !report.firstStepAt || report.filters.from <= dateInZone(new Date(report.firstStepAt), report.filters.timezone);
  const rows: unknown[][] = [
    ["JobFlex traffic", report.filters.from, report.filters.to, report.filters.timezone],
    ["Filters", JSON.stringify(report.filters)],
    ["Daily", "Visitors", "New", "Returning", "Repeat visitors", "Sessions", "Views"],
    ...report.points.map(p => [p.date, p.visitors, p.newVisitors, p.returningVisitors, p.repeatVisitors, p.sessions, p.pageviews]),
    [], ["Page / step", "Visitors", "New", "Returning", "Repeat visitors", "Sessions", "Views"],
    ...report.pages.map(p => [p.page, p.visitors, p.newVisitors, p.returningVisitors, p.repeatVisitors, p.sessions, p.pageviews]),
    [], ["Funnel", "Visitors", "Previous step %", "Landing %"],
    ...report.funnel.map((p, i) => [p.label, !report.firstStepAt && i >= 2 ? null : p.visitors,
      !i || (!report.firstStepAt && i >= 2) || (coverageIncomplete && i === 2) ? null : percent(p.visitors, report.funnel[i - 1].visitors),
      coverageIncomplete && i >= 2 ? null : percent(p.visitors, report.funnel[0].visitors)]),
    [], ["Funnel outcomes", "Visitors"], ...Object.entries(report.funnelOutcomes || {}).map(([key, value]) => [key, report.firstStepAt ? value : null]),
    [], ["Acquisition", "Name", "Visitors", "Sessions", "Verified signups"],
    ...Object.keys(dimensions).flatMap(key => report[key as Dimension].map(p => [key, p.name, p.visitors, p.sessions, report.firstStepAt ? p.conversions : null])),
    [], ["Experiment", "Variant", "Exposed", "Attempts", "Verified signups", "Mixed exposures excluded"],
    ...report.experiments.map(e => [e.experiment, e.variant, e.visitors, e.attempts, e.completed, e.mixedVisitors]),
  ];
  const url = URL.createObjectURL(new Blob([rows.map(row => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url; link.download = `jobflex-traffic-${report.filters.from}-${report.filters.to}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AdminTrafficContent({ data }: { data: TrafficReport }) {
  const [report, setReport] = useState(data);
  const [draft, setDraft] = useState(data.filters);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const request = useRef(0);
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
        const result = await getTrafficDashboard({ ...next });
        if (id === request.current) { setReport(result); setDraft(result.filters); }
      } catch (err) { if (id === request.current) setError(err instanceof Error ? err.message : "Could not refresh traffic."); }
    });
  }
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
  const experimentNames = Array.from(new Set(report.experiments.map(e => e.experiment)));
  const selectedExperiment = experimentNames.includes(experiment) ? experiment : experimentNames[0] || "";
  const variants = report.experiments.filter(e => e.experiment === selectedExperiment);
  const baseline = variants.find(v => v.variant === control) || variants.find(v => v.variant === "control") || variants[0];
  const funnelEnd = report.funnel.at(-1);
  const stepCoverageDate = report.firstStepAt ? dateInZone(new Date(report.firstStepAt), filters.timezone) : null;
  const coverageIncomplete = !stepCoverageDate || filters.from <= stepCoverageDate;
  const failed = (name: string) => report.errors.some(e => e.startsWith(name + ":"));
  const today = dateInZone(new Date(), draft.timezone);

  return <div className={s.root} aria-busy={pending}>
    <header className={s.header}>
      <div><div className={s.eyebrow}>Platform intelligence / 01</div><h1>Traffic<span>.</span></h1></div>
      <div className={s.headerActions}><span className={s.status} data-state={report.status === "ok" && !report.errors.length ? "ok" : "warning"}><i/>{report.status === "disabled" ? "Not connected" : report.status !== "ok" ? "Unavailable" : report.errors.length ? "Partial data" : "PostHog connected"}</span>
        <button className={s.button} onClick={() => exportReport(report)} disabled={!t || pending}><ArrowDownToLine size={15}/>Export CSV</button>
        <button className={s.iconButton} aria-label="Refresh traffic" onClick={() => load(filters)} disabled={pending}><RefreshCw size={17} className={pending ? s.spin : ""}/></button>
      </div>
    </header>

    <div className={s.lifetime}><span>All-time visitors <strong>{n(report.lifetime)}</strong></span><span>Today <strong>{n(report.today)}</strong></span><span className={s.scope}>Site-wide / selected host &amp; environment</span><span className={s.updated}>{pending ? "Querying PostHog..." : `Updated ${new Date(report.fetchedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: filters.timezone })}`}</span></div>

    <section className={s.filterPanel} aria-label="Traffic filters">
      <div className={s.rangeRow}><div className={s.filterCaption}><SlidersHorizontal size={16}/><span>Report scope</span></div><TrafficDatePicker from={draft.from} to={draft.to} timezone={draft.timezone} onChange={(from, to) => update({ from, to })}/>
        <div className={s.segment}>{[1, 7, 30, 90].map(days => <button key={days} aria-pressed={draft.from === shiftDate(today, 1 - days) && draft.to === today} onClick={() => update({ from: shiftDate(today, 1 - days), to: today })}>{days === 1 ? "Today" : `${days}D`}</button>)}</div>
      </div>
      <details className={s.filtersDisclosure}><summary>Page, audience &amp; source filters<span>{[draft.page, draft.source, draft.device, draft.host, draft.audience !== "all", draft.environment !== "all"].filter(Boolean).length || "All traffic"}</span></summary><div className={s.filters}>
        <Select label="Page / screen" value={draft.page} onChange={page => update({ page })}><option value="">All pages</option>{availablePages.map(p => <option key={p} value={p}>{pageLabel(p)}</option>)}</Select>
        <Select label="Audience" value={draft.audience} onChange={audience => update({ audience: audience as TrafficFilters["audience"] })}><option value="all">All visitors</option><option value="new">New visitors</option><option value="returning">Returning visitors</option></Select>
        <Select label="Source" value={draft.source} onChange={source => update({ source })}><option value="">All sources</option>{options("sources").map(name => <option key={name}>{name}</option>)}</Select>
        <Select label="Device" value={draft.device} onChange={device => update({ device })}><option value="">All devices</option>{options("devices").map(name => <option key={name} value={name === "Unknown" ? "__unknown__" : name}>{name}</option>)}</Select>
        <Select label="Environment" value={draft.environment} onChange={environment => update({ environment: environment as TrafficFilters["environment"] })}><option value="all">All environments</option><option value="production">Production</option><option value="development">Development</option></Select>
        <Select label="Hostname" value={draft.host} onChange={host => update({ host })}><option value="">All hostnames</option>{options("hosts").filter(Boolean).map(name => <option key={name} value={name === "Unknown" ? "__unknown__" : name}>{name}</option>)}</Select>
      </div><label className={s.timezone}>Timezone<select aria-label="Report timezone" value={draft.timezone} onChange={e => update({ timezone: e.target.value })}>{Array.from(new Set([draft.timezone, "America/Los_Angeles", "America/New_York", "Europe/London", "UTC"])).map(z => <option key={z}>{z}</option>)}</select></label></details>
      <div className={s.filterFooter}><span className={s.activeTimezone}>{filters.timezone}</span><span className={s.unsaved}>{changed ? "Filters changed. Apply to update." : `${filters.from} to ${filters.to} / inclusive`}</span><button className={s.textButton} onClick={() => { const next = { ...data.filters, from: shiftDate(today, -29), to: today }; setDraft(next); load(next); }} disabled={pending}>Reset</button><button className={s.primary} onClick={() => load(draft)} disabled={pending}>{pending ? "Updating..." : "Apply filters"}<ArrowUpRight size={16}/></button></div>
    </section>

    {(error || report.message || report.errors.length > 0) && <div className={s.notice} role="alert"><Info size={18}/><div><strong>{error || report.message || "Some reports are unavailable."}</strong>{report.errors.length > 0 && <details><summary>Query details</summary>{report.errors.map(e => <p key={e}>{e}</p>)}</details>}</div></div>}

    <div className={s.sectionLabel}><span>01 / Audience</span><span>{filters.page ? pageLabel(filters.page) : "All pages"}{filters.audience !== "all" ? ` / ${filters.audience}` : ""}</span></div>
    <section className={s.metrics} aria-label="Audience summary">
      <div className={s.metricLead}><span>Visitors in range</span><strong>{n(t?.visitors)}</strong><small>{delta(t?.visitors, report.previous?.visitors)}</small></div>
      <div><span>New visitors</span><strong>{n(t?.newVisitors)}</strong><small>{rate(t ? percent(t.newVisitors, t.visitors) : null)} of visitors</small></div>
      <div><span>Returning visitors</span><strong>{n(t?.returningVisitors)}</strong><small>{rate(t ? percent(t.returningVisitors, t.visitors) : null)} of visitors</small></div>
      <div><span>Repeat visitors</span><strong>{n(t?.repeatVisitors)}</strong><small>2+ sessions in this range</small></div>
      <div><span>Sessions</span><strong>{n(t?.sessions)}</strong><small>{t?.visitors ? (t.sessions / t.visitors).toFixed(2) : "--"} per visitor</small></div>
      <div><span>{filters.page.startsWith("registration:") ? "Screen views" : "Pageviews"}</span><strong>{n(t?.pageviews)}</strong><small>{delta(t?.pageviews, report.previous?.pageviews)}</small></div>
    </section>

    <section className={s.card}>
      <div className={s.cardHead}><div><h2>Traffic over time</h2><span className={s.micro}>{filters.from} / {filters.to}</span></div><span className={s.stamp}>Daily resolution</span></div>
      <TrafficChart points={report.points}/>
      <div className={s.composition}><div className={s.compositionBar} data-empty={!t?.visitors} aria-label={`${rate(t ? percent(t.newVisitors, t.visitors) : null)} new visitors`}><span style={{ width: `${t ? percent(t.newVisitors, t.visitors) ?? 0 : 0}%` }}/></div><span><b>{rate(t ? percent(t.newVisitors, t.visitors) : null)}</b> new</span><span><b>{rate(t ? percent(t.returningVisitors, t.visitors) : null)}</b> returning</span></div>
    </section>

    <div className={s.sectionLabel}><span>02 / Conversion</span><span>Ordered, unique visitors</span></div>
    <section className={s.card}>
      <div className={s.cardHead}><div><h2>From visit to signup</h2><span className={s.micro}>Landing entrants in the selected dates</span></div><div className={s.funnelControls}><Select label="Registration flow" value={filters.flow} onChange={flow => apply({ flow: flow as TrafficFilters["flow"] })}><option value="standard">Email signup</option><option value="google">Google signup</option></Select><Select label="Conversion window" value={String(filters.windowDays)} onChange={v => apply({ windowDays: Number(v) })}>{[1, 7, 14].map(d => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}</Select><Select label="Billing data" value={filters.billingMode} onChange={v => apply({ billingMode: v as TrafficFilters["billingMode"] })}><option value="live">Live only</option><option value="test">Test only</option><option value="all">Live + test</option></Select></div></div>
      {!report.firstStepAt && !failed("lifetime") && <div className={s.inlineNote}><Info size={16}/><span>Step tracking starts with this release. Earlier step conversions are not available.</span></div>}
      {stepCoverageDate && coverageIncomplete && <div className={s.inlineNote}><Info size={16}/><span>Partial step coverage from {stepCoverageDate}. Entry-to-step and overall rates are hidden for this range.</span></div>}
      {filters.page && <p className={s.inlineNote}>The page filter affects audience reports, not the landing-to-signup funnel.</p>}
      <div className={s.funnelLayout}>
        <div className={s.funnelTable}><div className={s.funnelHeading}><span>Stage</span><span>Visitors</span><span>Step rate</span><span>From landing</span></div>
          {report.funnel.map((stage, i) => {
            const untracked = !report.firstStepAt && i >= 2;
            const base = report.funnel[0]?.visitors || 0;
            const prev = report.funnel[i - 1]?.visitors || 0;
            return <div className={s.funnelRow} key={stage.id}><div className={s.stage}><span className={s.stageNumber}>{String(i + 1).padStart(2, "0")}</span><div><b>{stage.label}</b><div className={s.funnelBar}><span style={{ width: `${untracked ? 0 : percent(stage.visitors, base) ?? 0}%` }}/></div>{i > 0 && !untracked && !(i === 2 && coverageIncomplete) && <small>{n(Math.max(0, prev - stage.visitors))} did not reach this step</small>}</div></div><strong>{untracked ? "--" : n(stage.visitors)}</strong><span>{untracked || !i || (i === 2 && coverageIncomplete) ? "--" : rate(percent(stage.visitors, prev))}</span><span>{untracked || (i >= 2 && coverageIncomplete) ? "--" : rate(percent(stage.visitors, base))}</span></div>;
          })}
          {!report.funnel.length && <div className={s.empty}>Funnel unavailable. Retry the report.</div>}
        </div>
        <aside className={s.conversionPlate}><div className={s.eyebrow}>End-to-end conversion</div><strong>{!coverageIncomplete && funnelEnd ? rate(percent(funnelEnd.visitors, report.funnel[0]?.visitors || 0)) : "--"}</strong><span>{report.firstStepAt && funnelEnd ? `${n(funnelEnd.visitors)} verified signups observed` : "Awaiting step tracking"}</span><dl className={s.outcomes}>{([['Trial attempts', 'trialAttempts'], ['Purchase attempts', 'purchaseAttempts'], ['Trials started', 'trials'], ['Subscriptions purchased', 'purchases'], ['Other activations', 'other']] as const).map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{report.firstStepAt ? n(report.funnelOutcomes?.[key]) : "--"}</dd></div>)}</dl><p>Attempt = button clicked. Verified = Stripe confirmed and account created.</p><p>{filters.billingMode === "live" ? "Test checkouts excluded." : filters.billingMode === "test" ? "Test checkout outcomes only." : "Live and test outcomes included."} Attempts cannot know the billing mode yet.</p><p>{filters.windowDays}-day window from the first eligible landing. Recent cohorts may still convert.</p></aside>
      </div>
    </section>

    <div className={s.sectionLabel}><span>03 / Explore</span><span>Same date &amp; audience filters</span></div>
    <section className={s.card}>
      <div className={s.exploreTabs} aria-label="Detailed reports">{(["pages", "acquisition", "experiments"] as const).map(key => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{key === "pages" ? "Pages & screens" : key === "acquisition" ? "Acquisition" : "A/B experiments"}<span>{key === "pages" ? n(report.pages.length) : key === "acquisition" ? n(report.sources.length) : n(experimentNames.length)}</span></button>)}</div>
      {tab === "pages" && <div className={s.exploreBody}>
        <div className={s.exploreHead}><div><h2>Page explorer</h2><p className={s.micro}>Select a row to inspect its audience and daily traffic.</p></div><div className={s.pageTools}><input type="search" aria-label="Find a page" placeholder="Find a page or screen..." value={search} onChange={e => { setSearch(e.target.value); setPageIndex(0); }}/><Select label="Sort by" value={sort} onChange={v => { setSort(v as typeof sort); setPageIndex(0); }}><option value="visitors">Visitors</option><option value="pageviews">Views</option><option value="returningVisitors">Returning</option></Select></div></div>
        <div className={s.pageShortcuts}>{pageKeys.map(p => <button key={p} aria-pressed={filters.page === p} onClick={() => apply({ page: p })}>{pageLabel(p)}</button>)}{filters.page && <button onClick={() => apply({ page: "" })}>Clear page filter</button>}</div>
        <div className={s.tableScroll}><table className={s.table}><thead><tr><th>Page / screen</th><th>Visitors</th><th>New</th><th>Returning</th><th>Repeat</th><th>Sessions</th><th>Views</th></tr></thead><tbody>{rows.slice(visiblePage * 20, (visiblePage + 1) * 20).map(p => <tr key={p.page} data-selected={filters.page === p.page}><td><button className={s.pageLink} onClick={() => apply({ page: p.page })}><span>{pageLabel(p.page)}{pageLabel(p.page) !== p.page && <small>{p.page}</small>}</span><ArrowUpRight size={15}/></button></td><td><b>{n(p.visitors)}</b></td><td>{n(p.newVisitors)}</td><td>{n(p.returningVisitors)}<small>{rate(percent(p.returningVisitors, p.visitors))}</small></td><td>{n(p.repeatVisitors)}</td><td>{n(p.sessions)}</td><td>{n(p.pageviews)}</td></tr>)}</tbody></table></div>
        {rows.length > 20 && <div className={s.pagination}><span>{visiblePage * 20 + 1}-{Math.min(rows.length, (visiblePage + 1) * 20)} of {rows.length} pages</span><button className={s.button} disabled={visiblePage === 0} onClick={() => setPageIndex(visiblePage - 1)}>Previous</button><button className={s.button} disabled={visiblePage === pageCount - 1} onClick={() => setPageIndex(visiblePage + 1)}>Next</button></div>}
        {!rows.length && <div className={s.empty}>{failed("pages") ? "Page report unavailable." : "No matching page activity in this range."}</div>}
        <p className={s.footnote}>Top 200 pages. Screen views are explicit registration events. A visitor can appear on more than one page; rows do not add up to unique site visitors.</p>
      </div>}

      {tab === "acquisition" && <div className={s.exploreBody}>
        <div className={s.exploreHead}><div><h2>Where visitors come from</h2><p className={s.micro}>Session-entry attribution / top 20 per dimension</p></div><span className={s.stamp}>Sources, not guesses</span></div>
        <div className={s.dimensionTabs}>{Object.entries(dimensions).map(([key, label]) => <button key={key} aria-pressed={dimension === key} onClick={() => setDimension(key as Dimension)}>{label}</button>)}</div>
        <div className={s.acquisitionLayout}><div className={s.tableScroll}><table className={s.table}><thead><tr><th>{dimensions[dimension]}</th><th>Visitors</th><th>Sessions</th><th>Signups</th><th>Signup rate</th></tr></thead><tbody>{acquisition.map(row => <tr key={row.name}><td><div className={s.sourceName}>{dimension === "sources" ? <button onClick={() => apply({ source: row.name })}>{row.name}<ArrowUpRight size={14}/></button> : <b>{row.name === " /  / " ? "No UTM campaign" : row.name}</b>}<div className={s.sourceBar}><span style={{ width: `${percent(row.visitors, acquisition[0]?.visitors || 1) ?? 0}%` }}/></div></div></td><td><b>{n(row.visitors)}</b></td><td>{n(row.sessions)}</td><td>{report.firstStepAt ? n(row.conversions) : "--"}</td><td>{coverageIncomplete ? "--" : rate(percent(row.conversions, row.visitors))}</td></tr>)}</tbody></table>{!acquisition.length && <div className={s.empty}>{failed("breakdowns") ? "Acquisition report unavailable." : "No recorded data for this dimension."}</div>}</div>
          <aside className={s.acquisitionNotes}><h3>What we can see</h3><p>Google, Bing, Instagram and other referrers when the browser passes them. Tagged links also carry campaign and medium.</p><h3>What stays private</h3><p>Exact organic searches and browsing history are usually not shared. Missing referrers appear as direct / unknown.</p><h3>Search terms</h3><p>Campaign terms here come from <code>utm_term</code>, not organic search queries. Connect Search Console or Bing Webmaster Tools separately for aggregate search queries.</p><a href="https://search.google.com/search-console" target="_blank" rel="noreferrer">Google Search Console <ArrowUpRight size={14}/></a><a href="https://www.bing.com/webmasters" target="_blank" rel="noreferrer">Bing Webmaster Tools <ArrowUpRight size={14}/></a></aside>
        </div><p className={s.footnote}>Signups are verified outcomes within the conversion window after an eligible visit. {coverageIncomplete && "Signup rates are hidden until the selected range has full tracking coverage. "}One visitor can use multiple sources. Browser privacy, consent and blockers can reduce coverage.</p>
      </div>}

      {tab === "experiments" && <div className={s.exploreBody}>
        <div className={s.exploreHead}><div><h2>A/B experiment bench</h2><p className={s.micro}>Actual exposures, checkout intent and verified conversion</p></div><span className={s.stamp}>{failed("experiments") ? "Unavailable" : experimentNames.length ? `${experimentNames.length} observed` : "Ready for future tests"}</span></div>
        {!variants.length ? failed("experiments") ? <div className={s.empty}>Experiment results are unavailable. Retry the report.</div> : <div className={s.experimentEmpty}><div className={s.experimentMark}><FlaskConical size={34}/><span>A / B</span></div><div><h3>No experiment exposures in this range.</h3><p>Choose the pages and variants when you are ready. This report will compare visitors who actually saw each version, not everyone who visited the site.</p><div className={s.experimentSteps}><span>01 / Assign a variant</span><span>02 / Record exposure</span><span>03 / Compare conversion</span></div></div></div> : <>
          <div className={s.experimentControls}><Select label="Experiment" value={selectedExperiment} onChange={setExperiment}>{experimentNames.map(name => <option key={name}>{name}</option>)}</Select><Select label="Compare against" value={baseline?.variant || ""} onChange={setControl}>{variants.map(v => <option key={v.variant}>{v.variant}</option>)}</Select></div>
          <div className={s.tableScroll}><table className={s.table}><thead><tr><th>Variant</th><th>Exposed</th><th>Attempts</th><th>Attempt rate</th><th>Verified</th><th>Signup rate</th><th>Lift</th><th>95% interval</th></tr></thead><tbody>{variants.map(v => {
            const r = percent(v.completed, v.visitors);
            const b = baseline ? percent(baseline.completed, baseline.visitors) : null;
            const ci = conversionInterval(v.completed, v.visitors);
            return <tr key={v.variant}><td><b>{v.variant}</b>{v === baseline && <small>Baseline</small>}</td><td>{n(v.visitors)}</td><td>{n(v.attempts)}</td><td>{rate(percent(v.attempts, v.visitors))}</td><td>{n(v.completed)}</td><td><b>{rate(r)}</b></td><td>{v === baseline ? "--" : b && r != null ? `${((r / b - 1) * 100).toFixed(1)}%` : "--"}</td><td>{ci ? `${rate(ci[0])} to ${rate(ci[1])}` : "--"}</td></tr>;
          })}</tbody></table></div>
          <p className={s.footnote}>{n(variants.reduce((sum, v) => sum + v.mixedVisitors, 0))} visitors with mixed variant exposures excluded. Page filter does not apply; the experiment defines its tested page. Rates use a {filters.windowDays}-day window after first exposure.</p>
        </>}
        {failed("experiments") && <div className={s.notice}>Experiment results could not be loaded. This does not mean no experiments exist.</div>}
        <div className={s.experimentNote}><Info size={16}/><span>No automatic winner. The 95% Wilson interval shows uncertainty in each rate, not statistical significance between variants. Let cohorts mature before deciding.</span></div>
      </div>}
    </section>
    <details className={s.methodology}><summary><Info size={15}/>Measurement notes</summary><div><p><b>Visitors</b> are distinct PostHog person IDs, not guaranteed distinct humans. Separate devices or cleared cookies can count again.</p><p><b>New</b> means first observed in the selected range. <b>Returning</b> means first observed before it. <b>Repeat</b> means 2+ recorded sessions within the range, and can include new visitors.</p><p><b>Coverage</b> begins {report.firstTrackedAt?.slice(0, 10) || "when the first event arrives"}. Admin pages are excluded. Historical production/development labels are inferred from hostname. Google signup skips the account step. Filters never reconstruct unrecorded historical events.</p><p><b>Freshness</b> Reports are cached for up to 60 seconds; ingestion may take additional time. Today follows the displayed timezone. All-time and today ignore page, audience, source and device filters.</p></div></details>
  </div>;
}
