"use client";

// THE PAGE'S ONE BOTTOM SHEET — hand-rolled, no dialog library.
//
// Always mounted and slid in and out by class, because a sheet that unmounts
// on close cannot play its exit: the travel is the stylesheet's 300ms, and the
// shared swipe-down hook (mobile-shell/use-sheet-drag) is written against
// exactly that — it drives `transform` on this element during a pull and hands
// travel back to the stylesheet on release. Closed, the sheet is `inert` and
// `visibility: hidden` once its travel ends, so nothing in it can be reached
// by Tab or by a screen reader.
//
// What a modal owes a keyboard and a thumb, all here: focus moves into the
// panel on open and is held there (Tab / Shift+Tab wrap), Escape closes, the
// scrim closes, a pull down on the grab strip or the header closes, and focus
// returns to the control that opened it. None of the ways out work while a
// save is on the wire — a sheet that closed mid-write would hide the answer.
//
// The page behind is locked with the shared ref-counted lock (lib/scrollLock),
// never by saving and restoring body.style itself.

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { lockScroll } from "@/lib/scrollLock";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";

type Props = {
  open: boolean;
  /** A write is on the wire: every way out waits for it. */
  busy: boolean;
  kicker: string;
  title: string;
  onClose: () => void;
  /** The control that opened the sheet; focus goes back to it on close. */
  returnFocus: RefObject<HTMLElement | null>;
  children: ReactNode;
  /** The sticky action row under the scrolling body. */
  foot?: ReactNode;
};

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function MhiSheet({ open, busy, kicker, title, onClose, returnFocus, children, foot }: Props) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement | null>(null);
  // Read by listeners that outlive a render; written after each commit.
  const busyRef = useRef(busy);
  const closeRef = useRef(onClose);
  useEffect(() => {
    busyRef.current = busy;
    closeRef.current = onClose;
  });

  const drag = useSheetDrag(open, () => {
    if (!busyRef.current) closeRef.current();
  });

  useEffect(() => {
    if (!open) return;
    const el = panel.current;
    const opener = returnFocus.current;
    const unlock = lockScroll();
    // The panel itself takes focus, not the first field: on a phone a focused
    // field raises the keyboard over the very form it belongs to.
    const raf = requestAnimationFrame(() => el?.focus({ preventScroll: true }));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!busyRef.current) {
          event.preventDefault();
          closeRef.current();
        }
        return;
      }
      if (event.key !== "Tab" || !el) return;
      const list = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) => node.getClientRects().length > 0,
      );
      if (!list.length) {
        event.preventDefault();
        el.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (!el.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || active === el)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      unlock();
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, returnFocus]);

  const setPanel = (node: HTMLDivElement | null) => {
    panel.current = node;
    drag.sheetProps.ref(node);
  };

  return (
    <>
      <div
        className={`mhi-scrim${open ? " is-on" : ""}`}
        aria-hidden="true"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        {...drag.sheetProps}
        ref={setPanel}
        className={`mhi-sheet${open ? " is-on" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy || undefined}
        tabIndex={-1}
        inert={!open}
      >
        <div className="mhi-sheet-grab" aria-hidden="true" {...drag.handleProps}>
          <span />
        </div>
        <div className="mhi-sheet-head" {...drag.handleProps}>
          <div className="mhi-sheet-headtxt">
            <p className="mhi-sheet-kick">{kicker}</p>
            <h2 className="mhi-sheet-title" id={titleId}>
              {title}
            </h2>
          </div>
          <button type="button" className="mhi-iconbtn" aria-label="Close" disabled={busy} onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="mhi-sheet-body">{children}</div>
        {foot ? <div className="mhi-sheet-foot">{foot}</div> : null}
      </div>
    </>
  );
}
