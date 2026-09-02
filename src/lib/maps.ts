export function isMapsEnabled() {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY);
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
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
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
export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!isMapsEnabled()) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
  try {
    const res = await fetch(url);
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
