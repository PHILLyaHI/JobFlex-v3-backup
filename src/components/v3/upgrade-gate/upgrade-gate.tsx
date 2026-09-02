// THE UPGRADE GATE — what a custom-plan org sees at the URL of a page its
// plan does not include.
//
// It RENDERS AT THE BLOCKED URL rather than redirecting (owner's call,
// 2026-08-31): the nav keeps drawing the locked page as a dimmed, padlocked
// row, clicking it lands here, and pasting the URL lands here too — one
// answer for both doors, and the address bar still says where you are. The
// layouts (src/app/dashboard/layout.tsx and src/app/(dashboard)/layout.tsx)
// render this INSTEAD of the page component, so the page's own server code
// never runs for an org that has not bought it — the gate is the boundary,
// not a curtain in front of the page.
//
// A PLAIN STYLESHEET, self-scoped under .jf-upgate, for the same reason the
// support widget's is: this renders inside whichever shell owns the URL —
// blueprint desktop, classic, or a handheld frame — so it can lean on none of
// their hash spaces. Tokens are read with fallbacks, never re-declared.

import Link from "next/link";
import type { Route } from "next";
import { CUSTOM_PAGES } from "@/lib/customPlan";
import "./upgrade-gate.css";

/** The catalog row that owns this pathname, for the headline. */
function pageFor(pathname: string) {
  return CUSTOM_PAGES.find((p) => pathname === p.href || pathname.startsWith(p.href + "/"));
}

export function UpgradeGate({ pathname }: { pathname: string }) {
  const page = pageFor(pathname);
  const label = page?.label ?? "This page";
  return (
    <div className="jf-upgate">
      <div className="jf-upgate-card">
        <div className="jf-upgate-kick">Custom plan · not included</div>
        <svg className="jf-upgate-lock" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="11" width="16" height="10" rx="1.5" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        <h1 className="jf-upgate-h">{label} isn&apos;t in your plan.</h1>
        <p className="jf-upgate-p">
          Your custom plan covers the pages you picked at signup
          {page ? (
            <>
              {" "}
              — <b>{page.label}</b> ({page.note.toLowerCase()}) wasn&apos;t one of them.
            </>
          ) : (
            "."
          )}{" "}
          Upgrade to a full plan to open everything, no page picking.
        </p>
        <div className="jf-upgate-row">
          <Link className="jf-upgate-go" href={"/dashboard/upgrade" as Route}>
            See plans &amp; upgrade
          </Link>
          <Link className="jf-upgate-back" href={"/dashboard" as Route}>
            Back to overview
          </Link>
        </div>
      </div>
    </div>
  );
}
