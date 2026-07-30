"use client";

// Blueprint pages — the mount contract shared by every `*-content.tsx`.
//
// Runs the page's behavior module BEFORE the browser paints the new content.
// Under `useEffect` the sequence was: React commits the new page → the browser
// paints it fully opaque with its lists still empty → the effect then adds
// `.rv` (opacity 0, translateY(14px)) and fills the lists → everything snaps
// back and fades in. That double take is the navigation glitch. A layout effect
// runs in the same frame as the commit, so the first paint the user ever sees
// is already primed and already populated.
//
// `.main` is the scroll container (overflow-y: auto), so Next's window-level
// scroll restoration never touches it and a new page inherited the previous
// page's offset. Resetting it here — before init measures — keeps the reveal's
// above/below-the-fold split honest too. This runs per page mount, and the
// shell above it never unmounts, so it is exactly "on navigation".

import { useEffect, useLayoutEffect } from "react";

/** useLayoutEffect warns during SSR; useEffect is inert there, so it stands in. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * @param init the page's `init*Content(content)` module, which returns its own
 *   teardown. Module-level imports are stable, so it is a safe dependency.
 */
export function useBlueprintContent(init: (content: HTMLElement) => () => void) {
  useIsomorphicLayoutEffect(() => {
    const content = document.querySelector<HTMLElement>(".jf-blueprint .content");
    if (!content) return;
    const main = content.closest<HTMLElement>(".main");
    if (main) main.scrollTop = 0;
    return init(content);
  }, [init]);
}
