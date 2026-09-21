// Asking OpenStreetMap's Overpass API inside ONE time budget (2026-09-20,
// owner's decision). The main host answers in 1–2 s when it is well and with a
// 504 after ten when it is not — often enough that a house outline "never
// appeared". So it gets OVERPASS_MAIN_MS, and on a timeout or an error the same
// query goes to the fallback hosts for what is left: about 12 s at the worst.
//
// The fallbacks are asked TOGETHER and the first good answer wins. Forcing the
// main host dead in dev (2026-09-21) showed why one spare is not a plan: the
// single fallback hung for the whole budget three times running while another
// public host answered the same query in 4 s — every public Overpass host has
// bad minutes, and they are not the same minutes.
//
// Lives here, not in the server action that uses it: a "use server" file may
// only export server actions, and this has to be reachable from a check
// (scripts/qa/overpass-fallback.check.ts) with its hosts and its fetch swapped.
import { recordOverpass } from "@/lib/overpassStore";

export const OVERPASS_DEFAULT_HOSTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
export const OVERPASS_MAIN_MS = 5000;
export const OVERPASS_TOTAL_MS = 12000;
/** Not worth opening a connection for less than this. */
const OVERPASS_MIN_MS = 1500;

/** `OVERPASS_HOSTS` (comma-separated) replaces the list for THIS process — how
 *  the fallback is forced in dev without touching any env file. */
export function overpassHosts(): string[] {
  const env = process.env.OVERPASS_HOSTS?.split(",").map((h) => h.trim()).filter(Boolean);
  return env && env.length ? env : OVERPASS_DEFAULT_HOSTS;
}

export interface OverpassAsk<T> {
  data: T | null;
  /** Index of the host that answered, -1 when none did. */
  host: number;
  tookMs: number;
}

export async function askOverpass<T = unknown>(
  query: string,
  opts: {
    hosts?: string[];
    fetchImpl?: typeof fetch;
    /** The tally the health row reads. Swapped out by the check. */
    record?: (outcome: "ok" | "ok-fallback" | "failed") => void | Promise<void>;
    mainMs?: number;
    totalMs?: number;
  } = {},
): Promise<OverpassAsk<T>> {
  const hosts = opts.hosts ?? overpassHosts();
  const doFetch = opts.fetchImpl ?? fetch;
  const record = opts.record ?? recordOverpass;
  const mainMs = opts.mainMs ?? OVERPASS_MAIN_MS;
  const totalMs = opts.totalMs ?? OVERPASS_TOTAL_MS;
  const started = Date.now();
  const left = () => totalMs - (Date.now() - started);
  const minMs = Math.min(OVERPASS_MIN_MS, totalMs / 8);
  const ask = async (host: string, signal: AbortSignal): Promise<T> => {
    const res = await doFetch(host, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Overpass mirrors 406/429 requests without a meaningful UA — required.
        "User-Agent": "JobFlex/3.0 (fence estimator; contact: support@jobflex.app)",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  };
  // 1. the main host, alone, for its share
  if (hosts.length && left() >= minMs) {
    try {
      const data = await ask(hosts[0], AbortSignal.timeout(Math.min(mainMs, left())));
      void record("ok");
      return { data, host: 0, tookMs: Date.now() - started };
    } catch {
      /* timed out, unreachable or not a 200: the fallbacks */
    }
  }
  // 2. every fallback at once, for what is left; the losers are cut off
  const spares = hosts.slice(1);
  if (spares.length && left() >= minMs) {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), left());
    try {
      const won = await Promise.any(spares.map((h, k) => ask(h, stop.signal).then((data) => ({ data, host: k + 1 }))));
      void record("ok-fallback");
      return { ...won, tookMs: Date.now() - started };
    } catch {
      /* none of them */
    } finally {
      clearTimeout(timer);
      stop.abort();
    }
  }
  void record("failed");
  return { data: null, host: -1, tookMs: Date.now() - started };
}
