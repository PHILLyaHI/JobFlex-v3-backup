"use client";

// Admin shell — sidebar. The donor's `.sb*` markup verbatim (the same DOM the
// dashboard sidebar renders, so the dashboard module's :global rules, the
// sliding indicator plate and the mobile drawer all behave exactly as
// authored), drawing the ADMIN nav map instead of the contractor one.
//
// What is deliberately NOT here: the role filter (an admin is an admin), the
// settings gear (no admin settings page) and the footer sign-out (it lives in
// the topbar for this shell — one control, one place).
//
// FOLDS (owner, 2026-10-02): the arrow halfway down the sidebar's edge folds
// it to the icon rail the dashboard sidebar has — the same global CSS
// (`[data-sb="fold"]` in blueprint-global.css), set on the shell root by
// admin-shell. Folded, each row's name shows as a hover plate beside the rail.

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { unreadSupportCount } from "@/actions/support";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useNavBadges } from "@/components/v3/blueprint-shell/nav-role";
import { foldShortcutLabel } from "@/components/v3/blueprint-shell/sidebar-fold";
import { ADMIN_NAV_SECTIONS, activeAdminHref } from "./admin-nav";

/** Initials for the avatar plate — the same rule the dashboard sidebar uses. */
function monogram(name: string): string {
  const p = name.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
  if (!p.length) return "?";
  return p.length === 1
    ? p[0].slice(0, 2).toUpperCase()
    : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export function AdminSidebar({
  adminName,
  folded = false,
  onToggleFold,
}: {
  adminName: string;
  /** Drawn as the icon rail (desktop only; the drawer ignores it). */
  folded?: boolean;
  /** Flips the fold; without it no arrow is drawn. */
  onToggleFold?: () => void;
}) {
  const pathname = usePathname() ?? "";
  const active = activeAdminHref(pathname);
  // Pending-action counts by href, from the (admin) layout via NavRoleProvider.
  const initialBadges = useNavBadges();
  const [supportCount, setSupportCount] = useState(initialBadges["/admin/support"] ?? 0);
  const badges: Record<string, number> = { ...initialBadges, "/admin/support": supportCount };

  // Layouts persist across navigation. Refresh the count without refreshing
  // the whole page or disturbing an admin's open form.
  useEffect(() => {
    let disposed = false;
    let pending = false;
    const refresh = async () => {
      if (document.visibilityState !== "visible" || pending) return;
      pending = true;
      try {
        const count = await unreadSupportCount();
        if (!disposed) setSupportCount(count);
      } catch {
        // Keep the last known count when offline; the next poll retries.
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [pathname, initialBadges]);

  // HOVER LABELS for the folded rail — the dashboard sidebar's plate, measured
  // against the sidebar itself (not the viewport: the shell root carries a CSS
  // zoom, and offsets measured inside it stay in its own coordinates where
  // viewport rectangles do not). `.sb-scroll` clips sideways, so the plate
  // lives outside it, in `.sb`.
  const sbRef = useRef<HTMLElement>(null);
  const [tip, setTip] = useState<{ text: string; top: number } | null>(null);
  const showTip = useCallback(
    (el: HTMLElement, text: string, always = false) => {
      if (!folded && !always) return;
      const sb = sbRef.current;
      if (!sb) return;
      let top = el.offsetHeight / 2;
      let node: HTMLElement | null = el;
      while (node && node !== sb) {
        top += node.offsetTop - (node.parentElement && node.parentElement !== sb ? node.parentElement.scrollTop : 0);
        node = node.offsetParent as HTMLElement | null;
      }
      setTip({ text, top });
    },
    [folded],
  );
  const hideTip = useCallback(() => setTip(null), []);
  const tipProps = (text: string, always = false) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => showTip(e.currentTarget, text, always),
    onFocus: (e: React.FocusEvent<HTMLElement>) => showTip(e.currentTarget, text, always),
    onMouseLeave: hideTip,
    onBlur: hideTip,
  });

  return (
    <aside className="sb" ref={sbRef}>
      <div className="sb-head">
        <span className="sb-mark-box">
          <Image className="sb-mark-img" src="/jobflex-mark.png" alt="" width={108} height={108} priority />
        </span>
        <div className="sb-head-txt">
          <div className="sb-head-name">JOBFLEX</div>
          <div className="sb-head-sub">Platform admin</div>
        </div>
      </div>

      <nav className="sb-scroll">
        <div className="sb-indicator" id="sbIndicator"></div>
        {/* Fragments, not wrapper elements: the donor keeps labels and links as
            direct children of .sb-scroll, and the indicator measures
            link.offsetTop against it. */}
        {ADMIN_NAV_SECTIONS.map((section) => (
          <Fragment key={section.label}>
            <div className="sb-sec-label">{section.label}</div>
            {section.items.map((item) => (
              <Link
                key={item.href}
                className={`sb-link${item.href === active ? " active" : ""}`}
                href={item.href as Route}
                {...tipProps(item.label)}
              >
                <svg className="ic">
                  <use href={`#${item.icon}`} />
                </svg>
                {/* The name in its own span so the folded rail can hide it. */}
                <span className="sb-lbl">{item.label}</span>
                {(badges[item.href] ?? 0) > 0 && (
                  <span className="sb-badge" aria-live="polite" aria-label={`${badges[item.href]} ${item.href === "/admin/support" ? "unread support tickets" : "pending"}`}>
                    {badges[item.href] > 99 ? "99+" : badges[item.href]}
                  </span>
                )}
              </Link>
            ))}
          </Fragment>
        ))}
      </nav>

      {/* Identity plate only — no link behind it, there is no admin account
          page. It is how you check WHICH login you are on. */}
      <div className="sb-foot">
        <div className="sb-foot-acc" title={adminName}>
          <span className="sb-foot-av">{monogram(adminName)}</span>
          <span className="sb-foot-txt">
            <span className="sb-foot-name">{adminName}</span>
            <span className="sb-foot-role">Platform</span>
          </span>
        </div>
      </div>

      {/* THE FOLD ARROW — on the sidebar's edge, halfway down. It points the
          way the sidebar will move; its label says what it does and the
          shortcut that does the same. Desktop only: the drawer below 860px
          hides it. */}
      {onToggleFold && (
        <button
          type="button"
          className="sb-fold"
          aria-label={folded ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!folded}
          onClick={() => {
            hideTip();
            onToggleFold();
          }}
          {...tipProps(`${folded ? "Expand" : "Collapse"} · ${foldShortcutLabel()}`, true)}
        >
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      )}

      {tip && (
        <div className="sb-tip" role="tooltip" style={{ top: tip.top }}>
          {tip.text}
        </div>
      )}
    </aside>
  );
}
