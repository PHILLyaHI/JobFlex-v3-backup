"use client";
import * as React from "react";
import {
  MapPin,
  Wallet,
  CalendarClock,
  Users,
  Radio,
  Check,
  Ban,
  Pencil,
} from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DeleteButton } from "./own-post-card";
import { type OwnPost, URGENCY, STATUS, agoLabel } from "./trade-data";

/**
 * The author's own post, opened from the My Posts list — the counterpart to
 * `TradeJobDetail` (which is the RECIPIENT's view of someone else's job).
 * Everything the card could not carry: the full brief, the specialties, and the
 * two numbers that say whether the broadcast worked.
 */
export function OwnPostDetail({
  post,
  open,
  onClose,
  onEdit,
  onDelete,
  onMarkFilled,
  onCancel,
}: {
  post: OwnPost | null;
  open: boolean;
  onClose: () => void;
  onEdit: (post: OwnPost) => void;
  onDelete: (post: OwnPost) => void;
  onMarkFilled: (post: OwnPost) => void;
  onCancel: (post: OwnPost) => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      {post && <Body post={post} onClose={onClose} {...{ onEdit, onDelete, onMarkFilled, onCancel }} />}
    </BottomSheet>
  );
}

function Body({
  post,
  onClose,
  onEdit,
  onDelete,
  onMarkFilled,
  onCancel,
}: {
  post: OwnPost;
  onClose: () => void;
  onEdit: (post: OwnPost) => void;
  onDelete: (post: OwnPost) => void;
  onMarkFilled: (post: OwnPost) => void;
  onCancel: (post: OwnPost) => void;
}) {
  const status = STATUS[post.status];
  const urgency = post.urgency ? URGENCY[post.urgency] : null;
  const isOpen = post.status === "OPEN";
  // Every action but Edit changes what this panel is describing, so the panel
  // closes with them; Edit hands off to the composer, which closes it too.
  const act = (fn: (post: OwnPost) => void) => () => {
    fn(post);
    onClose();
  };

  return (
    <div className="-mt-1">
      <div className="flex items-center gap-2">
        <Badge tone="accent">{post.tradeType}</Badge>
        <Badge tone={status.tone}>{status.label}</Badge>
        {isOpen && urgency && (
          <Badge tone={urgency.tone} dot={urgency.dot}>
            {urgency.label}
          </Badge>
        )}
      </div>

      <h2 className="mt-3 font-display text-[22px] leading-tight tracking-[-0.02em] text-[color:var(--ink)]">
        {post.title}
      </h2>
      <p className="mt-1.5 text-[12px] text-[color:var(--ink-muted)]">
        Posted {agoLabel(post.hoursAgo)}
      </p>

      {/* Reach — the reason to have broadcast at all. */}
      <div className="mt-4 flex items-center gap-4 rounded-[var(--r-md)] bg-[color:var(--paper-deep)] px-3.5 py-3">
        <span className="inline-flex items-center gap-1.5 text-[13px]">
          <Users className="h-4 w-4 text-[color:var(--accent)]" />
          <span className="tabular font-semibold text-[color:var(--ink)]">
            {post.interestedCount}
          </span>
          <span className="text-[color:var(--ink-muted)]">interested</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-[13px] text-[color:var(--ink-muted)]">
          <Radio className="h-4 w-4 text-[color:var(--ink-faint)]" />
          <span className="tabular">{post.broadcastCount}</span> notified
        </span>
      </div>

      {(post.location || post.budget || post.timeWindow) && (
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4">
          {post.location && (
            <MetaCell
              icon={<MapPin className="h-3.5 w-3.5" />}
              label="Service area"
              value={post.location}
            />
          )}
          {post.budget && (
            <MetaCell
              icon={<Wallet className="h-3.5 w-3.5" />}
              label="Rate"
              value={post.budget}
              tabular
            />
          )}
          {post.timeWindow && (
            <MetaCell
              icon={<CalendarClock className="h-3.5 w-3.5" />}
              label="Timeline"
              value={post.timeWindow}
            />
          )}
        </dl>
      )}

      <div className="mt-5">
        <div className="quiet-caps">The job</div>
        <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-[color:var(--ink-soft)]">
          {post.description}
        </p>
      </div>

      {post.specialties.length > 0 && (
        <div className="mt-5">
          <div className="quiet-caps">Skills needed</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {post.specialties.map((s) => (
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

      <div className="sticky bottom-0 -mx-5 mt-6 border-t border-[color:var(--ink-line)] bg-[color:var(--paper)] px-5 pt-3 pb-1">
        <div className="flex flex-wrap items-stretch gap-2">
          {isOpen && (
            <>
              <Button
                variant="outline"
                icon={<Pencil className="h-4 w-4" />}
                className="h-12 min-w-[calc(50%-0.25rem)] flex-1"
                onClick={act(onEdit)}
              >
                Edit post
              </Button>
              <Button
                variant="primary"
                icon={<Check className="h-4 w-4" />}
                className="h-12 min-w-[calc(50%-0.25rem)] flex-1"
                onClick={act(onMarkFilled)}
              >
                Mark filled
              </Button>
              <Button
                variant="outline"
                icon={<Ban className="h-4 w-4" />}
                className="h-12 min-w-[calc(50%-0.25rem)] flex-1"
                onClick={act(onCancel)}
              >
                Cancel post
              </Button>
            </>
          )}
          <DeleteButton onClick={act(onDelete)} full={!isOpen} height="h-12" />
        </div>
      </div>
    </div>
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
      <dd className={"mt-1 text-[14px] text-[color:var(--ink)]" + (tabular ? " tabular" : "")}>
        {value}
      </dd>
    </div>
  );
}
