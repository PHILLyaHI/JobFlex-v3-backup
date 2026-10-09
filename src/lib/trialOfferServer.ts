import "server-only";
import { cookies } from "next/headers";
import { trialOfferFor, TRIAL_OFFER_COOKIE } from "./trialOffer";

export async function signupTrialOffer() {
  return trialOfferFor((await cookies()).get(TRIAL_OFFER_COOKIE)?.value);
}
