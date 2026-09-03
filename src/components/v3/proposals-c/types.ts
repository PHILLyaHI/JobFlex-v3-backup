// Shared types for proposals-c (Pressroom edition).
// Mirrors the live proposals page's row shape so we can reuse RowActions /
// MaterialsSheet without bending those primitives.

import type { MaterialLine } from "@/components/proposal/MaterialsSheet";

export type ProposalCStatus =
  | "DRAFT"
  | "SENT"
  | "VIEWED"
  | "ACCEPTED"
  | "DECLINED"
  | "EXPIRED"
  | "PAID"
  | "ARCHIVED";

export interface InstallmentLine {
  id: string;
  label: string;
  amount: number;
  isPercent: boolean;
  dueDate: string | null;
  position: number;
  /** Installment.status — UNPAID | PENDING | PAID | WAIVED. */
  status: string;
  paidAt: string | null;
  paidAmount: number | null;
  /** Payment.provider that settled it — STRIPE | SQUARE | MANUAL — or null. */
  paidVia: string | null;
}

export interface ProposalPhoto {
  id: string;
  url: string;
}

// Proposal.beforePhotos / afterPhotos are stored as a JSON-encoded string
// array (mirroring the `photos String? @default("[]")` convention elsewhere
// in the schema). Parse defensively — bad/legacy data degrades to [].
export function parseProposalPhotos(raw: string | null | undefined): ProposalPhoto[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is ProposalPhoto =>
        Boolean(p) && typeof p.id === "string" && typeof p.url === "string",
    );
  } catch {
    return [];
  }
}

export interface ProposalCRow {
  id: string;
  publicId: string;
  title: string;
  status: ProposalCStatus;
  total: number;
  subtotal: number;
  taxTotal: number;
  clientName: string;
  clientEmail: string | null;
  clientAddress: string | null;
  clientCity: string | null;
  clientState: string | null;
  clientZip: string | null;
  createdAtISO: string;
  updatedAtISO: string;
  sentAtISO: string | null;
  acceptedAtISO: string | null;
  paidAtISO: string | null;
  validUntilISO: string | null;
  viewCount: number;
  creatorName: string | null;
  installments: InstallmentLine[];
  materials: MaterialLine[];
  beforePhotos: ProposalPhoto[];
  afterPhotos: ProposalPhoto[];
}

export type TabKey = "all" | "accepted" | "completed";

export type StatusSubFilter =
  | "ALL"
  | "DRAFT"
  | "SENT"
  | "VIEWED"
  | "DECLINED"
  | "EXPIRED";
