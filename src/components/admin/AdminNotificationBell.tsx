"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { cn } from "@/lib/cn";
import { relative } from "@/lib/format";
import { markSupportTicketsRead, type SupportFeedItem } from "@/actions/support";

const CATEGORY_LABEL: Record<string, string> = {
  billing: "Billing",
  technical: "Technical",
  account: "Account",
  feature: "Feature idea",
  general: "General",
};

/**
 * Platform-admin notification center in the admin header. Hand-rolled dropdown
 * (no Radix) fed by recent support tickets. Unread tickets glow sage; "Mark all
 * read" and opening the inbox both clear the badge.
 */
export function AdminNotificationBell({
  items,
  unread,
}: {
  items: SupportFeedItem[];
  unread: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const panelId = React.useId();

  const close = React.useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    // Move focus into the menu so keyboard users land on the content, not behind it.
    panelRef.current?.focus();
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true); // Escape returns focus to the bell trigger.
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  async function markAll() {
    setBusy(true);
    try {
      await markSupportTicketsRead();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function go() {
    setOpen(false);
    router.push("/admin/support" as never);
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={panelId}
        className="relative grid h-9 w-9 place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-soft)] transition-colors hover:bg-black/[0.04] focus-ring"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-[color:var(--accent)] px-1 text-[10px] font-semibold tabular text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          ref={panelRef}
          tabIndex={-1}
          className="absolute right-0 z-30 mt-2 w-[340px] overflow-hidden paper-card p-0 !shadow-[var(--shadow-md)] outline-none"
        >
          <div className="flex items-center justify-between border-b border-[color:var(--ink-line)] px-4 py-3">
            <span className="font-display text-[14px] text-[color:var(--ink)]">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                disabled={busy}
                className="text-[11px] text-[color:var(--accent-ink)] hover:underline disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-[color:var(--ink-muted)]">
              No support tickets yet.
            </div>
          ) : (
            <ul className="max-h-[360px] divide-y divide-[color:var(--ink-line)] overflow-y-auto">
              {items.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={go}
                    className="flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-black/[0.02] focus-ring"
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        it.unread ? "bg-[color:var(--accent)]" : "bg-transparent",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "truncate text-[13px]",
                            it.unread
                              ? "font-semibold text-[color:var(--ink)]"
                              : "font-medium text-[color:var(--ink-soft)]",
                          )}
                        >
                          {it.subject}
                        </span>
                        {it.priority === "high" && (
                          <span className="shrink-0 rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.03em] text-rose-700">
                            Urgent
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-[color:var(--ink-muted)]">
                        {it.orgName} · {CATEGORY_LABEL[it.category] ?? "General"} · {relative(it.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-[color:var(--ink-line)] px-4 py-2.5">
            <button
              type="button"
              onClick={go}
              className="text-[12px] font-medium text-[color:var(--accent-ink)] hover:underline"
            >
              View all tickets →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
