"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
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
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import { createWorkerInvite, updateWorker, removeWorker } from "@/actions/workers";
import { WORKER_ROLES, roleLabel } from "@/lib/prismaEnums";
import { reportPlanLimit, ensureWithinLimit } from "@/stores/usePlanLimitStore";

export interface LedgerEntry {
  id: string;
  folio: number;
  name: string;
  email: string | null;
  phone: string | null;
  specialties: string[];
  hourlyRate: number | null;
  token: string;
  // Invite lifecycle: "PENDING" (awaiting response) | "ACCEPTED" | "DECLINED".
  inviteStatus: string;
  // Org membership role: INSTALLER | SALES | ESTIMATOR | MANAGER (+ OWNER/ADMIN…).
  role: string;
  joinedISO: string;
  activeJobs: {
    id: string;
    status: string;
    jobId: string;
    jobTitle: string;
    jobStatus: string;
  }[];
}

type FilterKey = "all" | "on-job" | "available";

export function WorkersLedger({ entries: serverEntries }: { entries: LedgerEntry[] }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  // When set, the invite sheet opens in "edit" mode prefilled with this worker.
  const [editEntry, setEditEntry] = React.useState<LedgerEntry | null>(null);

  const counts = React.useMemo(() => {
    const all = serverEntries.length;
    const onJob = serverEntries.filter((e) => e.activeJobs.length > 0).length;
    // "Available" = ready to take work: invite ACCEPTED and no live job. A worker
    // whose invite is still pending (or declined) hasn't joined, so isn't available.
    const available = serverEntries.filter(
      (e) => e.inviteStatus === "ACCEPTED" && e.activeJobs.length === 0,
    ).length;
    return { all, onJob, available };
  }, [serverEntries]);

  const totalActive = React.useMemo(
    () => serverEntries.reduce((sum, e) => sum + e.activeJobs.length, 0),
    [serverEntries],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return serverEntries.filter((e) => {
      if (filter === "on-job" && e.activeJobs.length === 0) return false;
      if (filter === "available" && (e.inviteStatus !== "ACCEPTED" || e.activeJobs.length > 0))
        return false;
      if (!q) return true;
      return e.name.toLowerCase().includes(q) || (e.email ?? "").toLowerCase().includes(q);
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
              <span>
                <span className="tabular">{serverEntries.length}</span> on the books
              </span>
              {totalActive > 0 && (
                <>
                  <span className="text-[color:var(--ink-faint)]">/</span>
                  <span>
                    <span className="tabular">{totalActive}</span> active
                  </span>
                </>
              )}
            </div>
            <h1 className="font-display text-[44px] leading-none tracking-[-0.02em]">
              Workers
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="w-[280px]">
              <Input
                // type=search + a distinct name + autoComplete off stop the
                // browser from autofilling the just-entered invite email into
                // this roster search box.
                type="search"
                name="worker-roster-search"
                autoComplete="off"
                placeholder="Search name or email…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                prefix={<Search className="h-3.5 w-3.5" />}
              />
            </div>
            <Button
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => {
                setEditEntry(null);
                setInviteOpen(true);
              }}
            >
              Invite worker
            </Button>
          </div>
        </header>

        {/* ─── Stat filter tiles (one contained card, hairline-divided cells) ─ */}
        <motion.section
          className="mt-8"
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.05 } } }}
        >
          <div className="paper-card overflow-hidden !p-0">
            <div className="grid grid-cols-3 divide-x divide-[color:var(--ink-line)]">
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
            </div>
          </div>
        </motion.section>

        {/* ─── Workspace: the ledger runs full-width until a worker is picked,
             then the inspector animates in beside it ───────────────────── */}
        <div className="mt-8 flex items-start gap-8">
          <main className="min-w-0 flex-1">
            <div className="paper-card overflow-hidden !p-0">
              <div className="flex items-center justify-between gap-3 border-b border-[color:var(--ink-line)] bg-[color:var(--paper-deep)]/40 px-5 py-3">
                <span className="quiet-caps">Roster</span>
                {filter === "all" ? (
                  <span className="quiet-caps text-[color:var(--ink-faint)]">
                    <span className="tabular">{serverEntries.length}</span> on the books
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[color:var(--ink-muted)] transition-colors hover:text-[color:var(--ink)]"
                  >
                    <span className="tabular">{filtered.length}</span> of{" "}
                    <span className="tabular">{serverEntries.length}</span>
                    <RotateCcw className="h-3 w-3" />
                    clear
                  </button>
                )}
              </div>
              {filtered.length === 0 ? (
                <LedgerEmpty
                  hasEntries={serverEntries.length > 0}
                  onInvite={() => {
                    setEditEntry(null);
                    setInviteOpen(true);
                  }}
                />
              ) : (
                <motion.ul
                  initial={reduceMotion ? false : "hidden"}
                  animate="visible"
                  variants={{ visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.02 } } }}
                >
                  {filtered.map((entry) => (
                    <LedgerRow
                      key={entry.id}
                      entry={entry}
                      selected={entry.id === selectedId}
                      onSelect={() => setSelectedId(entry.id)}
                      maxSpecialties={selectedId ? 2 : 3}
                    />
                  ))}
                </motion.ul>
              )}
            </div>
          </main>

          <AnimatePresence initial={false}>
            {selected && (
              <motion.aside
                key="inspector"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 380 }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                className="sticky top-8 shrink-0 self-start overflow-hidden"
              >
                {/* Fixed-width inner shell so content reveals cleanly as the
                    column animates open, instead of reflowing each frame. */}
                <div className="w-[380px]">
                  <InspectorWorker
                    key={selected.id}
                    entry={selected}
                    onClose={() => setSelectedId(null)}
                    onEdit={() => {
                      setEditEntry(selected);
                      setInviteOpen(true);
                    }}
                    onRemove={async () => {
                      const name = selected.name;
                      await removeWorker(selected.id);
                      setSelectedId(null);
                      router.refresh();
                      toast.success("Worker removed", `${name} no longer has access.`);
                    }}
                  />
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </div>

      <InviteSheet
        open={inviteOpen}
        editEntry={editEntry}
        onClose={() => {
          setInviteOpen(false);
          setEditEntry(null);
        }}
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
      variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
      onClick={onClick}
      className={cn(
        "focus-ring group relative flex flex-col items-start gap-2 px-5 py-4 text-left transition-colors",
        active
          ? "bg-[color:var(--accent-soft)] shadow-[inset_0_2px_0_var(--accent)]"
          : "hover:bg-[color:var(--paper-deep)]",
      )}
      aria-pressed={active}
    >
      <span className={cn("quiet-caps", active && "text-[color:var(--accent-ink)]")}>{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="stat-numeric text-[28px] leading-none text-[color:var(--ink)]">
          {value}
        </span>
        <span className="text-[11px] text-[color:var(--ink-muted)]">{hint}</span>
      </div>
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
  maxSpecialties,
}: {
  entry: LedgerEntry;
  selected: boolean;
  onSelect: () => void;
  // Full-width roster shows 3 chips; once a worker is picked the list narrows
  // and shows 2 (the inspector lists the full set).
  maxSpecialties: number;
}) {
  const initials = monogram(entry.name);
  return (
    <motion.li
      variants={{ hidden: { opacity: 0, y: 4 }, visible: { opacity: 1, y: 0 } }}
      className="border-b border-[color:var(--ink-line)] last:border-b-0"
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "focus-ring group flex w-full items-center gap-5 px-5 py-4 text-left transition-colors",
          selected ? "bg-[color:var(--accent-soft)]" : "hover:bg-[color:var(--paper-deep)]",
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
              ? "bg-[color:var(--accent)] text-[color:var(--paper)]"
              : "bg-[color:var(--paper-deep)] text-[color:var(--ink-soft)]",
          )}
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-[15px] tracking-[-0.005em]">
              {entry.name}
            </span>
            <InviteStatusPill status={entry.inviteStatus} />
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
        <div className="flex items-center justify-end">
          <span className="rounded-full bg-[color:var(--accent-soft)] px-2.5 py-[3px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--accent-ink)]">
            {entry.role.toLowerCase()}
          </span>
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
          ) : entry.inviteStatus === "ACCEPTED" ? (
            <div className="quiet-caps text-[color:var(--ink-faint)]">available</div>
          ) : (
            <div className="quiet-caps text-[color:var(--ink-faint)]">
              {entry.inviteStatus === "DECLINED" ? "declined" : "invited"}
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
      <div className="px-6 py-20 text-center">
        <div className="quiet-caps mb-3">Empty roster</div>
        <h2 className="font-display text-[26px] tracking-[-0.015em]">
          No workers on the books yet.
        </h2>
        <p className="mx-auto mt-3 max-w-[44ch] text-[13px] leading-[1.7] text-[color:var(--ink-muted)]">
          Invite your first crew member. They get a token portal: no password, no account juggling.
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
    <div className="px-6 py-16 text-center">
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
function InspectorWorker({
  entry,
  onClose,
  onEdit,
  onRemove,
}: {
  entry: LedgerEntry;
  onClose: () => void;
  onEdit: () => void;
  onRemove: () => Promise<void>;
}) {
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => setOrigin(window.location.origin), []);
  const magicLink = `${origin}/w/${entry.token}`;

  const [copied, setCopied] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [confirmRemove, setConfirmRemove] = React.useState(false);

  const firstName = entry.name.split(" ")[0] || entry.name;

  async function handleRemove() {
    setRemoving(true);
    try {
      await onRemove();
      // The worker is gone — the parent closes the inspector, so no need to
      // reset confirmRemove here (this component unmounts).
    } catch (err) {
      toast.error("Couldn't remove worker", (err as Error)?.message);
      setRemoving(false);
      setConfirmRemove(false);
    }
  }

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
              <div className="mt-1">
                <InviteStatusPill status={entry.inviteStatus} />
              </div>
            </div>
          </div>
        </div>
        <div className="-mr-1 flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-[var(--r-sm)] px-2 py-1.5 text-[11px] font-medium text-[color:var(--ink-muted)] transition-colors hover:bg-black/[0.05] hover:text-[color:var(--ink)]"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            className="rounded-[var(--r-sm)] p-1.5 text-[color:var(--ink-muted)] hover:bg-black/[0.05]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
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
        <Field label="Role">
          <span className="rounded-full bg-[color:var(--accent-soft)] px-2.5 py-[3px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--accent-ink)]">
            {entry.role.toLowerCase()}
          </span>
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
        <div className="hairline flex items-center gap-2 rounded-[var(--r-sm)] bg-[color:var(--paper)] px-3 py-2">
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
          Anyone with this link can view and accept jobs assigned to {firstName}. Removing the
          worker kills this link and drops them from the company immediately.
        </p>

        <div className="mt-4 flex items-center justify-between">
          <Link
            href={`/dashboard/workers/${entry.id}` as Route}
            prefetch
            className="inline-flex items-center gap-1 text-[12px] font-medium text-[color:var(--ink)] transition-colors hover:text-[color:var(--accent)]"
          >
            Open full profile
            <ArrowUpRight className="h-3 w-3" />
          </Link>
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            className="text-[12px] font-medium text-[color:var(--rose)] underline-offset-[3px] hover:underline"
          >
            Revoke access
          </button>
        </div>
      </div>

      {/* Removal confirmation — a real popup, not an inline toggle. */}
      <Dialog
        open={confirmRemove}
        onClose={() => {
          if (!removing) setConfirmRemove(false);
        }}
        title={`Remove ${entry.name}?`}
        description="This revokes their access and removes them from the company."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirmRemove(false)}
              disabled={removing}
            >
              Cancel
            </Button>
            <Button variant="danger" loading={removing} onClick={handleRemove}>
              Remove worker
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-[1.7] text-[color:var(--ink-soft)]">
          {firstName}&apos;s magic link stops working and they&apos;re taken off the roster. Their
          job assignments are cleared. Past job history and activity are kept. This can&apos;t be
          undone.
        </p>
      </Dialog>
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

// Invite lifecycle pill for the roster + inspector. ACCEPTED renders nothing
// (an active worker needs no badge — "Status-Is-Not-Decoration"); only the
// in-progress and declined states are surfaced.
function InviteStatusPill({ status }: { status: string }) {
  if (status === "ACCEPTED") return null;
  const isPending = status === "PENDING";
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-[2px] text-[10px] font-medium uppercase tracking-[0.08em]",
        isPending ? "bg-amber-50 text-amber-900" : "bg-rose-50 text-rose-700",
      )}
    >
      {isPending ? "in progress" : "declined"}
    </span>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Invite sheet — fresh, not the existing WorkerInviteDrawer
// ───────────────────────────────────────────────────────────────────────────
function InviteSheet({
  open,
  onClose,
  onInvited,
  editEntry,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
  editEntry?: LedgerEntry | null;
}) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [role, setRole] = React.useState<string>("INSTALLER");
  const [busy, setBusy] = React.useState(false);
  const [created, setCreated] = React.useState<{ token: string; name: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => setOrigin(window.location.origin), []);

  function reset() {
    setName("");
    setEmail("");
    setPhone("");
    setRole("INSTALLER");
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

  // Prefill the form when the sheet opens to edit an existing worker.
  React.useEffect(() => {
    if (!open || !editEntry) return;
    setName(editEntry.name);
    setEmail(editEntry.email ?? "");
    setPhone(editEntry.phone ?? "");
    setRole(editEntry.role || "INSTALLER");
    setCreated(null);
  }, [open, editEntry]);

  async function submit() {
    if (!name.trim() || (!editEntry && !email.trim())) {
      toast.error("Missing info", editEntry ? "Name is required." : "Name and email are required.");
      return;
    }
    setBusy(true);
    try {
      if (editEntry) {
        await updateWorker({
          id: editEntry.id,
          name: name.trim(),
          role,
          phone: phone.trim() || undefined,
        });
        onInvited();
        toast.success("Worker updated", "Changes saved.");
        close();
        return;
      }
      if (!(await ensureWithinLimit("workers"))) return;
      const res = await createWorkerInvite({
        name: name.trim(),
        email: email.trim(),
        role,
        phone: phone.trim() || undefined,
      });
      setCreated({ token: res.token, name: name.trim() });
      onInvited();
      toast.success("Worker invited", "Magic link ready to share.");
    } catch (err) {
      if (reportPlanLimit(err)) return;
      toast.error(editEntry ? "Update failed" : "Invite failed", (err as Error)?.message);
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
            className="fixed inset-0 z-40 bg-[color-mix(in_srgb,var(--ink)_50%,transparent)] backdrop-blur-[2px]"
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
            aria-label={created ? "Invite ready" : editEntry ? "Edit worker" : "Invite worker"}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[color:var(--ink-line)] px-7 pb-5 pt-7">
              <div>
                <div className="quiet-caps mb-2">
                  {created ? "Invite ready" : editEntry ? "Editing" : "New entry"}
                </div>
                <h2 className="font-display text-[22px] leading-tight tracking-[-0.015em]">
                  {created ? `${created.name} added.` : editEntry ? "Edit worker" : "Invite a worker"}
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
                        name="workerEmail"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="casey@example.com"
                        disabled={!!editEntry}
                        hint={
                          editEntry
                            ? "Email is the worker's login — it can't be changed here."
                            : undefined
                        }
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
                    <div className="quiet-caps mb-3">Role</div>
                    <div className="grid grid-cols-2 gap-2">
                      {WORKER_ROLES.map((r) => {
                        const active = role === r;
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setRole(r)}
                            aria-pressed={active}
                            className={cn(
                              "hairline rounded-[var(--r-md)] px-3.5 py-2.5 text-left text-[13px] font-medium transition-colors",
                              active
                                ? "bg-[color:var(--accent)] text-white shadow-[var(--shadow-sm)]"
                                : "bg-transparent text-[color:var(--ink-soft)] hover:bg-black/[0.03]",
                            )}
                          >
                            {roleLabel(r)}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[11px] leading-[1.6] text-[color:var(--ink-muted)]">
                      Installers see only their own jobs and schedule. Sales, Estimator, and
                      Manager get full office access.
                    </p>
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
                    Share the link directly. Rotate it any time from the inspector. Anyone with the
                    old link loses access immediately.
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
                    {editEntry ? "Save changes" : "Create invite"}
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
