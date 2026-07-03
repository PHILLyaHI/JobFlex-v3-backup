"use client";
import * as React from "react";
import {
  MapPin,
  Wallet,
  CalendarClock,
  Clock,
  Check,
  X,
  MessageSquare,
  RotateCcw,
} from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
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

interface TradeJobDetailProps {
  job: TradeJob | null;
  open: boolean;
  onClose: () => void;
  onInterested?: (job: TradeJob) => void;
  onNotInterested?: (job: TradeJob) => void;
  onRestore?: (job: TradeJob) => void;
  onChat?: (job: TradeJob) => void;
}

export function TradeJobDetail({
  job,
  open,
  onClose,
  onInterested,
  onNotInterested,
  onRestore,
  onChat,
}: TradeJobDetailProps) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      {job && (
        <div className="-mt-1">
          {/* Pills */}
          <div className="flex items-center gap-2">
            <Badge tone="accent">{job.tradeType}</Badge>
            {job.urgency && (
              <Badge tone={URGENCY[job.urgency].tone} dot={URGENCY[job.urgency].dot}>
                {URGENCY[job.urgency].label}
              </Badge>
            )}
          </div>

          {/* Title */}
          <h2 className="mt-3 font-display text-[22px] leading-tight tracking-[-0.02em] text-[color:var(--ink)]">
            {job.title}
          </h2>

          {/* Poster */}
          <div className="mt-3 flex items-center gap-2.5">
            <Avatar name={job.postedByName} size={32} />
            <div className="leading-tight">
              <div className="text-[13px] text-[color:var(--ink)]">
                {job.postedByName}
              </div>
              <div className="text-[12px] text-[color:var(--ink-muted)]">
                {job.postedByCompany ? `${job.postedByCompany} · ` : ""}
                Posted {agoLabel(job.hoursAgo)}
              </div>
            </div>
          </div>

          {/* Meta grid — urgency lives in the pill above, so it isn't repeated
              here; empty fields are omitted rather than shown as a placeholder. */}
          {(job.location || job.budget || job.timeWindow) && (
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4">
              {job.location && (
                <MetaCell
                  icon={<MapPin className="h-3.5 w-3.5" />}
                  label="Location"
                  value={job.location}
                />
              )}
              {job.budget && (
                <MetaCell
                  icon={<Wallet className="h-3.5 w-3.5" />}
                  label="Budget"
                  value={job.budget}
                  tabular
                />
              )}
              {job.timeWindow && (
                <MetaCell
                  icon={<CalendarClock className="h-3.5 w-3.5" />}
                  label="Timeline"
                  value={job.timeWindow}
                />
              )}
            </dl>
          )}

          {/* Description */}
          <div className="mt-5">
            <div className="quiet-caps">The job</div>
            <p className="mt-2 text-[14px] leading-relaxed text-[color:var(--ink-soft)]">
              {job.description}
            </p>
          </div>

          {/* Specialties */}
          {job.specialties.length > 0 && (
            <div className="mt-5">
              <div className="quiet-caps">Skills needed</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {job.specialties.map((s) => (
                  <span
                    key={s}
                    className="hairline rounded-full px-2.5 py-1 text-[12px] text-[color:var(--ink-soft)]"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Sticky action bar */}
          <div className="sticky bottom-0 -mx-5 mt-6 border-t border-[color:var(--ink-line)] bg-[color:var(--paper)] px-5 pt-3 pb-1">
            <DetailActions
              job={job}
              onClose={onClose}
              onInterested={onInterested}
              onNotInterested={onNotInterested}
              onRestore={onRestore}
              onChat={onChat}
            />
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

function MetaCell({
  icon,
  label,
  value,
  tabular,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tabular?: boolean;
}) {
  return (
    <div>
      <dt className="quiet-caps flex items-center gap-1.5">
        {icon}
        {label}
      </dt>
      <dd
        className={
          "mt-1 text-[14px] text-[color:var(--ink)]" + (tabular ? " tabular" : "")
        }
      >
        {value}
      </dd>
    </div>
  );
}

function DetailActions({
  job,
  onClose,
  onInterested,
  onNotInterested,
  onRestore,
  onChat,
}: {
  job: TradeJob;
  onClose: () => void;
  onInterested?: (job: TradeJob) => void;
  onNotInterested?: (job: TradeJob) => void;
  onRestore?: (job: TradeJob) => void;
  onChat?: (job: TradeJob) => void;
}) {
  const act = (fn?: (job: TradeJob) => void) => () => {
    fn?.(job);
    onClose();
  };

  if (job.viewerStatus === "NEW") {
    return (
      <div className="flex items-stretch gap-2.5">
        <Button
          variant="outline"
          icon={<X className="h-4 w-4" />}
          className="h-12 flex-1"
          onClick={act(onNotInterested)}
        >
          Not interested
        </Button>
        <Button
          variant="primary"
          icon={<Check className="h-4 w-4" />}
          className="h-12 flex-[1.4]"
          onClick={() => {
            // Reading the full job and committing should land in the conversation,
            // not drop the user back onto a list with the card now gone.
            onInterested?.(job);
            onChat?.(job);
            onClose();
          }}
        >
          I&apos;m interested
        </Button>
      </div>
    );
  }

  if (job.viewerStatus === "INTERESTED") {
    return (
      <div className="flex items-stretch gap-2.5">
        <Button
          variant="ghost"
          icon={<X className="h-4 w-4" />}
          className="h-12"
          onClick={act(onNotInterested)}
        >
          Withdraw
        </Button>
        <Button
          variant="primary"
          icon={<MessageSquare className="h-4 w-4" />}
          className="h-12 flex-1"
          onClick={act(onChat)}
        >
          Open chat with {job.postedByName.split(" ")[0]}
        </Button>
      </div>
    );
  }

  const remaining = hiddenRemaining(job.hiddenDaysAgo);
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-[12px]",
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
        variant="primary"
        icon={<RotateCcw className="h-4 w-4" />}
        className="ml-auto h-12"
        onClick={act(onRestore)}
      >
        Restore
      </Button>
    </div>
  );
}
