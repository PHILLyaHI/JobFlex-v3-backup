// Browser-only loader for the Google Maps JS SDK, shared by any component that
// needs a real map (the fence draw surface). Mirrors PlacesAutocomplete's loader
// but exposes importLibrary so callers can pull "maps"/"marker" on demand. Guards
// against double-injecting the script when PlacesAutocomplete already loaded it.
const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;

export function isMapsBrowserEnabled(): boolean {
  return Boolean(KEY);
}

let scriptPromise: Promise<void> | null = null;

// importLibrary is the readiness signal. With loading=async the bootstrap defines
// it a tick AFTER the loader script's onload fires, so we must poll for the
// function itself rather than trust onload (or a mere `google.maps` object).
function mapsReady(): boolean {
  const g = (window as { google?: { maps?: { importLibrary?: unknown } } }).google;
  return typeof g?.maps?.importLibrary === "function";
}

function ensureScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (mapsReady()) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    // Inject the modern bootstrap once. Another loader (e.g. PlacesAutocomplete)
    // may already have added the tag — in that case just wait for readiness rather
    // than injecting a second <script>.
    if (!document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]')) {
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&v=weekly&loading=async`;
      s.async = true;
      s.onerror = () => {
        scriptPromise = null; // allow a later retry
        reject(new Error("Failed to load Google Maps"));
      };
      document.head.appendChild(s);
    }
    // Resolve only once importLibrary is actually callable.
    const start = Date.now();
    const tick = () => {
      if (mapsReady()) return resolve();
      if (Date.now() - start > 15000) {
        scriptPromise = null; // don't wedge future callers — let them retry
        return reject(new Error("Google Maps load timed out"));
      }
      window.setTimeout(tick, 50);
    };
    tick();
  });
  return scriptPromise;
}

export async function loadMapsLibrary<T = unknown>(lib: "maps" | "marker" | "places" | "core"): Promise<T> {
  await ensureScript();
  const g = (window as unknown as { google: { maps: { importLibrary: (l: string) => Promise<T> } } }).google;
  return g.maps.importLibrary(lib);
}
