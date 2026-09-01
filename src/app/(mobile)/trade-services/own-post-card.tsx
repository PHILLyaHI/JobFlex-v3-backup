"use client";
import * as React from "react";
import {
  MapPin,
  Clock,
  Users,
  Radio,
  Check,
  Ban,
  CheckCircle2,
  Pencil,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { type OwnPost, URGENCY, STATUS, agoLabel } from "./trade-data";

interface OwnPostCardProps {
  post: OwnPost;
  /** Opens the detail sheet. The card body is the control that does it. */
  onOpen: (post: OwnPost) => void;
  onEdit: (post: OwnPost) => void;
  onDelete: (post: OwnPost) => void;
  onMarkFilled: (post: OwnPost) => void;
  onCancel: (post: OwnPost) => void;
}

export function OwnPostCard({
  post,
  onOpen,
  onEdit,
  onDelete,
  onMarkFilled,
  onCancel,
}: OwnPostCardProps) {
  const urgency = post.urgency ? URGENCY[post.urgency] : null;
  const status = STATUS[post.status];
  const open = post.status === "OPEN";

  return (
    <div className="paper-card overflow-hidden">
      {/* The whole brief is one control: a real <button>, so it is focusable
          and announced, rather than a click handler on a bare div. */}
      <button
        type="button"
        onClick={() => onOpen(post)}
        className="block w-full px-4 pt-3.5 pb-4 text-left transition-colors active:bg-[color:var(--paper-deep)] focus-ring"
      >
        {/* Pills + time */}
        <div className="flex items-center gap-2">
          <Badge tone="accent">{post.tradeType}</Badge>
          <Badge tone={status.tone}>{status.label}</Badge>
          {open && urgency && (
            <Badge tone={urgency.tone} dot={urgency.dot}>
              {urgency.label}
            </Badge>
          )}
          <span className="ml-auto tabular text-[11px] text-[color:var(--ink-muted)]">
            {agoLabel(post.hoursAgo)}
          </span>
        </div>

        {/* Title */}
        <h3 className="mt-2.5 flex items-start gap-1.5 font-display text-[16px] leading-snug tracking-[-0.015em] text-[color:var(--ink)]">
          <span className="min-w-0 flex-1">{post.title}</span>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--ink-faint)]" />
        </h3>

        {/* Rate — the figure you scan a list of posts for, so it gets its own
            line rather than a place in the middle of the meta run. A post with
            no rate omits the line entirely; a dash would be a gap that reads
            like a loading state. */}
        {post.budget && (
          <div className="tabular mt-1.5 text-[14px] font-semibold text-[color:var(--ink)]">
            {post.budget}
          </div>
        )}

        {/* Meta */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[color:var(--ink-muted)]">
          {post.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-[color:var(--ink-faint)]" />
              {post.location}
            </span>
          )}
          {post.timeWindow && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-[color:var(--ink-faint)]" />
              {post.timeWindow}
            </span>
          )}
        </div>

        {/* Response summary */}
        <div className="mt-3.5 flex items-center gap-4 rounded-[var(--r-md)] bg-[color:var(--paper-deep)] px-3 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-[12px]">
            <Users className="h-4 w-4 text-[color:var(--accent)]" />
            <span className="tabular font-semibold text-[color:var(--ink)]">
              {post.interestedCount}
            </span>
            <span className="text-[color:var(--ink-muted)]">interested</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--ink-muted)]">
            <Radio className="h-4 w-4 text-[color:var(--ink-faint)]" />
            <span className="tabular">{post.broadcastCount}</span> notified
          </span>
        </div>
      </button>

      {/* Footer */}
      <div className="border-t border-[color:var(--ink-line)] px-4 py-3">
        {!open && (
          <div className="mb-2.5 flex items-center gap-1.5 text-[12px] text-[color:var(--ink-muted)]">
            {post.status === "FILLED" ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-[color:var(--emerald)]" />
                Filled, no longer broadcasting.
              </>
            ) : (
              <>
                <Ban className="h-4 w-4 text-[color:var(--ink-faint)]" />
                Cancelled, no longer broadcasting.
              </>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-stretch gap-2">
          {open && (
            <>
              <Button
                variant="outline"
                icon={<Pencil className="h-4 w-4" />}
                className="h-11 min-w-[calc(50%-0.25rem)] flex-1"
                onClick={() => onEdit(post)}
              >
                Edit
              </Button>
              <Button
                variant="primary"
                icon={<Check className="h-4 w-4" />}
                className="h-11 min-w-[calc(50%-0.25rem)] flex-1"
                onClick={() => onMarkFilled(post)}
              >
                Mark filled
              </Button>
              <Button
                variant="outline"
                icon={<Ban className="h-4 w-4" />}
                className="h-11 min-w-[calc(50%-0.25rem)] flex-1"
                onClick={() => onCancel(post)}
              >
                Cancel post
              </Button>
            </>
          )}
          <DeleteButton onClick={() => onDelete(post)} full={!open} />
        </div>
      </div>
    </div>
  );
}

/** Destructive, but not a solid red plate: a soft fill with a danger border and
 *  danger text. A red-filled button on a card you are only browsing is a dare. */
export function DeleteButton({
  onClick,
  full,
  height = "h-11",
}: {
  onClick: () => void;
  full?: boolean;
  /** The sheet's action bar runs at h-12; the card's runs at h-11. */
  height?: string;
}) {
  return (
    <Button
      variant="ghost"
      icon={<Trash2 className="h-4 w-4" />}
      className={
        height + " border border-[color:var(--rose)] text-[color:var(--rose)] " +
        "bg-[color-mix(in_srgb,var(--rose)_7%,transparent)] " +
        "hover:bg-[color-mix(in_srgb,var(--rose)_14%,transparent)] " +
        (full ? "w-full" : "min-w-[calc(50%-0.25rem)] flex-1")
      }
      onClick={onClick}
    >
      Delete
    </Button>
  );
}
