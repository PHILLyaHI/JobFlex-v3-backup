import Stripe from "stripe";
import { IntegrationDisabledError } from "./base";

let client: Stripe | null = null;

export function isStripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new IntegrationDisabledError("Stripe", "STRIPE_SECRET_KEY");
  }
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
    });
  }
  return client;
}
