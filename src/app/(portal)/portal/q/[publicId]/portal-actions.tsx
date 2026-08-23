"use client";

// PUBLIC PROPOSAL PORTAL — the action block.
// Route: /portal/q/[publicId].
//
// The donor's `div.pv-actions` from `jobflex-proposal-client-blueprint (3).html`,
// markup-for-markup: `#pvBtns` / `#pvDecline` / `#pvAccepted` / `#pvDeclined`,
// the donor's literal ids kept, the donor's `hidden` attribute kept as the
// show/hide mechanism (`.jf-proposal-portal [hidden] { display: none !important }`
// is what makes it beat `.pv-btnrow { display: flex }`). The donor's script
// toggled those four nodes imperatively; here React owns the same four flags.
//
// WHAT IS NOT THE DONOR'S, and why:
//
//   · THE THREE CHECKOUT BUTTONS. The mockup's action row is Accept + Decline
//     and nothing else, but this surface already initiates Stripe / Square /
//     PayPal checkout against /api/checkout/[provider] and that capability is
//     not the port's to delete. They ship in the donor's own `.pv-btnrow`
//     (which is `flex-wrap: wrap`, so the row absorbs them) wearing the
//     donor's own `.pv-btn--ghost`. No new CSS, no new vocabulary — but the
//     row is five buttons wide where the mockup drew two. Flagged in the port
//     report; delete them here if the owner wants the mockup's two.
//
//   · TOASTS on network failure. The donor has no error affordance at all
//     beyond `#pvErr` (which is the empty-note guard, and IS the donor's).
//     A homeowner whose accept POST 500s must be told something. Toasts render
//     outside the page box via the root layout's ToastHost, so nothing on the
//     happy path looks different from the mockup.
//
//   · `disabled` while a request is in flight, to stop double-submits. The
//     donor declares no `:disabled` style and author rules beat the UA's
//     `:disabled { color: graytext }`, so this is visually inert.
//
//   · The PAID state reuses `#pvAccepted` with "Paid in full" in place of
//     "Accepted". The mockup has one settled-positive string; the app has two
//     settled-positive statuses and losing the distinction would tell a paid
//     client less than the page knows.
//
// NO DATA-LAYER CHANGE. Same three endpoints, same payloads, same
// router.refresh() as the component this replaces.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toast";

type Settled = "accepted" | "paid" | "declined" | null;

function settledFrom(status: string): Settled {
  if (status === "PAID") return "paid";
  if (status === "ACCEPTED") return "accepted";
  if (status === "DECLINED") return "declined";
  return null;
}

export type PayProvider = "stripe" | "square" | "paypal";

const PROVIDER_LABEL: Record<PayProvider, string> = {
  stripe: "Pay with card",
  square: "Pay with Square",
  paypal: "Pay with PayPal",
};

export function PortalActions({
  publicId,
  status,
  total,
  providers,
}: {
  providers: readonly PayProvider[];
  publicId: string;
  status: string;
  total: number;
}) {
  const router = useRouter();
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

  const settled = local ?? settledFrom(status);

  async function accept() {
    // OPTIMISTIC, and this is the whole point. The comment above has always
    // claimed the settled state swaps "before any round trip"; it did not —
    // the swap waited on the POST, and that POST blocks on sending two emails
    // through the mail provider. The client sat on an unchanged page for
    // several seconds after clicking Accept, with no signal that anything had
    // happened, and a reload in that window showed the proposal still open.
    // Flip first, celebrate, and put it back only if the server refuses.
    const previous = local;
    setBusy("accept");
    setLocal("accepted");
    setCheer(true);
    try {
      const res = await fetch(`/api/public-quote/${publicId}/accept`, { method: "POST" });
      if (!res.ok) throw new Error("Couldn't record acceptance");
      router.refresh();
    } catch (err) {
      setLocal(previous);
      setCheer(false);
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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Couldn't record your response");
      }
      setLocal("declined");
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
        // eslint-disable-next-line react-hooks/immutability -- external checkout redirect, not component state
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

  const positive = settled === "accepted" || settled === "paid";

  return (
    <div className="pv-actions" id="pvActions">
      <div className="pv-btnrow" id="pvBtns" hidden={settled !== null}>
        <button
          className="pv-btn pv-btn--primary"
          type="button"
          id="pvAccept"
          disabled={busy !== null}
          onClick={accept}
        >
          Accept proposal
        </button>
        <button
          className="pv-btn pv-btn--danger"
          type="button"
          id="pvDeclineT"
          aria-expanded={declineOpen}
          onClick={() => setDeclineOpen((v) => !v)}
        >
          Decline
        </button>
      </div>

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
          <button
            className="pv-btn pv-btn--danger"
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
      {/* HOW TO PAY — only after the deal is agreed.
          These used to sit in the same row as Accept, which asked the client to
          pay for something they had not yet said yes to and gave a card payment
          the same weight as declining. Accepting is the decision; paying is the
          next step, and it appears once that decision is made. Gone again once
          the proposal is PAID — there is nothing left to pay. */}
      {settled === "accepted" && providers.length > 0 ? (
        <div className="pv-paynow" id="pvPay">
          <div className="pv-paynow-l">Ready when you are — pay your deposit</div>
          <div className="pv-btnrow">
            {providers.map((prov) => (
              <button
                key={prov}
                className="pv-btn pv-btn--ghost pv-btn--pay"
                type="button"
                disabled={busy !== null}
                onClick={() => checkout(prov)}
              >
                {PROVIDER_LABEL[prov]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        className="pv-state pv-state--declined"
        id="pvDeclined"
        hidden={settled !== "declined"}
      >
        You declined this proposal.
      </div>
    </div>
  );
}
