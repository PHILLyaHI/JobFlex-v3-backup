"use client";
import { create } from "zustand";

interface SubscriberFilterState {
  query: string;
  plan?: string;
  status?: string;
  promoCode?: string;
  setQuery: (q: string) => void;
  setPlan: (p?: string) => void;
  setStatus: (s?: string) => void;
  setPromoCode: (c?: string) => void;
  reset: () => void;
}

export const useSubscriberFilterStore = create<SubscriberFilterState>((set) => ({
  query: "",
  plan: undefined,
  status: undefined,
  promoCode: undefined,
  setQuery: (q) => set({ query: q }),
  setPlan: (p) => set({ plan: p }),
  setStatus: (s) => set({ status: s }),
  setPromoCode: (c) => set({ promoCode: c }),
  reset: () => set({ plan: undefined, status: undefined, promoCode: undefined }),
}));
