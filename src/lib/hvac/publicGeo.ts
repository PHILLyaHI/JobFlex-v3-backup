// Keyless site lookups for the HVAC estimator — the Census Bureau geocoder
// (address → point, county, state, ZIP) and the FCC census-block API (point →
// county). Both are public, free and need no key, so a server without a
// billed Google key still resolves the design day and the footprint. Google
// stays first when it is configured (rooftop precision); these are the
// fallback, and the badges say which answered.
//
// Server-only: import from actions and API routes.

import { externalFetch } from "@/lib/externalCall";

const TIMEOUT_MS = 9_000;

export interface PublicGeocode {
  lat: number;
  lng: number;
  county?: string;
  state?: string;
  city?: string;
  zip?: string;
  /** The address the geocoder matched, its spelling. */
  matched?: string;
}

/** Census Bureau geocoder, "geographies/onelineaddress": one call answers the
 *  point and the county. US addresses only; null when nothing matched. */
export async function censusGeocode(address: string): Promise<PublicGeocode | null> {
  const q = address.trim();
  if (!q) return null;
  const url = `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encodeURIComponent(q)}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
  try {
    const res = await externalFetch("census", "geocode", url, { headers: { Accept: "application/json" } }, { timeoutMs: TIMEOUT_MS, attempts: 2 });
    const data = (await res.json()) as {
      result?: {
        addressMatches?: Array<{
          matchedAddress?: string;
          coordinates?: { x: number; y: number };
          addressComponents?: { state?: string; zip?: string; city?: string };
          geographies?: Record<string, Array<{ NAME?: string; BASENAME?: string }>>;
        }>;
      };
    };
    const hit = data.result?.addressMatches?.[0];
    if (!hit?.coordinates) return null;
    const county = hit.geographies?.Counties?.[0];
    return {
      lat: hit.coordinates.y,
      lng: hit.coordinates.x,
      county: county?.NAME ?? county?.BASENAME,
      state: hit.addressComponents?.state,
      city: hit.addressComponents?.city,
      zip: hit.addressComponents?.zip,
      matched: hit.matchedAddress,
    };
  } catch {
    return null;
  }
}

/** FCC census-block lookup: the county and state a point sits in. */
export async function countyAtPoint(lat: number, lng: number): Promise<{ county: string; state: string } | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const url = `https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lng}&format=json`;
  try {
    const res = await externalFetch("fcc", "block", url, { headers: { Accept: "application/json" } }, { timeoutMs: TIMEOUT_MS, attempts: 2 });
    const data = (await res.json()) as { County?: { name?: string }; State?: { code?: string } };
    if (!data.County?.name || !data.State?.code) return null;
    return { county: data.County.name, state: data.State.code };
  } catch {
    return null;
  }
}

const STATE_BY_NAME: Record<string, string> = { alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY" };

/** OpenStreetMap's Nominatim, the third geocoder in line (Google when keyed,
 *  the Census Bureau, then this): keyless, one request a second, answers the
 *  point and the county. Used only when the Census geocoder is down, which
 *  it was for a stretch on 2026-09-16. */
export async function nominatimGeocode(address: string): Promise<PublicGeocode | null> {
  const q = address.trim();
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&countrycodes=us&limit=1`;
  try {
    const res = await externalFetch("nominatim", "geocode", url, { headers: { Accept: "application/json", "User-Agent": "JobFlex/1.0 (+https://jobflex.app)" } }, { timeoutMs: TIMEOUT_MS, attempts: 1 });
    const data = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string; address?: Record<string, string> }>;
    const hit = data?.[0];
    if (!hit?.lat || !hit.lon) return null;
    const a = hit.address ?? {};
    const iso = a["ISO3166-2-lvl4"];
    const state = iso && /^US-[A-Z]{2}$/.test(iso) ? iso.slice(3) : a.state ? STATE_BY_NAME[a.state.toLowerCase()] : undefined;
    return { lat: Number(hit.lat), lng: Number(hit.lon), county: a.county, state, city: a.city ?? a.town ?? a.village, zip: a.postcode, matched: hit.display_name };
  } catch {
    return null;
  }
}
