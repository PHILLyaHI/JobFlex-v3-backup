"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CalendarView = "month" | "week" | "team";

interface CalendarState {
  view: CalendarView;
  cursorISO: string;

  // Tray
  trayOpen: boolean;
  setTrayOpen: (v: boolean) => void;

  // Filters
  selectedWorkerIds: string[];
  selectedStatuses: string[];
  query: string;
  setSelectedWorkerIds: (ids: string[]) => void;
  setSelectedStatuses: (s: string[]) => void;
  setQuery: (q: string) => void;
  clearFilters: () => void;

  setView: (v: CalendarView) => void;
  setCursor: (d: Date) => void;
  next: () => void;
  prev: () => void;
  today: () => void;
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set) => ({
      view: "month",
      cursorISO: new Date().toISOString(),
      trayOpen: true,
      setTrayOpen: (v) => set({ trayOpen: v }),

      selectedWorkerIds: [],
      selectedStatuses: [],
      query: "",
      setSelectedWorkerIds: (ids) => set({ selectedWorkerIds: ids }),
      setSelectedStatuses: (s) => set({ selectedStatuses: s }),
      setQuery: (q) => set({ query: q }),
      clearFilters: () =>
        set({ selectedWorkerIds: [], selectedStatuses: [], query: "" }),

      setView: (v) => set({ view: v }),
      setCursor: (d) => set({ cursorISO: d.toISOString() }),
      next: () =>
        set((s) => {
          const c = new Date(s.cursorISO);
          if (s.view === "month") c.setMonth(c.getMonth() + 1);
          else c.setDate(c.getDate() + 7);
          return { cursorISO: c.toISOString() };
        }),
      prev: () =>
        set((s) => {
          const c = new Date(s.cursorISO);
          if (s.view === "month") c.setMonth(c.getMonth() - 1);
          else c.setDate(c.getDate() - 7);
          return { cursorISO: c.toISOString() };
        }),
      today: () => set({ cursorISO: new Date().toISOString() }),
    }),
    {
      name: "jobflex-calendar",
      partialize: (s) => ({
        view: s.view,
        cursorISO: s.cursorISO,
        trayOpen: s.trayOpen,
      }),
    },
  ),
);
