"use client";
// Scheduling preferences — the settings surface for how appointments get booked.
// Layout language: quiet gray page, white hairline cards, ink-outlined "on" rows.
// Availability itself (working days, blocked time) lives in the calendar; this
// page holds the booking rules around it.

import * as React from "react";
import Link from "next/link";
import { SquareArrowRight, Sunrise, Sun, Sunset, Moon } from "lucide-react";
import { StyledSelect, type StyledSelectOption } from "@/components/ui/StyledSelect";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

/* ---------------------------------- data --------------------------------- */

function buildTimeOptions(): StyledSelectOption[] {
  const out: StyledSelectOption[] = [];
  for (let m = 5 * 60; m <= 22 * 60; m += 30) {
    const h24 = Math.floor(m / 60);
    const min = m % 60;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const label = `${h12}:${min.toString().padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
    out.push({ id: String(m), label });
  }
  return out;
}
const TIME_OPTIONS = buildTimeOptions();

const MAX_PER_DAY: StyledSelectOption[] = [
  { id: "unlimited", label: "Unlimited" },
  ...[1, 2, 3, 4, 5, 6, 8].map((n) => ({ id: String(n), label: `${n} appointment${n > 1 ? "s" : ""}` })),
];

const MIN_NOTICE: StyledSelectOption[] = [
  { id: "30m", label: "30 minutes" },
  { id: "1h", label: "1 hour" },
  { id: "2h", label: "2 hours" },
  { id: "4h", label: "4 hours" },
  { id: "1d", label: "1 day" },
  { id: "2d", label: "2 days" },
  { id: "1w", label: "1 week" },
];

const BUFFER: StyledSelectOption[] = [
  { id: "0", label: "None" },
  { id: "15", label: "15 minutes" },
  { id: "30", label: "30 minutes" },
  { id: "45", label: "45 minutes" },
  { id: "60", label: "1 hour" },
];

const RESCHEDULE: StyledSelectOption[] = [
  { id: "jobflex", label: "Appointments booked via JobFlex" },
  { id: "any", label: "Any appointment" },
  { id: "never", label: "Never" },
];

const DURATIONS: StyledSelectOption[] = [
  { id: "30", label: "30 minutes" },
  { id: "45", label: "45 minutes" },
  { id: "60", label: "1 hour" },
  { id: "90", label: "90 minutes" },
  { id: "120", label: "2 hours" },
  { id: "240", label: "Half day" },
];

const WINDOWS = [
  { id: "mornings", label: "Mornings", icon: Sunrise },
  { id: "midday", label: "Mid-Day", icon: Sun },
  { id: "afternoons", label: "Afternoons", icon: Sunset },
  { id: "evenings", label: "Evenings", icon: Moon },
] as const;

const REMOTE_OPTIONS = [
  { id: "voice", label: "JobFlex Voice call, agenda & notes" },
  { id: "calendar", label: "Default calendar conferencing (Google/Microsoft)" },
  { id: "custom", label: "Enter custom conference link" },
] as const;

/* ------------------------------- primitives ------------------------------ */

function SwitchVisual({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors",
        on ? "bg-[color:var(--ink)]" : "bg-[color:var(--ink-line)]",
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-all",
          on ? "left-[23px]" : "left-[3px]",
        )}
      />
    </span>
  );
}

function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-[44px] items-center gap-3 text-left"
    >
      <SwitchVisual on={on} />
      <span className={cn("text-[14px]", on ? "text-[color:var(--ink)]" : "text-[color:var(--ink-muted)]")}>
        {label}
      </span>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="quiet-caps mb-2.5">{label}</div>
      {children}
    </div>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mt-4">
      <div className="quiet-caps mb-1.5">{eyebrow}</div>
      <h2 className="font-display text-[24px] tracking-[-0.015em] text-[color:var(--ink)]">
        {title}
      </h2>
    </div>
  );
}

/** Prompt above a group of controls — sentence-case, distinct from field labels. */
function Prompt({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 text-[13px] text-[color:var(--ink-muted)]">{children}</div>;
}

/* --------------------------------- screen -------------------------------- */

export function PreferencesClient() {
  const [dayStart, setDayStart] = React.useState("540"); // 9:00 AM
  const [dayEnd, setDayEnd] = React.useState("1080"); // 6:00 PM
  const [windows, setWindows] = React.useState<Record<string, boolean>>({
    mornings: false,
    midday: true,
    afternoons: true,
    evenings: false,
  });
  const [maxPerDay, setMaxPerDay] = React.useState("unlimited");
  const [minNotice, setMinNotice] = React.useState("1h");
  const [buffer, setBuffer] = React.useState("15");
  const [reschedule, setReschedule] = React.useState("jobflex");
  const [duration, setDuration] = React.useState("");
  const [shorten, setShorten] = React.useState(false);
  const [remote, setRemote] = React.useState("calendar");
  const [customLink, setCustomLink] = React.useState("");

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Availability moved notice */}
      <Card className="flex flex-wrap items-center gap-4 !p-5">
        <SquareArrowRight
          className="h-6 w-6 shrink-0 text-[color:var(--accent)]"
          strokeWidth={1.75}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="quiet-caps mb-0.5">Notice</div>
          <div className="text-[14px] text-[color:var(--ink)]">
            Availability settings have moved to the calendar
          </div>
        </div>
        <Link
          href="/dashboard/calendar"
          className="hairline inline-flex h-10 shrink-0 items-center rounded-[var(--r-md)] bg-white px-4 text-[13px] font-medium text-[color:var(--ink)] transition-colors hover:bg-black/[0.03]"
        >
          Go to Calendar
        </Link>
      </Card>

      <SectionHeading eyebrow="Scheduling" title="Appointment preferences" />

      <Card className="flex flex-col gap-8">
        {/* Working hours */}
        <div>
          <Prompt>What are your normal working hours?</Prompt>
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <StyledSelect
                options={TIME_OPTIONS}
                value={dayStart}
                onChange={setDayStart}
                noneLabel={null}
              />
            </div>
            <span className="shrink-0 text-[12px] font-medium tracking-[0.04em] text-[color:var(--ink-soft)]">
              TO
            </span>
            <div className="min-w-0 flex-1">
              <StyledSelect
                options={TIME_OPTIONS}
                value={dayEnd}
                onChange={setDayEnd}
                noneLabel={null}
              />
            </div>
          </div>
        </div>

        <hr className="border-[color:var(--ink-line)]" />

        {/* Preferred appointment windows */}
        <div>
          <Prompt>Preferred time to meet with clients</Prompt>
          <div className="flex flex-col gap-3">
            {WINDOWS.map((w) => {
              const on = windows[w.id];
              const Icon = w.icon;
              return (
                <button
                  key={w.id}
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={w.label}
                  onClick={() => setWindows((prev) => ({ ...prev, [w.id]: !prev[w.id] }))}
                  className={cn(
                    "flex w-full items-center gap-4 rounded-[var(--r-lg)] border-2 px-5 py-4 text-left transition-colors",
                    on
                      ? "border-[color:var(--ink)]"
                      : "border-[color:var(--ink-line)] hover:border-[color:var(--ink-faint)]",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-6 w-6 shrink-0",
                      on ? "text-[color:var(--ink)]" : "text-[color:var(--ink-faint)]",
                    )}
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      "flex-1 text-[15px]",
                      on ? "font-semibold text-[color:var(--ink)]" : "text-[color:var(--ink-faint)]",
                    )}
                  >
                    {w.label}
                  </span>
                  <SwitchVisual on={on} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Booking rules */}
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          <Field label="Maximum appointments per day">
            <StyledSelect options={MAX_PER_DAY} value={maxPerDay} onChange={setMaxPerDay} noneLabel={null} />
          </Field>
          <Field label="Minimum notice required for booking">
            <StyledSelect options={MIN_NOTICE} value={minNotice} onChange={setMinNotice} noneLabel={null} />
          </Field>
          <Field label="Buffer time between appointments">
            <StyledSelect options={BUFFER} value={buffer} onChange={setBuffer} noneLabel={null} />
          </Field>
          <Field label="Allow clients to reschedule">
            <StyledSelect options={RESCHEDULE} value={reschedule} onChange={setReschedule} noneLabel={null} />
          </Field>
        </div>

        {/* Default duration */}
        <div className="grid items-end gap-x-8 gap-y-6 sm:grid-cols-2">
          <Field label="Default appointment duration">
            <StyledSelect
              options={DURATIONS}
              value={duration}
              onChange={setDuration}
              placeholder=" "
              noneLabel={null}
            />
          </Field>
          <div className="pb-1">
            <Switch on={shorten} onChange={setShorten} label="Shorten appointment durations" />
          </div>
        </div>
      </Card>

      <SectionHeading eyebrow="Meetings" title="Remote preferences" />

      <Card role="radiogroup" aria-label="Remote meeting preference" className="flex flex-col gap-6">
        {REMOTE_OPTIONS.map((o) => {
          const selected = remote === o.id;
          return (
            <React.Fragment key={o.id}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setRemote(o.id)}
                className="flex min-h-[28px] items-center gap-4 text-left"
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 transition-colors",
                    selected ? "border-[color:var(--ink)]" : "border-[color:var(--ink-faint)]",
                  )}
                >
                  {selected && <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--ink)]" />}
                </span>
                <span
                  className={cn(
                    "text-[15px]",
                    selected ? "text-[color:var(--ink)]" : "text-[color:var(--ink-muted)]",
                  )}
                >
                  {o.label}
                </span>
              </button>
              {o.id === "custom" && selected && (
                <div className="pl-[38px]">
                  <Input
                    value={customLink}
                    onChange={(e) => setCustomLink(e.target.value)}
                    placeholder="https://meet.example.com/your-room"
                    aria-label="Custom conference link"
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </Card>
    </div>
  );
}
