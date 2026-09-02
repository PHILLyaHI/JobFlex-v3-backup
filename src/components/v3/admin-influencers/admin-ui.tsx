"use client";

// ADMIN / BLUEPRINT — the primitive layer shared by the three partner-money
// pages (/admin/influencers, /admin/payouts, /admin/referrals).
//
// The admin layout (owned elsewhere) wraps every page in the blueprint shell
// root — `proposalStyles.bp dashboardStyles.bp jf-blueprint` — so the literal
// donor classes (`page-head`, `kicker`, `page-title`, `btn`, `card`, `kpi-grid`,
// `chip`, `mdl pmdl`, `mf`, `mf-lbl`, `mf-in`) are live here. Everything that
// is NOT the donor's — the stacked row list, the bottom-sheet behaviour, the
// segmented control — carries a hashed class from admin-ui.module.css, scoped
// `:global(.jf-blueprint .content) .cls` so it outranks the shell's 2- and
// 3-class resets.
//
// Dialogs are hand-rolled on the house `.mdl` contract (no Radix): the
// open/close motion comes from blueprint-shell/mdl-motion, which is imperative,
// so each sheet holds a ref and drives the element rather than swapping
// `display` from state — a React render that unmounted the box would cut the
// exit animation, the asymmetry mdl-motion.ts was written to remove.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { closeMdl, openMdl, MDL_EXIT_MS } from "@/components/v3/blueprint-shell/mdl-motion";
import { lockScroll } from "@/lib/scrollLock";
import styles from "./admin-ui.module.css";

/** Local class joiner. Not `@/lib/cn`: twMerge has opinions about Tailwind
 *  utilities and no business near a hashed CSS-module name. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** One symbol from the shell's sprite. `.ic` is the shell's global icon class. */
export function Ic({ name }: { name: string }) {
  return (
    <svg className="ic" aria-hidden="true" focusable="false">
      <use href={`#i-${name}`} />
    </svg>
  );
}

/** Server actions reject with text written for the reader. Show that; a zod
 *  `.parse` throw arrives as a JSON array of issues and is unpacked. */
export function actionError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  if (!msg || msg.toLowerCase().includes("fetch failed")) {
    return "Something went wrong. Check your connection and try again.";
  }
  if (msg.startsWith("[")) {
    try {
      const issues = JSON.parse(msg) as { message?: string; path?: (string | number)[] }[];
      const first = issues.find((i) => i?.message);
      if (first?.message) {
        const field = first.path?.[0];
        return field ? `${String(field)}: ${first.message}` : first.message;
      }
    } catch {
      // Not JSON after all.
    }
  }
  return msg;
}

/* ============================================================
   REVEAL — the donor's load cascade, played once per mount
   ============================================================ */

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Adds `rv-in` to every `.rv` block under `ref`, 60ms apart, on the first
 * paint only. The shell's own observer belongs to the imperative pages; this
 * page is React, so it plays its own entrance and then leaves the classes
 * alone — a re-render must never replay it (decisions.md, Session 3).
 */
export function useReveal(ref: React.RefObject<HTMLElement | null>) {
  useIsomorphicLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const blocks = Array.from(root.querySelectorAll<HTMLElement>(".rv"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      blocks.forEach((b) => b.classList.add("rv-in"));
      return;
    }
    const timers = blocks.map((b, i) => setTimeout(() => b.classList.add("rv-in"), 40 + i * 60));
    return () => timers.forEach(clearTimeout);
  }, [ref]);
}

/* ============================================================
   DIALOG — `.mdl pmdl` on the shared motion contract
   ============================================================ */

/**
 * The open/close contract. Timeouts are tracked so an unmount mid-close cannot
 * fire mdl-motion's cleanup into a detached element.
 */
export function useMdl(onOpen?: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  // The page behind a sheet must not scroll under it — on a handheld the
  // bottom sheet is pinned to the viewport, so a page that keeps scrolling
  // reads as the sheet sliding off. Reference-counted (lib/scrollLock), never
  // a hand-rolled body.style.overflow: nested locks poison each other and the
  // page stays locked with nothing holding it (decisions.md, Session 3).
  const release = useRef<(() => void) | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const after = useCallback((ms: number, fn: () => void) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);

  const close = useCallback(() => {
    if (ref.current) closeMdl(ref.current, after);
    setIsOpen(false);
    // Released only once the box is off screen: unlock at the top of the exit
    // and the page jumps back to its scroll position behind a sheet that is
    // still visible.
    if (!release.current) return;
    after(MDL_EXIT_MS, () => {
      release.current?.();
      release.current = null;
    });
  }, [after]);

  const open = useCallback(() => {
    if (!ref.current) return;
    openMdl(ref.current);
    if (!release.current) release.current = lockScroll();
    setIsOpen(true);
    onOpen?.();
  }, [onOpen]);

  useEffect(() => {
    const set = timers.current;
    return () => {
      set.forEach(clearTimeout);
      set.clear();
      release.current?.();
      release.current = null;
    };
  }, []);

  // Escape closes, and stops there: the shell binds its own Escape for the
  // command palette, and one key press should not dismiss two things.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  return { ref, open, close, isOpen };
}

export type SheetSize = "md" | "lg" | "drawer";

/**
 * One dialog frame. Centred on desktop (`md` 460px, `lg` 560px) or a
 * right-anchored drawer (`drawer`, full height); on a handheld every size is
 * the same bottom sheet with a 44px dismiss.
 */
export function Sheet({
  mdlRef,
  title,
  titleId,
  size = "md",
  onClose,
  children,
  foot,
  error,
}: {
  mdlRef: React.RefObject<HTMLDivElement | null>;
  title: string;
  titleId: string;
  size?: SheetSize;
  onClose: () => void;
  children: React.ReactNode;
  foot?: React.ReactNode;
  error?: string | null;
}) {
  return (
    <div
      className={cx("mdl pmdl", styles.sheet, size === "drawer" && styles.sheetDrawer)}
      ref={mdlRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="mdl-bg" onClick={onClose} />
      <div
        className={cx(
          "mdl-box",
          styles.box,
          size === "lg" && styles.boxLg,
          size === "drawer" && styles.boxDrawer,
        )}
      >
        <div className={cx("mdl-head mdl-head--row", styles.head)}>
          <span id={titleId} className={styles.headTitle}>
            {title}
          </span>
          <button className="mdl-x" type="button" onClick={onClose} aria-label="Close dialog">
            <Ic name="x" />
          </button>
        </div>
        <div className={cx("mdl-body", styles.body)}>{children}</div>
        {error ? <div className={cx("mf-err", styles.err)}>{error}</div> : null}
        {foot ? <div className={cx("mdl-foot", styles.foot)}>{foot}</div> : null}
      </div>
    </div>
  );
}

/* ============================================================
   STATUS CHIP — status colour for status only
   ============================================================ */

export type Tone = "ok" | "wait" | "bp" | "mute" | "bad";

export function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={cx("chip", styles.chip, styles[`chip_${tone}`])}>{children}</span>;
}

/* ============================================================
   KPI STRIP — the donor's single block, labels ABOVE numerals
   ============================================================ */

export function KpiStrip({
  cells,
  cols,
}: {
  cells: { label: string; value: string; accent?: boolean; tone?: "ok" | "warn" | "bad" }[];
  cols?: 3 | 4 | 5 | 6;
}) {
  return (
    <div className={cx("kpi-grid rv", cols && styles[`kpis${cols}`])}>
      {cells.map((c) => (
        <div className={cx("kpi", styles.kpi)} key={c.label}>
          <div className="kpi-lbl">{c.label}</div>
          <div
            className={cx(
              "kpi-val",
              c.accent && "accent",
              c.tone === "ok" && styles.kpiOk,
              c.tone === "warn" && styles.kpiWarn,
              c.tone === "bad" && styles.kpiBad,
            )}
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   FORM PARTS
   ============================================================ */

/** A pill group for a 2–4 way choice. Buttons, not radios: the house select is
 *  for long lists; a model choice reads better as a drawn switch. */
export function Seg<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div className={styles.seg} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cx(styles.segBtn, o.value === value && styles.segOn)}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A value the admin hands over — promo code, invite link — with a copy. */
export function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.copy}>
      <div className={styles.copyTxt}>
        <div className={styles.copyLbl}>{label}</div>
        <div className={styles.copyVal} title={value}>
          {value}
        </div>
      </div>
      <button
        type="button"
        className={styles.copyBtn}
        aria-label={`Copy ${label}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        <Ic name={copied ? "check" : "dup"} />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** The house empty state — a 1.5px dashed note on the drawing. */
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className={cx("empty", styles.empty)}>{children}</div>;
}

/** The mono annotation layer — meta rows, dates, technical numbers. */
export function Meta({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx(styles.meta, className)}>{children}</div>;
}
