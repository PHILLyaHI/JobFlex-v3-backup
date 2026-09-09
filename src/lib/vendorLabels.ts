// The measurement provider as the USER sees it — one place, vendor-neutral
// (owner's call 2026-09-09). Code, env names, logs, table and file names keep
// the vendor's name; everything a contractor or a homeowner reads says
// "aerial data". Client-safe: constants only.
export const AERIAL = {
  /** The provider, as a noun: "Aerial data (calibrated): 23.3 squares". */
  vendor: "Aerial data",
  /** The Details card's subtitle. */
  property: "Aerial property data",
  /** Eave heights come in 10 ft classes, not as a measurement. */
  eave: "Aerial data · 10 ft classes",
  /** The provider's own pitch figure, as opposed to our measured one. */
  reported: "reported",
  /** The orthophoto tab and its caption ("Aerial ortho · Jul 2025"). */
  ortho: "Aerial ortho",
  /** The line under the hero naming what the answer contains. */
  coverage: "Data coverage",
} as const;
