"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  FileText,
  Users,
  Inbox,
  Sparkles,
  LayoutDashboard,
  Settings,
  Loader2,
} from "lucide-react";
import { useUiStore } from "@/stores/useUiStore";
import { cn } from "@/lib/cn";
import { globalSearch, type SearchHit } from "@/actions/search";

interface CommandItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  sublabel?: string | null;
  group: string;
  href: string;
}

const COMMANDS: CommandItem[] = [
  { key: "go-overview", group: "Go", icon: <LayoutDashboard className="h-4 w-4" />, label: "Overview", href: "/dashboard" },
  { key: "go-proposals", group: "Go", icon: <FileText className="h-4 w-4" />, label: "Proposals", href: "/dashboard/proposals" },
  { key: "go-clients", group: "Go", icon: <Users className="h-4 w-4" />, label: "Clients", href: "/dashboard/clients" },
  { key: "go-leads", group: "Go", icon: <Inbox className="h-4 w-4" />, label: "Leads", href: "/dashboard/leads" },
  { key: "go-settings", group: "Go", icon: <Settings className="h-4 w-4" />, label: "Settings", href: "/dashboard/settings" },
  { key: "new-ai", group: "Create", icon: <Sparkles className="h-4 w-4" />, label: "Smart Proposal", href: "/dashboard/advanced-ai" },
  { key: "new-manual", group: "Create", icon: <FileText className="h-4 w-4" />, label: "Manual Proposal", href: "/dashboard/proposals/new" },
];

const HIT_META: Record<SearchHit["type"], { icon: React.ReactNode; group: string }> = {
  client: { icon: <Users className="h-4 w-4" />, group: "Client" },
  proposal: { icon: <FileText className="h-4 w-4" />, group: "Proposal" },
  lead: { icon: <Inbox className="h-4 w-4" />, group: "Lead" },
};

export function CommandK() {
  const open = useUiStore((s) => s.commandOpen);
  const setOpen = useUiStore((s) => s.setCommandOpen);
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const reqId = React.useRef(0);

  // Cmd/Ctrl+K to toggle, Escape to close.
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

  // Reset transient state whenever the palette closes.
  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      setLoading(false);
    }
  }, [open]);

  // Debounced live search across clients / proposals / leads. A monotonic
  // request id guards against out-of-order responses clobbering fresh results.
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const results = await globalSearch(q);
        if (id === reqId.current) setHits(results);
      } catch {
        if (id === reqId.current) setHits([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [query]);

  const staticMatches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter((c) => c.label.toLowerCase().includes(q));
  }, [query]);

  // Entity hits lead (most specific), static navigation follows.
  const items: CommandItem[] = React.useMemo(() => {
    const hitItems: CommandItem[] = hits.map((h) => ({
      key: `${h.type}-${h.id}`,
      icon: HIT_META[h.type].icon,
      label: h.title,
      sublabel: h.subtitle,
      group: HIT_META[h.type].group,
      href: h.href,
    }));
    return [...hitItems, ...staticMatches];
  }, [hits, staticMatches]);

  React.useEffect(() => setActive(0), [query, items.length]);

  const go = (href: string) => {
    router.push(href as never);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    }
    if (e.key === "Enter" && items[active]) {
      e.preventDefault();
      go(items[active].href);
    }
  };

  const showEmpty = !loading && items.length === 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-[color-mix(in_srgb,var(--ink)_50%,transparent)] backdrop-blur-[2px]"
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
                {loading ? (
                  <Loader2 className="h-4 w-4 text-[color:var(--ink-muted)] animate-spin" />
                ) : (
                  <Search className="h-4 w-4 text-[color:var(--ink-muted)]" />
                )}
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search clients, proposals, leads…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-[color:var(--ink-faint)]"
                />
                <span className="text-[10px] text-[color:var(--ink-faint)] tracking-[0.1em]">ESC</span>
              </div>
              <div className="max-h-[360px] overflow-y-auto py-2">
                {showEmpty && (
                  <div className="px-4 py-8 text-center text-xs text-[color:var(--ink-muted)]">
                    {query.trim().length >= 2 ? "No matches." : "Type to search, or jump to a section."}
                  </div>
                )}
                {items.map((c, i) => (
                  <Link
                    key={c.key}
                    href={c.href as never}
                    onClick={(e) => {
                      e.preventDefault();
                      go(c.href);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 text-[13px]",
                      active === i
                        ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]"
                        : "text-[color:var(--ink-soft)]",
                    )}
                  >
                    <span className="opacity-80 shrink-0">{c.icon}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{c.label}</span>
                      {c.sublabel && (
                        <span className="block truncate text-[11px] text-[color:var(--ink-muted)]">
                          {c.sublabel}
                        </span>
                      )}
                    </span>
                    <span className="quiet-caps !mb-0 shrink-0">{c.group}</span>
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
