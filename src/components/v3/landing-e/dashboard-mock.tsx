"use client";

import { LogoMark } from "./logo";
import { useCountUp, useInView } from "./use-in-view";

/* The hero's product shot, drawn in the blueprint language the real app uses:
   drafting paper, 2px ink frames, near-square corners, labels above numerals.
   It is a mock, not the shell — but it has to read as the same product, so the
   vocabulary tracks dashboard-blueprint rather than the donor's dark card.

   Deliberately quiet (owner, 2026-08-24): every row carries an icon, and the
   plate is taller with more air rather than denser. A hero shot is read at a
   glance, so it shows the shape of the product, not its data. */

const ICON: Record<string, string> = {
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  doc: "M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8zM14 3v5h5M9.5 13h5M9.5 17h4",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.4 3-5.5 6.5-5.5s6.5 2.1 6.5 5.5M17 5.5a3.5 3.5 0 0 1 0 6",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  calendar: "M3.5 5h17v16h-17zM3.5 10h17M8 2.5V7M16 2.5V7",
  jobs: "M3 7.5h18v13H3zM8.5 7.5V5a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 5v2.5",
  // A hard hat, read at 15px (owner, 2026-08-25). The previous head-and-
  // shoulders glyph collapsed into a blob at this size and said nothing.
  worker:
    "M2.5 18.5h19v-2.2a1 1 0 0 0-1-1h-17a1 1 0 0 0-1 1v2.2zM10 15.3V6.2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v9.1M4.8 15.3v-2.6A6 6 0 0 1 10 6.8M14 6.8a6 6 0 0 1 5.2 5.9v2.6",
  money: "M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.6 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3",
  card: "M2.5 5.5h19v13h-19zM2.5 10h19",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4.2-4.2",
  folder: "M3 6.5h6l2 2.5h10v11H3zM3 6.5V4.5h5l2 2",
  crm: "M6 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM12 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM7.6 8.4l3 7M16.4 8.4l-3 7",
  hire: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.4 3-5.5 6.5-5.5s6.5 2.1 6.5 5.5M19 8v6M16 11h6",
  building: "M4 21V4.5h10V21M14 10h6v11M7 8h4M7 12h4M7 16h4M17 14h1M17 18h1",
  spark: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM18.5 16.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z",
  roof: "M2.5 11.5 12 4l9.5 7.5M5.5 10.5V20h13v-9.5M9.5 20v-5h5v5",
  fence: "M4 9.5 6.5 7l2.5 2.5V21H4zM10 9.5 12.5 7l2.5 2.5V21h-5zM16 9.5 18.5 7 21 9.5V21h-5zM2.5 12h19M2.5 16h19",
  video: "M3 6.5h11v11H3zM14 10.5l6.5-3.5v10L14 13.5z",
  phone: "M7 3.5h10v17H7zM10.5 18h3",
  chat: "M4 5h16v11H9l-5 4z",
  megaphone: "M4 10v4h3l8 4V6l-8 4zM17 9.5a3 3 0 0 1 0 5",
  star: "M12 4l2.5 5.2 5.5.8-4 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4-3.9 5.5-.8z",
  gear: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.5 12a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.6 3h-4l-.4 2.6c-.7.3-1.4.7-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1c.6.5 1.3.9 2 1.2l.4 2.6h4l.4-2.6c.7-.3 1.4-.7 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  check: "M4 12.5l5 5L20 6.5",
  pen: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  plus: "M12 5v14M5 12h14",
};

export function Ic({ name, className = "lp-bp-ic" }: { name: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        d={ICON[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* The REAL sidebar, section for section (owner, 2026-08-24). A shortened menu
   made the product look smaller than it is; the list now says what the app
   actually carries. It runs past the plate's floor exactly as it does in the
   app — the column clips, and the account row stays pinned to the bottom. */
const NAV: { label: string; items: { name: string; icon: string; badge?: string; on?: boolean }[] }[] = [
  {
    label: "Work",
    items: [
      { name: "Overview", icon: "grid", on: true },
      { name: "Proposals", icon: "doc" },
      { name: "Clients", icon: "users" },
      { name: "Leads", icon: "target" },
      { name: "Projects", icon: "folder" },
      { name: "CRM", icon: "crm" },
    ],
  },
  {
    label: "Delivery",
    items: [
      { name: "Calendar", icon: "calendar" },
      { name: "Jobs", icon: "jobs", badge: "6" },
      { name: "Workers", icon: "worker" },
      { name: "Hire", icon: "hire" },
      { name: "Company", icon: "building" },
    ],
  },
  {
    label: "Money",
    items: [
      { name: "Financials", icon: "money" },
      { name: "Subscription", icon: "card" },
    ],
  },
  {
    label: "Automation",
    items: [
      { name: "Smart Proposal", icon: "spark" },
      { name: "Roof estimator", icon: "roof" },
      { name: "Fence estimator", icon: "fence" },
      { name: "Video estimator", icon: "video" },
      { name: "Phone", icon: "phone" },
      { name: "Messages", icon: "chat" },
      { name: "Announcements", icon: "megaphone" },
      { name: "Reviews", icon: "star" },
    ],
  },
];

const ACTIVITY: { icon: string; title: string; meta: string }[] = [
  { icon: "check", title: "Casey Stone accepted “Rough electrical”", meta: "Accepted · 1d ago" },
  { icon: "doc", title: "Proposal sent — “Full kitchen remodel”", meta: "Created · 1d ago" },
  { icon: "users", title: "Casey Stone assigned to “Rough electrical”", meta: "Assigned · 1d ago" },
  { icon: "pen", title: "Started work on “Mezzanine steel”", meta: "Updated · 2d ago" },
  { icon: "money", title: "Invoice #1042 paid — Ortiz hall bath", meta: "Paid · 3d ago" },
];

const TREND = [18, 26, 21, 34, 29, 41, 38, 52, 47, 61];

function Kpi({
  label,
  value,
  prefix = "",
  accent = false,
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
    <div className="lp-bp-kpi">
      <div className="lp-bp-kpi-lbl">{label}</div>
      <div className={`lp-bp-kpi-val${accent ? " is-accent" : ""}`}>
        {prefix}
        {n.toLocaleString("en-US")}
      </div>
    </div>
  );
}

/** The plate itself — sidebar, topbar, frame — with the page content slotted
    in. DashboardMock and the Jobs plate are the same device showing two
    different screens, so they must share this chrome verbatim. */
export function BlueprintShell({
  active,
  search,
  action,
  rootRef,
  children,
}: {
  active: string;
  search: string;
  action: string;
  rootRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}) {
  return (
    <div ref={rootRef} className="lp-bp">
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="lp-bp-sb">
        {/* Absolutely filled: the menu is longer than the plate is tall, and a
            column that measured its own content would stretch the whole shot.
            The list clips at the floor exactly as the app's does. */}
        <div className="lp-bp-sb-inner">
        <div className="lp-bp-sb-head">
          <LogoMark tone="paper" className="lp-mark-box--xs" />
          <span className="lp-bp-sb-brand">
            <span className="lp-bp-sb-name">JOBFLEX</span>
            <span className="lp-bp-sb-sub">Contractor OS</span>
          </span>
        </div>
        <div className="lp-bp-sb-scroll">
          {NAV.map((group) => (
            <div key={group.label}>
              <div className="lp-bp-sb-lbl">{group.label}</div>
              {group.items.map((it) => (
                <div key={it.name} className={`lp-bp-sb-link${it.name === active ? " is-on" : ""}`}>
                  <Ic name={it.icon} />
                  {it.name}
                  {it.badge && <span className="lp-bp-sb-badge">{it.badge}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
        {/* Pinned to the floor of the column, like the app's own account row —
            the menu above it clips, this never does. */}
        <div className="lp-bp-sb-acct">
          <span className="lp-bp-sb-avatar">JR</span>
          <span className="lp-bp-sb-acct-body">
            <span className="lp-bp-sb-acct-name">Jamie Rivera</span>
            <span className="lp-bp-sb-acct-role">Owner</span>
          </span>
          <span className="lp-bp-sb-acct-gear">
            <Ic name="gear" className="lp-bp-ic lp-bp-ic--sm" />
          </span>
        </div>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────── */}
      <div className="lp-bp-main">
        <div className="lp-bp-topbar">
          <span className="lp-bp-search">
            <Ic name="search" className="lp-bp-ic lp-bp-ic--sm" />
            {search}
          </span>
          <span className="lp-bp-btn">
            <Ic name="plus" className="lp-bp-ic lp-bp-ic--sm" />
            {action}
          </span>
        </div>

        <div className="lp-bp-content">{children}</div>
      </div>
    </div>
  );
}

export function DashboardMock() {
  const { ref, inView } = useInView<HTMLDivElement>(0.2);
  const max = Math.max(...TREND);
  const pt = (v: number, i: number) => ({
    x: (i / (TREND.length - 1)) * 292 + 4,
    y: 132 - (v / max) * 112,
  });

  return (
    <BlueprintShell
      active="Overview"
      search="Search clients, proposals, leads…"
      action="New estimate"
      rootRef={ref}
    >
          <div className="lp-bp-kicker">Good morning · Aug 24</div>
          <h3 className="lp-bp-title">Overview</h3>

          <div className="lp-bp-kpis">
            <Kpi label="Revenue · 30d" value={48200} prefix="$" run={inView} />
            <Kpi label="Pipeline" value={307511} prefix="$" run={inView} accent />
            <Kpi label="Open proposals" value={22} run={inView} accent />
            <Kpi label="New leads · 7d" value={9} run={inView} />
          </div>

          <div className="lp-bp-grid">
            {/* Revenue trend */}
            <div className="lp-bp-card">
              <div className="lp-bp-card-head">
                <span className="lp-bp-card-title">Revenue trend</span>
                <span className="lp-bp-tag">Last 7 days</span>
              </div>
              <svg viewBox="0 0 300 146" className="lp-bp-chart" aria-hidden>
                {[20, 56, 92].map((y) => (
                  <line key={y} x1="0" y1={y} x2="300" y2={y} stroke="rgba(24,84,160,.09)" strokeWidth="1" />
                ))}
                <path
                  d={TREND.map((v, i) => `${i === 0 ? "M" : "L"}${pt(v, i).x} ${pt(v, i).y}`).join(" ")}
                  fill="none"
                  stroke="#1854A0"
                  strokeWidth="2.5"
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={inView ? 0 : 1}
                  style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(.4,0,.2,1) .2s" }}
                />
                {TREND.map((v, i) => (
                  <rect
                    key={i}
                    x={pt(v, i).x - 3.5}
                    y={pt(v, i).y - 3.5}
                    width="7"
                    height="7"
                    fill="#ffffff"
                    stroke="#1854A0"
                    strokeWidth="2"
                    style={{ opacity: inView ? 1 : 0, transition: `opacity .3s ease ${0.55 + i * 0.05}s` }}
                  />
                ))}
                <line x1="0" y1="134" x2="300" y2="134" stroke="#0a0a0a" strokeWidth="1.5" />
              </svg>
              <div className="lp-bp-axis">
                <span>Tue</span>
                <span>Thu</span>
                <span>Sat</span>
                <span>Mon</span>
              </div>
            </div>

            {/* Recent activity */}
            <div className="lp-bp-card">
              <div className="lp-bp-card-head">
                <span className="lp-bp-card-title">Recent activity</span>
              </div>
              {ACTIVITY.map((a) => (
                <div key={a.title} className="lp-bp-act">
                  <span className="lp-bp-act-ic">
                    <Ic name={a.icon} className="lp-bp-ic lp-bp-ic--sm" />
                  </span>
                  <span className="lp-bp-act-body">
                    <span className="lp-bp-act-title">{a.title}</span>
                    <span className="lp-bp-act-meta">{a.meta}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* This week — the real overview carries a day strip under the fold */}
          <div className="lp-bp-card lp-bp-week">
            <div className="lp-bp-card-head">
              <span className="lp-bp-card-title">This week</span>
              <span className="lp-bp-tag">4 jobs booked</span>
            </div>
            <div className="lp-bp-days">
              {[
                { d: "Mon", n: 18, dot: true },
                { d: "Tue", n: 19, dot: true },
                { d: "Wed", n: 20, today: true, dot: true },
                { d: "Thu", n: 21 },
                { d: "Fri", n: 22, dot: true },
                { d: "Sat", n: 23 },
                { d: "Sun", n: 24 },
              ].map((d) => (
                <span key={d.d} className={`lp-bp-day${d.today ? " is-today" : ""}`}>
                  <span className="lp-bp-day-d">{d.d}</span>
                  <span className="lp-bp-day-n">{d.n}</span>
                  <span className={`lp-bp-day-dot${d.dot ? "" : " is-off"}`} />
                </span>
              ))}
            </div>
          </div>
    </BlueprintShell>
  );
}
