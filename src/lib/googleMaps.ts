// Browser-only loader for the Google Maps JS SDK, shared by any component that
// needs a real map (the fence draw surface). Mirrors PlacesAutocomplete's loader
// but exposes importLibrary so callers can pull "maps"/"marker" on demand. Guards
// against double-injecting the script when PlacesAutocomplete already loaded it.
const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;

export function isMapsBrowserEnabled(): boolean {
  return Boolean(KEY);
}

let scriptPromise: Promise<void> | null = null;

function ensureScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const existingGoogle = (window as { google?: { maps?: { importLibrary?: unknown } } }).google;
  if (existingGoogle?.maps?.importLibrary) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    // Another loader (e.g. PlacesAutocomplete) may already be fetching the SDK —
    // wait for readiness rather than injecting a second <script> tag.
    const already = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    if (already) {
      const start = Date.now();
      const tick = () => {
        const g = (window as { google?: { maps?: { importLibrary?: unknown } } }).google;
        if (g?.maps?.importLibrary) return resolve();
        if (Date.now() - start > 15000) return reject(new Error("Google Maps load timed out"));
        window.setTimeout(tick, 50);
      };
      tick();
      return;
    }
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&v=weekly&loading=async`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export async function loadMapsLibrary<T = unknown>(lib: "maps" | "marker" | "places" | "core"): Promise<T> {
  await ensureScript();
  const g = (window as unknown as { google: { maps: { importLibrary: (l: string) => Promise<T> } } }).google;
  return g.maps.importLibrary(lib);
}
