// DEMO stand-in for blueprint-shell/places-suggest (2026-10-01): no Google
// Places on the landing — the address field is a plain text input, exactly
// what the real page is without a browser key.

import type { PickedPlace } from "@/components/v3/blueprint-shell/places-suggest";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function attachPlacesSuggest(_el: HTMLInputElement, _opts: { onPick: (p: PickedPlace) => void; onError?: (msg: string) => void }): () => void {
  return () => undefined;
}
