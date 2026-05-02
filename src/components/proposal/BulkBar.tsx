"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Archive, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

interface BulkBarProps {
  count: number;
  onClear: () => void;
  onMarkPaid: () => Promise<void> | void;
  onArchive: () => Promise<void> | void;
  onDelete: () => Promise<void> | void;
}

export function BulkBar({ count, onClear, onMarkPaid, onArchive, onDelete }: BulkBarProps) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  async function wrap(key: string, fn: () => Promise<unknown> | unknown) {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    setConfirmDelete(false);
    await wrap("delete", onDelete);
  }

  return (
    <>
      <AnimatePresence>
        {count > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-none"
          >
            <div className="pointer-events-auto paper-card shadow-pop flex items-center gap-1 pl-4 pr-2 py-2">
              <span className="text-[13px] font-medium text-[color:var(--ink)] tabular mr-3">
                {count} selected
              </span>
              <span className="w-px h-5 bg-[color:var(--ink-line)] mr-1" />
              <Button
                variant="ghost"
                size="sm"
                loading={busy === "paid"}
                onClick={() => wrap("paid", onMarkPaid)}
                icon={<Check className="h-3.5 w-3.5" />}
              >
                Mark paid
              </Button>
              <Button
                variant="ghost"
                size="sm"
                loading={busy === "archive"}
                onClick={() => wrap("archive", onArchive)}
                icon={<Archive className="h-3.5 w-3.5" />}
              >
                Archive
              </Button>
              <Button
                variant="ghost"
                size="sm"
                loading={busy === "delete"}
                onClick={() => (count >= 2 ? setConfirmDelete(true) : handleDelete())}
                icon={<Trash2 className="h-3.5 w-3.5" />}
                className="!text-rose-700 hover:!bg-rose-50"
              >
                Delete
              </Button>
              <span className="w-px h-5 bg-[color:var(--ink-line)] mx-1" />
              <button
                onClick={onClear}
                aria-label="Clear selection"
                className="h-8 w-8 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.04]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${count} proposals?`}
        description="This can't be undone. Line items, installments, and activity records will be removed."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy === "delete"} onClick={handleDelete}>
              Delete {count}
            </Button>
          </>
        }
      >
        <div />
      </Dialog>
    </>
  );
}
