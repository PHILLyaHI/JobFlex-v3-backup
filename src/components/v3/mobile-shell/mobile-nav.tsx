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
import {
  activeHref,
  canOpen,
  isLimitedRole,
  navSectionsFor,
} from "@/components/v3/blueprint-shell/nav-map";
import { useNavIdentity } from "@/components/v3/blueprint-shell/nav-role";
import { SignOutButton } from "@/components/v3/blueprint-shell/sign-out";
import { EstimatorPicker } from "@/components/v3/estimators-blueprint/estimator-picker";
import { ACTIVE_ENGINE_HREFS } from "@/components/v3/estimators-blueprint/estimators-data";
import styles from "./mobile-nav.module.css";
import "@/components/v3/estimators-blueprint/estimators-global.css";
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

/** Membership.role is a raw enum-ish string; the account row shows it to a
 *  human. Empty outside the provider rather than guessing "Owner". */
function roleTitle(role: string | null): string {
  if (!role) return "";
  return role.charAt(0) + role.slice(1).toLowerCase();
}

/** Initials for the account plate — the same rule the desktop sidebar uses. */
function monogram(name: string): string {
  const p = name.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
  if (!p.length) return "?";
  return p.length === 1
    ? p[0].slice(0, 2).toUpperCase()
    : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export function MobileNav({ showSearch = true }: { showSearch?: boolean }) {
  const [open, setOpen] = useState(false);
  const navScrollRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  /* Derived from the URL, never held in state. A label string only moved the
     highlight, which is why the drawer could once change the plate without
     changing the page. */
  const active = activeHref(usePathname() ?? "");

  /* Who is looking, from the provider the blueprint layout mounts. The drawer
     drew the full 22-item map for everybody until 2026-08-17, so an installer
     invited as a field worker got a phone-sized copy of the manager's app.
     Same filter as the desktop sidebar, from the same module — see nav-map's
     ROLE FILTER header. Outside the provider (the standalone /mobile-*-v2
     review URLs) the role is null and nothing is filtered, exactly as before. */
  const { role, name: accountName } = useNavIdentity();
  const sections = navSectionsFor(role);
  /* Every engine in the picker lives outside a field worker's allow-list, so
     for them the handheld New Estimate button could only open a dialog whose
     every card bounces. Asked of the engine list itself, not a copy of it. */
  const canEstimate = ACTIVE_ENGINE_HREFS.some((href) => canOpen(role, href));
  const canOpenSettings = canOpen(role, "/dashboard/settings");
  const canOpenAccount = canOpen(role, "/dashboard/settings/account");

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

      {/* The estimator picker, mounted here for the same reason the desktop
          shell mounts it: this component is on every handheld surface, so the
          dialog its topbar button opens belongs beside it rather than in any
          one page. Its stylesheet carries its own tokens and keyframes, so it
          does not need the blueprint shell to be present. */}
      <EstimatorPicker />

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
            width={108}
            height={108}
            priority
          />
        </span>
        <span className={styles.tbarTxt}>
          <span className={styles.tbarName}>JOBFLEX</span>
          <span className={styles.tbarSub}>Contractor OS</span>
        </span>
        <div className={styles.tbarRight}>
          {/* New Estimate — the handheld twin of the desktop topbar's button,
              and the only way onto the estimator picker from a phone. An icon
              rather than a labelled button: the mobile topbar has no room for
              a word next to the mark, and every other control up here is an
              icon already. */}
          {canEstimate && (
            <button
              className={styles.tbarBtn}
              type="button"
              aria-label="New estimate"
              onClick={() => document.dispatchEvent(new CustomEvent("jf:estimator-picker"))}
            >
              <Icon id="i-plus" />
            </button>
          )}
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
            <Image className={styles.sbMarkImg} src="/jobflex-mark.png" alt="" width={108} height={108} />
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
          {sections.map((sec) => (
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

        {/* The account row printed the donor's demo identity — the literal
            strings "I" / "Ivan" / "Owner" — to every signed-in user, and both
            controls were dead <button>s. It now shows the real session identity
            when the provider supplies one (the desktop sidebar was fixed the
            same way, for the same reason: a wrong name is worse than no name),
            and the settings gear is a real link, dropped for the roles whose
            gate would bounce it. */}
        <div className={styles.sbFoot}>
          {canOpenAccount ? (
            <Link
              className={styles.sbFootAcc}
              href={"/dashboard/settings/account" as Route}
              title="Account"
              onClick={() => setOpen(false)}
            >
              <span className={styles.sbFootAv}>{monogram(accountName || "Account")}</span>
              <span className={styles.sbFootTxt}>
                <span className={styles.sbFootName}>{accountName || "Account"}</span>
                <span className={styles.sbFootRole}>{roleTitle(role)}</span>
              </span>
            </Link>
          ) : (
            <div className={styles.sbFootAcc} title={accountName || "Account"}>
              <span className={styles.sbFootAv}>{monogram(accountName || "Account")}</span>
              <span className={styles.sbFootTxt}>
                <span className={styles.sbFootName}>{accountName || "Account"}</span>
                <span className={styles.sbFootRole}>{roleTitle(role)}</span>
              </span>
            </div>
          )}
          {canOpenSettings && (
            <Link
              className={styles.sbFootIc}
              href={"/dashboard/settings" as Route}
              aria-label="Settings"
              onClick={() => setOpen(false)}
            >
              <Icon id="i-gear" />
            </Link>
          )}
          {/* Sign out — gated roles only, matching the desktop sidebar. The
              drawer IS the handheld sidebar, so the same rule applies rather
              than a second answer on phones. */}
          {isLimitedRole(role) && (
            <SignOutButton
              className={`${styles.sbFootIc} ${styles.sbFootOut}`}
              iconClassName={styles.ic}
              onDone={() => setOpen(false)}
            />
          )}
        </div>
      </aside>
    </>
  );
}
