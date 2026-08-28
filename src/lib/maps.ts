export function isMapsEnabled() {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY);
}

/**
 * How long a Maps request may take. Not a new number: geocodeAddress below has
 * used 8 s since it was written, and it is the same kind of call — one JSON
 * lookup against the same host. The other two had NO ceiling at all, which is
 * how `geocode()` came to sit on the roof-measurement path able to hang
 * forever: buildReconModel geocodes whenever the caller has no coordinates.
 */
const MAPS_TIMEOUT_MS = 8_000;

export function staticMapUrl(
  lat: number,
  lng: number,
  opts?: { zoom?: number; size?: string; mapType?: "satellite" | "hybrid" | "roadmap" },
): string | null {
  if (!isMapsEnabled()) return null;
  const p = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: String(opts?.zoom ?? 20),
    size: opts?.size ?? "640x360",
    maptype: opts?.mapType ?? "satellite",
    scale: "2",
    key: process.env.GOOGLE_MAPS_API_KEY!,
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${p.toString()}`;
}

// Structured geocode for Lead Center matching — joins whatever address parts
// exist and pins them. Best-effort by design: null on disabled / no result /
// network error, and callers fall back to zip or neutral distance scoring.
export async function geocodeAddress(parts: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): Promise<{ lat: number; lng: number } | null> {
  const query = [parts.address, parts.city, parts.state, parts.zip]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ");
  if (!query || !isMapsEnabled()) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("region", "us");
  url.searchParams.set("key", process.env.GOOGLE_MAPS_API_KEY!);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(MAPS_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      results?: { geometry?: { location?: { lat: number; lng: number } } }[];
    };
    const loc = data.results?.[0]?.geometry?.location;
    if (data.status !== "OK" || typeof loc?.lat !== "number" || typeof loc?.lng !== "number") {
      return null;
    }
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
}

// Geocode an address string → lat/lng. Null when maps disabled or geocode failed.
//
// This one is on the roof-measurement path — buildReconModel calls it whenever
// the caller supplied no coordinates — and until 2026-08-28 it had no ceiling
// at all, so a hung request would have held the whole measurement until the
// enclosing deadline killed it with a message about the reconstruction.
export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!isMapsEnabled()) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(MAPS_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: { geometry?: { location?: { lat: number; lng: number } } }[];
    };
    const loc = data.results?.[0]?.geometry?.location;
    return loc ? { lat: loc.lat, lng: loc.lng } : null;
  } catch {
    return null;
  }
}
