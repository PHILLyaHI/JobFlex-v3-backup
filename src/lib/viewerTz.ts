import { cookies } from "next/headers";

// The viewer's IANA timezone, set client-side as a `tz` cookie on the calendar.
// Recurring unavailability is authored and displayed in the viewer's local
// wall-clock (same as every calendar event), so expansion/conflict math must
// use the SAME zone — not the server's tz and not the org default, which is
// frequently left at its "America/New_York" seed while the crew works
// elsewhere. Falls back to the passed value (org timezone), then a sane default.
export async function viewerTimeZone(fallback?: string | null): Promise<string> {
  try {
    const tz = (await cookies()).get("tz")?.value;
    // Accept only plausible IANA names (Area/Location) to keep it out of Intl.
    if (tz && /^[A-Za-z]+\/[A-Za-z0-9_+\-]+$/.test(tz)) return tz;
  } catch {
    /* cookies() unavailable (e.g. static context) — fall through */
  }
  return fallback || "America/New_York";
}
