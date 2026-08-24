"use client";

// Admin shell — sidebar. The donor's `.sb*` markup verbatim (the same DOM the
// dashboard sidebar renders, so the dashboard module's :global rules, the
// sliding indicator plate and the mobile drawer all behave exactly as
// authored), drawing the ADMIN nav map instead of the contractor one.
//
// What is deliberately NOT here: the role filter (an admin is an admin), the
// settings gear (no admin settings page) and the footer sign-out (it lives in
// the topbar for this shell — one control, one place).

import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useNavBadges } from "@/components/v3/blueprint-shell/nav-role";
import { ADMIN_NAV_SECTIONS, activeAdminHref } from "./admin-nav";

/** Initials for the avatar plate — the same rule the dashboard sidebar uses. */
function monogram(name: string): string {
  const p = name.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
  if (!p.length) return "?";
  return p.length === 1
    ? p[0].slice(0, 2).toUpperCase()
    : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export function AdminSidebar({ adminName }: { adminName: string }) {
  const pathname = usePathname() ?? "";
  const active = activeAdminHref(pathname);
  // Pending-action counts by href, from the (admin) layout via NavRoleProvider.
  const badges = useNavBadges();

  return (
    <aside className="sb">
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
              >
                <svg className="ic">
                  <use href={`#${item.icon}`} />
                </svg>
                {item.label}
                {(badges[item.href] ?? 0) > 0 && (
                  <span className="sb-badge" aria-label={`${badges[item.href]} pending`}>
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
    </aside>
  );
}
