// THE PROPOSAL, READ ALOUD (2026-09-23) — pure: no server, no DB, no model.
//
// Owner: a client should be able to listen to the summary of a proposal and
// its totals while driving — a roof, fence or HVAC estimate and a Smart
// Proposal alike — and the contractor should have the same "listen" on the
// proposal's line. This module writes the words. It is a fixed template, NOT
// a model: a proposal is a money document, and the audio must say exactly
// the numbers the page shows.
//
// Written for a windshield, not a screen: one pass, no scrollback, about
// forty seconds (owner, 2026-09-24: "just brief about the estimate and
// totals"). Six short paragraphs, and the voice pauses between them:
//   1. who it is from, and what this is
//   2. which house, and the job in one breath — the title and one sentence
//   3. the main items, named
//   4. the total with the tax — then a discount, the contract total
//   5. how the payment is split, and how long the price holds
//   6. what to do: call, or open the link when parked
// Deliberately NOT spoken: every line, item prices, the terms, the full
// scope. That is what the link is for.
//
// The hash of the script is the audio cache key (lib/proposalAudio): the MP3
// is made again only when these words change — a price edit, a discount, an
// approved change order. Cosmetic rewording invalidates every cached file at
// once; keep the output stable.

import { contractTotal } from "@/lib/contractTotal";

/** OpenAI's speech endpoint rejects inputs past 4096 characters. */
export const MAX_SPEECH_CHARS = 4000;
/** Spoken words per second the length promise is estimated from. */
const WORDS_PER_SECOND = 2.6;
/** How many of the biggest items are read with their prices. */
const TOP_ITEMS = 3;
/** The scope's opening is read up to about this many characters. */
const SUMMARY_CHARS = 300;

export type SpeechLine = { name: string; quantity: number; measurementType: string | null; total: number };
export type SpeechInstallment = {
  label: string;
  amount: number;
  isPercent: boolean;
  status?: string | null;
  paidAmount?: number | null;
};

export type SpeechInput = {
  /** "roof" / "roofing", "fence" / "fencing", "hvac", "general", or null. */
  trade: string | null;
  title: string;
  status: string;
  clientName: string | null;
  orgName: string | null;
  orgPhone: string | null;
  /** The job address, else the client's. */
  address: string | null;
  description: string | null;
  scopeOfWork: string | null;
  /** The builder's "Show to client": a hidden scope is not read either. */
  showScope: boolean;
  lineItems: SpeechLine[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  /** The contract value with approved change orders; null when it is the total. */
  contractTotal?: number | null;
  validUntil: Date | string | null;
  installments: SpeechInstallment[];
  /** For tests: the day the script is written on. */
  now?: Date;
};

/** The proposal row as the portal and the audio route load it. */
export type SpeechRowLike = {
  trade: string | null;
  title: string;
  status: string;
  address: string | null;
  description: string | null;
  scopeOfWork: string | null;
  showScope: boolean;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  validUntil: Date | null;
  client: { name: string | null; address?: string | null } | null;
  organization: { name: string | null; phone: string | null };
  lineItems: Array<{ name: string; quantity: number; measurementType: string | null; total: number }>;
  installments: Array<{ label: string; amount: number; isPercent: boolean; status?: string | null; paidAmount?: number | null }>;
  changeOrders?: Array<{ status: string; total: number | null }>;
};

export function speechInputFromRow(row: SpeechRowLike): SpeechInput {
  const contract = row.changeOrders?.length ? contractTotal(row.total, row.changeOrders) : row.total;
  return {
    trade: row.trade,
    title: row.title,
    status: row.status,
    clientName: row.client?.name ?? null,
    orgName: row.organization.name,
    orgPhone: row.organization.phone,
    address: row.address?.trim() || row.client?.address?.trim() || null,
    description: row.description,
    scopeOfWork: row.scopeOfWork,
    showScope: row.showScope,
    lineItems: row.lineItems.map((l) => ({ name: l.name, quantity: l.quantity, measurementType: l.measurementType, total: l.total })),
    subtotal: row.subtotal,
    discountTotal: row.discountTotal,
    taxTotal: row.taxTotal,
    total: row.total,
    contractTotal: Math.abs(contract - row.total) >= 0.005 ? contract : null,
    validUntil: row.validUntil,
    installments: row.installments.map((i) => ({ label: i.label, amount: i.amount, isPercent: i.isPercent, status: i.status ?? null, paidAmount: i.paidAmount ?? null })),
  };
}

/** "roofing", "fence", "HVAC", or "" for everything else. */
export function tradeWord(trade: string | null | undefined): string {
  const t = (trade ?? "").trim().toLowerCase();
  if (t.startsWith("roof")) return "roofing";
  if (t.startsWith("fenc")) return "fence";
  if (t === "hvac") return "HVAC";
  return "";
}

/** "$12,450", "$1,234.50", "minus $200". Whole dollars unless cents matter. */
export function spokenMoney(n: number): string {
  const v = Math.round(n * 100) / 100;
  const whole = Math.trunc(Math.abs(v));
  const cents = Math.round((Math.abs(v) - whole) * 100);
  const dollars = whole.toLocaleString("en-US");
  const sign = v < 0 ? "minus " : "";
  return cents ? `${sign}$${dollars}.${String(cents).padStart(2, "0")}` : `${sign}$${dollars}`;
}

/** "24", "1,250", "12.5" — never a long tail of decimals. */
export function spokenQuantity(q: number): string {
  if (!Number.isFinite(q)) return "";
  const r = Math.round(q * 10) / 10;
  return r.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/** The unit a line is measured in, as a word; "" when the count stands alone. */
export function spokenUnit(t: string | null | undefined, qty: number): string {
  const key = (t ?? "").trim().toUpperCase().replace(/[\s.-]+/g, "_");
  const one = qty === 1;
  switch (key) {
    case "SQFT": case "SQ_FT": case "SQUARE_FEET": case "SQUARE_FOOT": case "SF":
      return one ? "square foot" : "square feet";
    case "SQUARE": case "SQ": case "SQUARES":
      return one ? "square" : "squares";
    case "LINEAR_FT": case "LF": case "LINEAR_FEET": case "LN_FT": case "LINEAR_FOOT":
      return one ? "linear foot" : "linear feet";
    case "CUBIC_FT": case "CUBIC_FEET": case "CF":
      return one ? "cubic foot" : "cubic feet";
    case "CUBIC_YD": case "CUBIC_YARD": case "CY":
      return one ? "cubic yard" : "cubic yards";
    case "HOUR": case "HR": case "HOURS":
      return one ? "hour" : "hours";
    case "DAY": case "DAYS":
      return one ? "day" : "days";
    case "TON": case "TONS":
      return one ? "ton" : "tons";
    case "LB": case "LBS": case "POUND":
      return one ? "pound" : "pounds";
    case "GAL": case "GALLON":
      return one ? "gallon" : "gallons";
    case "BUNDLE": return one ? "bundle" : "bundles";
    case "ROLL": return one ? "roll" : "rolls";
    case "SHEET": return one ? "sheet" : "sheets";
    case "BAG": return one ? "bag" : "bags";
    case "UNIT": case "EA": case "EACH": case "PC": case "PCS": case "PIECE": case "LUMP_SUM": case "LOT": case "":
      return "";
    default:
      return key.toLowerCase().replace(/_/g, " ");
  }
}

/**
 * Contractor copy is written for the eye — 2"×4" rails, 6' cedar, 24 sq ft,
 * #1 grade, "Best — stained & sealed". Inch marks, ×, dashes and ampersands
 * come out as garbage or silence in a voice; rewrite them as speech.
 */
export function spokenText(s: string): string {
  return s
    // A parenthetical is a detail for the eye — "(Mitsubishi SUZ-AK12NLHZ)",
    // "(EPA 608)" — and ten seconds of letters in a forty-second brief.
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/(\d)\s*["″]\s*[×x]\s*(\d+)\s*["″]/g, "$1 by $2 inch")
    .replace(/(\d)\s*['′]\s*[×x]\s*(\d+)\s*['′]/g, "$1 by $2 foot")
    .replace(/(\d)\s*[×x]\s*(\d)/g, "$1 by $2")
    .replace(/(\d)\s*["″]/g, "$1 inch")
    .replace(/(\d)\s*['′](?![a-z])/gi, "$1 foot")
    .replace(/\b(\d[\d,.]*)\s*sq\.?\s*ft\b\.?/gi, "$1 square feet")
    .replace(/\b(\d[\d,.]*)\s*(lf|lin\.?\s*ft|ln\.?\s*ft)\b\.?/gi, "$1 linear feet")
    .replace(/\bsq\.?\s*ft\b\.?/gi, "square feet")
    .replace(/\b(lf|lin\.?\s*ft|ln\.?\s*ft)\b\.?/gi, "linear feet")
    .replace(/\bsq\b\.?(?=\s|$)/gi, "square")
    .replace(/\bft\b\.?/gi, "feet")
    .replace(/#\s*(\d)/g, "number $1")
    .replace(/(\d)\s*%/g, "$1 percent")
    .replace(/×/g, " by ")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s+\/\s+/g, ", ")
    .replace(/[•·]/g, ", ")
    .replace(/^[\s,]+/, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A phone number a voice can dictate: "(206) 555-0100" read as digits in
 * three groups, at a pace someone can repeat back or dial at a light.
 */
export function spokenPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return raw.trim();
  const say = (s: string) => s.split("").join(" ");
  return `${say(local.slice(0, 3))}, ${say(local.slice(3, 6))}, ${say(local.slice(6))}`;
}

/** The street line only — enough to confirm which house, without the ZIP. */
export function spokenAddress(raw: string): string {
  return raw.split(/,|\n/)[0]?.trim() ?? "";
}

/** "October 15", or "October 15, 2027" when it is not this year. */
export function spokenDate(d: Date | string, now: Date): string {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const sameYear = date.getUTCFullYear() === now.getUTCFullYear();
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC", ...(sameYear ? {} : { year: "numeric" }) });
}

/** "about 30 seconds" / "about a minute" / "about 2 minutes". */
export function spokenDuration(words: number): string {
  const secs = words / WORDS_PER_SECOND;
  if (secs < 50) return `about ${Math.max(15, Math.round(secs / 15) * 15)} seconds`;
  if (secs < 80) return "about a minute";
  if (secs < 105) return "about a minute and a half";
  return `about ${Math.round(secs / 60)} minutes`;
}

/** Seconds a script takes to read, for the player's label. */
export function speechSeconds(script: string): number {
  const words = script.split(/\s+/).filter(Boolean).length;
  return Math.max(10, Math.round(words / WORDS_PER_SECOND));
}

/**
 * The opening of a scope or description, whole sentences up to about
 * SUMMARY_CHARS. Bullets and the fence package's "Please note:" block are
 * left for the page; a single very long sentence is cut at a comma.
 */
/** The sentences of a scope or description, bullets stripped, the fence
 *  package's "Please note:" block and everything under it left on the page. */
function sentencesOf(text: string | null | undefined): string[] {
  return (text ?? "")
    .replace(/\r/g, "")
    .replace(/\bplease note:?[\s\S]*$/i, "")
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•·]\s*/, "").trim())
    .filter(Boolean)
    .join(" ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function openingSentences(text: string | null | undefined, max = SUMMARY_CHARS): string {
  const sentences = sentencesOf(text);
  const out: string[] = [];
  let len = 0;
  for (const s of sentences) {
    if (out.length && len + s.length + 1 > max) break;
    out.push(s);
    len += s.length + 1;
    if (len >= max) break;
  }
  let summary = out.join(" ");
  if (summary.length > max + 80) {
    const cut = summary.lastIndexOf(",", max);
    summary = (cut > max / 2 ? summary.slice(0, cut) : summary.slice(0, max)).trim();
    if (!/[.!?]$/.test(summary)) summary += ".";
  }
  return summary;
}

function endsSentence(s: string): string {
  const t = s.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function installmentDollars(it: SpeechInstallment, total: number): number {
  return Math.round((it.isPercent ? (total * it.amount) / 100 : it.amount) * 100) / 100;
}

/** The first sentence of a scope, cut at a clause when it runs long. */
export function briefSentence(text: string | null | undefined, max = 140): string {
  const first = sentencesOf(text)[0] ?? "";
  if (first.length <= max) return first;
  const cut = Math.max(first.lastIndexOf(",", max), first.lastIndexOf(";", max), first.lastIndexOf(" and ", max), first.lastIndexOf(" with ", max));
  const short = (cut > max / 2 ? first.slice(0, cut) : first.slice(0, max)).trim();
  return /[.!?]$/.test(short) ? short : `${short}.`;
}

/** "Fence materials · #1 tight-knot cedar" → "Fence materials". */
export function shortName(name: string): string {
  return name.split(/\s+[·—–|]\s+/)[0]?.trim() || name.trim();
}

/**
 * "Mitsubishi SUZ-AK12NLHZ" → "Mitsubishi": a model number read letter by
 * letter is ten seconds of noise in a forty-second brief. A name that is
 * nothing but a model number is kept as it is.
 */
export function spokenItemName(name: string): string {
  const words = shortName(name).split(/\s+/);
  const kept = words.filter((w) => {
    const core = w.replace(/[,;:.]+$/, "");
    return !(/^[A-Z0-9][A-Z0-9/-]{4,}$/.test(core) && /[A-Z]/.test(core) && /\d/.test(core));
  });
  return (kept.length ? kept.join(" ") : words.join(" ")).replace(/[,;:]+$/, "").trim();
}

/** The address as written in a sentence, cut back to its street line. */
function withoutAddressTail(text: string, address: string | null): string {
  if (!address) return text;
  const parts = address.split(/,|\n/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return text;
  const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tail = new RegExp(`(${esc(parts[0])})[,\\s]+${parts.slice(1).map(esc).join("[,\\s]+")}`, "i");
  return text.replace(tail, "$1");
}

/** "Tear-off" → "tear-off"; "HVAC tune-up" stays. */
function lowerFirst(s: string): string {
  return s.length > 1 && s[1] === s[1].toLowerCase() && s[1] !== s[1].toUpperCase() ? s[0].toLowerCase() + s.slice(1) : s;
}

function andList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/**
 * The spoken script for one proposal — about forty seconds, in paragraphs
 * the voice pauses between. Deterministic for the same input.
 */
export function buildProposalSpeech(input: SpeechInput): string {
  const now = input.now ?? new Date();
  const typed = (input.clientName ?? "").trim().split(/\s+/)[0] ?? "";
  const first = typed ? typed[0].toUpperCase() + typed.slice(1) : "there";
  const org = (input.orgName ?? "").trim() || "your contractor";
  const trade = tradeWord(input.trade);
  const status = input.status.toUpperCase();
  const paragraphs: string[] = [];

  /* ---- 1. who, and what this is ---- */
  paragraphs.push(`Hi ${first}, this is ${org} with a quick summary of your ${trade ? `${trade} ` : ""}proposal.`);

  /* ---- 2. the job in one breath: the house, the title, one sentence of the scope ---- */
  const street = input.address ? spokenAddress(input.address) : "";
  const title = spokenText(withoutAddressTail(input.title.trim(), input.address));
  const summary = briefSentence(withoutAddressTail(input.showScope && input.scopeOfWork?.trim() ? input.scopeOfWork ?? "" : input.description ?? "", input.address));
  // A title that already names the street ("Heat pump replacement — 97th Dr
  // NE") is not introduced with the street a second time.
  const titleSaysStreet = Boolean(street) && title.toLowerCase().includes(street.toLowerCase());
  const job: string[] = [];
  if (title) job.push(street && !titleSaysStreet ? `It's for ${street}: ${endsSentence(lowerFirst(title))}` : `The job: ${endsSentence(title)}`);
  else if (street) job.push(`It's for ${street}.`);
  if (summary && summary.toLowerCase() !== title.toLowerCase()) job.push(endsSentence(spokenText(summary)));
  if (job.length) paragraphs.push(job.join(" "));

  /* ---- 3. the main items, named ---- */
  const priced = input.lineItems.filter((l) => l.name.trim() && Number.isFinite(l.total) && l.total > 0);
  if (priced.length) {
    const names = [...priced].sort((a, b) => b.total - a.total).map((l) => lowerFirst(spokenText(spokenItemName(l.name))));
    const top = names.filter((n, i) => n && names.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i).slice(0, TOP_ITEMS);
    paragraphs.push(priced.length <= TOP_ITEMS ? `It covers ${andList(top)}.` : `It covers ${priced.length} items; the main ones are ${andList(top)}.`);
  }

  /* ---- 4. the money ---- */
  const money: string[] = [];
  if (input.total > 0) {
    money.push(`Your total comes to ${spokenMoney(input.total)}${input.taxTotal > 0 ? `, including ${spokenMoney(input.taxTotal)} in sales tax` : ""}.`);
  }
  if (input.discountTotal > 0) money.push(`A ${spokenMoney(input.discountTotal)} discount is already in that price.`);
  const contract = input.contractTotal != null && Math.abs(input.contractTotal - input.total) >= 0.005 ? input.contractTotal : null;
  if (contract != null) money.push(`With the approved change orders, the contract total is ${spokenMoney(contract)}.`);
  if (money.length) paragraphs.push(money.join(" "));
  const owedOn = contract ?? input.total;

  /* ---- 5. the payment, and how long the price holds ---- */
  const pay: string[] = [];
  const stages = input.installments.filter((i) => i.label.trim());
  const dollars = (it: SpeechInstallment) => spokenMoney(installmentDollars(it, input.total));
  const label = (it: SpeechInstallment) => lowerFirst(spokenText(it.label));
  if (stages.length === 1) pay.push(`Payment: ${label(stages[0])}, ${dollars(stages[0])}.`);
  else if (stages.length === 2) pay.push(`Payment is in two steps: ${label(stages[0])}, ${dollars(stages[0])}, then ${label(stages[1])}, ${dollars(stages[1])}.`);
  else if (stages.length > 2) pay.push(`Payment is in ${stages.length} steps, starting with ${label(stages[0])}, ${dollars(stages[0])}.`);
  const paid = stages
    .filter((i) => (i.status ?? "").toUpperCase() === "PAID")
    .reduce((s, i) => s + (i.paidAmount ?? installmentDollars(i, input.total)), 0);
  if (paid > 0) {
    const owed = Math.max(0, Math.round((owedOn - paid) * 100) / 100);
    pay.push(owed > 0 ? `${spokenMoney(paid)} has been paid so far; ${spokenMoney(owed)} is still due.` : `It is paid in full. Thank you.`);
  }
  if (input.validUntil) {
    const until = new Date(input.validUntil);
    const when = spokenDate(until, now);
    if (when) {
      pay.push(
        until.getTime() < now.getTime() - 86_400_000
          ? `The price was quoted through ${when}, so please call to confirm it still stands.`
          : `This price is good through ${when}.`,
      );
    }
  }
  if (pay.length) paragraphs.push(pay.join(" "));

  /* ---- 6. what to do, hands on the wheel ---- */
  const close: string[] = [];
  const phone = (input.orgPhone ?? "").trim();
  if (phone) close.push(`Questions? Call us at ${spokenPhone(phone)}.`);
  if (status === "PAID") close.push("This proposal is accepted and paid in full. Thank you!");
  else if (status === "ACCEPTED" || status === "COMPLETED") close.push("You've already accepted this proposal. Thank you!");
  else if (status === "DECLINED") close.push("This proposal is marked as declined. If you'd like to revisit it, just call.");
  else close.push("When you're parked, open the link to see every line and accept online.");
  paragraphs.push(close.join(" "));

  let script = paragraphs.map((p) => spokenText(p)).filter(Boolean).join("\n\n");
  if (script.length > MAX_SPEECH_CHARS) {
    const cut = script.lastIndexOf(". ", MAX_SPEECH_CHARS);
    script = cut > 0 ? script.slice(0, cut + 1) : script.slice(0, MAX_SPEECH_CHARS);
  }
  return script;
}

/**
 * FNV-1a 64-bit hash of the script — the audio cache key on the proposal
 * row. Pure JS, so this module stays importable from the browser and tests.
 */
export function speechHash(script: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < script.length; i++) {
    h ^= BigInt(script.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, "0");
}

/** The script split into sentences, for a device voice that reads one at a time. */
export function speechSentences(script: string): string[] {
  return script
    .split(/(?<=[.!?;])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
