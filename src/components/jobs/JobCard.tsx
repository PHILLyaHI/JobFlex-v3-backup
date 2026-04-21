import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { JobStatusBadge } from "./JobStatusBadge";
import { longDate, shortDate } from "@/lib/format";
import { MapPin, Calendar as CalIcon } from "lucide-react";

interface JobCardProps {
  id: string;
  title: string;
  status: string;
  clientName?: string | null;
  address?: string | null;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  crew?: { id: string; name: string }[];
}

export function JobCard({
  id,
  title,
  status,
  clientName,
  address,
  startsAt,
  endsAt,
  crew = [],
}: JobCardProps) {
  return (
    <Link
      href={`/dashboard/jobs/${id}` as any}
      className="paper-card p-5 flex flex-col gap-3 hover:shadow-pop hover:-translate-y-0.5 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-[color:var(--ink)] truncate">{title}</div>
          {clientName && (
            <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">{clientName}</div>
          )}
        </div>
        <JobStatusBadge status={status} />
      </div>
      <div className="flex flex-col gap-1.5 text-[12px] text-[color:var(--ink-soft)]">
        {(startsAt || endsAt) && (
          <div className="flex items-center gap-2">
            <CalIcon className="h-3 w-3 text-[color:var(--ink-muted)]" />
            <span className="tabular">
              {startsAt ? shortDate(startsAt) : "TBD"}
              {endsAt && ` → ${shortDate(endsAt)}`}
            </span>
          </div>
        )}
        {address && (
          <div className="flex items-center gap-2">
            <MapPin className="h-3 w-3 text-[color:var(--ink-muted)]" />
            <span className="truncate">{address}</span>
          </div>
        )}
      </div>
      {crew.length > 0 && (
        <div className="flex items-center gap-1.5 pt-2 border-t border-[color:var(--ink-line)]">
          <div className="flex -space-x-1.5">
            {crew.slice(0, 4).map((c) => (
              <div key={c.id} className="ring-2 ring-[color:var(--paper)] rounded-full">
                <Avatar name={c.name} size={22} />
              </div>
            ))}
          </div>
          <span className="text-[10px] text-[color:var(--ink-muted)] ml-1">
            {crew.length} on crew
          </span>
        </div>
      )}
    </Link>
  );
}
