// Blueprint lists — entrance stagger and single-row exit, shared by every page
// that renders a list from an in-memory array.
//
// WHY THIS EXISTS
//
// The donor's motion pack wires its row stagger to a `MutationObserver` on the
// list container with `{ childList: true }`. That fires on ANY change to the
// list's children — so every render replays the full 45ms-per-row entrance,
// including renders the user did not think of as "the list arriving":
//
//   - deleting one row       → all the survivors blink and re-cascade, and the
//                              one row that actually left is invisible in the noise
//   - toggling a filter      → the whole list drops to opacity 0 and crawls back
//   - typing in a search box → the same, once per keystroke
//   - selecting a row        → the same, on every click
//
// The selection reads as "the list wiped itself and my click did nothing". It
// has been reported independently on Financials, Calendar, Announcements,
// Messages and the Fence studio, which is why the fix lives here instead of
// being re-derived a sixth time.
//
// THE CONTRACT
//
// `staggerIn` replaces the observer: the caller decides when a list is genuinely
// ARRIVING (first paint, a real navigation, a new query) and plays it then.
// Everything else repaints silently.
//
// `leaveRow` covers the other half: when one row goes, only that row animates,
// and the rows below close the gap smoothly instead of snapping.

/** Motion System "Balanced" — the primary ease-out. */
const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

function reduced(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * FLUID SCALE zooms the document, so `getBoundingClientRect` reports ZOOMED
 * pixels while a `transform: translateY()` is applied in the element's own
 * unzoomed space. Every measured delta has to be divided by this.
 */
function currentZoom(): number {
  const z = parseFloat(getComputedStyle(document.documentElement).zoom);
  return isFinite(z) && z > 0 ? z : 1;
}

/**
 * Replay the staggered entrance across `rows`.
 *
 * The inline styles are removed once each row lands: left in place, the inline
 * `transform: none` outranks every stylesheet `:hover` rule and the row's hover
 * lift silently stops working. (That bug shipped once already.)
 */
export function staggerIn(rows: HTMLElement[], step = 45, dur = 300): void {
  if (reduced()) return;
  rows.forEach((r, i) => {
    const delay = i * step;
    r.style.opacity = "0";
    r.style.transform = "translateY(8px)";
    r.style.transition =
      `opacity ${dur}ms ${EASE} ${delay}ms, transform ${dur}ms ${EASE} ${delay}ms`;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        r.style.opacity = "1";
        r.style.transform = "none";
      }),
    );
    r.addEventListener("transitionend", function te(e) {
      if (e.propertyName !== "transform") return;
      r.style.opacity = "";
      r.style.transform = "";
      r.style.transition = "";
      r.removeEventListener("transitionend", te);
    });
  });
}

export type LeaveRowOptions = {
  /** How long the row takes to fade out. */
  leaveMs?: number;
  /** How long the rows below take to close the gap. */
  closeMs?: number;
  /**
   * Class added for the duration of the exit, so a page can give the departing
   * row its own look (a danger wash, a strike-through) on top of the fade.
   */
  leaveClass?: string;
};

/**
 * Take ONE row out of a list.
 *
 * 1. the row fades and slides left — this is the beat that says WHICH row went;
 * 2. `commit()` runs and the row is removed from the DOM;
 * 3. the rows below FLIP up into the gap instead of snapping.
 *
 * `commit` must do the data mutation and any total/empty-state repaint — but
 * NOT re-render the list's markup, or the surviving nodes measured in step 2
 * are replaced and the FLIP has nothing to move.
 *
 * @param after the caller's tracked-timeout helper, so an unmount mid-exit
 *   cannot fire the rest of the sequence into a detached tree.
 */
export function leaveRow(
  row: HTMLElement,
  commit: () => void,
  after: (ms: number, fn: () => void) => void,
  opts: LeaveRowOptions = {},
): void {
  const leaveMs = opts.leaveMs ?? 180;
  const closeMs = opts.closeMs ?? 260;

  // Guard against a double click on the same × landing two exits on one row.
  if (row.dataset.leaving) return;
  row.dataset.leaving = "1";

  if (reduced()) {
    row.remove();
    commit();
    return;
  }

  // Nothing about a row on its way out should still accept input.
  row.style.pointerEvents = "none";
  row.querySelectorAll<HTMLButtonElement>("button, input, select").forEach((el) => {
    el.disabled = true;
  });
  if (opts.leaveClass) row.classList.add(opts.leaveClass);

  row.style.transition = `opacity ${leaveMs}ms ${EASE}, transform ${leaveMs}ms ${EASE}`;
  requestAnimationFrame(() => {
    row.style.opacity = "0";
    row.style.transform = "translateX(-18px)";
  });

  after(leaveMs, () => {
    // Measure the followers BEFORE the row leaves the layout. The fade above is
    // opacity + transform only, so nothing has moved yet.
    const followers: HTMLElement[] = [];
    let next = row.nextElementSibling;
    while (next) {
      followers.push(next as HTMLElement);
      next = next.nextElementSibling;
    }
    const beforeTop = followers.map((el) => el.getBoundingClientRect().top);
    const zoom = currentZoom();

    row.remove();
    commit();

    followers.forEach((el, i) => {
      if (!el.isConnected) return;
      const dy = (beforeTop[i] - el.getBoundingClientRect().top) / zoom;
      if (Math.abs(dy) < 0.5) return;
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = `transform ${closeMs}ms ${EASE}`;
        el.style.transform = "";
      });
      el.addEventListener("transitionend", function te(e) {
        if (e.propertyName !== "transform") return;
        el.style.transition = "";
        el.style.transform = "";
        el.removeEventListener("transitionend", te);
      });
    });
  });
}
