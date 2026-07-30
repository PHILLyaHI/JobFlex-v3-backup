"use client";

// MOBILE HIRE (mobile-hire-v2) — Blueprint system, handheld build.
//
// Fourth sibling to mobile-v2 (Overview), mobile-proposals-v2 (Proposals) and
// mobile-clients-v2 (Clients). Tokens, palette, type scale and Motion System
// "Balanced" are the reference dashboard's; the shell (topbar / hamburger
// drawer / sprite) is the shared MobileNav, so the handheld surfaces are one
// product.
//
// Every component of the desktop hire sheet is covered:
//  · both desktop ROUTES — /dashboard/hire/hub and /dashboard/hire — as two
//    tabs with live counts and a sliding rule, so neither is buried
//  · the "Preview" hub flag, with the sentence the desktop chip only implies
//  · both marketplace doors (kicker / icon / title / body / CTA) + the 700ms
//    tap flash the donor gives them
//  · the "Your activity" card — all three tallies, now WITH the fixture's hint
//    strings, which the desktop renderer never emitted
//  · the "Go deeper" list — all four rows, with the fixture's subs and a Soon
//    tag on the three unbuilt ones; the first still switches to the pipeline
//  · computed masthead (one numeral + mono kicker + EXACTLY two annotations)
//  · the four-column kanban re-cut as row cards, with all four stage badges
//  · the "⋮" sheet: 6 tonal rows, contextual stage move, disabled rows driven
//    by real fixture state, and a danger row
//  · the candidate panel AND the add-applicant form as one bottom sheet, with
//    required-field validation, the drawn source picker and the drawn stage
//    picker (the donor's .pipe)
//  · pager, and BOTH empty states (no applicants / no matches)
//
// What changes versus the desktop sheet, and why:
//  · The 4-column kanban cannot survive 320px. Rather than a horizontal board
//    that has to be swiped blind, the stages become the ONE filter dropdown and
//    each candidate becomes a row card — so every stage is one tap away and the
//    row still says which stage it is in. Drag-and-drop (and the desktop's
//    tap-a-card-then-tap-a-column fallback) becomes a single tap in the row
//    sheet: "Move to interviewing" / "Mark hired" / "Reopen as applied".
//  · The candidate drawer becomes a bottom sheet (no hover on touch, and
//    CLAUDE.md prefers sheets over modals).
//  · A search box is added: the fixture grows from the add form, and paging a
//    funnel to reach a named candidate is the whole job on a phone. It filters
//    the same fixture client-side — no new endpoint.
//  · The board pages at 6 (the desktop board pages not at all): a handheld row
//    is three lines tall.
//  · The desktop back-link is gone — the tab strip replaces it — and the tally
//    card's "View all" stub is dropped: it was a no-op whose destination is
//    already a row in "Go deeper".
//
// Content is the donor demo fixture by design: the data layer is out of scope
// until the layout is signed off.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./mobile-hire.module.css";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import {
  ALL,
  APPLICANTS_SEED,
  AP_SEQ_START,
  HK_COLUMNS,
  HUB_DOORS,
  HUB_LINKS,
  HUB_TALLY,
  PAGE_SIZE,
  SOURCES,
  matchesQuery,
  matchesStage,
  monogram,
  stageCount,
  stageLabel,
  type Applicant,
  type HireColumnKey,
  type StageKey,
} from "./hire-data";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type TabKey = "pipeline" | "market";

const TABS: { key: TabKey; label: string }[] = [
  { key: "pipeline", label: "Applicants" },
  { key: "market", label: "Marketplace" },
];

/** Stage badges need the 3-tone treatment (base border / soft fill / base
 *  text), so the donor's single `tone` string becomes a class per stage. */
const STAGE_CLS: Record<HireColumnKey, string> = {
  APPLIED: styles.hstageApplied,
  INTERVIEWING: styles.hstageInterviewing,
  HIRED: styles.hstageHired,
  REJECTED: styles.hstageRejected,
};

/** The one-tap stage move that replaces drag-and-drop, per current stage. For a
 *  HIRED candidate the next step is the donor's own "Convert to worker". */
const ADVANCE: Record<
  HireColumnKey,
  { icon: string; tone: string; title: string; sub: string; next: HireColumnKey }
> = {
  APPLIED: {
    icon: "i-arrow",
    tone: styles.hmiWarn,
    title: "Move to interviewing",
    sub: "Next step in the funnel",
    next: "INTERVIEWING",
  },
  INTERVIEWING: {
    icon: "i-check",
    tone: styles.hmiOk,
    title: "Mark hired",
    sub: "Moves into Hired",
    next: "HIRED",
  },
  HIRED: {
    icon: "i-hardhat",
    tone: styles.hmiOk,
    title: "Convert to worker",
    sub: "Adds them to the crew",
    next: "HIRED",
  },
  REJECTED: {
    icon: "i-rotate",
    tone: styles.hmiBp,
    title: "Reopen as applied",
    sub: "Back to the top of the funnel",
    next: "APPLIED",
  },
};

function Icon({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ?? styles.ic} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

/** 750ms easeOutCubic. tabular-nums keep the digit columns from jumping. This
 *  page counts people, not money, so there is no currency prefix. */
function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.textContent = String(value);
      return;
    }
    let raf = 0;
    let t0: number | null = null;
    const frame = (t: number) => {
      if (t0 === null) t0 = t;
      const pr = Math.min(1, (t - t0) / 750);
      el.textContent = String(Math.round(value * (1 - Math.pow(1 - pr, 3))));
      if (pr < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <div ref={ref} className={className}>
      {value}
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

export function MobileHire() {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  /* Cloned per mount: the row sheet and the form mutate this list, and the
     donor's seed must not carry those mutations into the next mount. */
  const [data, setData] = useState<Applicant[]>(() => APPLICANTS_SEED.map((a) => ({ ...a })));
  const apSeq = useRef(AP_SEQ_START);

  const [tab, setTab] = useState<TabKey>("pipeline");
  const [stage, setStage] = useState<StageKey>(ALL);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [landedId, setLandedId] = useState<string | null>(null);
  /** The donor flashes a marketplace door for 700ms instead of navigating —
      nothing behind those doors is live yet. */
  const [tapped, setTapped] = useState<string | null>(null);

  /* ---- candidate form: serves BOTH the donor's add form and its detail
          panel, so one sheet covers both ---- */
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    role: "",
    email: "",
    phone: "",
    source: SOURCES[0],
    notes: "",
  });
  const [stageDraft, setStageDraft] = useState<HireColumnKey>("APPLIED");
  const [nameErr, setNameErr] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const filterRef = useRef<HTMLDivElement>(null);

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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("resize", apply);
      document.documentElement.style.removeProperty("--app-h");
      document.body.style.overflow = prevOverflow;
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
      styles.btn, styles.htab, styles.ddBtn, styles.ddItem, styles.pagerBtn,
      styles.hmenuItem, styles.sheetCancel, styles.hrowOpen, styles.hemptyA,
      styles.srchX, styles.hdoor, styles.hlink, styles.pickBtn,
    ].map((c) => `.${c}`).join(", ");
    const el = (e.target as HTMLElement).closest<HTMLElement>(sel);
    if (!el) return;
    el.classList.remove(styles.pressed);
    void el.offsetWidth;
    el.classList.add(styles.pressed);
    el.addEventListener("animationend", () => el.classList.remove(styles.pressed), { once: true });
  }, []);

  /* ---------- Esc closes what the PAGE owns -----------------------------
     The drawer is NOT listed: MobileNav handles its own Escape, and it only
     binds while open, so the two listeners cannot both claim one key press. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (filterOpen) setFilterOpen(false);
      else if (formOpen) setFormOpen(false);
      else if (sheetId) setSheetId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filterOpen, formOpen, sheetId]);

  /* ---------- Filter dropdown: close on outside tap -------------------- */
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [filterOpen]);

  /* ---------- Paging returns you to the top of the funnel ---------------
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

  /* ---------- The donor's 700ms door flash ------------------------------ */
  useEffect(() => {
    if (!tapped) return;
    const t = window.setTimeout(() => setTapped(null), 700);
    return () => clearTimeout(t);
  }, [tapped]);

  /* ---------- derived ------------------------------------------------- */
  const visible = useMemo(
    () => data.filter((a) => matchesStage(a, stage) && matchesQuery(a, query)),
    [data, stage, query],
  );

  /* Masthead — all three numbers computed, so a stage move or a delete moves
     them. "Open" is the pair of stages that still need a decision. */
  const openCount = useMemo(
    () => data.filter((a) => a.status === "APPLIED" || a.status === "INTERVIEWING").length,
    [data],
  );
  const hiredCount = useMemo(() => data.filter((a) => a.status === "HIRED").length, [data]);

  /* The marketplace tab's badge is the fixture's own activity total — three
     zeros today, which is exactly the story its tally tells. */
  const marketTotal = useMemo(
    () => HUB_TALLY.reduce((sum, t) => sum + (parseInt(t.value, 10) || 0), 0),
    [],
  );
  const tabCount: Record<TabKey, number> = { pipeline: data.length, market: marketTotal };

  const options = useMemo<{ k: StageKey; l: string }[]>(
    () => [
      { k: ALL, l: stageLabel(ALL) },
      ...HK_COLUMNS.map((c) => ({ k: c.key as StageKey, l: c.label })),
    ],
    [],
  );

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const slice = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const sheetApplicant = sheetId === null ? null : (data.find((a) => a.id === sheetId) ?? null);
  const tabIndex = TABS.findIndex((t) => t.key === tab);

  const resetFilters = () => {
    setStage(ALL);
    setQuery("");
    setPage(1);
  };

  /* ---------- row sheet ------------------------------------------------ */
  const menuRows = useMemo<MenuRow[]>(() => {
    const a = sheetApplicant;
    if (!a) return [];
    const adv = ADVANCE[a.status];
    return [
      { act: "open", icon: "i-user", tone: styles.hmiBp, title: "Open candidate",
        sub: "Role, contact and notes" },
      { act: "call", icon: "i-phone", tone: styles.hmiSky, title: "Call",
        sub: a.phone ?? "No phone on file", disabled: !a.phone },
      { act: "mail", icon: "i-mail", tone: styles.hmiOk, title: "Send email",
        sub: a.email ?? "No email on file", disabled: !a.email },
      { act: "advance", icon: adv.icon, tone: adv.tone, title: adv.title, sub: adv.sub },
      { act: "reject", icon: "i-x", title: "Reject candidate",
        sub: a.status === "REJECTED" ? "Already rejected" : "Moves into Rejected",
        disabled: a.status === "REJECTED" },
      { act: "del", icon: "i-trash", tone: styles.hmiDanger, title: "Delete applicant",
        sub: "Removes the record permanently", danger: true },
    ];
  }, [sheetApplicant]);

  const openEdit = (a: Applicant) => {
    setEditId(a.id);
    setForm({
      name: a.name,
      role: a.role,
      email: a.email ?? "",
      phone: a.phone ?? "",
      source: a.source ?? "Other",
      notes: a.notes,
    });
    setStageDraft(a.status);
    setNameErr(false);
    setFormOpen(true);
  };

  const runMenu = (act: string) => {
    const a = sheetApplicant;
    setSheetId(null);
    if (!a) return;
    if (act === "open") {
      openEdit(a);
      return;
    }
    if (act === "del") {
      setData((prev) => prev.filter((x) => x.id !== a.id));
      return;
    }
    if (act === "advance") {
      const next = ADVANCE[a.status].next;
      setData((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: next } : x)));
      setLandedId(a.id);
      return;
    }
    if (act === "reject") {
      setData((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: "REJECTED" } : x)));
      setLandedId(a.id);
      return;
    }
    // "call" / "mail" are the contact actions: nothing to mutate, and the row
    // already carries the number the sheet just showed.
    setLandedId(a.id);
  };

  /* ---------- candidate form ------------------------------------------- */
  const openAdd = () => {
    setEditId(null);
    setForm({ name: "", role: "", email: "", phone: "", source: SOURCES[0], notes: "" });
    setStageDraft("APPLIED");
    setNameErr(false);
    setFormOpen(true);
    // Focus after the slide settles — focusing mid-transform makes the keyboard
    // fight the animation.
    window.setTimeout(() => nameRef.current?.focus(), prefersReducedMotion() ? 0 : 320);
  };

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setNameErr(true);
      nameRef.current?.focus();
      return;
    }
    const email = form.email.trim() || null;
    const phone = form.phone.trim() || null;
    const source = form.source || "Other";
    const notes = form.notes.trim();

    if (editId) {
      setData((prev) =>
        prev.map((x) =>
          x.id === editId
            ? { ...x, name, role: form.role.trim() || "Crew", email, phone, source, status: stageDraft, notes }
            : x,
        ),
      );
      setLandedId(editId);
    } else {
      apSeq.current += 1;
      const rec: Applicant = {
        id: `a${apSeq.current}`,
        name,
        role: form.role.trim() || "Crew",
        email,
        phone,
        source,
        status: "APPLIED",
        age: "now",
        notes,
      };
      setData((prev) => [rec, ...prev]);
      resetFilters();
      setTab("pipeline");
      setLandedId(rec.id);
    }
    setFormOpen(false);
  };

  const anyOverlay = Boolean(sheetApplicant) || formOpen;

  return (
    <div className={styles.app} onClick={onRootClick}>

      {/* Shared handheld nav: topbar + drawer + sprite. Owns its own open
          state, so the page holds none. */}
      <MobileNav />

      {/* ============ SCROLLER ============ */}
      <main className={styles.scroll} ref={scrollRef}>
        <div className={styles.content} ref={contentRef}>
          {/* PAGE HEAD */}
          <div className={styles.pageHead}>
            <div className={styles.kicker}>Workforce</div>
            <h1 className={styles.pageTitle}>Hire &amp; Work</h1>
            <div className={styles.pageActions}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={openAdd}>
                <Icon id="i-plus" />Add applicant
              </button>
            </div>
          </div>

          {/* MASTHEAD — one numeral + mono kicker + EXACTLY two annotations */}
          <div className={styles.hmast}>
            <div className={styles.hmastTop}>
              <div className={styles.hmastLbl}>
                Hiring pipeline · open
                <span className={styles.hmastRule} />
              </div>
              <CountUp value={openCount} className={styles.hmastVal} />
            </div>
            <div className={styles.hmastCnt}>
              <div className={styles.hmastSub}>
                <div className={styles.hmastSubL}>Candidates</div>
                <div className={styles.hmastSubV}>{data.length}</div>
              </div>
              <div className={styles.hmastSub}>
                <div className={styles.hmastSubL}>Hired</div>
                <div className={styles.hmastSubV}>{hiredCount}</div>
              </div>
            </div>
          </div>

          {/* TABS — the desktop's two routes, neither one buried */}
          <div className={styles.htabs}>
            <span className={styles.htabInd} style={{ transform: `translateX(${tabIndex * 100}%)` }} />
            {TABS.map((t) => (
              <button key={t.key} className={`${styles.htab} ${tab === t.key ? styles.active : ""}`}
                type="button" aria-current={tab === t.key ? "page" : undefined}
                onClick={() => setTab(t.key)}>
                {t.label}
                <span className={styles.htabCount}>{tabCount[t.key]}</span>
              </button>
            ))}
          </div>

          {/* ============ TAB: APPLICANTS ============ */}
          {tab === "pipeline" && (
            <div className={styles.find}>
              <label className={styles.srch}>
                <Icon id="i-search" />
                <input
                  className={styles.srchInput}
                  type="search"
                  value={query}
                  placeholder="Search name, role or source…"
                  autoComplete="off"
                  aria-label="Search candidates"
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

              {/* The four kanban columns as ONE dropdown. A chip rail of four
                  stages plus counts does not survive 320px. */}
              <div className={`${styles.dd} ${filterOpen ? styles.open : ""}`} ref={filterRef}>
                <button className={styles.ddBtn} type="button" aria-haspopup="listbox"
                  aria-expanded={filterOpen} onClick={() => setFilterOpen((v) => !v)}>
                  <Icon id="i-filter" />
                  Filter
                  <span className={styles.ddValue} data-st={stage}>
                    {stageLabel(stage)} · {stageCount(data, stage)}
                  </span>
                  <Icon id="i-chev" className={`${styles.ic} ${styles.ddCaret}`} />
                </button>
                <div className={styles.ddMenu} role="listbox">
                  {options.map((o) => (
                    <button key={o.k} className={`${styles.ddItem} ${stage === o.k ? styles.active : ""}`}
                      type="button" role="option" aria-selected={stage === o.k}
                      onClick={() => { setStage(o.k); setPage(1); setFilterOpen(false); }}>
                      {o.l}
                      <span className={styles.ddCount}>{stageCount(data, o.k)}</span>
                      {stage === o.k ? <Icon id="i-check" /> : null}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "pipeline" && (
            visible.length === 0 ? (
              <div className={styles.hempty}>
                {data.length === 0 ? (
                  <>
                    <div className={styles.hemptyT}>No applicants yet</div>
                    <div className={styles.hemptyS}>
                      Add candidates manually or wire your job-board integrations later.
                    </div>
                    <button className={styles.hemptyA} type="button" onClick={openAdd}>
                      <Icon id="i-plus" />Add first applicant
                    </button>
                  </>
                ) : (
                  <>
                    <div className={styles.hemptyT}>No matches</div>
                    <div className={styles.hemptyS}>
                      No candidate matches that search and stage.
                    </div>
                    <button className={styles.hemptyA} type="button" onClick={resetFilters}>
                      <Icon id="i-x" />Clear filters
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className={styles.hbook}>
                {slice.map((a, i) => (
                  <div
                    key={a.id}
                    className={`${styles.hrow} ${styles.rowIn} ${landedId === a.id ? styles.landed : ""}`}
                    style={{ animationDelay: `${i * 45}ms` }}
                  >
                    <span className={styles.hav}>{monogram(a.name)}</span>
                    <div className={styles.hname}>{a.name}</div>
                    <button className={styles.hrowOpen} type="button"
                      aria-label={`Actions for ${a.name}`} onClick={() => setSheetId(a.id)}>
                      <Icon id="i-dots" />
                    </button>
                    <div className={styles.hwhere}>
                      {a.role}{a.source ? ` · ${a.source}` : ""}
                    </div>
                    <div className={styles.hrowFoot}>
                      <span className={`${styles.hstage} ${STAGE_CLS[a.status]}`}>
                        {stageLabel(a.status)}
                      </span>
                      <span className={styles.hrowFigs}>
                        {/* Reachability, not decoration: a missing icon is why
                            the sheet's Call row is disabled. */}
                        <span className={styles.hreach}>
                          {a.email ? <Icon id="i-msg" /> : null}
                          {a.phone ? <Icon id="i-phone" /> : null}
                        </span>
                        <span className={styles.hage}>{a.age}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === "pipeline" && visible.length > PAGE_SIZE ? (
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

          {/* ============ TAB: MARKETPLACE ============ */}
          {tab === "market" && (
            <div className={styles.hnote}>
              <span className={styles.hflag}>
                <span className={styles.hflagDot} />Preview
              </span>
              <span className={styles.hnoteTxt}>
                Marketplace is not live yet — both doors below are a walkthrough.
              </span>
            </div>
          )}

          {tab === "market" && (
            <div className={styles.hcard}>
              {HUB_DOORS.map((d) => (
                <button key={d.title}
                  className={`${styles.hdoor} ${tapped === d.title ? styles.tapped : ""}`}
                  type="button" onClick={() => setTapped(d.title)}>
                  <span className={styles.hdoorKicker}>{d.kicker}</span>
                  <span className={styles.hdoorIc}><Icon id={d.icon} /></span>
                  <span className={styles.hdoorT}>{d.title}</span>
                  <span className={styles.hdoorB}>{d.body}</span>
                  <span className={styles.hdoorCta}>
                    {d.cta}<Icon id="i-arrow" />
                  </span>
                </button>
              ))}
            </div>
          )}

          {tab === "market" && (
            <div className={styles.hcard}>
              <div className={styles.hcardHead}>
                <div className={styles.hcardTitle}>Your activity</div>
              </div>
              {/* The desktop renderer drops the fixture's hint strings even
                  though its stylesheet has a class for them. Three bare zeros
                  need the sentence more on a phone than anywhere. */}
              {HUB_TALLY.map((t) => (
                <div className={styles.htallyRow} key={t.label}>
                  <div className={styles.htallyTxt}>
                    <div className={styles.htallyL}>{t.label}</div>
                    <div className={styles.htallyH}>{t.hint}</div>
                  </div>
                  <div className={styles.htallyV}>{t.value}</div>
                </div>
              ))}
            </div>
          )}

          {tab === "market" && (
            <div className={styles.hcard}>
              <div className={styles.hcardHead}>
                <div className={styles.hcardTitle}>Go deeper</div>
              </div>
              {HUB_LINKS.map((l) => (
                <button key={l.label}
                  className={`${styles.hlink} ${tapped === l.label ? styles.tapped : ""}`}
                  type="button"
                  onClick={() => (l.goto ? setTab("pipeline") : setTapped(l.label))}>
                  <span className={styles.hlinkIc}><Icon id={l.icon} /></span>
                  <span className={styles.hlinkTxt}>
                    <span className={styles.hlinkT}>{l.label}</span>
                    <span className={styles.hlinkS}>{l.sub}</span>
                  </span>
                  {l.soon ? (
                    <span className={styles.hsoon}>Soon</span>
                  ) : (
                    <Icon id="i-arrow" className={`${styles.ic} ${styles.hlinkGo}`} />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ============ SHEET SCRIM (shared by both sheets) ============ */}
      <div
        className={`${styles.scrim} ${anyOverlay ? styles.on : ""}`}
        onClick={() => { setSheetId(null); setFormOpen(false); }}
        aria-hidden="true"
      />

      {/* ============ ROW ACTIONS SHEET ============ */}
      <div className={`${styles.sheet} ${sheetApplicant ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-label="Candidate actions" aria-hidden={!sheetApplicant}>
        <div className={styles.sheetGrab} />
        <div className={styles.sheetHead}>
          <div className={styles.sheetKicker}>
            {sheetApplicant
              ? `${sheetApplicant.role} · ${sheetApplicant.source ?? "Other"} · applied ${sheetApplicant.age}`
              : "Candidate · —"}
          </div>
          <div className={styles.sheetTitle}>{sheetApplicant?.name ?? "Actions"}</div>
        </div>
        <div className={styles.sheetBody}>
          {menuRows.map((r) => (
            <button key={r.act} type="button" disabled={r.disabled}
              className={`${styles.hmenuItem} ${r.danger ? styles.hmenuItemDanger : ""}`}
              onClick={() => runMenu(r.act)}>
              <span className={`${styles.hmiIc} ${r.tone ?? ""}`}><Icon id={r.icon} /></span>
              <span>
                <span className={styles.hmenuItemT}>{r.title}</span>
                <span className={styles.hmenuItemS}>{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setSheetId(null)}>Cancel</button>
      </div>

      {/* ============ CANDIDATE SHEET — the donor's add form AND its
          detail panel, one sheet. Role / Email / Phone / Source are
          editable fields rather than read-only rows, and "Applied" rides
          the sheet kicker. ============ */}
      <div className={`${styles.sheet} ${formOpen ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-labelledby="mhFormTitle" aria-hidden={!formOpen}>
        <div className={styles.sheetGrab} />
        <div className={styles.sheetHead}>
          <div className={styles.sheetKicker}>
            {editId
              ? `Candidate · applied ${data.find((a) => a.id === editId)?.age ?? "—"}`
              : "Workforce / new candidate"}
          </div>
          <div className={styles.sheetTitle} id="mhFormTitle">
            {editId ? form.name || "Candidate" : "Add applicant"}
          </div>
        </div>
        <form className={`${styles.sheetBody} ${styles.formBody}`} id="mhForm" noValidate onSubmit={submitForm}>
          <div className={`${styles.fld} ${nameErr ? styles.invalid : ""}`}>
            <label className={styles.fldLbl} htmlFor="mhName">
              Full name<span className={styles.req}>*</span>
            </label>
            <input ref={nameRef} className={styles.pinput} id="mhName" name="name" type="text"
              placeholder="Casey Stone" autoComplete="off" value={form.name}
              aria-invalid={nameErr} aria-describedby={nameErr ? "mhNameErr" : undefined}
              onChange={(e) => {
                setForm((f) => ({ ...f, name: e.target.value }));
                if (e.target.value.trim()) setNameErr(false);
              }} />
            {nameErr ? <span className={styles.fldErr} id="mhNameErr">Enter a candidate name</span> : null}
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mhRole">Role</label>
            <input className={styles.pinput} id="mhRole" name="role" type="text"
              placeholder="Roofer, Estimator, Foreman…" autoComplete="off" value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} />
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mhEmail">Email</label>
            <input className={styles.pinput} id="mhEmail" name="email" type="email"
              placeholder="casey@example.com" autoComplete="off" value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mhPhone">Phone</label>
            <input className={styles.pinput} id="mhPhone" name="phone" type="tel"
              placeholder="(425) 555-0199" autoComplete="off" value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            <span className={styles.fldHint}>
              A candidate with no number cannot be called from the actions sheet.
            </span>
          </div>

          {/* Drawn pickers, never a native select: the native control cannot
              carry the 2px frame, and it renders differently on every platform.
              ONE class set for both pickers — parallel style sets for identical
              blocks are how typography drifts. */}
          <div className={styles.fld}>
            <span className={styles.fldLbl}>Source</span>
            <div className={styles.pick} role="group" aria-label="Source">
              {SOURCES.map((s) => (
                <button key={s} className={`${styles.pickBtn} ${form.source === s ? styles.on : ""}`}
                  type="button" aria-pressed={form.source === s}
                  onClick={() => setForm((f) => ({ ...f, source: s }))}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* The donor's .pipe status picker — detail panel only. A new
              applicant always starts in Applied, exactly as the donor does. */}
          {editId ? (
            <div className={styles.fld}>
              <span className={styles.fldLbl}>Pipeline status</span>
              <div className={styles.pick} role="group" aria-label="Pipeline status">
                {HK_COLUMNS.map((c) => (
                  <button key={c.key} className={`${styles.pickBtn} ${stageDraft === c.key ? styles.on : ""}`}
                    type="button" aria-pressed={stageDraft === c.key}
                    onClick={() => setStageDraft(c.key)}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mhNotes">Notes</label>
            <textarea className={styles.parea} id="mhNotes" name="notes" rows={3}
              placeholder="Years of experience, specialties, schedule constraints…"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </form>
        {/* The submit pair sits in a beige foot OUTSIDE the scrolling body, so it
            is reachable without scrolling the form to its end. */}
        <div className={styles.formFoot}>
          <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => setFormOpen(false)}>
            Cancel
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" form="mhForm">
            <Icon id="i-check" />{editId ? "Save candidate" : "Add applicant"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* The SVG sprite is NOT declared here: MobileNav renders the one shared set of
   48 symbols for every handheld surface, and two sprites in one document would
   give the same symbol id to two elements. This page references only ids from
   that set — i-plus, i-search, i-filter, i-chev/-chevl/-chevr, i-check, i-x,
   i-dots, i-user, i-users, i-userplus, i-mail, i-msg, i-phone, i-arrow,
   i-rotate, i-hardhat, i-trash, i-jobs, i-file, i-send. */
