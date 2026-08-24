"use client";

// SUPPORT WIDGET — the Help control every signed-in user gets, and the
// composer it opens.
//
// ONE LAUNCHER, DOCKED, AT EVERY WIDTH — and why the floating plate is gone.
//   A globally mounted button parked in the bottom-right corner cannot hold
//   that corner against the pages. On handheld it covered the Smart Proposal
//   wizard's only "Next" (.wfoot), the dashboard error toast's only dismiss
//   (.toastX, no timeout) and the manual builder's totals-bar chevron
//   (.barExpand); dropping the plate to z-index 2 stopped the click-stealing
//   and then buried the plate itself under FloatingCostsCard (z 40), which is
//   PERMANENT furniture on /dashboard/proposals/new and /[id] — so above
//   860px, where the docked button used to be hidden, Help was unreachable on
//   both live proposal-editor routes.
//   The top bar is the one corner of the screen no page claims, it is already
//   where the handheld launcher lived, and it makes the control identical on
//   every viewport. <SupportLauncher /> renders there at EVERY width now, and
//   it is the only launcher there is.
//
// THE TWO PIECES TALK BY EVENT, not by props. `SupportLauncher` dispatches
// `jf:support` on `document`; the widget listens. Same arrangement as the
// estimator picker and the command palette, and for the same reason: the
// button belongs in a top bar three components away from the dialog it opens.
//
// WHO MOUNTS WHAT
//   · BlueprintShell        <SupportWidget> outside `.layout` (a node inside
//                           takes a grid column) + <SupportLauncher> in the
//                           blueprint topbar.
//   · MobileNav             <SupportWidget> + <SupportLauncher> in the topbar,
//                           for the handheld fleet.
//   · ResponsiveShell       <SupportWidget> for /dashboard, the one mapped
//                           handheld surface that kept its own topbar; that
//                           topbar mounts its own <SupportLauncher>.
//   · (dashboard) layout    <SupportWidget> for the ~50 classic routes — every
//                           billing and settings surface, which is exactly
//                           where the Billing and Account categories point.
//                           Its launcher is in the classic topbar, which is
//                           `hidden md:flex`; below 768 that group draws NO top
//                           bar at all, so the tab bar's More drawer carries
//                           the same control as a row. Still exactly one.
// NOT the admin console (the operator does not file tickets to himself) and
// not the public or auth routes, which render no shell.
//
// EVERY MOUNT PASSES `signedIn`. The standalone /mobile-*-v2 review URLs render
// the same page components outside the dashboard layout and outside the
// middleware's matcher, so they have no session and no NavRoleProvider. A
// launcher there would open a composer whose send could only ever fail.
//
// The dialog is hand-rolled, not `.mdl`: those enter/exit keyframes are
// published by dashboard-blueprint/blueprint-global.css, which only the desktop
// shell imports. Same reason the estimator picker rolls its own — a control
// mounted in four shells cannot depend on any one of their stylesheets.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { submitSupportTicket } from "@/actions/support";
import { lockScroll } from "@/lib/scrollLock";
import "./support-widget.css";

/** Longest panel transition (the handheld sheet's 0.28s slide). */
const EXIT_MS = 280;

/** The one channel between a launcher and the composer. */
const OPEN_EVENT = "jf:support";

/** The model's own taxonomy — `SupportTicket.category`, the same five values
 *  the /dashboard/support form writes and the admin triage filters on. Four of
 *  them, in the words the owner used: a bug, a billing problem, an account
 *  problem, a question. Nothing new is invented here; "feature" is the one
 *  value left out, because an idea is not a call for help. */
const CATEGORIES = [
  { value: "technical", label: "Bug" },
  { value: "billing", label: "Billing" },
  { value: "account", label: "Account" },
  { value: "general", label: "Question" },
] as const;

/** `SupportTicket.body` is capped at 5000 by the action's validator. */
const BODY_MAX = 5000;

/** Everything a Tab can land on inside the panel. */
const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Rendered, not merely present: `getClientRects()` is empty for a
 *  `display: none` element — which the classic group's docked launcher is
 *  below 768px, where that whole top bar is `hidden md:flex`. */
function isRendered(el: Element | null | undefined): el is HTMLElement {
  return el instanceof HTMLElement && el.isConnected && el.getClientRects().length > 0;
}

function focusablesIn(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isRendered);
}

// lucide `circle-help` and `x`, inlined rather than imported: this component is
// mounted on every surface in the app, and two icons do not justify pulling the
// lucide runtime into chrome that is otherwise ~4kB. Same 24×24 / stroke-2 grid
// as the sprite, so it sits in the same drawing.
const HELP_PATHS = [
  "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3",
  "M12 17h.01",
];
const X_PATHS = ["M18 6 6 18", "m6 6 12 12"];

/** Always decorative: every control that carries one has its own aria-label.
 *  The stroke basics are ATTRIBUTES, not CSS, so the glyph draws correctly
 *  inside a host topbar whose own icon class only sets a size. */
function Icon({ d, className }: { d: string[]; className?: string }) {
  return (
    <svg
      className={className ?? "jfsup-ic"}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {d.map((p) => (
        <path key={p} d={p} />
      ))}
    </svg>
  );
}

/** What a launcher may hand the composer along with the request to open. */
type OpenDetail = { opener: HTMLElement | null };

/**
 * Open the composer from anywhere. For a host whose Help control is not an
 * icon button — the classic tab bar's "More" drawer, where it is a row.
 *
 * `opener` is the element focus should return to on close. Pass it whenever the
 * host tears its own chrome down on the way here: the composer otherwise reads
 * `document.activeElement`, and a drawer that closes as it opens the composer
 * leaves focus on a node that is about to unmount. Focus then has nowhere to go
 * and lands on `<body>` — the whole page's tab order, from the top.
 */
export function openSupportComposer(opener?: HTMLElement | null): void {
  const detail: OpenDetail = { opener: opener ?? null };
  document.dispatchEvent(new CustomEvent<OpenDetail>(OPEN_EVENT, { detail }));
}

/**
 * THE launcher: one icon button in the host's top bar, wearing that bar's own
 * classes so it belongs to whichever chrome it is sitting in — the same
 * arrangement NotificationBell already uses. Rendered at every width; nothing
 * floats anywhere any more.
 *
 * The stylesheet adds the three things a host bar cannot know about: a 44px
 * touch floor that costs no layout, the hover tooltip, and a fallback size for
 * the glyph when the host names no icon class.
 */
export function SupportLauncher({
  className,
  iconClassName,
}: {
  /** The host bar's icon-button class (`.tbarBtn`, `icon-btn`, …). */
  className?: string;
  /** The host bar's icon class, for size. */
  iconClassName?: string;
}) {
  return (
    <button
      className={["jfsup-dock", className].filter(Boolean).join(" ")}
      type="button"
      aria-label="Help"
      aria-haspopup="dialog"
      onClick={(e) => openSupportComposer(e.currentTarget)}
    >
      <Icon d={HELP_PATHS} className={iconClassName} />
      {/* One word, on an ink plate, under the button — the same tooltip the
          floating plate carried, on the only side a control in a top bar has.
          aria-hidden: the button already says "Help" as its accessible name. */}
      <span className="jfsup-tip" aria-hidden="true">
        Help
      </span>
    </button>
  );
}

export function SupportWidget({
  signedIn,
}: {
  /** False on the review URLs that render a page shell with no session. */
  signedIn: boolean;
}) {
  // Two flags because there are two things to say. `open` decides whether the
  // panel is in the frame at all (`hidden` → display: none); `on` is added one
  // frame later so the enter transition has a start state to leave from, and
  // removed first on the way out so the exit can play before the node goes.
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(false);
  const [category, setCategory] = useState<string>(CATEGORIES[0].value);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The filed ticket, and whether the operator alert actually went out.
   *  Non-null = the composer has collapsed. */
  const [filed, setFiled] = useState<{ ref: string; notified: boolean } | null>(null);

  const popRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const exitTimer = useRef<number | null>(null);
  /** Whatever opened this — the docked Help button in whichever top bar the
   *  surface draws, or the tab bar's More row below 768. Focus goes back to it
   *  on close. */
  const openerRef = useRef<HTMLElement | null>(null);
  /** True only while the dialog owns focus. Cleared BEFORE the close path
   *  moves focus out, so the containment guard below does not fight it. */
  const trapping = useRef(false);
  const titleId = useId();

  const close = useCallback(() => {
    setOn(false);
    if (exitTimer.current) window.clearTimeout(exitTimer.current);
    exitTimer.current = window.setTimeout(
      () => {
        exitTimer.current = null;
        trapping.current = false;
        setOpen(false);
        // The message survives a dismissal — a half-written report the user
        // closed by mistake is not something to throw away. A FILED one does
        // not: the next open starts a new ticket.
        setFiled(null);
        setError(null);
        // Back to whatever opened this, and failing that to the dock — the
        // only launcher there is. The fallback matters for a host whose own
        // control has gone by now (the tab bar's More drawer closes behind
        // itself), and it is QUERIED rather than held in a ref because the dock
        // is rendered by the host bar, three components away. `isRendered` is
        // what keeps a `display: none` dock out of the list: `.focus()` on one
        // is a no-op and focus lands on <body> — the whole page's tab order,
        // from the top.
        const back = [
          openerRef.current,
          document.querySelector<HTMLElement>(".jfsup-dock"),
        ].find(isRendered);
        back?.focus();
      },
      reducedMotion() ? 0 : EXIT_MS,
    );
  }, []);

  const show = useCallback((opener?: HTMLElement | null) => {
    if (!signedIn) return;
    // Caught mid-exit: `open` is still true, so the enter effect below will not
    // re-run and the panel would sit in its faded-out state forever. Putting
    // `on` back is the whole recovery — focus never left the panel. Reachable
    // because the launcher does not know the panel's state and will happily ask
    // for it again during the 280ms exit.
    const midExit = exitTimer.current !== null;
    if (exitTimer.current) {
      window.clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }
    // An opener the launcher named beats whatever holds focus right now. A host
    // that closes its own chrome on the way here has already moved focus onto a
    // node one frame from unmounting, and every fallback in `close()` can be
    // unrendered at that width — so the named element is the only thing that
    // survives to be focused again.
    const active = document.activeElement;
    const focused = active instanceof HTMLElement && active !== document.body ? active : null;
    openerRef.current = isRendered(opener) ? opener : focused;
    setError(null);
    setFiled(null);
    setOpen(true);
    if (midExit) setOn(true);
  }, [signedIn]);

  // Any launcher, anywhere in the document.
  useEffect(() => {
    const onOpen = (e: Event) => show((e as CustomEvent<OpenDetail>).detail?.opener ?? null);
    document.addEventListener(OPEN_EVENT, onOpen);
    return () => document.removeEventListener(OPEN_EVENT, onOpen);
  }, [show]);

  // The frame-later `.on`, plus focus into the field the moment it can hold it.
  useEffect(() => {
    if (!open) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        setOn(true);
        trapping.current = true;
        fieldRef.current?.focus();
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, [open]);

  // HANDHELD SCROLL LOCK. At ≤860px the panel is a bottom sheet pinned to the
  // viewport, and a page that keeps scrolling behind it reads as the sheet
  // sliding off. Reference-counted through lib/scrollLock, never a hand-rolled
  // `document.body.style.overflow`: nested locks poison each other and the page
  // stays locked with nothing holding it (decisions.md, Session 3). Desktop
  // keeps its scroll — there the panel is a corner card over a transparent
  // scrim, not a sheet standing on the page.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(max-width: 860px)");
    let release: (() => void) | null = null;
    const sync = () => {
      if (mq.matches && !release) {
        release = lockScroll();
      } else if (!mq.matches && release) {
        release();
        release = null;
      }
    };
    sync();
    mq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      release?.();
    };
  }, [open]);

  // The confirmation replaces the form, so the field that had focus is gone.
  // Without this the browser drops focus to <body> mid-dialog.
  useEffect(() => {
    if (filed) doneRef.current?.focus();
  }, [filed]);

  // FOCUS CONTAINMENT. `aria-modal="true"` is a promise to a screen reader
  // that nothing outside the dialog is reachable; the app behind it has ~107
  // focusables and nothing inert, so the promise has to be kept in code.
  // Tab wraps inside the panel, and anything that lands focus outside it
  // — a browser control cycle, a stray programmatic focus — is pulled back.
  useEffect(() => {
    if (!open) return;
    const onFocusIn = (e: FocusEvent) => {
      if (!trapping.current) return;
      const panel = popRef.current;
      if (!panel) return;
      const target = e.target as Node | null;
      if (target && panel.contains(target)) return;
      (focusablesIn(panel)[0] ?? panel).focus();
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // CAPTURE phase, and that is the whole point. Both nav shells bind their
      // own Escape for the drawer on `document` too, and `stopPropagation()`
      // from one bubble-phase listener cannot stop another on the SAME node —
      // the old code tried, and one press closed the composer and the drawer.
      // A capture listener on `document` runs before every bubble listener on
      // it, whatever order they registered in, so stopping there is decisive.
      e.stopPropagation();
      close();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  useEffect(
    () => () => {
      if (exitTimer.current) window.clearTimeout(exitTimer.current);
    },
    [],
  );

  function onPanelKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const panel = popRef.current;
    if (!panel) return;
    const items = focusablesIn(panel);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey ? active === first : active === last) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  }

  async function send() {
    const body = message.trim();
    // Checked here as well as on the server so the predictable refusals read in
    // the widget's own words. Anything else that comes back is the server's and
    // is shown verbatim.
    if (!body) {
      setError("Write what happened.");
      fieldRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await submitSupportTicket({ body, category });
      setFiled({ ref: result.ref, notified: result.notified });
      setMessage("");
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : "Could not send. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) return null;

  const cls = ["jfsup", open && "jfsup--open", on && "jfsup--on"].filter(Boolean).join(" ");

  return (
    <div className={cls}>
      <div className="jfsup-scrim" hidden={!open} onClick={close} aria-hidden="true" />

      <div
        ref={popRef}
        className="jfsup-pop"
        hidden={!open}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onPanelKeyDown}
      >
        <div className="jfsup-grab" aria-hidden="true" />

        <div className="jfsup-head">
          <div className="jfsup-title" id={titleId}>
            Help
          </div>
          <button className="jfsup-x" type="button" aria-label="Close" onClick={close}>
            <Icon d={X_PATHS} />
          </button>
        </div>

        {filed ? (
          <div className="jfsup-body">
            <div className="jfsup-ok">
              <div className="jfsup-ok-t">Ticket filed</div>
              <span className="jfsup-ref">{filed.ref}</span>
              {/* What actually happened, not what usually happens: the action
                  reports whether the operator alert went out, and a dead mail
                  transport is the default in local and preview builds. */}
              <div className="jfsup-ok-s">
                {filed.notified
                  ? "Our team has been alerted."
                  : "The email alert did not go out. Quote this reference if you follow up."}
              </div>
            </div>
            <button className="jfsup-done" type="button" ref={doneRef} onClick={close}>
              Close
            </button>
          </div>
        ) : (
          <div className="jfsup-body">
            <div className="jfsup-cats" role="group" aria-label="What is this about">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  className="jfsup-cat"
                  type="button"
                  aria-pressed={category === c.value}
                  onClick={() => setCategory(c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <textarea
              ref={fieldRef}
              className="jfsup-in"
              value={message}
              maxLength={BODY_MAX}
              disabled={busy}
              placeholder="What happened?"
              aria-label="Message"
              onChange={(e) => setMessage(e.target.value)}
            />

            {error ? (
              <div className="jfsup-err" role="alert">
                {error}
              </div>
            ) : null}

            <button className="jfsup-send" type="button" disabled={busy} onClick={send}>
              {busy ? "Sending" : "Send"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
