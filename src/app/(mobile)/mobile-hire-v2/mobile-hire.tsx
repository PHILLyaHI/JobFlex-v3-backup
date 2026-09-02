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
// The data is REAL: the page component reads the org's pipeline, the caller's
// open-for-work profile, the trade-network tallies and the talent directory,
// and every board action here calls the same applicant server actions the
// desktop board calls — optimistically, with a rollback and a visible error
// when the server refuses. The marketplace doors open two working sheets:
// the talent directory (read) and the profile editor (setTradeNetworkOptIn).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import styles from "./mobile-hire.module.css";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import { lockScroll } from "@/lib/scrollLock";
import {
  appendApplicantNote,
  convertApplicantToWorker,
  createApplicant,
  deleteApplicant,
  getHireSeed,
  updateApplicantStatus,
} from "@/actions/applicants";
import {
  discoverTradeProfiles,
  getMyTradeJobs,
  getTradeInbox,
  getTradeNetworkProfile,
  setTradeNetworkOptIn,
  type DiscoverProfileDTO,
} from "@/actions/tradeServices";
import type { TradeNetworkProfileDTO } from "@/app/(mobile)/trade-services/trade-data";
import {
  ALL,
  HK_COLUMNS,
  HUB_DOORS,
  HUB_LINKS,
  PAGE_SIZE,
  SOURCES,
  matchesQuery,
  matchesStage,
  monogram,
  stageCount,
  stageLabel,
  type Applicant,
  type HireColumnKey,
  type HireTallies,
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

/** Server actions reject with an Error whose message is written for the user
 *  ("Manager access required", "Not found"). Surface that text; fall back to a
 *  generic line for anything unrecognisable. */
function actionError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  if (!msg || msg.toLowerCase().includes("fetch failed")) {
    return "Something went wrong. Check your connection and try again.";
  }
  return msg;
}

/** `appendApplicantNote` writes "YYYY-MM-DD HH:MM — text" blocks separated by
 *  a blank line — the format the desktop sheet parses back out too. */
function noteEntries(raw: string) {
  if (!raw.trim()) return [] as Array<{ stamp: string; text: string }>;
  return raw.split(/\n\n+/).map((block) => {
    const m = block.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}) — ([\s\S]+)/);
    return m ? { stamp: m[1], text: m[2] } : { stamp: "", text: block };
  });
}

const EMPTY_PROFILE: TradeNetworkProfileDTO = {
  optIn: false,
  tradeTypes: [],
  specialties: [],
  serviceArea: null,
};
const EMPTY_TALLIES: HireTallies = {
  hired: 0,
  openPosts: 0,
  totalPosts: 0,
  interestReceived: 0,
  interestSent: 0,
};

/**
 * Two mounts, one component:
 * - the /mobile-hire-v2 page seeds every prop server-side (no flash);
 * - the responsive shell's ≤768px switch on /dashboard/hire mounts it BARE,
 *   so with no props the component reads the same actions itself on mount.
 */
export function MobileHire({
  applicants,
  profile: initialProfile,
  tallies: initialTallies,
  talent: initialTalent,
}: {
  applicants?: Applicant[];
  profile?: TradeNetworkProfileDTO;
  tallies?: HireTallies;
  talent?: DiscoverProfileDTO[];
}) {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  /* Cloned per mount: the row sheet and the form mutate this list before the
     server confirms, and a rollback needs the props copy untouched. */
  const [data, setData] = useState<Applicant[]>(() => (applicants ?? []).map((a) => ({ ...a })));
  /* False only on the bare mount, until the self-fetch lands — it gates the
     "No applicants yet" empty state so a loading board never claims to be one. */
  const [ready, setReady] = useState(Boolean(applicants));
  const [tallies, setTallies] = useState<HireTallies>(initialTallies ?? EMPTY_TALLIES);
  const [talent, setTalent] = useState<DiscoverProfileDTO[]>(initialTalent ?? []);

  const selfFetch = !applicants;

  const [tab, setTab] = useState<TabKey>("pipeline");
  const [stage, setStage] = useState<StageKey>(ALL);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [landedId, setLandedId] = useState<string | null>(null);
  /** A rolled-back write is never silent — the action's own message lands
      here, above the list it failed to change. */
  const [err, setErr] = useState<string | null>(null);
  /** Two-tap arming for the sheet rows that cannot be taken back: delete, and
      convert-to-worker (it emails a portal invite). */
  const [armed, setArmed] = useState<string | null>(null);

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
  const [emailErr, setEmailErr] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  /* ---- marketplace: the two door sheets ---- */
  const [talentOpen, setTalentOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState<TradeNetworkProfileDTO>(initialProfile ?? EMPTY_PROFILE);
  const [prof, setProf] = useState(() => {
    const p = initialProfile ?? EMPTY_PROFILE;
    return {
      optIn: p.optIn,
      trades: p.tradeTypes.join(", "),
      specialties: p.specialties.join(", "),
      area: p.serviceArea ?? "",
    };
  });
  const [profErr, setProfErr] = useState<string | null>(null);
  const [profSaving, setProfSaving] = useState(false);

  const filterRef = useRef<HTMLDivElement>(null);

  /* ---------- bare mount: read the same seed the page reads --------------
     Only the responsive shell's switch takes this path; the standalone route
     arrives fully seeded and skips it. */
  useEffect(() => {
    if (!selfFetch) return;
    let cancelled = false;
    (async () => {
      try {
        const [seed, prof, jobs, inbox, tal] = await Promise.all([
          getHireSeed(),
          getTradeNetworkProfile(),
          getMyTradeJobs(),
          getTradeInbox(),
          discoverTradeProfiles(),
        ]);
        if (cancelled) return;
        setData(seed.map((a) => ({ ...a })));
        setProfile(prof);
        setTalent(tal);
        setTallies({
          hired: seed.filter((a) => a.status === "HIRED").length,
          openPosts: jobs.filter((j) => j.status === "OPEN").length,
          totalPosts: jobs.length,
          interestReceived: jobs.reduce((n, j) => n + j.interestedCount, 0),
          interestSent: inbox.engaged.length,
        });
        setReady(true);
      } catch (e) {
        if (cancelled) return;
        setErr(actionError(e));
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot seed
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
      else if (profileOpen) setProfileOpen(false);
      else if (talentOpen) setTalentOpen(false);
      else if (sheetId) { setArmed(null); setSheetId(null); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filterOpen, formOpen, profileOpen, talentOpen, sheetId]);

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

  /* The marketplace tab's badge is the org's real trade-network activity:
     open posts plus interest in both directions. */
  const marketTotal = tallies.openPosts + tallies.interestReceived + tallies.interestSent;
  const tabCount: Record<TabKey, number> = { pipeline: data.length, market: marketTotal };

  /* "Your activity" — every number is real, and there is no contracts tile
     because there is no contracts model: the third slot counts hires. The
     Hired figure tracks the live board, not the mount-time snapshot. */
  const tallyRows = useMemo(
    () => [
      {
        label: "Hired",
        value: hiredCount,
        hint: hiredCount ? "From your pipeline" : "No hires yet",
      },
      {
        label: "Job posts",
        value: tallies.openPosts,
        hint: tallies.totalPosts
          ? tallies.openPosts
            ? `Open now · ${tallies.totalPosts} posted`
            : `None open · ${tallies.totalPosts} posted`
          : "None posted",
      },
      {
        label: "Interest",
        value: tallies.interestReceived + tallies.interestSent,
        hint: `${tallies.interestReceived} received · ${tallies.interestSent} sent`,
      },
    ],
    [hiredCount, tallies],
  );

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
  const editApplicant = editId === null ? null : (data.find((a) => a.id === editId) ?? null);
  const tabIndex = TABS.findIndex((t) => t.key === tab);

  const resetFilters = () => {
    setStage(ALL);
    setQuery("");
    setPage(1);
  };

  /* ---------- row sheet ------------------------------------------------ */
  const convertArm = sheetApplicant?.status === "HIRED";
  const menuRows = useMemo<MenuRow[]>(() => {
    const a = sheetApplicant;
    if (!a) return [];
    const adv = ADVANCE[a.status];
    const advArmed = a.status === "HIRED" && armed === "advance";
    return [
      { act: "open", icon: "i-user", tone: styles.hmiBp, title: "Open candidate",
        sub: "Role, contact and notes" },
      { act: "call", icon: "i-phone", tone: styles.hmiSky, title: "Call",
        sub: a.phone ?? "No phone on file", disabled: !a.phone },
      { act: "mail", icon: "i-mail", tone: styles.hmiOk, title: "Send email",
        sub: a.email ?? "No email on file", disabled: !a.email },
      { act: "advance", icon: adv.icon, tone: adv.tone,
        title: advArmed ? "Tap again to convert" : adv.title,
        sub: advArmed ? "Sends them a worker portal invite" : adv.sub },
      { act: "reject", icon: "i-x", title: "Reject candidate",
        sub: a.status === "REJECTED" ? "Already rejected" : "Moves into Rejected",
        disabled: a.status === "REJECTED" },
      { act: "del", icon: "i-trash", tone: styles.hmiDanger,
        title: armed === "del" ? "Tap again to delete" : "Delete applicant",
        sub: "Removes the record permanently", danger: true },
    ];
  }, [sheetApplicant, armed]);

  const openEdit = (a: Applicant) => {
    setEditId(a.id);
    // Identity fields ride along read-only; `notes` is the NEW entry — the
    // data layer appends stamped notes, it never rewrites the column.
    setForm({
      name: a.name,
      role: a.role,
      email: a.email ?? "",
      phone: a.phone ?? "",
      source: a.source ?? "Other",
      notes: "",
    });
    setStageDraft(a.status);
    setNameErr(false);
    setEmailErr(false);
    setFormErr(null);
    setFormOpen(true);
  };

  /** A stage move, optimistic: the row lands in its new stage immediately and
   *  rolls back — with the server's own message — if the write is refused. */
  const moveStatus = async (a: Applicant, next: HireColumnKey) => {
    const prev = a.status;
    setErr(null);
    setData((cur) => cur.map((x) => (x.id === a.id ? { ...x, status: next } : x)));
    setLandedId(a.id);
    try {
      await updateApplicantStatus(a.id, next);
    } catch (e) {
      setData((cur) => cur.map((x) => (x.id === a.id ? { ...x, status: prev } : x)));
      setErr(actionError(e));
    }
  };

  const runMenu = (act: string) => {
    const a = sheetApplicant;
    if (!a) {
      setSheetId(null);
      return;
    }
    // The irreversible rows arm on the first tap and fire on the second —
    // the sheet stays open in between so the relabel is visible.
    if (act === "del" && armed !== "del") {
      setArmed("del");
      return;
    }
    if (act === "advance" && convertArm && armed !== "advance") {
      setArmed("advance");
      return;
    }
    setArmed(null);
    setSheetId(null);
    if (act === "open") {
      openEdit(a);
      return;
    }
    if (act === "del") {
      const snapshot = data;
      setErr(null);
      setData((cur) => cur.filter((x) => x.id !== a.id));
      void deleteApplicant(a.id).catch((e) => {
        setData(snapshot);
        setErr(actionError(e));
      });
      return;
    }
    if (act === "advance") {
      if (a.status === "HIRED") {
        // Convert to worker: already HIRED, so the visible change is the
        // flash; the write creates the invite.
        setErr(null);
        setLandedId(a.id);
        void convertApplicantToWorker(a.id).catch((e) => setErr(actionError(e)));
        return;
      }
      void moveStatus(a, ADVANCE[a.status].next);
      return;
    }
    if (act === "reject") {
      void moveStatus(a, "REJECTED");
      return;
    }
    // The contact rows leave the app: tel:/mailto: hand off to the dialer or
    // the mail client with the value the sheet just showed.
    if (act === "call" && a.phone) {
      window.location.assign(`tel:${a.phone.replace(/[^\d+]/g, "")}`);
      return;
    }
    if (act === "mail" && a.email) {
      window.location.assign(`mailto:${encodeURIComponent(a.email)}`);
      return;
    }
  };

  /* ---------- candidate form ------------------------------------------- */
  const openAdd = () => {
    setEditId(null);
    setForm({ name: "", role: "", email: "", phone: "", source: SOURCES[0], notes: "" });
    setStageDraft("APPLIED");
    setNameErr(false);
    setEmailErr(false);
    setFormErr(null);
    setFormOpen(true);
    // Focus after the slide settles — focusing mid-transform makes the keyboard
    // fight the animation.
    window.setTimeout(() => nameRef.current?.focus(), prefersReducedMotion() ? 0 : 320);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formSaving) return;

    if (editId) {
      // Edit = the two writes the data layer supports: a stage move and a new
      // stamped note. Identity fields are read-only in this sheet.
      const a = data.find((x) => x.id === editId);
      if (!a) {
        setFormOpen(false);
        return;
      }
      const statusChanged = a.status !== stageDraft;
      const text = form.notes.trim();
      if (!statusChanged && !text) {
        setFormOpen(false);
        return;
      }
      setFormErr(null);
      setFormSaving(true);
      try {
        if (statusChanged) await updateApplicantStatus(editId, stageDraft);
        if (text) await appendApplicantNote(editId, text);
        const stamped = `${new Date().toISOString().slice(0, 16).replace("T", " ")} — ${text}`;
        setData((prev) =>
          prev.map((x) =>
            x.id === editId
              ? {
                  ...x,
                  status: stageDraft,
                  notes: text ? (x.notes ? `${x.notes}\n\n${stamped}` : stamped) : x.notes,
                }
              : x,
          ),
        );
        setLandedId(editId);
        setFormSaving(false);
        setFormOpen(false);
      } catch (e2) {
        setFormSaving(false);
        setFormErr(actionError(e2));
      }
      return;
    }

    // Add: the server's contract — a name, a role, and a real email address
    // (the applicant's only identity on the record).
    const name = form.name.trim();
    if (!name) {
      setNameErr(true);
      nameRef.current?.focus();
      return;
    }
    const email = form.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailErr(true);
      return;
    }
    const phone = form.phone.trim() || null;
    const source = form.source || "Other";
    const notes = form.notes.trim();
    const role = form.role.trim() || "Crew";

    setFormErr(null);
    setFormSaving(true);
    try {
      const created = await createApplicant({
        fullName: name,
        email,
        phone,
        role,
        source,
        notes: notes || null,
      });
      const rec: Applicant = {
        id: created.id,
        name,
        role,
        email,
        phone,
        source,
        status: "APPLIED",
        age: "just now",
        notes,
      };
      setData((prev) => [rec, ...prev]);
      resetFilters();
      setTab("pipeline");
      setLandedId(rec.id);
      setFormSaving(false);
      setFormOpen(false);
    } catch (e2) {
      setFormSaving(false);
      setFormErr(actionError(e2));
    }
  };

  /* ---------- profile sheet (Publish your profile) ---------------------- */
  const openProfile = () => {
    setProf({
      optIn: profile.optIn,
      trades: profile.tradeTypes.join(", "),
      specialties: profile.specialties.join(", "),
      area: profile.serviceArea ?? "",
    });
    setProfErr(null);
    setProfileOpen(true);
  };

  const csv = (raw: string) =>
    raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 40);

  const saveProfile = async () => {
    if (profSaving) return;
    setProfErr(null);
    setProfSaving(true);
    try {
      const saved = await setTradeNetworkOptIn({
        optIn: prof.optIn,
        tradeTypes: csv(prof.trades),
        specialties: csv(prof.specialties),
        serviceArea: prof.area.trim() || null,
      });
      setProfile(saved);
      setProfSaving(false);
      setProfileOpen(false);
    } catch (e) {
      setProfSaving(false);
      setProfErr(actionError(e));
    }
  };

  const anyOverlay = Boolean(sheetApplicant) || formOpen || talentOpen || profileOpen;

  // Swipe-down dismissal, one gesture per sheet, on the same setters the
  // Escape ladder uses.
  const actionsDrag = useSheetDrag(Boolean(sheetApplicant), () => setSheetId(null));
  const formDrag = useSheetDrag(formOpen, () => setFormOpen(false));
  const talentDrag = useSheetDrag(talentOpen, () => setTalentOpen(false));
  const profileDrag = useSheetDrag(profileOpen, () => setProfileOpen(false));

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

          {/* A refused write rolls the row back — and says why, right here. */}
          {tab === "pipeline" && err ? (
            <div className={styles.merr} role="alert">
              <span className={styles.merrTxt}>{err}</span>
              <button
                className={styles.merrX}
                type="button"
                aria-label="Dismiss error"
                onClick={() => setErr(null)}
              >
                <Icon id="i-x" />
              </button>
            </div>
          ) : null}

          {tab === "pipeline" && (
            visible.length === 0 ? (
              !ready ? null : (
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
              )
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
                      aria-label={`Actions for ${a.name}`}
                      onClick={() => { setArmed(null); setSheetId(a.id); }}>
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
                <span className={styles.hflagDot} />
                {profile.optIn ? "Listed" : "Not listed"}
              </span>
              <span className={styles.hnoteTxt}>
                {profile.optIn
                  ? "Your company is open for work — matching trade jobs land in your inbox."
                  : "Your company is not listed. Publish your profile to receive trade jobs."}
              </span>
            </div>
          )}

          {tab === "market" && (
            <div className={styles.hcard}>
              {HUB_DOORS.map((d) => (
                <button key={d.title}
                  className={styles.hdoor}
                  type="button"
                  onClick={() => (d.sheet === "talent" ? setTalentOpen(true) : openProfile())}>
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
              {tallyRows.map((t) => (
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
                  className={styles.hlink}
                  type="button"
                  onClick={() =>
                    l.goto ? setTab("pipeline") : l.href ? router.push(l.href as Route) : undefined
                  }>
                  <span className={styles.hlinkIc}><Icon id={l.icon} /></span>
                  <span className={styles.hlinkTxt}>
                    <span className={styles.hlinkT}>{l.label}</span>
                    <span className={styles.hlinkS}>{l.sub}</span>
                  </span>
                  <Icon id="i-arrow" className={`${styles.ic} ${styles.hlinkGo}`} />
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ============ SHEET SCRIM (shared by both sheets) ============ */}
      <div
        className={`${styles.scrim} ${anyOverlay ? styles.on : ""}`}
        onClick={() => {
          setArmed(null);
          setSheetId(null);
          setFormOpen(false);
          setTalentOpen(false);
          setProfileOpen(false);
        }}
        aria-hidden="true"
      />

      {/* ============ ROW ACTIONS SHEET ============ */}
      <div className={`${styles.sheet} ${sheetApplicant ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-label="Candidate actions" aria-hidden={!sheetApplicant} {...actionsDrag.sheetProps}>
        <div className={styles.sheetGrab} {...actionsDrag.handleProps} />
        <div className={styles.sheetHead} {...actionsDrag.handleProps}>
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
        <button className={styles.sheetCancel} type="button"
          onClick={() => { setArmed(null); setSheetId(null); }}>Cancel</button>
      </div>

      {/* ============ CANDIDATE SHEET — the donor's add form AND its
          detail panel, one sheet. Role / Email / Phone / Source are
          editable fields rather than read-only rows, and "Applied" rides
          the sheet kicker. ============ */}
      <div className={`${styles.sheet} ${formOpen ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-labelledby="mhFormTitle" aria-hidden={!formOpen} {...formDrag.sheetProps}>
        <div className={styles.sheetGrab} {...formDrag.handleProps} />
        <div className={styles.sheetHead} {...formDrag.handleProps}>
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
          {editApplicant ? (
            /* The record's identity, read-only: the data layer supports a
               stage move and an appended note — nothing else — so the sheet
               does not offer edits it could not save. */
            <div className={styles.metaBox}>
              <div className={styles.metaRow}>
                <span className={styles.metaLbl}>Role</span>
                <span>{editApplicant.role}</span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaLbl}>Email</span>
                <span>{editApplicant.email ?? "—"}</span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaLbl}>Phone</span>
                <span>{editApplicant.phone ?? "—"}</span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaLbl}>Source</span>
                <span>{editApplicant.source ?? "Other"}</span>
              </div>
              {editApplicant.resumeUrl ? (
                <div className={styles.metaRow}>
                  <span className={styles.metaLbl}>Resume</span>
                  <span>
                    {/^https?:\/\//i.test(editApplicant.resumeUrl) ? (
                      <a className={styles.metaLink} href={editApplicant.resumeUrl}
                        target="_blank" rel="noopener noreferrer">
                        Open resume
                      </a>
                    ) : (
                      editApplicant.resumeUrl
                    )}
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <>
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

              <div className={`${styles.fld} ${emailErr ? styles.invalid : ""}`}>
                <label className={styles.fldLbl} htmlFor="mhEmail">
                  Email<span className={styles.req}>*</span>
                </label>
                <input className={styles.pinput} id="mhEmail" name="email" type="email"
                  placeholder="casey@example.com" autoComplete="off" value={form.email}
                  aria-invalid={emailErr} aria-describedby={emailErr ? "mhEmailErr" : undefined}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, email: e.target.value }));
                    if (e.target.value.trim()) setEmailErr(false);
                  }} />
                {emailErr ? (
                  <span className={styles.fldErr} id="mhEmailErr">A valid email is required</span>
                ) : (
                  <span className={styles.fldHint}>The applicant’s only identity on the record.</span>
                )}
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
            </>
          )}

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

          {/* The note column is APPEND-ONLY on the server: the history reads
              back as a dated ledger, and the textarea is a NEW entry. */}
          {editApplicant && editApplicant.notes.trim() ? (
            <div className={styles.fld}>
              <span className={styles.fldLbl}>Notes</span>
              <ul className={styles.noteLog}>
                {noteEntries(editApplicant.notes).map((n, i) => (
                  <li className={styles.noteItem} key={i}>
                    {n.stamp ? <span className={styles.noteStamp}>{n.stamp}</span> : null}
                    <span className={styles.noteTxt}>{n.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mhNotes">
              {editId ? "Add a note" : "Notes"}
            </label>
            <textarea className={styles.parea} id="mhNotes" name="notes" rows={3}
              placeholder={editId
                ? "Interview observations, follow-ups, decisions."
                : "Years of experience, specialties, schedule constraints…"}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>

          {formErr ? <div className={styles.formErrLine} role="alert">{formErr}</div> : null}
        </form>
        {/* The submit pair sits in a beige foot OUTSIDE the scrolling body, so it
            is reachable without scrolling the form to its end. */}
        <div className={styles.formFoot}>
          <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => setFormOpen(false)}>
            Cancel
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" form="mhForm" disabled={formSaving}>
            <Icon id="i-check" />
            {formSaving ? (editId ? "Saving…" : "Adding…") : editId ? "Save candidate" : "Add applicant"}
          </button>
        </div>
      </div>

      {/* ============ TALENT SHEET — other orgs' opted-in profiles ============ */}
      <div className={`${styles.sheet} ${talentOpen ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-label="Talent directory" aria-hidden={!talentOpen} {...talentDrag.sheetProps}>
        <div className={styles.sheetGrab} {...talentDrag.handleProps} />
        <div className={styles.sheetHead} {...talentDrag.handleProps}>
          <div className={styles.sheetKicker}>
            Marketplace · {talent.length} {talent.length === 1 ? "company" : "companies"} listed
          </div>
          <div className={styles.sheetTitle}>Talent directory</div>
        </div>
        <div className={styles.sheetBody}>
          {talent.length === 0 ? (
            <div className={styles.talEmpty}>
              <div className={styles.hemptyT}>No companies are open for work yet</div>
              <div className={styles.hemptyS}>
                Profiles that switch on “Open for work” appear here.
              </div>
            </div>
          ) : (
            talent.map((p) => (
              <div className={styles.talRow} key={p.id}>
                <span className={styles.hlinkIc}><Icon id="i-hardhat" /></span>
                <span className={styles.talMain}>
                  <span className={styles.talName}>{p.company ?? p.name}</span>
                  {p.company && p.name !== p.company ? (
                    <span className={styles.talWho}>{p.name}</span>
                  ) : null}
                  {p.tradeTypes.length || p.specialties.length ? (
                    <span className={styles.talSub}>
                      {p.tradeTypes.join(" · ")}
                      {p.tradeTypes.length && p.specialties.length ? " — " : ""}
                      {p.specialties.join(", ")}
                    </span>
                  ) : null}
                  {p.serviceArea ? <span className={styles.talArea}>{p.serviceArea}</span> : null}
                </span>
              </div>
            ))
          )}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setTalentOpen(false)}>Close</button>
      </div>

      {/* ============ PROFILE SHEET — the caller's TradeNetworkProfile ============ */}
      <div className={`${styles.sheet} ${profileOpen ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-labelledby="mhProfTitle" aria-hidden={!profileOpen} {...profileDrag.sheetProps}>
        <div className={styles.sheetGrab} {...profileDrag.handleProps} />
        <div className={styles.sheetHead} {...profileDrag.handleProps}>
          <div className={styles.sheetKicker}>
            Marketplace · {profile.optIn ? "listed" : "not listed"}
          </div>
          <div className={styles.sheetTitle} id="mhProfTitle">Your public profile</div>
        </div>
        <div className={`${styles.sheetBody} ${styles.formBody}`}>
          <div className={styles.fld}>
            <span className={styles.fldLbl}>Listing</span>
            <div className={styles.pick} role="group" aria-label="Listing">
              <button className={`${styles.pickBtn} ${prof.optIn ? styles.on : ""}`} type="button"
                aria-pressed={prof.optIn}
                onClick={() => setProf((p) => ({ ...p, optIn: true }))}>
                Open for work
              </button>
              <button className={`${styles.pickBtn} ${prof.optIn ? "" : styles.on}`} type="button"
                aria-pressed={!prof.optIn}
                onClick={() => setProf((p) => ({ ...p, optIn: false }))}>
                Not listed
              </button>
            </div>
            <span className={styles.fldHint}>
              Listed profiles appear in other companies’ talent directories and receive matching trade jobs.
            </span>
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mhProfTrades">Trades</label>
            <input className={styles.pinput} id="mhProfTrades" type="text" autoComplete="off"
              placeholder="Roofing, Fencing, General contracting" value={prof.trades}
              onChange={(e) => setProf((p) => ({ ...p, trades: e.target.value }))} />
            <span className={styles.fldHint}>Comma-separated.</span>
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mhProfSpecs">Specialties</label>
            <input className={styles.pinput} id="mhProfSpecs" type="text" autoComplete="off"
              placeholder="Metal roofs, cedar fences, decks" value={prof.specialties}
              onChange={(e) => setProf((p) => ({ ...p, specialties: e.target.value }))} />
            <span className={styles.fldHint}>Comma-separated.</span>
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="mhProfArea">Service area</label>
            <input className={styles.pinput} id="mhProfArea" type="text" autoComplete="off"
              placeholder="King County, WA" value={prof.area}
              onChange={(e) => setProf((p) => ({ ...p, area: e.target.value }))} />
          </div>

          {profErr ? <div className={styles.formErrLine} role="alert">{profErr}</div> : null}
        </div>
        <div className={styles.formFoot}>
          <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => setProfileOpen(false)}>
            Cancel
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" disabled={profSaving}
            onClick={() => void saveProfile()}>
            <Icon id="i-check" />{profSaving ? "Saving…" : "Save profile"}
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
