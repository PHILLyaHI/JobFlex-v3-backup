"use client";

// JOB OFFERS — the crew member's answer surface on the Jobs page (2026-08-21).
//
// A worker WITH a password is redirected off the token portal (/w/[token]) to
// /dashboard/jobs, which until now had no way to answer an offer — the email's
// "Confirm or decline" ended in a dead click. This module is that answer:
//
//   · `useJobOffers` — the shared brain. Reads `myJobOffers` on mount, polls it
//     every 15s (skipping hidden tabs), auto-opens the popup when an offer the
//     session has not seen before arrives, and writes through
//     `respondToAssignment` optimistically. Both viewports run this one hook so
//     the polling/seen/answer rules can never drift.
//   · `<JobOffers />` — the DESKTOP face: an "Offers" button with a count
//     bubble in the page head, opening a hand-rolled anchored panel (no Radix —
//     house rule). Styled by jobs.module.css's `:global` layer (.jofr-*),
//     exactly like every other block on the blueprint jobs sheet.
//
// The handheld face lives in mobile-jobs.tsx (a bottom sheet on the same
// hook), because it has to speak that surface's CSS module.
//
// SEEN vs ANSWERED. Opening the popup stamps markNavSeen("jobs") — the sidebar
// badge and this button's own bubble both clear on a look, not only on an
// answer (owner request; src/lib/badgeCounts.ts documents the same rule from
// the counting side). The offers themselves stay listed until answered.

import { useCallback, useEffect, useRef, useState } from "react";
import { myJobOffers, respondToAssignment, type JobOffer } from "@/actions/workers";
import { markNavSeen } from "@/actions/notifications";

export type OfferResponse = "ACCEPTED" | "DECLINED";

/** Poll cadence. 15s is the "real time enough" the dispatch flow needs without
 *  turning every parked tab into a crawler — and hidden tabs skip the tick. */
const POLL_MS = 15000;

/** "Sep 15" / "Sep 15 – Sep 18" / null when the job is unscheduled. The year is
 *  said only when it is not the current one — same rule as the jobs rows. */
export function offerRange(o: Pick<JobOffer, "startsAt" | "endsAt">): string | null {
  const day = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    });
  };
  const a = day(o.startsAt);
  if (!a) return null;
  const b = day(o.endsAt);
  return b && b !== a ? `${a} – ${b}` : a;
}

/** The scope's first breath — a popup row is a decision aid, not the record. */
export function scopeSnippet(scope: string | null, max = 140): string | null {
  const s = (scope ?? "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

function offerError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  if (!msg || msg.toLowerCase().includes("fetch failed")) {
    return "Something went wrong. Check your connection and try again.";
  }
  return msg;
}

export type UseJobOffersOptions = {
  /** Called after a successful accept/decline — the jobs board patches its own
   *  row from this (desktop dispatches a window event, mobile reloads). */
  onAnswered?: (offer: JobOffer, response: OfferResponse) => void;
  /** Veto for the poll's auto-open (e.g. another sheet is already up). The
   *  arrival still counts as new — the bubble shows instead. */
  allowAutoOpen?: () => boolean;
};

export function useJobOffers(options: UseJobOffersOptions = {}) {
  const [offers, setOffers] = useState<JobOffer[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seenIds, setSeenIds] = useState<ReadonlySet<string>>(new Set());

  // Refs, not deps: the poll interval must survive the life of the mount with
  // one identity, and the callbacks must still see the current values. The
  // mirror is written from an effect — a ref write during render is a lint
  // error under React 19's hooks rules.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  const offersRef = useRef<JobOffer[]>([]);
  /** Every assignment id this session has laid eyes on (in data, not on
   *  screen). Null until the first read lands — the first read is the
   *  baseline, never an "arrival". */
  const knownIds = useRef<Set<string> | null>(null);
  /** Answered here, this session — a poll racing the write must not resurrect
   *  the row the user just cleared. */
  const answeredIds = useRef<Set<string>>(new Set());
  /** One answer in flight at a time — the buttons disable on busyId, this is
   *  the same rule where a state read would be stale. */
  const busyRef = useRef(false);

  const see = useCallback((rows: JobOffer[]) => {
    setSeenIds((prev) => {
      const next = new Set(prev);
      rows.forEach((r) => next.add(r.assignmentId));
      return next;
    });
    // Fire-and-forget: the watermark is bookkeeping, not something the popup
    // should block or fail on.
    void markNavSeen("jobs").catch(() => {});
  }, []);

  const openOffers = useCallback(() => {
    setError(null);
    setOpen(true);
    see(offersRef.current);
  }, [see]);

  const closeOffers = useCallback(() => setOpen(false), []);

  const sync = useCallback(
    async (fromPoll: boolean) => {
      const rows = (await myJobOffers()).filter(
        (r) => !answeredIds.current.has(r.assignmentId),
      );
      const isFirst = knownIds.current === null;
      const fresh = isFirst
        ? []
        : rows.filter((r) => !knownIds.current!.has(r.assignmentId));
      if (isFirst) knownIds.current = new Set();
      rows.forEach((r) => knownIds.current!.add(r.assignmentId));
      offersRef.current = rows;
      setOffers(rows);
      // THE REAL-TIME REQUIREMENT: an offer assigned while the page is open
      // announces itself — the popup opens on its own, no reload.
      if (fromPoll && fresh.length) {
        const allowed = optionsRef.current.allowAutoOpen?.() ?? true;
        if (allowed) {
          setError(null);
          setOpen(true);
          see(rows);
        }
      }
    },
    [see],
  );

  useEffect(() => {
    let alive = true;
    void sync(false)
      .then(() => {
        if (!alive) return;
        // DEEP LINK: the assignment email's "Confirm or decline" lands a
        // password-holding worker on /dashboard/jobs?offers=1 (the token
        // portal redirects there) — the popup opens itself so the click the
        // email promised actually happens. The param is scrubbed after use
        // so a refresh or back-swipe doesn't re-open it.
        const q = new URLSearchParams(window.location.search);
        if (q.get("offers") === "1") {
          if (optionsRef.current.allowAutoOpen?.() ?? true) openOffers();
          q.delete("offers");
          const rest = q.toString();
          window.history.replaceState(
            null,
            "",
            window.location.pathname + (rest ? "?" + rest : ""),
          );
        }
      })
      .catch(() => {
        // A failed first read leaves the button un-rendered; the poll retries.
        if (alive) setOffers((prev) => prev ?? []);
      });
    const id = window.setInterval(() => {
      if (document.hidden) return;
      void sync(true).catch(() => {});
    }, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [sync, openOffers]);

  const respond = useCallback(async (offer: JobOffer, response: OfferResponse) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(offer.assignmentId);
    setError(null);
    // Optimistic: the row leaves now; a refusal puts it back with the words.
    offersRef.current = offersRef.current.filter(
      (o) => o.assignmentId !== offer.assignmentId,
    );
    setOffers(offersRef.current);
    try {
      await respondToAssignment(offer.assignmentId, response);
      answeredIds.current.add(offer.assignmentId);
      optionsRef.current.onAnswered?.(offer, response);
    } catch (err) {
      offersRef.current = [offer, ...offersRef.current];
      setOffers(offersRef.current);
      setError(offerError(err));
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }, []);

  const list = offers ?? [];
  const loaded = offers !== null;
  const unseen = list.filter((o) => !seenIds.has(o.assignmentId)).length;

  return { offers: list, loaded, unseen, open, openOffers, closeOffers, respond, busyId, error };
}

/* ════════════════════════════════════════════════════════════════════════
   DESKTOP FACE — mounted in the blueprint jobs page head for LIMITED roles.
   ════════════════════════════════════════════════════════════════════════ */

/** Window event the blueprint board listens for, so an accepted offer's row
 *  flips from "Not accepted yet" to the job's status without a reload. */
export const OFFER_ANSWERED_EVENT = "jf-jobs-offer-answered";
export type OfferAnsweredDetail = { jobId: string; response: OfferResponse };

export function JobOffers() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const { offers, loaded, unseen, open, openOffers, closeOffers, respond, busyId, error } =
    useJobOffers({
      onAnswered: (offer, response) => {
        window.dispatchEvent(
          new CustomEvent<OfferAnsweredDetail>(OFFER_ANSWERED_EVENT, {
            detail: { jobId: offer.jobId, response },
          }),
        );
      },
    });

  // Hand-rolled dismissal: outside pointerdown and Escape, nothing else.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) closeOffers();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeOffers();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, closeOffers]);

  // Nothing pending and nothing open: the head stays clean. The poll brings
  // the button (and the popup) back the moment an offer lands.
  if (!loaded || (offers.length === 0 && !open)) return null;

  return (
    <div className="jofr" ref={wrapRef}>
      <button
        className="btn btn-ghost jofr-btn"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={open ? closeOffers : openOffers}
      >
        <svg className="ic" aria-hidden="true">
          <use href="#i-bell" />
        </svg>
        Offers
        {unseen > 0 ? <span className="jofr-n">{unseen}</span> : null}
      </button>

      {open ? (
        <div className="jofr-pop" role="dialog" aria-label="Job offers">
          <div className="jofr-head">
            <div>
              <span className="jofr-kick">Dispatch / offers</span>
              <span className="jofr-title">Job offers</span>
            </div>
            <button className="jofr-x" type="button" aria-label="Close offers" onClick={closeOffers}>
              <svg className="ic" aria-hidden="true">
                <use href="#i-x" />
              </svg>
            </button>
          </div>

          <div className="jofr-list">
            {offers.length === 0 ? (
              <div className="jofr-empty">No open offers — you&rsquo;re all caught up.</div>
            ) : (
              offers.map((o) => {
                const range = offerRange(o);
                const scope = scopeSnippet(o.scope);
                const busy = busyId === o.assignmentId;
                return (
                  <div className="jofr-row" key={o.assignmentId}>
                    <div className="jofr-job">{o.title}</div>
                    <div className="jofr-meta">
                      {o.client ?? "No client"} · {range ?? "Unscheduled"}
                    </div>
                    {scope ? <div className="jofr-scope">{scope}</div> : null}
                    <div className="jofr-acts">
                      <button
                        className="jofr-ok"
                        type="button"
                        disabled={Boolean(busyId)}
                        onClick={() => void respond(o, "ACCEPTED")}
                      >
                        <svg className="ic" aria-hidden="true">
                          <use href="#i-check" />
                        </svg>
                        {busy ? "Working…" : "Accept"}
                      </button>
                      <button
                        className="jofr-no"
                        type="button"
                        disabled={Boolean(busyId)}
                        onClick={() => void respond(o, "DECLINED")}
                      >
                        <svg className="ic" aria-hidden="true">
                          <use href="#i-x" />
                        </svg>
                        Decline
                      </button>
                    </div>
                  </div>
                );
              })
            )}
            {error ? (
              <div className="jofr-err" role="alert">
                {error}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
