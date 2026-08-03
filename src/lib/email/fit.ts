// Email has no container queries and no dependable clamp(), so type size is a
// pure function of string length resolved on the server (principle 16). `d` is
// the desktop size, `m` the inlined mobile-safe base.
export interface Size {
  d: number;
  m: number;
}

/** The one big number: total, due-now, a countdown, a start date. */
export function fitAnchor(s: string): Size {
  const n = s.length;
  if (n <= 7) return { d: 38, m: 32 };
  if (n <= 9) return { d: 32, m: 27 };
  if (n <= 11) return { d: 27, m: 23 };
  return { d: 23, m: 20 };
}

/** Job title / subject line rendered as the H1. */
export function fitHeadline(s: string): Size {
  const n = s.length;
  if (n <= 24) return { d: 30, m: 25 };
  if (n <= 45) return { d: 25, m: 21 };
  return { d: 21, m: 18 };
}

/** Contractor name in the lockup. Shrinks and wraps; never truncated. */
export function fitOrgName(s: string): Size {
  const n = s.length;
  if (n <= 24) return { d: 18, m: 15.5 };
  if (n <= 44) return { d: 16, m: 14 };
  return { d: 14.5, m: 13 };
}

/** Cut on a word boundary so a pasted paragraph can't produce a 14-line row. */
export function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

/**
 * Cap a line-item list and report the remainder so the caller can emit a
 * "+N more items" row carrying its own summed amount (principle 17). Gmail
 * clips over 102KB and the tail is where the total and CTA live.
 */
export function capItems<T>(
  items: T[],
  cap: number,
  amountOf: (item: T) => number,
): { shown: T[]; remainder: number; remainderTotal: number } {
  if (items.length <= cap) {
    return { shown: items, remainder: 0, remainderTotal: 0 };
  }
  const shown = items.slice(0, cap);
  const rest = items.slice(cap);
  return {
    shown,
    remainder: rest.length,
    remainderTotal: rest.reduce((sum, i) => sum + amountOf(i), 0),
  };
}
