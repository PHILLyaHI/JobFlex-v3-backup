import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";

interface WorkerRowProps {
  id: string;
  name: string;
  email?: string | null;
  specialties: string[];
  activeJobs: number;
  rate?: number | null;
}

export function WorkerRow({ id, name, email, specialties, activeJobs, rate }: WorkerRowProps) {
  return (
    <Link
      href={`/dashboard/workers/${id}` as any}
      className="flex items-center gap-4 py-4 border-b border-[color:var(--ink-line)] last:border-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] -mx-5 px-5 transition-colors"
    >
      <Avatar name={name} size={40} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-[color:var(--ink)] truncate">{name}</div>
        <div className="text-[11px] text-[color:var(--ink-muted)] truncate">
          {email ?? "No email"}
        </div>
      </div>
      <div className="hidden md:flex items-center gap-1 max-w-[260px] overflow-hidden">
        {specialties.slice(0, 3).map((s) => (
          <Badge key={s} tone="neutral">
            {s}
          </Badge>
        ))}
        {specialties.length > 3 && (
          <span className="text-[10px] text-[color:var(--ink-faint)]">+{specialties.length - 3}</span>
        )}
      </div>
      <div className="text-[12px] text-[color:var(--ink-muted)] tabular text-right shrink-0 w-[84px]">
        {activeJobs} active
      </div>
      <div className="text-[12px] text-[color:var(--ink-soft)] tabular text-right shrink-0 w-[80px]">
        {rate ? `$${rate}/hr` : "—"}
      </div>
    </Link>
  );
}
