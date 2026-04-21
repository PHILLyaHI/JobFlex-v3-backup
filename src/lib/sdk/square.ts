import { IntegrationDisabledError } from "./base";

export function isSquareEnabled() {
  return Boolean(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID);
}

export async function getSquare() {
  if (!isSquareEnabled()) {
    throw new IntegrationDisabledError("Square", "SQUARE_ACCESS_TOKEN");
  }
  // Dynamic import: the `square` package has heavy deps we don't need at module load.
  const { Client, Environment } = await import("square");
  return new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN!,
    environment:
      process.env.SQUARE_ENV === "production" ? Environment.Production : Environment.Sandbox,
  });
}

export const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;
