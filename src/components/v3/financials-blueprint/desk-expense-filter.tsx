"use client";

// The status filter over the desk Financials expense book (stage D,
// 2026-09-30). The book's rows are drawn once by financials-behavior.ts, each
// carrying `data-status`; this strip only shows and hides them, so the
// behavior module keeps owning the table. The handheld edition filters its
// own React list with the same strip (crew-board/office-review).

import { useEffect, useMemo, useState } from "react";
import { ExpenseStatusFilter } from "@/components/v3/crew-board/office-review";
import type { Expense } from "./financials-data";

export function DeskExpenseFilter({ expenses }: { expenses: Expense[] }) {
  const [value, setValue] = useState("ALL");
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: expenses.length };
    for (const e of expenses) {
      const k = e.status ?? "APPROVED";
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [expenses]);
  useEffect(() => {
    document.querySelectorAll<HTMLTableRowElement>("#expBody tr[data-exp]").forEach((row) => {
      row.hidden = value !== "ALL" && (row.dataset.status ?? "APPROVED") !== value;
    });
  }, [value]);
  return (
    <ExpenseStatusFilter counts={counts} value={value} onChange={setValue} padded />
  );
}
