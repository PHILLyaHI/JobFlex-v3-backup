import { JobsWidgetMobile } from "./jobs-widget-mobile";
import { LogoMark } from "./logo";
import { Reveal } from "./reveal";

const ADMIN_ROWS = [
  { t: "Nguyen kitchen — cabinet install", by: "Marco's crew · 2 days ago", inv: "$18,600", col: "", pill: "SCHEDULED", pc: "text-emerald-400 ring-emerald-400/30" },
  { t: "Ortiz hall bath — tile & glass set", by: "Sam's crew · 3 days ago", inv: "$6,200", col: "", pill: "SCHEDULED", pc: "text-emerald-400 ring-emerald-400/30" },
  { t: "Whitfield deck — footing inspection", by: "Marco's crew · just now", inv: "", col: "", pill: "DRAFT", pc: "text-pink-400 ring-pink-400/30" },
  { t: "Kowalski basement — framing walls", by: "Sam's crew · a week ago", inv: "$9,900", col: "72%", pill: "IN PROGRESS", pc: "text-sky-300 ring-sky-300/30" },
  { t: "Baptiste garage — estimate follow-up", by: "Rosa · 16 days ago", inv: "$8,410", col: "84%", pill: "IN PROGRESS", pc: "text-sky-300 ring-sky-300/30" },
  { t: "Harmon powder room — punch list", by: "Marco's crew · 24 days ago", inv: "$8,400", col: "83%", pill: "IN PROGRESS", pc: "text-sky-300 ring-sky-300/30" },
  { t: "Delgado siding & trim — final draw", by: "Sam's crew · 29 days ago", inv: "$21,300", col: "100%", pill: "PAID", pc: "text-white/50 ring-white/20" },
  { t: "Feldman fence — 120 lf cedar", by: "Rosa · a month ago", inv: "$7,950", col: "100%", pill: "PAID", pc: "text-white/50 ring-white/20" },
  { t: "Okafor mudroom built-ins", by: "Marco's crew · 2 months ago", inv: "$5,920", col: "100%", pill: "PAID", pc: "text-white/50 ring-white/20" },
];

const SIDE = [
  ["Dashboard", false],
  ["View portal", false],
  ["Estimates", true],
  ["· Drafts", false],
  ["· Sent", false],
  ["· Approved", false],
  ["Jobs", false],
  ["Schedule", false],
  ["Clients", false],
  ["Invoices", false],
] as const;

export function BuiltSection() {
  return (
    <section className="relative overflow-hidden bg-white px-5 py-[8vmin] sm:px-6">
      <div className="mx-auto lp-wrap">
        <Reveal>
          <h2 className="lp-eyebrow text-slate-500">Built for the field</h2>
          <p className="mt-6 max-w-[44rem] text-[clamp(26px,2.8vw,40px)] font-bold leading-[1.2] tracking-[-0.015em] text-slate-500">
            Some software is built for the office and sold to the trades.
            JobFlex is built for the people who{" "}
            <span className="text-lp-ink">build everything else</span> — small
            shops, family crews, independent trades.
          </p>
          <p className="mt-6 text-[clamp(26px,2.8vw,40px)] font-bold tracking-[-0.015em] text-lp-ink">
            No bloat. No per-seat games.
          </p>
        </Reveal>

        {/* Mobile: black-and-white jobs board */}
        <Reveal delay={120} className="mt-10 sm:hidden">
          <JobsWidgetMobile />
        </Reveal>

        {/* Dark admin mock */}
        <Reveal delay={120} className="mt-14 hidden sm:block">
          <div className="flex overflow-hidden rounded-2xl bg-lp-base shadow-[0_40px_80px_-20px_rgb(15_23_42/0.4)] ring-1 ring-slate-900/50">
            {/* sidebar */}
            <aside className="hidden w-[230px] shrink-0 flex-col border-r border-white/[0.06] px-5 py-6 md:flex">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <LogoMark className="h-6 w-6 text-white/10" />
                  <span className="text-[15px] font-bold text-white">jobflex</span>
                </span>
                <svg viewBox="0 0 16 16" className="h-4 w-4 text-white/30" aria-hidden>
                  <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <nav className="mt-7 space-y-[3px]">
                {SIDE.map(([label, active]) => (
                  <div
                    key={label}
                    className={`rounded-md px-2.5 py-[6px] text-[13px] font-medium ${
                      active ? "bg-white/[0.08] text-white" : label.startsWith("·") ? "pl-6 text-white/35" : "text-white/50"
                    }`}
                  >
                    {label.replace("· ", "")}
                    {label === "Clients" && (
                      <span className="float-right rounded bg-white/[0.08] px-1.5 text-[10px] leading-[18px] text-white/40">
                        412
                      </span>
                    )}
                  </div>
                ))}
              </nav>
              <div className="mt-auto space-y-4 pt-10">
                <div className="rounded-md px-2.5 text-[13px] font-medium text-white/50">
                  JobFlex <span className="text-white/25">(Pro)</span>
                </div>
                <div className="flex items-center justify-between px-2.5">
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-[10px] font-bold text-white">
                      R
                    </span>
                    <span className="text-[11px] text-white/40">⌄</span>
                  </span>
                  <span className="flex items-center gap-2 text-white/30">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
                      <circle cx="8" cy="8" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                    <span className="relative inline-block h-3.5 w-6 rounded-full bg-white/15">
                      <span className="absolute right-[2px] top-[2px] h-2.5 w-2.5 rounded-full bg-white/80" />
                    </span>
                  </span>
                </div>
              </div>
            </aside>

            {/* main table */}
            <div className="min-w-0 flex-1 px-4 py-6 sm:px-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <span className="text-[22px] font-bold text-white">Jobs</span>
                <div className="hidden items-center gap-5 text-[12px] text-white/40 xl:flex">
                  <span>All jobs ⌄</span>
                  <span>All crews ⌄</span>
                  <span>All clients ⌄</span>
                  <span>All tags ⌄</span>
                  <span>Sort by: Newest ⌄</span>
                </div>
                <span className="rounded-md bg-lp-lime px-3.5 py-1.5 text-[12.5px] font-bold text-lp-base">
                  New job
                </span>
              </div>
              <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-white/[0.07] pb-2 text-[10px] font-semibold tracking-[1px] text-white/30 sm:grid-cols-[minmax(0,2.2fr)_minmax(0,0.5fr)_minmax(0,0.5fr)_minmax(0,0.7fr)]">
                <span>TITLE</span>
                <span className="hidden text-right sm:block">INVOICED</span>
                <span className="hidden text-right sm:block">COLLECTED</span>
                <span className="text-right">STATUS</span>
              </div>
              {ADMIN_ROWS.map((r) => (
                <div
                  key={r.t}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/[0.04] py-[11px] last:border-0 sm:grid-cols-[minmax(0,2.2fr)_minmax(0,0.5fr)_minmax(0,0.5fr)_minmax(0,0.7fr)]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-medium text-white/90">{r.t}</div>
                    <div className="truncate text-[11px] text-white/30">
                      By <span className="text-white/45">{r.by}</span>
                    </div>
                  </div>
                  <span className="hidden text-right text-[12.5px] text-white/55 sm:block">{r.inv}</span>
                  <span className="hidden text-right text-[12.5px] text-white/55 sm:block">{r.col}</span>
                  <span className="text-right">
                    <span className={`inline-block rounded px-2 py-[3px] text-[9.5px] font-bold tracking-wide ring-1 ${r.pc}`}>
                      {r.pill}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
