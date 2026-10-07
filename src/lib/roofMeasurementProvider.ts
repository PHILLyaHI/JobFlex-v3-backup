/** Server configuration only: the UI keeps one measurement action. */
export function roofMeasurementProvider(): "google" | "eagleview" {
  // EagleView by default — roof-area orders are accepted again (2026-10-07,
  // order 9360834c). Google only when this server env setting says so
  // explicitly; no UI change either way.
  return process.env.ROOF_MEASUREMENT_PROVIDER === "google" ? "google" : "eagleview";
}

export function isRoofMeasurementEnabled(): boolean {
  const google = Boolean(process.env.GOOGLE_MAPS_API_KEY);
  return roofMeasurementProvider() === "google"
    ? google
    : google || Boolean(process.env.EAGLEVIEW_CLIENT_ID && process.env.EAGLEVIEW_CLIENT_SECRET);
}
