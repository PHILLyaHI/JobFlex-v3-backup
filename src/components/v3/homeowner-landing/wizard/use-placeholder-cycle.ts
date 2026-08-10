"use client";

// HOMEOWNER LANDING — donor `safe('placeholder', …)`, the typewriter that
// cycles the three example descriptions through the textarea's placeholder.
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

import { useEffect, useLayoutEffect, useRef } from "react";
import { PLACEHOLDERS } from "../homeowner-data";
import { prefersReducedMotion, safe } from "../use-homeowner-behavior";

/** useLayoutEffect warns during SSR; useEffect is inert there, so it stands in. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function usePlaceholderCycle() {
  const target = useRef<HTMLTextAreaElement | null>(null);
  /* donor: `var PLACEHOLDER = PLACEHOLDERS[0]` — and under reduced motion the
     cycle never starts, so the first example stays put, complete. */
  const value = useRef(PLACEHOLDERS[0]);

  /* donor `render()`: `if (d) { d.value = S.desc; d.placeholder = PLACEHOLDER; }`
     — runs after EVERY commit, because every donor render rebuilt the node. */
  useIsomorphicLayoutEffect(() => {
    const el = target.current;
    if (el) el.placeholder = value.current;
  });

  useEffect(() => {
    const teardown = safe("placeholder", () => {
      if (prefersReducedMotion()) return undefined;
      let pi = 0;
      let ci = 0;
      let dir = 1;
      let timer = 0;

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
        value.current = text.slice(0, Math.max(0, Math.min(ci, text.length)));
        const el = target.current;
        if (el) el.placeholder = value.current;
        timer = window.setTimeout(tick, dir === 1 ? 34 : 12);
      };

      tick();
      return () => window.clearTimeout(timer);
    });
    return teardown;
  }, []);

  return target;
}
