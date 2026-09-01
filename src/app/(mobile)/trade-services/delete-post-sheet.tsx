"use client";
import * as React from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { type OwnPost } from "./trade-data";

/**
 * Confirm before deleting a post. A bottom sheet rather than a `confirm()` or a
 * centre-screen dialog: it lands under the thumb, it can be dismissed by
 * dragging, and it is the pattern the rest of this surface already uses.
 *
 * The copy tells the truth about what the server will actually do. A post
 * nobody was notified about is removed outright; a post that reached people is
 * withdrawn, and the conversations it started — messages OTHER people wrote —
 * are left standing. Saying "this cannot be undone" for both would be a lie in
 * one direction and a shrug in the other.
 */
export function DeletePostSheet({
  post,
  open,
  busy,
  onClose,
  onConfirm,
}: {
  post: OwnPost | null;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (post: OwnPost) => void;
}) {
  const reached = post ? post.broadcastCount > 0 : false;
  return (
    <BottomSheet open={open} onClose={busy ? () => {} : onClose} title="Delete this post?">
      {post && (
        <div className="-mt-1">
          <div className="flex items-start gap-3 rounded-[var(--r-md)] bg-[color-mix(in_srgb,var(--rose)_7%,transparent)] px-3.5 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--rose)]" />
            <p className="text-[13px] leading-relaxed text-[color:var(--ink-soft)]">
              {reached ? (
                <>
                  <span className="font-semibold text-[color:var(--ink)]">
                    {post.broadcastCount}
                  </span>{" "}
                  contractor{post.broadcastCount === 1 ? " was" : "s were"} notified about this
                  post. It disappears from your list and from theirs. Any conversation it
                  already started stays where it is — those messages are not yours to erase.
                </>
              ) : (
                <>Nobody was notified about this post, so it is removed outright.</>
              )}
            </p>
          </div>

          <p className="mt-4 font-display text-[16px] leading-snug tracking-[-0.015em] text-[color:var(--ink)]">
            {post.title}
          </p>

          <div className="sticky bottom-0 -mx-5 mt-6 flex items-stretch gap-2.5 border-t border-[color:var(--ink-line)] bg-[color:var(--paper)] px-5 pt-3 pb-1">
            <Button variant="ghost" className="h-12 flex-1" onClick={onClose} disabled={busy}>
              Keep it
            </Button>
            <Button
              variant="ghost"
              icon={<Trash2 className="h-4 w-4" />}
              loading={busy}
              className={
                "h-12 flex-1 border border-[color:var(--rose)] text-[color:var(--rose)] " +
                "bg-[color-mix(in_srgb,var(--rose)_7%,transparent)] " +
                "hover:bg-[color-mix(in_srgb,var(--rose)_14%,transparent)]"
              }
              onClick={() => onConfirm(post)}
            >
              Delete post
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
