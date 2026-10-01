"use client";

import { useSyncExternalStore } from "react";
import { detectInAppBrowser, type InAppBrowser } from "@/lib/inAppBrowser";

const subscribe = () => () => {};
const getSnapshot = () => detectInAppBrowser(navigator.userAgent);

/** The in-app browser this page runs in (lib/inAppBrowser), or null.
 *  `initial` is what the server read from the request's user agent, where the
 *  page has it (/auth/register is dynamic anyway), so the first paint is
 *  already right; a static page passes nothing and corrects on hydration —
 *  the same UA, so the two never disagree after that. */
export function useInAppBrowser(initial: InAppBrowser | null = null): InAppBrowser | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => initial);
}
