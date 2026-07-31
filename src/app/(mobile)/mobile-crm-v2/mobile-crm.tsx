"use client";

// MOBILE CRM (mobile-crm-v2) — Blueprint system, handheld build.
//
// Fourth sibling to /mobile-v2 (Overview), /mobile-proposals-v2 and
// /mobile-clients-v2. Tokens, palette, type scale, status tones, the shared nav
// and Motion System "Balanced" are theirs; where the mobile-app-ui-design skill
// disagrees with the house system (soft shadows, rounded-3xl, gradients) the
// house system wins — hard 3px offset shadows, 2px radii and Inter 900 caps.
//
// Every region of the desktop CRM sheet (src/components/v3/crm-blueprint) is
// covered:
//  · page head (Pipeline / CRM) + the New-rule action
//  · the 4 CRM panels as one tab strip with a sliding rule
//  · the 4-cell stat grid → the Overview masthead (conversion, won·lost, active)
//  · Fresh leads (5 rows), What needs you (action rows), Recent activity
//  · Customer book: the 3 tiles → the Book masthead, the 8-status chip rail →
//    ONE filter dropdown, the 6-column table → row cards with initials avatars
//  · Workflows: the rules list with its drawn toggle, and the rule form
//  · Follow-up queue: the All/Due/Scheduled sub-tabs → the Due tab's filter
//    dropdown, the 4-column table → row cards with the severity ladder, pager
//  · the "⋮" popover → one bottom sheet serving all four record kinds, each
//    with a disabled row driven by real fixture state and a danger row
//  · every empty state, plus the second "no matches" state behind each filter
//
// What changes versus the desktop sheet, and why:
//  · Tab labels are short ("Book", "Rules", "Due"): four columns of a 320px
//    screen are ~72px each, and "Customer book" / "Follow-up queue" cannot
//    survive that at 13px.
//  · A search box is added to the book. Thirteen accounts across two pages
//    makes finding a named one the real job; it filters the fixture
//    client-side — no new endpoint.
//  · "Last activity" leaves the row for the sheet, the same call that took
//    "updated" off the proposals ledger and the clients book.
//  · Page sizes drop (book 13-unpaged → 8, queue 20 → 6): a handheld record
//    card is three lines tall.
//  · The desktop's per-row Done + Send pair becomes one flat framed Send on the
//    row; Done and everything else live in the row's sheet.
//
// Content is the donor demo fixture by design: the data layer is out of scope
// until the layout is signed off.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./mobile-crm.module.css";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import { lockScroll } from "@/lib/scrollLock";
import {
  ACTIVE_STATUSES,
  ACTIVITY_FEED,
  CONVERSATIONS_COUNT,
  CRM_LEADS,
  CUSTOMERS_DATA,
  FRESH_STATUSES,
  LEAD_CLS,
  PAGE_BOOK,
  PAGE_QUEUE,
  QUEUE_FILTERS,
  QUEUE_SEED,
  RULES_SEED,
  RULE_SEQ_START,
  STATUS_CLS,
  STATUS_ORDER,
  TABS,
  TEMPLATES,
  TRIGGERS,
  humanDelay,
  initials,
  isCompany,
  matchesCustomer,
  money,
  severity,
  titleCase,
  triggerLabel,
  type CrmLead,
  type Customer,
  type FollowUpRule,
  type QueueFilterKey,
  type QueueItem,
  type TabKey,
} from "./crm-data";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Stable module-scope formatters: an inline one would be a new function every
   render and would restart the count-up on every keystroke. */
const fmtMoney = (n: number) => money(n);
const fmtInt = (n: number) => String(Math.round(n));
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

function Icon({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ?? styles.ic} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

/** 750ms easeOutCubic. tabular-nums keep the digit columns from jumping. */
function CountUp({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.textContent = format(value);
      return;
    }
    let raf = 0;
    let t0: number | null = null;
    const frame = (t: number) => {
      if (t0 === null) t0 = t;
      const pr = Math.min(1, (t - t0) / 750);
      el.textContent = format(value * (1 - Math.pow(1 - pr, 3)));
      if (pr < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value, format]);
  return (
    <div ref={ref} className={className}>
      {format(value)}
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

type SheetTarget =
  /* Leads carry no id in the donor fixture, so the name is the key — it is
     unique across all fifteen records. */
  | { kind: "lead"; id: string }
  | { kind: "customer"; id: string }
  | { kind: "rule"; id: string }
  | { kind: "queue"; id: string };

function Pager({
  page,
  total,
  per,
  onGo,
}: {
  page: number;
  total: number;
  per: number;
  onGo: (n: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / per));
  if (total <= per) return null;
  return (
    <div className={styles.pager}>
      <button
        className={styles.pagerBtn}
        type="button"
        disabled={page <= 1}
        onClick={() => onGo(Math.max(1, page - 1))}
      >
        <Icon id="i-chevl" />
        Prev
      </button>
      <button
        className={styles.pagerBtn}
        type="button"
        disabled={page >= pages}
        onClick={() => onGo(Math.min(pages, page + 1))}
      >
        Next
        <Icon id="i-chevr" />
      </button>
      <span className={styles.pagerInfo}>
        {page} / {pages}
      </span>
    </div>
  );
}

export function MobileCrm() {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  /* Clone every seed per mount, so runtime mutations never leak between
     mounts (the donor's own rule). */
  const [leads, setLeads] = useState<CrmLead[]>(() => CRM_LEADS.map((l) => ({ ...l })));
  const [customers, setCustomers] = useState<Customer[]>(() =>
    CUSTOMERS_DATA.map((c) => ({ ...c })),
  );
  const [rules, setRules] = useState<FollowUpRule[]>(() => RULES_SEED.map((r) => ({ ...r })));
  const [queue, setQueue] = useState<QueueItem[]>(() => QUEUE_SEED.map((q) => ({ ...q })));
  const [ruleSeq, setRuleSeq] = useState(RULE_SEQ_START);

  const [tab, setTab] = useState<TabKey>("overview");
  const [bookFilter, setBookFilter] = useState<string>("ALL");
  const [bookQuery, setBookQuery] = useState("");
  const [bookPage, setBookPage] = useState(1);
  const [qFilter, setQFilter] = useState<QueueFilterKey>("ALL");
  const [qPage, setQPage] = useState(1);

  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const [landedId, setLandedId] = useState<string | null>(null);
  /* Queue rows fade for 240ms before they leave the array — the donor's
     `.gone` pass, so the list does not jump under the thumb. */
  const [gone, setGone] = useState<string[]>([]);

  /* ---- rule form sheet ---- */
  const [ruleOpen, setRuleOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", trigger: "SENT", days: "2", template: "" });
  const [nameErr, setNameErr] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

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
      styles.btn, styles.tab, styles.ddBtn, styles.ddItem, styles.pagerBtn,
      styles.cmenuItem, styles.sheetCancel, styles.rowOpen, styles.qsend,
      styles.arow, styles.fitem, styles.emptyA, styles.srchX, styles.tgl,
    ].map((c) => `.${c}`).join(", ");
    const el = (e.target as HTMLElement).closest<HTMLElement>(sel);
    if (!el) return;
    el.classList.remove(styles.pressed);
    void el.offsetWidth;
    el.classList.add(styles.pressed);
    el.addEventListener("animationend", () => el.classList.remove(styles.pressed), { once: true });
  }, []);

  /* One blue flash where a row has nothing to navigate to — the donor answered
     the same rows with an "Opened" stamp on the button. Without it the tap is
     silent, and a silent tap reads as broken. */
  const flash = (el: HTMLElement) => {
    if (prefersReducedMotion()) return;
    el.classList.remove(styles.landed);
    void el.offsetWidth;
    el.classList.add(styles.landed);
    el.addEventListener("animationend", () => el.classList.remove(styles.landed), { once: true });
  };

  /* ---------- Esc closes what the PAGE owns ---------------------------
     The drawer is not listed: MobileNav owns its own Escape and only binds
     while open, so the two listeners cannot both claim one key press. */
  useEffect(() => {
    if (!filterOpen && !ruleOpen && !sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (filterOpen) setFilterOpen(false);
      else if (ruleOpen) setRuleOpen(false);
      else setSheet(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filterOpen, ruleOpen, sheet]);

  /* ---------- Filter dropdown: close on outside pointerdown ------------
     Only one dropdown is mounted at a time (the tab decides which), so one ref
     and one flag serve both. */
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [filterOpen]);

  /* ---------- Paging returns you to the top of the list -----------------
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
  }, [bookPage, qPage]);

  /* ---------- The one blue flash on a record you just changed ----------- */
  useEffect(() => {
    if (!landedId) return;
    const t = window.setTimeout(() => setLandedId(null), 700);
    return () => clearTimeout(t);
  }, [landedId]);

  /* ---------- Queue rows leave after their fade ------------------------- */
  useEffect(() => {
    if (!gone.length) return;
    const t = window.setTimeout(
      () => {
        setQueue((prev) => prev.filter((q) => !gone.includes(q.id)));
        setGone([]);
      },
      prefersReducedMotion() ? 0 : 240,
    );
    return () => clearTimeout(t);
  }, [gone]);

  /* ---------- derived: Overview ---------------------------------------- */
  const won = useMemo(() => leads.filter((l) => l.status === "WON").length, [leads]);
  const lost = useMemo(() => leads.filter((l) => l.status === "LOST").length, [leads]);
  const active = useMemo(
    () => leads.filter((l) => ACTIVE_STATUSES.includes(l.status)).length,
    [leads],
  );
  const rate = won + lost > 0 ? (won / (won + lost)) * 100 : 0;
  const fresh = useMemo(
    () => leads.filter((l) => FRESH_STATUSES.includes(l.status)).slice(0, 5),
    [leads],
  );
  const dueNow = useMemo(() => queue.filter((q) => q.overdue), [queue]);
  const laterOn = useMemo(() => queue.filter((q) => !q.overdue), [queue]);
  const oldest = useMemo(
    () => dueNow.reduce((a, q) => Math.max(a, q.days), 0),
    [dueNow],
  );

  /* ---------- derived: book ------------------------------------------- */
  const bookCounts = useMemo(() => {
    const out: Record<string, number> = { ALL: customers.length };
    STATUS_ORDER.forEach((s) => {
      out[s] = customers.filter((c) => c.top === s).length;
    });
    return out;
  }, [customers]);
  /* Only the statuses the book actually holds get a cell — the desktop chip
     rail does the same, so an empty status never becomes a dead target. */
  const bookOptions = useMemo(
    () => [
      { key: "ALL", label: "All" },
      ...STATUS_ORDER.filter((s) => bookCounts[s] > 0).map((s) => ({ key: s, label: titleCase(s) })),
    ],
    [bookCounts],
  );
  const bookVisible = useMemo(
    () =>
      customers.filter(
        (c) => (bookFilter === "ALL" || c.top === bookFilter) && matchesCustomer(c, bookQuery),
      ),
    [customers, bookFilter, bookQuery],
  );
  const ltvTotal = useMemo(() => customers.reduce((a, c) => a + c.ltv, 0), [customers]);
  const quotesTotal = useMemo(() => customers.reduce((a, c) => a + c.quotes, 0), [customers]);
  const bookPages = Math.max(1, Math.ceil(bookVisible.length / PAGE_BOOK));
  const bookSafe = Math.min(bookPage, bookPages);
  const bookSlice = bookVisible.slice((bookSafe - 1) * PAGE_BOOK, bookSafe * PAGE_BOOK);

  /* ---------- derived: rules ------------------------------------------ */
  const rulesOn = useMemo(() => rules.filter((r) => r.enabled), [rules]);
  const fastest = useMemo(
    () => (rulesOn.length ? Math.min(...rulesOn.map((r) => r.delayMinutes)) : 0),
    [rulesOn],
  );

  /* ---------- derived: queue ------------------------------------------ */
  const qCounts = useMemo(
    () => ({ ALL: queue.length, DUE: dueNow.length, SCHEDULED: laterOn.length }),
    [queue.length, dueNow.length, laterOn.length],
  );
  const qVisible = useMemo(
    () => (qFilter === "DUE" ? dueNow : qFilter === "SCHEDULED" ? laterOn : queue),
    [qFilter, dueNow, laterOn, queue],
  );
  const qPages = Math.max(1, Math.ceil(qVisible.length / PAGE_QUEUE));
  const qSafe = Math.min(qPage, qPages);
  const qSlice = qVisible.slice((qSafe - 1) * PAGE_QUEUE, qSafe * PAGE_QUEUE);

  /* ---------- masthead: one numeral, mono kicker, TWO annotations -------
     Never a third, and all three computed — claim a lead or send a follow-up
     and the head moves with it. */
  const mast = useMemo(() => {
    if (tab === "overview") {
      return {
        kicker: "Conversion · won rate",
        value: rate,
        format: fmtPct,
        tone: "",
        a1: { l: "Won · lost", v: `${won} · ${lost}` },
        a2: { l: "Active leads", v: String(active) },
      };
    }
    if (tab === "book") {
      return {
        kicker: "Lifetime value · paid",
        value: ltvTotal,
        format: fmtMoney,
        tone: "",
        a1: { l: "Customers", v: String(customers.length) },
        a2: { l: "Proposals", v: String(quotesTotal) },
      };
    }
    if (tab === "rules") {
      return {
        kicker: "Follow-up rules · live",
        value: rulesOn.length,
        format: fmtInt,
        tone: "",
        a1: { l: "Rules total", v: String(rules.length) },
        a2: { l: "Fastest", v: fastest ? humanDelay(fastest) : "—" },
      };
    }
    return {
      kicker: "Follow-ups · overdue",
      value: dueNow.length,
      format: fmtInt,
      tone: dueNow.length ? styles.isBad : styles.isGood,
      a1: { l: "Scheduled", v: String(laterOn.length) },
      a2: { l: "Oldest", v: oldest ? `${oldest}d` : "—" },
    };
  }, [
    tab, rate, won, lost, active, ltvTotal, customers.length, quotesTotal,
    rulesOn.length, rules.length, fastest, dueNow.length, laterOn.length, oldest,
  ]);

  /* ---------- What needs you — the donor's action rows ------------------ */
  const actionRows = useMemo(() => {
    const rows: Array<{ tone: string; icon: string; t: string; h: string; go: TabKey | null }> = [];
    if (dueNow.length > 0) {
      rows.push({
        tone: styles.toneDanger,
        icon: "i-cal",
        t: `${dueNow.length} follow-up${dueNow.length === 1 ? "" : "s"} overdue`,
        h: "Run or mark done in the queue",
        go: "queue",
      });
    }
    if (active > 0) {
      rows.push({
        tone: styles.toneBp,
        icon: "i-target",
        t: `${active} lead${active === 1 ? "" : "s"} still in motion`,
        h: "Push them forward in the pipeline",
        go: null,
      });
    }
    if (CONVERSATIONS_COUNT > 0) {
      rows.push({
        tone: "",
        icon: "i-msg",
        t: `${CONVERSATIONS_COUNT} conversation${CONVERSATIONS_COUNT === 1 ? "" : "s"}`,
        h: "Open the shared inbox",
        go: null,
      });
    }
    rows.push({
      tone: "",
      icon: "i-chart",
      t: "Quote → close optimization",
      h: "Tighten your follow-up workflow rules",
      go: "rules",
    });
    return rows;
  }, [dueNow.length, active]);

  /* ---------- the row sheet, one per record kind ------------------------ */
  const sheetView = useMemo<{ kicker: string; title: string; rows: MenuRow[] } | null>(() => {
    if (!sheet) return null;

    if (sheet.kind === "lead") {
      const l = leads.find((x) => x.name === sheet.id);
      if (!l) return null;
      const claimed = l.status === "CLAIMED";
      return {
        kicker: `Lead · ${l.status.toLowerCase()} · ${l.age}`,
        title: l.name,
        rows: [
          { act: "open", icon: "i-target", tone: styles.toneBp, title: "Open lead", sub: l.project },
          {
            act: "claim", icon: "i-userplus", tone: styles.toneSky,
            title: claimed ? "Already claimed" : "Claim lead",
            sub: claimed ? `Working with ${l.assignee ?? "the shop"}` : "Assign it to you",
            disabled: claimed,
          },
          {
            act: "msg", icon: "i-msg", tone: styles.toneOk, title: "Message assignee",
            sub: l.assignee ? `Text ${l.assignee}` : "Unassigned — route it first",
            disabled: !l.assignee,
          },
          {
            act: "quote", icon: "i-fileplus", tone: styles.toneWarn,
            title: "Convert to proposal", sub: "Start a Smart Proposal",
          },
          {
            act: "drop", icon: "i-trash", tone: styles.toneDanger,
            title: "Discard lead", sub: "Removes it from the pipeline", danger: true,
          },
        ],
      };
    }

    if (sheet.kind === "customer") {
      const c = customers.find((x) => x.id === sheet.id);
      if (!c) return null;
      return {
        kicker: `${c.quotes} proposal${c.quotes === 1 ? "" : "s"} · ${money(c.quoted)} quoted · last ${c.last}`,
        title: c.name,
        rows: [
          { act: "open", icon: "i-user", tone: styles.toneBp, title: "Open customer", sub: "Full record and history" },
          { act: "prop", icon: "i-fileplus", tone: styles.toneSky, title: "New proposal", sub: `Start one for ${c.name}` },
          {
            act: "mail", icon: "i-mail", tone: styles.toneOk, title: "Send email",
            sub: c.email || "No email on file", disabled: !c.email,
          },
          {
            act: "pay", icon: "i-card", tone: styles.toneWarn, title: "Payment history",
            sub: c.ltv ? `${money(c.ltv)} collected` : "Nothing paid yet", disabled: c.ltv === 0,
          },
          {
            act: "del", icon: "i-trash", tone: styles.toneDanger, title: "Remove from book",
            sub: "Removes the record permanently", danger: true,
          },
        ],
      };
    }

    if (sheet.kind === "rule") {
      const r = rules.find((x) => x.id === sheet.id);
      if (!r) return null;
      return {
        kicker: `${triggerLabel(r.triggerStatus)} · ${humanDelay(r.delayMinutes)} delay`,
        title: r.name,
        rows: [
          { act: "edit", icon: "i-gear", tone: styles.toneBp, title: "Edit rule", sub: "Trigger, delay and template" },
          {
            act: "tpl", icon: "i-file", tone: styles.toneSky, title: "Preview template",
            sub: r.template ?? "No template attached", disabled: !r.template,
          },
          {
            act: "flip", icon: "i-rotate", tone: styles.toneOk,
            title: r.enabled ? "Turn off" : "Turn on",
            sub: r.enabled ? "Stops scheduling new follow-ups" : "Starts scheduling again",
          },
          {
            act: "del", icon: "i-trash", tone: styles.toneDanger, title: "Delete rule",
            sub: "Scheduled follow-ups stay in the queue", danger: true,
          },
        ],
      };
    }

    const q = queue.find((x) => x.id === sheet.id);
    if (!q) return null;
    return {
      kicker: `${q.date} · ${q.rel}`,
      title: q.client,
      rows: [
        { act: "send", icon: "i-send", tone: styles.toneSky, title: "Send now", sub: "Delivers the follow-up and clears it" },
        { act: "done", icon: "i-check", tone: styles.toneOk, title: "Mark done", sub: "Clears it without sending" },
        {
          act: "open", icon: "i-folder", tone: styles.toneBp, title: "Open project",
          sub: q.title ?? "No project on this follow-up", disabled: !q.title,
        },
        {
          act: "later", icon: "i-cal", tone: styles.toneWarn, title: "Reschedule",
          sub: q.overdue ? "Push it out three days" : "Already scheduled", disabled: !q.overdue,
        },
        {
          act: "cancel", icon: "i-trash", tone: styles.toneDanger, title: "Cancel follow-up",
          sub: "Drops it from the queue", danger: true,
        },
      ],
    };
  }, [sheet, leads, customers, rules, queue]);

  /* ---------- rule form ----------------------------------------------- */
  const openRule = (r: FollowUpRule | null) => {
    setForm({
      name: r?.name ?? "",
      trigger: r?.triggerStatus ?? "SENT",
      days: String(r ? Math.max(1, Math.round(r.delayMinutes / 60 / 24)) : 2),
      template: r?.template ?? "",
    });
    setEditingId(r?.id ?? null);
    setNameErr(false);
    setSheet(null);
    setTab("rules");
    setFilterOpen(false);
    setRuleOpen(true);
    // Focus after the slide settles — focusing mid-transform makes the
    // keyboard fight the animation.
    window.setTimeout(() => nameRef.current?.focus(), prefersReducedMotion() ? 0 : 320);
  };

  const submitRule = (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setNameErr(true);
      nameRef.current?.focus();
      return;
    }
    const payload = {
      name,
      triggerStatus: form.trigger,
      delayMinutes: Math.max(1, parseInt(form.days, 10) || 1) * 60 * 24,
      template: form.template || null,
    };
    if (editingId) {
      setRules((prev) => prev.map((r) => (r.id === editingId ? { ...r, ...payload } : r)));
      setLandedId(editingId);
    } else {
      const id = `r${ruleSeq + 1}`;
      setRuleSeq((n) => n + 1);
      setRules((prev) => [...prev, { id, enabled: true, ...payload }]);
      setLandedId(id);
    }
    setRuleOpen(false);
  };

  /* ---------- mutations ----------------------------------------------- */
  const toggleRule = (id: string) =>
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));

  const dropQueue = (id: string) => setGone((prev) => (prev.includes(id) ? prev : [...prev, id]));

  const runSheet = (act: string) => {
    const target = sheet;
    setSheet(null);
    if (!target) return;

    if (target.kind === "lead") {
      if (act === "drop") {
        setLeads((prev) => prev.filter((l) => l.name !== target.id));
      } else if (act === "claim") {
        setLeads((prev) =>
          prev.map((l) =>
            l.name === target.id ? { ...l, status: "CLAIMED", assignee: l.assignee ?? "Ivan" } : l,
          ),
        );
        setLandedId(target.id);
      }
      return;
    }
    if (target.kind === "customer") {
      if (act === "del") {
        setCustomers((prev) => prev.filter((c) => c.id !== target.id));
        setBookPage(1);
      }
      return;
    }
    if (target.kind === "rule") {
      if (act === "del") {
        setRules((prev) => prev.filter((r) => r.id !== target.id));
      } else if (act === "flip") {
        toggleRule(target.id);
        setLandedId(target.id);
      } else if (act === "edit") {
        openRule(rules.find((r) => r.id === target.id) ?? null);
      }
      return;
    }
    if (act === "send" || act === "done" || act === "cancel") {
      dropQueue(target.id);
    } else if (act === "later") {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === target.id ? { ...q, overdue: false, days: 0, rel: "in 3 days" } : q,
        ),
      );
      setLandedId(target.id);
    }
  };

  const clearBook = () => {
    setBookFilter("ALL");
    setBookQuery("");
    setBookPage(1);
  };

  const goTab = (next: TabKey) => {
    setTab(next);
    setFilterOpen(false);
  };

  const tabIndex = TABS.findIndex((t) => t.key === tab);
  const anyOverlay = Boolean(sheetView) || ruleOpen;

  // Swipe-down dismissal, one gesture per sheet, wired to the close paths the
  // scrim and Cancel already use.
  const actionsDrag = useSheetDrag(Boolean(sheetView), () => setSheet(null));
  const ruleDrag = useSheetDrag(ruleOpen, () => setRuleOpen(false));

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
            <div className={styles.kicker}>Pipeline</div>
            <h1 className={styles.pageTitle}>CRM</h1>
            <div className={styles.pageActions}>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                type="button"
                onClick={() => openRule(null)}
              >
                <Icon id="i-plus" />New rule
              </button>
            </div>
          </div>

          {/* MASTHEAD — key on tab so the 320ms slide-in replays */}
          <div className={`${styles.cmast} ${styles.slide}`} key={tab}>
            <div className={styles.cmastTop}>
              <div className={styles.cmastLbl}>
                {mast.kicker}
                <span className={styles.cmastRule} />
              </div>
              <CountUp
                value={mast.value}
                format={mast.format}
                className={`${styles.cmastVal} ${mast.tone}`}
              />
            </div>
            <div className={styles.cmastCnt}>
              {[mast.a1, mast.a2].map((a) => (
                <div className={styles.cmastSub} key={a.l}>
                  <div className={styles.cmastSubL}>{a.l}</div>
                  <div className={styles.cmastSubV}>{a.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* TABS — the desktop's four CRM panels */}
          <div className={styles.tabs}>
            <span className={styles.tabInd} style={{ transform: `translateX(${tabIndex * 100}%)` }} />
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`${styles.tab} ${tab === t.key ? styles.active : ""}`}
                type="button"
                aria-current={tab === t.key ? "page" : undefined}
                onClick={() => goTab(t.key)}
              >
                {t.label}
                {t.key === "queue" ? <span className={styles.tabCount}>{dueNow.length}</span> : null}
              </button>
            ))}
          </div>

          {/* ============ TAB: OVERVIEW ============ */}
          {tab === "overview" && (
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <div className={styles.cardTitle}>Fresh leads</div>
                <div className={styles.cardSub}>Latest five — tap one to claim or route.</div>
              </div>
              {fresh.length === 0 ? (
                <div className={styles.note}>
                  <div className={styles.noteT}>No new leads</div>
                  <div className={styles.noteS}>
                    Claimed and routed work moves on to the pipeline. New enquiries land here on
                    their own.
                  </div>
                </div>
              ) : (
                <div className={styles.fresh}>
                  {fresh.map((l, i) => (
                    <button
                      key={l.name}
                      className={`${styles.fitem} ${styles.rowIn} ${landedId === l.name ? styles.landed : ""}`}
                      style={{ animationDelay: `${i * 45}ms` }}
                      type="button"
                      onClick={() => setSheet({ kind: "lead", id: l.name })}
                    >
                      <span className={styles.fname}>{l.name}</span>
                      <span className={styles.fbadge}>
                        <span className={`${styles.pstatus} ${styles[LEAD_CLS[l.status]] ?? ""}`}>
                          {l.status.toLowerCase()}
                        </span>
                      </span>
                      <span className={styles.fsub}>
                        {l.project}
                        {l.assignee ? ` · ${l.assignee}` : ""}
                      </span>
                      <span className={styles.fage}>{l.age}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "overview" && (
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <div className={styles.cardTitle}>What needs you</div>
                <div className={styles.cardSub}>Pinch points worth acting on.</div>
              </div>
              <div className={styles.arows}>
                {actionRows.map((r) => (
                  <button
                    key={r.t}
                    className={styles.arow}
                    type="button"
                    onClick={(e) => (r.go ? goTab(r.go) : flash(e.currentTarget))}
                  >
                    <span className={`${styles.mIc} ${r.tone}`}>
                      <Icon id={r.icon} />
                    </span>
                    <span className={styles.arowTxt}>
                      <span className={styles.arowT}>{r.t}</span>
                      <span className={styles.arowH}>{r.h}</span>
                    </span>
                    <Icon id="i-arrow" className={`${styles.ic} ${styles.arowGo}`} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === "overview" && (
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <div className={styles.cardTitle}>Recent activity</div>
              </div>
              <ul className={styles.recent}>
                {ACTIVITY_FEED.slice(0, 5).map((a) => (
                  <li className={styles.ritem} key={a.summary}>
                    <span className={styles.rtxt}>{a.summary}</span>
                    <span className={styles.rage}>{a.age}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ============ TAB: CUSTOMER BOOK ============ */}
          {tab === "book" && (
            <div className={styles.find}>
              <label className={styles.srch}>
                <Icon id="i-search" />
                <input
                  className={styles.srchInput}
                  type="search"
                  value={bookQuery}
                  placeholder="Search name, email or status…"
                  autoComplete="off"
                  aria-label="Search the customer book"
                  onChange={(e) => {
                    setBookQuery(e.target.value);
                    setBookPage(1);
                  }}
                />
                {bookQuery ? (
                  <button
                    className={styles.srchX}
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setBookQuery("");
                      setBookPage(1);
                    }}
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
                  <span className={styles.ddValue} data-f={bookFilter}>
                    {bookOptions.find((o) => o.key === bookFilter)?.label ?? "All"} ·{" "}
                    {bookCounts[bookFilter] ?? 0}
                  </span>
                  <Icon id="i-chev" className={`${styles.ic} ${styles.ddCaret}`} />
                </button>
                <div className={styles.ddMenu} role="listbox">
                  {bookOptions.map((o) => (
                    <button
                      key={o.key}
                      className={`${styles.ddItem} ${bookFilter === o.key ? styles.active : ""}`}
                      type="button"
                      role="option"
                      aria-selected={bookFilter === o.key}
                      onClick={() => {
                        setBookFilter(o.key);
                        setBookPage(1);
                        setFilterOpen(false);
                      }}
                    >
                      {o.label}
                      <span className={styles.ddCount}>{bookCounts[o.key] ?? 0}</span>
                      {bookFilter === o.key ? <Icon id="i-check" /> : null}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "book" && (
            bookVisible.length === 0 ? (
              <div className={styles.empty}>
                {customers.length === 0 ? (
                  <>
                    <div className={styles.emptyT}>Book is empty</div>
                    <div className={styles.emptyS}>
                      An account joins the book on its first proposal. Send one and it appears here.
                    </div>
                    <button className={styles.emptyA} type="button">
                      <Icon id="i-fileplus" />New proposal
                    </button>
                  </>
                ) : (
                  <>
                    <div className={styles.emptyT}>No matches</div>
                    <div className={styles.emptyS}>
                      No customer matches that search and filter.
                    </div>
                    <button className={styles.emptyA} type="button" onClick={clearBook}>
                      <Icon id="i-x" />Clear filters
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className={styles.list}>
                {bookSlice.map((c, i) => (
                  <div
                    key={c.id}
                    className={`${styles.row} ${styles.rowIn} ${landedId === c.id ? styles.landed : ""}`}
                    style={{ animationDelay: `${i * 45}ms` }}
                  >
                    <span className={`${styles.cav} ${isCompany(c.name) ? styles.isCo : ""}`}>
                      {initials(c.name)}
                    </span>
                    <div className={styles.cname}>{c.name}</div>
                    <button
                      className={styles.rowOpen}
                      type="button"
                      aria-label={`Actions for ${c.name}`}
                      onClick={() => setSheet({ kind: "customer", id: c.id })}
                    >
                      <Icon id="i-dots" />
                    </button>
                    <div className={styles.cmail}>{c.email}</div>
                    <div className={styles.rowFoot}>
                      <span className={styles.rowMeta}>
                        <span className={`${styles.pstatus} ${styles[STATUS_CLS[c.top]] ?? ""}`}>
                          {titleCase(c.top)}
                        </span>
                        <span className={styles.rowMono}>
                          {c.quotes} quote{c.quotes === 1 ? "" : "s"}
                        </span>
                      </span>
                      {/* A figure of zero is an em dash, never "$0": zero is a
                          number, "nothing collected" is an absence. */}
                      <span className={`${styles.rowFig} ${c.ltv ? "" : styles.isZero}`}>
                        {c.ltv ? money(c.ltv) : "—"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === "book" && (
            <Pager page={bookSafe} total={bookVisible.length} per={PAGE_BOOK} onGo={setBookPage} />
          )}

          {/* ============ TAB: WORKFLOWS ============ */}
          {tab === "rules" && (
            rules.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyT}>No rules yet</div>
                <div className={styles.emptyS}>
                  A rule schedules a follow-up when a proposal hits a status. Create one to start
                  automating reminders.
                </div>
                <button className={styles.emptyA} type="button" onClick={() => openRule(null)}>
                  <Icon id="i-plus" />New rule
                </button>
              </div>
            ) : (
              <div className={styles.list}>
                {rules.map((r, i) => (
                  <div
                    key={r.id}
                    className={`${styles.row} ${styles.rowB} ${styles.rowIn} ${landedId === r.id ? styles.landed : ""}`}
                    style={{ animationDelay: `${i * 45}ms` }}
                  >
                    <div className={styles.rname}>{r.name}</div>
                    <button
                      className={styles.rowOpen}
                      type="button"
                      aria-label={`Actions for ${r.name}`}
                      onClick={() => setSheet({ kind: "rule", id: r.id })}
                    >
                      <Icon id="i-dots" />
                    </button>
                    <div className={styles.rmeta}>
                      {triggerLabel(r.triggerStatus)}
                      {r.template ? ` · ${r.template}` : " · no template"}
                    </div>
                    <div className={styles.rowFoot}>
                      <span className={styles.rowMeta}>
                        <span className={`${styles.pstatus} ${r.enabled ? styles.rstOn : styles.rstOff}`}>
                          {r.enabled ? "active" : "off"}
                        </span>
                        {/* A drawn switch: the native control carries neither
                            the ink frame nor a 44px tap height. */}
                        <button
                          className={styles.tgl}
                          type="button"
                          aria-pressed={r.enabled}
                          aria-label={`${r.enabled ? "Disable" : "Enable"} ${r.name}`}
                          onClick={() => toggleRule(r.id)}
                        >
                          <span className={styles.tglTrack}>
                            <span className={styles.tglKnob} />
                          </span>
                        </button>
                      </span>
                      <span className={styles.rowFig}>{humanDelay(r.delayMinutes)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* ============ TAB: FOLLOW-UP QUEUE ============ */}
          {tab === "queue" && queue.length > 0 && (
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
                <span className={styles.ddValue} data-f={qFilter}>
                  {QUEUE_FILTERS.find((f) => f.key === qFilter)?.label ?? "All"} · {qCounts[qFilter]}
                </span>
                <Icon id="i-chev" className={`${styles.ic} ${styles.ddCaret}`} />
              </button>
              <div className={styles.ddMenu} role="listbox">
                {QUEUE_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    className={`${styles.ddItem} ${qFilter === f.key ? styles.active : ""}`}
                    type="button"
                    role="option"
                    aria-selected={qFilter === f.key}
                    onClick={() => {
                      setQFilter(f.key);
                      setQPage(1);
                      setFilterOpen(false);
                    }}
                  >
                    {f.label}
                    <span className={styles.ddCount}>{qCounts[f.key]}</span>
                    {qFilter === f.key ? <Icon id="i-check" /> : null}
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === "queue" && (
            qVisible.length === 0 ? (
              <div className={styles.empty}>
                {queue.length === 0 ? (
                  <>
                    <div className={styles.emptyT}>Queue is clear</div>
                    <div className={styles.emptyS}>
                      Follow-ups are scheduled by your workflow rules. When proposals trigger them,
                      they land here.
                    </div>
                    <button className={styles.emptyA} type="button" onClick={() => openRule(null)}>
                      <Icon id="i-plus" />New rule
                    </button>
                  </>
                ) : (
                  <>
                    <div className={styles.emptyT}>No matches</div>
                    <div className={styles.emptyS}>
                      Nothing in the queue is {qFilter === "DUE" ? "overdue" : "scheduled ahead"}{" "}
                      right now.
                    </div>
                    <button
                      className={styles.emptyA}
                      type="button"
                      onClick={() => {
                        setQFilter("ALL");
                        setQPage(1);
                      }}
                    >
                      <Icon id="i-x" />Clear filter
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className={styles.list}>
                {qSlice.map((q, i) => {
                  const sev = severity(q);
                  return (
                    <div
                      key={q.id}
                      className={`${styles.row} ${styles.rowB} ${styles.rowIn} ${gone.includes(q.id) ? styles.gone : ""} ${landedId === q.id ? styles.landed : ""}`}
                      style={{ animationDelay: `${i * 45}ms` }}
                    >
                      <div className={styles.qwho}>{q.client}</div>
                      <button
                        className={styles.rowOpen}
                        type="button"
                        aria-label={`Actions for the ${q.client} follow-up`}
                        onClick={() => setSheet({ kind: "queue", id: q.id })}
                      >
                        <Icon id="i-dots" />
                      </button>
                      <div className={styles.qtitle}>{q.title ?? "Follow-up"}</div>
                      <div className={styles.rowFoot}>
                        <span className={styles.rowMeta}>
                          <span className={`${styles.sev} ${styles[sev.cls]}`}>{sev.label}</span>
                          <span className={styles.rowMono}>{q.date}</span>
                        </span>
                        <button className={styles.qsend} type="button" onClick={() => dropQueue(q.id)}>
                          <Icon id="i-send" />Send
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {tab === "queue" && (
            <Pager page={qSafe} total={qVisible.length} per={PAGE_QUEUE} onGo={setQPage} />
          )}
        </div>
      </main>

      {/* No floating action button: the page's one create action lives in the
          head, so nothing needs to hover over the content. */}

      {/* ============ SHEET SCRIM (shared by both sheets) ============ */}
      <div
        className={`${styles.scrim} ${anyOverlay ? styles.on : ""}`}
        onClick={() => {
          setSheet(null);
          setRuleOpen(false);
        }}
        aria-hidden="true"
      />

      {/* ============ ROW ACTIONS SHEET ============ */}
      <div
        className={`${styles.sheet} ${sheetView ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Record actions"
        aria-hidden={!sheetView}
        {...actionsDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...actionsDrag.handleProps} />
        <div className={styles.sheetHead} {...actionsDrag.handleProps}>
          <div className={styles.sheetKicker}>{sheetView?.kicker ?? "CRM · —"}</div>
          <div className={styles.sheetTitle}>{sheetView?.title ?? "Actions"}</div>
        </div>
        <div className={styles.sheetBody}>
          {(sheetView?.rows ?? []).map((r) => (
            <button
              key={r.act}
              type="button"
              disabled={r.disabled}
              className={`${styles.cmenuItem} ${r.danger ? styles.cmenuItemDanger : ""}`}
              onClick={() => runSheet(r.act)}
            >
              <span className={`${styles.mIc} ${r.tone ?? ""}`}>
                <Icon id={r.icon} />
              </span>
              <span>
                <span className={styles.cmenuItemT}>{r.title}</span>
                <span className={styles.cmenuItemS}>{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setSheet(null)}>
          Cancel
        </button>
      </div>

      {/* ============ RULE FORM SHEET ============ */}
      <div
        className={`${styles.sheet} ${ruleOpen ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcrRuleTitle"
        aria-hidden={!ruleOpen}
        {...ruleDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...ruleDrag.handleProps} />
        <div className={styles.sheetHead} {...ruleDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {editingId ? "Workflows / edit rule" : "Workflows / new rule"}
          </div>
          <div className={styles.sheetTitle} id="mcrRuleTitle">
            {editingId ? "Edit rule" : "New rule"}
          </div>
        </div>
        <form
          className={`${styles.sheetBody} ${styles.formBody}`}
          id="mcrRuleForm"
          noValidate
          onSubmit={submitRule}
        >
          <div className={`${styles.fld} ${nameErr ? styles.invalid : ""}`}>
            <label className={styles.fldLbl} htmlFor="mcrName">
              Rule name<span className={styles.req}>*</span>
            </label>
            <input
              ref={nameRef}
              className={styles.pinput}
              id="mcrName"
              name="name"
              type="text"
              placeholder="Nudge after send"
              autoComplete="off"
              value={form.name}
              aria-invalid={nameErr}
              aria-describedby={nameErr ? "mcrNameErr" : undefined}
              onChange={(e) => {
                setForm((f) => ({ ...f, name: e.target.value }));
                if (e.target.value.trim()) setNameErr(false);
              }}
            />
            {nameErr ? (
              <span className={styles.fldErr} id="mcrNameErr">
                Enter a rule name
              </span>
            ) : null}
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mcrTrigger">
              Trigger
            </label>
            <span className={styles.pselBox}>
              <select
                className={styles.psel}
                id="mcrTrigger"
                name="trigger"
                value={form.trigger}
                onChange={(e) => setForm((f) => ({ ...f, trigger: e.target.value }))}
              >
                {TRIGGERS.map((t) => (
                  <option value={t.value} key={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <Icon id="i-chev" className={`${styles.ic} ${styles.pselCaret}`} />
            </span>
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mcrDays">
              Delay (days)
            </label>
            <input
              className={styles.pinput}
              id="mcrDays"
              name="days"
              type="number"
              min="1"
              inputMode="numeric"
              value={form.days}
              onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}
            />
            <span className={styles.fldHint}>
              How long after the trigger the follow-up is scheduled.
            </span>
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mcrTemplate">
              Template
            </label>
            <span className={styles.pselBox}>
              <select
                className={styles.psel}
                id="mcrTemplate"
                name="template"
                value={form.template}
                onChange={(e) => setForm((f) => ({ ...f, template: e.target.value }))}
              >
                <option value="">None</option>
                {TEMPLATES.map((t) => (
                  <option value={t} key={t}>
                    {t}
                  </option>
                ))}
              </select>
              <Icon id="i-chev" className={`${styles.ic} ${styles.pselCaret}`} />
            </span>
            <span className={styles.fldHint}>
              Variables like <code>{"{{client_name}}"}</code> and <code>{"{{link}}"}</code> are
              substituted at send. Leave it on None to write the message yourself.
            </span>
          </div>
        </form>
        <div className={styles.formFoot}>
          <button
            className={`${styles.btn} ${styles.btnGhost}`}
            type="button"
            onClick={() => setRuleOpen(false)}
          >
            Cancel
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" form="mcrRuleForm">
            <Icon id="i-check" />Save rule
          </button>
        </div>
      </div>
    </div>
  );
}
