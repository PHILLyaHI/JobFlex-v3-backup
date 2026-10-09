/** Server-assigned signup experiment. Existing intents without an offer keep seven days. */
export const TRIAL_EXPERIMENT = "signup_trial_length_v1";
export const TRIAL_OFFER_COOKIE = "jf_trial_offer_v1";
export const TRIAL_OFFER_MAX_AGE = 30 * 24 * 60 * 60;
export type TrialOffer = { variant: "a" | "b"; days: 3 | 7 };
export const LEGACY_TRIAL_OFFER: TrialOffer = { variant: "b", days: 7 };

export function trialOfferFor(value: unknown): TrialOffer {
  return value === "a" ? { variant: "a", days: 3 } : { ...LEGACY_TRIAL_OFFER };
}

/** Only previously validated, stored terms enter billing; no arbitrary client duration. */
export function storedTrialOffer(value?: TrialOffer | null): TrialOffer {
  return value?.variant === "a" && value.days === 3 ? trialOfferFor("a") : trialOfferFor("b");
}

export function trialOfferMetadata(offer?: TrialOffer | null): Record<string, string> {
  const terms = storedTrialOffer(offer);
  return { trial_days: String(terms.days), trial_variant: terms.variant,
    ...(offer ? { trial_experiment: TRIAL_EXPERIMENT } : {}) };
}
