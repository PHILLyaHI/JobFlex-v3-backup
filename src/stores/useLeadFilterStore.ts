"use client";
import { create } from "zustand";

type Status =
  | "ALL"
  | "NEW"
  | "ROUTED"
  | "CLAIMED"
  | "CONTACTED"
  | "QUOTED"
  | "WON"
  | "LOST"
  | "ARCHIVED";

interface LeadFilterState {
  query: string;
  status: Status;
  specialty?: string;
  source?: string;
  setQuery: (q: string) => void;
  setStatus: (s: Status) => void;
  setSpecialty: (s?: string) => void;
  setSource: (s?: string) => void;
  reset: () => void;
}

// Lead filters live in memory only — they reset to defaults on every page
// reload instead of persisting across sessions (previously persisted under the
// "jobflex-leads" localStorage key).
export const useLeadFilterStore = create<LeadFilterState>()((set) => ({
  query: "",
  status: "ALL",
  specialty: undefined,
  source: undefined,
  setQuery: (q) => set({ query: q }),
  setStatus: (s) => set({ status: s }),
  setSpecialty: (s) => set({ specialty: s }),
  setSource: (s) => set({ source: s }),
  reset: () => set({ status: "ALL", specialty: undefined, source: undefined }),
}));
