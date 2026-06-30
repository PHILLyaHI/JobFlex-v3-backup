"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ExternalLink, ArrowLeft, Check } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

const SECONDS = 5;

interface Props {
  open: boolean;
  /** Dashboard id — used for the "Back to proposal" detail route. */
  proposalId: string;
  /** Public-portal token — the page the client sees, at /portal/q/{publicId}. */
  publicId: string;
}

/**
 * Shown right after a proposal is saved. Counts down five seconds, then sends
 * the contractor to the public portal (the client-facing view). The countdown
 * is a courtesy, not a trap — three buttons let them jump to the portal now,
 * step back into the proposal, or bail out to the proposals list. Dismissing
 * the dialog (Esc / scrim / ✕) is treated as "exit to list". Every path leaves
 * this page, so there's no local close state to reset.
 */
export function SavedTransferModal({ open, proposalId, publicId }: Props) {
  const router = useRouter();
  const [count, setCount] = React.useState(SECONDS);

  const portalHref = `/portal/q/${publicId}`;
  const proposalHref = `/dashboard/proposals/${proposalId}`;
  const listHref = "/dashboard/proposals";

  // One-shot guard so a button tap and the auto-redirect can't both fire.
  const navigated = React.useRef(false);
  const go = React.useCallback(
    (href: string) => {
      if (navigated.current) return;
      navigated.current = true;
      router.push(href as never);
    },
    [router],
  );

  React.useEffect(() => {
    if (!open) return;
    navigated.current = false;
    setCount(SECONDS);
    const tick = setInterval(() => setCount((c) => Math.max(0, c - 1)), 1000);
    const done = setTimeout(() => {
      clearInterval(tick);
      go(portalHref);
    }, SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(done);
    };
  }, [open, go, portalHref]);

  return (
    <Dialog
      open={open}
      onClose={() => go(listHref)}
      title="Proposal saved"
      description="Taking you to the public portal: the page your client sees."
      footer={
        <>
          <Button variant="ghost" onClick={() => go(listHref)}>
            Exit to proposals
          </Button>
          <Button
            variant="outline"
            icon={<ArrowLeft className="h-3.5 w-3.5" />}
            onClick={() => go(proposalHref)}
          >
            Back to proposal
          </Button>
          <Button
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            onClick={() => go(portalHref)}
          >
            Open portal now
          </Button>
        </>
      }
    >
      <div className="rounded-[var(--r-md)] bg-[color:var(--paper-deep)] p-4">
        <div className="flex items-center gap-3.5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)] shadow-[inset_0_0_0_1px_rgba(31,122,82,0.14)]">
            {count === 0 ? (
              <Check className="h-5 w-5" strokeWidth={2.5} />
            ) : (
              <span className="font-display tabular text-[18px] font-bold leading-none">{count}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[color:var(--ink)]">
              Opening the public portal…
            </p>
            <p className="mt-0.5 text-[12px] text-[color:var(--ink-muted)]">
              {count === 0
                ? "Taking you there now."
                : `Redirecting in ${count} second${count === 1 ? "" : "s"}. Pick a destination to skip the wait.`}
            </p>
          </div>
        </div>
        <div className="mt-3.5 h-1 overflow-hidden rounded-full bg-[color:var(--ink-line)]">
          <motion.div
            className="h-full rounded-full bg-[color:var(--accent)]"
            initial={{ width: "100%" }}
            animate={{ width: "0%" }}
            transition={{ duration: SECONDS, ease: "linear" }}
          />
        </div>
      </div>
    </Dialog>
  );
}
