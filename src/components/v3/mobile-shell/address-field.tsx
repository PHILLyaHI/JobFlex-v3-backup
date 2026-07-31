"use client";

// The handheld address field: a normal text input with live Google Places
// suggestions hanging under it.
//
// WHY IT WRAPS RATHER THAN REIMPLEMENTS
//
// blueprint-shell/places-suggest.ts already owns the Places plumbing — session
// tokens, the debounce, fetchFields on pick, the address-component parse — and
// the roof estimator's React PlacesAutocomplete owns the same contract. A third
// implementation would be a third definition of "a picked address". So this
// attaches the existing module to an input we render, and adds nothing but
// handheld styling and a React lifecycle.
//
// NO KEY, NO PROBLEM: attachPlacesSuggest checks isMapsBrowserEnabled() and,
// with no NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY, silently leaves the field a
// plain text input that reports every keystroke as a free-text address. The
// form still works; it just has no suggestions. That path is the reason onPick
// carries `typed` — see the caller contract below.

import { useEffect, useRef } from "react";
import {
  attachPlacesSuggest,
  type PickedPlace,
} from "@/components/v3/blueprint-shell/places-suggest";
import { isMapsBrowserEnabled } from "@/lib/googleMaps";
import styles from "./address-field.module.css";

type Props = {
  value: string;
  /**
   * Every change, whether typed or picked. `place.typed` is true for raw
   * keystrokes — callers should write `place.address` into their field on those
   * and only fill city/state/zip when it is false, or a half-typed street will
   * blank the parts a user already chose.
   */
  onPick: (place: PickedPlace) => void;
  /** Narrow to cities, for regional fields that do not want a street number. */
  cityOnly?: boolean;
  id?: string;
  placeholder?: string;
  /** Draws the 2px frame in danger and marks the input invalid. */
  invalid?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  className?: string;
};

export function AddressField({
  value,
  onPick,
  cityOnly,
  id,
  placeholder = "Start typing an address…",
  invalid,
  inputRef,
  className,
}: Props) {
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;

  // onPick is read through a ref so a caller passing an inline arrow does not
  // tear down and re-attach the Places listener — and its session token — on
  // every render. Re-attaching per keystroke would bill a new session each time.
  const cb = useRef(onPick);
  // Synced in an effect, not during render: a ref write during render is a
  // React lint error and, more to the point, is not guaranteed to have happened
  // by the time a concurrent render commits. The attach effect below reads
  // cb.current only from async Places callbacks, long after this has run.
  useEffect(() => {
    cb.current = onPick;
  }, [onPick]);

  useEffect(() => {
    const el = ref.current;
    // With no key, attach's ONLY behaviour is an input listener that reports
    // typed text — which the controlled onChange below already does. Attaching
    // anyway would fire onPick twice per keystroke, so skip it and let the
    // field be exactly what it degrades to: a plain text input.
    if (!el || !isMapsBrowserEnabled()) return;
    return attachPlacesSuggest(el, {
      cityOnly,
      className: styles.sug,
      onPick: (p) => cb.current(p),
    });
  }, [cityOnly, ref]);

  return (
    <input
      ref={ref}
      id={id}
      type="text"
      inputMode="text"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      className={[styles.in, invalid ? styles.bad : "", className].filter(Boolean).join(" ")}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      value={value}
      onChange={(e) =>
        cb.current({
          address: e.target.value,
          city: "",
          state: "",
          zip: "",
          formatted: e.target.value,
          typed: true,
        })
      }
    />
  );
}
