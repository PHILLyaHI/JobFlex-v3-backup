"use client";
// Minimal team-availability quick view: a toolbar popover with one row per
// person and seven day cells for the cursor week. Ink dot = busy, rose
// stripes = unavailable, empty = free. Read-only at a glance — the Team tab
// stays the place to act.

import * as React from "react";
import { Users } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";

export interface PeekPerson {
  key: string;
  name: string;
}

export interface PeekBusy {
  personKey: string;
  startsAt: string;
  endsAt: string;
  unavailable?: boolean;
}

interface Props {
  cursor: Date;
  people: PeekPerson[];
  busy: PeekBusy[];
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}

export function TeamPeekA({ cursor, people, busy }: Props) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const weekStart = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  // person key → 7 day states: "free" | "busy" | "unavailable"
  const grid = React.useMemo(() => {
    const m = new Map<string, ("free" | "busy" | "unavailable")[]>();
    for (const p of people) m.set(p.key, Array(7).fill("free"));
    for (const b of busy) {
      const row = m.get(b.personKey);
      if (!row) continue;
      const s = new Date(b.startsAt);
      const e = new Date(b.endsAt);
      days.forEach((d, i) => {
        const dayEnd = new Date(d);
        dayEnd.setHours(23, 59, 59, 999);
        if (s <= dayEnd && e >= d) {
          // Unavailable wins over busy — it's the stronger signal.
          if (b.unavailable) row[i] = "unavailable";
          else if (row[i] === "free") row[i] = "busy";
        }
      });
    }
    return m;
  }, [people, busy, days]);

  if (people.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "h-9 px-2.5 inline-flex items-center gap-1.5 rounded-[var(--r-sm)] hairline text-[12px] font-medium transition-colors",
          open
            ? "bg-[color:var(--ink)] text-[color:var(--paper)] border-transparent"
            : "text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
        )}
        title="Team availability this week"
      >
        <Users className="h-3.5 w-3.5" />
        Team
      </button>

      {open && (
        <div
          className="absolute right-0 z-40 mt-1.5 w-[320px] paper-card p-0 overflow-hidden"
          style={{ boxShadow: "0 28px 56px -12px rgba(17,17,19,0.22), 0 2px 0 rgba(31,122,82,0.06)" }}
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[color:var(--ink-line)]">
            <span className="quiet-caps !mb-0">This week</span>
            <span className="flex items-center gap-2.5 text-[9px] text-[color:var(--ink-muted)]">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--ink)]" /> busy
              </span>
              <span className="inline-flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-[2px]"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(135deg, rgba(225,29,72,0.35) 0 2px, transparent 2px 4px)",
                  }}
                />
                unavailable
              </span>
            </span>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {people.map((p) => (
              <div
                key={p.key}
                className="flex items-center gap-2 px-3 py-2 border-b border-[color:var(--ink-line)] last:border-0"
              >
                <Avatar name={p.name} size={20} />
                <span className="flex-1 min-w-0 text-[11.5px] text-[color:var(--ink)] truncate">
                  {p.name}
                </span>
                <span className="flex gap-1">
                  {days.map((d, i) => {
                    const state = grid.get(p.key)?.[i] ?? "free";
                    return (
                      <span
                        key={i}
                        title={`${new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(d)}: ${state}`}
                        className={cn(
                          "h-3.5 w-3.5 rounded-[3px] hairline",
                          // var()/NN opacity syntax is broken project-wide — color-mix works.
                          state === "busy" && "bg-[color-mix(in_srgb,var(--ink)_75%,transparent)]",
                          state === "free" && "bg-black/[0.02]",
                        )}
                        style={
                          state === "unavailable"
                            ? {
                                backgroundImage:
                                  "repeating-linear-gradient(135deg, rgba(225,29,72,0.3) 0 2px, transparent 2px 4px)",
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
