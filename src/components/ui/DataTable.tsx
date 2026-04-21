"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { listStagger, listItem } from "@/lib/theme/motion";

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  align?: "left" | "right" | "center";
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
  footer?: React.ReactNode;
  rowKey: (row: T) => string;
}

export function DataTable<T>({
  columns,
  rows,
  empty,
  onRowClick,
  className,
  footer,
  rowKey,
}: DataTableProps<T>) {
  if (rows.length === 0 && empty) {
    return <div className={className}>{empty}</div>;
  }

  return (
    <div className={cn("paper-card overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[color:var(--ink-line)]">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "quiet-caps px-5 py-3 text-left whitespace-nowrap",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <motion.tbody variants={listStagger} initial="initial" animate="animate">
            {rows.map((row, i) => (
              <motion.tr
                key={rowKey(row)}
                variants={listItem}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "border-b border-[color:var(--ink-line)] last:border-0 transition-colors",
                  onRowClick && "cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.03]",
                  i % 2 === 1 && "bg-black/[0.012] dark:bg-white/[0.012]",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-5 py-3.5 text-[13px] text-[color:var(--ink-soft)] align-middle",
                      c.align === "right" && "text-right tabular",
                      c.align === "center" && "text-center",
                      c.className,
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>
      {footer && <div className="border-t border-[color:var(--ink-line)] px-5 py-3 text-xs text-[color:var(--ink-muted)]">{footer}</div>}
    </div>
  );
}
