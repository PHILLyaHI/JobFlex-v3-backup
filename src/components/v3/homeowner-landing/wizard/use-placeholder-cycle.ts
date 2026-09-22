"use client";

// HOMEOWNER LANDING — donor `safe('placeholder', …)`, the typewriter that
// cycles the three example descriptions through the textarea's placeholder.
// Used by both builds of /homeowner (desktop wizard and mobile wizard).
//
// The donor keeps this OUT of its render path on purpose: `tick()` writes
// straight to `el.placeholder` roughly thirty times a second and never rebuilds
// the pane, so typing is never interrupted. The port keeps that property by
// writing through a ref instead of through state — state here would re-render
// the wizard 30×/s and fight the caret.
//
// The value is also re-applied after every commit, which is the donor's
// `render()` doing `d.placeholder = PLACEHOLDER` on the freshly built textarea.
//
// The hook OWNS the ref and hands it back rather than taking one, so nothing
// here mutates a caller's object. The wizard attaches the returned ref to its
// textarea and reuses it for the caret restore.
//
// The textarea ships with NO placeholder attribute, exactly as the donor's
// `paneDescribe()` emits it, so the server HTML and the first client render
// agree and there is nothing to mismatch on hydration.
//
// THE TYPEWRITER STEPS ASIDE (owner, 2026-09-22). It used to run whatever the
// person was doing. Now:
//   · focus (click, tap, Tab) — it fades out at once, mid-cycle, and the short
//     static STATIC_PLACEHOLDER fades in;
//   · any text in the field keeps it off, focused or not. "Text" is read from
//     `value`, never from keys, so paste, dictation, browser autofill and a
//     value prefilled from the URL all count;
//   · it comes back only when the field is empty AND unfocused, RESUME_MS
//     after focus left, from the start of the first example;
//   · reduced motion never runs it: the first example stands still.
// Every swap is a FADE_MS opacity fade on ::placeholder (the `data-ph-out`
// attribute, styled in homeowner.css and mobile-homeowner.css) — a
// placeholder takes no layout, so the field never moves.
//
// The wizard rebuilds the textarea on every pane replay, so listeners live on
// the document and match against whichever node the ref holds right now.

import { useEffect, useLayoutEffect, useRef } from "react";
import { PLACEHOLDERS } from "../homeowner-data";
import { prefersReducedMotion, safe } from "../use-homeowner-behavior";

/** useLayoutEffect warns during SSR; useEffect is inert there, so it stands in. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The quiet placeholder shown while the person is in the field. */
const STATIC_PLACEHOLDER = "Describe your project";
/** Matches the ::placeholder transition in both stylesheets. */
const FADE_MS = 150;
/** How long an empty, unfocused field waits before the typewriter returns. */
const RESUME_MS = 1000;
/** Autofill can set a value without an input event; a slow poll catches it. */
const POLL_MS = 400;

export function usePlaceholderCycle() {
  const target = useRef<HTMLTextAreaElement | null>(null);
  /* donor: `var PLACEHOLDER = PLACEHOLDERS[0]` — and under reduced motion the
     cycle never starts, so the first example stays put, complete. */
  const value = useRef(PLACEHOLDERS[0]);
  const faded = useRef(false);

  /* donor `render()`: `if (d) { d.value = S.desc; d.placeholder = PLACEHOLDER; }`
     — runs after EVERY commit, because every donor render rebuilt the node. */
  useIsomorphicLayoutEffect(() => {
    const el = target.current;
    if (!el) return;
    el.placeholder = value.current;
    el.toggleAttribute("data-ph-out", faded.current);
  });

  useEffect(() => {
    const teardown = safe("placeholder", () => {
      const reduced = prefersReducedMotion();
      let mode: "cycle" | "static" = "cycle";
      let pi = 0;
      let ci = 0;
      let dir = 1;
      let tickTimer = 0;
      let fadeTimer = 0;
      let resumeTimer = 0;

      const show = (text: string) => {
        value.current = text;
        const el = target.current;
        if (el) el.placeholder = text;
      };
      const fade = (out: boolean) => {
        faded.current = out;
        target.current?.toggleAttribute("data-ph-out", out);
      };
      /** Fade the current text out, put `text` in, fade back in, then `after`. */
      const swap = (text: string, after?: () => void) => {
        window.clearTimeout(fadeTimer);
        if (reduced) {
          fade(false);
          show(text);
          after?.();
          return;
        }
        fade(true);
        fadeTimer = window.setTimeout(() => {
          show(text);
          fade(false);
          after?.();
        }, FADE_MS);
      };

      const tick = () => {
        const text = PLACEHOLDERS[pi];
        ci += dir;
        if (ci >= text.length + 24) {
          dir = -1;
          ci = text.length;
        }
        if (ci <= 0 && dir === -1) {
          dir = 1;
          pi = (pi + 1) % PLACEHOLDERS.length;
        }
        show(text.slice(0, Math.max(0, Math.min(ci, text.length))));
        tickTimer = window.setTimeout(tick, dir === 1 ? 34 : 12);
      };

      const busy = () => {
        const el = target.current;
        return !!el && (document.activeElement === el || el.value.length > 0);
      };

      const toStatic = () => {
        window.clearTimeout(resumeTimer);
        resumeTimer = 0;
        if (mode === "static") return;
        mode = "static";
        window.clearTimeout(tickTimer);
        swap(STATIC_PLACEHOLDER);
      };

      const toCycle = () => {
        mode = "cycle";
        pi = 0;
        ci = 0;
        dir = 1;
        if (reduced) swap(PLACEHOLDERS[0]);
        else swap("", tick);
      };

      const evaluate = () => {
        if (busy()) {
          toStatic();
          return;
        }
        if (mode === "static" && !resumeTimer) {
          resumeTimer = window.setTimeout(() => {
            resumeTimer = 0;
            if (busy()) toStatic();
            else toCycle();
          }, RESUME_MS);
        }
      };

      const onEvent = (e: Event) => {
        if (e.target !== target.current) return;
        // During focusout, activeElement has not settled on its successor yet.
        if (e.type === "focusout") window.setTimeout(evaluate, 0);
        else evaluate();
      };
      const EVENTS = ["focusin", "focusout", "input", "change", "pointerdown"] as const;
      EVENTS.forEach((t) => document.addEventListener(t, onEvent, true));
      const poll = window.setInterval(evaluate, POLL_MS);

      if (busy()) {
        // Prefilled (e.g. from the URL) or autofocused on arrival: no typewriter.
        mode = "static";
        show(STATIC_PLACEHOLDER);
      } else if (!reduced) {
        tick();
      }

      return () => {
        EVENTS.forEach((t) => document.removeEventListener(t, onEvent, true));
        window.clearInterval(poll);
        window.clearTimeout(tickTimer);
        window.clearTimeout(fadeTimer);
        window.clearTimeout(resumeTimer);
      };
    });
    return teardown;
  }, []);

  return target;
}
