"use client";
import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Activity, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { listStagger, listItem } from "@/lib/theme/motion";

export type TeamActivityRow = {
  id: string;
  kind: string;
  summary: string;
  createdAt: string; // ISO string
  actorId: string | null;
  actorName: string | null;
  proposalTitle: string | null;
  clientName: string | null;
};

// Each event reads as a sentence; the verb carries the only colour. Routine
// actions (created/edited) stay ink so the coloured verbs — accepted, paid,
// scheduled, completed — read as the signal. (Status-Is-Not-Decoration.)
const VERB: Record<string, string> = {
  CREATED: "created",
  EDITED: "edited",
  SENT: "sent",
  VIEWED: "viewed",
  ACCEPTED: "accepted",
  PAID: "marked paid",
  SCHEDULED: "scheduled",
  COMPLETED: "completed",
  DECLINED: "declined",
  UPDATED: "updated",
};

const VERB_CLASS: Record<string, string> = {
  CREATED: "text-[color:var(--ink-soft)]",
  EDITED: "text-[color:var(--ink-soft)]",
  SENT: "text-sky-700",
  VIEWED: "text-[color:var(--ink-muted)]",
  ACCEPTED: "text-[color:var(--accent)]",
  PAID: "text-[color:var(--accent)]",
  SCHEDULED: "text-amber-700",
  COMPLETED: "text-emerald-700",
  DECLINED: "text-rose-700",
  UPDATED: "text-[color:var(--ink-soft)]",
};

// Tiny status bead on the avatar corner. Routine kinds use the hairline tone
// (barely there); only state-bearing kinds light up.
const BEAD_CLASS: Record<string, string> = {
  CREATED: "bg-[color:var(--ink-line)]",
  EDITED: "bg-[color:var(--ink-line)]",
  SENT: "bg-sky-500",
  VIEWED: "bg-[color:var(--ink-line)]",
  ACCEPTED: "bg-[color:var(--accent)]",
  PAID: "bg-[color:var(--accent)]",
  SCHEDULED: "bg-amber-500",
  COMPLETED: "bg-emerald-500",
  DECLINED: "bg-rose-500",
  UPDATED: "bg-[color:var(--ink-line)]",
};

const PAGE = 12;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(d);
}

function timeOfDay(iso: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );
}

function objectLine(row: TeamActivityRow) {
  if (row.proposalTitle) {
    return [row.proposalTitle, row.clientName].filter(Boolean).join("  ·  ");
  }
  if (row.clientName) return row.clientName;
  return row.summary;
}

export type TeamMember = { id: string; name: string };

export function TeamActivity({
  activities,
  members,
}: {
  activities: TeamActivityRow[];
  members: TeamMember[];
}) {
  const reduce = useReducedMotion();
  const [filter, setFilter] = React.useState<string | null>(null);
  const [visible, setVisible] = React.useState(PAGE);

  const filtered = React.useMemo(
    () => (filter ? activities.filter((a) => a.actorId === filter) : activities),
    [activities, filter],
  );

  const shown = filtered.slice(0, visible);

  const groups: { label: string; rows: TeamActivityRow[] }[] = [];
  for (const row of shown) {
    const label = dayLabel(row.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }

  return (
    <section className="mt-10">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <div className="quiet-caps mb-1.5">Team activity</div>
          <h2 className="font-display text-[22px] tracking-[-0.018em] leading-none">Who did what</h2>
          <p className="mt-2 text-[12.5px] text-[color:var(--ink-muted)]">
            Every move across proposals and jobs, newest first.
          </p>
        </div>

        {members.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => { setFilter(null); setVisible(PAGE); }}
              aria-pressed={filter === null}
              className={cn(
                "inline-flex h-8 items-center justify-center rounded-full px-4 text-[12px] font-medium transition-colors",
                filter === null
                  ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
                  : "text-[color:var(--ink-muted)] hover:bg-black/[0.04] hairline",
              )}
            >
              Everyone
            </button>
            <PersonFilter
              members={members}
              selected={filter}
              onSelect={(id) => { setFilter(id); setVisible(PAGE); }}
            />
          </div>
        )}
      </div>

      {/* Feed */}
      {filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Activity className="h-5 w-5" />}
            title="No team activity yet"
            description="As your team creates, sends, schedules, and completes work, it threads here in order."
          />
        </div>
      ) : (
        <div className="mt-6 paper-card px-4 py-2 sm:px-6">
          {groups.map((g) => (
            <div key={g.label} className="py-2">
              {/* Day rule */}
              <div className="flex items-center gap-3 px-1 pt-3 pb-1">
                <span className="quiet-caps !mb-0 text-[color:var(--ink-faint)]">{g.label}</span>
                <span aria-hidden className="h-px flex-1 bg-[color:var(--ink-line)]" />
                <span className="text-[11px] tabular text-[color:var(--ink-faint)]">{g.rows.length}</span>
              </div>

              {/* Spine + nodes */}
              <motion.ol
                className="relative"
                variants={listStagger}
                initial={reduce ? false : "initial"}
                animate="animate"
              >
                <span
                  aria-hidden
                  className="absolute left-[28px] top-4 bottom-4 w-px bg-[color:var(--ink-line)]"
                />
                {g.rows.map((row) => {
                  const verb = VERB[row.kind] ?? row.kind.toLowerCase();
                  const name = row.actorName ?? "Client";
                  return (
                    <motion.li
                      key={row.id}
                      variants={listItem}
                      className="group relative flex items-start gap-3 rounded-[10px] px-2.5 py-3 transition-colors hover:bg-black/[0.018]"
                    >
                      {/* Avatar node with status bead, ringed in paper so the spine reads behind it */}
                      <span className="relative z-[1] shrink-0">
                        <Avatar
                          name={name}
                          size={36}
                          className="ring-[3px] ring-[color:var(--paper)]"
                        />
                        <span
                          aria-hidden
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-[2.5px] ring-[color:var(--paper)]",
                            BEAD_CLASS[row.kind] ?? "bg-[color:var(--ink-line)]",
                          )}
                        />
                      </span>

                      {/* Sentence */}
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="text-[13.5px] leading-snug">
                          <span className="font-medium text-[color:var(--ink)]">{name}</span>{" "}
                          <span className={cn("font-medium", VERB_CLASS[row.kind] ?? "text-[color:var(--ink-soft)]")}>
                            {verb}
                          </span>
                        </p>
                        <p className="mt-0.5 text-[12px] leading-snug text-[color:var(--ink-muted)] truncate">
                          {objectLine(row)}
                        </p>
                      </div>

                      <time className="shrink-0 pt-1 text-[11px] tabular text-[color:var(--ink-faint)] group-hover:text-[color:var(--ink-muted)]">
                        {timeOfDay(row.createdAt)}
                      </time>
                    </motion.li>
                  );
                })}
              </motion.ol>
            </div>
          ))}

          {visible < filtered.length && (
            <div className="border-t border-[color:var(--ink-line)] py-3 text-center">
              <button
                type="button"
                onClick={() => setVisible((v) => v + PAGE)}
                className="text-[12px] font-medium text-[color:var(--accent)] transition-opacity hover:opacity-70"
              >
                Show {Math.min(PAGE, filtered.length - visible)} more
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PersonFilter({
  members,
  selected,
  onSelect,
}: {
  members: TeamMember[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectedMember = selected ? members.find((m) => m.id === selected) ?? null : null;
  const active = !!selectedMember;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full text-[12px] font-medium transition-colors",
          active
            ? "bg-[color:var(--ink)] pl-1.5 pr-2.5 text-[color:var(--paper)]"
            : "px-3.5 text-[color:var(--ink-muted)] hover:bg-black/[0.04] hairline",
        )}
      >
        {selectedMember ? (
          <>
            <Avatar name={selectedMember.name} size={20} />
            <span className="max-w-[8rem] truncate">{selectedMember.name.split(" ")[0]}</span>
          </>
        ) : (
          <span>By person</span>
        )}
        <ChevronDown className={cn("h-3.5 w-3.5 opacity-70 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-20 mt-1.5 w-60 overflow-hidden rounded-[12px] border border-[color:var(--ink-line)] bg-[color:var(--paper)] py-1 shadow-[var(--shadow-md)]"
        >
          <div className="max-h-72 overflow-y-auto">
            {members.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-[color:var(--ink-muted)]">No team members</div>
            ) : (
              members.map((m) => {
                const isSel = m.id === selected;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    onClick={() => {
                      onSelect(m.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-black/[0.04]",
                      isSel && "bg-[color:var(--accent-soft)]",
                    )}
                  >
                    <Avatar name={m.name} size={26} />
                    <span className="min-w-0 flex-1 truncate text-[color:var(--ink)]">{m.name}</span>
                    {isSel && <Check className="h-4 w-4 shrink-0 text-[color:var(--accent)]" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
