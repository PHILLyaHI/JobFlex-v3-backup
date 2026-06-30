// Shared types + status helpers for the Leads workspace (All / Incoming / Import tabs).
// Pure module — no "use client" so it can be imported by any tab without a runtime cycle.

export interface LeadRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  projectType: string | null;
  description: string | null;
  status: string;
  source: string | null;
  aiCategory: string | null;
  aiConfidence: number | null;
  createdAt: Date;
  assignee: string | null;
}

// Payload shape for transferring staged leads into the pipeline (importLeads action input).
export interface ImportLeadPayload {
  name: string;
  email: string | null;
  phone: string | null;
  projectType: string | null;
  description: string | null;
  source: string; // MANUAL | EMAIL | IMPORT
}

// Aligned with useLeadFilterStore + the Lead.status values that actually occur.
export const LEAD_STATUSES = [
  "ALL",
  "NEW",
  "ROUTED",
  "CLAIMED",
  "CONTACTED",
  "QUOTED",
  "WON",
  "LOST",
  "ARCHIVED",
] as const;

export type LeadStatusFilter = (typeof LEAD_STATUSES)[number];

// Statuses that represent an un-triaged lead waiting on accept / decline.
export const INCOMING_STATUSES = ["NEW", "ROUTED"];

export type Tone = "neutral" | "accent" | "success" | "warn" | "danger" | "info";

export function statusTone(s: string): Tone {
  if (s === "NEW" || s === "ROUTED") return "accent";
  if (s === "WON") return "success";
  if (s === "LOST" || s === "ARCHIVED") return "danger";
  if (s === "CONTACTED" || s === "QUOTED" || s === "CLAIMED") return "warn";
  return "neutral";
}

// Human label for the lead's origin. Falls back to the raw value.
export function sourceLabel(s: string | null): string {
  if (!s) return "Direct";
  const map: Record<string, string> = {
    MANUAL: "Manual entry",
    EMAIL: "Email paste",
    FACEBOOK: "Facebook",
    IMPORT: "Imported",
    FORM: "Homeowner form",
    LEAD_CENTER: "Lead center",
  };
  return map[s.toUpperCase()] ?? s;
}
