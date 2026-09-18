// The desktop sidebar's folded state — one constant and one writer, shared by
// the server layout (which reads the cookie so the first paint is already
// folded) and the shell (which flips it).
//
// A cookie, not localStorage: the layout is a server component, and a flag
// only the browser can read would paint the wide sidebar first and snap it
// shut after hydration on every page load.

export const SIDEBAR_FOLD_COOKIE = "jf_sb";

/** Remember the choice for a year, for every page of the app. */
export function writeSidebarFold(folded: boolean): void {
  try {
    document.cookie = `${SIDEBAR_FOLD_COOKIE}=${folded ? "1" : "0"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  } catch {
    /* a blocked cookie only costs the memory of the choice */
  }
}

/** ⌘\ on a Mac, Ctrl+\ elsewhere — the fold shortcut, named once for the button's label. */
export function foldShortcutLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl+\\";
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘\\" : "Ctrl+\\";
}
