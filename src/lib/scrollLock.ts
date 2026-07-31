// A reference-counted page scroll lock.
//
// THE BUG THIS REPLACES
//
// Twenty-three surfaces each did their own save-and-restore:
//
//   const prevOverflow = document.body.style.overflow;
//   document.body.style.overflow = "hidden";
//   return () => { document.body.style.overflow = prevOverflow; };
//
// Correct in isolation, broken the moment two of them overlap — which they do
// constantly, because a page locks scroll AND the sheets and dialogs inside it
// lock scroll:
//
//   1. the page mounts        → saves ""       , sets "hidden"
//   2. a sheet opens          → saves "hidden" , sets "hidden"   ← poisoned
//   3. the page unmounts      → restores ""
//   4. the sheet unmounts     → restores "hidden"                ← stuck
//
// The last restore wins, and it restores a value that was only ever there
// because something else had already locked. The body stays `overflow: hidden`
// with nothing holding it, and the page cannot scroll again until a reload.
// Any interleaving — a route change while a modal is open, the responsive shell
// swapping trees at 768px, two effects in one commit — reaches the same state.
// That is the "it scrolled fine until I opened a popup and closed it" report.
//
// THE FIX
//
// One counter, one saved value, captured by the FIRST locker and restored by
// the LAST releaser. Nesting becomes safe because no one but the first lock
// ever reads the live value, so a lock can never observe another lock's work
// and mistake it for the page's resting state.

let depth = 0;
/** The body's own inline overflow, captured once by the first lock. */
let saved: string | null = null;

/**
 * Lock page scrolling and get back a release function.
 *
 * The release is idempotent: React runs a cleanup exactly once, but StrictMode
 * double-invokes effects in development and a caller may hold the function past
 * unmount, and a double decrement would drop the count below the number of live
 * holders and unlock the page underneath them.
 *
 * @returns the release. Callers MUST call it (an effect cleanup is the place).
 */
export function lockScroll(): () => void {
  if (typeof document === "undefined") return () => {};

  if (depth === 0) {
    saved = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  depth += 1;

  let released = false;
  return function release() {
    if (released) return;
    released = true;
    depth = Math.max(0, depth - 1);
    if (depth === 0) {
      document.body.style.overflow = saved ?? "";
      saved = null;
    }
  };
}

/**
 * Force the page unlocked, whatever the count says.
 *
 * An escape hatch for a genuinely stuck state — not part of the normal flow.
 * Nothing calls it today; it exists so a leak introduced by future code has an
 * obvious recovery instead of requiring a reload.
 */
export function forceUnlockScroll(): void {
  if (typeof document === "undefined") return;
  depth = 0;
  document.body.style.overflow = saved ?? "";
  saved = null;
}
