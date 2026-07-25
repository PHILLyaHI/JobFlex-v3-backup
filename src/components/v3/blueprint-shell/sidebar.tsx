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

type NavItem = { label: string; icon: string; href: string };
type NavSection = { label: string; items: NavItem[] };

// Donor navigation map (design-system.md → "Sidebar navigation map").
// `href: "#"` marks a surface that has no page yet — those keep the donor's
// dead-link behavior (click is swallowed, indicator still slides).
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Work",
    items: [
      { label: "Overview", icon: "i-grid", href: "/dashboard" },
      { label: "Proposals", icon: "i-file", href: "/dashboard/proposals" },
      { label: "Clients", icon: "i-users", href: "/dashboard/clients" },
      { label: "Leads", icon: "i-target", href: "/dashboard/leads" },
      { label: "Projects", icon: "i-folder", href: "/dashboard/projects" },
      { label: "CRM", icon: "i-crm", href: "/dashboard/crm" },
    ],
  },
  {
    label: "Delivery",
    items: [
      { label: "Calendar", icon: "i-cal", href: "/dashboard/calendar" },
      { label: "Jobs", icon: "i-jobs", href: "/dashboard/jobs" },
      { label: "Workers", icon: "i-hardhat", href: "/dashboard/workers" },
      { label: "Hire", icon: "i-userplus", href: "/dashboard/hire" },
      { label: "Company", icon: "i-building", href: "/dashboard/company" },
    ],
  },
  {
    label: "Money",
    items: [{ label: "Financials", icon: "i-bank", href: "/dashboard/financials" }],
  },
  {
    label: "Automation",
    items: [
      { label: "Smart Proposal", icon: "i-bulb", href: "/dashboard/advanced-ai" },
      { label: "Roof estimator", icon: "i-roof", href: "#" },
      { label: "Fence estimator", icon: "i-fence", href: "#" },
      { label: "Phone", icon: "i-phone", href: "/dashboard/phone" },
      { label: "Messages", icon: "i-msg", href: "/dashboard/messages" },
      { label: "Announcements", icon: "i-megaphone", href: "/dashboard/announcements" },
      { label: "Reviews", icon: "i-thumb", href: "/dashboard/reviews" },
      { label: "Trade board", icon: "i-board", href: "/dashboard/trade" },
      { label: "Referrals", icon: "i-gift", href: "/dashboard/referrals" },
      { label: "Reports", icon: "i-chart", href: "/dashboard/reports" },
    ],
  },
];

/** Longest-prefix match so child routes keep their parent item lit. */
function activeHref(pathname: string): string | null {
  let best: string | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.href === "#") continue;
      const hit = pathname === item.href || pathname.startsWith(item.href + "/");
      if (hit && (best === null || item.href.length > best.length)) best = item.href;
    }
  }
  return best;
}

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
