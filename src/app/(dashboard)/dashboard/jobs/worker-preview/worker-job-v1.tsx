import type { ElementType } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import {
  MapPin,
  Navigation,
  CalendarPlus,
  Clock,
  Users,
  ClipboardList,
  ImageIcon,
  CheckCircle2,
  Hourglass,
  XCircle,
} from "lucide-react";
import {
  type WorkerJobVM,
  whenLabel,
  longDate,
  timeRange,
  directionsUrl,
  gcalUrl,
} from "./vm";

// ── V1 · "Field Command" (frontend-design) · bento layout ────────────────────
// Bold, high-contrast work order laid out as a full-width dashboard grid: a
// charcoal command hero across the top, then mixed-size tiles (When / Where /
// Status, Scope + Schedule, Crew + Photos) that fill the screen instead of a
// lonely centered column.
export function WorkerJobV1({ job }: { job: WorkerJobVM }) {
  const cfg = ASSIGN[job.assignmentStatus] ?? ASSIGN.PENDING;
  const StatusIcon = cfg.icon;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Command hero — full-width charcoal anchor */}
        <header className="overflow-hidden rounded-[var(--r-lg)] bg-[color:var(--ink)] p-6 shadow-[var(--shadow-md)] sm:p-8 lg:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
              Work order · #{job.id.slice(0, 6).toUpperCase()}
            </span>
            <span className="rounded-full bg-[color:var(--accent)] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-white">
              {job.status.replace("_", " ").toLowerCase()}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div className="min-w-0">
              <h1 className="font-display text-[30px] leading-[1.02] tracking-[-0.025em] text-white sm:text-[42px]">
                {job.title}
              </h1>
              {job.clientName && (
                <p className="mt-2 text-[13.5px] text-white/55">for {job.clientName}</p>
              )}
            </div>
            {job.startsAt && (
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-[13px] font-semibold text-white">
                  <Clock className="h-3.5 w-3.5" />
                  {whenLabel(job.startsAt)}
                </span>
                <span className="hidden text-[12.5px] tabular text-white/45 sm:inline">
                  {longDate(job.startsAt)}
                </span>
              </div>
            )}
          </div>
        </header>

        {/* When — sage tile */}
        <div className="flex flex-col rounded-[var(--r-lg)] bg-[color:var(--accent-soft)] p-5 shadow-[var(--shadow-sm)]">
          <TileLabel tone="accent" icon={Clock}>
            When
          </TileLabel>
          {job.startsAt ? (
            <>
              <div className="mt-2.5 font-display text-[26px] leading-none tracking-[-0.02em] text-[color:var(--accent-ink)]">
                {whenLabel(job.startsAt)}
              </div>
              <div className="mt-2.5 text-[13px] tabular text-[color:var(--ink-soft)]">
                {longDate(job.startsAt)}
              </div>
              <div className="text-[12.5px] tabular text-[color:var(--ink-muted)]">
                {timeRange(job.startsAt, job.endsAt)}
              </div>
              <a
                href={gcalUrl(job.title, job.startsAt, job.endsAt, job.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-[var(--r-md)] bg-[color:var(--paper)] px-3.5 text-[12.5px] font-semibold text-[color:var(--accent-ink)] hairline transition-colors hover:bg-white focus-ring"
              >
                <CalendarPlus className="h-4 w-4" /> Add to calendar
              </a>
            </>
          ) : (
            <div className="mt-2.5 font-display text-[20px] text-[color:var(--ink-soft)]">
              Not scheduled
            </div>
          )}
        </div>

        {/* Where — directions tile */}
        <div className="flex flex-col paper-card p-5 !shadow-[var(--shadow-sm)]">
          <TileLabel icon={MapPin}>Where</TileLabel>
          {job.clientName && (
            <div className="mt-2.5 text-[14px] font-semibold text-[color:var(--ink)]">
              {job.clientName}
            </div>
          )}
          <div className="mt-0.5 text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
            {job.address ?? "No address on file"}
          </div>
          {job.address && (
            <a
              href={directionsUrl(job.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-[var(--r-md)] bg-[color:var(--accent)] px-4 text-[13px] font-semibold text-white shadow-[var(--shadow-sm)] transition-all hover:bg-[color:var(--accent-ink)] active:scale-[0.99] focus-ring"
            >
              <Navigation className="h-4 w-4" /> Get directions
            </a>
          )}
        </div>

        {/* Status — color-blocked assignment tile */}
        <div className={cn("flex flex-col rounded-[var(--r-lg)] p-5", cfg.wrap)}>
          <span
            className={cn(
              "grid h-12 w-12 place-items-center rounded-full shadow-[var(--shadow-sm)]",
              cfg.iconWrap,
            )}
          >
            <StatusIcon className="h-6 w-6" strokeWidth={2.2} />
          </span>
          <div className="mt-auto pt-4">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] opacity-70">
              Your assignment
            </div>
            <div className="font-display text-[18px] leading-tight tracking-[-0.01em]">
              {cfg.label}
            </div>
            <div className="mt-0.5 text-[12.5px] leading-snug opacity-80">{cfg.sub}</div>
          </div>
        </div>

        {/* Scope — wide tile */}
        {job.scope && (
          <div className="paper-card p-6 lg:col-span-2">
            <TileLabel icon={ClipboardList}>Scope of work</TileLabel>
            <p className="mt-3 whitespace-pre-wrap text-[14px] leading-[1.65] text-[color:var(--ink-soft)]">
              {job.scope}
            </p>
          </div>
        )}

        {/* Schedule — timeline tile */}
        {job.events.length > 0 && (
          <div className="paper-card p-6">
            <TileLabel icon={Clock}>Schedule</TileLabel>
            <ol className="mt-4">
              {job.events.map((e, i) => {
                const last = i === job.events.length - 1;
                return (
                  <li key={e.id} className="relative flex gap-3.5 pb-5 last:pb-0">
                    {!last && (
                      <span className="absolute left-[11px] top-6 bottom-0 w-px bg-[color:var(--ink-line)]" />
                    )}
                    <span className="relative z-10 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-[color:var(--accent-soft)]">
                      <span className="h-2 w-2 rounded-full bg-[color:var(--accent)]" />
                    </span>
                    <div className="min-w-0 flex-1 pt-0">
                      <div className="text-[13.5px] font-semibold text-[color:var(--ink)]">
                        {e.title}
                      </div>
                      <div className="mt-0.5 text-[11.5px] tabular text-[color:var(--ink-muted)]">
                        {longDate(e.startsAt)} · {whenLabel(e.startsAt)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {/* Crew — tile */}
        {job.crew.length > 0 && (
          <div className="paper-card p-5">
            <TileLabel icon={Users}>
              Crew <span className="tabular text-[color:var(--ink-faint)]">{job.crew.length}</span>
            </TileLabel>
            <ul className="mt-3 space-y-2.5">
              {job.crew.map((c) => (
                <li key={c.id} className="flex items-center gap-2.5">
                  <Avatar name={c.name} size={28} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-[color:var(--ink)]">
                      {c.name}
                      {c.isMe && (
                        <span className="ml-1.5 text-[11px] font-medium text-[color:var(--accent-ink)]">
                          you
                        </span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-[color:var(--ink-muted)]">{c.role}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Photos — wide tile */}
        {job.photos.length > 0 && (
          <div className="paper-card p-5 lg:col-span-2">
            <TileLabel icon={ImageIcon}>
              Site photos{" "}
              <span className="tabular text-[color:var(--ink-faint)]">{job.photos.length}</span>
            </TileLabel>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {job.photos.map((p) => (
                <a
                  key={p.id}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative aspect-square overflow-hidden rounded-[var(--r-md)] hairline focus-ring"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.kind ?? "Site photo"}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
                  />
                  {p.kind && (
                    <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-white">
                      {p.kind.toLowerCase()}
                    </span>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TileLabel({
  icon: Icon,
  tone = "muted",
  children,
}: {
  icon: ElementType;
  tone?: "muted" | "accent";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em]",
        tone === "accent" ? "text-[color:var(--accent-ink)]" : "text-[color:var(--ink-faint)]",
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {children}
    </div>
  );
}

const ASSIGN: Record<
  string,
  { icon: ElementType; label: string; sub: string; wrap: string; iconWrap: string }
> = {
  ACCEPTED: {
    icon: CheckCircle2,
    label: "You're confirmed",
    sub: "You're on the crew. Everything you need is here.",
    wrap: "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]",
    iconWrap: "bg-[color:var(--accent)] text-white",
  },
  PENDING: {
    icon: Hourglass,
    label: "Awaiting your confirmation",
    sub: "Accept or decline from your invite so the office knows.",
    wrap: "bg-amber-50 text-amber-900",
    iconWrap: "bg-amber-500 text-white",
  },
  DECLINED: {
    icon: XCircle,
    label: "You declined this job",
    sub: "Message your manager if that was a mistake.",
    wrap: "bg-rose-50 text-rose-900",
    iconWrap: "bg-rose-500 text-white",
  },
  COMPLETED: {
    icon: CheckCircle2,
    label: "Job complete",
    sub: "Nice work. This one is wrapped up.",
    wrap: "bg-emerald-50 text-emerald-900",
    iconWrap: "bg-emerald-600 text-white",
  },
};
