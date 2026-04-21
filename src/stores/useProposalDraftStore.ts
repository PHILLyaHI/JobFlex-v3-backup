"use client";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { nanoid } from "nanoid";

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
  computed: () => { subtotal: number; tax: number; total: number; materialCost: number; laborCost: number };
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
    { id: nanoid(6), label: "Completion", amount: 70, isPercent: true },
  ],
  taxRate: 0,
});

export const useProposalDraftStore = create<DraftStore>()(
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
    hydrate: (d) => set((s) => { s.draft = d; }),
    computed: () => {
      const d = get().draft;
      const subtotal = d.lineItems.reduce((acc, l) => acc + l.quantity * l.unitPrice, 0);
      const tax = subtotal * (d.taxRate ?? 0);
      const materialCost = d.lineItems.reduce((acc, l) => acc + l.quantity * l.materialCost, 0);
      const laborCost = d.lineItems.reduce((acc, l) => acc + l.quantity * l.laborCost, 0);
      return { subtotal, tax, total: subtotal + tax, materialCost, laborCost };
    },
  })),
);
