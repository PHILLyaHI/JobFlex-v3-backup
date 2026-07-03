import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import { Navigation, CalendarPlus } from "lucide-react";
import {
  type WorkerJobVM,
  whenLabel,
  longDate,
  timeRange,
  directionsUrl,
  gcalUrl,
} from "./vm";

// ── V2 · "The Well-Kept Shop, field edition" (impeccable) ────────────────────
// One refined work-order sheet, hairline-divided. Restrained: tinted neutrals,
// a single confident sage accent (the countdown, the directions, the timeline
// nodes). Whitespace does the separating; nothing shouts. Craft over drama.
export function WorkerJobV2({ job }: { job: WorkerJobVM }) {
  const status = STATUS[job.assignmentStatus] ?? STATUS.PENDING;

  return (
    <div className="mx-auto max-w-2xl">
      <article className="paper-card p-7 sm:p-9">
        {/* Dateline */}
        <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.16em] text-[color:var(--ink-faint)]">
          <span>JobFlex · Work order</span>
          <span className="tabular">No. {job.id.slice(0, 6).toUpperCase()}</span>
        </div>

        {/* Title + byline */}
        <h1 className="mt-5 font-display text-[28px] leading-[1.08] tracking-[-0.02em] text-[color:var(--ink)] sm:text-[34px]">
          {job.title}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[color:var(--ink-muted)]">
          {job.clientName && <span>{job.clientName}</span>}
          <span className={cn("inline-flex items-center gap-1.5", status.text)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
            {status.label}
          </span>
        </div>

        {/* Facts ledger — whitespace-separated, no boxes */}
        <dl className="mt-8 grid gap-7 border-t border-[color:var(--ink-line)] pt-7 sm:grid-cols-3 sm:gap-8">
          <div>
            <dt className="quiet-caps">When</dt>
            {job.startsAt ? (
              <dd className="mt-2">
                <div className="font-display text-[19px] leading-none tracking-[-0.01em] text-[color:var(--accent-ink)]">
                  {whenLabel(job.startsAt)}
                </div>
                <div className="mt-2 text-[12.5px] tabular text-[color:var(--ink-soft)]">
                  {longDate(job.startsAt)}
                </div>
                <div className="text-[12.5px] tabular text-[color:var(--ink-muted)]">
                  {timeRange(job.startsAt, job.endsAt)}
                </div>
              </dd>
            ) : (
              <dd className="mt-2 text-[13px] text-[color:var(--ink-muted)]">Not scheduled</dd>
            )}
          </div>

          <div>
            <dt className="quiet-caps">Where</dt>
            <dd className="mt-2 text-[13px] leading-relaxed text-[color:var(--ink-soft)]">
              {job.address ?? "No address on file"}
            </dd>
          </div>

          <div>
            <dt className="quiet-caps">Crew</dt>
            <dd className="mt-2 text-[13px] text-[color:var(--ink-soft)]">
              {job.crew.length > 0 ? (
                <>
                  <span className="font-medium text-[color:var(--ink)]">{job.crew.length}</span>{" "}
                  on site
                </>
              ) : (
                "Unassigned"
              )}
            </dd>
          </div>
        </dl>

        {/* Quiet actions */}
        {(job.address || job.startsAt) && (
          <div className="mt-6 flex flex-wrap gap-2.5">
            {job.address && (
              <a
                href={directionsUrl(job.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-[var(--r-md)] px-4 text-[13px] font-medium text-[color:var(--accent-ink)] hairline transition-colors hover:bg-[color:var(--accent-soft)] focus-ring"
              >
                <Navigation className="h-4 w-4" /> Directions
              </a>
            )}
            {job.startsAt && (
              <a
                href={gcalUrl(job.title, job.startsAt, job.endsAt, job.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-[var(--r-md)] px-4 text-[13px] font-medium text-[color:var(--ink-soft)] hairline transition-colors hover:bg-black/[0.03] focus-ring"
              >
                <CalendarPlus className="h-4 w-4" /> Add to calendar
              </a>
            )}
          </div>
        )}

        {/* Scope — editorial measure */}
        {job.scope && (
          <section className="mt-8 border-t border-[color:var(--ink-line)] pt-7">
            <div className="quiet-caps">Scope of work</div>
            <p className="mt-2.5 max-w-[68ch] whitespace-pre-wrap text-[13.5px] leading-[1.7] text-[color:var(--ink-soft)]">
              {job.scope}
            </p>
          </section>
        )}

        {/* Schedule — minimal timeline */}
        {job.events.length > 0 && (
          <section className="mt-8 border-t border-[color:var(--ink-line)] pt-7">
            <div className="quiet-caps mb-4">Schedule</div>
            <ol>
              {job.events.map((e, i) => {
                const last = i === job.events.length - 1;
                return (
                  <li key={e.id} className="relative flex gap-3.5 pb-4 last:pb-0">
                    {!last && (
                      <span className="absolute left-[3.5px] top-3.5 bottom-0 w-px bg-[color:var(--ink-line)]" />
                    )}
                    <span className="relative z-10 mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[color:var(--accent)]" />
                    <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-[color:var(--ink)]">
                          {e.title}
                        </div>
                        <div className="mt-0.5 text-[11.5px] tabular text-[color:var(--ink-muted)]">
                          {longDate(e.startsAt)} · {timeRange(e.startsAt, e.endsAt)}
                        </div>
                      </div>
                      <span className="shrink-0 text-[11.5px] tabular text-[color:var(--ink-faint)]">
                        {whenLabel(e.startsAt)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {/* Crew — refined list */}
        {job.crew.length > 0 && (
          <section className="mt-8 border-t border-[color:var(--ink-line)] pt-7">
            <div className="quiet-caps mb-3.5">On the crew</div>
            <ul className="space-y-2.5">
              {job.crew.map((c) => (
                <li key={c.id} className="flex items-center gap-3">
                  <Avatar name={c.name} size={30} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-[color:var(--ink)]">
                      {c.name}
                      {c.isMe && (
                        <span className="ml-1.5 text-[11px] font-normal text-[color:var(--accent-ink)]">
                          you
                        </span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-[color:var(--ink-muted)]">{c.role}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Photos — clean grid */}
        {job.photos.length > 0 && (
          <section className="mt-8 border-t border-[color:var(--ink-line)] pt-7">
            <div className="quiet-caps mb-3.5">Site photos</div>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {job.photos.map((p) => (
                <a
                  key={p.id}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative aspect-square overflow-hidden rounded-[var(--r-sm)] hairline focus-ring"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.kind ?? "Site photo"}
                    className="h-full w-full object-cover"
                  />
                </a>
              ))}
            </div>
          </section>
        )}
      </article>
    </div>
  );
}

const STATUS: Record<string, { label: string; text: string; dot: string }> = {
  ACCEPTED: {
    label: "Confirmed",
    text: "text-[color:var(--accent-ink)]",
    dot: "bg-[color:var(--accent)]",
  },
  PENDING: { label: "Awaiting confirmation", text: "text-amber-700", dot: "bg-amber-500" },
  DECLINED: { label: "Declined", text: "text-rose-700", dot: "bg-rose-500" },
  COMPLETED: { label: "Complete", text: "text-emerald-700", dot: "bg-emerald-600" },
};
