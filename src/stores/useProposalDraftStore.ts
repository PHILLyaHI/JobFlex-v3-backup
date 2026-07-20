"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { nanoid } from "nanoid";
import { sellUnitPrice } from "@/lib/pricing/markup";

export type MeasurementType = "SQFT" | "LINEAR_FT" | "CUBIC_FT" | "UNIT" | "HOUR" | "LUMP_SUM";

export interface DraftLineItem {
  id: string;
  name: string;
  description?: string;
  measurementType: MeasurementType;
  quantity: number;
  unitPrice: number;
  materialCost: number;
  laborCost: number;
  // Live-pricing product metadata, carried through edits so it isn't wiped on save.
  store?: string | null;
  productUrl?: string | null;
  imageUrl?: string | null;
  dimensions?: string | null;
}

export interface DraftInstallment {
  id: string;
  label: string;
  amount: number;
  isPercent: boolean;
}

interface ProposalDraft {
  id?: string;
  title: string;
  clientId?: string;
  description: string;
  scopeOfWork: string;
  notes: string;
  lineItems: DraftLineItem[];
  installments: DraftInstallment[];
  taxRate: number;
  // Estimating engine markups (percentages 0-100)
  materialMarkupPct: number;
  laborMarkupPct: number;
  overheadPct: number;
  profitPct: number;
}

interface MarkupPatch {
  materialMarkupPct?: number;
  laborMarkupPct?: number;
  overheadPct?: number;
  profitPct?: number;
}

interface DraftStore {
  draft: ProposalDraft;
  reset: () => void;
  set: (patch: Partial<ProposalDraft>) => void;
  addLine: () => void;
  updateLine: (id: string, patch: Partial<DraftLineItem>) => void;
  removeLine: (id: string) => void;
  addInstallment: () => void;
  updateInstallment: (id: string, patch: Partial<DraftInstallment>) => void;
  removeInstallment: (id: string) => void;
  hydrate: (d: ProposalDraft) => void;
  setMarkup: (patch: MarkupPatch) => void;
  computed: () => {
    subtotal: number;
    tax: number;
    total: number;
    materialCost: number;
    laborCost: number;
    grandTotal: number;
    margin: number;
  };
}

const emptyDraft = (): ProposalDraft => ({
  title: "",
  description: "",
  scopeOfWork: "",
  notes: "",
  lineItems: [
    {
      id: nanoid(6),
      name: "",
      measurementType: "UNIT",
      quantity: 1,
      unitPrice: 0,
      materialCost: 0,
      laborCost: 0,
    },
  ],
  installments: [
    { id: nanoid(6), label: "Deposit", amount: 30, isPercent: true },
    { id: nanoid(6), label: "Start of work", amount: 30, isPercent: true },
    { id: nanoid(6), label: "Completion", amount: 40, isPercent: true },
  ],
  taxRate: 0,
  // Hidden profit markup. Default 0 so a brand-new draft prices at cost exactly
  // (current behaviour); the org-wide default is seeded on top at creation
  // (ResetDraft / estimator convert). overhead/profit stay display-only for now.
  materialMarkupPct: 0,
  laborMarkupPct: 0,
  overheadPct: 0,
  profitPct: 0,
});

export const useProposalDraftStore = create<DraftStore>()(
  persist(
    immer((set, get) => ({
    draft: emptyDraft(),
    reset: () => set((s) => { s.draft = emptyDraft(); }),
    set: (patch) => set((s) => { Object.assign(s.draft, patch); }),
    addLine: () =>
      set((s) => {
        s.draft.lineItems.push({
          id: nanoid(6),
          name: "",
          measurementType: "UNIT",
          quantity: 1,
          unitPrice: 0,
          materialCost: 0,
          laborCost: 0,
        });
      }),
    updateLine: (id, patch) =>
      set((s) => {
        const l = s.draft.lineItems.find((x) => x.id === id);
        if (l) Object.assign(l, patch);
      }),
    removeLine: (id) =>
      set((s) => {
        s.draft.lineItems = s.draft.lineItems.filter((x) => x.id !== id);
      }),
    addInstallment: () =>
      set((s) => {
        s.draft.installments.push({ id: nanoid(6), label: "", amount: 0, isPercent: true });
      }),
    updateInstallment: (id, patch) =>
      set((s) => {
        const i = s.draft.installments.find((x) => x.id === id);
        if (i) Object.assign(i, patch);
      }),
    removeInstallment: (id) =>
      set((s) => {
        s.draft.installments = s.draft.installments.filter((x) => x.id !== id);
      }),
    hydrate: (d) =>
      set((s) => {
        // Backwards-compat: hydrate from older proposals without markup fields
        s.draft = {
          ...d,
          materialMarkupPct: d.materialMarkupPct ?? 0,
          laborMarkupPct: d.laborMarkupPct ?? 0,
          overheadPct: d.overheadPct ?? 0,
          profitPct: d.profitPct ?? 0,
        };
      }),
    setMarkup: (patch) =>
      set((s) => {
        Object.assign(s.draft, patch);
      }),
    computed: () => {
      const d = get().draft;
      // Subtotal is the client-facing SELL price: each line's cost marked up by
      // the draft's material/labor markup %s (0 by default → equals cost).
      const rates = { materialMarkupPct: d.materialMarkupPct ?? 0, laborMarkupPct: d.laborMarkupPct ?? 0 };
      const subtotal = d.lineItems.reduce((acc, l) => acc + l.quantity * sellUnitPrice(l, rates), 0);
      const tax = subtotal * (d.taxRate ?? 0);
      const materialCost = d.lineItems.reduce((acc, l) => acc + l.quantity * l.materialCost, 0);
      const laborCost = d.lineItems.reduce((acc, l) => acc + l.quantity * l.laborCost, 0);
      const matAfter = materialCost * (1 + (d.materialMarkupPct ?? 0) / 100);
      const labAfter = laborCost * (1 + (d.laborMarkupPct ?? 0) / 100);
      const sub = matAfter + labAfter;
      const overhead = sub * ((d.overheadPct ?? 0) / 100);
      const subWithOverhead = sub + overhead;
      const profit = subWithOverhead * ((d.profitPct ?? 0) / 100);
      const grandTotal = subWithOverhead + profit;
      const baseTotal = materialCost + laborCost;
      const margin = grandTotal > 0 ? ((grandTotal - baseTotal) / grandTotal) * 100 : 0;
      return {
        subtotal,
        tax,
        total: subtotal + tax,
        materialCost,
        laborCost,
        grandTotal,
        margin,
      };
    },
    })),
    {
      // Mirror the in-progress draft to localStorage so it survives a reload
      // even before the first server autosave. Only the draft itself is persisted.
      name: "jobflex-proposal-draft",
      partialize: (s) => ({ draft: s.draft }),
    },
  ),
);
