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
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

// The nav map and the active-item resolver moved to ./nav-map.ts on 2026-07-29
// so the mobile hamburger drawers could share them instead of carrying a
// second, href-less copy. Re-exported here for existing importers.
import { NAV_SECTIONS, activeHref } from "./nav-map";

export { NAV_SECTIONS };

export type SidebarUser = {
  /** Display name for the account block. */
  name: string;
  /** Org role, already humanised ("Owner", "Installer"). */
  role: string;
};

/** Initials for the avatar plate — the same rule the rest of the app uses. */
function monogram(name: string): string {
  const p = name.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
  if (!p.length) return "?";
  return p.length === 1
    ? p[0].slice(0, 2).toUpperCase()
    : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export function Sidebar({ user }: { user?: SidebarUser }) {
  const pathname = usePathname() ?? "";
  const active = activeHref(pathname);
  // The shell renders on routes that read the session server-side and pass it
  // down. The fallback is deliberately generic rather than the donor's "Ivan":
  // a wrong name is worse than no name.
  const name = user?.name || "Account";
  const role = user?.role || "";

  return (
    <aside className="sb">
      <div className="sb-head">
        {/* The real product mark, not the drawn `i-logo` sketch J (owner's
            call, 2026-07-30) — desktop now shows the same logo as the handheld
            shell. The asset is mostly transparent margin, so it renders larger
            than its box and the box clips it; see .sb-mark-img in
            dashboard-blueprint/blueprint.module.css. The i-logo symbol stays in
            the sprite: /v3/proposals-v2 and /v3/proposals-v3 still draw it. */}
        <span className="sb-mark-box">
          <Image className="sb-mark-img" src="/jobflex-mark.png" alt="" width={108} height={108} priority />
        </span>
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

      {/* The account block was a dead <button> showing the hardcoded literals
          "Ivan" / "Owner" — the donor's demo identity, displayed to every user
          regardless of who was signed in. It is now a real link to the account
          page, and the name, role and monogram come from the session. */}
      <div className="sb-foot">
        <Link className="sb-foot-acc" href={"/dashboard/settings/account" as Route} title="Account">
          <span className="sb-foot-av">{monogram(name)}</span>
          <span className="sb-foot-txt">
            <span className="sb-foot-name">{name}</span>
            <span className="sb-foot-role">{role}</span>
          </span>
        </Link>
        {/* The donor's settings page marks this gear active (donor line 1974
            ships it as `class="sb-foot-ic on"`), so it lights up while any
            /dashboard/settings URL is open. The `.sb-foot-ic.on` rule lives in
            settings-blueprint/settings.module.css — it is the one chrome rule
            that page's stylesheet owns, and it only applies while that
            stylesheet is on the shell root. */}
        <Link
          className={`sb-foot-ic${pathname.startsWith("/dashboard/settings") ? " on" : ""}`}
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
