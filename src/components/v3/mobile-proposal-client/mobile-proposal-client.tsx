"use client";

// CLIENT PROPOSAL · HANDHELD — the whole page.
//
// Serves TWO URLs, one implementation:
//   · /portal/q/<publicId>                  at ≤768px, through the media-query
//     switch in that route's own portal-viewport.tsx (the desktop tree is
//     served above 768px and is untouched);
//   · /mobile-proposal-client-v2/<publicId> as the direct-review entry point.
//
// It is a CLIENT component that receives an already-read, already-formatted
// PortalView from a SERVER component. The Prisma read, the VIEWED side-effect
// and generateMetadata all stay on the server exactly where they were — this
// page is opened from an email link and losing SSR on it would be a real
// regression, not a stylistic one. Nothing here fetches the proposal.
//
// ── WHAT IS CARRIED OVER VERBATIM FROM ./(portal) portal-actions.tsx ───────
//   · POST /api/public-quote/{publicId}/accept — no body.
//   · POST /api/public-quote/{publicId}/decline — JSON { note }, note trimmed,
//     and the empty-note guard that reveals the error line and stops before
//     any network call. maxLength 2000.
//   · POST /api/checkout/{stripe|square|paypal} — JSON { publicId, amount },
//     amount in cents; `data.url` redirects, `data.disabled` info-toasts.
//   · The PDF link → /api/public-quote/{publicId}/pdf, target=_blank with
//     rel="noopener noreferrer".
//   · `disabled` on every control while a request is in flight, so a slow
//     network cannot produce two acceptances.
//   · Toasts on network failure. They render outside the page box via the root
//     layout's ToastHost.
//   · Optimistic local settle + router.refresh(), and the ACCEPTED / PAID /
//     DECLINED settled states, PAID keeping its own string.
//   · The `hidden` attribute as the show/hide mechanism, backed by this page's
//     own `[hidden] { display: none !important }`.
//   · The .rv / .on IntersectionObserver reveal. framer-motion was deliberately
//     removed from this route; it is not reintroduced here.
//
// ── KNOWN COLLISION, NOT FIXED HERE ────────────────────────────────────────
// The root layout's <ToastHost /> is `fixed bottom-6 right-6 z-[100]`, a
// sibling of the wrapper this page renders inside, so it draws over the sticky
// action bar at handheld widths no matter what z-index the bar takes. Toasts
// are transient and only appear on failure, so the bar keeps a lower z-index
// deliberately — an error message covered by a button would be worse than a
// button covered for four seconds. Fixing it means moving ToastHost, which is
// a shared file owned by no one in this batch; reported rather than edited.
//
// ── DOM IDS ────────────────────────────────────────────────────────────────
// The desktop tree uses the mockup's literal ids (#pvBtns, #pvNote, #pvErr).
// This tree uses `mpc-`-prefixed ids for the same roles. The two never mount
// together — the switch renders exactly one — but ids are document-global and
// a namespaced pair costs nothing, while a duplicated one would silently break
// every `aria-describedby`/`htmlFor` on whichever tree lost the race.

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toast";
import { lockScroll } from "@/lib/scrollLock";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import type { PortalView } from "./portal-view";
import { startCheckout, usePayReturn } from "./use-pay-return";
import "./mobile-proposal-client.css";

/** `"open"` is the one local value the SERVER never sends: a revert has put the
 *  proposal back, and the page must show it open before the refresh lands. */
type Settled = "accepted" | "paid" | "declined" | "open" | null;
type Provider = "stripe" | "square";

/** The way back, held in memory only — a reload forgets it, which is the whole
 *  point: "revert" exists for the tap that was a slip, not for next week. */
type Revert = { token: string; kind: "accept" | "decline" };

function PayReturnBanner({ publicId }: { publicId: string }) {
  const state = usePayReturn(publicId);
  if (state.kind === "idle" || state.kind === "canceled") return null;
  return (
    <div className={`mpc-payret mpc-payret--${state.kind}`} role="status" aria-live="polite">
      {state.kind === "processing"
        ? "Confirming your payment…"
        : state.kind === "paid"
          ? state.proposalPaid
            ? "Paid in full — thank you."
            : "Payment received — thank you."
          : "Taking a moment to confirm — you'll get an email receipt when it lands."}
    </div>
  );
}

function settledFrom(status: string): Settled {
  if (status === "PAID") return "paid";
  if (status === "ACCEPTED") return "accepted";
  if (status === "DECLINED") return "declined";
  return null;
}

/* ── Icons. Inline <svg>, no ids, so there is no <symbol> sheet to collide
      with the desktop tree's. 2px stroke on the 24 grid, currentColor. ── */
const IcDownload = () => (
  <svg className="mpc-ic" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3v12" />
    <path d="M7 11l5 5 5-5" />
    <path d="M4 20h16" />
  </svg>
);
const IcCheck = () => (
  <svg className="mpc-ic" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 12.5l5 5L20 6.5" />
  </svg>
);
const IcMinus = () => (
  <svg className="mpc-ic" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12h14" />
  </svg>
);
const IcNext = () => (
  <svg className="mpc-ic" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 5l7 7-7 7" />
  </svg>
);
const IcPhone = () => (
  <svg className="mpc-ic" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 6.5 6.5L17 13l4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 3 5.2 2 2 0 0 1 5 3Z" />
  </svg>
);

export function MobileProposalClient({ view }: { view: PortalView }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  // The accept flourish — set on the click that settles the deal, never on a
  // reload of an already-accepted page.
  const [cheer, setCheer] = useState(false);
  // Only providers with a healthy connection on this contractor's account —
  // the same gate the pay routes enforce (src/lib/payments/payOptions.ts).
  const pay = view.pay;
  const payOptions: Array<{ id: Provider; name: string }> = [
    ...(pay.providers.stripe.ok
      ? [{ id: "stripe" as const, name: pay.providers.stripe.ach ? "Card or bank account" : "Card" }]
      : []),
    ...(pay.providers.square.ok ? [{ id: "square" as const, name: "Square" }] : []),
  ];
  const nextStage = pay.stages.find((s) => s.id === pay.nextPayableId) ?? null;
  // Which target the sheet is paying: the next stage, or everything left.
  const [payTarget, setPayTarget] = useState<"next" | "remaining">("next");
  const targetAmount = payTarget === "remaining" || !nextStage ? pay.remaining : nextStage.amount;
  const [note, setNote] = useState("");
  const [noteErr, setNoteErr] = useState(false);
  const [local, setLocal] = useState<Settled>(null);
  const [revert, setRevert] = useState<Revert | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const introRef = useRef<HTMLElement | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  const settled = local === "open" ? null : (local ?? settledFrom(view.status));
  const positive = settled === "accepted" || settled === "paid";
  const sheetOpen = payOpen || declineOpen;

  const closeSheets = useCallback(() => {
    setPayOpen(false);
    setDeclineOpen(false);
  }, []);

  const payDrag = useSheetDrag(payOpen, () => setPayOpen(false));
  const declineDrag = useSheetDrag(declineOpen, () => setDeclineOpen(false));

  /* ── Reveal. Same contract as the desktop port: the first two blocks are
        primed on a timer, the rest wait for the observer and unobserve
        themselves. Reduced motion (or no IntersectionObserver) reveals
        everything at once. Scoped to this tree's root so a client-side
        navigation cannot reach another surface's .rv. ── */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(".rv"));
    if (!items.length) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("on"));
      return () => items.forEach((el) => el.classList.remove("on"));
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("on");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.12 },
    );

    const timers: number[] = [];
    items.forEach((el, i) => {
      if (i < 2) {
        timers.push(window.setTimeout(() => el.classList.add("on"), 90 + i * 110));
      } else {
        io.observe(el);
      }
    });

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      io.disconnect();
      items.forEach((el) => el.classList.remove("on"));
    };
  }, []);

  /* ── Sheet plumbing: one reference-counted scroll lock (never a hand-rolled
        body.style.overflow, which poisons every other lock on the page) and
        Escape to close. ── */
  useEffect(() => {
    if (!sheetOpen) return;
    const release = lockScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSheets();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      release();
      window.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen, closeSheets]);

  /* The decline sheet is a form: put the caret where the work is. */
  useEffect(() => {
    if (!declineOpen) return;
    const t = window.setTimeout(() => noteRef.current?.focus(), 320);
    return () => window.clearTimeout(t);
  }, [declineOpen]);

  /* ── The settle moment. The action bar is the last thing the reader touched
        and it disappears on settle, so if they were scrolled to the bottom the
        confirmation would land off-screen behind them. Bring the intro card —
        which now carries the settled plate — back into view. ── */
  useEffect(() => {
    if (!local) return;
    const el = introRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [local]);

  async function accept() {
    // Flip FIRST. The accept endpoint blocks on sending two emails, so waiting
    // for it left a thumb on an unchanged screen for seconds — and a reload in
    // that window showed the proposal still open. Roll back only if the server
    // actually refuses.
    const previous = local;
    setBusy("accept");
    closeSheets();
    setLocal("accepted");
    setCheer(true);
    try {
      const res = await fetch(`/api/public-quote/${view.publicId}/accept`, { method: "POST" });
      if (!res.ok) throw new Error("Couldn't record acceptance");
      const data = (await res.json().catch(() => ({}))) as { revertToken?: string };
      if (data.revertToken) setRevert({ token: data.revertToken, kind: "accept" });
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
    // The desktop guard, unchanged: an empty note reveals the error line and
    // stops before any network call.
    if (!trimmed) {
      setNoteErr(true);
      noteRef.current?.focus();
      return;
    }
    setNoteErr(false);
    try {
      setBusy("decline");
      const res = await fetch(`/api/public-quote/${view.publicId}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; revertToken?: string };
      if (!res.ok) throw new Error(data?.error ?? "Couldn't record your response");
      closeSheets();
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
      const res = await fetch(`/api/public-quote/${view.publicId}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: revert.token }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data?.error ?? "Couldn't revert");
      setRevert(null);
      setCheer(false);
      setLocal("open");
      setNote("");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't revert", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  // Under whichever settled plate this page's own tap produced, and only
  // while the token from that tap is in memory.
  const revertRow =
    revert && settled !== "paid" && settled !== null ? (
      <div className="mpc-revert">
        <button
          className="mpc-btn mpc-btn--frame mpc-revert-b"
          type="button"
          disabled={busy !== null}
          onClick={undo}
        >
          <span className="mpc-revert-ic" aria-hidden="true">↺</span>
          {busy === "revert" ? "Reverting…" : revert.kind === "accept" ? "Revert acceptance" : "Revert decline"}
        </button>
        <span className="mpc-revert-n">Only while this page stays open</span>
      </div>
    ) : null;

  async function checkout(provider: Provider) {
    setBusy(provider);
    const target =
      payTarget === "remaining" || !nextStage ? ("remaining" as const) : { installmentId: nextStage.id };
    const res = await startCheckout(provider, view.publicId, target);
    if (!res.ok) {
      toast.error("Couldn't start checkout", res.error);
      setBusy(null);
    }
  }

  return (
    <div className="jf-mobile-proposal-client" ref={rootRef}>
      <div className="mpc-doc">
        <header className="mpc-head rv">
          <span className="mpc-mark" aria-hidden="true">
            {view.monogram}
          </span>
          <span className="mpc-org">
            <b className="mpc-org-n">{view.orgName}</b>
            <span className="mpc-org-r">{`№ ${view.refCode} · ${view.createdOn}`}</span>
          </span>
          <a
            className="mpc-pdf"
            href={view.pdfHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Download this proposal as a PDF"
          >
            <IcDownload />
            <i aria-hidden="true">PDF</i>
          </a>
        </header>

        <section className="mpc-intro rv" ref={introRef}>
          <div className="mpc-card">
            <div className="mpc-kicker">{`Prepared for ${view.clientName}`}</div>
            <h1 className="mpc-h1">{view.title}</h1>
            <div className="mpc-facts">
              <div className="mpc-fact mpc-fact--total">
                <span>Total</span>
                <b>{view.totalLabel}</b>
              </div>
              <div className="mpc-fact">
                <span>Valid until</span>
                <b>{view.validUntil}</b>
              </div>
            </div>

            <div
              className="mpc-state"
              role="status"
              hidden={!positive}
              data-cheer={cheer ? "1" : undefined}
            >
              {cheer && (
                <span className="mpc-cheer" aria-hidden="true">
                  {Array.from({ length: 8 }, (_, i) => (
                    <i key={i} style={{ "--i": i } as React.CSSProperties} />
                  ))}
                </span>
              )}
              <IcCheck />
              <span>
                {settled === "paid"
                  ? "Paid in full — thank you. The team has been notified."
                  : "Accepted — thank you. The team has been notified."}
              </span>
            </div>

            {/* HOW TO PAY — only once accepted. It used to live in the action
                bar next to Decline, asking for money before the client had
                agreed to anything; and because that bar is hidden the moment
                the proposal settles, paying became unreachable at exactly the
                point it starts to make sense. */}
            {revert?.kind === "accept" ? revertRow : null}
            <Suspense fallback={null}>
              <PayReturnBanner publicId={view.publicId} />
            </Suspense>
            {settled === "accepted" && payOptions.length > 0 && nextStage ? (
              <button
                className="mpc-btn mpc-btn--frame mpc-paynow"
                type="button"
                disabled={busy !== null}
                aria-haspopup="dialog"
                aria-expanded={payOpen}
                onClick={() => {
                  setPayTarget("next");
                  setPayOpen(true);
                }}
              >
                {`Pay ${nextStage.label.toLowerCase()} · ${nextStage.amount}`}
              </button>
            ) : null}
            <div
              className="mpc-state mpc-state--declined"
              role="status"
              hidden={settled !== "declined"}
            >
              <IcMinus />
              <span>You declined this proposal.</span>
            </div>
            {revert?.kind === "decline" ? revertRow : null}
          </div>
        </section>

        {/* OVERVIEW — not a mockup section. `proposal.description` is
            contractor-authored copy the mockup's intro card has no slot for;
            rather than drop customer content it reuses this page's own section
            + prose pair, exactly as the desktop port does. */}
        {view.description ? (
          <section className="mpc-sec rv">
            <h2 className="mpc-sec-h">Overview</h2>
            <p className="mpc-prose">{view.description}</p>
          </section>
        ) : null}

        <section className="mpc-sec rv">
          <h2 className="mpc-sec-h">Estimate detail</h2>
          <div className="mpc-ledger">
            {/* The line items get their own wrapper so `:last-child` provably
                lands on the last ITEM — see the note in the stylesheet. */}
            <div className="mpc-lis">
              {view.lineItems.length ? (
                view.lineItems.map((item) => (
                  <div className="mpc-li" key={item.id}>
                    <div className="mpc-li-t">
                      <div className="mpc-li-n">{item.name}</div>
                      {item.description ? <div className="mpc-li-d">{item.description}</div> : null}
                      {item.meta ? <div className="mpc-li-m">{item.meta}</div> : null}
                    </div>
                    <div className="mpc-li-v">{item.amount}</div>
                  </div>
                ))
              ) : (
                <div className="mpc-li-none">No itemised lines on this proposal</div>
              )}
            </div>
            <div className="mpc-tot">
              <div className="mpc-tot-r">
                <span>Subtotal</span>
                <b>{view.subtotalLabel}</b>
              </div>
              <div className="mpc-tot-r">
                <span>{view.taxLabel}</span>
                <b>{view.taxAmount}</b>
              </div>
              <div className="mpc-tot-due">
                <span>Total due</span>
                <b>{view.totalLabel}</b>
              </div>
            </div>
          </div>
        </section>

        {view.scope ? (
          <section className="mpc-sec rv">
            <h2 className="mpc-sec-h">Scope of work</h2>
            <p className="mpc-prose">{view.scope}</p>
          </section>
        ) : null}

        <section className="mpc-sec rv">
          <h2 className="mpc-sec-h">Payment schedule</h2>
          <div className="mpc-pay">
            {pay.stages.map((s) => {
              const active = settled === "accepted" && s.payable && pay.anyWay;
              const word =
                s.status === "PAID"
                  ? s.paidOn
                    ? `Paid · ${s.paidOn}`
                    : "Paid"
                  : s.status === "PENDING"
                    ? "Processing"
                    : s.status === "WAIVED"
                      ? "Closed"
                      : s.payable
                        ? "Due now"
                        : "Due";
              return (
                <div
                  className={`mpc-pay-r${s.status === "PAID" ? " is-paid" : ""}${active ? " is-next" : ""}`}
                  key={s.id}
                >
                  <span className="mpc-pay-no">{s.no}</span>
                  <span className="mpc-pay-n">{s.label}</span>
                  <span className="mpc-pay-v">{s.amount}</span>
                  <span className={`mpc-pay-s mpc-pay-st--${s.status.toLowerCase()}`}>
                    {s.share ? `${s.share} of total · ${word}` : word}
                  </span>
                  {active ? (
                    <div className="mpc-pay-act">
                      {payOptions.length ? (
                        <button
                          className="mpc-btn mpc-btn--primary"
                          type="button"
                          disabled={busy !== null || (s.belowMin.stripe && s.belowMin.square)}
                          onClick={() => {
                            setPayTarget("next");
                            setPayOpen(true);
                          }}
                        >
                          {`Pay ${s.amount}`}
                        </button>
                      ) : null}
                      {pay.bankTransfer.ok ? (
                        <details className="mpc-pay-bank">
                          <summary>{payOptions.length ? "Or pay by bank transfer" : "Pay by bank transfer"}</summary>
                          <pre className="mpc-pay-bank-body">{pay.bankTransfer.instructions}</pre>
                          <div className="mpc-pay-bank-note">
                            {`Reference "${s.label}" — the team will mark it paid once it arrives.`}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {pay.paidMinor > 0 && pay.remainingMinor > 0 ? (
            <div className="mpc-pay-sum">
              <span>{`Paid to date ${pay.paid}`}</span>
              <b>{`Remaining ${pay.remaining}`}</b>
            </div>
          ) : null}
          {pay.remainingMinor <= 0 && pay.paidMinor > 0 ? (
            <div className="mpc-pay-sum mpc-pay-sum--done">Paid in full</div>
          ) : null}
        </section>

        {/* Terms as a disclosure — closed by default. Long legal copy between a
            thumb and the Accept button is copy nobody reads, but it has to be
            one tap away. A real <details>, so it prints open. */}
        {view.terms ? (
          <section className="mpc-sec rv">
            <details className="mpc-terms">
              <summary>Terms &amp; conditions</summary>
              <div className="mpc-terms-b">{view.terms}</div>
            </details>
          </section>
        ) : null}

        {view.telHref ? (
          <section className="mpc-call rv">
            <div className="mpc-call-t">Questions in the meantime? Just call.</div>
            <a className="mpc-call-a" href={view.telHref}>
              <IcPhone />
              <span>{view.phone}</span>
            </a>
          </section>
        ) : null}

        <footer className="mpc-foot rv">
          <i aria-hidden="true">JF</i>
          <span>{`Prepared by ${view.orgName} on JobFlex`}</span>
        </footer>
      </div>

      {/* ── THE ACTION BAR. Sticky, last in flow, so it is pinned for the whole
             scroll and settles below the footer at the end of the document
             rather than covering it. Gone entirely once settled. ── */}
      {/* ONE ROW (owner, 2026-09-02): Accept takes the measure, Decline sits
          beside it at a third — the two answers on one line, both full height,
          rather than a slab over a short plate hanging off the left edge. */}
      <div className="mpc-bar" hidden={settled !== null}>
        <div className="mpc-bar-in">
          <button
            className="mpc-btn mpc-btn--primary"
            type="button"
            disabled={busy !== null}
            onClick={accept}
          >
            Accept proposal
          </button>
          <button
            className="mpc-btn mpc-btn--danger"
            type="button"
            disabled={busy !== null}
            aria-haspopup="dialog"
            aria-expanded={declineOpen}
            onClick={() => {
              setPayOpen(false);
              setDeclineOpen(true);
            }}
          >
            Decline
          </button>
        </div>
      </div>

      {/* One scrim for both sheets — only one is ever open. */}
      <div
        className={`mpc-scrim${sheetOpen ? " on" : ""}`}
        aria-hidden="true"
        onClick={closeSheets}
      />

      {/* ── PAYMENT SHEET. Every provider the desktop row carried is still one
             tap away; none of them costs permanent screen. ── */}
      <div
        className={`mpc-sheet${payOpen ? " on" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mpc-pay-t"
        {...payDrag.sheetProps}
      >
        <div className="mpc-grab" {...payDrag.handleProps} />
        <div className="mpc-sheet-h" {...payDrag.handleProps}>
          <div className="mpc-sheet-k">Secure checkout</div>
          <div className="mpc-sheet-t" id="mpc-pay-t">{`Pay ${targetAmount}`}</div>
        </div>
        <div className="mpc-sheet-b">
          {pay.showRemaining && nextStage ? (
            <div className="mpc-seg" role="group" aria-label="What to pay">
              <button
                type="button"
                className={`mpc-seg-b${payTarget === "next" ? " on" : ""}`}
                aria-pressed={payTarget === "next"}
                onClick={() => setPayTarget("next")}
              >
                {`${nextStage.label} · ${nextStage.amount}`}
              </button>
              <button
                type="button"
                className={`mpc-seg-b${payTarget === "remaining" ? " on" : ""}`}
                aria-pressed={payTarget === "remaining"}
                onClick={() => setPayTarget("remaining")}
              >
                {`Everything · ${pay.remaining}`}
              </button>
            </div>
          ) : null}
          {payOptions.map((p, i) => (
            <button
              className="mpc-opt"
              type="button"
              key={p.id}
              disabled={busy !== null}
              onClick={() => checkout(p.id)}
            >
              <span className="mpc-opt-b" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="mpc-opt-n">{p.name}</span>
              <IcNext />
            </button>
          ))}
          <p className="mpc-sheet-note">
            You will be handed to the provider to finish the payment, then
            returned to this page.
          </p>
        </div>
        <button className="mpc-cancel" type="button" onClick={closeSheets}>
          Cancel
        </button>
      </div>

      {/* ── DECLINE SHEET. The note and its required-note guard, unchanged. ── */}
      <div
        className={`mpc-sheet${declineOpen ? " on" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mpc-dec-t"
        {...declineDrag.sheetProps}
      >
        <div className="mpc-grab" {...declineDrag.handleProps} />
        <div className="mpc-sheet-h" {...declineDrag.handleProps}>
          <div className="mpc-sheet-k">Response</div>
          <div className="mpc-sheet-t" id="mpc-dec-t">
            Decline proposal
          </div>
        </div>
        <div className="mpc-sheet-b">
          <div className="mpc-form">
            <label className="mpc-label" htmlFor="mpc-note">
              Tell the team why — required
            </label>
            <textarea
              className="mpc-ta"
              id="mpc-note"
              ref={noteRef}
              placeholder="A sentence is plenty"
              maxLength={2000}
              value={note}
              aria-invalid={noteErr || undefined}
              aria-describedby={noteErr ? "mpc-err" : undefined}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="mpc-err" id="mpc-err" role="alert" hidden={!noteErr}>
              A note is required so the team knows why.
            </div>
            <button
              className="mpc-confirm"
              type="button"
              disabled={busy !== null}
              onClick={decline}
            >
              Confirm decline
            </button>
          </div>
        </div>
        <button className="mpc-cancel" type="button" onClick={closeSheets}>
          Cancel
        </button>
      </div>
    </div>
  );
}
