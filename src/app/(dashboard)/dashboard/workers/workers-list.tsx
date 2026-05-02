"use client";
import * as React from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { WorkerRow } from "@/components/workers/WorkerRow";

export interface WorkerListItem {
  id: string;
  name: string;
  email: string | null;
  specialties: string[];
  activeJobs: number;
  hourlyRate: number | null;
}

export function WorkersList({ items }: { items: WorkerListItem[] }) {
  const [q, setQ] = React.useState("");
  const filtered = React.useMemo(() => {
    if (!q.trim()) return items;
    const s = q.toLowerCase();
    return items.filter(
      (w) =>
        w.name.toLowerCase().includes(s) ||
        (w.email ?? "").toLowerCase().includes(s) ||
        w.specialties.some((sp) => sp.toLowerCase().includes(s)),
    );
  }, [items, q]);

  return (
    <>
      <div className="mb-5 max-w-md">
        <Input
          placeholder="Search workers by name, email, or specialty…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          prefix={<Search className="h-3.5 w-3.5" />}
        />
      </div>
      <Card className="py-0 px-5">
        <div className="divide-y divide-[color:var(--ink-line)]">
          {filtered.map((w) => (
            <WorkerRow
              key={w.id}
              id={w.id}
              name={w.name}
              email={w.email}
              specialties={w.specialties}
              activeJobs={w.activeJobs}
              rate={w.hourlyRate}
            />
          ))}
          {filtered.length === 0 && (
            <div className="py-10 text-center text-[12px] text-[color:var(--ink-muted)]">
              No workers match that search.
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
