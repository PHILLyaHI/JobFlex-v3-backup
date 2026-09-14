// Defensive readers for the JSON-as-String columns on ChangeOrder. Bad or
// legacy data degrades to [] — the same convention as parseProposalPhotos.
import type { CoLine } from "./types";

export interface CoPhoto {
  id: string;
  url: string;
  caption?: string;
}

export function parseCoLines(raw: string | null | undefined): CoLine[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (l): l is CoLine =>
        Boolean(l) && typeof l.name === "string" && typeof l.quantity === "number" && typeof l.unitPrice === "number" && typeof l.unit === "string",
    );
  } catch {
    return [];
  }
}

export function parseCoPhotos(raw: string | null | undefined): CoPhoto[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((p): p is CoPhoto => Boolean(p) && typeof p.id === "string" && typeof p.url === "string" && /^https:\/\//.test(p.url));
  } catch {
    return [];
  }
}
