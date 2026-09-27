"use client";

import { useEffect } from "react";

/* SMOOTH, SLOWER MOUSE-WHEEL SCROLLING (owner, 2026-09-26): "as I scroll it
   will be smooth and a bit slower … they wouldn't scroll too far". Renders
   nothing; mounted once by LandingE.

   Only a mouse wheel's notches are taken over, and only where nothing else
   should have them:
   - a fine pointer and no reduced-motion preference (read on every event, so
     a change of either takes effect at once); touch never sends wheels;
   - no ctrl/meta (zoom, pinch), shift or alt, and a mainly vertical delta;
   - not over a form field or anything marked [data-native-wheel], and not
     inside an element that can itself scroll that way (walked up from the
     target; a scroller at its end with overscroll-behavior set keeps the
     wheel too, as the browser would);
   - not while the page is scroll-locked (html/body overflow hidden, a fixed
     body) or a modal dialog is open.
   A burst of wheel events (gaps under BURST_MS) is classified by its first
   event: a line/page delta (Firefox's wheel), a legacy wheelDelta that is a
   whole number of 120-notches (Chromium, WebKit) or a notch-sized step is a
   wheel; anything else is a touchpad or free-spinning high-resolution wheel
   and stays native for the whole burst, so one gesture is never half ours.

   Each notch is normalised to pixels, clamped (a fast spin cannot fling),
   scaled by MULT and added to a target that may run at most LEAD of a
   viewport ahead of the page and never past its ends; rAF eases the page
   toward it with window.scrollTo({ behavior: "instant" }), which overrides
   `html { scroll-behavior: smooth }` for our own steps and leaves it in force
   for anchor links. Any scroll we did not make — a key, an anchor, find in
   page, a script, scroll anchoring — shows up as a position we did not set:
   the glide stops and the next notch starts from where the page is. A key,
   a mouse button, a touch or a hash change stops it before the browser's own
   scroll begins, so the two never fight. */

const MULT = 0.7; // share of the browser's own notch distance (100 px in Chromium → 70 px)
const MAX_EVENT = 120; // px per event before MULT: a wheel set to 5+ lines scrolls like 3.6
const LINE_PX = 100 / 3; // deltaMode 1: three lines make one 100 px notch
const EASE = 0.14; // share of the remaining distance covered per 60 fps frame (~300 ms settle)
const LEAD = 0.6; // the target never runs more than this share of a viewport ahead
const BURST_MS = 180;
const TOL = 1.5; // px of rounding between the offset we set and the one we read back
const NATIVE = 'input, select, textarea, [contenteditable=""], [contenteditable="true"], [data-native-wheel]';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function isNotch(e: WheelEvent, mode: number, dy: number): boolean {
  if (mode !== 0) return true;
  const wd = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
  if (typeof wd === "number" && wd !== 0 && wd % 120 === 0) return true;
  return Math.abs(dy) >= 50;
}

/** True when something between the target and the page scrolls (or holds)
 *  a vertical wheel in this direction. */
function handledInside(start: EventTarget | null, dy: number): boolean {
  let el = start instanceof Element ? start : null;
  const root = document.documentElement;
  while (el && el !== document.body && el !== root) {
    const cs = getComputedStyle(el);
    const oy = cs.overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && el.scrollHeight > el.clientHeight + 1) {
      const room = dy > 0 ? el.scrollHeight - el.clientHeight - el.scrollTop > 1 : el.scrollTop > 1;
      if (room || cs.overscrollBehaviorY !== "auto") return true;
    }
    el = el.parentElement;
  }
  return false;
}

function pageLocked(): boolean {
  const body = document.body;
  if (!body) return true;
  const hs = getComputedStyle(document.documentElement);
  const bs = getComputedStyle(body);
  const shut = (v: string) => v === "hidden" || v === "clip";
  if (shut(hs.overflowY) || shut(bs.overflowY) || bs.position === "fixed") return true;
  let modal: Element | null;
  try {
    modal = document.querySelector("dialog:modal");
  } catch {
    modal = document.querySelector("dialog[open]");
  }
  if (modal) return true;
  for (const el of Array.from(document.querySelectorAll('[aria-modal="true"]'))) {
    if (el.getClientRects().length) return true;
  }
  return false;
}

function setScroll(y: number) {
  try {
    window.scrollTo({ top: y, behavior: "instant" });
  } catch {
    window.scrollTo(0, y); // engines without "instant" have no smooth scrolling to override
  }
}

export function SmoothWheel() {
  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let pos = 0;
    let target = 0;
    let lastSet = 0;
    let raf = 0;
    let lastT = 0;
    let burstAt = -Infinity;
    let burstIsNotch = false;

    const maxScroll = () =>
      Math.max(0, (document.scrollingElement ?? document.documentElement).scrollHeight - window.innerHeight);

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const frame = (now: number) => {
      raf = 0;
      const y = window.scrollY;
      if (Math.abs(y - lastSet) > TOL) {
        // Someone else moved the page: yield to it.
        pos = target = y;
        return;
      }
      target = clamp(target, 0, maxScroll());
      const dt = lastT ? Math.min(64, now - lastT) : 16.667;
      lastT = now;
      const k = 1 - Math.pow(1 - EASE, dt / 16.667);
      pos += (target - pos) * k;
      if (Math.abs(target - pos) < 0.5) pos = target;
      setScroll(pos);
      lastSet = window.scrollY;
      if (pos !== target) raf = requestAnimationFrame(frame);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      if (!fine.matches || reduce.matches) return;
      const mode = e.deltaMode; // read first: Firefox then reports a wheel in lines, a touchpad in pixels
      const dy = e.deltaY;
      if (!dy || Math.abs(e.deltaX) > Math.abs(dy)) return;

      if (e.timeStamp - burstAt > BURST_MS) burstIsNotch = isNotch(e, mode, dy);
      burstAt = e.timeStamp;
      if (!burstIsNotch) {
        stop();
        return;
      }
      if (pageLocked()) return;
      if (e.target instanceof Element && e.target.closest(NATIVE)) return;
      if (handledInside(e.target, dy)) return;

      const px = mode === 1 ? dy * LINE_PX : mode === 2 ? dy * window.innerHeight * 0.875 : dy;
      const d = clamp(px, -MAX_EVENT, MAX_EVENT) * MULT;

      const y = window.scrollY;
      if (!raf || Math.abs(y - lastSet) > TOL) pos = target = lastSet = y;
      // A notch against the glide turns it at once instead of first eating the lead.
      if (Math.abs(target - pos) > 1 && Math.sign(d) !== Math.sign(target - pos)) target = pos;
      const lead = window.innerHeight * LEAD;
      const next = clamp(target + d, Math.max(0, pos - lead), Math.min(maxScroll(), pos + lead));
      if (!raf && Math.abs(next - pos) < 0.5) return; // at an end: leave it to the browser

      e.preventDefault();
      target = next;
      if (!raf) {
        lastT = 0;
        raf = requestAnimationFrame(frame);
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    const interrupts = ["keydown", "mousedown", "touchstart", "hashchange"] as const;
    for (const ev of interrupts) window.addEventListener(ev, stop, { passive: true, capture: true });
    return () => {
      stop();
      window.removeEventListener("wheel", onWheel);
      for (const ev of interrupts) window.removeEventListener(ev, stop, { capture: true });
    };
  }, []);

  return null;
}
