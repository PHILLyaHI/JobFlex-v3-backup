"use client";

// The optimistic accept, shared between the two client islands of the desktop
// portal. PortalActions flips to "accepted" the moment the client taps, before
// the accept POST (which waits on two emails) returns and before
// router.refresh() re-renders the server tree; PortalPayment is a sibling
// island that cannot see that state. Without this it showed the deposit with
// no pay button for those seconds. One flag, per proposal, in memory only.

import { useSyncExternalStore } from "react";

const flags = new Map<string, boolean>();
const listeners = new Set<() => void>();

export function markAcceptedLocally(publicId: string, accepted: boolean): void {
  flags.set(publicId, accepted);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useAcceptedLocally(publicId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => flags.get(publicId) ?? false,
    () => false,
  );
}
