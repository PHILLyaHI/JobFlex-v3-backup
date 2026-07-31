// Address autocomplete for the blueprint pages, built on Google's PROGRAMMATIC
// Places Autocomplete (`AutocompleteSuggestion`).
//
// WHY A SECOND ONE
//
// `components/estimator/roof/PlacesAutocomplete.tsx` already does this — but it
// is a React component that renders its own `<Input>` and portals its list
// through `react-dom`. The blueprint pages are plain DOM: their behavior modules
// own `.content` imperatively and their address fields are hand-authored markup
// (`#addrInput` in the Fence studio, `#locText` in Smart Proposal). There is no
// React tree to mount into, so this module attaches to an EXISTING <input> and
// renders a blueprint-styled list beside it. The Places plumbing — session
// tokens, the debounce, `fetchFields` on pick, the address-component parse — is
// the same contract as the React version, deliberately, so the two cannot drift
// on what "a picked address" means.
//
// The browser key is `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, read through
// `lib/googleMaps`. With no key the field stays a plain text input and every
// keystroke is reported as a free-text address — the page still works, it just
// has no suggestions.

import { isMapsBrowserEnabled, loadMapsLibrary } from "@/lib/googleMaps";

export interface PickedPlace {
  /** Street line, or the whole formatted string when there are no parts. */
  address: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
  /** Google's one-line address, with a trailing ", USA" trimmed. */
  formatted: string;
  /** True when this came from free typing rather than a picked suggestion. */
  typed?: boolean;
}

// The Maps SDK ships no types in this project; the shapes are read defensively.
/* eslint-disable @typescript-eslint/no-explicit-any */
type G = any;

function readComponents(components: G[]): { city: string; state: string; zip: string } {
  let city = "";
  let state = "";
  let zip = "";
  for (const c of components ?? []) {
    const types: string[] = c.types ?? [];
    const long = c.longText ?? c.long_name ?? "";
    const short = c.shortText ?? c.short_name ?? "";
    if (types.includes("locality") || types.includes("postal_town")) city = long;
    else if (!city && types.includes("sublocality")) city = long;
    if (types.includes("administrative_area_level_1")) state = short;
    if (types.includes("postal_code")) zip = long;
  }
  return { city, state, zip };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type PlacesSuggestOptions = {
  /**
   * Narrow suggestions to cities. Used by regional-pricing fields, where a
   * street address is noise — the caller only needs "Bothell, WA".
   */
  cityOnly?: boolean;
  /** Called on every pick, and (with `typed: true`) on free typing. */
  onPick: (place: PickedPlace) => void;
  /**
   * Class for the suggestion list, REPLACING the default "bp-sug".
   *
   * The handheld pages pass a CSS-module class here. The list is appended to
   * <body>, outside any React tree, so a hashed module class is the only way it
   * can be styled without colliding with the desktop rules in
   * blueprint-global.css — which are sized for a mouse and load on these routes
   * anyway, since the responsive shell imports BlueprintShell statically.
   * Inner items keep their global bp-sug-* classes; a caller reaches them with
   * a descendant selector, which outranks the desktop's single-class rules.
   */
  className?: string;
};

/**
 * Attach suggestions to an existing text input.
 *
 * The list is appended to the input's offsetParent-anchored wrapper via
 * `position: fixed` coordinates, so it is never clipped by a card's
 * `overflow: hidden` and never fights a stacking context — the same reason the
 * React version portals to `<body>`.
 *
 * @returns a disposer. Callers must add it to their unmount teardown.
 */
export function attachPlacesSuggest(
  input: HTMLInputElement,
  opts: PlacesSuggestOptions,
): () => void {
  const enabled = isMapsBrowserEnabled();

  // No key: the field is still usable, it just reports what was typed.
  if (!enabled) {
    const onInput = () => {
      const v = input.value;
      opts.onPick({ address: v, city: "", state: "", zip: "", formatted: v, typed: true });
    };
    input.addEventListener("input", onInput);
    return () => input.removeEventListener("input", onInput);
  }

  const pop = document.createElement("ul");
  pop.className = opts.className ?? "bp-sug";
  pop.setAttribute("role", "listbox");
  document.body.appendChild(pop);

  type Item = { id: string; main: string; secondary: string; pp: G };
  let list: Item[] = [];
  let open = false;
  let activeIdx = -1;
  let focused = false;
  let places: G = null;
  let token: G = null;
  let reqId = 0;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  // Set right before a pick rewrites the field, so the input handler does not
  // immediately re-query the address we just chose and reopen the list.
  let justChose = false;

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("autocomplete", "off");

  function place() {
    const r = input.getBoundingClientRect();
    pop.style.top = r.bottom + 5 + "px";
    pop.style.left = r.left + "px";
    pop.style.width = r.width + "px";
  }

  function paint() {
    pop.innerHTML = list
      .map(
        (s, i) =>
          '<li role="option" aria-selected="' +
          (i === activeIdx) +
          '"><button class="bp-sug-item' +
          (i === activeIdx ? " on" : "") +
          '" type="button" data-i="' +
          i +
          '"><svg class="ic bp-sug-ic"><use href="#i-pin"/></svg>' +
          '<span class="bp-sug-txt"><span class="bp-sug-main">' +
          esc(s.main) +
          "</span>" +
          (s.secondary ? '<span class="bp-sug-sub">' + esc(s.secondary) + "</span>" : "") +
          "</span></button></li>",
      )
      .join("");
  }

  function show() {
    if (!list.length) return hide();
    open = true;
    place();
    paint();
    pop.classList.add("open");
    input.setAttribute("aria-expanded", "true");
  }

  function hide() {
    open = false;
    pop.classList.remove("open");
    input.setAttribute("aria-expanded", "false");
    activeIdx = -1;
  }

  async function ensurePlaces(): Promise<G> {
    if (!places) places = await loadMapsLibrary<G>("places");
    if (!token) token = new places.AutocompleteSessionToken();
    return places;
  }

  async function fetchSuggestions(q: string) {
    const mine = ++reqId;
    try {
      const p = await ensurePlaces();
      const { suggestions } = await p.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: q,
        sessionToken: token,
        region: "us",
        ...(opts.cityOnly ? { includedPrimaryTypes: ["locality"] } : {}),
      });
      // A slower earlier request must never overwrite a newer one's results.
      if (mine !== reqId) return;
      list = (suggestions ?? [])
        .map((s: G) => s.placePrediction)
        .filter(Boolean)
        .map((pp: G, i: number) => ({
          id: String(pp.placeId ?? "s" + i),
          main: String(pp.mainText?.toString?.() ?? pp.text?.toString?.() ?? pp.text ?? ""),
          secondary: String(pp.secondaryText?.toString?.() ?? ""),
          pp,
        }));
      activeIdx = -1;
      // The response can land after the user has already clicked away (e.g. onto
      // "Generate estimate"); reopening over whatever came next would be wrong.
      if (focused) show();
    } catch (err) {
      console.error("[places-suggest] suggestion fetch failed:", err);
      list = [];
      hide();
    }
  }

  async function choose(item: Item) {
    hide();
    list = [];
    try {
      const p = item.pp.toPlace();
      await p.fetchFields({ fields: ["formattedAddress", "location", "addressComponents"] });
      const loc = p.location;
      const lat = loc ? (typeof loc.lat === "function" ? loc.lat() : loc.lat) : undefined;
      const lng = loc ? (typeof loc.lng === "function" ? loc.lng() : loc.lng) : undefined;
      const { city, state, zip } = readComponents(p.addressComponents ?? []);
      const formatted = String(p.formattedAddress ?? item.main).replace(/,\s*USA$/, "");
      const street = formatted.split(",")[0] || formatted;
      justChose = true;
      input.value = opts.cityOnly ? city || street : formatted;
      opts.onPick({ address: street, city, state, zip, lat, lng, formatted });
      // fetchFields closes the billing session — the next query needs a new token.
      token = null;
    } catch (err) {
      console.error("[places-suggest] failed to resolve the picked place:", err);
    }
  }

  const onInput = () => {
    const v = input.value;
    // Report the raw text too, so a caller that only needs "whatever is typed"
    // (a free-text city, an address the user never picks from the list) stays in
    // step without waiting for a selection.
    opts.onPick({ address: v, city: "", state: "", zip: "", formatted: v, typed: true });

    if (justChose) {
      justChose = false;
      return;
    }
    if (debounce) clearTimeout(debounce);
    const q = v.trim();
    if (q.length < 3) {
      list = [];
      hide();
      return;
    }
    debounce = setTimeout(() => fetchSuggestions(q), 250);
  };

  const onFocus = () => {
    focused = true;
    if (list.length) show();
  };
  const onBlur = () => {
    focused = false;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open || !list.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, list.length - 1);
      paint();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      paint();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = list[activeIdx >= 0 ? activeIdx : 0];
      if (item) void choose(item);
    } else if (e.key === "Escape") {
      hide();
    }
  };

  // mousedown, not click: the default would blur the input first and the list
  // would be gone before the click landed.
  const onPopDown = (e: MouseEvent) => {
    const btn = (e.target as Element | null)?.closest?.<HTMLElement>("[data-i]");
    if (!btn) return;
    e.preventDefault();
    const item = list[Number(btn.dataset.i)];
    if (item) void choose(item);
  };

  const onDocDown = (e: MouseEvent) => {
    const t = e.target as Node;
    if (input.contains(t) || pop.contains(t) || t === input) return;
    hide();
  };
  const onReflow = () => {
    if (open) place();
  };

  input.addEventListener("input", onInput);
  input.addEventListener("focus", onFocus);
  input.addEventListener("blur", onBlur);
  input.addEventListener("keydown", onKeyDown);
  pop.addEventListener("mousedown", onPopDown);
  document.addEventListener("mousedown", onDocDown);
  window.addEventListener("scroll", onReflow, true);
  window.addEventListener("resize", onReflow);

  return () => {
    if (debounce) clearTimeout(debounce);
    input.removeEventListener("input", onInput);
    input.removeEventListener("focus", onFocus);
    input.removeEventListener("blur", onBlur);
    input.removeEventListener("keydown", onKeyDown);
    pop.removeEventListener("mousedown", onPopDown);
    document.removeEventListener("mousedown", onDocDown);
    window.removeEventListener("scroll", onReflow, true);
    window.removeEventListener("resize", onReflow);
    pop.remove();
  };
}
