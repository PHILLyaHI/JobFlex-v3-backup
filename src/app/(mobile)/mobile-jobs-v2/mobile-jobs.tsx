"use client";

// MOBILE JOBS (mobile-jobs-v2) — Blueprint system, handheld build.
//
// Fourth sibling to /mobile-v2 (Overview), /mobile-proposals-v2 and
// /mobile-clients-v2. Tokens, palette, type scale, status tones and Motion
// System "Balanced" are the reference dashboard's; every shared pattern is the
// one mobile-clients-v2 established, so the handheld surfaces are one product
// rather than four interpretations. The topbar and hamburger drawer are the
// shared <MobileNav /> — this page ships no nav chrome and no sprite.
//
// This component also serves the LIVE /dashboard/jobs URL at ≤768px through
// components/v3/responsive-shell/responsive-dashboard-shell.tsx. One
// implementation, two entry points, nothing to keep in sync.
//
// CONTENT IS REAL (2026-08-16). The board used to be the donor demo fixture:
// fourteen invented Seattle jobs that looked like a delivery board and answered
// to nothing. It is now read from the database by ./jobs-board.ts — the desktop
// page's query, org-scoped through requireOrg, field-worker scoped the same way
// — and every action on it is a real server write:
//   · the card            → /dashboard/jobs/[id], the real record
//   · Mark completed      → updateJob      (@/actions/jobs)
//   · Cancel job          → updateJob      (@/actions/jobs)
//   · Assign crew         → assignWorker / unassignWorker (@/actions/workers)
//   · the New job sheet   → createJob      (@/actions/jobs)
// No new data layer: these are the actions the desktop sheet and the classic
// /dashboard/jobs/new form already call, each with its own guard.
//
// EVERY REGION OF THE DESKTOP JOBS SHEET IS COVERED
// (src/components/v3/jobs-blueprint/*):
//  · page head — H1 and the New-job action
//  · the five status tabs (.jtabs/.jtab/.jtab-n) with live counts
//  · the 5-column table (Job / Status / Schedule / Crew / open) as row cards
//  · all four status badges (.jst--scheduled / in_progress / completed / canceled)
//  · the schedule cell in both forms: single day, multi-day range, and the
//    .j-unsched "Unscheduled" case
//  · the crew stack (.crew / .crew-av / .crew-more / .crew-none), with overflow
//  · the pager (.pager / .pager-btn / .pager-info)
//  · the empty state (#jobsEmpty) — split into the states a phone needs
//  · the row popover vocabulary (.pmenu with its 26px tonal boxes, a disabled
//    item and a danger item) as a bottom sheet
//  · the New-job dialog (.mdl + .fld + .fseg + client select + crew roster +
//    required-field validation) as a bottom sheet with a beige submit foot
//
// WHAT CHANGES VERSUS THE DESKTOP SHEET, AND WHY
//  · The five status tabs become the family's ONE filter dropdown. The desktop
//    control is a wrapping pill rail, which does not survive 320px, and five
//    tabs cannot keep a label and its count on one line at ~64px each.
//  · A search box is added. On a jobsite the real task is "find the Maple Ave
//    job", not "page through the board". It filters the loaded board in the
//    browser — no new endpoint, and it searches the WHOLE board rather than the
//    visible page.
//  · A computed masthead is added: open-job count + on-site-today +
//    unscheduled. A phone needs the "what is on my plate" answer above the fold.
//  · The ⋮ popover becomes a bottom sheet (no hover on touch, and CLAUDE.md
//    prefers sheets over modals), and so does the create dialog.
//  · The row menu's destructive item is CANCEL, not delete. There is no
//    `deleteJob` server action in this codebase — the desktop menu only moves
//    status too — and a delete row that lies is worse than one that files the
//    job under Canceled, which is what the board's own vocabulary already has.
//  · Page size 20 → 8: a handheld row is three lines tall, and the pager
//    becomes a control that actually appears.
//  · The eyebrow is gone. "DELIVERY" named the SECTION above a title that
//    already says what the page is — a line of a 390px head spent restating the
//    drawer item you tapped to get here. Same edit as clients and projects.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import styles from "./mobile-jobs.module.css";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import { lockScroll } from "@/lib/scrollLock";
import { createJob, updateJob } from "@/actions/jobs";
import { assignWorker, unassignWorker } from "@/actions/workers";
import { loadJobsBoard } from "./jobs-board";
import {
  OPEN_STATUSES,
  PAGE_SIZE,
  STATUS_FILTERS,
  initials,
  matchesQuery,
  matchesStatus,
  parseDay,
  relLabel,
  scheduleLabel,
  statusCount,
  statusLabel,
  type JobCrewOption,
  type JobStatus,
  type JobsBoard,
  type StatusFilter,
} from "./jobs-data";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const count = (n: number) => Math.round(n).toLocaleString("en-US");

/** A server action's message, or a house line when it threw something opaque.
 *  The same helper every neighbouring handheld surface carries. */
function actionError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const clean = msg.replace(/^Error:\s*/i, "").trim();
  return clean || "Something went wrong. Try again.";
}

/** The desktop .jst--* tones, one class per state. */
const STATUS_CLASS: Record<JobStatus, string> = {
  SCHEDULED: styles.stScheduled,
  IN_PROGRESS: styles.stInProgress,
  COMPLETED: styles.stCompleted,
  CANCELED: styles.stCanceled,
};

/** Crew pips shown before the stack overflows into "+N". */
const CREW_SHOWN = 2;

/** "YYYY-MM-DD" + an hour → a local Date, or null. The desktop dialog's own
 *  helper: a job day becomes a 9am–5pm span, which is what createJob turns into
 *  the auto-scheduled calendar event. */
function dayAt(v: string, hour: number): Date | null {
  const d = parseDay(v);
  if (!d) return null;
  d.setHours(hour, 0, 0, 0);
  return d;
}

function Icon({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ?? styles.ic} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

/** 750ms easeOutCubic. tabular-nums keep the digit columns from jumping. */
function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.textContent = count(value);
      return;
    }
    let raf = 0;
    let t0: number | null = null;
    const frame = (t: number) => {
      if (t0 === null) t0 = t;
      const pr = Math.min(1, (t - t0) / 750);
      el.textContent = count(value * (1 - Math.pow(1 - pr, 3)));
      if (pr < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <div ref={ref} className={className}>
      {count(value)}
    </div>
  );
}

type MenuRow = {
  act: string;
  icon: string;
  tone?: string;
  title: string;
  sub: string;
  disabled?: boolean;
  danger?: boolean;
};

export function MobileJobs() {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  /* ---- the board (real, read on mount and after every write) ---- */
  const [board, setBoard] = useState<JobsBoard | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [landedId, setLandedId] = useState<string | null>(null);

  /* ---- row-sheet writes ---- */
  const [menuBusy, setMenuBusy] = useState<string | null>(null);
  const [menuErr, setMenuErr] = useState<string | null>(null);

  /* ---- assign-crew sheet ---- */
  const [crewJobId, setCrewJobId] = useState<string | null>(null);
  const [crewBusyId, setCrewBusyId] = useState<string | null>(null);
  const [crewErr, setCrewErr] = useState<string | null>(null);

  /* ---- new-job form ---- */
  const [form, setForm] = useState({ title: "", clientId: "", proposalId: "", start: "", end: "" });
  const [draftStatus, setDraftStatus] = useState<JobStatus>("SCHEDULED");
  /** Roster picks — real WorkerProfile ids, the only thing createJob can staff by. */
  const [draftCrew, setDraftCrew] = useState<string[]>([]);
  /** Typed names that match nobody on the roster (a sub, a day-labourer). */
  const [draftCrewFree, setDraftCrewFree] = useState<string[]>([]);
  const [crewQuery, setCrewQuery] = useState("");
  const [crewMenuOpen, setCrewMenuOpen] = useState(false);
  const [titleErr, setTitleErr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newErr, setNewErr] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const filterRef = useRef<HTMLDivElement>(null);
  const crewComboRef = useRef<HTMLDivElement>(null);

  const data = useMemo(() => board?.jobs ?? [], [board]);
  const clientOptions = board?.clients ?? [];
  const proposalOptions = board?.proposals ?? [];
  const crewOptions = useMemo<JobCrewOption[]>(() => board?.crew ?? [], [board]);
  const canManage = board?.canManage ?? false;
  const loading = board === null && loadErr === null;

  /* ---------- the read ---------------------------------------------------
     Asked for rather than passed down: the surface is mounted props-less from
     two entry points (its own route and responsive-dashboard-shell at ≤768px),
     so it cannot be handed a server component's data. */
  const reload = useCallback(async () => {
    const next = await loadJobsBoard();
    setBoard(next);
    setLoadErr(null);
  }, []);

  useEffect(() => {
    let alive = true;
    loadJobsBoard()
      .then((next) => alive && setBoard(next))
      .catch((err) => alive && setLoadErr(actionError(err)));
    return () => {
      alive = false;
    };
  }, []);

  /* ---------- viewport height ------------------------------------------
     Mandatory rule: viewport heights only via var(--app-h). A phone's URL bar
     changes innerHeight mid-scroll, so the real value is republished rather
     than trusting a bare 100vh/100dvh. This is the React form of the donor's
     FLUID SCALE module — no root zoom, since the composition here is already
     the handheld one. */
  useEffect(() => {
    const apply = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-h", `${h}px`);
    };
    apply();
    window.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("resize", apply);
    const releaseScroll = lockScroll();
    return () => {
      window.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("resize", apply);
      document.documentElement.style.removeProperty("--app-h");
      releaseScroll();
    };
  }, []);

  /* ---------- Motion: reveal on load + adaptive reveal on scroll -------- */
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const host = scrollRef.current;
    const content = contentRef.current;
    if (!host || !content) return;

    let velLastY = host.scrollTop;
    let velLastT = performance.now();
    let vel = 0;
    const onScroll = () => {
      const now = performance.now();
      vel = Math.abs(host.scrollTop - velLastY) / Math.max(1, now - velLastT);
      velLastY = host.scrollTop;
      velLastT = now;
    };
    host.addEventListener("scroll", onScroll, { passive: true });

    const vpH = window.innerHeight;
    const blocks = Array.from(content.children) as HTMLElement[];
    blocks.forEach((el, i) => {
      el.classList.add(styles.rv);
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? `${i * 60}ms` : "200ms";
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const t = en.target as HTMLElement;
          // Below the fold: duration follows scroll speed — slow ≈ 900ms,
          // fast never shorter than 550ms.
          if (t.dataset.rvScroll) {
            t.style.transitionDuration = `${Math.round(Math.max(550, 900 - vel * 160))}ms`;
          }
          t.classList.add(styles.rvIn);
          io.unobserve(t);
          const done = () => {
            t.style.transitionDelay = "";
            t.style.transitionDuration = "";
            t.removeEventListener("transitionend", done);
          };
          t.addEventListener("transitionend", done);
        });
      },
      { threshold: 0, rootMargin: "0px 0px 60px 0px" },
    );
    blocks.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      host.removeEventListener("scroll", onScroll);
    };
  }, []);

  /* ---------- Motion: graph-paper parallax ----------------------------- */
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const host = scrollRef.current;
    if (!host) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        host.style.setProperty("--gy", `${(-(host.scrollTop * 0.06)).toFixed(1)}px`);
        ticking = false;
      });
    };
    host.addEventListener("scroll", onScroll, { passive: true });
    return () => host.removeEventListener("scroll", onScroll);
  }, []);

  /* ---------- Motion: press stamp (delegated, covers late rows) --------- */
  const onRootClick = useCallback((e: React.MouseEvent) => {
    if (prefersReducedMotion()) return;
    const sel = [
      styles.btn, styles.ddBtn, styles.ddItem, styles.pagerBtn, styles.jmenuItem,
      styles.sheetCancel, styles.jopen, styles.fsegBtn, styles.comboItem,
      styles.jemptyA, styles.srchX, styles.chipX, styles.comboCaret,
    ].map((c) => `.${c}`).join(", ");
    const el = (e.target as HTMLElement).closest<HTMLElement>(sel);
    if (!el) return;
    el.classList.remove(styles.pressed);
    void el.offsetWidth;
    el.classList.add(styles.pressed);
    el.addEventListener("animationend", () => el.classList.remove(styles.pressed), { once: true });
  }, []);

  /* ---------- Esc closes what THIS PAGE owns ---------------------------
     The drawer is not listed: MobileNav handles its own Escape, and it only
     binds while open, so the two listeners cannot both claim one key press. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (filterOpen) setFilterOpen(false);
      else if (crewMenuOpen) setCrewMenuOpen(false);
      else if (newOpen && !saving) setNewOpen(false);
      else if (crewJobId) setCrewJobId(null);
      else if (sheetId && !menuBusy) setSheetId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filterOpen, crewMenuOpen, newOpen, saving, crewJobId, sheetId, menuBusy]);

  /* ---------- Popovers: close on outside pointerdown ------------------- */
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [filterOpen]);

  useEffect(() => {
    if (!crewMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!crewComboRef.current?.contains(e.target as Node)) setCrewMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [crewMenuOpen]);

  /* The crew list opens IN FLOW (it is inside the sheet's own scroller — see
     .comboMenu), and the field is the last one on the form, so the list can
     open below the fold. Nudge the sheet body so the whole control is visible;
     `nearest` moves it the minimum distance and leaves it alone when it already
     fits. After the 180ms open animation, not on the same frame. */
  useEffect(() => {
    if (!crewMenuOpen) return;
    const el = crewComboRef.current;
    if (!el) return;
    const t = window.setTimeout(
      () => el.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" }),
      190,
    );
    return () => clearTimeout(t);
  }, [crewMenuOpen]);

  /* ---------- Paging returns you to the top of the board ----------------
     In an effect, not the click handler: the ref must not be read during
     render, and the scroll belongs to the page CHANGE. First run skipped so
     mounting doesn't scroll. */
  const firstPaint = useRef(true);
  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false;
      return;
    }
    scrollRef.current?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [page]);

  /* ---------- The one blue flash on a record you just changed ----------- */
  useEffect(() => {
    if (!landedId) return;
    const t = window.setTimeout(() => setLandedId(null), 700);
    return () => clearTimeout(t);
  }, [landedId]);

  /* ---------- derived -------------------------------------------------- */
  const visible = useMemo(
    () => data.filter((j) => matchesStatus(j, status) && matchesQuery(j, query)),
    [data, status, query],
  );

  /* Masthead: one numeral + EXACTLY two annotations, all three computed, so
     completing / canceling / creating a job moves them. */
  const openCount = useMemo(
    () => data.filter((j) => OPEN_STATUSES.includes(j.status)).length,
    [data],
  );
  const todayCount = useMemo(
    () => data.filter((j) => relLabel(j.start) === "today" && OPEN_STATUSES.includes(j.status)).length,
    [data],
  );
  const unschedCount = useMemo(
    () => data.filter((j) => !j.start && OPEN_STATUSES.includes(j.status)).length,
    [data],
  );

  const activeFilter = STATUS_FILTERS.find((f) => f.key === status) ?? STATUS_FILTERS[0];

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const slice = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const sheetJob = sheetId === null ? null : (data.find((j) => j.id === sheetId) ?? null);
  const crewJob = crewJobId === null ? null : (data.find((j) => j.id === crewJobId) ?? null);

  const resetFilters = () => {
    setStatus("ALL");
    setQuery("");
    setPage(1);
  };

  /** The jobs board's own href shape (jobs-behavior.ts `jobHref`), so the
   *  handheld card and the desktop table open the same URL. A client-side push,
   *  not a document load: the job record is a blueprint page whose entrance
   *  cascade is armed from a layout effect, and a hard load replays it as a
   *  visible double take. */
  const openJob = useCallback(
    (jobId: string) => router.push(("/dashboard/jobs/" + encodeURIComponent(jobId)) as Route),
    [router],
  );

  /* ---------- row sheet ------------------------------------------------ */
  const menuRows = useMemo<MenuRow[]>(() => {
    const j = sheetJob;
    if (!j) return [];
    const filed = j.status === "COMPLETED" || j.status === "CANCELED";
    return [
      { act: "open", icon: "i-jobs", tone: styles.jmiBp, title: "Open job", sub: "Full record, crew and photos" },
      {
        act: "msg", icon: "i-msg", tone: styles.jmiSky, title: "Message client",
        sub: j.client ?? "No client on this job", disabled: !j.client,
      },
      {
        act: "dir", icon: "i-pin", tone: styles.jmiWarn, title: "Get directions",
        sub: j.site ? `${j.site} — open in maps` : "No address on file", disabled: !j.site,
      },
      {
        act: "done", icon: "i-check", tone: styles.jmiOk,
        title: filed ? "Already filed" : "Mark completed",
        sub: filed
          ? `Job is ${statusLabel(j.status).toLowerCase()}`
          : canManage
            ? "Files it and frees the crew"
            : "Managers only",
        disabled: filed || !canManage,
      },
      {
        act: "crew", icon: "i-userplus", title: "Assign crew",
        sub: !canManage
          ? "Managers only"
          : j.crew.length
            ? j.crew.join(", ")
            : "Nobody dispatched yet",
        disabled: !canManage,
      },
      {
        act: "cancel", icon: "i-x", tone: styles.jmiDanger, title: "Cancel job",
        sub: canManage ? "Files it under Canceled" : "Managers only",
        danger: true,
        disabled: j.status === "CANCELED" || !canManage,
      },
    ];
  }, [sheetJob, canManage]);

  /** One row's status write. Kept on the sheet while it runs — the row says
   *  "Working…" and a failure lands as a line under the list, rather than the
   *  sheet closing on a write that never happened. */
  const runStatus = async (id: string, next: JobStatus, act: string) => {
    if (menuBusy) return;
    setMenuBusy(act);
    setMenuErr(null);
    try {
      await updateJob(id, { status: next });
      await reload();
      setSheetId(null);
      setLandedId(id);
    } catch (err) {
      setMenuErr(actionError(err));
    } finally {
      setMenuBusy(null);
    }
  };

  const runMenu = (act: string) => {
    const j = sheetJob;
    if (!j) return;
    if (act === "open") {
      setSheetId(null);
      openJob(j.id);
      return;
    }
    if (act === "msg") {
      if (!j.clientId) return;
      setSheetId(null);
      // The client record is where Message actually lives (it owns the channel
      // picker and the send action) — this is the same destination the desktop
      // row menu's client link uses.
      router.push(`/dashboard/client-detail?client=${encodeURIComponent(j.clientId)}` as Route);
      return;
    }
    if (act === "dir") {
      if (!j.site) return;
      setSheetId(null);
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.site)}`,
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    if (act === "crew") {
      setSheetId(null);
      setCrewErr(null);
      setCrewJobId(j.id);
      return;
    }
    if (act === "done") {
      void runStatus(j.id, "COMPLETED", act);
      return;
    }
    if (act === "cancel") {
      void runStatus(j.id, "CANCELED", act);
    }
  };

  /* ---------- assign crew ----------------------------------------------
     One toggle = one server write, then a reload: `assignWorker` notifies the
     worker and syncs the job's group chat, and `unassignWorker` takes the
     ASSIGNMENT id rather than the worker's — both of which are reasons not to
     fake this locally. */
  const toggleCrew = async (worker: JobCrewOption) => {
    const j = crewJob;
    if (!j || crewBusyId) return;
    const existing = j.assignments.find((a) => a.workerId === worker.id);
    setCrewBusyId(worker.id);
    setCrewErr(null);
    try {
      if (existing) await unassignWorker(existing.id);
      else await assignWorker(j.id, worker.id);
      await reload();
      setLandedId(j.id);
    } catch (err) {
      setCrewErr(actionError(err));
    } finally {
      setCrewBusyId(null);
    }
  };

  /* ---------- new-job form --------------------------------------------- */
  const openNew = () => {
    setForm({ title: "", clientId: "", proposalId: "", start: "", end: "" });
    setDraftStatus("SCHEDULED");
    setDraftCrew([]);
    setDraftCrewFree([]);
    setCrewQuery("");
    setCrewMenuOpen(false);
    setTitleErr(false);
    setNewErr(null);
    setNewOpen(true);
    // Focus after the slide settles — focusing mid-transform makes the
    // keyboard fight the animation.
    window.setTimeout(() => titleRef.current?.focus(), prefersReducedMotion() ? 0 : 320);
  };

  /** Picking a proposal carries its client and, on an empty field, its title —
   *  the classic /dashboard/jobs/new form's semantics, verbatim. */
  const pickProposal = (id: string) => {
    setForm((f) => {
      const p = proposalOptions.find((x) => x.id === id);
      return {
        ...f,
        proposalId: id,
        clientId: p?.clientId ?? f.clientId,
        title: f.title.trim() ? f.title : (p?.title ?? f.title),
      };
    });
    if (id) setTitleErr(false);
  };

  /* The roster, filtered by what has been typed and minus who is already on
     the draft. A typed name that matches nobody is offered as a free entry. */
  const crewMatches = useMemo(() => {
    const q = crewQuery.trim().toLowerCase();
    return crewOptions.filter(
      (w) => !draftCrew.includes(w.id) && (!q || w.name.toLowerCase().includes(q)),
    );
  }, [crewOptions, crewQuery, draftCrew]);

  const typedName = crewQuery.trim();
  const typedIsNew =
    typedName.length > 0 &&
    !crewOptions.some((w) => w.name.toLowerCase() === typedName.toLowerCase()) &&
    !draftCrewFree.some((n) => n.toLowerCase() === typedName.toLowerCase());

  const addRosterCrew = (id: string) => {
    setDraftCrew((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setCrewQuery("");
    setCrewMenuOpen(false);
  };
  const addFreeCrew = () => {
    if (!typedIsNew) return;
    setDraftCrewFree((prev) => [...prev, typedName]);
    setCrewQuery("");
    setCrewMenuOpen(false);
  };

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const title = form.title.trim();
    if (!title) {
      setTitleErr(true);
      titleRef.current?.focus();
      return;
    }
    const startsAt = dayAt(form.start, 9);
    const endsAt = dayAt(form.end || form.start, 17);
    // Off-roster crew has nowhere of its own to live — Job has no free-text crew
    // column and the schema is not ours to change — so it is written into the
    // job's notes, which createJob does accept. The field's hint says so, and
    // nothing typed is quietly dropped.
    const notes = draftCrewFree.length
      ? `Crew (not on roster): ${draftCrewFree.join(", ")}`
      : null;

    setSaving(true);
    setNewErr(null);
    try {
      const res = await createJob({
        title,
        clientId: form.clientId || null,
        proposalId: form.proposalId || null,
        status: draftStatus,
        startsAt,
        endsAt: startsAt ? endsAt : null,
        workerIds: draftCrew,
        notes,
      });
      await reload();
      // Drop back to the whole board, so a job created while a status filter was
      // active is actually visible — it lands in the first row.
      resetFilters();
      setNewOpen(false);
      setLandedId(res.id);
    } catch (err) {
      setNewErr(actionError(err));
    } finally {
      setSaving(false);
    }
  };

  const anyOverlay = Boolean(sheetJob) || newOpen || Boolean(crewJob);

  // Swipe-down dismissal, one gesture per sheet, wired to the close paths the
  // scrim and Cancel already use.
  const actionsDrag = useSheetDrag(Boolean(sheetJob), () => setSheetId(null));
  const crewDrag = useSheetDrag(Boolean(crewJob), () => setCrewJobId(null));
  const newDrag = useSheetDrag(newOpen, () => setNewOpen(false));
  const sheetSchedule = sheetJob ? scheduleLabel(sheetJob) : null;

  return (
    <div className={styles.app} onClick={onRootClick}>

      {/* Shared handheld nav: topbar + drawer + sprite. Owns its own open
          state, so the page holds none. */}
      <MobileNav />

      {/* ============ SCROLLER ============ */}
      <main className={styles.scroll} ref={scrollRef}>
        <div className={styles.content} ref={contentRef}>
          {/* PAGE HEAD — the only primary action the desktop sheet has, and no
              floating action button: primary actions live in the head.
              No eyebrow (see the header note). */}
          <div className={styles.pageHead}>
            <h1 className={styles.pageTitle}>Jobs</h1>
            <div className={styles.pageActions}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={openNew}>
                <Icon id="i-plus" />New job
              </button>
            </div>
          </div>

          {/* MASTHEAD */}
          <div className={styles.jmast}>
            <div className={styles.jmastTop}>
              <div className={styles.jmastLbl}>
                Open jobs
                <span className={styles.jmastRule} />
              </div>
              <CountUp value={openCount} className={styles.jmastVal} />
            </div>
            <div className={styles.jmastCnt}>
              <div className={styles.jmastSub}>
                <div className={styles.jmastSubL}>On site today</div>
                <div className={styles.jmastSubV}>{todayCount}</div>
              </div>
              <div className={styles.jmastSub}>
                <div className={styles.jmastSubL}>Unscheduled</div>
                <div className={styles.jmastSubV}>{unschedCount}</div>
              </div>
            </div>
          </div>

          {/* FIND BAR — search + the status filter as one dropdown */}
          <div className={styles.find}>
            <label className={styles.srch}>
              <Icon id="i-search" />
              <input
                className={styles.srchInput}
                type="search"
                value={query}
                placeholder="Search job, client, site or crew…"
                autoComplete="off"
                aria-label="Search jobs"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
              {query ? (
                <button className={styles.srchX} type="button" aria-label="Clear search"
                  onClick={() => { setQuery(""); setPage(1); }}>
                  <Icon id="i-x" />
                </button>
              ) : null}
            </label>

            <div className={`${styles.dd} ${filterOpen ? styles.open : ""}`} ref={filterRef}>
              <button className={styles.ddBtn} type="button" aria-haspopup="listbox"
                aria-expanded={filterOpen} onClick={() => setFilterOpen((v) => !v)}>
                <Icon id="i-filter" />
                Filter
                <span className={styles.ddValue} data-s={status}>
                  {activeFilter.label} · {statusCount(data, status)}
                </span>
                <Icon id="i-chev" className={`${styles.ic} ${styles.ddCaret}`} />
              </button>
              <div className={styles.ddMenu} role="listbox">
                {STATUS_FILTERS.map((f) => (
                  <button key={f.key} className={`${styles.ddItem} ${status === f.key ? styles.active : ""}`}
                    type="button" role="option" aria-selected={status === f.key}
                    onClick={() => { setStatus(f.key); setPage(1); setFilterOpen(false); }}>
                    {f.label}
                    <span className={styles.ddCount}>{statusCount(data, f.key)}</span>
                    {status === f.key ? <Icon id="i-check" /> : null}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* BOARD */}
          {loadErr ? (
            <div className={styles.jempty}>
              <div className={styles.jemptyT}>Couldn&rsquo;t load your jobs</div>
              <div className={styles.jemptyS}>{loadErr}</div>
              <button
                className={styles.jemptyA}
                type="button"
                onClick={() => {
                  setLoadErr(null);
                  void reload().catch((err) => setLoadErr(actionError(err)));
                }}
              >
                <Icon id="i-check" />Try again
              </button>
            </div>
          ) : loading ? (
            <div className={styles.jempty}>
              <div className={styles.jemptyT}>Loading your board…</div>
              <div className={styles.jemptyS}>Reading the jobs on file for your company.</div>
            </div>
          ) : visible.length === 0 ? (
            <div className={styles.jempty}>
              {data.length === 0 ? (
                <>
                  <div className={styles.jemptyT}>No jobs yet</div>
                  <div className={styles.jemptyS}>
                    Accept a proposal in the client portal and a job appears here automatically.
                  </div>
                  <button className={styles.jemptyA} type="button" onClick={openNew}>
                    <Icon id="i-plus" />New job
                  </button>
                </>
              ) : (
                <>
                  <div className={styles.jemptyT}>No matches</div>
                  <div className={styles.jemptyS}>No job matches that search and status filter.</div>
                  <button className={styles.jemptyA} type="button" onClick={resetFilters}>
                    <Icon id="i-x" />Clear filters
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className={styles.board}>
              {slice.map((j, i) => {
                const sched = scheduleLabel(j);
                const rel = relLabel(j.start);
                const shown = j.crew.slice(0, CREW_SHOWN);
                const extra = j.crew.length - shown.length;
                return (
                  <div
                    key={j.id}
                    className={`${styles.jrow} ${styles.rowIn} ${landedId === j.id ? styles.landed : ""}`}
                    style={{ animationDelay: `${i * 45}ms` }}
                    /* THE CARD IS THE DOOR. It used to be inert: the only tap
                       target on a row was the ⋮ button, so a reader who tapped
                       the job — which is what a row-shaped object asks for —
                       got nothing, and the record was two taps and a menu away.
                       `role`/`tabIndex`/`onKeyDown` rather than a <button>: the
                       row already contains a button, and a button inside a
                       button is invalid HTML that Safari resolves by dropping
                       one of them. */
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${j.title}`}
                    onClick={() => openJob(j.id)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      openJob(j.id);
                    }}
                  >
                    {/* line 1 — identity, and the actions button at the FAR RIGHT */}
                    <span
                      className={`${styles.jav} ${j.client ? "" : styles.isNone}`}
                      aria-hidden="true"
                    >
                      {j.client ? initials(j.client) : "—"}
                    </span>
                    <div className={styles.jtitle} title={j.title}>{j.title}</div>
                    {/* `stopPropagation`: the ⋮ sits inside the card's own tap
                        target, and without it opening the menu would also open
                        the record underneath it. */}
                    <button className={styles.jopen} type="button"
                      aria-label={`Actions for ${j.title}`}
                      onClick={(e) => { e.stopPropagation(); setMenuErr(null); setSheetId(j.id); }}>
                      <Icon id="i-dots" />
                    </button>

                    {/* line 2 — who and when, in mono */}
                    <div className={styles.jmeta}>
                      {j.client ? j.client : <span className={styles.jmetaDim}>No client</span>}
                      {" · "}
                      {sched ? sched : <span className={styles.jmetaDim}>Unscheduled</span>}
                    </div>

                    {/* line 3 — status badge FIRST, crew at the far right */}
                    <div className={styles.jfoot}>
                      <span className={`${styles.jstatus} ${STATUS_CLASS[j.status]}`}>
                        {statusLabel(j.status)}
                      </span>
                      {rel ? (
                        <span className={`${styles.jrel} ${rel === "today" ? styles.jrelNow : ""}`}>
                          {rel}
                        </span>
                      ) : null}
                      <span
                        className={styles.jcrew}
                        aria-label={j.crew.length ? `Crew: ${j.crew.join(", ")}` : "No crew assigned"}
                      >
                        {j.crew.length ? (
                          <>
                            {shown.map((n) => (
                              <span className={styles.jpip} key={n} title={n}>{initials(n)}</span>
                            ))}
                            {extra > 0 ? <span className={styles.jpipMore}>+{extra}</span> : null}
                          </>
                        ) : (
                          <span className={styles.jcrewNone} aria-hidden="true">—</span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* PAGER */}
          {visible.length > PAGE_SIZE ? (
            <div className={styles.pager}>
              <button className={styles.pagerBtn} type="button" disabled={safePage <= 1}
                onClick={() => setPage(Math.max(1, safePage - 1))}>
                <Icon id="i-chevl" />Prev
              </button>
              <button className={styles.pagerBtn} type="button" disabled={safePage >= pages}
                onClick={() => setPage(Math.min(pages, safePage + 1))}>
                Next<Icon id="i-chevr" />
              </button>
              <span className={styles.pagerInfo}>{safePage} / {pages}</span>
            </div>
          ) : null}
        </div>
      </main>

      {/* ============ SHEET SCRIM (shared by all three sheets) ============ */}
      <div
        className={`${styles.scrim} ${anyOverlay ? styles.on : ""}`}
        onClick={() => {
          if (menuBusy || saving || crewBusyId) return;
          setSheetId(null);
          setCrewJobId(null);
          setNewOpen(false);
        }}
        aria-hidden="true"
      />

      {/* ============ ROW ACTIONS SHEET ============ */}
      <div className={`${styles.sheet} ${sheetJob ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-label="Job actions" aria-hidden={!sheetJob} {...actionsDrag.sheetProps}>
        <div className={styles.sheetGrab} {...actionsDrag.handleProps} />
        <div className={styles.sheetHead} {...actionsDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {sheetJob
              ? `${statusLabel(sheetJob.status)} · ${sheetSchedule ?? "unscheduled"} · ${
                  sheetJob.crew.length ? `${sheetJob.crew.length} crew` : "no crew"
                }`
              : "Job · —"}
          </div>
          <div className={styles.sheetTitle}>{sheetJob?.title ?? "Actions"}</div>
        </div>
        <div className={styles.sheetBody}>
          {menuRows.map((r) => (
            <button key={r.act} type="button" disabled={r.disabled || Boolean(menuBusy)}
              className={`${styles.jmenuItem} ${r.danger ? styles.jmenuItemDanger : ""}`}
              onClick={() => runMenu(r.act)}>
              <span className={`${styles.jmiIc} ${r.tone ?? ""}`}><Icon id={r.icon} /></span>
              <span>
                <span className={styles.jmenuItemT}>{menuBusy === r.act ? "Working…" : r.title}</span>
                <span className={styles.jmenuItemS}>{r.sub}</span>
              </span>
            </button>
          ))}
          {menuErr ? <div className={styles.sheetErr}>{menuErr}</div> : null}
        </div>
        <button className={styles.sheetCancel} type="button" disabled={Boolean(menuBusy)}
          onClick={() => setSheetId(null)}>Cancel</button>
      </div>

      {/* ============ ASSIGN CREW SHEET ============
          One toggle per roster member, each a real server write. Opened from
          the row sheet, so it replaces it rather than stacking on it. */}
      <div className={`${styles.sheet} ${crewJob ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-label="Assign crew" aria-hidden={!crewJob} {...crewDrag.sheetProps}>
        <div className={styles.sheetGrab} {...crewDrag.handleProps} />
        <div className={styles.sheetHead} {...crewDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {crewJob
              ? crewJob.crew.length
                ? `${crewJob.crew.length} on this job`
                : "Nobody dispatched yet"
              : "Crew"}
          </div>
          <div className={styles.sheetTitle}>Assign crew</div>
        </div>
        <div className={styles.sheetBody}>
          {crewOptions.length === 0 ? (
            <div className={styles.sheetNote}>
              No crew on the roster yet. Add workers on the Workers page, then dispatch them here.
            </div>
          ) : (
            crewOptions.map((w) => {
              const on = Boolean(crewJob?.assignments.some((a) => a.workerId === w.id));
              return (
                <button key={w.id} type="button" className={styles.jmenuItem}
                  disabled={Boolean(crewBusyId)} aria-pressed={on}
                  onClick={() => void toggleCrew(w)}>
                  <span className={`${styles.jmiIc} ${on ? styles.jmiOk : ""}`}>
                    <Icon id={on ? "i-check" : "i-userplus"} />
                  </span>
                  <span>
                    <span className={styles.jmenuItemT}>{w.name}</span>
                    <span className={styles.jmenuItemS}>
                      {crewBusyId === w.id ? "Working…" : on ? "On this job — tap to remove" : "Tap to dispatch"}
                    </span>
                  </span>
                </button>
              );
            })
          )}
          {crewErr ? <div className={styles.sheetErr}>{crewErr}</div> : null}
        </div>
        <button className={styles.sheetCancel} type="button" disabled={Boolean(crewBusyId)}
          onClick={() => setCrewJobId(null)}>Done</button>
      </div>

      {/* ============ NEW JOB SHEET ============ */}
      <div className={`${styles.sheet} ${newOpen ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-labelledby="mjNewTitle" aria-hidden={!newOpen} {...newDrag.sheetProps}>
        <div className={styles.sheetGrab} {...newDrag.handleProps} />
        <div className={styles.sheetHead} {...newDrag.handleProps}>
          <div className={styles.sheetKicker}>Delivery / new record</div>
          <div className={styles.sheetTitle} id="mjNewTitle">New job</div>
        </div>
        <form className={`${styles.sheetBody} ${styles.formBody}`} id="mjNewForm" noValidate
          onSubmit={(e) => void submitNew(e)}>
          <div className={`${styles.fld} ${titleErr ? styles.invalid : ""}`}>
            <label className={styles.fldLbl} htmlFor="mjTitle">
              Job<span className={styles.req}>*</span>
            </label>
            <input ref={titleRef} className={styles.pinput} id="mjTitle" name="title" type="text"
              placeholder="Cedar fence — 902 Alder Ct" autoComplete="off" value={form.title}
              aria-invalid={titleErr} aria-describedby={titleErr ? "mjTitleErr" : undefined}
              onChange={(e) => {
                setForm((f) => ({ ...f, title: e.target.value }));
                if (e.target.value.trim()) setTitleErr(false);
              }} />
            {titleErr ? <span className={styles.fldErr} id="mjTitleErr">Enter what the job is</span> : null}
          </div>

          {/* CLIENT — a select of the org's real book, because `clientId` is the
              only thing createJob can link a job by. It was a free-text box,
              which produced a name nothing could resolve. */}
          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mjClient">Client</label>
            <div className={styles.selWrap}>
              <select className={`${styles.pinput} ${styles.pselect}`} id="mjClient" name="client"
                value={form.clientId}
                onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}>
                <option value="">— No client —</option>
                {clientOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <Icon id="i-chev" className={`${styles.ic} ${styles.selCaret}`} />
            </div>
          </div>

          {/* ATTACH PROPOSAL — optional, and it carries the proposal's client
              and title the way the classic new-job form does. */}
          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mjProposal">Attach proposal</label>
            <div className={styles.selWrap}>
              <select className={`${styles.pinput} ${styles.pselect}`} id="mjProposal" name="proposal"
                value={form.proposalId} disabled={proposalOptions.length === 0}
                onChange={(e) => pickProposal(e.target.value)}>
                <option value="">— None —</option>
                {proposalOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
              <Icon id="i-chev" className={`${styles.ic} ${styles.selCaret}`} />
            </div>
            <span className={styles.fldHint}>
              {proposalOptions.length === 0
                ? "No open proposals to link yet."
                : "Optional — links the job to its paperwork and fills the client in."}
            </span>
          </div>

          <div className={styles.fld}>
            <span className={styles.fldLbl}>Status</span>
            {/* The page's own status vocabulary, so the state a job starts in is
                picked from the same tones it is filtered by. */}
            <div className={styles.fseg} role="group" aria-label="Job status">
              {STATUS_FILTERS.filter((f) => f.key !== "ALL").map((f) => {
                const on = draftStatus === f.key;
                return (
                  <button key={f.key} className={`${styles.fsegBtn} ${on ? styles.fsegOn : ""}`}
                    type="button" data-v={f.key} aria-pressed={on}
                    onClick={() => setDraftStatus(f.key as JobStatus)}>
                    <span className={styles.fsegDot} />
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.fld}>
              <label className={styles.fldLbl} htmlFor="mjStart">Starts</label>
              <input className={styles.pinput} id="mjStart" name="start" type="date" value={form.start}
                onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} />
            </div>
            <div className={styles.fld}>
              <label className={styles.fldLbl} htmlFor="mjEnd">Ends</label>
              <input className={styles.pinput} id="mjEnd" name="end" type="date" value={form.end}
                onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} />
            </div>
          </div>

          {/* CREW — a combobox, not a free-text line and not a plain select.
              Picking from the roster produces the real worker ids createJob
              staffs by; typing a name that is on nobody's roster still lands
              somewhere (the job's notes) rather than being swallowed. Optional:
              an empty field creates a job with no crew at all. */}
          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mjCrew">Crew</label>
            <div className={`${styles.combo} ${crewMenuOpen ? styles.open : ""}`} ref={crewComboRef}>
              <div className={styles.comboBox}>
                <input className={`${styles.pinput} ${styles.comboInput}`} id="mjCrew" type="text"
                  role="combobox" aria-expanded={crewMenuOpen} aria-controls="mjCrewMenu"
                  aria-autocomplete="list" autoComplete="off"
                  placeholder={crewOptions.length ? "Pick from the roster, or type a name" : "Type a name"}
                  value={crewQuery}
                  onFocus={() => setCrewMenuOpen(true)}
                  onChange={(e) => { setCrewQuery(e.target.value); setCrewMenuOpen(true); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      // Enter must not submit the form from inside a picker.
                      e.preventDefault();
                      if (crewMatches.length === 1 && crewQuery.trim()) addRosterCrew(crewMatches[0].id);
                      else addFreeCrew();
                    } else if (e.key === "Escape" && crewMenuOpen) {
                      e.preventDefault();
                      setCrewMenuOpen(false);
                    }
                  }} />
                <button className={styles.comboCaret} type="button"
                  aria-label={crewMenuOpen ? "Hide crew list" : "Show crew list"} tabIndex={-1}
                  onClick={() => setCrewMenuOpen((v) => !v)}>
                  <Icon id="i-chev" />
                </button>
              </div>
              <div className={styles.comboMenu} id="mjCrewMenu" role="listbox">
                {crewMatches.map((w) => (
                  <button key={w.id} className={styles.comboItem} type="button" role="option"
                    aria-selected={false} onClick={() => addRosterCrew(w.id)}>
                    <span className={styles.comboAv}>{initials(w.name)}</span>
                    {w.name}
                  </button>
                ))}
                {typedIsNew ? (
                  <button className={`${styles.comboItem} ${styles.comboItemNew}`} type="button"
                    role="option" aria-selected={false} onClick={addFreeCrew}>
                    <span className={`${styles.comboAv} ${styles.comboAvNew}`}>
                      <Icon id="i-plus" />
                    </span>
                    Add &ldquo;{typedName}&rdquo;
                  </button>
                ) : null}
                {crewMatches.length === 0 && !typedIsNew ? (
                  <div className={styles.comboEmpty}>
                    {crewOptions.length ? "Everyone on the roster is already on this job." : "No crew on the roster yet."}
                  </div>
                ) : null}
              </div>
            </div>

            {draftCrew.length || draftCrewFree.length ? (
              <div className={styles.chips}>
                {draftCrew.map((id) => {
                  const w = crewOptions.find((x) => x.id === id);
                  if (!w) return null;
                  return (
                    <span key={id} className={styles.chip}>
                      {w.name}
                      <button className={styles.chipX} type="button" aria-label={`Remove ${w.name}`}
                        onClick={() => setDraftCrew((prev) => prev.filter((x) => x !== id))}>
                        <Icon id="i-x" />
                      </button>
                    </span>
                  );
                })}
                {draftCrewFree.map((n) => (
                  <span key={n} className={`${styles.chip} ${styles.chipFree}`}>
                    {n}
                    <button className={styles.chipX} type="button" aria-label={`Remove ${n}`}
                      onClick={() => setDraftCrewFree((prev) => prev.filter((x) => x !== n))}>
                      <Icon id="i-x" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            <span className={styles.fldHint}>
              Optional — leave it empty and dispatch later. Roster picks are invited to the job;
              a name that isn&rsquo;t on your roster is saved to the job&rsquo;s notes.
            </span>
          </div>

          {newErr ? <div className={styles.fldErr}>{newErr}</div> : null}
        </form>
        <div className={styles.formFoot}>
          <button className={`${styles.btn} ${styles.btnGhost}`} type="button" disabled={saving}
            onClick={() => setNewOpen(false)}>
            Cancel
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" form="mjNewForm"
            disabled={saving}>
            <Icon id="i-check" />{saving ? "Creating…" : "Create job"}
          </button>
        </div>
      </div>
    </div>
  );
}
