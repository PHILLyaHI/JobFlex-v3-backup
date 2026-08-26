"use client";

import { Ic } from "./dashboard-mock";
import { LogoMark } from "./logo";
import { useCountUp, useInView } from "./use-in-view";

/* ============================================================
   BLUEPRINT PLATE — HANDHELD
   ============================================================
   The phone build of the product shot. The desktop plate cannot be squeezed
   to 350px: its 208px sidebar eats the page and the four-across KPI row goes
   unreadable. So the sidebar becomes the app's real handheld topbar — drawer
   button, lockup, utility squares — and each screen below it is laid out for
   the column it actually gets.

   Chrome lives in PhonePlate; the four screens are the four surfaces the
   landing talks about. Every one of them is deliberately short on words: at
   this size a picture of the product has to be read at a glance.
   ============================================================ */

export function PhonePlate({
  kicker,
  title,
  rootRef,
  children,
}: {
  kicker: string;
  title: string;
  rootRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}) {
  return (
    <div ref={rootRef} className="lp-ph">
      <div className="lp-ph-bar">
        <span className="lp-ph-sq">
          <svg viewBox="0 0 24 24" className="lp-ph-ic" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="lp-ph-brand">
          <LogoMark tone="paper" className="lp-mark-box--xs" />
          <span className="lp-ph-brand-txt">
            <span className="lp-ph-name">JOBFLEX</span>
            <span className="lp-ph-sub">Contractor OS</span>
          </span>
        </span>
        <span className="lp-ph-sq">
          <Ic name="plus" className="lp-ph-ic" />
        </span>
        <span className="lp-ph-sq">
          <Ic name="chat" className="lp-ph-ic" />
        </span>
        <span className="lp-ph-sq">
          <svg viewBox="0 0 24 24" className="lp-ph-ic" aria-hidden>
            <path
              d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M10.5 20a1.8 1.8 0 0 0 3 0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>

      <div className="lp-ph-body">
        <div className="lp-ph-kicker">{kicker}</div>
        <h3 className="lp-ph-title">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function PhoneKpi({
  label,
  value,
  prefix = "",
  accent,
  run,
}: {
  label: string;
  value: number;
  prefix?: string;
  accent?: boolean;
  run: boolean;
}) {
  const n = useCountUp(value, run, 1200);
  return (
    <div className="lp-ph-kpi">
      <div className="lp-ph-kpi-lbl">{label}</div>
      <div className={`lp-ph-kpi-val${accent ? " is-accent" : ""}`}>
        {prefix}
        {n.toLocaleString("en-US")}
      </div>
    </div>
  );
}

/* ── 1 · Overview — the hero's shot on a phone ───────────── */

const TREND = [18, 26, 21, 34, 29, 41, 38, 52, 47, 61];

const ACTIVITY: { icon: string; title: string; meta: string }[] = [
  { icon: "check", title: "Casey accepted “Rough electrical”", meta: "Accepted · 1d ago" },
  { icon: "doc", title: "Proposal sent — Full kitchen remodel", meta: "Created · 1d ago" },
  { icon: "money", title: "Invoice #1042 paid — Ortiz bath", meta: "Paid · 3d ago" },
];

export function PhoneOverview() {
  const { ref, inView } = useInView<HTMLDivElement>(0.2);
  const max = Math.max(...TREND);
  const pt = (v: number, i: number) => ({
    x: (i / (TREND.length - 1)) * 292 + 4,
    y: 104 - (v / max) * 88,
  });

  return (
    <PhonePlate kicker="Good morning · Aug 24" title="Overview" rootRef={ref}>
      <div className="lp-ph-card">
        <div className="lp-ph-kpis">
          <PhoneKpi label="Revenue · 30d" value={48200} prefix="$" run={inView} />
          <PhoneKpi label="Pipeline" value={307511} prefix="$" run={inView} accent />
          <PhoneKpi label="Open proposals" value={22} run={inView} accent />
          <PhoneKpi label="New leads · 7d" value={9} run={inView} />
        </div>
      </div>

      <div className="lp-ph-card">
        <div className="lp-ph-card-head">
          <span className="lp-ph-card-title">Revenue trend</span>
          <span className="lp-ph-tag">7 days</span>
        </div>
        <svg viewBox="0 0 300 116" className="block h-auto w-full" aria-hidden>
          {[18, 48, 78].map((y) => (
            <line key={y} x1="0" y1={y} x2="300" y2={y} stroke="rgba(24,84,160,.09)" strokeWidth="1" />
          ))}
          <path
            d={TREND.map((v, i) => `${i === 0 ? "M" : "L"}${pt(v, i).x} ${pt(v, i).y}`).join(" ")}
            fill="none"
            stroke="#1854A0"
            strokeWidth="2.6"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={inView ? 0 : 1}
            style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(.4,0,.2,1) .2s" }}
          />
          <line x1="0" y1="106" x2="300" y2="106" stroke="#0a0a0a" strokeWidth="1.5" />
        </svg>
      </div>

      <div className="lp-ph-card">
        <div className="lp-ph-card-head">
          <span className="lp-ph-card-title">Recent activity</span>
        </div>
        {ACTIVITY.map((a) => (
          <div key={a.title} className="lp-ph-row">
            <Ic name={a.icon} className="lp-ph-ic shrink-0 opacity-70" />
            <span className="lp-ph-row-body">
              <span className="lp-ph-row-t">{a.title}</span>
              <span className="lp-ph-row-m">{a.meta}</span>
            </span>
          </div>
        ))}
      </div>
    </PhonePlate>
  );
}

/* ── 2 · Schedule — crews down, the week across ──────────── */

const WEEK = [
  { d: "Mon", n: 14 },
  { d: "Tue", n: 15 },
  { d: "Wed", n: 16, today: true },
  { d: "Thu", n: 17 },
  { d: "Fri", n: 18 },
];

type Lane = { who: string; jobs: { day: number; span: number; label: string; tone: string }[] };

/* Labels are sized to the cell they land in — a one-day chip is ~48px wide,
   so anything past five characters comes back as an ellipsis. */
const LANES: Lane[] = [
  { who: "Marco", jobs: [{ day: 1, span: 2, label: "Nguyen kitchen", tone: "tone-blue" }] },
  { who: "Sam", jobs: [{ day: 2, span: 2, label: "Ortiz tile set", tone: "tone-sky" }] },
  { who: "Rosa", jobs: [{ day: 4, span: 2, label: "Kowalski tape", tone: "" }] },
  { who: "Dmitri", jobs: [{ day: 3, span: 1, label: "Insp.", tone: "tone-sky" }] },
];

export function PhoneSchedule() {
  const { ref, inView } = useInView<HTMLDivElement>(0.25);
  let chip = 0;

  return (
    <PhonePlate kicker="Delivery · Aug 14 — 18" title="Schedule" rootRef={ref}>
      <div className="lp-ph-card">
        <div className="lp-ph-days">
          {WEEK.map((d) => (
            <span key={d.n} className={`lp-ph-day${d.today ? " is-today" : ""}`}>
              <span className="lp-ph-day-d">{d.d}</span>
              <span className="lp-ph-day-n">{d.n}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="lp-ph-card">
        {LANES.map((l) => (
          <div key={l.who} className="lp-ph-lane">
            <span className="lp-ph-lane-who">{l.who}</span>
            <span className="lp-ph-lane-grid">
              {WEEK.map((_, i) => (
                <span key={i} className="lp-ph-slot" style={{ gridColumn: i + 1, gridRow: 1 }} />
              ))}
              {l.jobs.map((j) => {
                const i = chip++;
                return (
                  <span
                    key={j.label}
                    className={`lp-ph-job ${j.tone}`}
                    style={{
                      gridColumn: `${j.day} / span ${j.span}`,
                      gridRow: 1,
                      opacity: inView ? 1 : 0,
                      transform: inView ? "none" : "translateY(4px)",
                      transitionDelay: `${180 + i * 90}ms`,
                    }}
                  >
                    {j.label}
                  </span>
                );
              })}
            </span>
          </div>
        ))}
      </div>
    </PhonePlate>
  );
}

/* ── 3 · Jobs — the ledger, phone width ──────────────────── */

const JOBS: { t: string; who: string; amt: string; status: string; cls: string }[] = [
  { t: "Nguyen kitchen", who: "Marco’s crew", amt: "$18,600", status: "SCHEDULED", cls: "is-blue" },
  { t: "Ortiz hall bath", who: "Sam’s crew", amt: "$6,200", status: "SCHEDULED", cls: "is-blue" },
  { t: "Kowalski basement", who: "Sam’s crew", amt: "$9,900", status: "RUNNING", cls: "" },
  { t: "Whitfield deck", who: "Unassigned", amt: "—", status: "DRAFT", cls: "is-draft" },
  { t: "Delgado siding", who: "Sam’s crew", amt: "$21,300", status: "PAID", cls: "is-paid" },
];

export function PhoneJobs() {
  const { ref, inView } = useInView<HTMLDivElement>(0.2);

  return (
    <PhonePlate kicker="Delivery · Aug 24" title="Jobs" rootRef={ref}>
      <div className="lp-ph-card">
        <div className="lp-ph-kpis">
          <PhoneKpi label="Open jobs" value={12} run={inView} accent />
          <PhoneKpi label="Invoiced · 30d" value={64300} prefix="$" run={inView} />
        </div>
      </div>

      <div className="lp-ph-card">
        <div className="lp-ph-card-head">
          <span className="lp-ph-card-title">All jobs</span>
          <span className="lp-ph-tag">Newest</span>
        </div>
        {JOBS.map((j) => (
          <div key={j.t} className="lp-ph-row">
            <Ic name="jobs" className="lp-ph-ic shrink-0 opacity-70" />
            <span className="lp-ph-row-body">
              <span className="lp-ph-row-t">{j.t}</span>
              <span className="lp-ph-row-m">{j.who}</span>
            </span>
            <span className="lp-ph-row-v">{j.amt}</span>
            <span className={`lp-ph-chip ${j.cls}`}>{j.status}</span>
          </div>
        ))}
      </div>
    </PhonePlate>
  );
}
