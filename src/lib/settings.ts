// Pure settings model: types, defaults, and parse helpers for the org-level
// settings pages (payment / leads / gmail / meta). Each settings group is stored
// as one JSON-as-String column on Organization. This module has NO "use server"
// and NO db import, so it is safe to import from both server pages (to hydrate
// initial values) and the settings server actions (to validate before writing).

function safeParse(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ── Payment ──────────────────────────────────────────────────────────────────
export interface PaymentSettings {
  stripe: boolean;
  square: boolean;
  paypal: boolean;
  ach: boolean;
  autoRemind: boolean;
  lateFees: boolean;
  receiptsOnPayment: boolean;
  currency: string;
  depositPct: number;
  netTerms: string;
  lateFeePct: string;
}
export const PAYMENT_DEFAULTS: PaymentSettings = {
  stripe: true,
  square: false,
  paypal: false,
  ach: true,
  autoRemind: true,
  lateFees: true,
  receiptsOnPayment: true,
  currency: "USD",
  depositPct: 30,
  netTerms: "Net 14",
  lateFeePct: "1.5%",
};
export function parsePaymentSettings(json: string | null | undefined): PaymentSettings {
  return { ...PAYMENT_DEFAULTS, ...safeParse(json) };
}

// ── Leads ────────────────────────────────────────────────────────────────────
export type LeadStrategy = "round-robin" | "first-come" | "territory" | "manual";
export interface LeadsSettings {
  strategy: LeadStrategy;
  aiCategorize: boolean;
  instantSms: boolean;
  businessHours: boolean;
  autoDeclineDupes: boolean;
  zips: string;
  travelRadius: number;
  outsidePolicy: string;
  maxPerDay: number;
  maxPerRep: number;
  smartPrompt: string;
}
export const LEADS_DEFAULTS: LeadsSettings = {
  strategy: "round-robin",
  aiCategorize: true,
  instantSms: true,
  businessHours: true,
  autoDeclineDupes: false,
  zips: "78701, 78702, 78703, 78704",
  travelRadius: 25,
  outsidePolicy: "flag",
  maxPerDay: 20,
  maxPerRep: 15,
  smartPrompt: "contractor-first",
};
export function parseLeadsSettings(json: string | null | undefined): LeadsSettings {
  return { ...LEADS_DEFAULTS, ...safeParse(json) };
}

// ── Gmail ────────────────────────────────────────────────────────────────────
export interface GmailSettings {
  connected: boolean;
  sendFromUser: boolean;
  trackOpens: boolean;
  autoSync: boolean;
  displayName: string;
  replyTo: string;
  signature: string;
}
export const GMAIL_DEFAULTS: GmailSettings = {
  connected: false,
  sendFromUser: true,
  trackOpens: true,
  autoSync: false,
  displayName: "",
  replyTo: "",
  signature: "brand",
};
export function parseGmailSettings(json: string | null | undefined): GmailSettings {
  return { ...GMAIL_DEFAULTS, ...safeParse(json) };
}

// ── Meta ─────────────────────────────────────────────────────────────────────
export interface MetaSettings {
  connected: boolean;
  autoCreate: boolean;
  autoText: boolean;
  defaultPage: string;
  formCategory: string;
}
export const META_DEFAULTS: MetaSettings = {
  connected: true,
  autoCreate: true,
  autoText: true,
  defaultPage: "Patel Roofing & Co.",
  formCategory: "auto",
};
export function parseMetaSettings(json: string | null | undefined): MetaSettings {
  return { ...META_DEFAULTS, ...safeParse(json) };
}
