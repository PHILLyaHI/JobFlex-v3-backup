/** Server configuration only: the UI keeps one measurement action. */
export function roofMeasurementProvider(): "google" | "eagleview" {
  // Temporary default while EagleView roof-area access is unavailable.
  // Restoring EagleView needs only this server env setting, not a UI change.
  return process.env.ROOF_MEASUREMENT_PROVIDER === "eagleview" ? "eagleview" : "google";
}

export function isRoofMeasurementEnabled(): boolean {
  const google = Boolean(process.env.GOOGLE_MAPS_API_KEY);
  return roofMeasurementProvider() === "google"
    ? google
    : google || Boolean(process.env.EAGLEVIEW_CLIENT_ID && process.env.EAGLEVIEW_CLIENT_SECRET);
}
