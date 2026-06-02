"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GripVertical, Sparkles, Mail, Phone } from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import { toast } from "@/components/ui/Toast";
import { relative } from "@/lib/format";
import { updateLeadStatus } from "@/actions/leads";

export interface KanbanLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  projectType: string | null;
  description: string | null;
  status: string;
  aiCategory: string | null;
  aiConfidence: number | null;
  createdAt: Date;
  assignee: string | null;
}

const COLUMNS = [
  { key: "NEW", label: "New" },
  { key: "ROUTED", label: "Routed" },
  { key: "CLAIMED", label: "Claimed" },
  { key: "CONTACTED", label: "Contacted" },
  { key: "QUOTED", label: "Quoted" },
  { key: "WON", label: "Won" },
  { key: "LOST", label: "Lost" },
] as const;

type Status = (typeof COLUMNS)[number]["key"];

const COLUMN_TONE: Record<Status, string> = {
  NEW: "rgba(31,122,82,0.18)",
  ROUTED: "rgba(31,122,82,0.12)",
  CLAIMED: "rgba(200,148,80,0.16)",
  CONTACTED: "rgba(200,148,80,0.12)",
  QUOTED: "rgba(14,165,233,0.14)",
  WON: "rgba(5,150,105,0.16)",
  LOST: "rgba(225,29,72,0.10)",
};

export function LeadKanbanBoard({ leads }: { leads: KanbanLead[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState(leads);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [hoverCol, setHoverCol] = React.useState<Status | null>(null);

  React.useEffect(() => {
    setItems(leads);
  }, [leads]);

  const grouped = React.useMemo(() => {
    const map: Record<Status, KanbanLead[]> = {
      NEW: [],
      ROUTED: [],
      CLAIMED: [],
      CONTACTED: [],
      QUOTED: [],
      WON: [],
      LOST: [],
    };
    for (const l of items) {
      const k = (l.status as Status) ?? "NEW";
      if (map[k]) map[k].push(l);
    }
    return map;
  }, [items]);

  async function moveCard(id: string, toStatus: Status) {
    const before = items;
    setItems((prev) => prev.map((l) => (l.id === id ? { ...l, status: toStatus } : l)));
    try {
      await updateLeadStatus(id, toStatus);
      router.refresh();
    } catch (err: any) {
      setItems(before);
      toast.error("Couldn't move", err?.message);
    }
  }

  return (
    <div className="grid grid-flow-col auto-cols-[minmax(260px,1fr)] gap-4 overflow-x-auto pb-4 -mx-4 px-4">
      {COLUMNS.map((col) => {
        const list = grouped[col.key];
        const isHover = hoverCol === col.key;
        return (
          <div
            key={col.key}
            onDragOver={(e) => {
              e.preventDefault();
              setHoverCol(col.key);
            }}
            onDragLeave={() => setHoverCol((c) => (c === col.key ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              setHoverCol(null);
              setDraggingId(null);
              if (id) moveCard(id, col.key);
            }}
            className={cn(
              "rounded-[var(--r-md)] hairline transition-colors min-h-[420px] flex flex-col",
              isHover
                ? "bg-[color:var(--accent-soft)]/40 border-[color:var(--accent)]/30"
                : "bg-white/40 dark:bg-white/[0.02]",
            )}
          >
            <div className="flex items-center justify-between px-3.5 py-3 border-b border-[color:var(--ink-line)]">
              <div className="flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: COLUMN_TONE[col.key] }}
                />
                <span className="quiet-caps !mb-0">{col.label}</span>
              </div>
              <span className="text-[11px] tabular text-[color:var(--ink-muted)]">{list.length}</span>
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto">
              <AnimatePresence>
                {list.map((l) => (
                  <KanbanCard
                    key={l.id}
                    lead={l}
                    dragging={draggingId === l.id}
                    onDragStart={() => setDraggingId(l.id)}
                    onDragEnd={() => setDraggingId(null)}
                  />
                ))}
              </AnimatePresence>
              {list.length === 0 && (
                <div className="text-[11px] text-[color:var(--ink-faint)] text-center py-8">
                  Drop here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({
  lead,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  lead: KanbanLead;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: dragging ? 0.45 : 1, y: 0, scale: dragging ? 0.97 : 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      draggable
      onDragStart={(e) => {
        const ev = e as unknown as React.DragEvent<HTMLDivElement>;
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", lead.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "paper-card !shadow-none p-3 cursor-grab active:cursor-grabbing transition-shadow",
        "hover:shadow-[0_4px_12px_-6px_rgba(17,17,19,0.16)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[13px] text-[color:var(--ink)] truncate">
            {lead.name}
          </div>
          {lead.projectType && (
            <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5 truncate">
              {lead.projectType}
            </div>
          )}
        </div>
        <GripVertical className="h-3.5 w-3.5 text-[color:var(--ink-faint)] shrink-0 mt-0.5" />
      </div>

      {lead.aiConfidence !== null && (
        <div className="mt-2.5 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-[color:var(--accent)]" />
          <span className="text-[10.5px] tabular text-[color:var(--ink-soft)]">
            AI · {lead.aiCategory ?? "—"} · {Math.round((lead.aiConfidence ?? 0) * 100)}%
          </span>
        </div>
      )}

      <div className="mt-3 pt-2.5 border-t border-[color:var(--ink-line)] flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10.5px] text-[color:var(--ink-muted)]">
          {lead.email && <Mail className="h-3 w-3" />}
          {lead.phone && <Phone className="h-3 w-3" />}
          <span className="tabular">{relative(lead.createdAt)}</span>
        </div>
        {lead.assignee && (
          <div className="flex items-center gap-1.5">
            <Avatar name={lead.assignee} size={18} />
          </div>
        )}
      </div>
    </motion.div>
  );
}
