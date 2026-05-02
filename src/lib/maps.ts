export function isMapsEnabled() {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY);
}

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
