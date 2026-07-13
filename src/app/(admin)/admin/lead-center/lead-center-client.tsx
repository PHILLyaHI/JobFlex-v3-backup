"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Inbox,
  MapPin,
  Search,
  Send,
  Timer,
  UserCheck,
  RotateCcw,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import { relative } from "@/lib/format";
import { manualAssignPlatformLead, requeuePlatformLead } from "@/actions/adminLeadCenter";

// Scoring snapshot entry (matching.ts Candidate, parsed from rankingJson).
export interface RankEntry {
  orgId: string;
  orgName: string;
  score: number;
  distanceMi: number | null;
  distanceScore: number;
  ratingScore: number;
  respScore: number;
  fallback: boolean;
}

export interface PlatformLeadDTO {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  projectType: string | null;
  description: string | null;
  detectedTrade: string | null;
  aiConfidence: number | null;
  geocoded: boolean;
  status: string; // MATCHING | OFFERED | MATCHED | MANUAL_QUEUE
  attemptCount: number;
  queueReason: string | null; // NO_CANDIDATES | EXHAUSTED
  matchedOrgName: string | null;
  matchedAt: string | null;
  manuallyAssigned: boolean;
  createdAt: string;
  ranking: RankEntry[];
  offers: {
    id: string;
    orgName: string;
    attempt: number;
    status: string;
    score: number;
    expiresAt: string;
    respondedAt: string | null;
  }[];
  activeOffer: { orgName: string; attempt: number; expiresAt: string } | null;
}

export interface OrgPickDTO {
  id: string;
  name: string;
  trades: string[];
  geocoded: boolean;
  offersEnabled: boolean;
}

type Tab = "all" | "routing" | "manual" | "matched";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "routing", label: "Routing" },
  { key: "manual", label: "Manual queue" },
  { key: "matched", label: "Matched" },
];

function inTab(lead: PlatformLeadDTO, tab: Tab): boolean {
  if (tab === "all") return true;
  if (tab === "routing") return lead.status === "MATCHING" || lead.status === "OFFERED";
  if (tab === "manual") return lead.status === "MANUAL_QUEUE";
  return lead.status === "MATCHED";
}

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const msLeft = new Date(expiresAt).getTime() - now;
  if (msLeft <= 0) return <span className="tabular">expiring…</span>;
  const totalMin = Math.floor(msLeft / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return <span className="tabular">{h > 0 ? `${h}h ${m}m` : `${m}m`} left</span>;
}

function StatusPill({ lead }: { lead: PlatformLeadDTO }) {
  switch (lead.status) {
    case "MATCHING":
      return <Badge tone="neutral">Matching</Badge>;
    case "OFFERED":
      return (
        <Badge tone="accent">
          <Timer className="h-3 w-3" />
          Offered · {lead.activeOffer ? <Countdown expiresAt={lead.activeOffer.expiresAt} /> : "—"}
        </Badge>
      );
    case "MANUAL_QUEUE":
      return (
        <Badge tone="warn">
          {lead.queueReason === "NO_CANDIDATES" ? "No candidates" : "3 strikes"} · assign manually
        </Badge>
      );
    case "MATCHED":
      return <Badge tone="success">{lead.manuallyAssigned ? "Assigned" : "Matched"}</Badge>;
    default:
      return <Badge tone="neutral">{lead.status}</Badge>;
  }
}

const pct = (n: number) => `${Math.round(n * 100)}`;

export function LeadCenterClient({
  leads,
  orgs,
}: {
  leads: PlatformLeadDTO[];
  orgs: OrgPickDTO[];
}) {
  const [tab, setTab] = React.useState<Tab>("all");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [assignFor, setAssignFor] = React.useState<PlatformLeadDTO | null>(null);

  const counts = React.useMemo(
    () =>
      Object.fromEntries(TABS.map((t) => [t.key, leads.filter((l) => inTab(l, t.key)).length])) as Record<
        Tab,
        number
      >,
    [leads],
  );
  const visible = leads.filter((l) => inTab(l, tab));

  return (
    <>
      <nav className="mb-5 flex items-center gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const active = tab === t.key;
          const flagged = t.key === "manual" && counts.manual > 0 && !active;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[12px] font-medium transition-all",
                active
                  ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
                  : "text-[color:var(--ink-muted)] hairline hover:bg-black/[0.04]",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] tabular",
                  active
                    ? "bg-white/20"
                    : flagged
                      ? "bg-amber-100 text-amber-800"
                      : "bg-black/[0.06] text-[color:var(--ink-muted)]",
                )}
              >
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </nav>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title={tab === "manual" ? "Nothing needs a hand" : "No leads here yet"}
          description={
            tab === "manual"
              ? "Leads that strike out with three shops — or match no one — land here for manual assignment."
              : "Homeowner requests appear here the moment they're submitted."
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((lead) => (
            <LeadRow
              key={lead.id}
              lead={lead}
              open={openId === lead.id}
              onToggle={() => setOpenId((cur) => (cur === lead.id ? null : lead.id))}
              onAssign={() => setAssignFor(lead)}
            />
          ))}
        </div>
      )}

      {assignFor && (
        <AssignDialog lead={assignFor} orgs={orgs} onClose={() => setAssignFor(null)} />
      )}
    </>
  );
}

function LeadRow({
  lead,
  open,
  onToggle,
  onAssign,
}: {
  lead: PlatformLeadDTO;
  open: boolean;
  onToggle: () => void;
  onAssign: () => void;
}) {
  const router = useRouter();
  const [requeueing, setRequeueing] = React.useState(false);
  const location = [lead.city, lead.state].filter(Boolean).join(", ") || lead.zip || lead.address;

  async function requeue() {
    setRequeueing(true);
    try {
      await requeuePlatformLead(lead.id);
      toast.success("Requeued", "The lead is back in the cascade.");
      router.refresh();
    } catch (err: unknown) {
      toast.error("Couldn't requeue", err instanceof Error ? err.message : undefined);
    } finally {
      setRequeueing(false);
    }
  }

  return (
    <div className="paper-card !p-0 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[15px] tracking-[-0.01em]">{lead.name}</span>
            {lead.detectedTrade && (
              <Badge tone="accent">
                {lead.detectedTrade}
                {lead.aiConfidence != null && (
                  <span className="ml-1 tabular opacity-60">{pct(lead.aiConfidence)}%</span>
                )}
              </Badge>
            )}
            <StatusPill lead={lead} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[color:var(--ink-muted)]">
            <span>{relative(new Date(lead.createdAt))}</span>
            {location && (
              <>
                <span className="text-[color:var(--ink-faint)]">·</span>
                <span className="inline-flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" />
                  {location}
                  {!lead.geocoded && <span className="text-[color:var(--ink-faint)]"> (no pin)</span>}
                </span>
              </>
            )}
            {lead.status === "OFFERED" && lead.activeOffer && (
              <>
                <span className="text-[color:var(--ink-faint)]">·</span>
                <span className="inline-flex items-center gap-0.5">
                  <Send className="h-3 w-3" />
                  {lead.activeOffer.orgName} · attempt {lead.activeOffer.attempt} of 3
                </span>
              </>
            )}
            {lead.status === "MATCHED" && lead.matchedOrgName && (
              <>
                <span className="text-[color:var(--ink-faint)]">·</span>
                <span className="inline-flex items-center gap-0.5">
                  <UserCheck className="h-3 w-3" />
                  {lead.matchedOrgName}
                </span>
              </>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[color:var(--ink-faint)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="border-t border-[color:var(--ink-line)] px-5 py-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="quiet-caps mb-1">Request</div>
              <div className="text-[13px] font-medium">{lead.projectType ?? "General inquiry"}</div>
              {lead.description && (
                <p className="mt-1 text-[12.5px] leading-relaxed text-[color:var(--ink-soft)]">
                  {lead.description}
                </p>
              )}
            </div>
            <div>
              <div className="quiet-caps mb-1">Homeowner</div>
              <div className="text-[12.5px] text-[color:var(--ink-soft)]">
                {[lead.email, lead.phone].filter(Boolean).join(" · ")}
              </div>
              {lead.address && (
                <div className="mt-0.5 text-[12.5px] text-[color:var(--ink-soft)]">
                  {[lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(", ")}
                </div>
              )}
            </div>
          </div>

          {lead.ranking.length > 0 && (
            <div>
              <div className="quiet-caps mb-2">Scoring — snapshot at submission</div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-[10.5px] uppercase tracking-[0.06em] text-[color:var(--ink-faint)]">
                      <th className="py-1 pr-3 font-medium">#</th>
                      <th className="py-1 pr-3 font-medium">Shop</th>
                      <th className="py-1 pr-3 font-medium text-right">Total</th>
                      <th className="py-1 pr-3 font-medium text-right">Distance</th>
                      <th className="py-1 pr-3 font-medium text-right">Rating</th>
                      <th className="py-1 pr-3 font-medium text-right">Response</th>
                      <th className="py-1 font-medium">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lead.ranking.map((r, i) => {
                      const offer = lead.offers.find((o) => o.orgName === r.orgName);
                      return (
                        <tr key={r.orgId} className="border-t border-[color:var(--ink-line)]">
                          <td className="py-1.5 pr-3 tabular text-[color:var(--ink-faint)]">{i + 1}</td>
                          <td className="py-1.5 pr-3">{r.orgName}</td>
                          <td className="py-1.5 pr-3 text-right tabular font-medium">{pct(r.score)}</td>
                          <td className="py-1.5 pr-3 text-right tabular">
                            {r.distanceMi != null ? `${r.distanceMi} mi` : r.fallback ? "zip" : "—"}
                            <span className="text-[color:var(--ink-faint)]"> · {pct(r.distanceScore)}</span>
                          </td>
                          <td className="py-1.5 pr-3 text-right tabular">{pct(r.ratingScore)}</td>
                          <td className="py-1.5 pr-3 text-right tabular">{pct(r.respScore)}</td>
                          <td className="py-1.5">
                            {offer ? (
                              <span
                                className={cn(
                                  "text-[11px]",
                                  offer.status === "ACCEPTED" && "text-emerald-700",
                                  offer.status === "DECLINED" && "text-rose-700",
                                  (offer.status === "EXPIRED" || offer.status === "CANCELLED") &&
                                    "text-[color:var(--ink-muted)]",
                                  offer.status === "OFFERED" && "text-[color:var(--accent-ink)]",
                                )}
                              >
                                {offer.status === "OFFERED"
                                  ? "offered now"
                                  : offer.status.toLowerCase()}
                              </span>
                            ) : (
                              <span className="text-[11px] text-[color:var(--ink-faint)]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {lead.status === "MANUAL_QUEUE" && (
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" variant="primary" icon={<UserCheck className="h-3.5 w-3.5" />} onClick={onAssign}>
                Assign to a shop
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                loading={requeueing}
                onClick={requeue}
              >
                Requeue
              </Button>
            </div>
          )}
          {(lead.status === "MATCHING" || lead.status === "OFFERED") && (
            <div className="pt-1">
              <Button size="sm" variant="outline" icon={<UserCheck className="h-3.5 w-3.5" />} onClick={onAssign}>
                Assign manually instead
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Hand-rolled overlay dialog (house style — no Radix): searchable org picker.
function AssignDialog({
  lead,
  orgs,
  onClose,
}: {
  lead: PlatformLeadDTO;
  orgs: OrgPickDTO[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [assigningId, setAssigningId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const needle = q.trim().toLowerCase();
  const filtered = needle ? orgs.filter((o) => o.name.toLowerCase().includes(needle)) : orgs;

  async function assign(org: OrgPickDTO) {
    if (assigningId) return;
    setAssigningId(org.id);
    try {
      await manualAssignPlatformLead(lead.id, org.id);
      toast.success("Lead assigned", `${lead.name} → ${org.name}. They'll see it in Incoming.`);
      onClose();
      router.refresh();
    } catch (err: unknown) {
      toast.error("Couldn't assign", err instanceof Error ? err.message : undefined);
      setAssigningId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_50%,transparent)] backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Assign ${lead.name} to a shop`}
        className="relative w-full max-w-md paper-card !p-0 overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--ink-line)]">
          <div>
            <div className="quiet-caps !mb-0.5">Assign lead</div>
            <div className="font-display text-[16px] tracking-[-0.01em]">
              {lead.name} · {lead.detectedTrade ?? lead.projectType ?? "project"}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-[color:var(--ink-faint)] hover:text-[color:var(--ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-[color:var(--ink-line)]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--ink-faint)]" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search shops…"
              className="h-9 w-full rounded-[var(--r-sm)] hairline bg-transparent pl-9 pr-3 text-[13px] outline-none placeholder:text-[color:var(--ink-faint)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]"
            />
          </div>
        </div>

        <div className="max-h-[320px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-5 py-8 text-center text-[12.5px] text-[color:var(--ink-muted)]">
              No shops match &ldquo;{q}&rdquo;.
            </div>
          ) : (
            filtered.map((org) => {
              const covers =
                lead.detectedTrade == null ||
                org.trades.includes(lead.detectedTrade) ||
                org.trades.includes("General Contractor");
              const flags = [
                !covers && "trade not listed",
                !org.geocoded && "no address pin",
                !org.offersEnabled && "offers paused",
              ].filter(Boolean) as string[];
              return (
                <button
                  key={org.id}
                  type="button"
                  disabled={assigningId != null}
                  onClick={() => assign(org)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left border-t border-[color:var(--ink-line)] first:border-t-0 hover:bg-black/[0.03] disabled:opacity-60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium truncate">{org.name}</div>
                    <div className="mt-0.5 text-[11px] text-[color:var(--ink-muted)] truncate">
                      {org.trades.length ? org.trades.join(" · ") : "No trades listed"}
                    </div>
                  </div>
                  {flags.length > 0 && (
                    <span className="shrink-0 text-[10.5px] text-amber-700">{flags.join(" · ")}</span>
                  )}
                  {assigningId === org.id && (
                    <span className="shrink-0 text-[11px] text-[color:var(--ink-muted)]">Assigning…</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
