// Stax is available for owners to connect with their own merchant API key.
// Clients still need an enabled, active, currency-compatible connection.
// Keep an explicit operator kill switch without hiding the integration by default.
export function isStaxRailLive(): boolean {
  return process.env.PAYMENTS_STAX_LIVE !== "false";
}
