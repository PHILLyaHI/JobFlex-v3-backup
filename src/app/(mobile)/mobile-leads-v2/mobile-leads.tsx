"use client";

// MOBILE LEADS (mobile-leads-v2) — Blueprint system, handheld build.
//
// Fourth sibling to /mobile-v2 (Overview), /mobile-proposals-v2 and
// /mobile-clients-v2. Tokens, palette, type scale, status tones and Motion
// System "Balanced" are the reference dashboard's; the page vocabulary
// (masthead, tab strip, one-dropdown filter, row cards, tonal menu boxes,
// bottom sheets) is lifted from those three so the four surfaces read as one
// product. The topbar and hamburger drawer come from the shared
// components/v3/mobile-shell/mobile-nav — this page ships no nav and no sprite.
//
// Built with the jobflex-page-styler skill (the visual system) and the
// mobile-app-ui-design skill (structure: thumb reach, ≥44px targets, sheets
// over modals, search over paging, initials over a repeated glyph). Where the
// two disagree the house system wins — hard 3px offset shadows, 2px radii and
// Inter 900 caps stay, rather than the mobile skill's soft-shadow / rounded-3xl
// defaults.
//
// EVERY region of the desktop leads sheet is covered:
//  · Pipeline head + the two primary actions (New lead / Import)
//  · computed masthead: one numeral, mono kicker, EXACTLY two annotations
//  · the tab row (All leads / Incoming) plus the Table↔Board view switch,
//    folded into one 3-segment tab strip with live counts and a sliding rule
//  · the search box
//  · the filter popover's Status list, as ONE dropdown whose 3×3 grid carries
//    all nine statuses with counts scoped to the current search
//  · the 6-column table, re-cut as row cards with initials avatars
//  · the seven-stage kanban, redrawn as vertical stage sections with tap-to-move
//  · the pager, and BOTH All-tab empty states (nothing yet / no matches)
//  · the Incoming inbox: platform offers with the live 24h window, routed
//    leads, accept / pass / decline, and its own empty state
//  · the row menu as a bottom sheet: 5 tonal boxes, two reachable disabled
//    rows, one danger row
//  · the delete-confirm dialog as a sheet
//  · the whole Import panel as a sheet: 3-method switch, manual form with
//    required-field validation, email paste + its parser, CSV dropzone, the
//    staged list with per-row remove, and the commit
//
// What changes versus the desktop sheet, and why:
//  · The 6-column table cannot survive 320px, so each record becomes a three
//    line row card — not a table with columns hidden.
//  · Source and Specialty were chip ROWS in the desktop popover. Chip rails do
//    not survive 320px, so they are answered by the search box instead (both
//    values are printed on the row card, so the target stays visible) and the
//    single dropdown is spent on Status — the dimension the board is built on.
//  · Drag & drop has no touch equivalent: a stage card is a button that opens
//    the stage picker, the pattern mobile-v2 already ships.
//  · Won and Lost do not take board sections. They are outcomes, not work; they
//    are tallied on the board's foot, filterable in All leads, and still
//    destinations in the move sheet.
//  · Page size 20 → 8: a handheld row is three lines tall.
//
// Content is the donor demo fixture by design: the data layer is out of scope
// until the layout is signed off.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./mobile-leads.module.css";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import {
  CSV_DEMO,
  LEADS_SEED,
  LEAD_STATUSES,
  ME,
  METHODS,
  OFFERS_SEED,
  PAGE_SIZE,
  SEQ_START,
  STAGES,
  TABS,
  WORKING_STAGES,
  clock,
  initials,
  isInPlay,
  isIncoming,
  matchesQuery,
  pct,
  srcLabel,
  statusLabel,
  type Lead,
  type MethodKey,
  type Offer,
  type StagedRow,
  type TabKey,
} from "./leads-data";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Status → badge tone. Kept beside the render so `styles.` stays literal. */
const STATUS_TONE: Record<string, string> = {
  NEW: styles.lstNew,
  ROUTED: styles.lstRouted,
  CLAIMED: styles.lstClaimed,
  CONTACTED: styles.lstContacted,
  QUOTED: styles.lstQuoted,
  WON: styles.lstWon,
  LOST: styles.lstLost,
  ARCHIVED: styles.lstArchived,
};

/** The trade tag's percentage doubles as a fill gauge, as on the desktop sheet. */
type GaugeStyle = React.CSSProperties & { "--p": string };
const gauge = (conf: number): GaugeStyle => ({ "--p": `${Math.round(conf * 100)}%` });

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

export function MobileLeads() {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  /* Runtime mutations clone the seeds per mount, so a remount starts from the
     donor's state instead of inheriting the last session's pipeline. */
  const seqRef = useRef(SEQ_START);

  const [data, setData] = useState<Lead[]>(() => LEADS_SEED.map((l) => ({ ...l })));
  const [offers, setOffers] = useState<Offer[]>(() => OFFERS_SEED.map((o) => ({ ...o })));

  const [tab, setTab] = useState<TabKey>("all");
  const [status, setStatus] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);

  const [sheetId, setSheetId] = useState<number | null>(null);
  const [moveId, setMoveId] = useState<number | null>(null);
  const [delId, setDelId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [method, setMethod] = useState<MethodKey>("manual");
  const [staged, setStaged] = useState<StagedRow[]>([]);
  const [landedId, setLandedId] = useState<number | null>(null);

  /* ---- add-leads form ---- */
  const [form, setForm] = useState({ name: "", email: "", phone: "", project: "" });
  const [nameErr, setNameErr] = useState(false);
  const [paste, setPaste] = useState("");

  /* ---------- a card leaves before the list re-flows --------------------
     The desktop fades an inbox card out over 220ms and mutates afterwards.
     The pending mutation rides a ref so the timer effect stays dependency-free. */
  const [outKey, setOutKey] = useState<string | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);
  const fadeOut = (key: string, apply: () => void) => {
    if (prefersReducedMotion()) {
      apply();
      return;
    }
    pendingRef.current = apply;
    setOutKey(key);
  };
  useEffect(() => {
    if (!outKey) return;
    const t = window.setTimeout(() => {
      const fn = pendingRef.current;
      pendingRef.current = null;
      setOutKey(null);
      fn?.();
    }, 220);
    return () => clearTimeout(t);
  }, [outKey]);

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
      styles.btn, styles.ptab, styles.ddBtn, styles.ddItem, styles.pagerBtn,
      styles.lmenuItem, styles.sheetOpt, styles.sheetCancel, styles.lrowOpen,
      styles.lcard, styles.imethBtn, styles.icardBtn, styles.lemptyA,
      styles.srchX, styles.stagedGo, styles.stX, styles.dropzone,
    ].map((c) => `.${c}`).join(", ");
    const el = (e.target as HTMLElement).closest<HTMLElement>(sel);
    if (!el) return;
    el.classList.remove(styles.pressed);
    void el.offsetWidth;
    el.classList.add(styles.pressed);
    el.addEventListener("animationend", () => el.classList.remove(styles.pressed), { once: true });
  }, []);

  /* ---------- Esc closes what the PAGE owns, topmost first --------------
     The drawer is NOT listed: MobileNav handles its own Escape and only binds
     while open, so the two listeners can never claim one key press. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (filterOpen) setFilterOpen(false);
      else if (delId !== null) setDelId(null);
      else if (moveId !== null) setMoveId(null);
      else if (addOpen) setAddOpen(false);
      else if (sheetId !== null) setSheetId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filterOpen, delId, moveId, addOpen, sheetId]);

  /* ---------- Filter dropdown: close on outside pointerdown ------------- */
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [filterOpen]);

  /* ---------- Paging returns you to the top of the ledger ---------------
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
    if (landedId === null) return;
    const t = window.setTimeout(() => setLandedId(null), 700);
    return () => clearTimeout(t);
  }, [landedId]);

  /* ---------- Offer window: counted down, as in the original ------------ */
  useEffect(() => {
    const id = window.setInterval(() => {
      setOffers((prev) => prev.map((o) => (o.mins > 0 ? { ...o, mins: o.mins - 1 } : o)));
    }, 30000);
    return () => clearInterval(id);
  }, []);

  /* ---------- derived --------------------------------------------------
     `pool` is everything the SEARCH keeps, before the status filter. The
     dropdown's per-status counts are taken from it, so each cell answers "how
     many would I get if I picked this" under the search already in play — a
     count taken from the whole dataset would lie the moment anything is typed. */
  const pool = useMemo(() => data.filter((l) => matchesQuery(l, query)), [data, query]);
  const visible = useMemo(
    () => pool.filter((l) => status === "ALL" || l.status === status),
    [pool, status],
  );
  const statusCount = useCallback(
    (st: string) => (st === "ALL" ? pool.length : pool.filter((l) => l.status === st).length),
    [pool],
  );

  const inPlay = useMemo(() => data.filter(isInPlay), [data]);
  const inbox = useMemo(() => data.filter(isIncoming), [data]);
  const won = useMemo(() => data.filter((l) => l.status === "WON").length, [data]);
  const lost = useMemo(() => data.filter((l) => l.status === "LOST").length, [data]);
  const unassigned = useMemo(() => data.filter((l) => !l.assignee).length, [data]);
  const winRate = won + lost === 0 ? 0 : Math.round((won / (won + lost)) * 100);

  const counts: Record<TabKey, number> = {
    all: data.length,
    pipeline: inPlay.length,
    incoming: inbox.length + offers.length,
  };
  const tabIndex = TABS.findIndex((t) => t.key === tab);

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const slice = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const sheetLead = sheetId === null ? null : (data.find((l) => l.id === sheetId) ?? null);
  const moveLeadRec = moveId === null ? null : (data.find((l) => l.id === moveId) ?? null);
  const delLead = delId === null ? null : (data.find((l) => l.id === delId) ?? null);

  const clearFilters = () => {
    setStatus("ALL");
    setQuery("");
    setPage(1);
  };

  /* ---------- mutations ------------------------------------------------ */
  /** The card lands at the END of its new stage — exactly where the desktop
      drop-slot sat — so the section it joins reads chronologically. */
  const moveTo = (id: number, st: string) => {
    setMoveId(null);
    setData((prev) => {
      const lead = prev.find((l) => l.id === id);
      if (!lead || lead.status === st) return prev;
      const rest = prev.filter((l) => l.id !== id);
      rest.push({ ...lead, status: st });
      return rest;
    });
    setLandedId(id);
  };

  const patchLead = (id: number, fn: (l: Lead) => Lead) =>
    setData((prev) => prev.map((l) => (l.id === id ? fn({ ...l }) : l)));

  const acceptOffer = (o: Offer) =>
    fadeOut(`o:${o.id}`, () => {
      setOffers((prev) => prev.filter((x) => x.id !== o.id));
      seqRef.current += 1;
      const rec: Lead = {
        id: seqRef.current,
        name: o.name,
        email: o.email,
        phone: o.phone,
        city: o.city,
        project: o.project,
        spec: o.spec,
        conf: o.conf,
        status: "CLAIMED",
        source: "LEAD_CENTER",
        assignee: ME,
        age: "now",
        desc: o.desc,
      };
      setData((prev) => [rec, ...prev]);
      setLandedId(rec.id);
    });

  const passOffer = (o: Offer) =>
    fadeOut(`o:${o.id}`, () => setOffers((prev) => prev.filter((x) => x.id !== o.id)));

  const decideLead = (l: Lead, accept: boolean) =>
    fadeOut(`l:${l.id}`, () => {
      patchLead(l.id, (x) => ({
        ...x,
        status: accept ? "CLAIMED" : "LOST",
        assignee: accept ? ME : x.assignee,
      }));
      if (accept) setLandedId(l.id);
    });

  const confirmDelete = () => {
    const id = delId;
    setDelId(null);
    if (id === null) return;
    setData((prev) => prev.filter((l) => l.id !== id));
    setPage(1);
  };

  /* ---------- add leads ------------------------------------------------ */
  const openAdd = (m: MethodKey) => {
    setMethod(m);
    setNameErr(false);
    setAddOpen(true);
    // Focus after the slide settles — focusing mid-transform makes the
    // keyboard fight the animation.
    if (m === "manual") {
      window.setTimeout(() => nameRef.current?.focus(), prefersReducedMotion() ? 0 : 320);
    }
  };

  const stageManual = (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setNameErr(true);
      nameRef.current?.focus();
      return;
    }
    setStaged((prev) => [
      ...prev,
      {
        name,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        project: form.project.trim() || null,
        source: "MANUAL",
      },
    ]);
    setForm({ name: "", email: "", phone: "", project: "" });
    nameRef.current?.focus();
  };

  /** The donor's parser, verbatim: pull an email and a phone out of each line,
      then treat what is left as name / project. */
  const stagePaste = () => {
    const text = paste.trim();
    if (!text) {
      pasteRef.current?.focus();
      return;
    }
    const rows: StagedRow[] = [];
    text
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((line) => {
        const mail = line.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
        const tel = line.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
        let rest = line;
        if (mail) rest = rest.replace(mail[0], " ");
        if (tel) rest = rest.replace(tel[0], " ");
        const parts = rest
          .split(/\s{2,}|\t|,|—|–/)
          .map((x) => x.trim())
          .filter(Boolean);
        rows.push({
          name: parts[0] || "Unnamed lead",
          email: mail ? mail[0] : null,
          phone: tel ? tel[0] : null,
          project: parts[1] || null,
          source: "EMAIL",
        });
      });
    setStaged((prev) => [...prev, ...rows]);
    setPaste("");
  };

  const stageCsv = () =>
    setStaged((prev) => [
      ...prev,
      ...CSV_DEMO.map(([name, email, project]) => ({
        name,
        email,
        phone: null,
        project,
        source: "IMPORT",
      })),
    ]);

  const commitStaged = () => {
    if (!staged.length) return;
    const rows = staged.map((r) => {
      seqRef.current += 1;
      const rec: Lead = {
        id: seqRef.current,
        name: r.name,
        email: r.email,
        phone: r.phone,
        city: "—",
        project: r.project || "General inquiry",
        spec: null,
        conf: 0,
        status: "NEW",
        source: r.source,
        assignee: null,
        age: "now",
        desc: "",
      };
      return rec;
    });
    // The donor unshifts each staged row in turn, so the LAST one ends up at
    // the top of the ledger. Reversed here for the same order in one write —
    // and the flash lands on whichever row is now on top.
    setData((prev) => [...rows.slice().reverse(), ...prev]);
    setStaged([]);
    setAddOpen(false);
    setTab("all");
    clearFilters();
    setLandedId(rows[rows.length - 1].id);
  };

  /* ---------- row sheet ------------------------------------------------ */
  const menuRows = useMemo<MenuRow[]>(() => {
    const l = sheetLead;
    if (!l) return [];
    return [
      { act: "open", icon: "i-user", tone: styles.lmiBp, title: "Open lead", sub: "Full record and history" },
      { act: "call", icon: "i-phone", tone: styles.lmiSky, title: "Call",
        sub: l.phone ?? "No phone on file", disabled: !l.phone },
      { act: "mail", icon: "i-mail", tone: styles.lmiOk, title: "Send email",
        sub: l.email ?? "No email on file", disabled: !l.email },
      { act: "move", icon: "i-board", tone: styles.lmiWarn, title: "Move stage",
        sub: `Now ${statusLabel(l.status).toLowerCase()} — pick a new one` },
      { act: "mine", icon: "i-userplus", title: l.assignee === ME ? "Already yours" : "Assign to me",
        sub: l.assignee === ME ? "You own this lead" : l.assignee ? `Owned by ${l.assignee}` : "Nobody owns it yet",
        disabled: l.assignee === ME },
      { act: "del", icon: "i-trash", tone: styles.lmiDanger, title: "Delete lead",
        sub: "Removes the record permanently", danger: true },
    ];
  }, [sheetLead]);

  const runMenu = (act: string) => {
    const l = sheetLead;
    setSheetId(null);
    if (!l) return;
    if (act === "move") setMoveId(l.id);
    else if (act === "del") setDelId(l.id);
    else if (act === "mine") {
      patchLead(l.id, (x) => ({ ...x, assignee: ME }));
      setLandedId(l.id);
    }
  };

  const anyOverlay = sheetLead !== null || moveLeadRec !== null || delLead !== null || addOpen;

  /* Only the manual pane is a real form, so only it can be reached with form=. */
  const footPrimary =
    method === "manual"
      ? { label: "Add to list", type: "submit" as const, onClick: undefined }
      : method === "email"
        ? { label: "Add to list", type: "button" as const, onClick: stagePaste }
        : { label: "Choose CSV", type: "button" as const, onClick: stageCsv };

  return (
    <div className={styles.app} onClick={onRootClick}>
      {/* Shared handheld nav: topbar + drawer + sprite. Owns its own open
          state, its own Escape and its own indicator, so the page holds none. */}
      <MobileNav />

      {/* ============ SCROLLER ============ */}
      <main className={styles.scroll} ref={scrollRef}>
        <div className={styles.content} ref={contentRef}>
          {/* PAGE HEAD */}
          <div className={styles.pageHead}>
            <div className={styles.kicker}>Pipeline</div>
            <h1 className={styles.pageTitle}>Leads</h1>
            <div className={styles.pageActions}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} type="button"
                onClick={() => openAdd("manual")}>
                <Icon id="i-plus" />New lead
              </button>
              <button className={`${styles.btn} ${styles.btnGhost}`} type="button"
                onClick={() => openAdd("email")}>
                <Icon id="i-file" />Import
              </button>
            </div>
          </div>

          {/* MASTHEAD — one numeral, mono kicker, EXACTLY two annotations.
              key on tab so the 320ms slide-in replays on a tab change. */}
          <div className={`${styles.lmast} ${styles.slide}`} key={tab}>
            <div className={styles.lmastTop}>
              <div className={styles.lmastLbl}>
                Leads in play
                <span className={styles.lmastRule} />
              </div>
              <CountUp value={inPlay.length} className={styles.lmastVal} />
            </div>
            <div className={styles.lmastCnt}>
              <div className={styles.lmastSub}>
                <div className={styles.lmastSubL}>Unassigned</div>
                <div className={styles.lmastSubV}>{unassigned}</div>
              </div>
              <div className={styles.lmastSub}>
                <div className={styles.lmastSubL}>Win rate</div>
                <div className={styles.lmastSubV}>{winRate}%</div>
              </div>
            </div>
          </div>

          {/* TABS */}
          <div className={styles.ptabs}>
            <span className={styles.ptabInd} style={{ transform: `translateX(${tabIndex * 100}%)` }} />
            {TABS.map((t) => (
              <button key={t.key} className={`${styles.ptab} ${tab === t.key ? styles.active : ""}`}
                type="button" aria-current={tab === t.key ? "page" : undefined}
                onClick={() => setTab(t.key)}>
                {t.label}
                <span className={styles.ptabCount}>{counts[t.key]}</span>
              </button>
            ))}
          </div>

          {/* ============ TAB: ALL LEADS ============ */}
          {tab === "all" && (
            <div className={styles.find}>
              <label className={styles.srch}>
                <Icon id="i-search" />
                <input
                  className={styles.srchInput}
                  type="search"
                  value={query}
                  placeholder="Name, project, city, source…"
                  autoComplete="off"
                  aria-label="Search leads"
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
                  <span className={styles.ddValue} data-f={status}>
                    {statusLabel(status)} · {statusCount(status)}
                  </span>
                  <Icon id="i-chev" className={`${styles.ic} ${styles.ddCaret}`} />
                </button>
                <div className={styles.ddMenu} role="listbox">
                  {LEAD_STATUSES.map((st) => (
                    <button key={st} className={`${styles.ddItem} ${status === st ? styles.active : ""}`}
                      type="button" role="option" aria-selected={status === st}
                      onClick={() => { setStatus(st); setPage(1); setFilterOpen(false); }}>
                      {statusLabel(st)}
                      <span className={styles.ddCount}>{statusCount(st)}</span>
                      {status === st ? <Icon id="i-check" /> : null}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "all" && (
            visible.length === 0 ? (
              <div className={styles.lempty}>
                {data.length === 0 ? (
                  <>
                    <div className={styles.lemptyT}>No leads yet</div>
                    <div className={styles.lemptyS}>
                      Add one by hand, paste an enquiry email, or drop a CSV — they land here as new.
                    </div>
                    <button className={styles.lemptyA} type="button" onClick={() => openAdd("manual")}>
                      <Icon id="i-plus" />New lead
                    </button>
                  </>
                ) : (
                  <>
                    <div className={styles.lemptyT}>No matches</div>
                    <div className={styles.lemptyS}>No lead matches that search and status.</div>
                    <button className={styles.lemptyA} type="button" onClick={clearFilters}>
                      <Icon id="i-x" />Clear filters
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className={styles.book}>
                {slice.map((l, i) => (
                  <div
                    key={l.id}
                    className={`${styles.lrow} ${styles.rowIn} ${landedId === l.id ? styles.landed : ""}`}
                    style={{ animationDelay: `${i * 45}ms` }}
                  >
                    <span className={styles.lav}>{initials(l.name)}</span>
                    <div className={styles.lname}>{l.name}</div>
                    <button className={styles.lrowOpen} type="button"
                      aria-label={`Actions for ${l.name}`} onClick={() => setSheetId(l.id)}>
                      <Icon id="i-dots" />
                    </button>
                    <div className={styles.lwhere}>{l.project} · {l.city}</div>
                    <div className={styles.lrowFoot}>
                      <span className={styles.lrowBadges}>
                        <span className={`${styles.pstatus} ${STATUS_TONE[l.status] ?? ""}`}>{l.status}</span>
                        {l.spec ? (
                          <span className={styles.ltrade} style={gauge(l.conf)}>
                            {l.spec}<b className={styles.ltradePct}>{pct(l.conf)}</b>
                          </span>
                        ) : (
                          <span className={`${styles.ltrade} ${styles.isNone}`}>Unsorted</span>
                        )}
                      </span>
                      <span className={styles.lrowFigs}>
                        <span className={`${styles.lown} ${l.assignee ? "" : styles.isNone}`}>
                          {l.assignee ?? "—"}
                        </span>
                        <span className={styles.lage}>{l.age}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === "all" && visible.length > PAGE_SIZE ? (
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

          {/* ============ TAB: PIPELINE — the kanban as stage sections ============ */}
          {tab === "pipeline" && (
            <div className={styles.board}>
              {WORKING_STAGES.map((s) => {
                const items = data.filter((l) => l.status === s.key);
                return (
                  <div className={styles.stageSec} key={s.key}>
                    <div className={styles.stageHead}>
                      <span className={styles.stageDot} />
                      <span className={styles.stageLbl}>{s.label}</span>
                      <span className={styles.stageCount}>{items.length}</span>
                    </div>
                    <div className={styles.stageCards}>
                      {items.length === 0 ? (
                        <div className={styles.lcardEmpty}>No leads</div>
                      ) : (
                        items.map((l, i) => (
                          <button
                            key={l.id}
                            className={`${styles.lcard} ${styles.rowIn} ${landedId === l.id ? styles.landed : ""}`}
                            style={{ animationDelay: `${i * 45}ms` }}
                            type="button"
                            aria-label={`Move ${l.name} to another stage`}
                            onClick={() => setMoveId(l.id)}
                          >
                            <span className={styles.lcardName}>{l.name}</span>
                            <span className={styles.lcardJob}>{l.project} · {l.city}</span>
                            <span className={styles.lcardMeta}>
                              <span className={`${styles.lcardOwn} ${l.assignee ? "" : styles.isNone}`}>
                                {l.assignee ?? "Unassigned"}
                              </span>
                              <span className={styles.lcardAge}>{l.age}</span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
              <div className={styles.boardFoot}>
                <span className={styles.boardNote}>Tap a card to move it</span>
                <span className={styles.boardTally}>{won} won · {lost} lost</span>
              </div>
            </div>
          )}

          {/* ============ TAB: INCOMING ============ */}
          {tab === "incoming" && (
            offers.length + inbox.length === 0 ? (
              <div className={styles.lempty}>
                <div className={styles.lemptyT}>You&apos;re all caught up</div>
                <div className={styles.lemptyS}>
                  Leads routed to you — and fresh enquiries — show up here to accept or decline.
                </div>
                <button className={styles.lemptyA} type="button" onClick={() => openAdd("manual")}>
                  <Icon id="i-plus" />New lead
                </button>
              </div>
            ) : (
              <div className={styles.istack}>
                {offers.map((o, i) => (
                  <div key={o.id}
                    className={`${styles.icard} ${styles.rowIn} ${outKey === `o:${o.id}` ? styles.out : ""}`}
                    style={{ animationDelay: `${i * 60}ms` }}>
                    {/* The platform window: one line, the countdown holds the right edge */}
                    <div className={styles.icardStrip}>
                      <Icon id="i-send" />
                      <span className={styles.icardStripLbl}>Platform lead — reserved for your shop</span>
                      <span className={`${styles.icardTimer} ${o.mins < 240 ? styles.warn : ""}`}>
                        {clock(o.mins)}
                      </span>
                    </div>
                    <div className={styles.icardBody}>
                      <div className={styles.icardTop}>
                        <span className={styles.lav}>{initials(o.name)}</span>
                        <div className={styles.icardId}>
                          <div className={styles.icardName}>{o.name}</div>
                          <div className={styles.icardMeta}>{o.age} · Lead center · {o.city}</div>
                        </div>
                        <span className={`${styles.pstatus} ${styles.lstNew}`}>Offer</span>
                      </div>
                      <div className={styles.icardProj}>
                        {o.project}
                        <span className={styles.ltrade} style={gauge(o.conf)}>
                          {o.spec}<b className={styles.ltradePct}>{pct(o.conf)}</b>
                        </span>
                      </div>
                      <div className={styles.icardDesc}>{o.desc}</div>
                      <div className={styles.icardContact}>{o.email ?? o.phone}</div>
                      <div className={styles.icardAct}>
                        <button className={`${styles.icardBtn} ${styles.icardBtnGo}`} type="button"
                          onClick={() => acceptOffer(o)}>
                          <Icon id="i-check" />Accept lead
                        </button>
                        <button className={styles.icardBtn} type="button" onClick={() => passOffer(o)}>
                          Pass
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {inbox.map((l, i) => (
                  <div key={l.id}
                    className={`${styles.icard} ${styles.rowIn} ${outKey === `l:${l.id}` ? styles.out : ""}`}
                    style={{ animationDelay: `${(offers.length + i) * 60}ms` }}>
                    <div className={styles.icardBody}>
                      <div className={styles.icardTop}>
                        <span className={styles.lav}>{initials(l.name)}</span>
                        <div className={styles.icardId}>
                          <div className={styles.icardName}>{l.name}</div>
                          <div className={styles.icardMeta}>
                            {l.age} · {srcLabel(l.source)} · {l.city}
                          </div>
                        </div>
                        <span className={`${styles.pstatus} ${STATUS_TONE[l.status] ?? ""}`}>{l.status}</span>
                      </div>
                      <div className={styles.icardProj}>
                        {l.project}
                        {l.spec ? (
                          <span className={styles.ltrade} style={gauge(l.conf)}>
                            {l.spec}<b className={styles.ltradePct}>{pct(l.conf)}</b>
                          </span>
                        ) : (
                          <span className={`${styles.ltrade} ${styles.isNone}`}>Unsorted</span>
                        )}
                      </div>
                      {l.desc ? <div className={styles.icardDesc}>{l.desc}</div> : null}
                      <div className={styles.icardContact}>
                        {[l.email, l.phone].filter(Boolean).join(" · ")}
                      </div>
                      <div className={styles.icardAct}>
                        <button className={`${styles.icardBtn} ${styles.icardBtnGo}`} type="button"
                          onClick={() => decideLead(l, true)}>
                          <Icon id="i-check" />Accept
                        </button>
                        <button className={styles.icardBtn} type="button"
                          onClick={() => decideLead(l, false)}>
                          Decline
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </main>

      {/* No floating action button: both primary actions live in the page head. */}

      {/* ============ SHEET SCRIM (shared by all four sheets) ============ */}
      <div
        className={`${styles.scrim} ${anyOverlay ? styles.on : ""}`}
        onClick={() => { setSheetId(null); setMoveId(null); setDelId(null); setAddOpen(false); }}
        aria-hidden="true"
      />

      {/* ============ ROW ACTIONS SHEET ============ */}
      <div className={`${styles.sheet} ${sheetLead ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-label="Lead actions" aria-hidden={!sheetLead}>
        <div className={styles.sheetGrab} />
        <div className={styles.sheetHead}>
          <div className={styles.sheetKicker}>
            {sheetLead
              ? `${statusLabel(sheetLead.status)} · ${srcLabel(sheetLead.source)} · ${sheetLead.age}`
              : "Lead · —"}
          </div>
          <div className={styles.sheetTitle}>{sheetLead?.name ?? "Actions"}</div>
        </div>
        <div className={styles.sheetBody}>
          {menuRows.map((r) => (
            <button key={r.act} type="button" disabled={r.disabled}
              className={`${styles.lmenuItem} ${r.danger ? styles.lmenuItemDanger : ""}`}
              onClick={() => runMenu(r.act)}>
              <span className={`${styles.lmiIc} ${r.tone ?? ""}`}><Icon id={r.icon} /></span>
              <span>
                <span className={styles.lmenuItemT}>{r.title}</span>
                <span className={styles.lmenuItemS}>{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setSheetId(null)}>Cancel</button>
      </div>

      {/* ============ STAGE PICKER (the board's drag & drop) ============ */}
      <div className={`${styles.sheet} ${moveLeadRec ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-label="Move lead to stage" aria-hidden={!moveLeadRec}>
        <div className={styles.sheetGrab} />
        <div className={styles.sheetHead}>
          <div className={styles.sheetKicker}>
            {moveLeadRec ? `${moveLeadRec.project} · ${moveLeadRec.city}` : "Lead · —"}
          </div>
          <div className={styles.sheetTitle}>Move to stage</div>
        </div>
        <div className={styles.sheetBody}>
          {STAGES.map((s, i) => {
            const current = moveLeadRec?.status === s.key;
            return (
              <button key={s.key} className={`${styles.sheetOpt} ${current ? styles.current : ""}`}
                type="button" disabled={current || !moveLeadRec}
                onClick={() => moveLeadRec && moveTo(moveLeadRec.id, s.key)}>
                <span className={styles.sheetOptN}>{String(i + 1).padStart(2, "0")}</span>
                {s.label}
                {current ? <Icon id="i-check" /> : null}
              </button>
            );
          })}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setMoveId(null)}>Cancel</button>
      </div>

      {/* ============ DELETE CONFIRMATION (the desktop dialog) ============ */}
      <div className={`${styles.sheet} ${delLead ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-labelledby="mlDelTitle" aria-hidden={!delLead}>
        <div className={styles.sheetGrab} />
        <div className={styles.sheetHead}>
          <div className={styles.sheetKicker}>Pipeline / remove record</div>
          <div className={styles.sheetTitle} id="mlDelTitle">Delete lead?</div>
        </div>
        <div className={`${styles.sheetBody} ${styles.confirmBody}`}>
          <p className={styles.confirmTxt}>
            Remove {delLead?.name ?? "this lead"} from the pipeline? This can&apos;t be undone.
          </p>
        </div>
        <div className={styles.formFoot}>
          <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => setDelId(null)}>
            Cancel
          </button>
          <button className={`${styles.btn} ${styles.btnDanger}`} type="button" onClick={confirmDelete}>
            <Icon id="i-trash" />Delete
          </button>
        </div>
      </div>

      {/* ============ ADD LEADS (the desktop Import panel) ============ */}
      <div className={`${styles.sheet} ${addOpen ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-labelledby="mlAddTitle" aria-hidden={!addOpen}>
        <div className={styles.sheetGrab} />
        <div className={styles.sheetHead}>
          <div className={styles.sheetKicker}>Pipeline / new records</div>
          <div className={styles.sheetTitle} id="mlAddTitle">Add leads</div>
        </div>

        {/* The desktop method switch, as a segmented control */}
        <div className={styles.imeth}>
          {METHODS.map((m) => (
            <button key={m.key} className={`${styles.imethBtn} ${method === m.key ? styles.active : ""}`}
              type="button" aria-pressed={method === m.key} onClick={() => setMethod(m.key)}>
              <Icon id={m.icon} />{m.label}
            </button>
          ))}
        </div>

        <div className={styles.sheetBody}>
          {method === "manual" ? (
            <form className={styles.formBody} id="mlManual" noValidate onSubmit={stageManual}>
              <div className={`${styles.fld} ${nameErr ? styles.invalid : ""}`}>
                <label className={styles.fldLbl} htmlFor="mlName">
                  Name<span className={styles.req}>*</span>
                </label>
                <input ref={nameRef} className={styles.pinput} id="mlName" name="name" type="text"
                  placeholder="J. Whitfield" autoComplete="off" value={form.name}
                  aria-invalid={nameErr} aria-describedby={nameErr ? "mlNameErr" : undefined}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, name: e.target.value }));
                    if (e.target.value.trim()) setNameErr(false);
                  }} />
                {nameErr ? <span className={styles.fldErr} id="mlNameErr">Enter a name for the lead</span> : null}
              </div>

              <div className={styles.fld}>
                <label className={styles.fldLbl} htmlFor="mlEmail">Email</label>
                <input className={styles.pinput} id="mlEmail" name="email" type="email"
                  placeholder="name@mail.com" autoComplete="off" value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>

              <div className={styles.fld}>
                <label className={styles.fldLbl} htmlFor="mlPhone">Phone</label>
                <input className={styles.pinput} id="mlPhone" name="phone" type="tel"
                  placeholder="(425) 555-0112" autoComplete="off" value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>

              <div className={styles.fld}>
                <label className={styles.fldLbl} htmlFor="mlProject">Project type</label>
                <input className={styles.pinput} id="mlProject" name="project" type="text"
                  placeholder="Metal roof repair" autoComplete="off" value={form.project}
                  onChange={(e) => setForm((f) => ({ ...f, project: e.target.value }))} />
                <span className={styles.fldHint}>
                  Leave it blank and the lead lands as a general enquiry, ready to sort on the board.
                </span>
              </div>
            </form>
          ) : null}

          {method === "email" ? (
            <div className={styles.formBody}>
              <div className={styles.fld}>
                <label className={styles.fldLbl} htmlFor="mlPaste">Paste the email</label>
                <textarea ref={pasteRef} className={styles.parea} id="mlPaste" value={paste}
                  placeholder={"Paste the full email here — we'll pull out the name, email and phone we can find."}
                  onChange={(e) => setPaste(e.target.value)} />
                <span className={styles.fldHint}>
                  One lead per line. Review what was found below before you add it.
                </span>
              </div>
            </div>
          ) : null}

          {method === "file" ? (
            <div className={styles.formBody}>
              <button className={styles.dropzone} type="button" onClick={stageCsv}>
                <Icon id="i-file" />
                <span className={styles.dropzoneTxt}>Tap to choose a CSV</span>
              </button>
            </div>
          ) : null}

          {/* What will land when you commit — reviewable, removable */}
          {staged.length ? (
            <div className={styles.staged}>
              <div className={styles.stagedHead}>
                <span className={styles.stagedTitle}>Ready to add</span>
                <button className={styles.stagedGo} type="button" onClick={commitStaged}>
                  <Icon id="i-check" />
                  Add {staged.length} {staged.length === 1 ? "lead" : "leads"}
                </button>
              </div>
              {staged.map((r, i) => (
                <div className={styles.stRow} key={`${r.name}-${i}`}>
                  <div>
                    <div className={styles.stName}>{r.name}</div>
                    <div className={styles.stMeta}>
                      {[r.email, r.phone, r.project].filter(Boolean).join(" · ") || srcLabel(r.source)}
                    </div>
                  </div>
                  <button className={styles.stX} type="button" aria-label={`Remove ${r.name}`}
                    onClick={() => setStaged((prev) => prev.filter((_, n) => n !== i))}>
                    <Icon id="i-x" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* The submit pair sits in a beige foot OUTSIDE the scrolling body and
            reaches the manual form with the form= attribute. */}
        <div className={styles.formFoot}>
          <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => setAddOpen(false)}>
            Cancel
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type={footPrimary.type}
            form={method === "manual" ? "mlManual" : undefined} onClick={footPrimary.onClick}>
            <Icon id="i-plus" />{footPrimary.label}
          </button>
        </div>
      </div>
    </div>
  );
}
