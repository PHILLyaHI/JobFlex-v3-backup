"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Megaphone } from "lucide-react";
import { cn } from "@/lib/cn";
import { relative } from "@/lib/format";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: number; // 0 normal, 1 warn, 2 high
  createdAt: Date | string;
  expiresAt?: Date | string | null;
}

interface AnnouncementBannerProps {
  announcements: Announcement[];
  onDismiss?: (id: string) => Promise<void> | void;
}

function accentFor(priority: number) {
  if (priority >= 2) return "#D97706"; // amber for high
  if (priority === 1) return "#E11D48"; // rose for warn
  return "var(--accent)";
}

export function AnnouncementBanner({ announcements, onDismiss }: AnnouncementBannerProps) {
  const [expanded, setExpanded] = React.useState(false);
  const sorted = React.useMemo(
    () => [...announcements].sort((a, b) => b.priority - a.priority),
    [announcements],
  );
  if (sorted.length === 0) return null;
  const [primary, ...rest] = sorted;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="mb-5"
      onMouseLeave={() => setExpanded(false)}
    >
      <AnnouncementRow a={primary} onDismiss={onDismiss} />
      {rest.length > 0 && (
        <div className="relative">
          <button
            onMouseEnter={() => setExpanded(true)}
            onClick={() => setExpanded((x) => !x)}
            className="mt-1.5 text-[11px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] tabular inline-flex items-center gap-1.5 pl-4"
          >
            <span className="h-1 w-1 rounded-full bg-[color:var(--ink-faint)]" />
            +{rest.length} more announcement{rest.length === 1 ? "" : "s"}
          </button>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="mt-2 space-y-2"
              >
                {rest.map((a) => (
                  <AnnouncementRow key={a.id} a={a} onDismiss={onDismiss} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

function AnnouncementRow({
  a,
  onDismiss,
}: {
  a: Announcement;
  onDismiss?: (id: string) => Promise<void> | void;
}) {
  const [busy, setBusy] = React.useState(false);
  return (
    <div
      className="paper-card flex items-center gap-3 py-2.5 px-4 border-l-[3px]"
      style={{ borderLeftColor: accentFor(a.priority) }}
    >
      <Megaphone
        className="h-3.5 w-3.5 shrink-0"
        style={{ color: accentFor(a.priority) }}
      />
      <div className="flex items-baseline gap-2 min-w-0 flex-1">
        <span className="text-[12.5px] font-medium text-[color:var(--ink)] truncate">
          {a.title}
        </span>
        <span className="text-[12px] text-[color:var(--ink-muted)] truncate">{a.body}</span>
      </div>
      <span className="text-[10px] text-[color:var(--ink-faint)] tabular shrink-0">
        {relative(a.createdAt)}
      </span>
      {onDismiss && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onDismiss(a.id);
            } finally {
              setBusy(false);
            }
          }}
          className="h-6 w-6 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.05]"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
