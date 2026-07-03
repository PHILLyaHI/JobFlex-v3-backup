"use client";
// Recurring unavailability manager. Workers block their own repeating windows
// ("no work every Saturday", "off 10pm–8am on weekdays"); managers can block
// anyone's. Per-instance overrides ("free up just this Saturday") happen on the
// calendar itself, not here.
//
// Workflow:
//  - Pick one or more weekdays (chips). One rule is created per selected day.
//  - All day → the whole day is blocked; otherwise pick a From/Until window.
//  - If Until is earlier than From the window is treated as OVERNIGHT: it wraps
//    past midnight into the next morning (e.g. 10:00 PM → 8:00 AM).
//  - Adding closes the sheet; the blocks then show on the calendar.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, Repeat, Moon } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/settings/Toggle";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { createUnavailabilityRule, deleteUnavailabilityRule } from "@/actions/availability";

export interface UnavailabilityRuleRow {
  id: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  reason: string;
  ownerId: string;
  ownerName: string;
}

export interface UnavailabilityPerson {
  userId: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  rules: UnavailabilityRuleRow[];
  /** Selectable owners. Empty → rules are created for the caller only. */
  people: UnavailabilityPerson[];
  selfUserId: string;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_ABBR = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function minutesLabel(min: number): string {
  if (min >= 1440) return "Midnight";
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}

function isAllDay(startMinute: number, endMinute: number) {
  return startMinute <= 0 && endMinute >= 1440;
}
function isOvernight(startMinute: number, endMinute: number) {
  return !isAllDay(startMinute, endMinute) && endMinute <= startMinute;
}

function ruleWindowLabel(r: { startMinute: number; endMinute: number }) {
  if (isAllDay(r.startMinute, r.endMinute)) return "All day";
  const span = `${minutesLabel(r.startMinute)}–${minutesLabel(r.endMinute)}`;
  return isOvernight(r.startMinute, r.endMinute) ? `${span} (next day)` : span;
}

// 30-minute steps across the day for the time selects.
const TIME_STEPS = Array.from({ length: 49 }, (_, i) => i * 30);

export function UnavailabilitySheetA({ open, onClose, rules, people, selfUserId }: Props) {
  const router = useRouter();
  const [ownerId, setOwnerId] = React.useState(selfUserId);
  const [days, setDays] = React.useState<number[]>([6]); // Saturday — common case
  const [allDay, setAllDay] = React.useState(false);
  const [startMinute, setStartMinute] = React.useState(8 * 60);
  const [endMinute, setEndMinute] = React.useState(12 * 60);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    // rAF keeps the reset out of the effect body (avoids the cascading-render warning).
    const r = requestAnimationFrame(() => {
      setOwnerId(selfUserId);
      setDays([6]);
      setAllDay(false);
      setStartMinute(8 * 60);
      setEndMinute(12 * 60);
      setReason("");
    });
    return () => cancelAnimationFrame(r);
  }, [open, selfUserId]);

  function toggleDay(i: number) {
    setDays((prev) => (prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i].sort()));
  }

  const overnight = isOvernight(startMinute, endMinute);

  async function add() {
    if (days.length === 0) {
      toast.error("Pick at least one day");
      return;
    }
    const start = allDay ? 0 : startMinute;
    const end = allDay ? 1440 : endMinute;
    if (!allDay && start === end) {
      toast.error("Start and end can't be the same time");
      return;
    }
    setBusy(true);
    try {
      // One rule per selected weekday so each can be freed individually later.
      for (const dayOfWeek of days) {
        await createUnavailabilityRule({
          ownerId,
          dayOfWeek,
          startMinute: start,
          endMinute: end,
          reason: reason.trim() || "Unavailable",
        });
      }
      toast.success(
        days.length > 1 ? `Added ${days.length} recurring blocks` : "Recurring block added",
      );
      router.refresh();
      onClose();
    } catch (err: any) {
      toast.error("Couldn't add", err?.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteUnavailabilityRule(id);
      toast.success("Rule removed");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't remove", err?.message);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Recurring unavailability"
      description="Repeats every week until removed. Free a single date from the calendar itself."
      width="min(440px, 100vw)"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
          <Button loading={busy} onClick={add} icon={<Repeat className="h-3.5 w-3.5" />}>
            Add block
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {people.length > 0 && (
          <Select label="Who" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            {people.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.name}
                {p.userId === selfUserId ? " (you)" : ""}
              </option>
            ))}
          </Select>
        )}

        <div>
          <div className="quiet-caps mb-1.5">Repeat on</div>
          <div className="flex gap-1.5">
            {DAY_ABBR.map((abbr, i) => {
              const on = days.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(i)}
                  className={cn(
                    "h-9 flex-1 rounded-[var(--r-sm)] text-[12px] font-medium transition-colors hairline",
                    on
                      ? "bg-[color:var(--accent)] text-[color:var(--paper)] border-transparent"
                      : "text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
                  )}
                >
                  {abbr}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-[var(--r-md)] hairline px-3">
          <Toggle
            checked={allDay}
            onChange={setAllDay}
            label="All day"
            description="Blocks the entire day — no working hours."
          />
        </div>

        {!allDay && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="From"
                value={String(startMinute)}
                onChange={(e) => setStartMinute(Number(e.target.value))}
              >
                {TIME_STEPS.slice(0, -1).map((m) => (
                  <option key={m} value={m}>
                    {minutesLabel(m)}
                  </option>
                ))}
              </Select>
              <Select
                label="Until"
                value={String(endMinute)}
                onChange={(e) => setEndMinute(Number(e.target.value))}
              >
                {TIME_STEPS.slice(1).map((m) => (
                  <option key={m} value={m}>
                    {minutesLabel(m)}
                  </option>
                ))}
              </Select>
            </div>
            {overnight && (
              <div className="flex items-start gap-2 rounded-[var(--r-sm)] bg-[color-mix(in_srgb,var(--accent-soft)_40%,transparent)] px-3 py-2">
                <Moon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[color:var(--accent-ink)]" />
                <p className="text-[11px] text-[color:var(--accent-ink)] leading-relaxed">
                  Overnight — ends {minutesLabel(endMinute)} the next morning. Good for
                  &ldquo;no work after {minutesLabel(startMinute)}.&rdquo;
                </p>
              </div>
            )}
          </>
        )}

        <Input
          label="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Family time, second job, sleep…"
        />

        <div>
          <div className="quiet-caps mb-1.5">Active rules</div>
          {rules.length === 0 ? (
            <p className="text-[11px] text-[color:var(--ink-muted)]">
              No recurring unavailability yet.
            </p>
          ) : (
            <ul className="paper-card overflow-hidden divide-y divide-[color:var(--ink-line)]">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-medium text-[color:var(--ink)] truncate">
                      Every {DAYS[r.dayOfWeek]} · {ruleWindowLabel(r)}
                    </div>
                    <div className="text-[10px] text-[color:var(--ink-muted)] truncate">
                      {r.ownerName} · {r.reason}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(r.id)}
                    className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:text-[color:var(--rose)] hover:bg-black/[0.04] transition-colors"
                    aria-label="Remove rule"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Sheet>
  );
}
