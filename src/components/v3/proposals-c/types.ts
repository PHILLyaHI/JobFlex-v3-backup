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
  installments: InstallmentLine[];
  materials: MaterialLine[];
}

export type TabKey = "all" | "accepted" | "completed";

export type StatusSubFilter =
  | "ALL"
  | "DRAFT"
  | "SENT"
  | "VIEWED"
  | "DECLINED"
  | "EXPIRED";
