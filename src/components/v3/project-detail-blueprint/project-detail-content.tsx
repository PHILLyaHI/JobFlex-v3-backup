"use client";

// PROJECT DETAIL / BLUEPRINT — the page.
// Route: /dashboard/projects/[id].
//
// A verbatim port of `jobflex-projectdetail-blueprint (14).html`, wired to the
// REAL project. It REPLACES the classic record page that lived at
// src/app/(dashboard)/dashboard/projects/[id]/ — it does not stand beside it.
// (That reverses the side-by-side convention the earlier blueprint ports
// recorded in their headers, e.g. /dashboard/subscription-blueprint.)
//
// ── CHROME DROPPED ─────────────────────────────────────────────────
// The donor file carries its own sidebar, topbar, SVG sprite, `.layout`,
// `.main` (graph-paper field + scrollbars) and `.content` wrapper. ALL of it is
// discarded here: blueprint-shell already renders that furniture from
// src/app/dashboard/layout.tsx and it persists across navigation. Verified
// value-for-value against the donor before dropping — `--sidebar-w: 264px`,
// `--topbar-h: 62px`, `.content { padding: 40px 96px 80px; gap: 22px;
// display: flex; flex-direction: column; position: relative; z-index: 1 }` —
// all identical. This component returns ONLY the donor's `.content` children,
// as a fragment, so they stay DIRECT children of `.content`: the donor's
// reveal cascade walks `.content > *`.
//
// Also dropped, for the same reason: the donor's `#i-plus` symbol (the shell
// sprite's copy is character-identical — same viewBox, same two path `d`s), the
// nav burger / backdrop (the shell owns the drawer), FLUID SCALE, the sidebar
// cascade and the graph-paper parallax (shell-behavior.ts, same donor numbers).
//
// ── THE FIXTURE IS GONE ────────────────────────────────────────────
// The donor's six-job `JOBS` array, its three-job `AVAIL` array, its
// "Maple Ridge — Phase 2" title, its "$86,500" budget and its hardcoded
// Jun 15 → Sep 30 2026 window are all placeholders. Every one is read from the
// project instead; the page's existing query is untouched, and `attachJob` —
// the server action the old drawer called — still does the writing.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { attachJob } from "@/actions/projects";
import { closeMdl, openMdl } from "@/components/v3/blueprint-shell/mdl-motion";
import { money } from "@/lib/format";
import { useProjectDetailMotion } from "./project-detail-motion";
import {
  MO,
  MOFULL,
  type PdAvailProposal,
  type PdJob,
  type PdProject,
  attachableFirst,
  badgeMod,
  bucketOf,
  labelOf,
  monthKey,
  proposalMeta,
  shortDate,
} from "./project-detail-data";
import s from "./project-detail.module.css";

/** Hashed module class, or the literal name when the module has none — which is
 *  how the fleet's global `rv` / `rv-in` / `rv-cell` / `pressed` pass through. */
function cx(...names: Array<string | false | null | undefined>): string {
  return names
    .filter(Boolean)
    .map((n) => (s as Record<string, string>)[n as string] ?? (n as string))
    .join(" ");
}

type View = "list" | "calendar" | "gantt";
/** Donor: `let listF = 'all'`. */
type ListFilter = "all" | "done" | "prog" | "sch";

/** `?view=` — read so a link can open the record straight on its schedule or
 *  its gantt, at either width (the handheld build reads the same key).
 *  Anything unrecognised falls back to the donor's own default, the list. */
function viewFromParam(raw: string | null): View {
  return raw === "calendar" || raw === "gantt" ? raw : "list";
}

const DAY_MS = 86400000;

export function ProjectDetailContent({
  project,
  jobs,
  availableProposals,
}: {
  project: PdProject;
  jobs: PdJob[];
  availableProposals: PdAvailProposal[];
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [, startTransition] = useTransition();

  // Donor: `let view = 'list'; let listF = 'all', calF = 'all';` — seeded from
  // `?view=` so a deep link opens the right tab, then owned by the tab bar.
  const [view, setView] = useState<View>(() => viewFromParam(search.get("view")));
  const [listF, setListF] = useState<ListFilter>("all");
  const [calF, setCalF] = useState<string>("all");

  // The optimistic move is a set of PROPOSAL ids laid over the server's list:
  // once `router.refresh()` lands, that proposal's jobs are in `jobs` and it is
  // gone from `availableProposals`, and the id turns inert on its own.
  const [moved, setMoved] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The donor has no failure state — its attach cannot fail. A refused write
  // (permissions, a deleted record) says so in the dialog rather than silently
  // rolling the row back.
  const [attachErr, setAttachErr] = useState<string | null>(null);

  useProjectDetailMotion({ btnClass: s.btn, cellClass: s.kpi, valClass: s["kpi-val"] });

  /* ── the attach DIALOG ───────────────────────────────────────────────────
     Was an inline expanding panel under the tab bar; it is a house dialog now
     (owner, 2026-08-15). The motion helpers are imperative — `closeMdl` needs
     the exit keyframes to play before `.open` comes off, and a React render
     that unmounted the box would cut the exit — so the element is driven
     through a ref, exactly as client-detail's two dialogs are. */
  const attachRef = useRef<HTMLDivElement>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [attachOpen, setAttachOpen] = useState(false);

  const after = useCallback((ms: number, fn: () => void) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);

  const closeAttach = useCallback(() => {
    if (attachRef.current) closeMdl(attachRef.current, after);
    setAttachOpen(false);
  }, [after]);

  const openAttach = useCallback(() => {
    if (!attachRef.current) return;
    setAttachErr(null);
    openMdl(attachRef.current);
    setAttachOpen(true);
  }, []);

  useEffect(() => {
    const set = timers.current;
    return () => {
      set.forEach(clearTimeout);
      set.clear();
    };
  }, []);

  // Escape closes, and stops there: the shell binds its own Escape for the
  // command palette and the handheld drawer, and one key press must not
  // dismiss two things.
  useEffect(() => {
    if (!attachOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      closeAttach();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [attachOpen, closeAttach]);

  const shownAvail = useMemo(
    () => attachableFirst(availableProposals.filter((p) => !moved.includes(p.id))),
    [availableProposals, moved],
  );
  /* No optimistic job row any more. The old panel attached ONE job and could
     splice a stand-in for it out of `availableJobs`; a proposal carries n jobs
     whose titles this page never reads, so inventing rows for them would mean
     widening the query to serve 300ms of placeholder. The attached proposal
     leaves the dialog list the instant it is picked (that is what `moved`
     does), and the jobs arrive with the refresh. */
  const shownJobs = jobs;

  /** Attach a PROPOSAL: move every one of its project-less jobs onto this
   *  project through the existing `attachJob` action. Sequential rather than
   *  `Promise.all` — each call revalidates the same two paths, and a partial
   *  failure should stop rather than race. */
  const onAttach = useCallback(
    async (p: PdAvailProposal) => {
      if (p.blocked || !p.linkJobIds.length) return;
      setAttachErr(null);
      setBusyId(p.id);
      setMoved((m) => [...m, p.id]);
      try {
        for (const jobId of p.linkJobIds) {
          await attachJob(project.id, jobId);
        }
        startTransition(() => router.refresh());
      } catch (err) {
        setMoved((m) => m.filter((x) => x !== p.id));
        setAttachErr(err instanceof Error ? err.message : "Could not attach that proposal");
      } finally {
        setBusyId(null);
      }
    },
    [project.id, router],
  );

  // ================= KPI =================
  // Donor: JOBS.length / st === 'sch' / st === 'prog', and a fixed "$86,500".
  const kJobs = shownJobs.length;
  const kSch = shownJobs.filter((j) => j.status === "SCHEDULED").length;
  const kProg = shownJobs.filter((j) => j.status === "IN_PROGRESS").length;

  return (
    <>
      {/* PAGE HEAD */}
      <div className={cx("page-head")}>
        <div>
          <div className={cx("kicker")}>Projects</div>
          <h1 className={cx("page-title")}>{project.name}</h1>
        </div>
      </div>

      {/* KPI */}
      <div className={cx("kpi-grid", "kpi-grid--pd")}>
        <div className={cx("kpi")}>
          <div className={cx("kpi-lbl")}>Jobs</div>
          <div className={cx("kpi-val")}>{kJobs}</div>
        </div>
        <div className={cx("kpi")}>
          <div className={cx("kpi-lbl")}>Scheduled</div>
          <div className={cx("kpi-val")}>{kSch}</div>
        </div>
        <div className={cx("kpi")}>
          <div className={cx("kpi-lbl")}>In progress</div>
          <div className={cx("kpi-val")}>{kProg}</div>
        </div>
        <div className={cx("kpi")}>
          <div className={cx("kpi-lbl")}>Budget</div>
          <div className={cx("kpi-val")}>{money(project.budget)}</div>
        </div>
      </div>

      {/* ВИДЫ + ATTACH */}
      <div className={cx("pd-bar")}>
        <div className={cx("pd-tabs")}>
          <button
            className={cx("pd-tab", view === "list" && "on")}
            type="button"
            onClick={() => setView("list")}
          >
            List
          </button>
          <button
            className={cx("pd-tab", view === "calendar" && "on")}
            type="button"
            onClick={() => setView("calendar")}
          >
            Calendar
          </button>
          <button
            className={cx("pd-tab", view === "gantt" && "on")}
            type="button"
            onClick={() => setView("gantt")}
          >
            Gantt
          </button>
        </div>
        <button className={cx("btn", "btn-ghost")} type="button" onClick={openAttach}>
          <svg className={cx("ic")}>
            <use href="#i-plus" />
          </svg>
          Attach proposal
        </button>
      </div>

      {/* ATTACH DIALOG — was an inline expanding panel under the tab bar
          (owner, 2026-08-15). It wears `mdl pmdl`, the house dialog frame the
          always-on proposals module publishes, so it opens and closes on the
          same motion contract as every other dialog in the app and introduces
          no new vocabulary. What it lists changed too: PROPOSALS, not jobs —
          see the note above `PdAvailProposal` in ./project-detail-data.ts for
          what the schema allows and why some rows arrive blocked. */}
      <div
        className={cx("mdl", "pmdl")}
        ref={attachRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdAttachTitle"
      >
        <div className={cx("mdl-bg")} onClick={closeAttach} />
        <div className={cx("mdl-box")}>
          <div className={cx("mdl-head", "mdl-head--row")}>
            <span id="pdAttachTitle">Attach a proposal</span>
            <button
              className={cx("mdl-x")}
              type="button"
              onClick={closeAttach}
              aria-label="Close dialog"
            >
              <svg className={cx("ic")}>
                <use href="#i-x" />
              </svg>
            </button>
          </div>
          <div className={cx("mdl-txt")}>
            Picking one files its jobs under {project.name}.
          </div>
          <div className={cx("mdl-body", "pd-attach-list")}>
            {attachErr && <div className={cx("pd-attach-err")}>{attachErr}</div>}
            {shownAvail.length ? (
              shownAvail.map((p) => (
                <div className={cx("pd-av", p.blocked && "pd-av--off")} key={p.id}>
                  <span className={cx("pd-av-n")}>{p.title}</span>
                  <span className={cx("pd-av-m")}>{proposalMeta(p, money)}</span>
                  <button
                    className={cx("btn", "btn-primary")}
                    type="button"
                    disabled={Boolean(p.blocked) || busyId === p.id}
                    onClick={() => onAttach(p)}
                  >
                    {busyId === p.id ? "Attaching" : "Attach"}
                  </button>
                </div>
              ))
            ) : (
              <div className={cx("pd-empty")}>No proposals left</div>
            )}
          </div>
          <div className={cx("mdl-foot")}>
            <button className={cx("btn", "btn-ghost")} type="button" onClick={closeAttach}>
              Close
            </button>
          </div>
        </div>
      </div>

      <div>
        {view === "list" ? (
          <ListView jobs={shownJobs} listF={listF} onFilter={setListF} />
        ) : view === "calendar" ? (
          <CalView project={project} jobs={shownJobs} calF={calF} onFilter={setCalF} />
        ) : (
          <GanttView project={project} jobs={shownJobs} />
        )}
      </div>
    </>
  );
}

/* ================= ВИДЫ ================= */

function ListView({
  jobs,
  listF,
  onFilter,
}: {
  jobs: PdJob[];
  listF: ListFilter;
  onFilter: (f: ListFilter) => void;
}) {
  const counts: Record<ListFilter, number> = {
    all: jobs.length,
    done: jobs.filter((j) => bucketOf(j.status) === "done").length,
    prog: jobs.filter((j) => bucketOf(j.status) === "prog").length,
    sch: jobs.filter((j) => bucketOf(j.status) === "sch").length,
  };
  const FILTERS: Array<[ListFilter, string]> = [
    ["all", "All"],
    ["prog", "In progress"],
    ["sch", "Scheduled"],
    ["done", "Done"],
  ];
  const vis = listF === "all" ? jobs : jobs.filter((j) => bucketOf(j.status) === listF);

  return (
    <section className={cx("card")}>
      <div className={cx("pd-jobs-h")}>
        <h2 className={cx("pd-jobs-t")}>Jobs</h2>
        <span className={cx("pd-jobs-s")}>
          {vis.length} of {jobs.length}
        </span>
      </div>
      <div className={cx("pd-fbar")}>
        {FILTERS.map(([k, label]) => (
          <button
            key={k}
            className={cx("pd-f", k !== "all" && "pd-f--" + k, listF === k && "on")}
            type="button"
            onClick={() => onFilter(k)}
          >
            {label} <i>{counts[k]}</i>
          </button>
        ))}
      </div>
      {vis.length ? (
        vis.map((j) => (
          <div className={cx("pd-row")} key={j.id}>
            <div>
              <div className={cx("pd-row-n")}>{j.title}</div>
              <div className={cx("pd-row-m")}>
                {j.clientName ?? "Unassigned"}
                {j.startsAt
                  ? " · " +
                    shortDate(j.startsAt) +
                    (j.endsAt ? " → " + shortDate(j.endsAt) : "")
                  : ""}
              </div>
            </div>
            <span className={cx("pd-b", "pd-b--" + badgeMod(j.status))}>{labelOf(j.status)}</span>
          </div>
        ))
      ) : (
        <div className={cx("pd-empty")}>Nothing in this filter</div>
      )}
    </section>
  );
}

/** The donor's project window, or — when the project carries no dates — the
 *  span the dated jobs themselves cover. The donor hardcodes
 *  `W0 = Jun 15 2026`, `W1 = Sep 30 2026`. */
function windowOf(project: PdProject, jobs: PdJob[]): { w0: number; w1: number } | null {
  if (project.startsAt && project.endsAt) {
    const w0 = project.startsAt.getTime();
    const w1 = project.endsAt.getTime();
    if (w1 > w0) return { w0, w1 };
  }
  const dated = jobs.filter((j) => j.startsAt);
  if (!dated.length) return null;
  const w0 = Math.min(...dated.map((j) => j.startsAt!.getTime()));
  const w1 = Math.max(...dated.map((j) => (j.endsAt ?? j.startsAt!).getTime() + DAY_MS));
  return w1 > w0 ? { w0, w1 } : null;
}

function CalView({
  project,
  jobs,
  calF,
  onFilter,
}: {
  project: PdProject;
  jobs: PdJob[];
  calF: string;
  onFilter: (f: string) => void;
}) {
  // Donor: `const MONTHS = [5, 6, 7, 8]` — the months the project window covers,
  // single-year. Derived here so the chip row follows the real window; the key
  // carries the year too, which the donor's month index alone could not.
  const win = windowOf(project, jobs);
  const months: Array<{ y: number; m: number; key: string }> = [];
  if (win) {
    const cur = new Date(win.w0);
    cur.setHours(0, 0, 0, 0);
    cur.setDate(1);
    const end = new Date(win.w1);
    while (cur.getTime() <= end.getTime()) {
      months.push({ y: cur.getFullYear(), m: cur.getMonth(), key: cur.getFullYear() + "-" + cur.getMonth() });
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  function inMonth(j: PdJob, y: number, m: number) {
    const m0 = new Date(y, m, 1).getTime();
    const m1 = new Date(y, m + 1, 1).getTime() - 1;
    const s0 = j.startsAt!.getTime();
    const e0 = (j.endsAt ?? j.startsAt!).getTime();
    return s0 <= m1 && e0 >= m0;
  }

  const dated = jobs.filter((j) => j.startsAt);
  const sorted = dated
    .filter((j) => {
      if (calF === "all") return true;
      const mo = months.find((x) => x.key === calF);
      return mo ? inMonth(j, mo.y, mo.m) : true;
    })
    .slice()
    .sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime());

  const body: React.ReactNode[] = [];
  let lastMo = "";
  sorted.forEach((j) => {
    const k = monthKey(j.startsAt!);
    if (k !== lastMo) {
      lastMo = k;
      body.push(
        <div className={cx("pd-ag-mo")} key={"mo-" + k}>
          {MOFULL[j.startsAt!.getMonth()]} {j.startsAt!.getFullYear()}
        </div>,
      );
    }
    body.push(
      <div className={cx("pd-agrow")} key={j.id}>
        <span className={cx("pd-ag-d")}>
          {shortDate(j.startsAt!)}
          {j.endsAt ? " → " + shortDate(j.endsAt) : ""}
        </span>
        <div>
          <div className={cx("pd-row-n")}>{j.title}</div>
          <div className={cx("pd-row-m")}>{j.clientName ?? "Unassigned"}</div>
        </div>
        <span className={cx("pd-b", "pd-b--" + badgeMod(j.status))}>{labelOf(j.status)}</span>
      </div>,
    );
  });

  return (
    <section className={cx("card")}>
      <div className={cx("pd-cal-head")}>
        <h2 className={cx("pd-cal-t")}>Schedule</h2>
        <span className={cx("pd-cal-s")}>
          {project.startsAt && project.endsAt
            ? "project window · " + shortDate(project.startsAt) + " → " + shortDate(project.endsAt)
            : "no window set"}
        </span>
      </div>
      <div className={cx("pd-fbar")}>
        <button
          className={cx("pd-f", calF === "all" && "on")}
          type="button"
          onClick={() => onFilter("all")}
        >
          All dates
        </button>
        {months.map((mo) => (
          <button
            key={mo.key}
            className={cx("pd-f", calF === mo.key && "on")}
            type="button"
            onClick={() => onFilter(mo.key)}
          >
            {MOFULL[mo.m].slice(0, 3)} <i>{dated.filter((j) => inMonth(j, mo.y, mo.m)).length}</i>
          </button>
        ))}
      </div>
      {body.length ? body : <div className={cx("pd-empty")}>Nothing scheduled in this range</div>}
    </section>
  );
}

function GanttView({ project, jobs }: { project: PdProject; jobs: PdJob[] }) {
  const win = windowOf(project, jobs);
  const rows = jobs.filter((j) => j.startsAt);

  // Donor, verbatim:
  //   host.querySelectorAll('.pd-g-bar').forEach((b, i) => {
  //     if (reduce) { b.classList.add('in'); return; }
  //     setTimeout(() => b.classList.add('in'), 120 + i * 70);
  //   });
  // Driven straight at the DOM rather than through state, exactly as the donor
  // does — a re-render rebuilds the bars at scaleX(0) and the run replays,
  // which is what `renderView()` produces too.
  const hostRef = useRef<HTMLElement>(null);
  const runKey = rows.map((j) => j.id).join(",");
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bars = Array.from(host.querySelectorAll<HTMLElement>("." + s["pd-g-bar"]));
    const timers: number[] = [];
    bars.forEach((b, i) => {
      if (reduce) {
        b.classList.add(s.in);
        return;
      }
      timers.push(window.setTimeout(() => b.classList.add(s.in), 120 + i * 70));
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [runKey]);

  if (!win || !rows.length) {
    return (
      <section className={cx("card")}>
        <div className={cx("pd-empty")}>Nothing scheduled in this range</div>
      </section>
    );
  }

  const span = win.w1 - win.w0;

  // месячная ось: первое число каждого месяца внутри окна (месяц окна обрезан
  // его началом — донор перечисляет Jul, Aug, Sep для окна Jun 15 → Sep 30)
  const ticks: Array<{ key: string; left: string; label: string }> = [];
  {
    const cur = new Date(win.w0);
    cur.setHours(0, 0, 0, 0);
    cur.setDate(1);
    cur.setMonth(cur.getMonth() + 1);
    while (cur.getTime() <= win.w1) {
      if (cur.getTime() > win.w0) {
        ticks.push({
          key: cur.getFullYear() + "-" + cur.getMonth(),
          left: (((cur.getTime() - win.w0) / span) * 100).toFixed(1),
          label: MO[cur.getMonth()],
        });
      }
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  return (
    <section className={cx("card")} ref={hostRef}>
      <div className={cx("pd-g-axis")}>
        <div></div>
        <div className={cx("pd-g-months")}>
          {ticks.map((t) => (
            <span className={cx("pd-g-month")} key={t.key} style={{ left: t.left + "%" }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
      {rows.map((j) => {
        const st = j.startsAt!.getTime();
        // `+ 86400000` is the donor's: its fixture dates are whole days and the
        // end day is inclusive. Ported as written.
        const en = (j.endsAt ?? j.startsAt!).getTime() + DAY_MS;
        const width = Math.max(3, Math.min(100, ((en - st) / span) * 100));
        const left = Math.min(100 - width, Math.max(0, ((st - win.w0) / span) * 100));
        const label = width >= 12 ? j.title : "";
        return (
          <div className={cx("pd-g-row")} key={j.id}>
            <div className={cx("pd-g-name")}>{j.title}</div>
            <div className={cx("pd-g-track")}>
              <div
                className={cx("pd-g-bar", "pd-g-bar--" + badgeMod(j.status))}
                style={{ left: left.toFixed(1) + "%", width: width.toFixed(1) + "%" }}
                title={
                  j.title +
                  " · " +
                  shortDate(j.startsAt!) +
                  (j.endsAt ? " → " + shortDate(j.endsAt) : "")
                }
              >
                {label}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
