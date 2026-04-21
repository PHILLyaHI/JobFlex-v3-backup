"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  setQuery: (q: string) => void;
  setStatus: (s: Status) => void;
  setSpecialty: (s?: string) => void;
}

export const useLeadFilterStore = create<LeadFilterState>()(
  persist(
    (set) => ({
      query: "",
      status: "ALL",
      specialty: undefined,
      setQuery: (q) => set({ query: q }),
      setStatus: (s) => set({ status: s }),
      setSpecialty: (s) => set({ specialty: s }),
    }),
    { name: "jobflex-leads" },
  ),
);
