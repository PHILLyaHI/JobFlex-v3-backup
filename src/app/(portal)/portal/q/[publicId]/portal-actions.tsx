"use client";

// Proposal acceptance and decline; payment availability refreshes after acceptance.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toast";
import { markAcceptedLocally } from "./portal-accepted";
import { ProposalDecision } from "@/components/v3/mobile-proposal-client/proposal-decision";
import type { PortalPayModel } from "@/lib/payments/portalModel";

/** `"open"` is the one local value the SERVER never sends: a revert has put the
 *  proposal back, and the page must show it open before the refresh lands. */
type Settled = "accepted" | "paid" | "declined" | "open" | null;

/** The way back, held in memory only — a reload forgets it, which is the whole
 *  point: "revert" exists for the tap that was a slip, not for next week. */
type Revert = { token: string; kind: "accept" | "decline" };

function settledFrom(status: string): Settled {
  if (status === "PAID") return "paid";
  // COMPLETED is an accepted job whose work is done — still settled, still
  // payable below; never Accept/Decline again.
  if (status === "ACCEPTED" || status === "COMPLETED") return "accepted";
  if (status === "DECLINED") return "declined";
  return null;
}

// Paying moved to ./portal-payment.tsx — per stage, on the contractor's own
// Stripe / Square. This block is Accept / Decline and the settled states.
export function PortalActions({ publicId, status, model }: { publicId: string; status: string; model: PortalPayModel }) {
  const router = useRouter();
  const [freshPay, setFreshPay] = useState<PortalPayModel | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteErr, setNoteErr] = useState(false);
  // Optimistic: the donor swaps to the settled state on click, before any
  // round trip. router.refresh() then re-renders the server tree behind it.
  const [local, setLocal] = useState<Settled>(null);
  // Runs the accept flourish exactly once, on the click that settles the deal —
  // never on a reload of an already-accepted page, where a burst of confetti
  // over a week-old decision would be nonsense.
  const [cheer, setCheer] = useState(false);
  const [revert, setRevert] = useState<Revert | null>(null);

  const settled = status === "PAID" ? "paid" : local === "open" ? null : (local ?? settledFrom(status));

  async function accept(name: string) {
    if (busy) return;
    setBusy("accept");
    try {
      const res = await fetch(`/api/public-quote/${publicId}/accept`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; revertToken?: string; pay?: PortalPayModel };
      if (!res.ok) throw new Error(data.error ?? "Couldn't record acceptance");
      if (data.pay) setFreshPay(data.pay);
      setLocal("accepted");
      setCheer(true);
      if (data.revertToken) setRevert({ token: data.revertToken, kind: "accept" });
      markAcceptedLocally(publicId, true);
      router.refresh();
    } catch (err) {
      toast.error("Acceptance failed", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function decline() {
    const trimmed = note.trim();
    // The donor's own guard: an empty note reveals #pvErr and stops.
    if (!trimmed) {
      setNoteErr(true);
      return;
    }
    setNoteErr(false);
    try {
      setBusy("decline");
      const res = await fetch(`/api/public-quote/${publicId}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; revertToken?: string };
      if (!res.ok) throw new Error(data?.error ?? "Couldn't record your response");
      setLocal("declined");
      if (data.revertToken) setRevert({ token: data.revertToken, kind: "decline" });
      router.refresh();
    } catch (err) {
      toast.error("Couldn't decline", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  /** Take the accept or decline back. One shot: the token is dropped on
   *  success, and the server refuses it anyway once money has moved. */
  async function undo() {
    if (!revert) return;
    setBusy("revert");
    try {
      const res = await fetch(`/api/public-quote/${publicId}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: revert.token }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data?.error ?? "Couldn't revert");
      setRevert(null);
      setCheer(false);
      setLocal("open");
      setDeclineOpen(false);
      setNote("");
      markAcceptedLocally(publicId, false);
      router.refresh();
    } catch (err) {
      toast.error("Couldn't revert", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  const positive = settled === "accepted" || settled === "paid";

  // Shown under whichever settled plate this page's own click produced, and
  // only while the token from that click is in memory.
  const revertRow =
    revert && settled !== "paid" && settled !== null ? (
      <div className="pv-revert" id="pvRevert">
        {/* ONE ROW, TWO REGISTERS: the plate says what it does, the mono
            note beside it says for how long. The first cut put a bold
            13px question on the left of a caps plate — two voices at two
            sizes on one line, and the eye could not tell which was the
            control. The question is gone; the plate IS the question. */}
        <button
          className="pv-btn pv-btn--ghost pv-revert-b"
          type="button"
          disabled={busy !== null}
          onClick={undo}
        >
          <span className="pv-revert-ic" aria-hidden="true">↺</span>
          {busy === "revert" ? "Reverting…" : revert.kind === "accept" ? "Revert acceptance" : "Revert decline"}
        </button>
        <span className="pv-revert-n">Only while this page stays open</span>
      </div>
    ) : null;

  return (
    <div className="pv-actions" id="pvActions">
      <ProposalDecision settled={settled} busy={busy !== null} model={["ACCEPTED", "COMPLETED", "PAID"].includes(status) ? model : freshPay ?? model} onAccept={accept} onDecline={() => {
        setDeclineOpen(true);
        requestAnimationFrame(() => { document.getElementById("pvDecline")?.scrollIntoView({ block: "center" }); document.getElementById("pvNote")?.focus(); });
      }} />

      <div className="pv-decline" id="pvDecline" hidden={!declineOpen || settled !== null}>
        <label className="pv-decline-l" htmlFor="pvNote">
          Tell the team why — required
        </label>
        <textarea
          id="pvNote"
          placeholder="A sentence is plenty"
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="pv-decline-err" id="pvErr" hidden={!noteErr}>
          A note is required so the team knows why.
        </div>
        <div className="pv-decline-row">
          {/* Grey, not red (owner, 2026-09-02): the red plate above already
              said "this is the destructive answer"; the confirm inside the
              note panel is the quiet second step, and two red plates one
              above the other read as an alarm. */}
          <button
            className="pv-btn pv-btn--grey"
            type="button"
            id="pvDeclineGo"
            disabled={busy !== null}
            onClick={decline}
          >
            Confirm decline
          </button>
        </div>
      </div>

      <div
        className="pv-state"
        id="pvAccepted"
        hidden={!positive}
        data-cheer={cheer ? "1" : undefined}
      >
        {cheer && (
          <span className="pv-cheer" aria-hidden="true">
            {/* Eight sparks thrown from behind the plate. Pure CSS, no library,
                and `prefers-reduced-motion` stops them dead (see the stylesheet). */}
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} style={{ "--i": i } as React.CSSProperties} />
            ))}
          </span>
        )}
        {/* The donor writes `&#10003;&nbsp;` — a NO-BREAK space after the check,
            not a plain one. ` ` keeps it one. */}
        {settled === "paid"
          ? "✓ Paid in full — thank you. The team has been notified."
          : "✓ Accepted — thank you. The team has been notified."}
      </div>
      {/* HOW TO PAY — after acceptance the payment schedule below carries the
          buttons, one stage at a time; this is a pointer to it. */}
      {revert?.kind === "accept" ? revertRow : null}


      <div
        className="pv-state pv-state--declined"
        id="pvDeclined"
        hidden={settled !== "declined"}
      >
        You declined this proposal.
      </div>
      {revert?.kind === "decline" ? revertRow : null}
    </div>
  );
}
