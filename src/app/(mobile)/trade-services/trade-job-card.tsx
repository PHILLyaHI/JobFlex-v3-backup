"use client";
import * as React from "react";
import { MapPin, Clock, Check, X, MessageSquare, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import {
  type TradeJob,
  URGENCY,
  agoLabel,
  hiddenRemaining,
} from "./trade-data";

interface TradeJobCardProps {
  job: TradeJob;
  onOpen: (job: TradeJob) => void;
  onInterested?: (job: TradeJob) => void;
  onNotInterested?: (job: TradeJob) => void;
  onRestore?: (job: TradeJob) => void;
  onChat?: (job: TradeJob) => void;
}

const MAX_SPECIALTIES = 3;

export function TradeJobCard({
  job,
  onOpen,
  onInterested,
  onNotInterested,
  onRestore,
  onChat,
}: TradeJobCardProps) {
  const urgency = job.urgency ? URGENCY[job.urgency] : null;
  const extra = job.specialties.length - MAX_SPECIALTIES;

  return (
    <div className="paper-card overflow-hidden">
      {/* Tappable body opens the detail sheet. Kept as a single button so the
          card stays accessible without nesting interactive controls. */}
      <button
        type="button"
        onClick={() => onOpen(job)}
        className="block w-full text-left px-4 pt-3.5 pb-4 focus-ring rounded-t-[var(--r-lg)]"
      >
        {/* Pills + time */}
        <div className="flex items-center gap-2">
          <Badge tone="accent">{job.tradeType}</Badge>
          {urgency && (
            <Badge tone={urgency.tone} dot={urgency.dot}>
              {urgency.label}
            </Badge>
          )}
          <span className="ml-auto tabular text-[11px] text-[color:var(--ink-muted)]">
            {agoLabel(job.hoursAgo)}
          </span>
        </div>

        {/* Title */}
        <h3 className="mt-2.5 font-display text-[16px] leading-snug tracking-[-0.015em] text-[color:var(--ink)] line-clamp-2">
          {job.title}
        </h3>

        {/* Meta line */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[color:var(--ink-muted)]">
          {job.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-[color:var(--ink-faint)]" />
              {job.location}
            </span>
          )}
          {job.budget && (
            <span className="tabular font-medium text-[color:var(--ink-soft)]">
              {job.budget}
            </span>
          )}
          {job.timeWindow && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-[color:var(--ink-faint)]" />
              {job.timeWindow}
            </span>
          )}
        </div>

        {/* Specialties */}
        {job.specialties.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {job.specialties.slice(0, MAX_SPECIALTIES).map((s) => (
              <span
                key={s}
                className="hairline rounded-full px-2 py-0.5 text-[11px] text-[color:var(--ink-muted)]"
              >
                {s}
              </span>
            ))}
            {extra > 0 && (
              <span className="text-[11px] text-[color:var(--ink-muted)]">
                +{extra} more
              </span>
            )}
          </div>
        )}

        {/* Poster */}
        <div className="mt-3.5 flex items-center gap-2">
          <Avatar name={job.postedByName} size={22} />
          <span className="text-[12px] text-[color:var(--ink-muted)]">
            <span className="text-[color:var(--ink-soft)]">{job.postedByName}</span>
            {job.postedByCompany && <> · {job.postedByCompany}</>}
          </span>
        </div>
      </button>

      {/* Action footer — varies by the viewer's relationship to the job */}
      <Footer
        job={job}
        onInterested={onInterested}
        onNotInterested={onNotInterested}
        onRestore={onRestore}
        onChat={onChat}
      />
    </div>
  );
}

function Footer({
  job,
  onInterested,
  onNotInterested,
  onRestore,
  onChat,
}: Pick<
  TradeJobCardProps,
  "job" | "onInterested" | "onNotInterested" | "onRestore" | "onChat"
>) {
  if (job.viewerStatus === "NEW") {
    return (
      <div className="flex items-stretch gap-2 border-t border-[color:var(--ink-line)] px-4 py-3">
        <Button
          variant="outline"
          size="md"
          icon={<X className="h-4 w-4" />}
          className="h-11 flex-1"
          onClick={() => onNotInterested?.(job)}
        >
          Not interested
        </Button>
        <Button
          variant="primary"
          size="md"
          icon={<Check className="h-4 w-4" />}
          className="h-11 flex-1"
          onClick={() => onInterested?.(job)}
        >
          Interested
        </Button>
      </div>
    );
  }

  if (job.viewerStatus === "INTERESTED") {
    return (
      <div className="flex items-center gap-2 border-t border-[color:var(--ink-line)] px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[color:var(--accent-ink)]">
          <Check className="h-4 w-4" />
          Interested
        </span>
        <Button
          variant="primary"
          size="md"
          icon={<MessageSquare className="h-4 w-4" />}
          className="ml-auto h-11"
          onClick={() => onChat?.(job)}
        >
          Open chat
        </Button>
      </div>
    );
  }

  // NOT_INTERESTED → hidden, with the 7-day clear countdown.
  const remaining = hiddenRemaining(job.hiddenDaysAgo);
  return (
    <div className="flex items-center gap-2 border-t border-[color:var(--ink-line)] px-4 py-3">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-[11px]",
          remaining.expiring
            ? "text-[color:var(--ink-soft)]"
            : "text-[color:var(--ink-muted)]",
        )}
      >
        <Clock
          className={cn(
            "h-3.5 w-3.5",
            remaining.expiring
              ? "text-[color:var(--amber)]"
              : "text-[color:var(--ink-faint)]",
          )}
        />
        Auto-clears · {remaining.label}
      </span>
      <Button
        variant="outline"
        size="md"
        icon={<RotateCcw className="h-4 w-4" />}
        className="ml-auto h-11"
        onClick={() => onRestore?.(job)}
      >
        Restore
      </Button>
    </div>
  );
}
