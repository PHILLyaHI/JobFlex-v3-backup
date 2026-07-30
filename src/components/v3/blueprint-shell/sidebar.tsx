"use client";

// Blueprint shell — sidebar. Markup is the donor's, verbatim; the only
// adaptations are functional: dead `href="#"` anchors became real routes via
// next/link, and the `active` item is derived from the current pathname
// instead of being hardcoded per page. The rendered DOM is still
// `<a class="sb-link">`, so the donor's styling and the sliding indicator
// plate behave exactly as authored.
//
// This lives in the shared layout, so it mounts ONCE and survives navigation
// between blueprint pages — no teardown, no re-running the entry cascade.

import { Fragment } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

// The nav map and the active-item resolver moved to ./nav-map.ts on 2026-07-29
// so the mobile hamburger drawers could share them instead of carrying a
// second, href-less copy. Re-exported here for existing importers.
import { NAV_SECTIONS, activeHref } from "./nav-map";

export { NAV_SECTIONS };

export function Sidebar() {
  const pathname = usePathname() ?? "";
  const active = activeHref(pathname);

  return (
    <aside className="sb">
      <div className="sb-head">
        <svg className="sb-mark" viewBox="0 0 24 24">
          <use href="#i-logo" />
        </svg>
        <div className="sb-head-txt">
          <div className="sb-head-name">JOBFLEX</div>
          <div className="sb-head-sub">Contractor OS</div>
        </div>
      </div>

      <nav className="sb-scroll">
        <div className="sb-indicator" id="sbIndicator"></div>
        {/* Fragments, not wrapper elements: the donor keeps labels and links as
            direct children of .sb-scroll, and the indicator measures
            link.offsetTop against it. */}
        {NAV_SECTIONS.map((section) => (
          <Fragment key={section.label}>
            <div className="sb-sec-label">{section.label}</div>
            {section.items.map((item) =>
              item.href === "#" ? (
                <a key={item.label} className="sb-link" href="#">
                  <svg className="ic">
                    <use href={`#${item.icon}`} />
                  </svg>
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.label}
                  className={`sb-link${item.href === active ? " active" : ""}`}
                  href={item.href as Route}
                >
                  <svg className="ic">
                    <use href={`#${item.icon}`} />
                  </svg>
                  {item.label}
                </Link>
              ),
            )}
          </Fragment>
        ))}
      </nav>

      <div className="sb-foot">
        <button className="sb-foot-acc" title="Account">
          <span className="sb-foot-av">I</span>
          <span className="sb-foot-txt">
            <span className="sb-foot-name">Ivan</span>
            <span className="sb-foot-role">Owner</span>
          </span>
        </button>
        <Link
          className="sb-foot-ic"
          href={"/dashboard/settings" as Route}
          title="Settings"
          aria-label="Settings"
        >
          <svg className="ic">
            <use href="#i-gear" />
          </svg>
        </Link>
      </div>
    </aside>
  );
}
