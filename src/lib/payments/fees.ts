// JobFlex's cut of contractor payments. PLATFORM_FEE_BPS, basis points
// (100 = 1%), clamped to a sane band so a typo cannot charge 100%.
export function platformFeeBps(): number {
  const raw = Number.parseInt(process.env.PLATFORM_FEE_BPS ?? "100", 10);
  if (!Number.isFinite(raw)) return 100;
  return Math.min(2000, Math.max(0, raw));
}

export function platformFeePct(): number {
  return platformFeeBps() / 100;
}

/** Country the platform's own Square/Stripe accounts live in (app-fee rule). */
export function platformCountry(): string {
  return (process.env.PLATFORM_COUNTRY ?? "US").toUpperCase();
}
