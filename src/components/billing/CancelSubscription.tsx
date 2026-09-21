"use client";

/**
 * CANCEL SUBSCRIPTION — the last row of the subscription page (owner,
 * 2026-09-20), rendered by BOTH editions: the desktop blueprint page and the
 * handheld build. One component, so the wording, the confirmation and the
 * money rule cannot drift between viewports.
 *
 * The rule, stated in the dialog and enforced in actions/billing.ts: the
 * cancellation is BOOKED for the end of the cycle already paid for. Nothing
 * stops today, nothing is refunded, and the booking can be lifted from this
 * same row until the date passes.
 *
 * The confirmation is the house dialog (ConfirmPlanChange with a `body`) —
 * the same box the plan changes and the limit gate use.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { cancelSubscription, resumeSubscription } from "@/actions/billing";
import { longDate } from "@/lib/format";
import { toast } from "@/components/ui/Toast";
import { ConfirmPlanChange } from "./ConfirmPlanChange";
import "./cancel-subscription.css";

export interface CancelSubscriptionProps {
  /** Subscription.status — only a live subscription can be cancelled. */
  status: string;
  /** Catalog name of the current plan, for the dialog's sentence. */
  planName: string;
  /** ISO end of the paid cycle: what the shop keeps until. */
  endsAt: string | null;
  /** A cancellation is already booked for the end of the cycle. */
  cancelAtPeriodEnd: boolean;
}

/** Anything else (INACTIVE, CANCELED, FREE …) has nothing to cancel. */
const LIVE = new Set(["ACTIVE", "TRIALING", "PAST_DUE"]);

export function CancelSubscription({
  status,
  planName,
  endsAt,
  cancelAtPeriodEnd,
}: CancelSubscriptionProps) {
  const router = useRouter();
  const [ask, setAsk] = useState<"cancel" | "resume" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(
    async (which: "cancel" | "resume") => {
      if (busy) return;
      setBusy(true);
      setErr(null);
      try {
        const res = which === "cancel" ? await cancelSubscription() : await resumeSubscription();
        if (!res.ok) {
          setErr(res.error);
          return;
        }
        const when = res.endsAt ? longDate(res.endsAt) : null;
        if (which === "cancel") {
          toast.success(
            "Subscription cancelled",
            when ? `Everything keeps working until ${when}.` : "Everything keeps working until the end of the cycle.",
          );
        } else {
          toast.success(
            "Subscription kept",
            when ? `Billing continues as normal · next bill ${when}.` : "Billing continues as normal.",
          );
        }
        router.refresh();
      } catch {
        setErr("Something went wrong. Try again.");
      } finally {
        setBusy(false);
        setAsk(null);
      }
    },
    [busy, router],
  );

  if (!LIVE.has((status || "").toUpperCase())) return null;
  const when = endsAt ? longDate(endsAt) : null;

  return (
    <>
      <section className={"jfcx" + (cancelAtPeriodEnd ? " jfcx-booked" : "")} aria-label="Cancel subscription">
        <div className="jfcx-body">
          <div className="jfcx-k">{cancelAtPeriodEnd ? "Cancelling" : "Cancel"}</div>
          <div className="jfcx-t">
            {cancelAtPeriodEnd
              ? when
                ? `Your subscription ends ${when}`
                : "Your subscription is set to end this cycle"
              : "Cancel your subscription"}
          </div>
          <p className="jfcx-s">
            {cancelAtPeriodEnd
              ? "You keep everything on your plan until then, and you won't be billed again. Change your mind any time before that date."
              : when
                ? `You keep ${planName} until ${when} — the cycle you've already paid for — and you won't be billed again. Nothing is refunded for the days you don't use.`
                : `You keep ${planName} until the end of the cycle you've already paid for, and you won't be billed again. Nothing is refunded for the days you don't use.`}
          </p>
        </div>
        <div className="jfcx-act">
          <button
            type="button"
            className={"jfcx-btn" + (cancelAtPeriodEnd ? " jfcx-keep" : "")}
            disabled={busy}
            onClick={() => setAsk(cancelAtPeriodEnd ? "resume" : "cancel")}
          >
            {busy ? "Working…" : cancelAtPeriodEnd ? "Keep my subscription" : "Cancel subscription"}
          </button>
        </div>
        {err ? (
          <p className="jfcx-err" role="alert">
            {err}
          </p>
        ) : null}
      </section>

      <ConfirmPlanChange
        open={ask !== null}
        kicker={ask === "resume" ? "Keep subscription" : "Cancel subscription"}
        title={ask === "resume" ? `Keep ${planName}?` : `Cancel ${planName}?`}
        confirmLabel={ask === "resume" ? "Keep it" : "Yes, cancel"}
        busy={busy}
        onConfirm={() => void run(ask === "resume" ? "resume" : "cancel")}
        onCancel={() => {
          if (!busy) setAsk(null);
        }}
        body={
          ask === "resume" ? (
            <p>
              Billing goes back to normal{when ? `, starting with your next bill on ${when}` : ""}. Your plan and
              everything on it stay exactly as they are.
            </p>
          ) : (
            <p>
              {when ? `You keep ${planName} until ${when}` : `You keep ${planName} until the end of this cycle`} —
              every proposal, job and client stays where it is until then. After that the plan&rsquo;s features close
              and you won&rsquo;t be billed again. Nothing is refunded for unused days, and you can undo this from this
              page any time before that date.
            </p>
          )
        }
      />
    </>
  );
}
