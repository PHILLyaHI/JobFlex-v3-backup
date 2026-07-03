"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Inbox, LayoutList, Download, Columns3 } from "lucide-react";
import { cn } from "@/lib/cn";
import { toast } from "@/components/ui/Toast";
import { type LeadRow, type ImportLeadPayload, INCOMING_STATUSES } from "./leads-shared";
import { claimLead, updateLeadStatus, importLeads, deleteLead } from "@/actions/leads";
import { LeadsBoard } from "./leads-board";
import { LeadKanbanBoard } from "@/components/leads/LeadKanbanBoard";
import { IncomingLeads } from "./incoming-leads";
import { ImportLeads } from "./import-leads";

type Tab = "all" | "incoming" | "import";

/**
 * Tabbed Leads surface: All Leads (the full editorial table), Incoming Leads (the
 * accept/decline triage inbox for routed + new leads), and Import Leads (bring leads in
 * from manual entry, pasted email, or a file). Mutations persist via server actions;
 * local state updates optimistically, then router.refresh() reconciles against the DB.
 */
export function LeadsWorkspace({ initialLeads }: { initialLeads: LeadRow[] }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("all");
  // "All Leads" can be read two ways: the editorial table or the pipeline board.
  // Table / Board only applies to the All tab; Incoming and Import have one shape.
  const [view, setView] = React.useState<"table" | "board">("table");
  const [leads, setLeads] = React.useState<LeadRow[]>(initialLeads);

  // Re-sync local state when the server component supplies fresh data after a
  // refresh (the React-recommended adjust-state-during-render pattern).
  const [prevInitial, setPrevInitial] = React.useState(initialLeads);
  if (initialLeads !== prevInitial) {
    setPrevInitial(initialLeads);
    setLeads(initialLeads);
  }

  const incoming = React.useMemo(
    () => leads.filter((l) => INCOMING_STATUSES.includes(l.status)),
    [leads],
  );

  // --- persisted mutations (optimistic update → server action → refresh) ---
  const accept = React.useCallback(
    async (id: string) => {
      const prev = leads;
      setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, status: "CLAIMED" } : l)));
      try {
        await claimLead(id);
        router.refresh();
      } catch (err: unknown) {
        setLeads(prev);
        toast.error("Couldn't accept lead", err instanceof Error ? err.message : "Please try again.");
      }
    },
    [leads, router],
  );
  const decline = React.useCallback(
    async (id: string) => {
      const prev = leads;
      setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, status: "LOST" } : l)));
      try {
        await updateLeadStatus(id, "LOST");
        router.refresh();
      } catch (err: unknown) {
        setLeads(prev);
        toast.error("Couldn't decline lead", err instanceof Error ? err.message : "Please try again.");
      }
    },
    [leads, router],
  );
  const transfer = React.useCallback(
    async (payload: ImportLeadPayload[]) => {
      await importLeads(payload); // throws on failure — caller surfaces the error
      router.refresh();
    },
    [router],
  );
  const remove = React.useCallback(
    async (id: string) => {
      const prev = leads;
      setLeads((ls) => ls.filter((l) => l.id !== id));
      try {
        await deleteLead(id);
        router.refresh();
      } catch (err: unknown) {
        setLeads(prev);
        toast.error("Couldn't delete lead", err instanceof Error ? err.message : "Please try again.");
      }
    },
    [leads, router],
  );

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number; attention?: boolean }[] = [
    { key: "all", label: "All Leads", icon: <LayoutList className="h-3.5 w-3.5" />, count: leads.length },
    { key: "incoming", label: "Incoming Leads", icon: <Inbox className="h-3.5 w-3.5" />, count: incoming.length, attention: true },
    { key: "import", label: "Import Leads", icon: <Download className="h-3.5 w-3.5" /> },
  ];

  return (
    <>
      <div className="flex items-center gap-3 -mt-2 mb-6">
        <nav className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {tabs.map((t) => {
          const active = tab === t.key;
          const flagged = t.attention && (t.count ?? 0) > 0 && !active;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[12px] font-medium transition-all",
                active
                  ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
                  : "text-[color:var(--ink-muted)] hairline hover:bg-black/[0.04]",
              )}
            >
              <span className="opacity-80">{t.icon}</span>
              {t.label}
              {typeof t.count === "number" && (
                <span
                  className={cn(
                    "grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] tabular",
                    active
                      ? "bg-white/20"
                      : flagged
                        ? "bg-amber-100 text-amber-800"
                        : "bg-black/[0.06] text-[color:var(--ink-muted)]",
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
        </nav>
        {tab === "all" && (
          <div className="ml-auto shrink-0">
            <ViewToggle view={view} onChange={setView} />
          </div>
        )}
      </div>

      {tab === "all" && view === "table" && <LeadsBoard leads={leads} onDelete={remove} />}
      {tab === "all" && view === "board" && <LeadKanbanBoard leads={leads} />}
      {tab === "incoming" && <IncomingLeads leads={incoming} onAccept={accept} onDecline={decline} />}
      {tab === "import" && <ImportLeads onTransfer={transfer} />}
    </>
  );
}

/** Segmented Table / Board switch for the All Leads tab. Same pill grammar as the
 *  workspace tabs: filled ink for the active view, quiet muted for the rest. */
function ViewToggle({
  view,
  onChange,
}: {
  view: "table" | "board";
  onChange: (v: "table" | "board") => void;
}) {
  const opts = [
    { key: "table" as const, label: "Table", icon: <LayoutList className="h-3.5 w-3.5" /> },
    { key: "board" as const, label: "Board", icon: <Columns3 className="h-3.5 w-3.5" /> },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full hairline p-0.5">
      {opts.map((o) => {
        const active = view === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium transition-all",
              active
                ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
                : "text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
            )}
          >
            <span className="opacity-80">{o.icon}</span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
