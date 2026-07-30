// Blueprint dialogs — the open/close motion contract shared by every page's
// `.mdl` overlay (Jobs / Clients / Projects create dialogs, the Workers invite
// and remove dialogs, the Leads delete confirmation).
//
// Closing a dialog used to be a single `classList.remove("open")`, and `.mdl`
// is `display: none` when not `.open` — so the box and its scrim were cut out
// of the frame instantly while the ENTER animation had a full 280ms. That
// asymmetry is what reads as "the popup has no animation": the arrival is
// smooth, the dismissal is a hard cut, and the hard cut is the half you notice.
//
// `closeMdl` adds `.mdl--closing` (which keeps `display: flex` and runs the
// exit keyframes declared in dashboard-blueprint/blueprint-global.css), then
// drops both classes once the exit has played. The caller supplies its own
// tracked-timeout helper so an unmount mid-flight cannot fire into a detached
// tree — every behavior module already owns one for exactly this reason.

/** Exit duration in ms. Must stay in step with `mdlBoxOut` / `mdlBgOut`. */
export const MDL_EXIT_MS = 190;

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Show a dialog. Clears any exit in flight first, so a reopen during the
 * 190ms close window lands on the enter animation instead of inheriting a
 * half-faded box.
 */
export function openMdl(el: HTMLElement): void {
  el.classList.remove("mdl--closing");
  // Restart the enter keyframes even when `.open` is still set from an
  // interrupted close — without the reflow the browser sees no class change.
  el.classList.remove("open");
  void el.offsetWidth;
  el.classList.add("open");
}

/**
 * Hide a dialog through its exit animation.
 *
 * @param after the caller's tracked `setTimeout` wrapper — `(ms, fn) => void`.
 * @returns false when there was nothing to close (already shut, or an exit is
 *   already playing), so callers can skip the rest of their close path.
 */
export function closeMdl(
  el: HTMLElement,
  after: (ms: number, fn: () => void) => void,
): boolean {
  if (!el.classList.contains("open") || el.classList.contains("mdl--closing")) return false;
  if (reducedMotion()) {
    el.classList.remove("open");
    return true;
  }
  el.classList.add("mdl--closing");
  after(MDL_EXIT_MS, () => {
    el.classList.remove("mdl--closing");
    el.classList.remove("open");
  });
  return true;
}
