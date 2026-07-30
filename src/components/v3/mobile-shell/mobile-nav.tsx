"use client";

// MOBILE NAV — the shared handheld navigation chrome.
//
// One component for every mobile surface: the dark topbar (burger, product
// mark, wordmark, optional search, notifications) and the slide-out drawer
// carrying the full 22-item nav map with its sliding active-item plate.
//
// WHY THIS EXISTS (owner's call, 2026-07-29). The topbar and drawer were
// byte-identical in all three mobile page modules: 29 duplicated CSS classes,
// three copies of the open/close state, three copies of the indicator
// measurement, three private sprites. Every new mobile page paid that cost
// again, and the three copies had already begun to drift. There is now one, and
// a new page gets the nav by rendering <MobileNav /> as the first child of its
// own `.app` grid.
//
// This deliberately mirrors the DESKTOP arrangement: BlueprintShell owns the
// sidebar + topbar + sprite for the ~21 desktop blueprint pages and each page
// supplies only its `.content` children. Same division of labour, same reason.
//
// WHAT THE PAGE STILL OWNS. This is nav only, not a layout wrapper: the page
// keeps its own `.app` grid, `.scroll` scroller and `.content`, because those
// carry page-specific padding, the graph-paper parallax and the reveal
// cascade — and because `.content > *` is what the cascade measures, so it has
// to stay in the page's own tree.
//
// TOKEN CONTRACT. The stylesheet reads --paper / --ink / --topbar-h /
// --sidebar-w / --pad-x / --tbar-gap / --safe-b and friends from the page root
// it is mounted inside. Custom properties inherit, so a page declaring them on
// its `.app` is enough. See mobile-nav.module.css for the full list.

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV_SECTIONS, activeHref } from "@/components/v3/blueprint-shell/nav-map";
import styles from "./mobile-nav.module.css";
import { MobileSprite } from "./sprite";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Icon({ id }: { id: string }) {
  return (
    <svg className={styles.ic} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

export function MobileNav({ showSearch = true }: { showSearch?: boolean }) {
  const [open, setOpen] = useState(false);
  const navScrollRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  /* Derived from the URL, never held in state. A label string only moved the
     highlight, which is why the drawer could once change the plate without
     changing the page. */
  const active = activeHref(usePathname() ?? "");

  /* The sliding plate is MEASURED, not guessed: it needs the active link's real
     offsetTop/Height, which only exist once the drawer is laid out. `ready` is
     added a frame later so the first open snaps into place rather than sliding
     down from zero. */
  useEffect(() => {
    const ind = indicatorRef.current;
    if (!ind) return;
    if (!open) {
      ind.classList.remove(styles.ready);
      return;
    }
    const nav = navScrollRef.current;
    if (!nav) return;
    const raf = requestAnimationFrame(() => {
      const link = nav.querySelector<HTMLElement>(`.${styles.sbLink}.${styles.active}`);
      if (!link) return;
      ind.style.top = `${link.offsetTop}px`;
      ind.style.height = `${link.offsetHeight}px`;
      requestAnimationFrame(() => ind.classList.add(styles.ready));
    });
    return () => cancelAnimationFrame(raf);
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  /* Press stamp for the nav's own controls. Delegated from the nav root so it
     also covers the drawer's links, which only exist once it is open. */
  const press = (e: React.MouseEvent) => {
    if (prefersReducedMotion()) return;
    const sel = [styles.tbarBtn, styles.sbClose, styles.sbFootIc, styles.sbFootAcc]
      .map((c) => `.${c}`)
      .join(", ");
    const el = (e.target as HTMLElement).closest<HTMLElement>(sel);
    if (!el) return;
    el.classList.remove(styles.pressed);
    void el.offsetWidth;
    el.classList.add(styles.pressed);
    el.addEventListener("animationend", () => el.classList.remove(styles.pressed), { once: true });
  };

  return (
    <>
      {/* One sprite for the whole surface — the page ships none of its own. */}
      <MobileSprite />

      <header className={styles.tbar} onClick={press}>
        <button
          className={styles.tbarBtn}
          type="button"
          aria-label="Open navigation"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Icon id="i-menu" />
        </button>
        {/* The real product mark, not a drawn glyph. Only ~42.5% of the asset is
            ink; the rest is transparent margin, so an oversized <img> is cropped
            by its box to keep that margin out of the layout.
            brightness(0) invert(1) makes the black asset paper-white for the ink
            plate without a second colourway. */}
        <span className={styles.tbarMarkBox}>
          <Image
            className={styles.tbarMarkImg}
            src="/jobflex-mark.png"
            alt=""
            width={66}
            height={66}
            priority
          />
        </span>
        <span className={styles.tbarTxt}>
          <span className={styles.tbarName}>JOBFLEX</span>
          <span className={styles.tbarSub}>Contractor OS</span>
        </span>
        <div className={styles.tbarRight}>
          {showSearch ? (
            <button className={styles.tbarBtn} type="button" aria-label="Search">
              <Icon id="i-search" />
            </button>
          ) : null}
          <button className={styles.tbarBtn} type="button" aria-label="Notifications">
            <Icon id="i-bell" />
            <span className={styles.bellDot} />
          </button>
        </div>
      </header>

      <div
        className={`${styles.sbOverlay} ${open ? styles.on : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={`${styles.sb} ${open ? styles.open : ""}`}
        aria-label="Main navigation"
        aria-hidden={!open}
        onClick={press}
      >
        <div className={styles.sbHead}>
          <span className={styles.sbMarkBox}>
            <Image className={styles.sbMarkImg} src="/jobflex-mark.png" alt="" width={68} height={68} />
          </span>
          <div className={styles.sbHeadTxt}>
            <div className={styles.sbHeadName}>JOBFLEX</div>
            <div className={styles.sbHeadSub}>Contractor OS</div>
          </div>
          <button
            className={styles.sbClose}
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <Icon id="i-x" />
          </button>
        </div>

        <nav className={styles.sbScroll} ref={navScrollRef}>
          <div className={styles.sbIndicator} ref={indicatorRef} />
          {NAV_SECTIONS.map((sec) => (
            <div key={sec.label}>
              <div className={styles.sbSecLabel}>{sec.label}</div>
              {sec.items.map((item) => {
                const isActive = item.href === active;
                const cls = `${styles.sbLink} ${isActive ? styles.active : ""}`;
                // Surfaces with no page yet stay dead, but must not jump the
                // scroller to the top on the way — the drawer just closes.
                return item.href === "#" ? (
                  <a
                    key={item.label}
                    className={cls}
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setOpen(false);
                    }}
                  >
                    <Icon id={item.icon} />
                    {item.label}
                  </a>
                ) : (
                  <Link
                    key={item.label}
                    className={cls}
                    href={item.href as Route}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    <Icon id={item.icon} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={styles.sbFoot}>
          <button className={styles.sbFootAcc} type="button" title="Account">
            <span className={styles.sbFootAv}>I</span>
            <span className={styles.sbFootTxt}>
              <span className={styles.sbFootName}>Ivan</span>
              <span className={styles.sbFootRole}>Owner</span>
            </span>
          </button>
          <button className={styles.sbFootIc} type="button" aria-label="Settings">
            <Icon id="i-gear" />
          </button>
        </div>
      </aside>
    </>
  );
}
