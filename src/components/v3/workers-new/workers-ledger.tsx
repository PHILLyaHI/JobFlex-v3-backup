"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Plus,
  ArrowUpRight,
  Copy,
  Check,
  AlertCircle,
  ChevronRight,
  X,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";
import { createWorkerInvite, revokeWorker } from "@/actions/workers";

export interface LedgerEntry {
  id: string;
  folio: number;
  name: string;
  email: string | null;
  phone: string | null;
  specialties: string[];
  hourlyRate: number | null;
  token: string;
  joinedISO: string;
  activeJobs: {
    id: string;
    status: string;
    jobId: string;
    jobTitle: string;
    jobStatus: string;
  }[];
}

type FilterKey = "all" | "on-job" | "available" | "unrated";

export function WorkersLedger({ entries: serverEntries }: { entries: LedgerEntry[] }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = React.useState(false);

  const counts = React.useMemo(() => {
    const all = serverEntries.length;
    const onJob = serverEntries.filter((e) => e.activeJobs.length > 0).length;
    const available = serverEntries.filter((e) => e.activeJobs.length === 0).length;
    const unrated = serverEntries.filter((e) => e.specialties.length === 0).length;
    return { all, onJob, available, unrated };
  }, [serverEntries]);

  const totalActive = React.useMemo(
    () => serverEntries.reduce((sum, e) => sum + e.activeJobs.length, 0),
    [serverEntries],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return serverEntries.filter((e) => {
      if (filter === "on-job" && e.activeJobs.length === 0) return false;
      if (filter === "available" && e.activeJobs.length > 0) return false;
      if (filter === "unrated" && e.specialties.length > 0) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        (e.email ?? "").toLowerCase().includes(q) ||
        e.specialties.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [serverEntries, query, filter]);

  const selected = React.useMemo(
    () => serverEntries.find((e) => e.id === selectedId) ?? null,
    [serverEntries, selectedId],
  );

  return (
    <div className="min-h-screen bg-[color:var(--paper)] text-[color:var(--ink)]">
      <div className="mx-auto max-w-[1480px] px-8 pb-16 pt-10">
        {/* ─── Header band ─────────────────────────────────────────────── */}
        <header className="flex items-end justify-between gap-6 border-b border-[color:var(--ink-line)] pb-6">
          <div className="min-w-0">
            <div className="quiet-caps mb-3 flex items-center gap-2">
              <span>Crew</span>
              <span className="text-[color:var(--ink-faint)]">/</span>
              <span>Roster</span>
              <span className="text-[color:var(--ink-faint)]">/</span>
              <span className="tabular">
                Folio No. {String(serverEntries.length).padStart(2, "0")}
              </span>
            </div>
            <h1 className="font-display text-[44px] leading-none tracking-[-0.02em]">
              Workers
            </h1>
            <p className="mt-3 max-w-[58ch] text-[13px] leading-[1.7] text-[color:var(--ink-muted)]">
              The crew on your books — specialties they cover, jobs they&apos;re carrying, and the
              portal links you hand out. Pick a name to inspect.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="w-[280px]">
              <Input
                placeholder="Search name, email, specialty…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                prefix={<Search className="h-3.5 w-3.5" />}
              />
            </div>
            <Button
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setInviteOpen(true)}
            >
              Invite worker
            </Button>
          </div>
        </header>

        {/* ─── Stat filter tiles ───────────────────────────────────────── */}
        <motion.section
          className="mt-8 grid grid-cols-4 gap-4"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
        >
          <StatFilterTile
            label="All crew"
            value={counts.all}
            hint="on the books"
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <StatFilterTile
            label="On a job"
            value={counts.onJob}
            hint={`${totalActive} active assignment${totalActive === 1 ? "" : "s"}`}
            active={filter === "on-job"}
            onClick={() => setFilter("on-job")}
          />
          <StatFilterTile
            label="Available"
            value={counts.available}
            hint="no live work"
            active={filter === "available"}
            onClick={() => setFilter("available")}
          />
          <StatFilterTile
            label="Needs specialties"
            value={counts.unrated}
            hint="empty profile"
            active={filter === "unrated"}
            onClick={() => setFilter("unrated")}
          />
        </motion.section>

        {/* ─── Sub-toolbar ─────────────────────────────────────────────── */}
        <div className="mt-8 flex items-baseline justify-between border-b border-[color:var(--ink-line)] pb-3">
          <div className="quiet-caps">
            Showing <span className="tabular">{filtered.length}</span> of{" "}
            <span className="tabular">{serverEntries.length}</span>
          </div>
          {filter !== "all" && (
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--ink-muted)] transition-colors hover:text-[color:var(--ink)]"
            >
              <RotateCcw className="h-3 w-3" />
              clear filter
            </button>
          )}
        </div>

        {/* ─── Workspace: ledger + inspector ───────────────────────────── */}
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)_380px] gap-8">
          <main className="min-w-0">
            {filtered.length === 0 ? (
              <LedgerEmpty
                hasEntries={serverEntries.length > 0}
                onInvite={() => setInviteOpen(true)}
              />
            ) : (
              <motion.ul
                className="border-t border-[color:var(--ink-line)]"
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.02 } } }}
              >
                {filtered.map((entry) => (
                  <LedgerRow
                    key={entry.id}
                    entry={entry}
                    selected={entry.id === selectedId}
                    onSelect={() => setSelectedId(entry.id)}
                  />
                ))}
              </motion.ul>
            )}
          </main>

          <aside className="sticky top-8 self-start">
            <AnimatePresence mode="wait" initial={false}>
              {selected ? (
                <InspectorWorker
                  key={selected.id}
                  entry={selected}
                  onClose={() => setSelectedId(null)}
                  onRevoke={async () => {
                    try {
                      await revokeWorker(selected.id);
                      router.refresh();
                      toast.success("Access revoked", "Magic link rotated — the old one is dead.");
                    } catch (err) {
                      toast.error("Revoke failed", (err as Error)?.message);
                    }
                  }}
                />
              ) : (
                <InspectorEmpty key="empty" totalActive={totalActive} counts={counts} />
              )}
            </AnimatePresence>
          </aside>
        </div>
      </div>

      <InviteSheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={() => router.refresh()}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Stat filter tile
// ───────────────────────────────────────────────────────────────────────────
function StatFilterTile({
  label,
  value,
  hint,
  active,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
      onClick={onClick}
      className={cn(
        "focus-ring group relative flex flex-col items-start gap-3 rounded-[var(--r-lg)] bg-white px-5 py-5 text-left transition-shadow",
        active
          ? "shadow-[inset_0_0_0_1px_var(--accent),0_1px_0_rgba(17,17,19,0.04),0_4px_16px_-8px_rgba(17,17,19,0.10)]"
          : "shadow-[inset_0_0_0_0.5px_rgba(17,17,19,0.10),0_1px_0_rgba(17,17,19,0.04)] hover:shadow-[inset_0_0_0_0.5px_rgba(17,17,19,0.22),0_1px_0_rgba(17,17,19,0.04)]",
      )}
      aria-pressed={active}
    >
      <div className="flex w-full items-center justify-between">
        <span className={cn("quiet-caps", active && "text-[color:var(--accent-ink)]")}>{label}</span>
        {active && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]"
            aria-hidden
          />
        )}
      </div>
      <div className="stat-numeric text-[36px] leading-none text-[color:var(--ink)]">
        {String(value).padStart(2, "0")}
      </div>
      <div className="text-[11px] text-[color:var(--ink-muted)]">{hint}</div>
    </motion.button>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Ledger row
// ───────────────────────────────────────────────────────────────────────────
function LedgerRow({
  entry,
  selected,
  onSelect,
}: {
  entry: LedgerEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const initials = monogram(entry.name);
  return (
    <motion.li
      variants={{ hidden: { opacity: 0, y: 4 }, visible: { opacity: 1, y: 0 } }}
      className="border-b border-[color:var(--ink-line)]"
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "focus-ring group flex w-full items-center gap-5 rounded-[var(--r-sm)] px-2 py-4 text-left transition-colors",
          selected ? "bg-[color:var(--accent-soft)]" : "hover:bg-black/[0.025]",
        )}
        aria-pressed={selected}
      >
        <span
          className={cn(
            "tabular w-7 shrink-0 text-[11px] font-medium",
            selected ? "text-[color:var(--accent-ink)]" : "text-[color:var(--ink-faint)]",
          )}
        >
          {String(entry.folio).padStart(2, "0")}
        </span>
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-full text-[12px] font-semibold uppercase tracking-[-0.01em]",
            selected
              ? "bg-[color:var(--accent)] text-white"
              : "bg-[color:var(--paper-deep)] text-[color:var(--ink-soft)]",
          )}
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-display text-[15px] tracking-[-0.005em]">
              {entry.name}
            </span>
            {entry.activeJobs.length === 0 && entry.specialties.length === 0 && (
              <span className="quiet-caps text-[color:var(--amber)]">attention</span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-[color:var(--ink-muted)]">
            {entry.email ?? <span className="italic">no email</span>}
            {entry.phone && (
              <>
                <span className="mx-2 text-[color:var(--ink-faint)]">·</span>
                <span className="tabular">{entry.phone}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex max-w-[260px] flex-wrap items-center justify-end gap-1.5">
          {entry.specialties.length > 0 ? (
            <>
              {entry.specialties.slice(0, 3).map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-black/[0.05] px-2 py-[2px] text-[10px] font-medium uppercase tracking-[0.08em] text-[color:var(--ink-soft)]"
                >
                  {s}
                </span>
              ))}
              {entry.specialties.length > 3 && (
                <span className="tabular text-[10px] text-[color:var(--ink-faint)]">
                  +{entry.specialties.length - 3}
                </span>
              )}
            </>
          ) : (
            <span className="text-[11px] italic text-[color:var(--ink-faint)]">unrated</span>
          )}
        </div>
        <div className="w-24 text-right">
          {entry.activeJobs.length > 0 ? (
            <div className="text-[12px]">
              <span className="tabular font-medium text-[color:var(--ink)]">
                {entry.activeJobs.length}
              </span>
              <span className="ml-1 text-[color:var(--ink-muted)]">
                job{entry.activeJobs.length === 1 ? "" : "s"}
              </span>
            </div>
          ) : (
            <div className="quiet-caps text-[color:var(--ink-faint)]">available</div>
          )}
          {entry.hourlyRate != null && (
            <div className="tabular mt-0.5 text-[11px] text-[color:var(--ink-muted)]">
              ${entry.hourlyRate.toFixed(0)}/hr
            </div>
          )}
        </div>
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-all",
            selected
              ? "text-[color:var(--accent)]"
              : "text-[color:var(--ink-faint)] group-hover:translate-x-0.5 group-hover:text-[color:var(--ink-muted)]",
          )}
        />
      </button>
    </motion.li>
  );
}

function LedgerEmpty({
  hasEntries,
  onInvite,
}: {
  hasEntries: boolean;
  onInvite: () => void;
}) {
  if (!hasEntries) {
    return (
      <div className="border-t border-[color:var(--ink-line)] py-20 text-center">
        <div className="quiet-caps mb-3">Empty roster</div>
        <h2 className="font-display text-[26px] tracking-[-0.015em]">
          No workers on the books yet.
        </h2>
        <p className="mx-auto mt-3 max-w-[44ch] text-[13px] leading-[1.7] text-[color:var(--ink-muted)]">
          Invite your first crew member. They get a token portal — no password, no account juggling.
          You stay in control of the link.
        </p>
        <div className="mt-6 inline-flex">
          <Button icon={<Plus className="h-3.5 w-3.5" />} onClick={onInvite}>
            Invite the first worker
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="border-t border-[color:var(--ink-line)] py-16 text-center">
      <AlertCircle className="mx-auto mb-3 h-4 w-4 text-[color:var(--ink-faint)]" />
      <div className="text-[13px] text-[color:var(--ink-muted)]">
        No workers match this filter.
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Inspector — right column
// ───────────────────────────────────────────────────────────────────────────
function InspectorEmpty({
  totalActive,
  counts,
}: {
  totalActive: number;
  counts: { all: number; onJob: number; available: number; unrated: number };
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="paper-card p-6"
    >
      <div className="quiet-caps">Today, at a glance</div>
      <div className="mt-2 font-display text-[22px] leading-tight tracking-[-0.015em]">
        {totalActive === 0
          ? "Quiet on the boards."
          : `${totalActive} active assignment${totalActive === 1 ? "" : "s"} across the crew.`}
      </div>
      <p className="mt-3 text-[12px] leading-[1.7] text-[color:var(--ink-muted)]">
        Pick a name from the ledger to inspect that worker — specialties, contact, magic link,
        and what they&apos;re carrying.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-[color:var(--ink-line)] pt-5">
        <Mini label="On a job" value={counts.onJob} />
        <Mini label="Available" value={counts.available} />
        <Mini label="Unrated" value={counts.unrated} />
        <Mini label="Total" value={counts.all} />
      </div>
    </motion.div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="quiet-caps">{label}</div>
      <div className="tabular mt-1 text-[22px] leading-none text-[color:var(--ink)]">
        {String(value).padStart(2, "0")}
      </div>
    </div>
  );
}

function InspectorWorker({
  entry,
  onClose,
  onRevoke,
}: {
  entry: LedgerEntry;
  onClose: () => void;
  onRevoke: () => Promise<void>;
}) {
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => setOrigin(window.location.origin), []);
  const magicLink = `${origin}/w/${entry.token}`;

  const [copied, setCopied] = React.useState(false);
  const [revoking, setRevoking] = React.useState(false);
  const [confirmRevoke, setConfirmRevoke] = React.useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      className="paper-card overflow-hidden !p-0"
    >
      <div className="flex items-start justify-between gap-3 border-b border-[color:var(--ink-line)] px-6 pb-5 pt-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[color:var(--accent-soft)] text-[14px] font-semibold uppercase text-[color:var(--accent-ink)]">
              {monogram(entry.name)}
            </span>
            <div className="min-w-0">
              <div className="quiet-caps">
                Folio <span className="tabular">{String(entry.folio).padStart(2, "0")}</span>
              </div>
              <h3 className="truncate font-display text-[20px] leading-tight tracking-[-0.015em]">
                {entry.name}
              </h3>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="-mr-1 rounded-[var(--r-sm)] p-1.5 text-[color:var(--ink-muted)] hover:bg-black/[0.05]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-5 px-6 py-5">
        <Field label="Email">
          {entry.email ? (
            <span className="break-all text-[13px] text-[color:var(--ink)]">{entry.email}</span>
          ) : (
            <Empty />
          )}
        </Field>
        <Field label="Phone">
          {entry.phone ? (
            <span className="tabular text-[13px] text-[color:var(--ink)]">{entry.phone}</span>
          ) : (
            <Empty />
          )}
        </Field>
        <Field label="Hourly rate">
          {entry.hourlyRate != null ? (
            <span className="tabular text-[13px] text-[color:var(--ink)]">
              ${entry.hourlyRate.toFixed(2)}
              <span className="text-[color:var(--ink-muted)]"> / hr</span>
            </span>
          ) : (
            <Empty label="not set" />
          )}
        </Field>

        <Field label={`Specialties (${entry.specialties.length})`}>
          {entry.specialties.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {entry.specialties.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-black/[0.05] px-2.5 py-[3px] text-[10px] font-medium uppercase tracking-[0.08em] text-[color:var(--ink-soft)]"
                >
                  {s}
                </span>
              ))}
            </div>
          ) : (
            <Empty label="none recorded" />
          )}
        </Field>

        <Field label={`Active jobs (${entry.activeJobs.length})`}>
          {entry.activeJobs.length > 0 ? (
            <ul className="divide-y divide-[color:var(--ink-line)]">
              {entry.activeJobs.map((j) => (
                <li key={j.id} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={`/dashboard/jobs/${j.jobId}`}
                      className="truncate text-[13px] text-[color:var(--ink)] underline-offset-[3px] hover:underline"
                    >
                      {j.jobTitle}
                    </a>
                    <StatusPill status={j.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty label="no live work" />
          )}
        </Field>
      </div>

      <div className="border-t border-[color:var(--ink-line)] bg-[color:var(--paper-deep)]/40 px-6 py-5">
        <div className="quiet-caps mb-2">Magic link</div>
        <div className="hairline flex items-center gap-2 rounded-[var(--r-sm)] bg-white px-3 py-2">
          <code className="flex-1 truncate font-mono text-[11px] text-[color:var(--ink-soft)]">
            {magicLink || `…/w/${entry.token.slice(0, 12)}…`}
          </code>
          <button
            type="button"
            aria-label="Copy magic link"
            onClick={() => {
              if (!magicLink) return;
              navigator.clipboard.writeText(magicLink);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.05]"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-[1.6] text-[color:var(--ink-muted)]">
          Anyone with this link can view and accept jobs assigned to {entry.name.split(" ")[0]}.
          Revoke to rotate it — the old link dies immediately.
        </p>

        <div className="mt-4 flex items-center justify-between">
          <a
            href={`/dashboard/workers/${entry.id}`}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-[color:var(--ink)] transition-colors hover:text-[color:var(--accent)]"
          >
            Open full profile
            <ArrowUpRight className="h-3 w-3" />
          </a>
          {!confirmRevoke ? (
            <button
              type="button"
              onClick={() => setConfirmRevoke(true)}
              className="text-[12px] font-medium text-[color:var(--rose)] underline-offset-[3px] hover:underline"
            >
              Revoke access
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[color:var(--ink-muted)]">Sure?</span>
              <button
                type="button"
                onClick={() => setConfirmRevoke(false)}
                className="text-[12px] font-medium text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={revoking}
                onClick={async () => {
                  setRevoking(true);
                  try {
                    await onRevoke();
                    setConfirmRevoke(false);
                  } finally {
                    setRevoking(false);
                  }
                }}
                className="text-[12px] font-medium text-[color:var(--rose)] underline underline-offset-[3px] disabled:opacity-50"
              >
                {revoking ? "Rotating…" : "Yes, rotate link"}
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="quiet-caps mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function Empty({ label = "—" }: { label?: string }) {
  return <span className="text-[12px] italic text-[color:var(--ink-faint)]">{label}</span>;
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "ACCEPTED"
      ? "bg-emerald-50 text-emerald-800"
      : status === "PENDING"
      ? "bg-amber-50 text-amber-900"
      : "bg-black/[0.05] text-[color:var(--ink-soft)]";
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-[2px] text-[10px] font-medium uppercase tracking-[0.08em]",
        tone,
      )}
    >
      {status.toLowerCase()}
    </span>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Invite sheet — fresh, not the existing WorkerInviteDrawer
// ───────────────────────────────────────────────────────────────────────────
const SPECIALTY_OPTIONS = [
  "Roofing",
  "Framing",
  "Electrical",
  "Plumbing",
  "Drywall",
  "Painting",
  "Flooring",
  "Tile",
  "Cabinetry",
  "Fencing",
  "Decking",
  "Landscaping",
];

function InviteSheet({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [rate, setRate] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [created, setCreated] = React.useState<{ token: string; name: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => setOrigin(window.location.origin), []);

  function reset() {
    setName("");
    setEmail("");
    setPhone("");
    setRate("");
    setSelected([]);
    setCreated(null);
    setCopied(false);
  }

  const close = React.useCallback(() => {
    reset();
    onClose();
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  async function submit() {
    if (!name.trim() || !email.trim()) {
      toast.error("Missing info", "Name and email are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await createWorkerInvite({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        specialties: selected,
        hourlyRate: rate ? Number(rate) : undefined,
      });
      setCreated({ token: res.token, name: name.trim() });
      onInvited();
      toast.success("Worker invited", "Magic link ready to share.");
    } catch (err) {
      toast.error("Invite failed", (err as Error)?.message);
    } finally {
      setBusy(false);
    }
  }

  const magicLink = created ? `${origin}/w/${created.token}` : "";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-[color:var(--ink)]/30 backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            style={{ width: "min(460px, 100vw)" }}
            className="fixed bottom-0 right-0 top-0 z-50 flex flex-col border-l border-[color:var(--ink-line)] bg-[color:var(--paper)]"
            role="dialog"
            aria-label={created ? "Invite ready" : "Invite worker"}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[color:var(--ink-line)] px-7 pb-5 pt-7">
              <div>
                <div className="quiet-caps mb-2">{created ? "Invite ready" : "New entry"}</div>
                <h2 className="font-display text-[22px] leading-tight tracking-[-0.015em]">
                  {created ? `${created.name} added.` : "Invite a worker"}
                </h2>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-[var(--r-sm)] p-1.5 text-[color:var(--ink-muted)] hover:bg-black/[0.05]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-7 py-6">
              {!created ? (
                <div className="space-y-7">
                  <section>
                    <div className="quiet-caps mb-3">About</div>
                    <div className="space-y-4">
                      <Input
                        label="Full name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Casey Stone"
                      />
                      <Input
                        label="Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="casey@example.com"
                      />
                      <Input
                        label="Phone (optional)"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(215) 555-0199"
                      />
                    </div>
                  </section>

                  <section>
                    <div className="quiet-caps mb-3">Rate</div>
                    <Input
                      label="Hourly rate (optional)"
                      type="number"
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      prefix={<span className="text-[11px]">$</span>}
                      suffix={
                        <span className="text-[11px] text-[color:var(--ink-faint)]">/hr</span>
                      }
                    />
                  </section>

                  <section>
                    <div className="quiet-caps mb-3">Specialties</div>
                    <div className="flex flex-wrap gap-1.5">
                      {SPECIALTY_OPTIONS.map((s) => {
                        const active = selected.includes(s);
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() =>
                              setSelected((prev) =>
                                active ? prev.filter((x) => x !== s) : [...prev, s],
                              )
                            }
                            className={cn(
                              "hairline rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] transition-colors",
                              active
                                ? "bg-[color:var(--ink)] text-[color:var(--paper)] shadow-none"
                                : "bg-transparent text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
                            )}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="paper-card p-4">
                    <div className="quiet-caps mb-2">Magic link</div>
                    <div className="hairline flex items-center gap-2 rounded-[var(--r-sm)] bg-black/[0.03] px-3 py-2">
                      <code className="flex-1 break-all font-mono text-[11px] text-[color:var(--ink-soft)]">
                        {magicLink}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(magicLink);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        }}
                        aria-label="Copy"
                        className="grid h-7 w-7 place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.05]"
                      >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-[12px] leading-[1.7] text-[color:var(--ink-muted)]">
                    Share the link directly. You can rotate it any time from the inspector — anyone
                    with the old link loses access immediately.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[color:var(--ink-line)] px-7 py-4">
              {!created ? (
                <>
                  <Button variant="ghost" onClick={close}>
                    Cancel
                  </Button>
                  <Button onClick={submit} loading={busy}>
                    Create invite
                  </Button>
                </>
              ) : (
                <Button onClick={close}>Done</Button>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────
function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
