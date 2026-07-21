"use client";
// Address search built on Google's PROGRAMMATIC Places Autocomplete
// (AutocompleteSuggestion) rather than the <gmp-place-autocomplete> web component.
// We render our own styled input + a portalled dropdown, which fixes the web
// component's problems: the predictions popup no longer gets clipped / z-index
// buried, there's no "Google bar vs our bar" flicker, and styling can't conflict.
// Falls back to a plain text field when no browser key is configured. `cityOnly`
// narrows suggestions to localities and fills just the city name on pick — for
// regional-pricing fields, alongside a controlled `value`/`onTextChange` pair so
// a caller can keep the field's text in a parent's own state.
import * as React from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/Input";
import { MapPin, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { loadMapsLibrary, isMapsBrowserEnabled } from "@/lib/googleMaps";

export interface PickedAddress {
  address: string; // street line (or full formatted when parts are missing)
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
  formatted?: string; // full one-line address as Google returns it (", USA" trimmed)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GPlaces = any;

function readComponents(components: GPlaces[]): { city: string; state: string; zip: string } {
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

interface Suggestion {
  id: string;
  label: string;
  pp: GPlaces; // PlacePrediction
}

export function PlacesAutocomplete({
  onPick,
  className,
  enableFind = false,
  cityOnly = false,
  placeholder,
  value,
  onTextChange,
  inputWrapperClassName,
}: {
  onPick: (a: PickedAddress) => void;
  className?: string;
  // Adds a "Find" button that geocodes the typed text directly, so a full address
  // resolves even without picking a dropdown suggestion.
  enableFind?: boolean;
  // Passed to the field wrapper (e.g. to soften the focus ring on a given form).
  inputWrapperClassName?: string;
  // Restricts suggestions to city-level places (no street addresses / businesses)
  // and, on pick, fills the field with just the city name instead of the full
  // formatted address — for "regional pricing" style fields, not property search.
  cityOnly?: boolean;
  placeholder?: string;
  // Optional controlled mode: lets a caller re-sync the displayed text from
  // outside (e.g. an AI typo-correction) while every keystroke still bubbles up.
  value?: string;
  onTextChange?: (v: string) => void;
}) {
  const enabled = isMapsBrowserEnabled();
  const [text, setText] = React.useState(value ?? "");
  const [list, setList] = React.useState<Suggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [loading, setLoading] = React.useState(false);
  const [finding, setFinding] = React.useState(false);
  const [rect, setRect] = React.useState<{ top: number; left: number; width: number } | null>(null);
  const effectivePlaceholder =
    placeholder ?? (cityOnly ? "Philadelphia" : enabled ? "Search an address…" : "123 Main St, City, ST");

  // Controlled mode: re-sync `text` when the caller changes `value` from outside,
  // without clobbering it on the echo of our own edits (same lastEmitted-ref
  // pattern the intake form uses for city/state).
  const lastSyncedRef = React.useRef(value);
  React.useEffect(() => {
    if (value !== undefined && value !== lastSyncedRef.current) {
      setText(value);
    }
    lastSyncedRef.current = value;
  }, [value]);

  const updateText = React.useCallback(
    (v: string) => {
      setText(v);
      lastSyncedRef.current = v;
      onTextChange?.(v);
    },
    [onTextChange],
  );

  const onPickRef = React.useRef(onPick);
  React.useEffect(() => {
    onPickRef.current = onPick;
  });
  // Tracks whether the field is actually focused right now. A debounced
  // suggestion fetch can resolve well after the user has already clicked away
  // (e.g. hit "Generate estimate") — without this gate, that late response
  // would blindly reopen the dropdown on top of whatever appeared next.
  const focusedRef = React.useRef(false);
  const placesRef = React.useRef<GPlaces>(null);
  const geocoderRef = React.useRef<GPlaces>(null);
  const tokenRef = React.useRef<GPlaces>(null);
  const reqIdRef = React.useRef(0);
  // Set right before a pick programmatically rewrites the field. The fetch effect
  // watches `text`, so without this it would re-query the chosen address and
  // reopen the list we just closed.
  const justChoseRef = React.useRef(false);
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const popRef = React.useRef<HTMLUListElement>(null);

  const ensurePlaces = React.useCallback(async (): Promise<GPlaces> => {
    if (!placesRef.current) placesRef.current = await loadMapsLibrary<GPlaces>("places");
    if (!tokenRef.current) tokenRef.current = new placesRef.current.AutocompleteSessionToken();
    return placesRef.current;
  }, []);

  // Geocode the typed text directly (the "Find" button / Enter with no selection).
  const runFind = React.useCallback(async () => {
    const q = text.trim();
    if (!q || finding) return;
    setOpen(false);
    setFinding(true);
    try {
      if (!geocoderRef.current) {
        const g = await loadMapsLibrary<GPlaces>("geocoding");
        geocoderRef.current = new g.Geocoder();
      }
      const { results } = await geocoderRef.current.geocode({ address: q, region: "us" });
      const r = results?.[0];
      if (!r) return;
      const loc = r.geometry?.location;
      const lat = loc ? (typeof loc.lat === "function" ? loc.lat() : loc.lat) : undefined;
      const lng = loc ? (typeof loc.lng === "function" ? loc.lng() : loc.lng) : undefined;
      const { city, state, zip } = readComponents(r.address_components ?? []);
      const formatted: string = (r.formatted_address ?? q).replace(/,\s*USA$/, "");
      const street = formatted.split(",")[0] || formatted;
      onPickRef.current({ address: street, city, state, zip, lat, lng, formatted });
      updateText(formatted);
    } catch (err) {
      console.error("[PlacesAutocomplete] geocode failed:", err);
    } finally {
      setFinding(false);
    }
  }, [text, finding, updateText]);

  // Debounced prediction fetch. All setState lives inside the timer callback
  // (async) so nothing runs synchronously in the effect body; reqId guards against
  // out-of-order responses.
  React.useEffect(() => {
    if (!enabled) return;
    // A pick just rewrote `text` programmatically — skip this one cycle so we
    // don't re-query the chosen address and reopen the list we just closed.
    if (justChoseRef.current) {
      justChoseRef.current = false;
      return;
    }
    const q = text.trim();
    let cancelled = false;
    const reqId = ++reqIdRef.current;
    const timer = setTimeout(
      async () => {
        if (q.length < 3) {
          if (!cancelled) {
            setList([]);
            setOpen(false);
            setLoading(false);
          }
          return;
        }
        if (!cancelled) setLoading(true);
        try {
          const places = await ensurePlaces();
          const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: q,
            sessionToken: tokenRef.current,
            region: "us",
            ...(cityOnly ? { includedPrimaryTypes: ["locality"] } : {}),
          });
          if (cancelled || reqId !== reqIdRef.current) return;
          const items: Suggestion[] = (suggestions ?? [])
            .map((s: GPlaces) => s.placePrediction)
            .filter(Boolean)
            .map((pp: GPlaces, idx: number) => ({
              id: String(pp.placeId ?? `s${idx}`),
              label: typeof pp.text?.toString === "function" ? pp.text.toString() : String(pp.text ?? ""),
              pp,
            }));
          setList(items);
          setActive(-1);
          // Only reopen if the user is still in the field — a stale-but-current
          // (not `cancelled`) response can otherwise land after focus has
          // already moved on (e.g. clicking "Generate estimate").
          setOpen(items.length > 0 && focusedRef.current);
        } catch {
          if (!cancelled) {
            setList([]);
            setOpen(false);
          }
        } finally {
          if (!cancelled && reqId === reqIdRef.current) setLoading(false);
        }
      },
      q.length < 3 ? 0 : 250,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text, enabled, ensurePlaces, cityOnly]);

  // Track the input rect so the portalled dropdown stays anchored on scroll/resize.
  const updateRect = React.useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom, left: r.left, width: r.width });
  }, []);
  React.useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(updateRect); // defer so setRect isn't synchronous in the effect body
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open, updateRect]);

  // Close on outside click (consider both the input and the portalled list).
  React.useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  async function choose(item: Suggestion) {
    setOpen(false);
    setList([]); // drop stale predictions so a later refocus can't reopen them
    setActive(-1);
    try {
      const place = item.pp.toPlace();
      await place.fetchFields({ fields: ["formattedAddress", "location", "addressComponents"] });
      const loc = place.location;
      const lat = loc ? (typeof loc.lat === "function" ? loc.lat() : loc.lat) : undefined;
      const lng = loc ? (typeof loc.lng === "function" ? loc.lng() : loc.lng) : undefined;
      const { city, state, zip } = readComponents(place.addressComponents ?? []);
      const formatted: string = (place.formattedAddress ?? item.label).replace(/,\s*USA$/, "");
      const street = formatted.split(",")[0] || formatted; // street line minus "city, ST zip"
      const display = cityOnly ? city || street : formatted;
      onPickRef.current({ address: street, city, state, zip, lat, lng, formatted });
      // Rewriting the field below changes `text`; flag it so the fetch effect skips
      // the resulting cycle instead of re-querying and reopening the dropdown.
      justChoseRef.current = true;
      // Controlled: the owner sets `value` (and reads state off the pick), so we
      // must NOT also fire onTextChange here — that would look like a keystroke and
      // clobber the just-applied selection. Uncontrolled: drive our own text.
      if (value === undefined) updateText(display);
      else setText(display);
      tokenRef.current = null; // fetchFields ends the session — start a fresh token next time
    } catch (err) {
      console.error("[PlacesAutocomplete] failed to resolve the picked place:", err);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Enter with no open suggestion list → geocode the typed text directly.
    if (e.key === "Enter" && enableFind && (!open || list.length === 0)) {
      e.preventDefault();
      runFind();
      return;
    }
    if (!open || list.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, list.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = list[active >= 0 ? active : 0];
      if (item) choose(item);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  if (!enabled) {
    // No browser key → plain text; the caller treats the whole string as the
    // address line (city/state/zip blank).
    return (
      <Input
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          updateText(v);
          onPickRef.current(
            cityOnly
              ? { address: "", city: v, state: "", zip: "", formatted: v }
              : { address: v, city: "", state: "", zip: "", formatted: v },
          );
        }}
        prefix={<MapPin className="h-3.5 w-3.5" />}
        placeholder={effectivePlaceholder}
        className={className}
        wrapperClassName={inputWrapperClassName}
      />
    );
  }

  return (
    <div ref={anchorRef} className={cn("relative", className)}>
      <Input
        value={text}
        onChange={(e) => updateText(e.target.value)}
        onFocus={() => {
          focusedRef.current = true;
          if (list.length) setOpen(true);
        }}
        onBlur={() => {
          focusedRef.current = false;
        }}
        onKeyDown={onKeyDown}
        prefix={<MapPin className="h-3.5 w-3.5" />}
        suffix={
          enableFind ? (
            <button
              type="button"
              onClick={runFind}
              disabled={finding || !text.trim()}
              className="inline-flex h-7 items-center gap-1 rounded-[var(--r-sm)] bg-[color:var(--accent)] px-2.5 text-[11px] font-medium text-white transition-colors hover:bg-[color:var(--accent-ink)] disabled:opacity-40"
            >
              {finding ? (
                <span className="h-3 w-3 rounded-full border-[1.5px] border-current border-t-transparent animate-spin" />
              ) : (
                <Search className="h-3 w-3" />
              )}
              Find
            </button>
          ) : loading ? (
            <span className="h-3.5 w-3.5 rounded-full border-[1.5px] border-current border-t-transparent animate-spin" />
          ) : undefined
        }
        placeholder={effectivePlaceholder}
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
        wrapperClassName={inputWrapperClassName}
      />
      {open &&
        list.length > 0 &&
        rect &&
        typeof document !== "undefined" &&
        createPortal(
          <ul
            ref={popRef}
            style={{ position: "fixed", top: rect.top + 4, left: rect.left, width: rect.width, zIndex: 60 }}
            className="max-h-72 overflow-auto rounded-[var(--r-md)] bg-[color:var(--paper)] hairline shadow-[var(--shadow-md)] py-1"
          >
            {list.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep input focus so the click registers before blur
                    choose(s);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px]",
                    i === active
                      ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]"
                      : "text-[color:var(--ink-soft)] hover:bg-black/[0.03]",
                  )}
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-[color:var(--ink-faint)]" />
                  <span className="truncate">{s.label}</span>
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
