"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { HoverPopover } from "@/components/ui/HoverPopover";

/**
 * The sidebar's remaining-quota pill: a hairline "ledger remainder" capsule
 * with a tabular numeral — how many of this resource the plan has left this
 * cycle. Deliberately quieter than NavBadge's solid-ink unread pill (hairline
 * beats border; the number is the message). Rendered only for limited
 * resources — unlimited plans never see it.
 *
 * Hover / focus / tap opens the upsell popover: usage so far and an Upgrade
 * link to the subscription page.
 */
export function NavLimitCounter({
  remaining,
  limit,
  plan,
  cappedBy,
}: {
  remaining: number;
  limit: number;
  plan: string;
  /** Set when a tighter resource bounds this one — drives the "tied to" copy. */
  cappedBy?: string;
}) {
  const planLabel = plan
    ? plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase()
    : "your plan";
  const out = remaining <= 0;
  // Estimators are bounded by proposals (each estimate becomes one). When that
  // bound is what's biting, say so instead of implying the estimate quota ran out.
  const tiedToProposals = cappedBy === "proposalsCreated";

  return (
    <HoverPopover
      side="right"
      className="w-[236px]"
      content={
        <div className="space-y-2">
          <p className="text-[12.5px] leading-relaxed text-[color:var(--ink)]">
            {tiedToProposals ? (
              out ? (
                <>
                  You&rsquo;re out of proposals on {planLabel}. Every AI estimate uses a
                  proposal &mdash; upgrade to make more.
                </>
              ) : (
                <>
                  <strong className="tabular-nums">{remaining}</strong>{" "}
                  {remaining === 1 ? "estimate" : "estimates"} left &mdash; tied to your{" "}
                  <strong className="tabular-nums">{remaining}</strong> remaining{" "}
                  {remaining === 1 ? "proposal" : "proposals"} on {planLabel}.
                </>
              )
            ) : out ? (
              <>
                You&rsquo;ve used all <strong className="tabular-nums">{limit}</strong> included
                in {planLabel}.
              </>
            ) : (
              <>
                <strong className="tabular-nums">{remaining}</strong> of{" "}
                <span className="tabular-nums">{limit}</span> left on {planLabel}.
              </>
            )}
          </p>
          <Link
            href={"/dashboard/subscription-blueprint" as never}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-[color:var(--accent)] hover:underline underline-offset-2"
          >
            Upgrade for more
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      }
    >
      <span
        aria-label={`${remaining} of ${limit} remaining`}
        className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full border border-[color:var(--ink-line)] bg-white text-[10.5px] font-medium tabular-nums text-[color:var(--ink-muted)] cursor-default"
      >
        {remaining}
      </span>
    </HoverPopover>
  );
}
