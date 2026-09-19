// The filing cookie's name and lifetime, shared by the server reader
// (lib/filingContext) and the browser writer (the estimator picker and the
// filing chip). Constants only — safe to import on either side.

export const FILING_COOKIE = "jf_file_to";
/** An estimate started three hours ago under a project is still that project's. */
export const FILING_MAX_AGE_S = 3 * 60 * 60;
/** Fired on window whenever the browser writes or clears the filing. */
export const FILING_CHANGED_EVENT = "jf:filing-changed";

/** What the picker records. The names are for the chip; only the ids are trusted, server-side. */
export type Filing = {
  clientId?: string | null;
  clientName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
};

export function writeFiling(f: Filing): void {
  if (typeof document === "undefined") return;
  if (!f.clientId && !f.projectId) return clearFiling();
  const value = encodeURIComponent(JSON.stringify(f));
  document.cookie = `${FILING_COOKIE}=${value}; path=/; max-age=${FILING_MAX_AGE_S}; samesite=lax`;
  window.dispatchEvent(new Event(FILING_CHANGED_EVENT));
}

export function clearFiling(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${FILING_COOKIE}=; path=/; max-age=0; samesite=lax`;
  window.dispatchEvent(new Event(FILING_CHANGED_EVENT));
}

export function readFiling(): Filing | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(FILING_COOKIE + "="));
  if (!hit) return null;
  try {
    const f = JSON.parse(decodeURIComponent(hit.slice(FILING_COOKIE.length + 1))) as Filing;
    return f.clientId || f.projectId ? f : null;
  } catch {
    return null;
  }
}
