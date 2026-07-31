"use client";

// MOBILE SMART PROPOSAL (mobile-advanced-ai-v2) — Blueprint system, handheld build.
//
// Archetype C: a COMPOSER / WIZARD. The desktop surface is a tall intake console
// (three numbered steps stacked in one card) that swaps itself for a two-column
// estimate studio once a job has been priced. Neither half survives 320px as
// drawn, so both are re-cut:
//
//   INTAKE — one step visible at a time, full width. Progress is a mono
//   "STEP 2 / 4" plate over a drawn rule filled to the fraction; a sticky commit
//   foot outside the scroller holds Back (ghost) and Next / Generate (primary).
//   Steps validate on Next and nothing is lost going backwards. The desktop's
//   three steps gain a fourth — Review — because on a phone you cannot see what
//   you are about to price, and each recap row jumps back to the step that owns
//   it.
//
//   GENERATION — the donor's one-line status ticker becomes the peak moment of
//   the flow: the four stages are drawn as a checklist that ticks through on the
//   donor's exact 620ms interval.
//
//   STUDIO — the desktop's `st-grid` (main column + 330px sidebar) unstacks into
//   one column: masthead, identity, scope, materials, labor, assumptions,
//   totals, refine. The 6-column line-item tables cannot be shown at 320px and
//   columns are NOT hidden: every line becomes a three-line row card, and
//   editing moves into a form sheet with real 15px inputs instead of 32px
//   inline cells.
//
// Every component / region / behaviour of the desktop sheet is covered:
//  · project types, the "Other work" free-text field, location + State select
//  · the brief textarea and all four sample briefs
//  · the narrated generation, with the donor's stages and timing
//  · scope, materials, labor, assumptions, totals, margin, client price
//  · add / edit / duplicate / move / remove line
//  · refine → real computed diff → Discard or Apply, and Undo after Apply
//  · Start over (two-tap confirm) and Convert to proposal (flash confirmation)
//
// What changes versus the desktop, and why:
//  · The location field runs REAL Google Places suggestions, through the same
//    blueprint-shell/places-suggest module the desktop pages use, wrapped for
//    React by mobile-shell/address-field. It was a local gazetteer while the
//    layout was being built; the owner asked for the real thing on 2026-07-30.
//    cityOnly, because this field prices a region rather than locating a roof.
//  · The state <select> is a bottom-sheet picker (mobile-shell/state-picker).
//    A native select coloured its own options through the placeholder — the
//    whole list read washed out until a value was picked — and ignores row
//    height entirely on a phone. See that file's header for the full reasoning.
//  · The "⋮" affordances become bottom sheets — no hover on touch, and
//    CLAUDE.md prefers sheets over modals.
//  · The margin number input gains ± steppers: a 44px target beats a spinner.
//
// Content is the donor demo fixture by design: the data layer is out of scope
// until the layout is signed off.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./mobile-advanced-ai.module.css";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import { AddressField } from "@/components/v3/mobile-shell/address-field";
import { StatePicker } from "@/components/v3/mobile-shell/state-picker";
import { lockScroll } from "@/lib/scrollLock";
import {
  PROJECT_TYPES,
  SAMPLES,
  STAGES,
  STATES,
  cloneSeed,
  lineTotal,
  sumOf,
  type Group,
  type Line,
} from "./advanced-ai-data";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const STEP_COUNT = 4;
const STEP_NAMES = ["Project type", "Location", "The brief", "Review"];

function Icon({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ?? styles.ic} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

/**
 * 750ms easeOutCubic, counting from the PREVIOUS displayed value rather than
 * from zero. On mount that is the usual 0 → total sweep; when the margin moves
 * by a point the numeral travels only the few dollars it actually changed, so
 * the headline stays legible while it is being tuned. tabular-nums keep the
 * digit columns from jumping.
 */
function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = prev.current;
    prev.current = value;
    if (prefersReducedMotion() || from === value) {
      el.textContent = money(value);
      return;
    }
    let raf = 0;
    let t0: number | null = null;
    const frame = (t: number) => {
      if (t0 === null) t0 = t;
      const pr = Math.min(1, (t - t0) / 750);
      const e = 1 - Math.pow(1 - pr, 3);
      el.textContent = money(from + (value - from) * e);
      if (pr < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <div ref={ref} className={className}>
      {money(value)}
    </div>
  );
}

type Delta = {
  kind: "add" | "chg" | "rem";
  group: string;
  title: string;
  from?: string;
  to?: string;
  note?: string;
};
type Snapshot = { materials: Line[]; labor: Line[]; scope: string };
type Pending = { instructions: string; deltas: Delta[] };

type MenuRow = {
  act: string;
  icon: string;
  tone?: string;
  title: string;
  sub: string;
  disabled?: boolean;
  danger?: boolean;
};

const clone = (list: Line[]) => list.map((l) => ({ ...l }));

export function MobileSmartProposal() {
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  /* ---------- flow ------------------------------------------------------ */
  const [phase, setPhase] = useState<"intake" | "busy" | "studio">("intake");
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [stageIdx, setStageIdx] = useState(0);

  /* ---------- intake input (never cleared by going back) ---------------- */
  const [type, setType] = useState<string | null>(null);
  const [otherWork, setOtherWork] = useState("");
  const [locText, setLocText] = useState("");
  const [locState, setLocState] = useState("");
  const [brief, setBrief] = useState("");
  const [errType, setErrType] = useState(false);
  const [errOther, setErrOther] = useState(false);
  const [errBrief, setErrBrief] = useState(false);

  /* ---------- estimate -------------------------------------------------- */
  const [materials, setMaterials] = useState<Line[]>([]);
  const [labor, setLabor] = useState<Line[]>([]);
  const [scope, setScope] = useState("");
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [margin, setMargin] = useState(18);
  const [pending, setPending] = useState<Pending | null>(null);
  const [undo, setUndo] = useState<Snapshot | null>(null);
  const [refineTxt, setRefineTxt] = useState("");
  const [errRefine, setErrRefine] = useState(false);
  const seq = useRef(100);

  /* ---------- transient confirmations ----------------------------------- */
  const [confirmReset, setConfirmReset] = useState(false);
  const [converted, setConverted] = useState(false);
  const [landedId, setLandedId] = useState<string | null>(null);

  /* ---------- sheets ---------------------------------------------------- */
  const [sheetRef2, setSheetRef2] = useState<{ grp: Group; id: string } | null>(null);
  const [editRef, setEditRef] = useState<{ grp: Group; id: string } | null>(null);
  const [form, setForm] = useState({ name: "", qty: "1", unit: "each", price: "0" });
  const [nameErr, setNameErr] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  /* ---------- viewport height -------------------------------------------
     Mandatory rule: viewport heights only via var(--app-h). A phone's URL bar
     changes innerHeight mid-scroll, so the real value is republished rather
     than trusting a bare 100vh/100dvh. This is the React form of the donor's
     FLUID SCALE module — no root zoom, since the composition here is already
     the handheld one. It also keeps the sticky commit foot above the software
     keyboard, which every step of this wizard raises. */
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

  /* ---------- Motion: reveal on load + adaptive reveal on scroll --------- */
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

  /* ---------- Motion: graph-paper parallax ------------------------------ */
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
      styles.btn, styles.ptype, styles.sample, styles.revEdit,
      styles.stAct, styles.addLine, styles.lrowOpen, styles.marginBtn,
      styles.rfBtn, styles.menuItem, styles.sheetCancel, styles.lemptyA,
    ].map((c) => `.${c}`).join(", ");
    const el = (e.target as HTMLElement).closest<HTMLElement>(sel);
    if (!el) return;
    el.classList.remove(styles.pressed);
    void el.offsetWidth;
    el.classList.add(styles.pressed);
    el.addEventListener("animationend", () => el.classList.remove(styles.pressed), { once: true });
  }, []);

  /* ---------- Esc closes what the PAGE owns -----------------------------
     The drawer is not listed: MobileNav binds its own Escape while open, so the
     two listeners cannot both claim one key press. */
  useEffect(() => {
    if (!sheetRef2 && !editRef) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editRef) setEditRef(null);
      else setSheetRef2(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetRef2, editRef]);

  /* ---------- generation: the donor's 620ms narration --------------------
     One timer per stage rather than one interval, so an unmount mid-flight
     cannot fire into a detached tree. The landing happens INSIDE the last
     timeout — never synchronously in the effect body, which would cascade a
     render. Four ticks × 620ms is the donor's exact runtime. */
  useEffect(() => {
    if (phase !== "busy") return;
    const id = window.setTimeout(() => {
      if (stageIdx + 1 < STAGES.length) {
        setStageIdx(stageIdx + 1);
        return;
      }
      const seed = cloneSeed();
      setMaterials(seed.materials);
      setLabor(seed.labor);
      setScope(seed.scope);
      setAssumptions(seed.assumptions);
      setUndo(null);
      setPending(null);
      setRefineTxt("");
      setPhase("studio");
    }, 620);
    return () => window.clearTimeout(id);
  }, [phase, stageIdx]);

  /* Landing on the studio starts at the top of the document. */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [phase]);

  /* The two-tap "Start over" window, and the "Proposal created" flash. */
  useEffect(() => {
    if (!confirmReset) return;
    const t = window.setTimeout(() => setConfirmReset(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmReset]);
  useEffect(() => {
    if (!converted) return;
    const t = window.setTimeout(() => setConverted(false), 1800);
    return () => window.clearTimeout(t);
  }, [converted]);
  useEffect(() => {
    if (!landedId) return;
    const t = window.setTimeout(() => setLandedId(null), 700);
    return () => window.clearTimeout(t);
  }, [landedId]);

  /* ---------- derived --------------------------------------------------- */
  const matTotal = useMemo(() => sumOf(materials), [materials]);
  const labTotal = useMemo(() => sumOf(labor), [labor]);
  const subtotal = matTotal + labTotal;
  const marginCash = subtotal * (margin / 100);
  const clientPrice = subtotal + marginCash;

  const typeRow = PROJECT_TYPES.find((t) => t.id === type);
  const typeLabel =
    type === "other" && otherWork.trim() ? otherWork.trim() : typeRow ? typeRow.label : "";
  const where = locText.trim()
    ? `${locText.trim()}${locState ? `, ${locState}` : ""}`
    : "";
  const estTitle = brief.trim().split("\n")[0].slice(0, 90) || "New estimate";

  const listOf = (grp: Group) => (grp === "materials" ? materials : labor);
  const setListOf = (grp: Group, next: Line[]) =>
    grp === "materials" ? setMaterials(next) : setLabor(next);

  /* ---------- wizard ---------------------------------------------------- */
  const validate = (n: number) => {
    if (n === 1) {
      if (!type) {
        setErrType(true);
        return false;
      }
      if (type === "other" && !otherWork.trim()) {
        setErrOther(true);
        return false;
      }
      return true;
    }
    // Step 2 has no required field: the donor prices without a location too, it
    // just skips the regional adjustment. The Review step says so out loud.
    if (n === 3) {
      if (!brief.trim()) {
        setErrBrief(true);
        return false;
      }
    }
    return true;
  };

  const goStep = (n: number) => {
    setDir(n > step ? "fwd" : "back");
    setStep(Math.min(STEP_COUNT, Math.max(1, n)));
    scrollRef.current?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };
  const next = () => {
    if (!validate(step)) return;
    if (step < STEP_COUNT) goStep(step + 1);
    else generate();
  };
  const generate = () => {
    if (!validate(1) || !validate(3)) {
      goStep(!type || (type === "other" && !otherWork.trim()) ? 1 : 3);
      return;
    }
    setStageIdx(0);
    setPhase("busy");
  };

  const pickSample = (i: number) => {
    setBrief(SAMPLES[i]);
    setErrBrief(false);
    if (!type) {
      setType(i === 1 ? "fence" : i === 2 ? "deck" : i === 3 ? "gutters" : "roof");
      setErrType(false);
    }
  };

  const startOver = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setConfirmReset(false);
    setMaterials([]);
    setLabor([]);
    setScope("");
    setAssumptions([]);
    setPending(null);
    setUndo(null);
    setRefineTxt("");
    setPhase("intake");
    setDir("back");
    setStep(1);
  };

  /* ---------- line editing ---------------------------------------------- */
  const addLine = (grp: Group) => {
    seq.current += 1;
    const line: Line = { id: `n${seq.current}`, name: "New line", qty: 1, unit: "each", price: 0, link: false };
    setListOf(grp, listOf(grp).concat(line));
    setLandedId(line.id);
    openEdit(grp, line);
  };

  const openEdit = (grp: Group, line: Line) => {
    setSheetRef2(null);
    setForm({ name: line.name, qty: String(line.qty), unit: line.unit, price: String(line.price) });
    setNameErr(false);
    setEditRef({ grp, id: line.id });
    window.setTimeout(() => nameRef.current?.focus(), prefersReducedMotion() ? 0 : 320);
  };

  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setNameErr(true);
      nameRef.current?.focus();
      return;
    }
    const target = editRef;
    if (!target) return;
    setListOf(
      target.grp,
      listOf(target.grp).map((l) =>
        l.id === target.id
          ? {
              ...l,
              name,
              qty: Math.max(0, parseFloat(form.qty) || 0),
              unit: form.unit.trim() || "each",
              price: Math.max(0, parseFloat(form.price) || 0),
            }
          : l,
      ),
    );
    setLandedId(target.id);
    setEditRef(null);
  };

  /* ---------- refine: compute the real diff, wait for confirmation ------- */
  const applyRefine = () => {
    const text = refineTxt.trim();
    if (!text) {
      setErrRefine(true);
      return;
    }
    const deltas: Delta[] = [];
    const m1 = materials.find((l) => l.id === "m1");
    if (m1) {
      deltas.push({
        kind: "chg", group: "Materials", title: m1.name,
        from: money(m1.price), to: money(Math.round(m1.price * 1.12)), note: "Unit price",
      });
    }
    const l3 = labor.find((l) => l.id === "l3");
    if (l3) {
      deltas.push({
        kind: "chg", group: "Labor", title: l3.name,
        from: money(l3.price), to: money(l3.price + 8), note: "Unit price",
      });
    }
    deltas.push({
      kind: "add", group: "Materials", title: "Starter strip shingles",
      note: `6 bundle × ${money(38)} — added`,
    });
    if (materials.some((l) => l.id === "m6")) {
      deltas.push({
        kind: "rem", group: "Materials", title: "Roofing nails, coil",
        note: "Rolled into labor — removed",
      });
    }
    setPending({ instructions: text, deltas });
  };

  const commitPending = () => {
    setUndo({ materials: clone(materials), labor: clone(labor), scope });
    seq.current += 1;
    setMaterials((prev) =>
      prev
        .map((l) => (l.id === "m1" ? { ...l, price: Math.round(l.price * 1.12) } : l))
        .concat({ id: `m${seq.current}`, name: "Starter strip shingles", qty: 6, unit: "bundle", price: 38, link: true })
        .filter((l) => l.id !== "m6"),
    );
    setLabor((prev) => prev.map((l) => (l.id === "l3" ? { ...l, price: l.price + 8 } : l)));
    setPending(null);
    setRefineTxt("");
  };

  const runUndo = () => {
    if (!undo) return;
    setMaterials(clone(undo.materials));
    setLabor(clone(undo.labor));
    setScope(undo.scope);
    setUndo(null);
  };

  /* ---------- row actions sheet ----------------------------------------- */
  const sheetLine = sheetRef2 ? listOf(sheetRef2.grp).find((l) => l.id === sheetRef2.id) ?? null : null;
  const editLine = editRef ? listOf(editRef.grp).find((l) => l.id === editRef.id) ?? null : null;

  const menuRows = useMemo<MenuRow[]>(() => {
    if (!sheetRef2 || !sheetLine) return [];
    const other: Group = sheetRef2.grp === "materials" ? "labor" : "materials";
    return [
      { act: "edit", icon: "i-file", tone: styles.miBp, title: "Edit line",
        sub: "Description, quantity and price" },
      { act: "link", icon: "i-arrow", tone: styles.miSky, title: "Open retail link",
        sub: sheetLine.link ? "Jumps to the supplier listing" : "No retail source on this line",
        disabled: !sheetLine.link },
      { act: "dup", icon: "i-copy", title: "Duplicate line", sub: "Copies it in below" },
      { act: "move", icon: "i-rotate", tone: styles.miWarn,
        title: other === "labor" ? "Move to labor" : "Move to materials",
        sub: `Re-files it under ${other === "labor" ? "Labor" : "Materials"}` },
      { act: "del", icon: "i-trash", tone: styles.miDanger, title: "Remove line",
        sub: "Deletes it from the estimate", danger: true },
    ];
  }, [sheetRef2, sheetLine]);

  const runMenu = (act: string) => {
    if (!sheetRef2 || !sheetLine) return;
    const { grp, id } = sheetRef2;
    if (act === "edit") {
      openEdit(grp, sheetLine);
      return;
    }
    setSheetRef2(null);
    if (act === "dup") {
      seq.current += 1;
      const copy: Line = { ...sheetLine, id: `d${seq.current}` };
      const list = listOf(grp);
      const at = list.findIndex((l) => l.id === id);
      setListOf(grp, list.slice(0, at + 1).concat(copy, list.slice(at + 1)));
      setLandedId(copy.id);
    } else if (act === "move") {
      const other: Group = grp === "materials" ? "labor" : "materials";
      setListOf(grp, listOf(grp).filter((l) => l.id !== id));
      setListOf(other, listOf(other).concat({ ...sheetLine }));
      setLandedId(id);
    } else if (act === "del") {
      setListOf(grp, listOf(grp).filter((l) => l.id !== id));
    }
    // "link" is inert by design: this surface makes no network calls.
  };

  const anyOverlay = Boolean(sheetLine) || Boolean(editLine);

  // Swipe-down dismissal, one gesture per sheet, on the same setters the
  // Escape ladder uses.
  const actionsDrag = useSheetDrag(Boolean(sheetLine), () => setSheetRef2(null));
  const editDrag = useSheetDrag(Boolean(editLine), () => setEditRef(null));
  const stepCls = `${styles.step} ${dir === "fwd" ? styles.stepFwd : styles.stepBack}`;

  /* ---------- one ledger, drawn as row cards ---------------------------- */
  const renderLedger = (grp: Group, label: string) => {
    const list = listOf(grp);
    const total = grp === "materials" ? matTotal : labTotal;
    return (
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardLbl}>{label}</span>
          <span className={`${styles.cardSum} ${total ? "" : styles.isZero}`}>
            {total ? money(total) : "—"}
          </span>
        </div>
        {list.length === 0 ? (
          <div className={styles.lempty}>
            <div className={styles.lemptyT}>Nothing costed here</div>
            <div className={styles.lemptyS}>
              Every line under {label.toLowerCase()} was removed. Add one back, or leave it out of
              the estimate.
            </div>
            <button className={styles.lemptyA} type="button" onClick={() => addLine(grp)}>
              <Icon id="i-plus" />Add line
            </button>
          </div>
        ) : (
          <div className={styles.lines}>
            {list.map((l, i) => {
              const t = lineTotal(l);
              return (
                <div
                  key={l.id}
                  className={`${styles.lrow} ${styles.rowIn} ${landedId === l.id ? styles.landed : ""}`}
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  {/* Title and the mono quantity annotation are ONE target:
                      a 19px text button is under the 44px floor, and tapping
                      either is the same intent — edit this line. */}
                  <button
                    className={styles.lname}
                    type="button"
                    onClick={() => openEdit(grp, l)}
                  >
                    <span className={styles.lnameT}>{l.name}</span>
                    <span className={styles.lmeta}>
                      {l.qty} {l.unit} × {money(l.price)}
                    </span>
                  </button>
                  <button
                    className={styles.lrowOpen}
                    type="button"
                    aria-label={`Actions for ${l.name}`}
                    onClick={() => setSheetRef2({ grp, id: l.id })}
                  >
                    <Icon id="i-dots" />
                  </button>
                  <div className={styles.lfoot}>
                    {l.link ? (
                      <span className={styles.llink}>
                        Retail link<Icon id="i-arrow" />
                      </span>
                    ) : (
                      <span className={styles.lown}>Own supply</span>
                    )}
                    <span className={`${styles.ltotal} ${t ? "" : styles.isZero}`}>
                      {t ? money(t) : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* The empty state already carries the Add-line CTA — one per card. */}
        {list.length === 0 ? null : (
          <div className={styles.cardFoot}>
            <button className={styles.addLine} type="button" onClick={() => addLine(grp)}>
              <Icon id="i-plus" />Add line
            </button>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className={styles.app} onClick={onRootClick}>
      {/* Two symbols the shared 48-icon sprite does not carry, prefixed so they
          can never collide with it or with another page. Original lucide paths
          (package, pen-line), 24×24, stroke 2, currentColor. */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <symbol id="i-advanced-ai-box" viewBox="0 0 24 24">
            <path d="m7.5 4.27 9 5.15" />
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
            <path d="m3.3 7 8.7 5 8.7-5" />
            <path d="M12 22V12" />
          </symbol>
          <symbol id="i-advanced-ai-pen" viewBox="0 0 24 24">
            <path d="M12 20h9" />
            <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
          </symbol>
        </defs>
      </svg>

      {/* Shared handheld nav: topbar + drawer + sprite. Owns its own open
          state, so the page holds none. */}
      <MobileNav />

      {/* ============ SCROLLER ============ */}
      <main className={styles.scroll} ref={scrollRef}>
        <div className={styles.content} ref={contentRef}>
          {/* PAGE HEAD — no action buttons: the wizard's commit pair lives in
              the sticky foot, in the thumb zone, where it belongs. */}
          <div className={styles.pageHead}>
            <div className={styles.kicker}>Sales · Estimating</div>
            <h1 className={styles.pageTitle}>Smart Proposal</h1>
          </div>

          {phase !== "studio" ? (
            <>
              {/* PROGRESS — a mono plate over a rule filled to the fraction.
                  A horizontal stepper rail cannot label four steps at 320px. */}
              <div className={styles.wiz} key="wiz">
                <div className={styles.wizTop}>
                  <span className={styles.wizPlate}>
                    Step {step} / {STEP_COUNT}
                  </span>
                  <span className={styles.wizNow}>{STEP_NAMES[step - 1]}</span>
                </div>
                <div className={styles.wizRule} role="progressbar" aria-valuenow={step}
                  aria-valuemin={1} aria-valuemax={STEP_COUNT}
                  aria-label={`Step ${step} of ${STEP_COUNT}`}>
                  <span className={styles.wizFill}
                    style={{ transform: `scaleX(${step / STEP_COUNT})` }} />
                </div>
              </div>

              {/* ONE STEP, FULL WIDTH */}
              <section className={stepCls} key={`step-${step}-${phase}`}>
                {/* ---------- STEP 1 — project type ---------- */}
                {phase === "intake" && step === 1 && (
                  <>
                    <div className={styles.stepHead}>
                      <span className={styles.stepMark}><Icon id="i-bulb" /></span>
                      <div>
                        <h2 className={styles.stepH}>Project type</h2>
                        <p className={styles.stepHint}>
                          Describe the job and real materials with retail pricing, labor and scope
                          come back as separate, editable breakdowns. This choice shapes the pricing
                          model.
                        </p>
                      </div>
                    </div>
                    <div className={styles.stepBody}>
                      <div className={styles.ptypes}>
                        {PROJECT_TYPES.map((t) => (
                          <button
                            key={t.id}
                            className={`${styles.ptype} ${type === t.id ? styles.on : ""}`}
                            type="button"
                            aria-pressed={type === t.id}
                            onClick={() => { setType(t.id); setErrType(false); }}
                          >
                            <Icon id={t.icon} />
                            {t.label}
                          </button>
                        ))}
                      </div>
                      {errType ? (
                        <span className={styles.fldErr}>Pick the kind of work first</span>
                      ) : null}

                      {type === "other" ? (
                        <div className={`${styles.fld} ${errOther ? styles.invalid : ""}`}>
                          <label className={styles.fldLbl} htmlFor="maOther">
                            What kind of work?<span className={styles.req}>*</span>
                          </label>
                          <input
                            className={styles.pinput}
                            id="maOther"
                            type="text"
                            placeholder="Skylights, pergola, storm repair…"
                            autoComplete="off"
                            value={otherWork}
                            aria-invalid={errOther}
                            onChange={(e) => {
                              setOtherWork(e.target.value);
                              if (e.target.value.trim()) setErrOther(false);
                            }}
                          />
                          {errOther ? (
                            <span className={styles.fldErr}>Say what the work is</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </>
                )}

                {/* ---------- STEP 2 — location ---------- */}
                {phase === "intake" && step === 2 && (
                  <>
                    <div className={styles.stepHead}>
                      <span className={styles.stepMark}><Icon id="i-pin" /></span>
                      <div>
                        <h2 className={styles.stepH}>Location</h2>
                        <p className={styles.stepHint}>
                          Regional pricing. Pick a town and the state fills itself in. Optional —
                          skip it and the estimate is priced without a regional adjustment.
                        </p>
                      </div>
                    </div>
                    <div className={styles.stepBody}>
                      <div className={styles.fld}>
                        <label className={styles.fldLbl} htmlFor="maLoc">Address or city</label>
                        {/* Real Google Places suggestions, through the same module the
                            desktop blueprint pages use. cityOnly: this field prices a
                            REGION, so a street number is noise — "Bothell, WA" is the
                            whole answer. Picking one fills the state below, which is
                            what the hint promises. */}
                        <AddressField
                          id="maLoc"
                          placeholder="Bothell"
                          cityOnly
                          value={locText}
                          onPick={(p) => {
                            setLocText(p.typed ? p.address : p.city || p.address);
                            // Only a real pick carries parts. A half-typed street must
                            // not blank a state the user already chose.
                            if (!p.typed && p.state) setLocState(p.state);
                          }}
                        />
                      </div>

                      <div className={styles.fld}>
                        <label className={styles.fldLbl} htmlFor="maState">State</label>
                        <StatePicker
                          id="maState"
                          value={locState}
                          onChange={setLocState}
                          options={STATES}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* ---------- STEP 3 — the brief ---------- */}
                {phase === "intake" && step === 3 && (
                  <>
                    <div className={styles.stepHead}>
                      <span className={styles.stepMark}><Icon id="i-file" /></span>
                      <div>
                        <h2 className={styles.stepH}>The brief</h2>
                        <p className={styles.stepHint}>
                          Materials, finishes, conditions, access, square footage. The more specific,
                          the tighter the estimate.
                        </p>
                      </div>
                    </div>
                    <div className={styles.stepBody}>
                      <div className={`${styles.fld} ${errBrief ? styles.invalid : ""}`}>
                        <label className={styles.fldLbl} htmlFor="maBrief">
                          Describe the job<span className={styles.req}>*</span>
                        </label>
                        <textarea
                          className={styles.area}
                          id="maBrief"
                          placeholder="Materials, finishes, conditions, access, square footage if you have it…"
                          value={brief}
                          aria-invalid={errBrief}
                          onChange={(e) => {
                            setBrief(e.target.value);
                            if (e.target.value.trim()) setErrBrief(false);
                          }}
                        />
                        {errBrief ? (
                          <span className={styles.fldErr}>Describe the job before pricing it</span>
                        ) : null}
                      </div>
                      <div className={styles.fld}>
                        <span className={styles.fldLbl}>Start from an example</span>
                        <div className={styles.samples}>
                          {SAMPLES.map((s, i) => (
                            <button key={s} className={styles.sample} type="button"
                              onClick={() => pickSample(i)}>
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* ---------- STEP 4 — review, then the narration ---------- */}
                {step === 4 && (
                  <>
                    <div className={styles.stepHead}>
                      <span className={styles.stepMark}><Icon id="i-check" /></span>
                      <div>
                        <h2 className={styles.stepH}>
                          {phase === "busy" ? "Pricing the job" : "Review"}
                        </h2>
                        <p className={styles.stepHint}>
                          {phase === "busy"
                            ? "Materials are priced at retail, labor is costed per unit, and the scope is written last."
                            : "This is what gets priced. Tap any line to go back and change it."}
                        </p>
                      </div>
                    </div>
                    <div className={styles.stepBody}>
                      {phase === "busy" ? (
                        <ul className={styles.stages}>
                          {STAGES.map((s, i) => (
                            <li
                              key={s}
                              className={`${styles.stage} ${i < stageIdx ? styles.isDone : ""} ${i === stageIdx ? styles.isNow : ""}`}
                            >
                              <span className={styles.stageIc}>
                                {i < stageIdx ? <Icon id="i-check" /> : null}
                              </span>
                              {s}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className={styles.review}>
                          {[
                            { n: 1, l: "Project type", v: typeLabel, miss: "Not picked" },
                            { n: 2, l: "Location", v: where, miss: "Not set — priced without a regional adjustment" },
                            { n: 3, l: "The brief", v: brief.trim(), miss: "Empty" },
                          ].map((r) => (
                            <div className={styles.revRow} key={r.l}>
                              <div className={styles.revLbl}>{r.l}</div>
                              <div className={`${styles.revVal} ${r.v ? "" : styles.isMissing}`}>
                                {r.v || r.miss}
                              </div>
                              <button className={styles.revEdit} type="button"
                                aria-label={`Edit ${r.l}`} onClick={() => goStep(r.n)}>
                                Edit
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </section>
            </>
          ) : (
            <>
              {/* ============ STUDIO ============ */}
              {/* Identity first: the masthead numeral below is meaningless
                  without knowing which job it belongs to. */}
              <section className={styles.sthead} key="sthead">
                <div className={styles.stKicker}>
                  {typeLabel || "Estimate"}{where ? ` · ${where}` : ""}
                </div>
                <h2 className={styles.stTitle}>{estTitle}</h2>
                <div className={styles.stActs}>
                  <button className={styles.stAct} type="button" disabled={!undo} onClick={runUndo}>
                    <Icon id="i-rotate" />Undo last change
                  </button>
                </div>
              </section>

              {/* MASTHEAD — one numeral, mono kicker, EXACTLY two annotations.
                  All three are computed, so editing a line moves them. */}
              <div className={styles.smast} key="smast">
                <div className={styles.smastTop}>
                  <div className={styles.smastLbl}>
                    Client price
                    <span className={styles.smastRule} />
                  </div>
                  {clientPrice ? (
                    <CountUp value={clientPrice} className={styles.smastVal} />
                  ) : (
                    <div className={`${styles.smastVal} ${styles.isZero}`}>—</div>
                  )}
                </div>
                <div className={styles.smastCnt}>
                  <div className={styles.smastSub}>
                    <div className={styles.smastSubL}>Materials</div>
                    <div className={`${styles.smastSubV} ${matTotal ? "" : styles.isZero}`}>
                      {matTotal ? money(matTotal) : "—"}
                    </div>
                  </div>
                  <div className={styles.smastSub}>
                    <div className={styles.smastSubL}>Labor</div>
                    <div className={`${styles.smastSubV} ${labTotal ? "" : styles.isZero}`}>
                      {labTotal ? money(labTotal) : "—"}
                    </div>
                  </div>
                </div>
              </div>

              {/* SCOPE */}
              <section className={styles.card} key="scope">
                <div className={styles.cardHead}>
                  <span className={styles.cardLbl}>Scope of work</span>
                </div>
                <div className={styles.cardPad}>
                  <textarea
                    className={styles.area}
                    aria-label="Scope of work"
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                  />
                </div>
              </section>

              {renderLedger("materials", "Materials")}
              {renderLedger("labor", "Labor")}

              {/* ASSUMPTIONS */}
              <section className={styles.card} key="assump">
                <div className={styles.cardHead}>
                  <span className={styles.cardLbl}>Assumptions</span>
                </div>
                <ul className={styles.assump}>
                  {assumptions.map((a, i) => (
                    <li key={a} className={styles.rowIn} style={{ animationDelay: `${i * 45}ms` }}>
                      {a}
                    </li>
                  ))}
                </ul>
              </section>

              {/* TOTALS — an estimate sheet: right-aligned tabular numerals and
                  a ruled total row. */}
              <section className={styles.card} key="totals">
                <div className={styles.cardHead}>
                  <span className={styles.cardLbl}>Totals</span>
                </div>
                <div className={styles.cardPad}>
                  <div className={styles.totRow}>
                    <span className={styles.totLbl}>Subtotal</span>
                    <span className={`${styles.totVal} ${subtotal ? "" : styles.isZero}`}>
                      {subtotal ? money(subtotal) : "—"}
                    </span>
                  </div>
                  <div className={styles.marginBox}>
                    <div className={styles.marginRow}>
                      <span className={styles.fldLbl}>Margin</span>
                      <span className={styles.marginCtl}>
                        <button className={styles.marginBtn} type="button" aria-label="Lower the margin"
                          onClick={() => setMargin((m) => Math.max(0, m - 1))}>−</button>
                        <input
                          className={styles.marginIn}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={60}
                          step={1}
                          aria-label="Margin percent"
                          value={margin}
                          onChange={(e) =>
                            setMargin(Math.max(0, Math.min(60, Number(e.target.value) || 0)))
                          }
                        />
                        <button className={styles.marginBtn} type="button" aria-label="Raise the margin"
                          onClick={() => setMargin((m) => Math.min(60, m + 1))}>+</button>
                      </span>
                    </div>
                    <div className={styles.marginRow}>
                      <span className={styles.marginAdd}>Added to the client price</span>
                      <span className={`${styles.totVal} ${marginCash ? "" : styles.isZero}`}>
                        {marginCash ? money(marginCash) : "—"}
                      </span>
                    </div>
                  </div>
                  <div className={`${styles.totRow} ${styles.totGrand}`}>
                    <span className={styles.totLbl}>Client price</span>
                    <span className={`${styles.totGrandVal} ${clientPrice ? "" : styles.isZero}`}>
                      {clientPrice ? money(clientPrice) : "—"}
                    </span>
                  </div>
                </div>
              </section>

              {/* REFINE — plain words in, a real diff out, nothing applied
                  until it is confirmed. */}
              <section className={styles.card} key="refine">
                <div className={styles.cardHead}>
                  <span className={styles.cardLbl}>{pending ? "Review changes" : "Refine"}</span>
                </div>
                <div className={styles.cardPad}>
                  {pending ? (
                    <>
                      <div className={styles.rfNote}>“{pending.instructions}”</div>
                      <ul className={styles.diffList}>
                        {pending.deltas.map((d) => (
                          <li
                            key={`${d.kind}-${d.title}`}
                            className={`${styles.diffItem} ${
                              d.kind === "add" ? styles.diffAdd : d.kind === "rem" ? styles.diffRem : styles.diffChg
                            }`}
                          >
                            <div className={styles.diffGrp}>{d.group}</div>
                            <div className={styles.diffT}>{d.title}</div>
                            <div className={styles.diffM}>
                              {d.from ? (
                                <>
                                  {d.note} <s className={styles.diffOld}>{d.from}</s> → {d.to}
                                </>
                              ) : (
                                d.note
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                      <div className={styles.rfAct}>
                        <button className={styles.rfBtn} type="button" onClick={() => setPending(null)}>
                          Discard
                        </button>
                        <button className={styles.rfBtn} type="button" onClick={commitPending}>
                          <Icon id="i-check" />Apply
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={styles.rfNote}>
                        Ask for a change in plain words — the estimate is re-priced and shown as a
                        diff before anything is applied.
                      </div>
                      <div className={`${styles.fld} ${errRefine ? styles.invalid : ""}`}>
                        <textarea
                          className={`${styles.area} ${styles.rfArea}`}
                          aria-label="Describe the change"
                          placeholder="e.g. Use 30-year shingles instead of 25-year, drop the ridge vents, add a 10% discount…"
                          value={refineTxt}
                          aria-invalid={errRefine}
                          onChange={(e) => {
                            setRefineTxt(e.target.value);
                            if (e.target.value.trim()) setErrRefine(false);
                          }}
                        />
                        {errRefine ? (
                          <span className={styles.fldErr}>Say what should change</span>
                        ) : null}
                      </div>
                      <div className={styles.rfAct}>
                        <button className={styles.rfBtn} type="button" onClick={applyRefine}>
                          <Icon id="i-bulb" />Apply changes
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </main>

      {/* ============ STICKY COMMIT FOOT ============
          Outside the scroller, pinned to the bottom, paying out --safe-b. This
          is the wizard's commit bar, not a tab bar: no page in this family has
          one of those. */}
      <div className={styles.wfoot}>
        {phase === "studio" ? (
          <>
            <button
              className={`${styles.btn} ${styles.btnGhost} ${confirmReset ? styles.isArmed : ""}`}
              type="button"
              onClick={startOver}
            >
              <Icon id="i-x" />{confirmReset ? "Really?" : "Start over"}
            </button>
            <button className={`${styles.btn} ${styles.btnPrimary}`} type="button"
              onClick={() => setConverted(true)}>
              <Icon id={converted ? "i-check" : "i-file"} />
              {converted ? "Proposal created" : "Convert to proposal"}
            </button>
          </>
        ) : (
          <>
            <button className={`${styles.btn} ${styles.btnGhost}`} type="button"
              disabled={step === 1 || phase === "busy"} onClick={() => goStep(step - 1)}>
              <Icon id="i-chevl" />Back
            </button>
            <button className={`${styles.btn} ${styles.btnPrimary}`} type="button"
              disabled={phase === "busy"} onClick={next}>
              {step === STEP_COUNT ? (
                <>
                  <Icon id="i-bulb" />{phase === "busy" ? "Working…" : "Generate estimate"}
                </>
              ) : (
                <>
                  Next<Icon id="i-chevr" />
                </>
              )}
            </button>
          </>
        )}
      </div>

      {/* ============ SHEET SCRIM (shared by both sheets) ============ */}
      <div
        className={`${styles.scrim} ${anyOverlay ? styles.on : ""}`}
        onClick={() => { setSheetRef2(null); setEditRef(null); }}
        aria-hidden="true"
      />

      {/* ============ LINE ACTIONS SHEET ============ */}
      <div className={`${styles.sheet} ${sheetLine ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-label="Line actions" aria-hidden={!sheetLine} {...actionsDrag.sheetProps}>
        <div className={styles.sheetGrab} {...actionsDrag.handleProps} />
        <div className={styles.sheetHead} {...actionsDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {sheetLine && sheetRef2
              ? `${sheetRef2.grp === "materials" ? "Materials" : "Labor"} · ${sheetLine.qty} ${sheetLine.unit} · ${money(lineTotal(sheetLine))}`
              : "Line · —"}
          </div>
          <div className={styles.sheetTitle}>{sheetLine?.name ?? "Actions"}</div>
        </div>
        <div className={styles.sheetBody}>
          {menuRows.map((r) => (
            <button key={r.act} type="button" disabled={r.disabled}
              className={`${styles.menuItem} ${r.danger ? styles.menuItemDanger : ""}`}
              onClick={() => runMenu(r.act)}>
              <span className={`${styles.miIc} ${r.tone ?? ""}`}><Icon id={r.icon} /></span>
              <span>
                <span className={styles.menuItemT}>{r.title}</span>
                <span className={styles.menuItemS}>{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <button className={styles.sheetCancel} type="button" onClick={() => setSheetRef2(null)}>
          Cancel
        </button>
      </div>

      {/* ============ LINE EDIT SHEET ============
          The desktop edits in place through 32px table cells. At 320px those
          cells are unusable, so the same four fields move into a form sheet
          with the house 15px inputs and the submit pair in a beige foot. */}
      <div className={`${styles.sheet} ${editLine ? styles.on : ""}`} role="dialog" aria-modal="true"
        aria-labelledby="maEditTitle" aria-hidden={!editLine} {...editDrag.sheetProps}>
        <div className={styles.sheetGrab} {...editDrag.handleProps} />
        <div className={styles.sheetHead} {...editDrag.handleProps}>
          <div className={styles.sheetKicker}>
            {editRef?.grp === "labor" ? "Labor / line" : "Materials / line"}
          </div>
          <div className={styles.sheetTitle} id="maEditTitle">Edit line</div>
        </div>
        <form className={`${styles.sheetBody} ${styles.formBody}`} id="maEditForm" noValidate
          onSubmit={submitEdit}>
          <div className={`${styles.fld} ${nameErr ? styles.invalid : ""}`}>
            <label className={styles.fldLbl} htmlFor="maName">
              Description<span className={styles.req}>*</span>
            </label>
            <input ref={nameRef} className={styles.pinput} id="maName" type="text"
              placeholder="Architectural shingles — 30 yr" autoComplete="off" value={form.name}
              aria-invalid={nameErr} aria-describedby={nameErr ? "maNameErr" : undefined}
              onChange={(e) => {
                setForm((f) => ({ ...f, name: e.target.value }));
                if (e.target.value.trim()) setNameErr(false);
              }} />
            {nameErr ? <span className={styles.fldErr} id="maNameErr">Give the line a description</span> : null}
          </div>

          <div className={styles.fldRow}>
            <div className={styles.fld}>
              <label className={styles.fldLbl} htmlFor="maQty">Quantity</label>
              <input className={`${styles.pinput} ${styles.isNum}`} id="maQty" type="number"
                inputMode="decimal" min={0} step={0.5} value={form.qty}
                onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} />
            </div>
            <div className={styles.fld}>
              <label className={styles.fldLbl} htmlFor="maUnit">Unit</label>
              <input className={styles.pinput} id="maUnit" type="text" placeholder="square"
                autoComplete="off" value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
            </div>
          </div>

          <div className={styles.fld}>
            <label className={styles.fldLbl} htmlFor="maPrice">Unit price</label>
            <input className={`${styles.pinput} ${styles.isNum}`} id="maPrice" type="number"
              inputMode="decimal" min={0} step={1} value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
            <span className={styles.fldHint}>
              Line total {money((parseFloat(form.qty) || 0) * (parseFloat(form.price) || 0))}
            </span>
          </div>
        </form>
        <div className={styles.formFoot}>
          <button className={`${styles.btn} ${styles.btnGhost}`} type="button"
            onClick={() => setEditRef(null)}>
            Cancel
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" form="maEditForm">
            <Icon id="i-check" />Save line
          </button>
        </div>
      </div>
    </div>
  );
}
