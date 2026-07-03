"use client";
import * as React from "react";
import { MapPin, Clock, Users, Radio, Check, Ban, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { type OwnPost, URGENCY, STATUS, agoLabel } from "./trade-data";

interface OwnPostCardProps {
  post: OwnPost;
  onMarkFilled: (post: OwnPost) => void;
  onCancel: (post: OwnPost) => void;
}

export function OwnPostCard({ post, onMarkFilled, onCancel }: OwnPostCardProps) {
  const urgency = post.urgency ? URGENCY[post.urgency] : null;
  const status = STATUS[post.status];

  return (
    <div className="paper-card overflow-hidden">
      <div className="px-4 pt-3.5 pb-4">
        {/* Pills + time */}
        <div className="flex items-center gap-2">
          <Badge tone="accent">{post.tradeType}</Badge>
          <Badge tone={status.tone}>{status.label}</Badge>
          {post.status === "OPEN" && urgency && (
            <Badge tone={urgency.tone} dot={urgency.dot}>
              {urgency.label}
            </Badge>
          )}
          <span className="ml-auto tabular text-[11px] text-[color:var(--ink-muted)]">
            {agoLabel(post.hoursAgo)}
          </span>
        </div>

        {/* Title */}
        <h3 className="mt-2.5 font-display text-[16px] leading-snug tracking-[-0.015em] text-[color:var(--ink)]">
          {post.title}
        </h3>

        {/* Meta */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[color:var(--ink-muted)]">
          {post.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-[color:var(--ink-faint)]" />
              {post.location}
            </span>
          )}
          {post.budget && (
            <span className="tabular font-medium text-[color:var(--ink-soft)]">
              {post.budget}
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
      </div>

      {/* Footer */}
      {post.status === "OPEN" ? (
        <div className="flex items-stretch gap-2 border-t border-[color:var(--ink-line)] px-4 py-3">
          <Button
            variant="outline"
            icon={<Ban className="h-4 w-4" />}
            className="h-11 flex-1"
            onClick={() => onCancel(post)}
          >
            Cancel post
          </Button>
          <Button
            variant="primary"
            icon={<Check className="h-4 w-4" />}
            className="h-11 flex-1"
            onClick={() => onMarkFilled(post)}
          >
            Mark filled
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 border-t border-[color:var(--ink-line)] px-4 py-3 text-[12px] text-[color:var(--ink-muted)]">
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
    </div>
  );
}
