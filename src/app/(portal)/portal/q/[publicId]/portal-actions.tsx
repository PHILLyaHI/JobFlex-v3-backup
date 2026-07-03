"use client";
import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Check, CreditCard, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";

export function PortalActions({
  publicId,
  status,
  total,
}: {
  publicId: string;
  status: string;
  total: number;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = React.useState(false);
  const [note, setNote] = React.useState("");

  async function accept() {
    try {
      setBusy("accept");
      const res = await fetch(`/api/public-quote/${publicId}/accept`, { method: "POST" });
      if (!res.ok) throw new Error("Couldn't record acceptance");
      toast.success("Proposal accepted", "Thank you! The team has been notified.");
      router.refresh();
    } catch (err) {
      toast.error("Acceptance failed", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function decline() {
    const trimmed = note.trim();
    if (!trimmed) {
      toast.error("A note is required", "Add a short reason so the team knows why.");
      return;
    }
    try {
      setBusy("decline");
      const res = await fetch(`/api/public-quote/${publicId}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Couldn't record your response");
      }
      toast.success("Response sent", "Thanks for letting the team know.");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't decline", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function checkout(provider: "stripe" | "square" | "paypal") {
    try {
      setBusy(provider);
      const res = await fetch(`/api/checkout/${provider}`, {
        method: "POST",
        body: JSON.stringify({ publicId, amount: Math.round(total * 100) }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else if (data?.disabled) {
        toast.info(
          `${provider[0].toUpperCase() + provider.slice(1)} isn't configured`,
          `Add the ${provider.toUpperCase()} keys to .env to enable checkout.`,
        );
      } else {
        throw new Error(data?.error ?? "Checkout failed");
      }
    } catch (err) {
      toast.error("Couldn't start checkout", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  if (status === "DECLINED") {
    return (
      <div className="inline-flex items-center gap-3 rounded-full bg-[color:var(--paper-deep)] py-2 pl-2 pr-5 text-[color:var(--ink-soft)]">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[color:var(--ink-soft)] text-white">
          <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </span>
        <span className="text-[14px] font-semibold">You declined this proposal</span>
      </div>
    );
  }

  if (status === "ACCEPTED" || status === "PAID") {
    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="inline-flex items-center gap-3 rounded-full bg-[color:var(--accent-soft)] py-2 pl-2 pr-5 text-[color:var(--accent-ink)]"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[color:var(--accent)] text-white shadow-[0_2px_8px_rgba(31,122,82,0.35)]">
          <motion.svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <motion.path
              d="M20 6 9 17l-5-5"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: reduce ? 0 : 0.15 }}
            />
          </motion.svg>
        </span>
        <span className="text-[14px] font-semibold">
          {status === "PAID" ? "Paid in full — thank you" : "Accepted — thank you"}
        </span>
      </motion.div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button size="lg" loading={busy === "accept"} onClick={accept} icon={<Check className="h-4 w-4" />}>
          Accept proposal
        </Button>
        <Button
          size="lg"
          variant="outline"
          loading={busy === "stripe"}
          onClick={() => checkout("stripe")}
          icon={<CreditCard className="h-4 w-4" />}
        >
          Pay with Stripe
        </Button>
        <Button size="lg" variant="ghost" loading={busy === "square"} onClick={() => checkout("square")}>
          Square
        </Button>
        <Button size="lg" variant="ghost" loading={busy === "paypal"} onClick={() => checkout("paypal")}>
          PayPal
        </Button>
        <Button
          size="lg"
          variant="ghost"
          onClick={() => setDeclineOpen((v) => !v)}
          aria-expanded={declineOpen}
        >
          Decline
        </Button>
      </div>

      {declineOpen ? (
        <motion.div
          initial={reduce ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div className="mt-4 rounded-[var(--r-md)] bg-[color:var(--paper-deep)] p-4">
            <label
              htmlFor="decline-note"
              className="quiet-caps block text-[color:var(--ink-muted)]"
            >
              Let the team know why <span className="text-[color:var(--ink-faint)]">(required)</span>
            </label>
            <textarea
              id="decline-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="A short reason helps the contractor follow up."
              className="mt-2 w-full resize-y rounded-[var(--r-md)] bg-white px-3 py-2.5 text-[14px] leading-[1.55] text-[color:var(--ink)] hairline focus:outline-none focus:shadow-[0_0_0_3px_rgba(31,122,82,0.18)]"
            />
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="md"
                variant="outline"
                loading={busy === "decline"}
                disabled={!note.trim()}
                onClick={decline}
              >
                Submit decline
              </Button>
              <Button
                size="md"
                variant="ghost"
                onClick={() => {
                  setDeclineOpen(false);
                  setNote("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}
