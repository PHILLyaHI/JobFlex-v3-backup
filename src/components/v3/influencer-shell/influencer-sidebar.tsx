"use client";

// Partner portal — sidebar. The donor's `.sb*` markup verbatim (the same DOM the
// dashboard and admin sidebars render, so the dashboard module's :global rules,
// the sliding indicator plate and the mobile drawer all behave as authored),
// drawing the PARTNER nav map.
//
// What is deliberately NOT here: badges (a partner has no queue to clear), the
// settings gear, and the footer sign-out — that lives in the topbar, one control
// in one place, the same choice the admin shell made.

import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { INFLUENCER_NAV_SECTIONS, activeInfluencerHref } from "./influencer-nav";

/** Initials for the avatar plate — the rule the other two sidebars use. */
function monogram(name: string): string {
  const p = name.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
  if (!p.length) return "?";
  return p.length === 1
    ? p[0].slice(0, 2).toUpperCase()
    : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export function InfluencerSidebar({ partnerName }: { partnerName: string }) {
  const pathname = usePathname() ?? "";
  const active = activeInfluencerHref(pathname);

  return (
    <aside className="sb">
      <div className="sb-head">
        <span className="sb-mark-box">
          <Image className="sb-mark-img" src="/jobflex-mark.png" alt="" width={108} height={108} priority />
        </span>
        <div className="sb-head-txt">
          <div className="sb-head-name">JOBFLEX</div>
          <div className="sb-head-sub">Partners</div>
        </div>
      </div>

      <nav className="sb-scroll">
        <div className="sb-indicator" id="sbIndicator"></div>
        {/* Fragments, not wrapper elements: the donor keeps labels and links as
            direct children of .sb-scroll, and the indicator measures
            link.offsetTop against it. */}
        {INFLUENCER_NAV_SECTIONS.map((section) => (
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
              </Link>
            ))}
          </Fragment>
        ))}
      </nav>

      {/* Identity plate only — no link behind it. A partner has no account page;
          this is how you check which login you are on. */}
      <div className="sb-foot">
        <div className="sb-foot-acc" title={partnerName}>
          <span className="sb-foot-av">{monogram(partnerName)}</span>
          <span className="sb-foot-txt">
            <span className="sb-foot-name">{partnerName}</span>
            <span className="sb-foot-role">Partner</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
