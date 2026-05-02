"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GripVertical, Mail, Phone } from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import { toast } from "@/components/ui/Toast";
import { relative } from "@/lib/format";
import { updateApplicantStatus } from "@/actions/applicants";

export interface KanbanApplicant {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
  source: string | null;
  status: string;
  createdAt: Date;
}

const COLUMNS = [
  { key: "APPLIED", label: "Applied", tone: "rgba(79,70,229,0.16)" },
  { key: "INTERVIEWING", label: "Interviewing", tone: "rgba(200,148,80,0.16)" },
  { key: "HIRED", label: "Hired", tone: "rgba(5,150,105,0.16)" },
  { key: "REJECTED", label: "Rejected", tone: "rgba(225,29,72,0.10)" },
] as const;

type Status = (typeof COLUMNS)[number]["key"];

export function ApplicantKanban({ applicants }: { applicants: KanbanApplicant[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState(applicants);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [hoverCol, setHoverCol] = React.useState<Status | null>(null);

  React.useEffect(() => {
    setItems(applicants);
  }, [applicants]);

  const grouped = React.useMemo(() => {
    const map: Record<Status, KanbanApplicant[]> = {
      APPLIED: [],
      INTERVIEWING: [],
      HIRED: [],
      REJECTED: [],
    };
    for (const a of items) {
      const k = (a.status as Status) ?? "APPLIED";
      if (map[k]) map[k].push(a);
    }
    return map;
  }, [items]);

  async function moveCard(id: string, toStatus: Status) {
    const before = items;
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, status: toStatus } : a)));
    try {
      await updateApplicantStatus(id, toStatus);
      router.refresh();
    } catch (err: any) {
      setItems(before);
      toast.error("Couldn't move", err?.message);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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
              "rounded-[var(--r-md)] hairline transition-colors min-h-[440px] flex flex-col",
              isHover
                ? "bg-[color:var(--accent-soft)]/40 border-[color:var(--accent)]/30"
                : "bg-white/40 dark:bg-white/[0.02]",
            )}
          >
            <div className="flex items-center justify-between px-3.5 py-3 border-b border-[color:var(--ink-line)]">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: col.tone }} />
                <span className="quiet-caps !mb-0">{col.label}</span>
              </div>
              <span className="text-[11px] tabular text-[color:var(--ink-muted)]">{list.length}</span>
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto">
              <AnimatePresence>
                {list.map((a) => (
                  <ApplicantCard
                    key={a.id}
                    applicant={a}
                    dragging={draggingId === a.id}
                    onDragStart={() => setDraggingId(a.id)}
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

function ApplicantCard({
  applicant,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  applicant: KanbanApplicant;
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
        ev.dataTransfer.setData("text/plain", applicant.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="paper-card !shadow-none p-3 cursor-grab active:cursor-grabbing transition-shadow hover:shadow-[0_4px_12px_-6px_rgba(17,17,19,0.16)]"
    >
      <Link href={`/dashboard/hire/${applicant.id}` as any} className="block">
        <div className="flex items-start gap-2.5">
          <Avatar name={applicant.fullName} size={28} />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[13px] text-[color:var(--ink)] truncate">
              {applicant.fullName}
            </div>
            <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5 truncate">
              {applicant.role}
            </div>
          </div>
          <GripVertical className="h-3.5 w-3.5 text-[color:var(--ink-faint)] shrink-0 mt-1" />
        </div>

        <div className="mt-2.5 pt-2 border-t border-[color:var(--ink-line)] flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10.5px] text-[color:var(--ink-muted)]">
            {applicant.email && <Mail className="h-3 w-3" />}
            {applicant.phone && <Phone className="h-3 w-3" />}
            {applicant.source && (
              <span className="tabular tracking-[0.06em] uppercase">{applicant.source}</span>
            )}
          </div>
          <span className="text-[10.5px] text-[color:var(--ink-muted)] tabular">
            {relative(applicant.createdAt)}
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
