import { Mail, FileText, Eye, Check, CircleDashed } from "lucide-react";
import { relative } from "@/lib/format";

const iconMap: Record<string, React.ReactNode> = {
  SENT: <Mail className="h-3.5 w-3.5" />,
  VIEWED: <Eye className="h-3.5 w-3.5" />,
  ACCEPTED: <Check className="h-3.5 w-3.5" />,
  CREATED: <FileText className="h-3.5 w-3.5" />,
  NOTE: <CircleDashed className="h-3.5 w-3.5" />,
};

export function ActivityFeed({
  items,
}: {
  items: { id: string; kind: string; summary: string; createdAt: Date }[];
}) {
  if (items.length === 0) {
    return <div className="text-[12px] text-[color:var(--ink-muted)]">No activity yet.</div>;
  }
  return (
    <ol className="relative pl-4">
      <span className="absolute top-1 left-[5px] bottom-1 w-px bg-[color:var(--ink-line)]" />
      {items.map((it) => (
        <li key={it.id} className="relative pl-4 pb-4 last:pb-0">
          <span className="absolute left-[-1px] top-1 h-2.5 w-2.5 rounded-full bg-[color:var(--paper)] border border-[color:var(--ink-line)] flex items-center justify-center text-[color:var(--ink-muted)]">
            <span className="h-1 w-1 rounded-full bg-[color:var(--accent)]" />
          </span>
          <div className="flex items-center gap-2 text-[color:var(--ink-muted)]">
            <span className="text-[color:var(--ink-muted)]">{iconMap[it.kind] ?? iconMap.NOTE}</span>
            <span className="quiet-caps !mb-0">{it.kind}</span>
            <span className="text-[10px] text-[color:var(--ink-faint)]">·</span>
            <span className="text-[11px] text-[color:var(--ink-faint)]">{relative(it.createdAt)}</span>
          </div>
          <p className="mt-1 text-[13px] leading-snug text-[color:var(--ink-soft)]">{it.summary}</p>
        </li>
      ))}
    </ol>
  );
}
