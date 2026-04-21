"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, FileText, Users, Inbox, Sparkles, LayoutDashboard, Settings } from "lucide-react";
import { useUiStore } from "@/stores/useUiStore";
import { cn } from "@/lib/cn";

const COMMANDS = [
  { group: "Go", icon: <LayoutDashboard className="h-4 w-4" />, label: "Overview", href: "/dashboard" },
  { group: "Go", icon: <FileText className="h-4 w-4" />, label: "Proposals", href: "/dashboard/proposals" },
  { group: "Go", icon: <Users className="h-4 w-4" />, label: "Clients", href: "/dashboard/clients" },
  { group: "Go", icon: <Inbox className="h-4 w-4" />, label: "Leads", href: "/dashboard/leads" },
  { group: "Go", icon: <Settings className="h-4 w-4" />, label: "Settings", href: "/dashboard/settings" },
  { group: "Create", icon: <Sparkles className="h-4 w-4" />, label: "AI Proposal", href: "/dashboard/proposals/ai" },
  { group: "Create", icon: <FileText className="h-4 w-4" />, label: "Manual Proposal", href: "/dashboard/proposals/new" },
];

export function CommandK() {
  const open = useUiStore((s) => s.commandOpen);
  const setOpen = useUiStore((s) => s.setCommandOpen);
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const filtered = React.useMemo(
    () =>
      COMMANDS.filter((c) => c.label.toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  React.useEffect(() => setActive(0), [query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    }
    if (e.key === "Enter" && filtered[active]) {
      router.push(filtered[active].href as any);
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-[color:var(--ink)]/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="paper-card pointer-events-auto w-full max-w-xl shadow-pop overflow-hidden"
              onKeyDown={onKeyDown}
            >
              <div className="flex items-center gap-2.5 border-b border-[color:var(--ink-line)] px-4 h-12">
                <Search className="h-4 w-4 text-[color:var(--ink-muted)]" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Jump to anywhere…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-[color:var(--ink-faint)]"
                />
                <span className="text-[10px] text-[color:var(--ink-faint)] tracking-[0.1em]">ESC</span>
              </div>
              <div className="max-h-[360px] overflow-y-auto py-2">
                {filtered.length === 0 && (
                  <div className="px-4 py-8 text-center text-xs text-[color:var(--ink-muted)]">
                    No matches.
                  </div>
                )}
                {filtered.map((c, i) => (
                  <Link
                    key={c.href}
                    href={c.href as any}
                    onClick={() => setOpen(false)}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 text-[13px]",
                      active === i ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]" : "text-[color:var(--ink-soft)]",
                    )}
                  >
                    <span className="opacity-80">{c.icon}</span>
                    <span className="flex-1">{c.label}</span>
                    <span className="quiet-caps !mb-0">{c.group}</span>
                  </Link>
                ))}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
