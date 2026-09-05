// Hire & Work — the board's shared shapes and pure helpers.
//
// The desktop page (hire-content.tsx) and the handheld builds import from
// here, so the rate string, the age label and the search match cannot drift
// between surfaces. Nothing here touches the network: every read and write is
// a server action in src/actions/tradeServices.ts.

import type {
  HireOwnPostDTO,
  HireViewerDTO,
  NetworkJobDTO,
  ReviewSummaryDTO,
} from "@/actions/tradeServices";
import { TRADE_TYPES } from "@/lib/tradeTypes";

/** One post as the board lists it — the poster, their contact, their reviews. */
export type HirePost = NetworkJobDTO;
/** One of the viewer's own posts, as the Work side lists it. */
export type HireOwnPost = HireOwnPostDTO;
export type HireViewer = HireViewerDTO;
export type HireReviews = ReviewSummaryDTO;
export type HireTab = "hire" | "work";

export const TRADES: readonly string[] = TRADE_TYPES;

export const RATE_UNITS = [
  { key: "hour", label: "per hour", short: "/ hr" },
  { key: "day", label: "per day", short: "/ day" },
  { key: "job", label: "per job", short: "/ job" },
] as const;
export type RateUnit = (typeof RATE_UNITS)[number]["key"];

/** What the composer collects. The Specialties chip field was removed on the
 *  owner's call (2026-09-03) — trade, headline and rate already say what a
 *  person does. The field stays on the type because an EDIT has to round-trip
 *  whatever a post was created with, here or at /trade-services. */
export type PostDraft = {
  tradeType: string;
  title: string;
  location: string;
  rateMin: string;
  rateMax: string;
  rateUnit: RateUnit;
  specialties: string[];
  description: string;
};

export const EMPTY_DRAFT: PostDraft = {
  tradeType: "",
  title: "",
  location: "",
  rateMin: "",
  rateMax: "",
  rateUnit: "hour",
  specialties: [],
  description: "",
};

export type ParsedRate = {
  /** "$90–150" — or the string as typed when it did not parse. */
  amount: string;
  unit: RateUnit | null;
  /** Numeric halves when the string parsed; empty otherwise. */
  min: string;
  max: string;
};

const RATE_RE =
  /^\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(?:[–—-]\s*\$?\s*([\d,]+(?:\.\d+)?))?\s*(?:\/|per)?\s*(hour|hr|day|job)?\s*$/i;

/** "$90–150 / hour" → { amount: "$90–150", unit: "hour", min: "90", max: "150" }. */
export function parseRate(budget: string | null | undefined): ParsedRate | null {
  if (!budget || !budget.trim()) return null;
  const m = RATE_RE.exec(budget);
  if (!m || !m[1]) return { amount: budget.trim(), unit: null, min: "", max: "" };
  const w = (m[3] ?? "").toLowerCase();
  const unit: RateUnit | null =
    w === "hour" || w === "hr" ? "hour" : w === "day" ? "day" : w === "job" ? "job" : null;
  return {
    amount: m[2] ? `$${m[1]}–${m[2]}` : `$${m[1]}`,
    unit,
    min: m[1],
    max: m[2] ?? "",
  };
}

export function unitShort(unit: RateUnit | null): string {
  return RATE_UNITS.find((u) => u.key === unit)?.short ?? "";
}

export function unitLabel(unit: RateUnit | null): string {
  return RATE_UNITS.find((u) => u.key === unit)?.label ?? "";
}

/** The stored form — "$90–150 / hour", the same string the older composer
 *  wrote, so /trade-services keeps reading it. Null when no figure was given. */
export function composeRate(min: string, max: string, unit: RateUnit): string | null {
  const a = min.replace(/[^\d.]/g, "");
  const b = max.replace(/[^\d.]/g, "");
  if (!a && !b) return null;
  const span = a && b ? `$${a}–${b}` : `$${a || b}`;
  return `${span} / ${unit}`;
}

export function draftFromPost(p: HireOwnPost): PostDraft {
  const r = parseRate(p.budget);
  return {
    tradeType: p.tradeType,
    title: p.title,
    location: p.location ?? "",
    rateMin: r?.min ?? "",
    rateMax: r?.max ?? "",
    rateUnit: r?.unit ?? "hour",
    specialties: [...p.specialties],
    description: p.description,
  };
}

/** The payload both write actions validate (createInput / updateInput). */
export function draftToInput(d: PostDraft) {
  return {
    title: d.title.trim(),
    description: d.description.trim(),
    tradeType: d.tradeType,
    specialties: d.specialties.map((s) => s.trim()).filter(Boolean),
    location: d.location.trim() || null,
    budget: composeRate(d.rateMin, d.rateMax, d.rateUnit),
  };
}

export function agoLabel(hoursAgo: number): string {
  if (hoursAgo < 1) return "just now";
  if (hoursAgo < 24) return `${hoursAgo}h ago`;
  const d = Math.floor(hoursAgo / 24);
  if (d < 14) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

/** US numbers read as (425) 470-1700; anything else is shown as stored. */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  const n = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (n.length !== 10) return raw;
  return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
}

/** Two letters for the row plate: first and last name, or the first two. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s =
    parts.length >= 2
      ? parts[0][0] + parts[parts.length - 1][0]
      : (parts[0] ?? "").slice(0, 2);
  return s.toUpperCase() || "?";
}

/** Every word of the query must appear somewhere in the post. */
export function matchesQuery(p: HirePost, q: string): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  const hay = [p.postedBy, p.company, p.title, p.tradeType, p.location ?? "", ...p.specialties]
    .join(" ")
    .toLowerCase();
  return n.split(/\s+/).every((w) => hay.includes(w));
}

export const STATUS_LABEL: Record<HireOwnPost["status"], string> = {
  OPEN: "Open",
  FILLED: "Filled",
  CANCELLED: "Cancelled",
};

/** The board row for a post the viewer just wrote — the shape the server would
 *  return on the next load, built here so it lands without a round trip. */
export function ownToBoard(p: HireOwnPost, v: HireViewer): HirePost {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    tradeType: p.tradeType,
    specialties: p.specialties,
    location: p.location ?? null,
    budget: p.budget ?? null,
    hoursAgo: p.hoursAgo,
    company: v.company,
    postedBy: v.name,
    email: v.email,
    phone: v.phone,
    reviews: v.reviews,
    isMine: true,
    isOwnPost: true,
    viewerStatus: null,
    interestedCount: p.interestedCount,
  };
}

/** For a caller that still awaits a THROWING action rather than one of the
 *  `hire*` result wrappers in actions/tradeServices. Prefer the wrappers: Next
 *  redacts a thrown message in a production build, so the sentence the server
 *  wrote is only readable when it is RETURNED. */
export function actionError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  if (!msg || msg.length > 160 || /fetch failed|failed to fetch|network|server components render/i.test(msg)) {
    return fallback;
  }
  return msg;
}
