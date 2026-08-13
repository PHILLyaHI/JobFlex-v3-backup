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

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toast";
import { lockScroll } from "@/lib/scrollLock";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import type { PortalView } from "./portal-view";
import "./mobile-proposal-client.css";

type Settled = "accepted" | "paid" | "declined" | null;
type Provider = "stripe" | "square" | "paypal";

const PROVIDERS: Array<{ id: Provider; name: string }> = [
  { id: "stripe", name: "Stripe" },
  { id: "square", name: "Square" },
  { id: "paypal", name: "PayPal" },
];

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
  const [note, setNote] = useState("");
  const [noteErr, setNoteErr] = useState(false);
  const [local, setLocal] = useState<Settled>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const introRef = useRef<HTMLElement | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  const settled = local ?? settledFrom(view.status);
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
    try {
      setBusy("accept");
      const res = await fetch(`/api/public-quote/${view.publicId}/accept`, { method: "POST" });
      if (!res.ok) throw new Error("Couldn't record acceptance");
      closeSheets();
      setLocal("accepted");
      router.refresh();
    } catch (err) {
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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Couldn't record your response");
      }
      closeSheets();
      setLocal("declined");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't decline", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function checkout(provider: Provider) {
    try {
      setBusy(provider);
      const res = await fetch(`/api/checkout/${provider}`, {
        method: "POST",
        body: JSON.stringify({ publicId: view.publicId, amount: Math.round(view.total * 100) }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data?.url) {
        // The desktop writes `window.location.href = data.url`. Identical
        // navigation, but the assignment form trips react-hooks/immutability
        // in this component (it does not in the desktop one, which the
        // compiler bails on for other reasons) — so the method form. The
        // "hard-nav replays the entrance" caveat does not apply: the
        // destination is the provider's own hosted checkout, not a
        // blueprint page.
        window.location.assign(data.url);
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

            <div className="mpc-state" role="status" hidden={!positive}>
              <IcCheck />
              <span>
                {settled === "paid"
                  ? "Paid in full — thank you. The team has been notified."
                  : "Accepted — thank you. The team has been notified."}
              </span>
            </div>
            <div
              className="mpc-state mpc-state--declined"
              role="status"
              hidden={settled !== "declined"}
            >
              <IcMinus />
              <span>You declined this proposal.</span>
            </div>
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

        {view.installments.length ? (
          <section className="mpc-sec rv">
            <h2 className="mpc-sec-h">Payment schedule</h2>
            <div className="mpc-pay">
              {view.installments.map((inst) => (
                <div className="mpc-pay-r" key={inst.id}>
                  <span className="mpc-pay-no">{inst.no}</span>
                  <span className="mpc-pay-n">{inst.label}</span>
                  <span className="mpc-pay-v">{inst.amount}</span>
                  {inst.share ? <span className="mpc-pay-s">{inst.share}</span> : null}
                </div>
              ))}
            </div>
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
          <div className="mpc-bar-row">
            <button
              className="mpc-btn mpc-btn--frame"
              type="button"
              disabled={busy !== null}
              aria-haspopup="dialog"
              aria-expanded={payOpen}
              onClick={() => {
                setDeclineOpen(false);
                setPayOpen(true);
              }}
            >
              Pay now
            </button>
            <button
              className="mpc-btn mpc-btn--quiet"
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
          <div className="mpc-sheet-t" id="mpc-pay-t">{`Pay ${view.totalLabel}`}</div>
        </div>
        <div className="mpc-sheet-b">
          {PROVIDERS.map((p, i) => (
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
