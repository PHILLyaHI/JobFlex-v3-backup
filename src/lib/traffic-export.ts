// THE TRAFFIC PAGE AS TEXT (2026-10-04). Owner: take the page's data out
// whole, not as screenshots — the analyst as Markdown, its sessions as CSV,
// the whole page as one Markdown file, the report's CSV with every column.
// Pure: no I/O and no server imports, so the analyst's buttons build their
// files in the browser and the "Export everything" action builds the same
// Markdown on the server. Numbers are written as the page writes them.

import { pct, type AnalystFinding, type AnalystSegment, type LandingSession } from "./traffic-analyst";
import type { AnalystResult } from "./traffic-analyst-read";
import { pageLabel, percent, type SignupAttribution, type TrafficFilters, type TrafficReport } from "./traffic-contract";
import type { LiveReport, SignupLedger } from "./traffic-live";
import type { MoneyRow } from "./traffic-money";
import { dateInZone } from "./traffic-query";
import { TRAFFIC_SINCE_LABEL } from "./traffic-visitor";

/** The analyst's tone as the panel prints it. */
export const TONE_WORD: Record<AnalystFinding["tone"], string> = { bad: "FIX", warn: "WATCH", good: "WORKING", info: "NOTE" };

// ── Formatting, as the page formats ───────────────────────────────────────

const n = (v: number | null | undefined) => (v == null ? "--" : v.toLocaleString("en-US"));
const rate = (v: number | null | undefined) => (v == null ? "--" : `${v.toFixed(1)}%`);
const secs = (x: number | null) => (x === null ? "—" : x < 60 ? `${Math.round(x)} s` : `${Math.round(x / 60)} min`);
const secsMs = (x: number | null) => (x === null ? "—" : `${(x / 1000).toFixed(1)} s`);

/** "Oct 4, 2026, 2:15 PM" in the page's timezone. */
export function when(iso: string | null | undefined, timezone: string): string {
  if (!iso) return "—";
  try { return new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)); }
  catch { return iso; }
}

/** One Markdown cell: no pipes or line breaks to break the row. */
const cell = (v: unknown) => String(v ?? "").replace(/\|/g, "\\|").replace(/\s*\r?\n\s*/g, " ").trim() || " ";
export function mdTable(head: string[], rows: unknown[][]): string {
  if (!rows.length) return "_None._";
  return [`| ${head.map(cell).join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
}

/** A CSV cell: quoted, and a leading = + - @ neutralised so a spreadsheet never runs it. */
export function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return '"' + (/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""') + '"';
}
export const csvRows = (rows: unknown[][]) => rows.map((row) => row.map(csvCell).join(",")).join("\r\n");

/** The browser's download of a text file (client only). */
export function downloadText(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── The analyst ───────────────────────────────────────────────────────────

/** The days the analyst read, for a file name: "2026-09-30_2026-10-04". */
export function analystPeriod(result: AnalystResult, timezone: string): string {
  const to = result.window?.to ?? result.fetchedAt;
  const from = result.window?.from ?? new Date(Date.parse(to) - result.report.days * 86_400_000).toISOString();
  return `${dateInZone(new Date(from), timezone)}_${dateInZone(new Date(to), timezone)}`;
}

const segmentRows = (xs: AnalystSegment[], withPlatform: boolean) => xs.map((a) => [a.name, a.key, ...(withPlatform ? [a.platform ?? ""] : []), a.n, pct(a.bounce), pct(a.cta), pct(a.form), a.completed]);

/** The analyst's reading as Markdown: everything the panel shows, and what it
 *  computes without showing (every ad, the trades, the buttons pressed, the
 *  share gone inside 5 s). `level` is the top heading's depth, so the page's
 *  export can nest it. */
export function analystToMarkdown(result: AnalystResult, opts: { timezone: string; level?: number }): string {
  const tz = opts.timezone;
  const h = (depth: number) => "#".repeat(Math.min(6, (opts.level ?? 1) + depth));
  const r = result.report;
  const out: string[] = [];
  out.push(`${h(0)} The analyst — JobFlex landing`);
  const from = result.window?.from, to = result.window?.to ?? result.fetchedAt;
  out.push([
    `- **Period:** ${from ? `${when(from, tz)} → ${when(to, tz)}` : r.period} (${tz}) — ${r.period}; the window is the last ${r.days} days, never before ${TRAFFIC_SINCE_LABEL}`,
    `- **PostHog read at:** ${when(result.fetchedAt, tz)}`,
    `- **Basis:** ${r.sample.basis === "ads" ? "visits from ads" : "all landing visits"} (the analyst reads ads once ${r.sample.needed} ad visits have landed)`,
    ...(result.status !== "ok" ? [`- **Status:** ${result.status} — ${result.message ?? ""}`] : []),
    ...(result.stale ? [`- **PostHog unavailable:** showing the reading from ${when(result.stale.since, tz)} (${result.stale.reason})`] : []),
  ].join("\n"));

  out.push(`${h(1)} Summary`, r.headline);
  out.push(mdTable(["Sessions", "Landed", "From ads", "Last 24 h", "With section readings"], [[r.sample.sessions, r.sample.landed, r.sample.fromAds, r.sample.last24h, r.sample.measured]]));
  out.push(mdTable(["Measure", "Value"], [
    ["Left at once (one page, no button, no form)", pct(r.stats.bounce)],
    ["Gone inside 5 s without scrolling", pct(r.stats.fast)],
    ["Median time on the landing", secs(r.stats.dwellMedian)],
    ["Median deepest scroll", pct(r.stats.scrollMedian)],
    ["In Facebook's / Instagram's in-app browser", pct(r.stats.inApp)],
    ["Headline on phones after (median)", secsMs(r.stats.heroMedianPhone)],
    ["Sign-up form usable on phones after (median)", secsMs(r.stats.formReadyMedian)],
  ]));

  out.push(`${h(1)} Findings (${r.findings.length})`);
  r.findings.forEach((f, i) => {
    out.push(`${h(2)} ${i + 1}. ${TONE_WORD[f.tone]} — ${f.title}`);
    out.push([
      `- **Evidence:** ${f.evidence}`,
      `- **Action:** ${f.action}`,
      ...(f.steps?.length ? ["- **Steps:**", ...f.steps.map((s, k) => `  ${k + 1}. ${s}`)] : []),
      ...(f.about ? [`- **About:** ${f.about}`] : []),
      `- **Sample:** ${f.n} ${f.n === 1 ? "visit" : "visits"} · ${f.confidence} confidence · \`${f.id}\``,
    ].join("\n"));
  });

  out.push(`${h(1)} The funnel · ${r.sample.basis === "ads" ? "visits from ads" : "all landing visits"}`);
  out.push(mdTable(["Step", "People", "Share"], r.funnel.map((s) => [s.label, s.n, pct(s.pct)])));
  out.push(`${h(1)} How far down the page they get · ${r.sample.measured} measured ${r.sample.measured === 1 ? "visit" : "visits"}`);
  out.push(mdTable(["Section", "Reached", "On"], r.sections.map((s) => [s.label, pct(s.reach), s.shown === "all" ? "every landing" : "where shown"])));
  out.push(`${h(1)} Ads (${r.ads.length})`);
  out.push(mdTable(["Ad", "Id", "Platform", "Visits", "Bounced", "Pressed", "Opened the form", "Signed up"], segmentRows(r.ads, true)));
  const money = result.money;
  if (money) {
    const t = money.total, u = money.untagged;
    out.push(`${h(1)} Ads → money · accounts since ${when(money.since, tz)}, what they are now`);
    out.push(`${t.signups} ${t.signups === 1 ? "account" : "accounts"}: ${t.trial} on a trial, ${t.paying} paying, ${t.lapsed} lapsed, ${t.other} other${u.signups ? `; ${u.signups} carry no ad tag` : ""}. From the database (the landing's tags on each organization, its subscription now); visits are the analyst's window.`);
    const counts = (m: MoneyRow) => [m.visits ?? "—", m.signups, m.trial, m.paying, m.lapsed, m.other];
    const tail = ["Visits (window)", "Signups", "Trial", "Paying", "Lapsed", "Other"];
    out.push(mdTable(["Ad", "Id", "Campaign", ...tail], money.ads.map((m) => [m.name, m.key, m.campaign, ...counts(m)])));
    out.push(mdTable(["Campaign", "Id", ...tail], money.campaigns.map((m) => [m.name, m.key, ...counts(m)])));
  }
  out.push(`${h(1)} Trade landings (${r.trades.length})`);
  out.push(mdTable(["Landing", "Key", "Visits", "Bounced", "Pressed", "Opened the form", "Signed up"], segmentRows(r.trades, false)));
  out.push(`${h(1)} Buttons pressed, by place on the page`);
  out.push(mdTable(["Placement", "Visits that pressed it"], r.placements.map((p) => [p.placement, p.n])));
  out.push(`${h(1)} Method`);
  out.push("One row per browser session on www.jobflex.app, bots and previews out, counted from the ad launch. \"Left at once\" is one page, no button, no form. Time and scroll come from the browser as it leaves the landing (posthog-js $pageleave); sections from the landing's own tracker, so visits before it shipped have no section reading. The first screen's timing and the sign-up form's readiness come from two beacons added 2026-10-04 — earlier visits carry neither. "
    + `A finding needs its minimum sample — ${r.sample.needed} ad visits for the page, 8 for an ad or a trade — and its confidence follows its sample: high from 100 visits, medium from 40, else low. Ads carry the names given below the live list.`);
  return out.join("\n\n") + "\n";
}

// ── The analyst's sessions ────────────────────────────────────────────────

/** Every field of a session, in the CSV's order. The `satisfies` check below
 *  fails the build when LandingSession gains a field this list lacks. */
export const SESSION_COLUMNS = [
  "id", "person", "startedAt", "endedAt", "industry", "utmSource", "utmMedium", "utmCampaign", "utmContent", "referrer", "fbclid",
  "device", "browser", "os", "inApp", "views", "landingViews", "dwell", "scroll", "sections", "cta", "placements",
  "registerViews", "step", "flow", "attempts", "cardless", "opened", "errors", "completed", "outcome", "plan",
  "heroMs", "paintMs", "readyMs", "trackedMs", "kb", "connection", "leftUnshown",
  "formReadyMs", "typedEarly", "submittedEarly", "step1Errors", "step1Passed",
  "lcpMs", "leftMs", "downlink", "rttMs", "typedMs", "submitMs", "sectionAfter", "ctaLabels", "ctaHrefs", "ctaSpots",
  "hvacSteps", "hvacStepKeys", "hvacTaps", "hvacTierPicks", "hvacTiers", "country", "region", "city",
] as const;
type MissingColumn = Exclude<keyof LandingSession, (typeof SESSION_COLUMNS)[number]>;
const everyColumn: [MissingColumn] extends [never] ? true : MissingColumn = true;
void everyColumn;

/** The derived columns after the raw ones: readable times and the ad's name. */
export const SESSION_EXTRA_COLUMNS = ["startedIso", "endedIso", "adName"] as const;

const csvValue = (v: unknown) => (Array.isArray(v) ? v.join(";") : v === null || v === undefined ? "" : v);
export function sessionsToCsv(sessions: readonly LandingSession[], adNames: Record<string, string> = {}): string {
  const iso = (ms: number) => (ms > 0 ? new Date(ms).toISOString() : "");
  const name = (s: LandingSession) => (s.utmContent && adNames[s.utmContent]) || (s.utmCampaign && adNames[s.utmCampaign]) || "";
  return csvRows([
    [...SESSION_COLUMNS, ...SESSION_EXTRA_COLUMNS],
    ...sessions.map((s) => [...SESSION_COLUMNS.map((k) => csvValue(s[k])), iso(s.startedAt), iso(s.endedAt), name(s)]),
  ]);
}

// ── The report's CSV ──────────────────────────────────────────────────────

const ACQUISITION = { sources: "Sources", referrers: "Referrers", campaigns: "Campaigns", devices: "Devices", browsers: "Browsers", countries: "Countries", terms: "Campaign terms", hosts: "Hostnames" } as const;

/** Whether the range starts on or before the day step tracking began: the
 *  page hides entry-to-step rates then, and so do the exports. */
const coverageIncomplete = (report: TrafficReport) => !report.firstStepAt || report.filters.from <= dateInZone(new Date(report.firstStepAt), report.filters.timezone);

/** The header's Export CSV (2026-10-04): every column the report holds —
 *  the daily people, in-app and ad tags, the hostnames, the d / e variants —
 *  and the signups list beside it. */
export function reportToCsv(report: TrafficReport, ledger: SignupLedger | null, adsClicks: Record<string, number> = {}): string {
  const partial = coverageIncomplete(report);
  const rows: unknown[][] = [
    ["JobFlex traffic", report.filters.from, report.filters.to, report.filters.timezone],
    ["Filters", JSON.stringify(report.filters)],
    ["All-time visitors", report.lifetime, "Today", report.today],
    ["People (est.)", report.people?.people ?? null, "In-app visitors", report.people?.inAppVisitors ?? null, "In-app people", report.people?.inAppPeople ?? null],
    [],
    ["Daily", "Visitors", "New", "Returning", "Repeat visitors", "Sessions", "Views", "People (est.)", "In-app visitors", "In-app people", "Ads fb", "Ads ig", "Ads an", "fbclid", "Any ad tag", "Ads Manager clicks"],
    ...report.points.map((p) => [p.date, p.visitors, p.newVisitors, p.returningVisitors, p.repeatVisitors, p.sessions, p.pageviews, p.people, p.inAppVisitors, p.inAppPeople, p.adsFb, p.adsIg, p.adsAn, p.adsFbclid, p.adsAny, adsClicks[p.date] ?? null]),
    [], ["Page / step", "Visitors", "New", "Returning", "Repeat visitors", "Sessions", "Views"],
    ...report.pages.map((p) => [p.page, p.visitors, p.newVisitors, p.returningVisitors, p.repeatVisitors, p.sessions, p.pageviews]),
    [], ["Funnel", "Visitors", "Previous step %", "Landing %"],
    ...report.funnel.map((p, i) => [p.label, !report.firstStepAt && i >= 2 ? null : p.visitors,
      !i || (!report.firstStepAt && i >= 2) || (partial && i === 2) ? null : percent(p.visitors, report.funnel[i - 1].visitors),
      partial && i >= 2 ? null : percent(p.visitors, report.funnel[0].visitors)]),
    [], ["Funnel outcomes", "Visitors"], ...Object.entries(report.funnelOutcomes || {}).map(([key, value]) => [key, report.firstStepAt ? value : null]),
    [], ["Landing variant", "Signup starts", "Verified signups"], ...report.variants.map((v) => [v.variant, v.started, v.completed]),
    [], ["Acquisition", "Name", "Visitors", "Sessions", "Verified signups"],
    ...Object.keys(ACQUISITION).flatMap((key) => report[key as keyof typeof ACQUISITION].map((p) => [key, p.name, p.visitors, p.sessions, report.firstStepAt ? p.conversions : null])),
    [], ["Experiment", "Variant", "Exposed", "Attempts", "Verified signups", "Mixed exposures excluded"],
    ...report.experiments.map((e) => [e.experiment, e.variant, e.visitors, e.attempts, e.completed, e.mixedVisitors]),
  ];
  if (ledger) rows.push(
    [], [`Signups, last ${ledger.days} days${ledger.truncated ? " (first 400)" : ""}`, "Total", ledger.summary.total, "From ads", ledger.summary.fromAds, "Trial", ledger.summary.trial, "Paying", ledger.summary.paying, "Lapsed", ledger.summary.lapsed, "Free", ledger.summary.free, "Unknown", ledger.summary.unknown],
    ["Created", "Company", "Owner", "Email", "Source", "From ad", "Platform", "Campaign", "Ad", "Landing trade", "Plan", "State"],
    ...ledger.records.map((r) => [r.createdAt, r.orgName, r.ownerName, r.ownerEmail, r.source, r.fromAd, r.platform, r.campaign, r.content, r.industry, r.planLabel, r.state]),
  );
  return csvRows(rows);
}

// ── The whole page ────────────────────────────────────────────────────────

export interface TrafficExport {
  generatedAt: string;
  timezone: string;
  filters: TrafficFilters;
  analyst: AnalystResult;
  live: LiveReport;
  report: TrafficReport;
  ledger: SignupLedger;
  attribution: SignupAttribution | null;
  /** Ads Manager's link clicks per day, as the admins typed them (SyncState). */
  adsClicks: Record<string, number>;
}

/** Ours against Ads Manager, as the reconciliation table words it: "+12%", "-30%", "--". */
export function clicksDifference(ours: number, theirs: number | undefined): string {
  if (!theirs) return "--";
  const d = Math.round(((ours - theirs) / theirs) * 100);
  return `${d > 0 ? "+" : ""}${d}%`;
}

function delta(current: number | undefined, previous: number | undefined) {
  if (current == null || previous == null) return "Comparison unavailable";
  if (!previous) return current ? "No previous baseline" : "No change";
  const d = (current - previous) / previous * 100;
  return `${d > 0 ? "+" : ""}${d.toFixed(1)}% vs previous period`;
}

const SIGNUP_DIMENSIONS = { landingIndustry: "Landing trade", signupVariant: "Landing variant", utmSource: "utm_source", utmMedium: "utm_medium", utmCampaign: "utm_campaign", utmContent: "utm_content" } as const;

/** "Export everything": the page as one Markdown file, block by block in the
 *  page's order, each figure written as the page writes it. */
export function trafficToMarkdown(x: TrafficExport): string {
  const tz = x.timezone;
  const { report, live, ledger, attribution } = x;
  const f = report.filters;
  const t = report.totals;
  const out: string[] = [];
  const names = live.adNames ?? {};
  const named = (id: string) => (id && names[id] ? `${names[id]} (${id})` : id);

  out.push("# JobFlex traffic");
  out.push([
    `- **Exported:** ${when(x.generatedAt, tz)} (${tz})`,
    `- **Report range:** ${f.from} to ${f.to}, inclusive · ${f.environment === "all" ? "www.jobflex.app + localhost" : f.environment === "development" ? "localhost only" : "www.jobflex.app"} · no bots, no previews · ${f.fullHistory ? "full history" : `since ${TRAFFIC_SINCE_LABEL}`}`,
    `- **Filters:** page ${f.page ? pageLabel(f.page) : "all"} · audience ${f.audience} · source ${f.source || "all"} · device ${f.device || "all"} · host ${f.host || "all"} · flow ${f.flow} · ${f.windowDays}-day window · billing ${f.billingMode}`,
    `- **Report fetched:** ${when(report.fetchedAt, tz)}${report.stale ? ` — PostHog unavailable${report.stale.scope ? ` for ${report.stale.scope}` : ""}, data from ${when(report.stale.since, tz)}` : ""}`,
    ...(report.status !== "ok" || report.errors.length ? [`- **Report status:** ${report.status}${report.message ? ` — ${report.message}` : ""}${report.errors.length ? ` · ${report.errors.join("; ")}` : ""}`] : []),
  ].join("\n"));

  // Live now
  out.push("## Live now");
  out.push(`- **Read at:** ${when(live.fetchedAt, tz)} · last ${live.activeMinutes} minutes on the site, seen within ${live.windowMinutes}${live.status !== "ok" ? ` · ${live.status}: ${live.message ?? ""}` : ""}${live.stale ? ` · PostHog unavailable, data from ${when(live.stale.since, tz)}` : ""}`);
  if (live.headline) out.push(live.headline);
  const tt = live.totals;
  out.push(mdTable(["All-time visitors", "Today", "Yesterday to this hour", "Yesterday", "Last 7 days", "Pageviews today"],
    [[n(report.lifetime ?? tt?.allTime), n(report.today ?? tt?.today), n(tt?.yesterdaySoFar), n(tt?.yesterday), n(tt?.last7Days), n(tt?.viewsToday)]]));
  out.push(mdTable(["On the site", "From ads", "Signing up", "Signed up", "Members", "Signups today", "Of them from ads"],
    [[live.counts.onSite, live.counts.fromAds, live.counts.signingUp, live.counts.signedUp, live.counts.members, live.today.signups, live.today.fromAds]]));
  out.push("### Platforms");
  out.push(mdTable(["Platform", "Ads", "Visitors", "On site", "From ads", "Organic", "Signing up", "Signed up", "Signed up today", "Campaigns"],
    live.platforms.map((p) => [p.name, p.ads ? "yes" : "", p.visitors, p.onSite, p.fromAds, p.organic, p.signingUp, p.signedUp, p.signedUpToday,
      p.campaigns.map((c) => `${named(c.campaign) || "—"}${c.content ? ` / ${named(c.content)}` : ""} (${c.visitors})`).join("; ")])));
  out.push(`### Visitors in the window (${live.visitors.length})`);
  out.push(mdTable(["Visitor", "Stage", "Now", "Source", "Campaign", "Ad", "Trade", "Page", "Views", "Place", "Device", "Last seen", "Account"],
    live.visitors.map((v) => [v.id, v.stage, v.active ? "on site" : "left", v.source, named(v.campaign), named(v.content), v.trade, v.pageLabel, v.views, v.place, [v.device, v.browser].filter(Boolean).join(" / "), when(v.lastAt, tz),
      v.signup ? `${v.signup.orgName} · ${v.signup.planLabel}` : v.member ? `member: ${v.member.orgName}` : ""])));
  if (live.otherSignups.length) {
    out.push("### Today's signups not seen in the window");
    out.push(mdTable(["Company", "Email", "At", "Source", "Plan"], live.otherSignups.map((s) => [s.orgName, s.ownerEmail, when(s.at, tz), s.source, s.planLabel])));
  }

  // The analyst
  out.push(analystToMarkdown(x.analyst, { timezone: tz, level: 2 }).trimEnd());

  // Signups (ledger)
  const sum = ledger.summary;
  out.push(`## Signups · last ${ledger.days} days${ledger.truncated ? " (first 400)" : ""}`);
  out.push(mdTable(["Total", "From ads", "Trial", "Paying", "Lapsed", "Free", "Unknown"], [[sum.total, sum.fromAds, sum.trial, sum.paying, sum.lapsed, sum.free, sum.unknown]]));
  out.push(mdTable(["Created", "Company", "Owner", "Email", "Source", "Campaign", "Ad", "Trade", "Plan", "State"],
    ledger.records.map((r) => [when(r.createdAt, tz), r.orgName, r.ownerName, r.ownerEmail, r.source, named(r.campaign), named(r.content), r.industry, r.planLabel, r.state])));

  // 01 / Audience
  out.push(`## Audience · ${f.page ? pageLabel(f.page) : "All pages"}${f.audience !== "all" ? ` / ${f.audience}` : ""}`);
  out.push(mdTable(["Measure", "Value", "Note"], [
    ["Visitors in range", n(t?.visitors), delta(t?.visitors, report.previous?.visitors)],
    ["People (est.)", n(report.people?.people), report.people && t?.visitors ? `${rate(percent(report.people.inAppVisitors, t.visitors))} in FB / IG in-app · ${n(report.people.inAppVisitors)} clicks → ${n(report.people.inAppPeople)} people` : "address + browser"],
    ["New visitors", n(t?.newVisitors), `${rate(t ? percent(t.newVisitors, t.visitors) : null)} of visitors`],
    ["Returning visitors", n(t?.returningVisitors), `${rate(t ? percent(t.returningVisitors, t.visitors) : null)} of visitors`],
    ["Repeat visitors", n(t?.repeatVisitors), "2+ sessions in this range"],
    ["Sessions", n(t?.sessions), `${t?.visitors ? (t.sessions / t.visitors).toFixed(2) : "--"} per visitor`],
    [f.page.startsWith("registration:") ? "Screen views" : "Pageviews", n(t?.pageviews), delta(t?.pageviews, report.previous?.pageviews)],
  ]));
  out.push("### By day");
  out.push(mdTable(["Day", "Visitors", "People (est.)", "New", "Returning", "Sessions", "Views", "In-app visitors", "In-app people", "fb", "ig", "an", "fbclid", "Any ad tag"],
    report.points.map((p) => [p.date, p.visitors, p.people, p.newVisitors, p.returningVisitors, p.sessions, p.pageviews, p.inAppVisitors, p.inAppPeople, p.adsFb, p.adsIg, p.adsAn, p.adsFbclid, p.adsAny])));
  out.push("### Our ad visitors against Ads Manager");
  out.push(mdTable(["Day", "utm fb", "utm ig", "utm an", "fbclid", "Ours (any tag)", "Ads Manager clicks", "Difference"],
    report.points.map((p) => [p.date, n(p.adsFb), n(p.adsIg), n(p.adsAn), n(p.adsFbclid), n(p.adsAny), x.adsClicks[p.date] === undefined ? "—" : n(x.adsClicks[p.date]), clicksDifference(p.adsAny, x.adsClicks[p.date])])));

  // 02 / Conversion
  const partial = coverageIncomplete(report);
  const base = report.funnel[0]?.visitors || 0;
  out.push("## From visit to signup");
  out.push(`New organizations (database, every flow): **${n(attribution?.total)}** / ${f.from} to ${f.to}.${partial ? " Partial step coverage: entry-to-step and overall rates are hidden for this range, as on the page." : ""}`);
  out.push(mdTable(["Stage", "Visitors", "Step rate", "From landing"], report.funnel.map((stage, i) => {
    const untracked = !report.firstStepAt && i >= 2;
    const prev = report.funnel[i - 1]?.visitors || 0;
    return [stage.label, untracked ? "--" : n(stage.visitors), untracked || !i || (i === 2 && partial) ? "--" : rate(percent(stage.visitors, prev)), untracked || (i >= 2 && partial) ? "--" : rate(percent(stage.visitors, base))];
  })));
  const end = report.funnel.at(-1);
  const o = report.funnelOutcomes;
  out.push(mdTable(["End-to-end", "Trial attempts", "Purchase attempts", "Trials started", "Subscriptions purchased", "Other activations"],
    [[!partial && end ? rate(percent(end.visitors, base)) : "--", ...[o?.trialAttempts, o?.purchaseAttempts, o?.trials, o?.purchases, o?.other].map((v) => (report.firstStepAt ? n(v) : "--"))]]));
  if (report.variants.length) out.push(mdTable(["Landing variant", "Signup starts", "Verified signups", "Start → complete"],
    report.variants.map((v) => [v.variant === "e" ? "e / landing-e" : "d / landing", n(v.started), n(v.completed), partial ? "--" : rate(percent(v.completed, v.started))])));

  // 03 / Explore
  out.push("## Where visitors come from");
  for (const [key, label] of Object.entries(ACQUISITION)) {
    const rows = report[key as keyof typeof ACQUISITION];
    out.push(`### ${label}`);
    out.push(mdTable([label, "Visitors", "Sessions", "Signups", "Signup rate"], rows.map((r) => [r.name === " /  / " ? "No UTM campaign" : r.name, n(r.visitors), n(r.sessions), report.firstStepAt ? n(r.conversions) : "--", partial ? "--" : rate(percent(r.conversions, r.visitors))])));
  }
  out.push(`### Pages & screens (${report.pages.length})`);
  out.push(mdTable(["Page / screen", "Path", "Visitors", "New", "Returning", "Repeat", "Sessions", "Views"], report.pages.map((p) => [pageLabel(p.page), p.page, n(p.visitors), n(p.newVisitors), n(p.returningVisitors), n(p.repeatVisitors), n(p.sessions), n(p.pageviews)])));
  if (attribution) {
    out.push(`## Signups by landing trade and campaign · ${attribution.from} to ${attribution.to} · ${n(attribution.total)} signups (database)`);
    for (const [key, label] of Object.entries(SIGNUP_DIMENSIONS)) {
      out.push(`### ${label}`);
      out.push(mdTable([label, "Signups", "Share"], attribution.dimensions[key as keyof typeof SIGNUP_DIMENSIONS].map((r) => [key === "utmCampaign" || key === "utmContent" ? named(r.name) : r.name, n(r.signups), rate(percent(r.signups, attribution.total))])));
    }
  }
  out.push("## Measurement notes");
  out.push(`${f.fullHistory ? "Full history: every recorded event, before the ad launch too." : `Counting since ${TRAFFIC_SINCE_LABEL}`} (the ad launch, midnight America/Los_Angeles). Visitors are distinct PostHog person IDs; People (est.) counts address + browser, unique per day. In Facebook and Instagram's in-app browsers a visitor is a click. "From ads" means the visit carried utm_source or fbclid. Admin pages, Vercel previews and bots never count. Coverage begins ${report.firstTrackedAt?.slice(0, 10) || "when the first event arrives"}. Today is the day in America/Los_Angeles; the report's dates follow ${f.timezone}.`);
  return out.join("\n\n") + "\n";
}
