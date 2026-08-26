import { BlueprintShell, Ic } from "./dashboard-mock";
import { PhoneJobs } from "./blueprint-phone";
import { Reveal } from "./reveal";

/* The Jobs plate. Same device as the hero's Overview shot — BlueprintShell is
   the shared chrome — showing the app's actual Jobs page: filters, the ledger
   of jobs, money in mono, and status carried by bordered chips whose colour is
   the status and nothing else. The donor's dark rounded admin card is gone. */

type Status = "DRAFT" | "SCHEDULED" | "IN PROGRESS" | "PAID";

const STATUS_CHIP: Record<Status, string> = {
  DRAFT: "border-dashed border-slate-400 text-slate-500",
  SCHEDULED: "border-[#1854A0] bg-[#1854A0]/[0.06] text-[#1854A0]",
  "IN PROGRESS": "border-[#4A9EFF] bg-[#4A9EFF]/10 text-[#1854A0]",
  PAID: "border-emerald-600 bg-emerald-600/[0.07] text-emerald-700",
};

const JOBS: { t: string; by: string; inv: string; pct: number | null; status: Status }[] = [
  { t: "Nguyen kitchen — cabinet install", by: "Marco's crew · 2 days ago", inv: "$18,600", pct: null, status: "SCHEDULED" },
  { t: "Ortiz hall bath — tile & glass set", by: "Sam's crew · 3 days ago", inv: "$6,200", pct: null, status: "SCHEDULED" },
  { t: "Whitfield deck — footing inspection", by: "Marco's crew · just now", inv: "", pct: null, status: "DRAFT" },
  { t: "Kowalski basement — framing walls", by: "Sam's crew · a week ago", inv: "$9,900", pct: 72, status: "IN PROGRESS" },
  { t: "Baptiste garage — estimate follow-up", by: "Rosa · 16 days ago", inv: "$8,410", pct: 84, status: "IN PROGRESS" },
  { t: "Harmon powder room — punch list", by: "Marco's crew · 24 days ago", inv: "$8,400", pct: 83, status: "IN PROGRESS" },
  { t: "Delgado siding & trim — final draw", by: "Sam's crew · 29 days ago", inv: "$21,300", pct: 100, status: "PAID" },
  { t: "Feldman fence — 120 lf cedar", by: "Rosa · a month ago", inv: "$7,950", pct: 100, status: "PAID" },
  { t: "Okafor mudroom built-ins", by: "Marco's crew · 2 months ago", inv: "$5,920", pct: 100, status: "PAID" },
];

const FILTERS = ["All jobs", "All crews", "All clients", "All tags"];

export function BuiltSection() {
  return (
    <section className="relative overflow-hidden bg-white px-5 py-[8vmin] max-sm:pb-[18vmin] sm:px-6">
      <div className="lp-bg lp-bg--frame" aria-hidden />
      <div className="relative z-[1] mx-auto lp-wrap">
        <Reveal>
          <h2 className="lp-eyebrow text-slate-500">Built for the field</h2>
          {/* Say the problem, not the pitch (owner, 2026-08-25). */}
          <p className="mt-6 max-w-[44rem] text-[clamp(26px,2.8vw,40px)] font-bold leading-[1.2] tracking-[-0.015em] text-slate-500">
            The job ends and the paperwork starts — the estimate, the invoice,
            the three people still waiting on a text.{" "}
            <span className="text-lp-ink">JobFlex does that half of the job.</span>
          </p>
          <p className="mt-6 text-[clamp(26px,2.8vw,40px)] font-bold tracking-[-0.015em] text-lp-ink">
            One price. Add the whole crew.
          </p>
        </Reveal>

        {/* Mobile: black-and-white jobs board */}
        <Reveal delay={120} className="mt-10 sm:hidden">
          <PhoneJobs />
        </Reveal>

        {/* The Jobs page, on the same blueprint plate as the hero shot */}
        <Reveal delay={120} className="mt-14 hidden sm:block">
          <BlueprintShell active="Jobs" search="Search jobs, crews, clients…" action="New job">
            <div className="lp-bp-kicker">Delivery · Aug 24</div>
            <h3 className="lp-bp-title">Jobs</h3>

            {/* filters, as bordered chips rather than bare dropdown text */}
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {FILTERS.map((f) => (
                <span
                  key={f}
                  className="flex items-center gap-1 rounded-[2px] border-[1.5px] border-black/15 bg-white px-2 py-[3px] font-mono text-[9.5px] font-bold uppercase tracking-[0.06em] text-slate-500"
                >
                  {f}
                  <svg viewBox="0 0 10 10" className="h-2 w-2" aria-hidden>
                    <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              ))}
              <span className="ml-auto font-mono text-[9.5px] font-bold uppercase tracking-[0.06em] text-slate-400">
                Sort · Newest
              </span>
            </div>

            <div className="lp-bp-card">
              <div className="grid grid-cols-[minmax(0,2.4fr)_92px_130px_120px] gap-3 border-b-[1.5px] border-lp-ink pb-2 font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-slate-400">
                <span>Title</span>
                <span className="text-right">Invoiced</span>
                <span className="text-right">Collected</span>
                <span className="text-right">Status</span>
              </div>
              {JOBS.map((r) => (
                <div
                  key={r.t}
                  className="grid grid-cols-[minmax(0,2.4fr)_92px_130px_120px] items-center gap-3 border-b border-black/[0.07] py-[8.5px] last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <Ic name="jobs" className="lp-bp-ic lp-bp-ic--sm" />
                      <span className="truncate text-[12.5px] font-semibold text-lp-ink">{r.t}</span>
                    </div>
                    <div className="mt-[1px] truncate pl-[21px] text-[10.5px] text-slate-500">By {r.by}</div>
                  </div>
                  <span className="text-right font-mono text-[12px] font-bold tabular-nums text-lp-ink">
                    {r.inv || "—"}
                  </span>
                  <span className="flex items-center justify-end gap-2">
                    {r.pct !== null ? (
                      <>
                        <span className="h-[4px] w-[44px] overflow-hidden rounded-full bg-black/[0.08]">
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${r.pct}%`, background: r.pct === 100 ? "#059669" : "#1854A0" }}
                          />
                        </span>
                        <span className="font-mono text-[11px] font-bold tabular-nums text-slate-600">{r.pct}%</span>
                      </>
                    ) : (
                      <span className="font-mono text-[11px] text-slate-300">—</span>
                    )}
                  </span>
                  <span className="text-right">
                    <span
                      className={`inline-block rounded-[2px] border-[1.5px] px-1.5 py-[2.5px] font-mono text-[8.5px] font-bold tracking-[0.08em] ${STATUS_CHIP[r.status]}`}
                    >
                      {r.status}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </BlueprintShell>
        </Reveal>
      </div>
    </section>
  );
}
