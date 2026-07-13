"use client";
import * as React from "react";
import Link from "next/link";
import { X, MapPin } from "lucide-react";

const SNOOZE_KEY = "jf.leadProfileNag";
const SNOOZE_DAYS = 7;

// Nudges owners/admins whose org can't receive platform leads yet (missing
// geocoded address and/or trades). Dismiss snoozes for 7 days via localStorage
// — deliberately not schema-backed.
export function CompleteLeadProfileBanner({
  needsAddress,
  needsTrades,
}: {
  needsAddress: boolean;
  needsTrades: boolean;
}) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    try {
      const until = Number(window.localStorage.getItem(SNOOZE_KEY) ?? 0);
      if (Date.now() > until) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const missing =
    needsAddress && needsTrades
      ? "your business address and the trades you take"
      : needsAddress
        ? "your business address"
        : "the trades you take";

  return (
    <div className="paper-card mb-5 flex items-start gap-3 p-4">
      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]">
        <MapPin className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="quiet-caps !mb-0.5">Lead center</div>
        <p className="text-[13px] leading-relaxed text-[color:var(--ink)]">
          Homeowner leads near you aren&apos;t reaching your shop yet — add {missing} to start
          receiving them.{" "}
          <Link
            href="/dashboard/company"
            className="font-medium text-[color:var(--accent-ink)] underline underline-offset-[3px]"
          >
            Complete your profile
          </Link>
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss for a week"
        onClick={() => {
          try {
            window.localStorage.setItem(
              SNOOZE_KEY,
              String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000),
            );
          } catch {
            /* still hide for this render */
          }
          setVisible(false);
        }}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[color:var(--ink-faint)] transition-colors hover:text-[color:var(--ink)]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
