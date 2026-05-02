"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toast";
import { switchActiveOrg } from "@/actions/team";

export interface OrgMembershipItem {
  organizationId: string;
  organizationName: string;
  role: string;
  current: boolean;
}

export function OrgSwitcher({ memberships }: { memberships: OrgMembershipItem[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = memberships.find((m) => m.current) ?? memberships[0];
  if (!current) return null;

  async function switchTo(orgId: string) {
    try {
      await switchActiveOrg(orgId);
      setOpen(false);
      toast.success("Switched organization");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't switch", err?.message);
    }
  }

  // Single-org mode: static chip
  if (memberships.length < 2) {
    return (
      <div className="hidden md:flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-[var(--r-sm)] bg-white/60 dark:bg-white/[0.04] hairline">
        <Monogram name={current.organizationName} />
        <span className="text-[12px] font-medium text-[color:var(--ink)]">
          {current.organizationName}
        </span>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((x) => !x)}
        className={cn(
          "flex items-center gap-2 h-8 px-2 rounded-[var(--r-sm)] transition-colors",
          open ? "bg-black/[0.04]" : "hover:bg-black/[0.03]",
        )}
      >
        <Monogram name={current.organizationName} />
        <span className="text-[12px] font-medium text-[color:var(--ink)] max-w-[140px] truncate hidden md:inline">
          {current.organizationName}
        </span>
        <ChevronDown className="h-3 w-3 text-[color:var(--ink-muted)]" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 mt-2 w-[280px] paper-card shadow-pop overflow-hidden z-30"
          >
            <div className="px-4 py-2.5 border-b border-[color:var(--ink-line)]">
              <div className="quiet-caps">Your organizations</div>
            </div>
            <ul className="max-h-[280px] overflow-y-auto">
              {memberships.map((m) => (
                <li key={m.organizationId}>
                  <button
                    onClick={() => switchTo(m.organizationId)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left",
                      m.current ? "bg-[color:var(--accent-soft)]/50" : "hover:bg-black/[0.02]",
                    )}
                  >
                    <Monogram name={m.organizationName} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
                        {m.organizationName}
                      </div>
                      <Badge tone="neutral" className="mt-0.5">
                        {m.role.toLowerCase()}
                      </Badge>
                    </div>
                    {m.current && <Check className="h-3.5 w-3.5 text-[color:var(--accent)]" />}
                  </button>
                </li>
              ))}
            </ul>
            <div className="border-t border-[color:var(--ink-line)] px-2 py-1.5">
              <button className="w-full flex items-center gap-2 px-3 py-2 rounded-[var(--r-sm)] text-[12px] text-[color:var(--ink-muted)] hover:bg-black/[0.03] hover:text-[color:var(--ink)]">
                <Plus className="h-3.5 w-3.5" />
                Create organization
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Monogram({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div className="h-6 w-6 shrink-0 rounded-[5px] bg-[color:var(--ink)] text-[color:var(--paper)] grid place-items-center text-[10px] font-semibold tracking-[0.04em]">
      {initials}
    </div>
  );
}
