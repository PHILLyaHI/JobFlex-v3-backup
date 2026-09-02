"use client";

// The request page's live half: the status card, and the "find me another
// contractor" flow. The button is VISIBLE from the moment of a match but
// locked for the first 24 hours (owner's rule #1) — locked state says when it
// opens rather than hiding, so the homeowner knows the option exists. The
// reason dialog is skippable in one tap (rule #6). The server re-checks
// everything this component merely displays.

import * as React from "react";
import { useRouter } from "next/navigation";
import { requestAnotherContractor } from "@/actions/homeownerPortal";

const REASONS = [
  "Never heard from them",
  "Couldn't agree on price",
  "Scheduling didn't work out",
];

interface Props {
  token: string;
  status: string; // MATCHING | OFFERED | MATCHED | MANUAL_QUEUE
  projectType: string | null;
  submittedAt: string;
  orgName: string | null;
  orgPhone: string | null;
  matchedAt: string | null;
  unlockAt: string | null; // ISO; null when not MATCHED
  attemptsLeft: number; // automatic re-matches before the manual queue
}

const STATUS_COPY: Record<string, { chip: string; title: string; body: string }> = {
  MATCHING: {
    chip: "Matching",
    title: "We're finding your contractor",
    body: "Your request is being matched with qualified local pros right now. You'll get an email the moment one takes it on.",
  },
  OFFERED: {
    chip: "Matching",
    title: "A contractor is reviewing your request",
    body: "We've offered your project to a local pro — they have up to 24 hours to take it on, and most respond much sooner.",
  },
  MATCHED: {
    chip: "Matched",
    title: "You're matched",
    body: "They have your details and will reach out. Most contractors call within a couple of hours.",
  },
  MANUAL_QUEUE: {
    chip: "In progress",
    title: "A person is placing your request",
    body: "Automatic matching didn't land your project with the right contractor, so our team is placing it by hand. We'll be in touch — no action needed.",
  },
};

function fmt(dt: string): string {
  return new Date(dt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function RequestStatusCard(p: Props) {
  const router = useRouter();
  const copy = STATUS_COPY[p.status] ?? STATUS_COPY.MATCHING;

  // Times are formatted in the VIEWER'S locale and "locked" depends on the
  // viewer's clock — both differ between the server render and the browser, so
  // they only render after mount (locked-shaped until then) to keep hydration
  // clean.
  // useSyncExternalStore instead of a set-state-in-effect: the server snapshot
  // is null (nothing time-dependent renders during SSR) and the client reads
  // the real clock, re-subscribing on a 30s tick.
  const now = React.useSyncExternalStore(
    React.useCallback((onChange) => {
      const t = setInterval(onChange, 30_000);
      return () => clearInterval(t);
    }, []),
    () => Math.floor(Date.now() / 30_000) * 30_000,
    () => null,
  );
  const mounted = now != null;
  const locked = p.unlockAt != null && (now ?? 0) < new Date(p.unlockAt).getTime();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [reason, setReason] = React.useState<string | null>(null);
  const [otherText, setOtherText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  async function submit(withReason: string | null) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await requestAnotherContractor({
        token: p.token,
        reason: withReason ?? undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDialogOpen(false);
      setDone(
        res.status === "MANUAL_QUEUE"
          ? "Done — our team will now place your request by hand and be in touch."
          : "Done — we're matching you with another contractor now.",
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[14px] border border-[color:var(--ink-line)] bg-white overflow-hidden">
      {/* head */}
      <div className="p-6 md:p-8 border-b border-[color:var(--ink-line)]">
        <div className="quiet-caps mb-3 flex items-center gap-2">
          <span
            className={
              "inline-block px-2 py-0.5 rounded-full text-[10px] tracking-[0.12em] " +
              (p.status === "MATCHED"
                ? "bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
                : "bg-[color:var(--paper-deep)] text-[color:var(--ink-muted)]")
            }
          >
            {copy.chip}
          </span>
          Your request{p.projectType ? ` · ${p.projectType}` : ""}
        </div>
        <h1 className="font-display text-[28px] md:text-[34px] leading-[1.05] tracking-[-0.02em]">
          {copy.title}
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-[color:var(--ink-muted)] max-w-md">
          {copy.body}
        </p>
        <div className="mt-4 text-[12px] text-[color:var(--ink-faint)]">
          {mounted ? `Submitted ${fmt(p.submittedAt)}` : " "}
        </div>
      </div>

      {/* matched contractor */}
      {p.status === "MATCHED" && p.orgName && (
        <div className="p-6 md:p-8 border-b border-[color:var(--ink-line)] bg-[color:var(--paper-deep)]/40">
          <div className="quiet-caps mb-2">Your contractor</div>
          <div className="text-[18px] font-semibold">{p.orgName}</div>
          <div className="mt-1 text-[13px] text-[color:var(--ink-muted)]">
            {p.orgPhone ? (
              <>
                Call them any time:{" "}
                <a className="underline underline-offset-2" href={`tel:${p.orgPhone}`}>
                  {p.orgPhone}
                </a>
              </>
            ) : (
              "They have your contact details and will reach out."
            )}
            {mounted && p.matchedAt ? ` · Matched ${fmt(p.matchedAt)}` : ""}
          </div>
        </div>
      )}

      {/* re-route */}
      {p.status === "MATCHED" && (
        <div className="p-6 md:p-8">
          {done ? (
            <p className="text-[14px] text-[color:var(--accent)]">{done}</p>
          ) : (
            <>
              <div className="quiet-caps mb-2">Not working out?</div>
              <button
                type="button"
                disabled={locked || busy}
                onClick={() => setDialogOpen(true)}
                className="rounded-[10px] border border-[color:var(--ink)] px-4 py-2.5 text-[13px] font-medium hover:bg-[color:var(--ink)] hover:text-[color:var(--paper)] transition-colors disabled:opacity-45 disabled:pointer-events-none"
              >
                Find me another contractor
              </button>
              <p className="mt-2.5 text-[12px] leading-relaxed text-[color:var(--ink-muted)] max-w-md">
                {!mounted
                  ? " "
                  : locked && p.unlockAt
                  ? `Give the contractor time to reach you first — this option opens ${fmt(p.unlockAt)}.`
                  : p.attemptsLeft > 0
                    ? `We'll release your request and match you with the next pro. ${p.attemptsLeft} automatic re-match${p.attemptsLeft === 1 ? "" : "es"} left; after that our team places it by hand.`
                    : "We'll release your request and our team will place it by hand."}
              </p>
              {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}
            </>
          )}
        </div>
      )}

      {/* reason dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-[14px] bg-white p-6">
            <div className="font-display text-[20px] leading-tight">
              What went wrong?
            </div>
            <p className="mt-1 text-[12px] text-[color:var(--ink-muted)]">
              Optional — it helps us pick a better match.
            </p>
            <div className="mt-4 space-y-2">
              {REASONS.map((r) => (
                <label
                  key={r}
                  className="flex items-center gap-2.5 rounded-[10px] border border-[color:var(--ink-line)] px-3 py-2.5 text-[13px] cursor-pointer has-[:checked]:border-[color:var(--ink)]"
                >
                  <input
                    type="radio"
                    name="reason"
                    checked={reason === r}
                    onChange={() => setReason(r)}
                  />
                  {r}
                </label>
              ))}
              <label className="flex items-start gap-2.5 rounded-[10px] border border-[color:var(--ink-line)] px-3 py-2.5 text-[13px] cursor-pointer has-[:checked]:border-[color:var(--ink)]">
                <input
                  type="radio"
                  name="reason"
                  className="mt-0.5"
                  checked={reason === "__other"}
                  onChange={() => setReason("__other")}
                />
                <span className="flex-1">
                  Something else
                  {reason === "__other" && (
                    <textarea
                      autoFocus
                      value={otherText}
                      onChange={(e) => setOtherText(e.target.value)}
                      maxLength={500}
                      rows={2}
                      placeholder="A sentence is plenty"
                      className="mt-2 w-full rounded-[8px] border border-[color:var(--ink-line)] p-2 text-[13px] outline-none focus:border-[color:var(--ink)]"
                    />
                  )}
                </span>
              </label>
            </div>
            {error && <p className="mt-3 text-[12px] text-rose-600">{error}</p>}
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className="px-3 py-2 text-[13px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                className="px-3 py-2 text-[13px] underline underline-offset-2 disabled:opacity-50"
                onClick={() => void submit(null)}
              >
                Skip — just find me another
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void submit(reason === "__other" ? otherText.trim() || null : reason)
                }
                className="rounded-[10px] bg-[color:var(--ink)] px-4 py-2 text-[13px] font-medium text-[color:var(--paper)] disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send & re-match"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
