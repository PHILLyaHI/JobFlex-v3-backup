"use client";

// MOBILE CALENDAR (mobile-calendar-v2) — Blueprint system, handheld build.
//
// Tokens, palette, type scale, status tones and Motion System "Balanced" are
// the reference dashboard's; the shell (topbar / hamburger drawer / bottom
// sheets) is the shared <MobileNav /> that mobile-v2, mobile-proposals-v2 and
// mobile-clients-v2 already use, so the four handheld surfaces are one product.
//
// Every region / view / variant of the desktop calendar sheet is covered:
//  · Delivery head + the New-event action + the crew-inbox action with its badge
//  · 3 view tabs (Month / Week / Team) with live counts + sliding rule
//  · the toolbar: prev / next / Today / range title, plus the tray badge
//  · search + the worker dropdown + the four status toggles, as ONE dropdown
//  · MONTH: the 6×7 grid — today filled blueprint, selected day inset, out-of-
//    month faded, status dots, "+N" past three — plus the selected day's agenda
//  · WEEK: a swipe rail — one day per full-width panel, its events as rows
//  · TEAM: a swipe rail — one crew member per panel, their week as rows
//  · the desktop event chip re-cut as a row card (time plate / title / actions,
//    who-where in mono, status badge + crew + duration)
//  · a tap on a row opens the EVENT DETAIL sheet; the "⋮" opens the actions
//    sheet: 6 tonal rows, three ways to reach a disabled row, one danger row
//  · the create AND edit forms as a bottom sheet: kind tabs, required-field
//    validation, all-day switch, status segments, crew picker, the link-a-record
//    picker with its own search, and the meta read-out on an existing event
//  · the crew-confirmation inbox and the unscheduled tray as sheets
//  · BOTH empty states (nothing scheduled / no matches) in all three views
//
// What changes versus the desktop sheet, and why:
//  · The week TIME GRID (8 columns × 14 one-hour rows) and the team GRID
//    (crew × 7 days) are the two things a 320px viewport cannot hold, and
//    hiding columns is not allowed. Columns side by side on a phone are ~45px
//    of unreadable slivers, so BOTH become scroll-snap rails: one column per
//    swipe, full width, its events read as ROWS. Nothing is dropped — the same
//    events, the same days, one panel at a time.
//  · No aggregate masthead. "59 booked hours / 14 events" is a number nobody
//    acts on standing in a driveway, and it sat between the page title and the
//    schedule itself (owner's call, 2026-07-30). The tab counts still carry how
//    much is in each range, and Team still carries per-crew load.
//  · Drag-and-drop is gone; there is no drag on a touch surface worth
//    defending. Its two jobs are now explicit: "Push to tomorrow" in the
//    actions sheet reschedules, and the tray's "Schedule" opens the create form
//    pre-filled with that job on the selected day.
//  · The two desktop filter controls become ONE dropdown (house rule), and
//    single-select: a 320px face can show one value and one count, not "2
//    selected" plus a chip rail.
//  · Start/end use the native date and time inputs instead of the desktop's
//    hand-built pop-over calendars. On a phone that is the OS picker, already
//    ≥44px, already localised, and it does not fight the sheet for space.
//  · No pager: prev / next / Today IS a calendar's pager, and a range is
//    already a page.
//
// Content is the donor demo fixture by design: the data layer is out of scope
// until the layout is signed off.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./mobile-calendar.module.css";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import { lockScroll } from "@/lib/scrollLock";
import {
  ALL,
  DOW,
  DOW1,
  EVENTS_SEED,
  INBOX_SEED,
  JOB_STATUSES,
  KIND_IC,
  KIND_LABEL,
  LINK_LABEL,
  LINK_OPTIONS,
  LINK_TABS,
  MG_CAP,
  OWNER,
  TODAY,
  TRAY_SEED,
  VIEWS,
  addDays,
  addMin,
  atMins,
  byStart,
  crewLabel,
  durLabel,
  eventHours,
  filterCount,
  filterOptions,
  fmtDate,
  fmtDayShort,
  fmtClock,
  fmtMeridiem,
  fmtMonthYear,
  fmtRange,
  fmtWeekRange,
  initials,
  matchesFilter,
  matchesQuery,
  sameDay,
  sameMonth,
  startOfWeek,
  toDateInput,
  toTimeInput,
  toneKey,
  toneLabel,
  fromInputs,
  whoWhere,
  workerName,
  workersData,
  type CalEvent,
  type CalKind,
  type InboxItem,
  type LinkKind,
  type TrayJob,
  type ViewKey,
} from "./calendar-data";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Icon({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ?? styles.ic} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
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

/** The three status tones plus the two kind tones — badges and dots share them. */
const TONE_BADGE: Record<string, string> = {
  scheduled: styles.stSched,
  in_progress: styles.stProg,
  completed: styles.stDone,
  canceled: styles.stCancel,
  appt: styles.stAppt,
  blocked: styles.stBlocked,
};
const TONE_DOT: Record<string, string> = {
  scheduled: styles.dotSched,
  in_progress: styles.dotProg,
  completed: styles.dotDone,
  canceled: styles.dotCancel,
  appt: styles.dotAppt,
  blocked: styles.dotBlocked,
};

/**
 * ONE row card, shared by all three views — the desktop event chip re-cut.
 * A chip carried kind, title, time, crew and status inside a ~120px box; these
 * three lines carry all five plus the client and the address.
 *
 * `showDay` is for the Team rail only: its panel is a crew member, so a row can
 * be any day of the week and the plate has to name which. Month and Week panels
 * are already one day, so there it would be the same word on every row.
 *
 * Declared at module scope, not inside MobileCalendar: a component created
 * during render is a NEW type on every keystroke, so React unmounts and
 * remounts every row — which would restart the row's entrance animation each
 * time the search box changed.
 */
function EventRow({
  e, i, landed, showDay, onOpen, onSelect,
}: {
  e: CalEvent; i: number; landed: boolean; showDay?: boolean;
  onOpen: (id: string) => void; onSelect: (id: string) => void;
}) {
  const tone = toneKey(e);
  const today = sameDay(e.start, TODAY);
  return (
    <div
      className={`${styles.erow} ${styles.rowIn} ${landed ? styles.landed : ""}`}
      style={{ animationDelay: `${i * 45}ms` }}
    >
      {/* Time is the one thing a calendar row is about, so it takes the left
          plate. Today is ALWAYS filled blueprint — the reference's rule. */}
      <span className={`${styles.etime} ${today ? styles.isToday : ""}`}>
        {showDay ? <span className={styles.etimeD}>{DOW[e.start.getDay()]}</span> : null}
        {e.allDay ? (
          <>
            <span className={styles.etimeH}>ALL</span>
            <span className={styles.etimeM}>DAY</span>
          </>
        ) : (
          <>
            <span className={styles.etimeH}>{fmtClock(e.start)}</span>
            <span className={styles.etimeM}>{fmtMeridiem(e.start)}</span>
          </>
        )}
      </span>
      {/* The kind glyph that used to lead this line is gone (owner's call,
          2026-07-30): it indented every title by 23px and said nothing the
          status badge on row 3 does not already say in words — "Appointment",
          "Blocked", or one of the four job statuses.
          The title IS the row's control: its ::after covers the whole card, so
          a tap anywhere outside the ⋮ opens the detail sheet. One button, and
          its accessible name is the event — no second tab stop for the card. */}
      <button className={styles.etitle} type="button" onClick={() => onSelect(e.id)}>
        {/* The clamp lives on the inner span, not the button: the button is
            what carries the stretched ::after, and an -webkit-box with
            overflow:hidden is the one box you do not want owning it. */}
        <span className={styles.etitleTxt}>{e.title}</span>
      </button>
      <button
        className={styles.erowOpen}
        type="button"
        aria-label={`Actions for ${e.title}`}
        onClick={() => onOpen(e.id)}
      >
        <Icon id="i-dots" />
      </button>
      {/* Row 2 — who and where, hard left */}
      <div className={styles.ewho}>{whoWhere(e)}</div>
      {/* Row 3 — badge leads, the duration closes at the far right */}
      <div className={styles.erowFoot}>
        <span className={`${styles.estatus} ${TONE_BADGE[tone] ?? ""}`}>{toneLabel(e)}</span>
        <span className={styles.ecrew}>{crewLabel(e)}</span>
        <span className={`${styles.edur} ${e.allDay ? styles.isZero : ""}`}>
          {e.allDay ? "—" : durLabel(e.end.getTime() - e.start.getTime())}
        </span>
      </div>
    </div>
  );
}

/**
 * The estimate-sheet read-out an event opens with. ONE list, shared by the
 * detail sheet and the edit form's meta box, so the two can never drift into
 * disagreeing about the same event. Optional fields are omitted rather than
 * printed empty — a blank "Phone —" row is noise, and the fixture deliberately
 * carries events with no phone, no address and no client.
 */
function metaRowsFor(e: CalEvent): [string, string][] {
  const rows: [string, string][] = [
    ["When", e.allDay ? fmtDate(e.start) : `${fmtDate(e.start)} · ${fmtRange(e.start, e.end)}`],
    ["Duration", e.allDay ? "All day" : durLabel(e.end.getTime() - e.start.getTime())],
  ];
  if (e.client) rows.push(["Client", e.client]);
  if (e.phone) rows.push(["Phone", e.phone]);
  if (e.addr) rows.push(["Address", e.addr]);
  rows.push([
    "Crew",
    e.kind === "blocked" && e.selfOnly
      ? `Just me · ${OWNER.name}`
      : e.workers.map(workerName).join(", ") || "Unassigned",
  ]);
  if (e.scope) rows.push(["Scope", e.scope]);
  return rows;
}

/** Never blank: it says what happened AND what to do. Two distinct states —
 *  a filter that excludes everything is not the same thing as an open day. */
function EmptyState({
  what, filtered, onClear, onNew,
}: { what: string; filtered: boolean; onClear: () => void; onNew: () => void }) {
  return filtered ? (
    <div className={styles.empty}>
      <div className={styles.emptyT}>No matches</div>
      <div className={styles.emptyS}>Nothing in this {what} matches that search and filter.</div>
      <button className={styles.emptyA} type="button" onClick={onClear}>
        <Icon id="i-x" />Clear filters
      </button>
    </div>
  ) : (
    <div className={styles.empty}>
      <div className={styles.emptyT}>Nothing scheduled</div>
      <div className={styles.emptyS}>
        This {what} is open. Book a job, or pull one off the unscheduled list.
      </div>
      <button className={styles.emptyA} type="button" onClick={onNew}>
        <Icon id="i-plus" />New event
      </button>
    </div>
  );
}

type FormState = {
  mode: "new" | "edit";
  id: string | null;
  kind: CalKind;
  title: string;
  date: string;
  startT: string;
  endT: string;
  allDay: boolean;
  status: string;
  crew: string[];
  link: string | null;
  notes: string;
  /** Set when the form was opened from the tray: creating consumes that job. */
  fromTray: string | null;
};

export function MobileCalendar() {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  /* Cloned per mount so runtime mutations never leak between mounts. */
  const [data, setData] = useState<CalEvent[]>(() =>
    EVENTS_SEED.map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end), workers: e.workers.slice() })),
  );
  const [tray, setTray] = useState<TrayJob[]>(() => TRAY_SEED.map((j) => ({ ...j })));
  const [inbox, setInbox] = useState<InboxItem[]>(() => INBOX_SEED.map((r) => ({ ...r })));

  const [view, setView] = useState<ViewKey>("month");
  const [cursor, setCursor] = useState<Date>(() => new Date(TODAY));
  const [sel, setSel] = useState<Date>(() => new Date(TODAY));

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>(ALL);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const [actId, setActId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [landedId, setLandedId] = useState<string | null>(null);
  const seq = useRef(100);

  /* ---- create / edit form ---- */
  const [form, setForm] = useState<FormState>(() => ({
    mode: "new", id: null, kind: "job", title: "",
    date: toDateInput(TODAY), startT: "08:00", endT: "10:00",
    allDay: false, status: "SCHEDULED", crew: [], link: null, notes: "", fromTray: null,
  }));
  const [titleErr, setTitleErr] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

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

  /* ---------- Motion: press stamp (delegated, covers late rows) ---------
     A calendar day keeps the reference's own press-pulse (.94 → 1.02 → 1)
     rather than the flat stamp — decisions.md gives the day cell that
     signature and it is the one control on the page that is a plate, not a
     button face. */
  const onRootClick = useCallback((e: React.MouseEvent) => {
    if (prefersReducedMotion()) return;
    const sel2 = [
      styles.btn, styles.ddBtn, styles.ddItem, styles.tab, styles.navBtn, styles.rbarBtn,
      styles.agAdd, styles.erowOpen, styles.mrow, styles.sheetCancel, styles.emptyA,
      styles.srchX, styles.segBtn, styles.fchk, styles.kindBtn, styles.linkBtn,
      styles.linkRow, styles.queueBtn, styles.mgCell,
    ].map((c) => `.${c}`).join(", ");
    const el = (e.target as HTMLElement).closest<HTMLElement>(sel2);
    if (!el) return;
    const cls = el.classList.contains(styles.mgCell) ? styles.dayPressed : styles.pressed;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
  }, []);

  /* ---------- Esc closes what the PAGE owns ----------------------------
     The drawer is not listed: MobileNav owns its own Escape and only binds
     while open, so the two listeners can never claim one key press. Innermost
     first — the detail sheet is checked before the actions sheet because Edit
     is reached THROUGH it, so it is the newer layer. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (filterOpen) setFilterOpen(false);
      else if (linkOpen) setLinkOpen(false);
      else if (formOpen) setFormOpen(false);
      else if (trayOpen) setTrayOpen(false);
      else if (inboxOpen) setInboxOpen(false);
      else if (actId) setActId(null);
      else if (detailId) setDetailId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filterOpen, linkOpen, formOpen, trayOpen, inboxOpen, actId, detailId]);

  /* ---------- Filter dropdown: close on outside pointerdown ------------ */
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [filterOpen]);

  /* ---------- The one blue flash on a record you just changed ----------- */
  useEffect(() => {
    if (!landedId) return;
    const t = window.setTimeout(() => setLandedId(null), 700);
    return () => clearTimeout(t);
  }, [landedId]);

  /* ---------- derived ranges ------------------------------------------- */
  const visible = useMemo(
    () => data.filter((e) => matchesFilter(e, filter) && matchesQuery(e, query)),
    [data, filter, query],
  );
  const weekStart = useMemo(() => startOfWeek(cursor), [cursor]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const monthEvents = useMemo(() => visible.filter((e) => sameMonth(e.start, cursor)), [visible, cursor]);
  const weekEvents = useMemo(
    () => visible.filter((e) => e.start >= weekStart && e.start < addDays(weekStart, 7)),
    [visible, weekStart],
  );
  const dayEvents = useMemo(
    () => visible.filter((e) => sameDay(e.start, sel)).sort(byStart),
    [visible, sel],
  );
  const crewOn = useMemo(
    () => workersData.filter((w) => weekEvents.some((e) => e.workers.includes(w.id))).length,
    [weekEvents],
  );

  const counts: Record<ViewKey, number> = {
    month: monthEvents.length,
    week: weekEvents.length,
    team: crewOn,
  };

  /* ---------- swipe rails: Week (7 days) and Team (4 crew) --------------
     Both views used to lay their columns out side by side, which on a phone is
     seven ~40px slivers nobody can read. Each is now a scroll-snap rail: one
     full-width panel per swipe, its events as ROWS. The index below is only
     ever a READ-OUT of where the rail already is — nothing writes scrollLeft
     from it, so the finger is always the authority. */
  const weekRailRef = useRef<HTMLDivElement>(null);
  const teamRailRef = useRef<HTMLDivElement>(null);
  const [weekIdx, setWeekIdx] = useState(0);
  const [teamIdx, setTeamIdx] = useState(0);

  /** Which panel is under the viewport, from the rail's own scroll position. */
  const railIndex = (rail: HTMLDivElement, count: number) => {
    const col = rail.firstElementChild as HTMLElement | null;
    const w = col?.offsetWidth || 1;
    return Math.max(0, Math.min(count - 1, Math.round(rail.scrollLeft / w)));
  };

  /* The week rail opens on the day you were already looking at, not on Sunday:
     landing on an empty Sunday when today is Wednesday is the single easiest
     way to make a swipe rail feel broken. Nothing here sets `sel`, so this
     cannot loop back on itself. */
  useEffect(() => {
    if (view !== "week") return;
    const rail = weekRailRef.current;
    if (!rail) return;
    const idx = Math.max(0, weekDays.findIndex((d) => sameDay(d, sel)));
    const col = rail.firstElementChild as HTMLElement | null;
    rail.scrollTo({ left: (col?.offsetWidth ?? 0) * idx, behavior: "auto" });
    setWeekIdx(idx);
  }, [view, weekDays, sel]);

  /* The rail unmounts with its view, so its scrollLeft is 0 again on return and
     the read-out has to be reset with it or it reports a stale panel. Done on
     the tab press rather than in an effect: switching view is an event, not a
     synchronisation with an outside system. The week rail needs no equivalent —
     its effect below re-derives the index from the position it scrolls to. */
  const changeView = (next: ViewKey) => {
    setView(next);
    setTeamIdx(0);
  };

  /* ---------- range navigation -----------------------------------------
     Moving the range keeps the agenda honest: the selected day snaps into the
     range you just opened — today when it is in there, otherwise its first
     day — instead of pointing at a day the grid no longer shows. */
  const goto = (next: Date) => {
    setCursor(next);
    const inRange = view === "month"
      ? sameMonth(TODAY, next)
      : TODAY >= startOfWeek(next) && TODAY < addDays(startOfWeek(next), 7);
    if (inRange) {
      setSel(new Date(TODAY));
      return;
    }
    setSel(view === "month" ? new Date(next.getFullYear(), next.getMonth(), 1) : startOfWeek(next));
  };
  const step = (dir: -1 | 1) => {
    const c = new Date(cursor);
    if (view === "month") c.setMonth(c.getMonth() + dir);
    else c.setDate(c.getDate() + dir * 7);
    goto(c);
  };
  const goToday = () => {
    setCursor(new Date(TODAY));
    setSel(new Date(TODAY));
  };

  const rangeTitle = view === "month" ? fmtMonthYear(cursor) : fmtWeekRange(weekStart);

  /* ---------- month grid ----------------------------------------------- */
  const monthCells = useMemo(() => {
    const gridStart = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    return Array.from({ length: 42 }, (_, i) => {
      const day = addDays(gridStart, i);
      const evs = visible.filter((e) => sameDay(e.start, day)).sort(byStart);
      return { day, evs, out: day.getMonth() !== cursor.getMonth() };
    });
  }, [cursor, visible]);

  const filtersActive = Boolean(query.trim()) || filter !== ALL;
  const resetFilters = () => {
    setFilter(ALL);
    setQuery("");
  };

  const options = useMemo(() => filterOptions(), []);
  const activeOption = options.find((o) => o.key === filter) ?? options[0];

  /* ---------- actions sheet / detail sheet ------------------------------
     Both read back out of `data` rather than holding a copy of the event, so a
     sheet that is open while the record changes underneath it (mark completed,
     push to tomorrow) redraws with the new values instead of the stale ones. */
  const actEvent = actId === null ? null : (data.find((e) => e.id === actId) ?? null);
  const detailEvent = detailId === null ? null : (data.find((e) => e.id === detailId) ?? null);

  const menuRows = useMemo<MenuRow[]>(() => {
    const e = actEvent;
    if (!e) return [];
    const isJob = e.kind === "job";
    const done = e.status === "COMPLETED";
    return [
      { act: "edit", icon: "i-file", tone: styles.miBp, title: "Edit event",
        sub: "Time, crew, status and notes" },
      { act: "call", icon: "i-phone", tone: styles.miSky, title: "Call client",
        sub: e.phone ?? "No phone on this event", disabled: !e.phone },
      { act: "dir", icon: "i-pin", tone: styles.miWarn, title: "Get directions",
        sub: e.addr ? `${e.addr} — open in maps` : "No address on this event", disabled: !e.addr },
      { act: "done", icon: "i-check", tone: styles.miOk,
        title: done ? "Already completed" : "Mark completed",
        sub: !isJob ? "Only job events carry a status" : done ? `Filed ${fmtDayShort(e.end)}` : "Closes it out on the schedule",
        disabled: done || !isJob },
      { act: "push", icon: "i-rotate", title: "Push to tomorrow",
        sub: `Moves the whole span to ${fmtDayShort(addDays(e.start, 1))}` },
      { act: "del", icon: "i-trash", tone: styles.miDanger, title: "Delete event",
        sub: "Removes it from the calendar", danger: true },
    ];
  }, [actEvent]);

  const runMenu = (act: string) => {
    const e = actEvent;
    setActId(null);
    if (!e) return;
    if (act === "del") {
      setData((prev) => prev.filter((x) => x.id !== e.id));
      return;
    }
    if (act === "done") {
      setData((prev) => prev.map((x) => (x.id === e.id ? { ...x, status: "COMPLETED" } : x)));
      setLandedId(e.id);
      return;
    }
    if (act === "push") {
      setData((prev) =>
        prev.map((x) => (x.id === e.id ? { ...x, start: addDays(x.start, 1), end: addDays(x.end, 1) } : x)),
      );
      setSel(addDays(e.start, 1));
      setLandedId(e.id);
      return;
    }
    if (act === "edit") openEdit(e);
  };

  /* ---------- form ----------------------------------------------------- */
  const focusTitle = () => {
    // Focus after the slide settles — focusing mid-transform makes the
    // keyboard fight the animation.
    window.setTimeout(() => titleRef.current?.focus(), prefersReducedMotion() ? 0 : 320);
  };

  const openNew = (day?: Date, seed?: TrayJob) => {
    const base = day ?? sel;
    setForm({
      mode: "new", id: null, kind: "job",
      title: seed ? `${seed.title} — ${seed.client}` : "",
      date: toDateInput(base), startT: "08:00", endT: seed ? "12:00" : "10:00",
      allDay: false, status: "SCHEDULED", crew: [], link: seed ? seed.id : null,
      notes: seed ? `Est. ${seed.duration}` : "", fromTray: seed ? seed.id : null,
    });
    setTitleErr(false);
    setLinkOpen(false);
    setLinkQuery("");
    setTrayOpen(false);
    setFormOpen(true);
    focusTitle();
  };

  const openEdit = (e: CalEvent) => {
    setForm({
      mode: "edit", id: e.id, kind: e.kind, title: e.title,
      date: toDateInput(e.start), startT: toTimeInput(e.start), endT: toTimeInput(e.end),
      allDay: Boolean(e.allDay), status: e.status, crew: e.workers.slice(),
      link: null, notes: e.notes ?? "", fromTray: null,
    });
    setTitleErr(false);
    setLinkOpen(false);
    setLinkQuery("");
    setFormOpen(true);
  };

  const patchForm = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  const toggleCrew = (id: string) =>
    setForm((f) => ({
      ...f,
      crew: f.crew.includes(id) ? f.crew.filter((x) => x !== id) : [...f.crew, id],
    }));

  const linkRows = useMemo(() => {
    const kinds: LinkKind[] = LINK_TABS[form.kind] ?? [];
    const q = linkQuery.trim().toLowerCase();
    return LINK_OPTIONS.filter((o) => kinds.includes(o.kind)).filter(
      (o) => !q || `${o.title} ${o.client} ${o.meta}`.toLowerCase().includes(q),
    );
  }, [form.kind, linkQuery]);
  const linkPick = LINK_OPTIONS.find((o) => o.id === form.link) ?? null;

  const submitForm = (ev: React.FormEvent) => {
    ev.preventDefault();
    const title = form.title.trim();
    if (!title) {
      setTitleErr(true);
      titleRef.current?.focus();
      return;
    }
    const start = form.allDay
      ? fromInputs(form.date, "00:00", sel)
      : fromInputs(form.date, form.startT, sel);
    const endRaw = form.allDay
      ? atMins(start, 23 * 60 + 59)
      : fromInputs(form.date, form.endT, sel);
    // A 2h fallback if the end never got past the start — the donor's rule.
    const end = form.allDay ? endRaw : endRaw.getTime() > start.getTime() ? endRaw : addMin(start, 120);
    const selfOnly = form.kind === "blocked" && form.crew.length === 0;
    const opt = form.link ? LINK_OPTIONS.find((o) => o.id === form.link) : undefined;

    if (form.mode === "edit" && form.id) {
      const id = form.id;
      setData((prev) =>
        prev.map((x) =>
          x.id === id
            ? {
                ...x, title, start, end,
                allDay: form.allDay || undefined,
                status: x.kind === "job" ? form.status : x.status,
                workers: selfOnly ? [OWNER.id] : form.crew.slice(),
                selfOnly: selfOnly || undefined,
                notes: form.notes.trim() || undefined,
              }
            : x,
        ),
      );
      setSel(new Date(start));
      setLandedId(id);
    } else {
      seq.current += 1;
      const id = `e${seq.current}`;
      setData((prev) => [
        ...prev,
        {
          id, kind: form.kind, title, start, end,
          allDay: form.allDay || undefined,
          status: form.kind === "job" ? form.status : "SCHEDULED",
          workers: selfOnly ? [OWNER.id] : form.crew.slice(),
          client: opt ? opt.client : undefined,
          selfOnly: selfOnly || undefined,
          notes: form.notes.trim() || undefined,
        },
      ]);
      if (form.fromTray) setTray((prev) => prev.filter((j) => j.id !== form.fromTray));
      setCursor(new Date(start));
      setSel(new Date(start));
      setLandedId(id);
    }
    setFormOpen(false);
  };

  const anyOverlay = Boolean(actEvent) || Boolean(detailEvent) || formOpen || inboxOpen || trayOpen;
  const closeAll = () => {
    setActId(null);
    setDetailId(null);
    setFormOpen(false);
    setInboxOpen(false);
    setTrayOpen(false);
  };

  // Swipe-down dismissal. Five sheets, five gestures, each on the same setter
  // the Escape ladder above uses — the detail sheet closes without disturbing
  // the actions sheet it was reached from.
  const actDrag = useSheetDrag(Boolean(actEvent), () => setActId(null));
  const detailDrag = useSheetDrag(Boolean(detailEvent), () => setDetailId(null));
  const inboxDrag = useSheetDrag(inboxOpen, () => setInboxOpen(false));
  const trayDrag = useSheetDrag(trayOpen, () => setTrayOpen(false));
  const formDrag = useSheetDrag(formOpen, () => setFormOpen(false));

  return (
    <div className={styles.app} onClick={onRootClick}>
      {/* Shared handheld nav: topbar + drawer + sprite. Owns its own open
          state, so the page holds none. It is the first child because its
          topbar is the only in-flow node it contributes, and that node fills
          the grid's first row. */}
      <MobileNav />

      {/* The ONE symbol this page adds. The shared sprite carries 48 and `ban`
          is not one of them; the i-calendar- prefix makes a collision with it —
          or with another page — impossible. Original lucide path, 24×24,
          stroke 2, currentColor. Absolutely positioned, so it claims no grid
          track: it is a definition, not a picture. */}
      <svg className={styles.sprite} aria-hidden="true" focusable="false">
        <symbol id="i-calendar-ban" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <path d="m4.9 4.9 14.2 14.2" />
        </symbol>
      </svg>

      {/* ============ SCROLLER ============ */}
      <main className={styles.scroll} ref={scrollRef}>
        <div className={styles.content} ref={contentRef}>
          {/* PAGE HEAD */}
          <div className={styles.pageHead}>
            <div className={styles.kicker}>Delivery</div>
            <h1 className={styles.pageTitle}>Calendar</h1>
            <div className={styles.pageActions}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={() => openNew()}>
                <Icon id="i-plus" />New event
              </button>
              <button
                className={`${styles.btn} ${styles.btnGhost}`}
                type="button"
                onClick={() => setInboxOpen(true)}
              >
                <Icon id="i-bell" />Crew inbox
                {inbox.length ? <span className={styles.btnCount}>{inbox.length}</span> : null}
              </button>
            </div>
          </div>

          {/* VIEW TABS — also the only aggregate left on the page: the count on
              each tab says how much is in that range, in the control you would
              use to go there. The masthead that used to sit here spent a whole
              card on "59h / 14 events / 4 unscheduled" above the schedule
              itself (removed, owner's call 2026-07-30). */}
          <div className={styles.tabs}>
            <span
              className={styles.tabInd}
              style={{ transform: `translateX(${VIEWS.findIndex((v) => v.key === view) * 100}%)` }}
            />
            {VIEWS.map((v) => (
              <button
                key={v.key}
                className={`${styles.tab} ${view === v.key ? styles.active : ""}`}
                type="button"
                aria-current={view === v.key ? "page" : undefined}
                onClick={() => changeView(v.key)}
              >
                {v.label}
                <span className={styles.tabCount}>{counts[v.key]}</span>
              </button>
            ))}
          </div>

          {/* RANGE BAR — the desktop toolbar: prev / next / Today / title,
              plus the unscheduled tray and its badge. All flat: only the head
              pair and the filter carry a fill. */}
          <div className={styles.rbar}>
            {/* Flex rows, not a grid: the second row has to span the full width
                and a grid would need every child pinned to a column to keep
                auto-placement from claiming the wrong one. */}
            <div className={styles.rbarNav}>
              <button className={styles.navBtn} type="button" aria-label="Previous" onClick={() => step(-1)}>
                <Icon id="i-chevl" />
              </button>
              <div className={styles.rbarTitle}>{rangeTitle}</div>
              <button className={styles.navBtn} type="button" aria-label="Next" onClick={() => step(1)}>
                <Icon id="i-chevr" />
              </button>
            </div>
            <div className={styles.rbarBtns}>
              <button className={styles.rbarBtn} type="button" onClick={goToday}>
                <Icon id="i-target" />Today
              </button>
              <button className={styles.rbarBtn} type="button" onClick={() => setTrayOpen(true)}>
                <Icon id="i-board" />Unscheduled
                {tray.length ? <span className={styles.btnCount}>{tray.length}</span> : null}
              </button>
            </div>
          </div>

          {/* FIND BAR — search + the one filter dropdown */}
          <div className={styles.find}>
            <label className={styles.srch}>
              <Icon id="i-search" />
              <input
                className={styles.srchInput}
                type="search"
                value={query}
                placeholder="Search title, client or address…"
                autoComplete="off"
                aria-label="Search events"
                onChange={(e) => setQuery(e.target.value)}
              />
              {query ? (
                <button
                  className={styles.srchX}
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  <Icon id="i-x" />
                </button>
              ) : null}
            </label>

            <div className={`${styles.dd} ${filterOpen ? styles.open : ""}`} ref={filterRef}>
              <button
                className={styles.ddBtn}
                type="button"
                aria-haspopup="listbox"
                aria-expanded={filterOpen}
                onClick={() => setFilterOpen((v) => !v)}
              >
                <Icon id="i-filter" />
                Filter
                <span className={`${styles.ddValue} ${filter === ALL ? styles.isAll : ""}`}>
                  {activeOption.label} · {filterCount(data, filter)}
                </span>
                <Icon id="i-chev" className={`${styles.ic} ${styles.ddCaret}`} />
              </button>
              <div className={styles.ddMenu} role="listbox">
                {options.map((o) => (
                  <button
                    key={o.key}
                    className={`${styles.ddItem} ${filter === o.key ? styles.active : ""}`}
                    type="button"
                    role="option"
                    aria-selected={filter === o.key}
                    onClick={() => {
                      setFilter(o.key);
                      setFilterOpen(false);
                    }}
                  >
                    {o.label}
                    <span className={styles.ddCount}>{filterCount(data, o.key)}</span>
                    {filter === o.key ? <Icon id="i-check" /> : null}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ============ VIEW: MONTH ============ */}
          {view === "month" && (
            <div className={styles.mcard}>
              <div className={styles.mgHead}>
                {DOW.map((d, i) => (
                  <span className={styles.mgHeadCell} key={d + i}>
                    <span className={styles.mgHeadLong}>{d}</span>
                    <span className={styles.mgHeadShort}>{DOW1[i]}</span>
                  </span>
                ))}
              </div>
              <div className={styles.mgGrid}>
                {monthCells.map((c) => {
                  const isToday = sameDay(c.day, TODAY);
                  const isSel = sameDay(c.day, sel);
                  const extra = Math.max(0, c.evs.length - MG_CAP);
                  return (
                    <button
                      key={c.day.toISOString()}
                      type="button"
                      className={`${styles.mgCell} ${c.out ? styles.isOut : ""} ${isToday ? styles.isToday : ""} ${isSel ? styles.isSel : ""}`}
                      aria-label={`${fmtDate(c.day)} — ${c.evs.length} events`}
                      aria-pressed={isSel}
                      onClick={() => setSel(c.day)}
                    >
                      <span className={styles.mgNum}>{c.day.getDate()}</span>
                      <span className={styles.mgDots}>
                        {c.evs.slice(0, MG_CAP).map((e) => (
                          <span key={e.id} className={`${styles.mgDot} ${TONE_DOT[toneKey(e)] ?? ""}`} />
                        ))}
                      </span>
                      {extra ? <span className={styles.mgMore}>+{extra}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* MONTH: the selected day's agenda. The head is deliberately
              lopsided — the DATE owns the row at 900 weight and the Add button
              is a hairline chip beside it. It used to be the other way round:
              a 1.5px ink box shouting ADD next to an 11px mono date, so the eye
              landed on the action before it knew which day it was on. */}
          {view === "month" && (
            <div className={styles.agenda}>
              <div className={styles.agHead}>
                <div className={styles.agHeadT}>
                  {DOW[sel.getDay()]} · {fmtDayShort(sel)}
                  {sameDay(sel, TODAY) ? <span className={styles.agToday}>Today</span> : null}
                </div>
                <button
                  className={styles.agAdd}
                  type="button"
                  onClick={() => openNew(sel)}
                  aria-label={`New event on ${fmtDate(sel)}`}
                >
                  <Icon id="i-plus" />Add
                </button>
              </div>
              {dayEvents.length ? (
                <div className={styles.agList}>
                  {dayEvents.map((e, i) => (
                    <EventRow
                      e={e}
                      i={i}
                      key={e.id}
                      landed={landedId === e.id}
                      onOpen={setActId}
                      onSelect={setDetailId}
                    />
                  ))}
                </div>
              ) : (
                <div className={styles.agEmpty}>
                  <EmptyState
                    what="day"
                    filtered={filtersActive}
                    onClear={resetFilters}
                    onNew={() => openNew()}
                  />
                </div>
              )}
            </div>
          )}

          {/* ============ VIEW: WEEK — one day per swipe ============
              Seven day COLUMNS side by side is ~40px of sliver each on a phone.
              The same seven days are now a scroll-snap rail: one full-width
              panel per swipe, the day's events as the same row cards the month
              agenda uses, and a tick rule underneath saying where you are. */}
          {view === "week" && (
            weekEvents.length === 0 ? (
              <EmptyState
                what="week"
                filtered={filtersActive}
                onClear={resetFilters}
                onNew={() => openNew()}
              />
            ) : (
              <div className={styles.railWrap}>
                <div
                  className={styles.rail}
                  ref={weekRailRef}
                  onScroll={(ev) => setWeekIdx(railIndex(ev.currentTarget, weekDays.length))}
                >
                  {weekDays.map((day) => {
                    const evs = weekEvents.filter((e) => sameDay(e.start, day)).sort(byStart);
                    return (
                      <section
                        className={styles.railCol}
                        key={day.toISOString()}
                        aria-label={fmtDate(day)}
                      >
                        <div className={styles.agHead}>
                          <div className={styles.agHeadT}>
                            {DOW[day.getDay()]} · {fmtDayShort(day)}
                            {sameDay(day, TODAY) ? <span className={styles.agToday}>Today</span> : null}
                          </div>
                          <button
                            className={styles.agAdd}
                            type="button"
                            onClick={() => openNew(day)}
                            aria-label={`New event on ${fmtDate(day)}`}
                          >
                            <Icon id="i-plus" />Add
                          </button>
                        </div>
                        {evs.length ? (
                          <div className={styles.agList}>
                            {evs.map((e, i) => (
                              <EventRow
                                e={e}
                                i={i}
                                key={e.id}
                                landed={landedId === e.id}
                                onOpen={setActId}
                                onSelect={setDetailId}
                              />
                            ))}
                          </div>
                        ) : (
                          <button className={styles.note} type="button" onClick={() => openNew(day)}>
                            Nothing scheduled — tap to book this day
                          </button>
                        )}
                      </section>
                    );
                  })}
                </div>
                {/* A measuring rule under the drawing, not a dot pager: seven
                    ticks across the full width, the live one filled blueprint,
                    plus the panel number in mono for anyone who cannot see it. */}
                <div className={styles.railMeta}>
                  <span className={styles.railTicks} aria-hidden="true">
                    {weekDays.map((d, i) => (
                      <i key={d.toISOString()} className={`${styles.railTick} ${i === weekIdx ? styles.on : ""}`} />
                    ))}
                  </span>
                  <span className={styles.railNow} aria-live="polite">
                    Day {weekIdx + 1} / {weekDays.length}
                  </span>
                </div>
              </div>
            )
          )}

          {/* ============ VIEW: TEAM — one crew member per swipe ============
              Same restructure as Week, keyed on the person instead of the day:
              the desktop's crew × 7-day grid becomes one full-width panel per
              installer. Rows carry their weekday on the time plate, since a
              crew panel spans the whole week. */}
          {view === "team" && (
            weekEvents.length === 0 ? (
              <EmptyState
                what="week"
                filtered={filtersActive}
                onClear={resetFilters}
                onNew={() => openNew()}
              />
            ) : (
              <div className={styles.railWrap}>
                <div
                  className={styles.rail}
                  ref={teamRailRef}
                  onScroll={(ev) => setTeamIdx(railIndex(ev.currentTarget, workersData.length))}
                >
                  {workersData.map((w) => {
                    const evs = weekEvents.filter((e) => e.workers.includes(w.id)).sort(byStart);
                    const hrs = evs.reduce((a, e) => a + eventHours(e), 0);
                    return (
                      <section className={styles.railCol} key={w.id} aria-label={`${w.name}, ${w.role}`}>
                        <div className={styles.tcardHead}>
                          <span className={`${styles.tav} ${evs.length ? styles.isOn : ""}`}>{initials(w.name)}</span>
                          <div className={styles.tWho}>
                            <div className={styles.tname}>{w.name}</div>
                            <div className={styles.trole}>{w.role}</div>
                          </div>
                          <div className={styles.tfigs}>
                            <div className={`${styles.tfigV} ${hrs ? "" : styles.isZero}`}>
                              {hrs ? `${Math.round(hrs)}h` : "—"}
                            </div>
                            <div className={styles.tfigL}>{evs.length} booked</div>
                          </div>
                        </div>
                        {evs.length ? (
                          <div className={styles.agList}>
                            {evs.map((e, i) => (
                              <EventRow
                                e={e}
                                i={i}
                                key={e.id}
                                landed={landedId === e.id}
                                showDay
                                onOpen={setActId}
                                onSelect={setDetailId}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className={styles.note}>Nothing on this week</div>
                        )}
                      </section>
                    );
                  })}
                </div>
                <div className={styles.railMeta}>
                  <span className={styles.railTicks} aria-hidden="true">
                    {workersData.map((w, i) => (
                      <i key={w.id} className={`${styles.railTick} ${i === teamIdx ? styles.on : ""}`} />
                    ))}
                  </span>
                  <span className={styles.railNow} aria-live="polite">
                    Crew {teamIdx + 1} / {workersData.length}
                  </span>
                </div>
              </div>
            )
          )}
        </div>
      </main>

      {/* ============ SHEET SCRIM (shared by all four sheets) ============ */}
      <div
        className={`${styles.scrim} ${anyOverlay ? styles.on : ""}`}
        onClick={closeAll}
        aria-hidden="true"
      />

      {/* ============ ROW ACTIONS SHEET ============ */}
      <div
        className={`${styles.sheet} ${actEvent ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Event actions"
        aria-hidden={!actEvent}
        {...actDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...actDrag.handleProps} />
        <div className={styles.sheetHead} {...actDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {actEvent
              ? `${fmtDayShort(actEvent.start)} · ${actEvent.allDay ? "All day" : fmtRange(actEvent.start, actEvent.end)}`
              : "Event · —"}
          </div>
          <div className={styles.sheetTitle}>{actEvent?.title ?? "Actions"}</div>
        </div>
        <div className={styles.sheetBody}>
          {menuRows.map((r) => (
            <button
              key={r.act}
              type="button"
              disabled={r.disabled}
              className={`${styles.mrow} ${r.danger ? styles.mrowDanger : ""}`}
              onClick={() => runMenu(r.act)}
            >
              <span className={`${styles.mrowIc} ${r.tone ?? ""}`}>
                <Icon id={r.icon} />
              </span>
              <span>
                <span className={styles.mrowT}>{r.title}</span>
                <span className={styles.mrowS}>{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setActId(null)}>
          Cancel
        </button>
      </div>

      {/* ============ EVENT DETAIL SHEET ============
          What a row card cannot hold: the full span, the phone number, the
          whole crew, the scope and the notes. A tap on the row opens it; the
          "⋮" still goes straight to the actions, so the two paths never fight.
          Closing is the scrim, Escape, the foot, or a pull down on the handle —
          the house set. */}
      <div
        className={`${styles.sheet} ${detailEvent ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Event detail"
        aria-hidden={!detailEvent}
        {...detailDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...detailDrag.handleProps} />
        <div className={styles.sheetHead} {...detailDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {detailEvent
              ? `${DOW[detailEvent.start.getDay()]} · ${fmtDayShort(detailEvent.start)}`
              : "Event · —"}
          </div>
          <div className={styles.sheetTitle}>{detailEvent?.title ?? "Event"}</div>
        </div>
        <div className={styles.sheetBody}>
          {detailEvent ? (
            <>
              {/* Status leads, in its own tone; kind and span follow in the
                  neutral badge so three badges never read as three statuses. */}
              <div className={styles.dBadges}>
                <span className={`${styles.estatus} ${TONE_BADGE[toneKey(detailEvent)] ?? ""}`}>
                  {toneLabel(detailEvent)}
                </span>
                <span className={styles.estatus}>{KIND_LABEL[detailEvent.kind]}</span>
                <span className={styles.estatus}>
                  {detailEvent.allDay
                    ? "All day"
                    : durLabel(detailEvent.end.getTime() - detailEvent.start.getTime())}
                </span>
              </div>

              <div className={styles.dSec}>
                <div className={styles.metaBox}>
                  {metaRowsFor(detailEvent).map(([l, v]) => (
                    <div className={styles.metaRow} key={l}>
                      <span className={styles.metaL}>{l}</span>
                      <span className={styles.metaV}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.dSec}>
                <div className={styles.dSecLbl}>Notes</div>
                {detailEvent.notes ? (
                  <div className={styles.dNote}>{detailEvent.notes}</div>
                ) : (
                  <div className={styles.note}>Nothing noted on this event</div>
                )}
              </div>
            </>
          ) : null}
        </div>
        <div className={styles.formFoot}>
          <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => setDetailId(null)}>
            Close
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            type="button"
            onClick={() => {
              const e = detailEvent;
              setDetailId(null);
              if (e) openEdit(e);
            }}
          >
            <Icon id="i-file" />Edit event
          </button>
        </div>
      </div>

      {/* ============ CREW INBOX SHEET ============ */}
      <div
        className={`${styles.sheet} ${inboxOpen ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Crew confirmations"
        aria-hidden={!inboxOpen}
        {...inboxDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...inboxDrag.handleProps} />
        <div className={styles.sheetHead} {...inboxDrag.handleProps}>
          <div className={styles.sheetKicker}>Crew confirmations</div>
          <div className={styles.sheetTitle}>{inbox.length} pending</div>
        </div>
        <div className={styles.sheetBody}>
          {inbox.length ? (
            inbox.map((r) => (
              <div className={styles.qrow} key={r.id}>
                <div className={styles.qrowT}>{r.title}</div>
                <div className={styles.qrowS}>
                  {r.worker} · {r.when}
                </div>
                <div className={styles.qrowFoot}>
                  <span className={`${styles.estatus} ${styles.stProg}`}>Pending</span>
                  <button
                    className={styles.queueBtn}
                    type="button"
                    onClick={() => setInbox((prev) => prev.filter((x) => x.id !== r.id))}
                  >
                    <Icon id="i-check" />Mark accepted
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className={styles.qempty}>
              <div className={styles.emptyT}>Everyone has confirmed</div>
              <div className={styles.emptyS}>All crew assignments have been accepted.</div>
            </div>
          )}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setInboxOpen(false)}>
          Close
        </button>
      </div>

      {/* ============ UNSCHEDULED TRAY SHEET ============
          The desktop aside was a drag source. There is no drag worth defending
          on touch, so each job carries the action instead: Schedule opens the
          create form pre-filled on the selected day, and creating consumes the
          job off this list. */}
      <div
        className={`${styles.sheet} ${trayOpen ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Unscheduled work"
        aria-hidden={!trayOpen}
        {...trayDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...trayDrag.handleProps} />
        <div className={styles.sheetHead} {...trayDrag.handleProps}>
          <div className={styles.sheetKicker}>Unscheduled · drop onto a day</div>
          <div className={styles.sheetTitle}>{tray.length} waiting</div>
        </div>
        <div className={styles.sheetBody}>
          {tray.length ? (
            tray.map((j) => (
              <div className={styles.qrow} key={j.id}>
                <div className={styles.qrowT}>{j.title}</div>
                <div className={styles.qrowS}>
                  {j.client} · {j.city}
                </div>
                <div className={styles.qrowFoot}>
                  <span className={styles.qrowEst}>Est. {j.duration}</span>
                  <button className={styles.queueBtn} type="button" onClick={() => openNew(sel, j)}>
                    <Icon id="i-plus" />Schedule
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className={styles.qempty}>
              <div className={styles.emptyT}>Everything is scheduled</div>
              <div className={styles.emptyS}>No unscheduled work is waiting on a date.</div>
            </div>
          )}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setTrayOpen(false)}>
          Close
        </button>
      </div>

      {/* ============ CREATE / EDIT SHEET ============ */}
      <div
        className={`${styles.sheet} ${formOpen ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcalFormTitle"
        aria-hidden={!formOpen}
        {...formDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...formDrag.handleProps} />
        <div className={styles.sheetHead} {...formDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {form.mode === "edit" ? "Delivery / edit event" : "Delivery / new record"}
          </div>
          <div className={styles.sheetTitle} id="mcalFormTitle">
            {form.mode === "edit" ? KIND_LABEL[form.kind] : "New event"}
          </div>
        </div>
        <form className={`${styles.sheetBody} ${styles.formBody}`} id="mcalForm" noValidate onSubmit={submitForm}>
          {/* The kind decides which fields exist, so it is only offered while
              creating — the desktop detail sheet does not re-kind an event
              either. */}
          {form.mode === "new" ? (
            <div className={styles.fld}>
              <span className={styles.fldLbl}>Kind</span>
              <div className={styles.kinds}>
                {(["job", "appointment", "blocked"] as CalKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`${styles.kindBtn} ${form.kind === k ? styles.active : ""}`}
                    aria-pressed={form.kind === k}
                    onClick={() => patchForm({ kind: k, link: null })}
                  >
                    <Icon id={KIND_IC[k]} />
                    {k === "job" ? "Job" : k === "appointment" ? "Visit" : "Blocked"}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.metaBox}>
              {(() => {
                const e = form.id ? data.find((x) => x.id === form.id) : null;
                if (!e) return null;
                // Same builder the detail sheet uses. Notes are NOT appended
                // here — the editable field for them is a few rows down.
                return metaRowsFor(e).map(([l, v]) => (
                  <div className={styles.metaRow} key={l}>
                    <span className={styles.metaL}>{l}</span>
                    <span className={styles.metaV}>{v}</span>
                  </div>
                ));
              })()}
            </div>
          )}

          <div className={`${styles.fld} ${titleErr ? styles.invalid : ""}`}>
            <label className={styles.fldLbl} htmlFor="mcalTitle">
              Title<span className={styles.req}>*</span>
            </label>
            <input
              ref={titleRef}
              className={styles.pinput}
              id="mcalTitle"
              name="title"
              type="text"
              placeholder={
                form.kind === "job"
                  ? "Roof tear-off — 4812 Maple Ave"
                  : form.kind === "appointment"
                    ? "Estimate visit — S. Rao"
                    : "Shop maintenance"
              }
              autoComplete="off"
              value={form.title}
              aria-invalid={titleErr}
              aria-describedby={titleErr ? "mcalTitleErr" : undefined}
              onChange={(e) => {
                patchForm({ title: e.target.value });
                if (e.target.value.trim()) setTitleErr(false);
              }}
            />
            {titleErr ? (
              <span className={styles.fldErr} id="mcalTitleErr">
                Give the event a title
              </span>
            ) : null}
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mcalDate">Date</label>
            <input
              className={styles.pinput}
              id="mcalDate"
              name="date"
              type="date"
              value={form.date}
              onChange={(e) => patchForm({ date: e.target.value })}
            />
          </div>

          <div className={styles.fld}>
            <span className={styles.fldLbl}>Span</span>
            <button
              className={styles.fchk}
              type="button"
              aria-pressed={form.allDay}
              onClick={() => patchForm({ allDay: !form.allDay })}
            >
              <span className={styles.fchkBox}>
                <Icon id="i-check" />
              </span>
              All day
              <span className={styles.fchkSub}>no clock</span>
            </button>
          </div>

          {!form.allDay ? (
            <div className={styles.pair}>
              <div className={styles.fld}>
                <label className={styles.fldLbl} htmlFor="mcalStart">Start</label>
                <input
                  className={styles.pinput}
                  id="mcalStart"
                  name="start"
                  type="time"
                  step={900}
                  value={form.startT}
                  onChange={(e) => patchForm({ startT: e.target.value })}
                />
              </div>
              <div className={styles.fld}>
                <label className={styles.fldLbl} htmlFor="mcalEnd">End</label>
                <input
                  className={styles.pinput}
                  id="mcalEnd"
                  name="end"
                  type="time"
                  step={900}
                  value={form.endT}
                  onChange={(e) => patchForm({ endT: e.target.value })}
                />
                <span className={styles.fldHint}>Left behind the start, it becomes a 2-hour span.</span>
              </div>
            </div>
          ) : null}

          {form.kind === "job" ? (
            <div className={styles.fld}>
              <span className={styles.fldLbl}>Status</span>
              <div className={styles.seg}>
                {JOB_STATUSES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className={`${styles.segBtn} ${form.status === s.value ? styles.active : ""}`}
                    aria-pressed={form.status === s.value}
                    onClick={() => patchForm({ status: s.value })}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {form.kind !== "blocked" ? (
            <div className={styles.fld}>
              <span className={styles.fldLbl}>Linked record</span>
              <div className={styles.linkBox}>
                <button
                  className={styles.linkBtn}
                  type="button"
                  aria-expanded={linkOpen}
                  onClick={() => setLinkOpen((v) => !v)}
                >
                  <Icon id="i-file" />
                  <span className={`${styles.linkVal} ${linkPick ? "" : styles.linkNone}`}>
                    {linkPick ? `${LINK_LABEL[linkPick.kind]} · ${linkPick.title}` : "Not linked"}
                  </span>
                  <Icon id="i-chev" className={`${styles.ic} ${styles.linkCaret}`} />
                </button>
                {linkOpen ? (
                  <div className={styles.linkPanel}>
                    <label className={styles.linkSrch}>
                      <Icon id="i-search" />
                      <input
                        className={styles.srchInput}
                        type="search"
                        value={linkQuery}
                        placeholder="Search records…"
                        autoComplete="off"
                        aria-label="Search records to link"
                        onChange={(e) => setLinkQuery(e.target.value)}
                      />
                    </label>
                    <div className={styles.linkList}>
                      <button
                        className={styles.linkRow}
                        type="button"
                        onClick={() => {
                          patchForm({ link: null });
                          setLinkOpen(false);
                        }}
                      >
                        <span className={styles.linkKind}>None</span>
                        <span className={styles.linkRowT}>Not linked</span>
                        <span className={styles.linkRowM}>Stand-alone entry on the schedule</span>
                      </button>
                      {linkRows.map((o) => (
                        <button
                          key={o.id}
                          className={styles.linkRow}
                          type="button"
                          onClick={() => {
                            patchForm({ link: o.id });
                            setLinkOpen(false);
                          }}
                        >
                          <span className={styles.linkKind}>{LINK_LABEL[o.kind]}</span>
                          <span className={styles.linkRowT}>{o.title}</span>
                          <span className={styles.linkRowM}>
                            {o.client} · {o.meta}
                          </span>
                        </button>
                      ))}
                      {linkRows.length === 0 ? (
                        <div className={styles.note}>No record matches that search</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className={styles.fld}>
            <span className={styles.fldLbl}>Crew</span>
            <div className={styles.crewList}>
              {workersData.map((w) => (
                <button
                  key={w.id}
                  className={styles.fchk}
                  type="button"
                  aria-pressed={form.crew.includes(w.id)}
                  onClick={() => toggleCrew(w.id)}
                >
                  <span className={styles.fchkBox}>
                    <Icon id="i-check" />
                  </span>
                  {w.name}
                  <span className={styles.fchkSub}>{w.role}</span>
                </button>
              ))}
            </div>
            {form.kind === "blocked" ? (
              <span className={styles.fldHint}>
                Pick a crew member to block <b>their</b> time. Leave it empty and the block is{" "}
                <b>yours</b> ({OWNER.name}).
              </span>
            ) : null}
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mcalNotes">Notes</label>
            <textarea
              className={styles.parea}
              id="mcalNotes"
              name="notes"
              rows={3}
              placeholder="Anything the crew should know"
              value={form.notes}
              onChange={(e) => patchForm({ notes: e.target.value })}
            />
          </div>
        </form>
        {/* The submit pair sits in a beige foot OUTSIDE the scrolling body and
            reaches the form with form=. */}
        <div className={styles.formFoot}>
          <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => setFormOpen(false)}>
            Cancel
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" form="mcalForm">
            <Icon id="i-check" />
            {form.mode === "edit" ? "Save changes" : form.kind === "blocked" ? "Block time" : "Create event"}
          </button>
        </div>
      </div>
    </div>
  );
}
