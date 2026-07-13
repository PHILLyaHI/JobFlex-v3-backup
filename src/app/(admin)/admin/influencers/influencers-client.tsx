"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Star, Copy, Check } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import { money } from "@/lib/format";
import { describeCommission, type LedgerBalances } from "@/lib/commission";
import {
  createInfluencer,
  setInfluencerStatus,
  createPromoCode,
  setPromoActive,
  updatePromoCommission,
  updateInfluencerProfile,
  approvePayoutRequest,
  rejectPayoutRequest,
} from "@/actions/influencers";
import { sendInfluencerInvite } from "@/actions/influencer-auth";

export interface PromoDTO {
  id: string;
  code: string;
  active: boolean;
  commissionType: string;
  commissionRateBps: number | null;
  commissionFlatCents: number | null;
  commissionBasis: string;
  durationType: string;
  durationMonths: number | null;
  customerPercentOff: number | null;
  clicks: number;
}
export interface PayoutReqDTO {
  id: string;
  amountCents: number;
  status: string;
  createdAt: string;
  rejectedReason: string | null;
}
export interface InfluencerDTO {
  id: string;
  displayName: string;
  email: string;
  status: string;
  connectStatus: string;
  payoutsEnabled: boolean;
  minPayoutCents: number;
  holdDays: number;
  notes: string | null;
  hasPassword: boolean;
  createdAt: string;
  promoCodes: PromoDTO[];
  confirmedSubscribers: number;
  balances: LedgerBalances;
  payoutRequests: PayoutReqDTO[];
}

const STATUS_TONE: Record<string, "success" | "warn" | "neutral" | "danger"> = {
  ACTIVE: "success",
  PENDING: "warn",
  SUSPENDED: "neutral",
  TERMINATED: "danger",
};

export function InfluencersClient({ influencers }: { influencers: InfluencerDTO[] }) {
  const [creating, setCreating] = React.useState(false);
  const [selected, setSelected] = React.useState<InfluencerDTO | null>(null);

  // Keep the open detail sheet in sync after a router.refresh re-supplies data.
  React.useEffect(() => {
    if (selected) {
      const fresh = influencers.find((i) => i.id === selected.id) ?? null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelected(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [influencers]);

  const columns: Column<InfluencerDTO>[] = [
    {
      key: "name",
      header: "Influencer",
      render: (r) => (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={r.displayName} size={32} />
          <div className="min-w-0">
            <div className="font-medium text-[color:var(--ink)] truncate">{r.displayName}</div>
            <div className="text-[11px] text-[color:var(--ink-muted)] truncate">{r.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: "codes",
      header: "Promo codes",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.promoCodes.length === 0 ? (
            <span className="text-[color:var(--ink-faint)]">—</span>
          ) : (
            r.promoCodes.map((p) => (
              <span key={p.id} className="font-mono text-[11px] text-[color:var(--ink-soft)]">
                {p.code}
                {!p.active && <span className="text-[color:var(--ink-faint)]"> (off)</span>}
              </span>
            ))
          )}
        </div>
      ),
    },
    {
      key: "subs",
      header: "Subscribers",
      align: "right",
      render: (r) => <span className="tabular">{r.confirmedSubscribers}</span>,
    },
    {
      key: "balance",
      header: "Cleared owed",
      align: "right",
      render: (r) => <span className="tabular">{money(r.balances.clearedCents / 100)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge tone={STATUS_TONE[r.status] ?? "neutral"} dot>{r.status.toLowerCase()}</Badge>,
    },
  ];

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <div className="text-[11px] text-[color:var(--ink-muted)] tabular">
          {influencers.length} influencer{influencers.length === 1 ? "" : "s"}
        </div>
        <Button icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating(true)}>
          New influencer
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={influencers}
        rowKey={(r) => r.id}
        onRowClick={(r) => setSelected(r)}
        empty={
          <EmptyState
            icon={<Star className="h-5 w-5" />}
            title="No influencers yet"
            description="Create your first affiliate. They'll get a promo code and a separate login to track referrals and earnings."
            action={<Button icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating(true)}>New influencer</Button>}
          />
        }
      />

      <CreateInfluencerSheet open={creating} onClose={() => setCreating(false)} />
      <InfluencerDetailSheet influencer={selected} onClose={() => setSelected(null)} />
    </>
  );
}

// ── Commission fields (shared by create + add-promo) ──
interface CommissionState {
  customerPercentOff: number;
  commissionType: string;
  commissionValue: number;
  commissionBasis: string;
  durationType: string;
  durationMonths: number;
}
const BLANK_COMMISSION: CommissionState = {
  customerPercentOff: 10,
  commissionType: "PERCENT",
  commissionValue: 20,
  commissionBasis: "NET",
  durationType: "REPEATING",
  durationMonths: 12,
};

function CommissionFields({
  value,
  onChange,
}: {
  value: CommissionState;
  onChange: (v: CommissionState) => void;
}) {
  const set = (patch: Partial<CommissionState>) => onChange({ ...value, ...patch });
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Customer discount (%)"
          type="number"
          value={value.customerPercentOff}
          onChange={(e) => set({ customerPercentOff: Number(e.target.value) })}
          hint="What the buyer saves"
        />
        <Select
          label="Commission type"
          value={value.commissionType}
          onChange={(e) => set({ commissionType: e.target.value })}
        >
          <option value="PERCENT">Percentage</option>
          <option value="FLAT">Flat dollars</option>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label={value.commissionType === "PERCENT" ? "Commission (%)" : "Commission ($)"}
          type="number"
          value={value.commissionValue}
          onChange={(e) => set({ commissionValue: Number(e.target.value) })}
        />
        <Select
          label="Paid on"
          value={value.commissionBasis}
          onChange={(e) => set({ commissionBasis: e.target.value })}
        >
          <option value="NET">Net (collected)</option>
          <option value="GROSS">Gross (subtotal)</option>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Duration"
          value={value.durationType}
          onChange={(e) => set({ durationType: e.target.value })}
        >
          <option value="ONCE">First payment only</option>
          <option value="REPEATING">N months</option>
          <option value="FOREVER">Lifetime</option>
        </Select>
        {value.durationType === "REPEATING" && (
          <Input
            label="Months"
            type="number"
            value={value.durationMonths}
            onChange={(e) => set({ durationMonths: Number(e.target.value) })}
          />
        )}
      </div>
    </>
  );
}

function CreateInfluencerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [commission, setCommission] = React.useState<CommissionState>(BLANK_COMMISSION);
  const [busy, setBusy] = React.useState(false);
  const [credentials, setCredentials] = React.useState<{ code: string; inviteUrl: string | null } | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- reset form fields each time the sheet opens */
  React.useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setCode("");
      setCommission(BLANK_COMMISSION);
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function submit() {
    if (!name.trim() || !email.trim() || !code.trim()) {
      toast.error("Missing fields", "Name, email, and a promo code are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await createInfluencer({
        email: email.trim(),
        displayName: name.trim(),
        code: code.trim(),
        ...commission,
        durationMonths: commission.durationType === "REPEATING" ? commission.durationMonths : undefined,
      });
      toast.success("Influencer created", `Invite emailed to ${email.trim()}.`);
      setCredentials({ code: res.code, inviteUrl: res.inviteUrl });
      router.refresh();
    } catch (err: unknown) {
      toast.error("Couldn't create", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title="New influencer"
        description="Creates an affiliate account, a Stripe promo code, and a separate login."
        width="min(520px, 100vw)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button loading={busy} onClick={submit}>Create influencer</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jamie Rivera" />
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jamie@example.com" />
          </div>
          <Input
            label="Promo code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="JAMIE20"
            hint="What customers type at checkout"
          />
          <div className="pt-1">
            <div className="quiet-caps mb-2">Commission terms</div>
            <div className="space-y-3">
              <CommissionFields value={commission} onChange={setCommission} />
            </div>
          </div>
        </div>
      </Sheet>

      <Dialog
        open={!!credentials}
        onClose={() => {
          setCredentials(null);
          onClose();
        }}
        title="Influencer created"
        description="The invite email is on its way — the link below is the same one, in case you'd rather hand it over yourself."
        footer={
          <Button onClick={() => { setCredentials(null); onClose(); }}>Done</Button>
        }
      >
        {credentials && (
          <div className="space-y-3">
            <CopyRow label="Promo code" value={credentials.code} />
            {credentials.inviteUrl ? (
              <CopyRow label="Invite link" value={credentials.inviteUrl} />
            ) : (
              <p className="text-[12px] text-[color:var(--ink-muted)]">
                You set a password for this influencer — no invite needed.
              </p>
            )}
            <p className="text-[11px] text-[color:var(--ink-muted)]">
              The link (valid 7 days) lets them set a password, then they sign in at{" "}
              <span className="font-mono">/influencer/login</span>.
            </p>
          </div>
        )}
      </Dialog>
    </>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--r-md)] hairline bg-white/60 px-3 py-2">
      <div className="min-w-0">
        <div className="quiet-caps">{label}</div>
        <div className="font-mono text-[13px] text-[color:var(--ink)] truncate">{value}</div>
      </div>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="shrink-0 grid h-8 w-8 place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.04]"
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="h-4 w-4 text-[color:var(--accent)]" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

function InfluencerDetailSheet({
  influencer,
  onClose,
}: {
  influencer: InfluencerDTO | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [addingPromo, setAddingPromo] = React.useState(false);
  const [newCode, setNewCode] = React.useState("");
  const [commission, setCommission] = React.useState<CommissionState>(BLANK_COMMISSION);
  const [editingProfile, setEditingProfile] = React.useState(false);
  const [profileDraft, setProfileDraft] = React.useState({ displayName: "", minPayout: 25, holdDays: 30, notes: "" });
  const [editingPromoId, setEditingPromoId] = React.useState<string | null>(null);
  const [editCommission, setEditCommission] = React.useState<CommissionState>(BLANK_COMMISSION);
  const [inviteUrl, setInviteUrl] = React.useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- reseed drafts when a different influencer opens */
  React.useEffect(() => {
    if (influencer) {
      setProfileDraft({
        displayName: influencer.displayName,
        minPayout: influencer.minPayoutCents / 100,
        holdDays: influencer.holdDays,
        notes: influencer.notes ?? "",
      });
      setEditingProfile(false);
      setEditingPromoId(null);
      setInviteUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [influencer?.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (err: unknown) {
      toast.error("Action failed", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  if (!influencer) return <Sheet open={false} onClose={onClose} />;
  const inf = influencer;
  const isActive = inf.status === "ACTIVE";
  const pendingReqs = inf.payoutRequests.filter((r) => r.status === "PENDING");

  return (
    <Sheet open={!!influencer} onClose={onClose} title={inf.displayName} description={inf.email} width="min(540px, 100vw)">
      <div className="space-y-6">
        {/* Balances */}
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Cleared owed" value={money(inf.balances.clearedCents / 100)} accent />
          <Stat label="Pending (in hold)" value={money(inf.balances.pendingCents / 100)} />
          <Stat label="Lifetime earned" value={money(inf.balances.lifetimeEarnedCents / 100)} />
          <Stat label="Paid out" value={money(inf.balances.paidOutCents / 100)} />
        </div>

        {/* Status + connect */}
        <div className="rounded-[var(--r-md)] hairline bg-white/60 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-medium">Account status</div>
              <div className="text-[11px] text-[color:var(--ink-muted)]">
                {inf.confirmedSubscribers} active subscriber{inf.confirmedSubscribers === 1 ? "" : "s"} · payouts {inf.payoutsEnabled ? "enabled" : "not set up"}
                {!inf.hasPassword && " · hasn't set a password"}
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const res = await sendInfluencerInvite(inf.id);
                    setInviteUrl(res.inviteUrl);
                  }, "Invite sent")
                }
              >
                {inf.hasPassword ? "Resend invite" : "Send invite"}
              </Button>
              <Button
                size="sm"
                variant={isActive ? "outline" : "primary"}
                loading={busy}
                onClick={() =>
                  run(() => setInfluencerStatus(inf.id, isActive ? "SUSPENDED" : "ACTIVE"), isActive ? "Suspended" : "Reactivated")
                }
              >
                {isActive ? "Suspend" : "Reactivate"}
              </Button>
            </div>
          </div>
          {inviteUrl && (
            <div className="mt-2">
              <CopyRow label="Invite link (7 days)" value={inviteUrl} />
            </div>
          )}
        </div>

        {/* Profile & payout terms */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="quiet-caps !mb-0">Profile & payout terms</span>
            <button
              className="text-[11px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]"
              onClick={() => setEditingProfile((v) => !v)}
            >
              {editingProfile ? "Cancel" : "Edit"}
            </button>
          </div>
          {editingProfile ? (
            <div className="space-y-3 rounded-[var(--r-md)] hairline bg-white/40 p-3">
              <Input
                label="Display name"
                value={profileDraft.displayName}
                onChange={(e) => setProfileDraft({ ...profileDraft, displayName: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Min payout ($)"
                  type="number"
                  value={profileDraft.minPayout}
                  onChange={(e) => setProfileDraft({ ...profileDraft, minPayout: Number(e.target.value) })}
                />
                <Input
                  label="Hold days"
                  type="number"
                  value={profileDraft.holdDays}
                  onChange={(e) => setProfileDraft({ ...profileDraft, holdDays: Number(e.target.value) })}
                  hint="Days before commission clears"
                />
              </div>
              <Textarea
                label="Notes"
                value={profileDraft.notes}
                onChange={(e) => setProfileDraft({ ...profileDraft, notes: e.target.value })}
                rows={2}
              />
              <Button
                size="sm"
                loading={busy}
                onClick={() =>
                  run(
                    () =>
                      updateInfluencerProfile({
                        id: inf.id,
                        displayName: profileDraft.displayName.trim() || undefined,
                        minPayoutCents: Math.max(0, Math.round(profileDraft.minPayout * 100)),
                        holdDays: profileDraft.holdDays,
                        notes: profileDraft.notes.trim() || null,
                      }),
                    "Profile updated",
                  ).then(() => setEditingProfile(false))
                }
              >
                Save
              </Button>
            </div>
          ) : (
            <p className="text-[12px] text-[color:var(--ink-muted)]">
              Min payout {money(inf.minPayoutCents / 100)} · {inf.holdDays}-day hold
              {inf.notes ? ` · ${inf.notes}` : ""}
            </p>
          )}
        </div>

        {/* Promo codes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="quiet-caps !mb-0">Promo codes</span>
            <button
              className="text-[11px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]"
              onClick={() => setAddingPromo((v) => !v)}
            >
              {addingPromo ? "Cancel" : "+ Add code"}
            </button>
          </div>
          <ul className="space-y-1.5">
            {inf.promoCodes.map((p) => (
              <li key={p.id} className="rounded-[var(--r-md)] hairline bg-white/60 px-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <span className="font-mono text-[13px] text-[color:var(--ink)]">{p.code}</span>
                    <div className="text-[11px] text-[color:var(--ink-muted)]">
                      {describeCommission(p)} · {p.commissionBasis.toLowerCase()}
                      {p.customerPercentOff ? ` · buyer saves ${p.customerPercentOff}%` : ""}
                      {` · ${p.clicks} click${p.clicks === 1 ? "" : "s"}`}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        if (editingPromoId === p.id) {
                          setEditingPromoId(null);
                          return;
                        }
                        setEditingPromoId(p.id);
                        setEditCommission({
                          customerPercentOff: p.customerPercentOff ?? 10,
                          commissionType: p.commissionType,
                          commissionValue:
                            p.commissionType === "PERCENT"
                              ? (p.commissionRateBps ?? 0) / 100
                              : (p.commissionFlatCents ?? 0) / 100,
                          commissionBasis: p.commissionBasis,
                          durationType: p.durationType,
                          durationMonths: p.durationMonths ?? 12,
                        });
                      }}
                    >
                      {editingPromoId === p.id ? "Close" : "Edit"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => run(() => setPromoActive(p.id, !p.active), p.active ? "Code disabled" : "Code enabled")}
                    >
                      {p.active ? "Disable" : "Enable"}
                    </Button>
                  </div>
                </div>
                {editingPromoId === p.id && (
                  <div className="mt-3 space-y-3 rounded-[var(--r-md)] hairline bg-white/40 p-3">
                    <p className="text-[11px] text-[color:var(--ink-muted)]">
                      Commission terms only — the buyer&apos;s {p.customerPercentOff ?? "—"}% discount is fixed on the
                      Stripe coupon. Issue a new code to change what customers save.
                    </p>
                    <CommissionFields value={editCommission} onChange={setEditCommission} />
                    <Button
                      size="sm"
                      loading={busy}
                      onClick={() =>
                        run(
                          () =>
                            updatePromoCommission({
                              promoId: p.id,
                              ...editCommission,
                              durationMonths:
                                editCommission.durationType === "REPEATING" ? editCommission.durationMonths : undefined,
                            }),
                          "Commission updated",
                        ).then(() => setEditingPromoId(null))
                      }
                    >
                      Save commission
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {addingPromo && (
            <div className="mt-3 space-y-3 rounded-[var(--r-md)] hairline bg-white/40 p-3">
              <Input label="New code" value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="JAMIE-SUMMER" />
              <CommissionFields value={commission} onChange={setCommission} />
              <Button
                size="sm"
                loading={busy}
                onClick={() =>
                  run(
                    () =>
                      createPromoCode({
                        influencerId: inf.id,
                        code: newCode.trim(),
                        ...commission,
                        durationMonths: commission.durationType === "REPEATING" ? commission.durationMonths : undefined,
                      }),
                    "Code added",
                  ).then(() => {
                    setAddingPromo(false);
                    setNewCode("");
                  })
                }
              >
                Add promo code
              </Button>
            </div>
          )}
        </div>

        {/* Payout requests */}
        <div>
          <span className="quiet-caps">Payout requests</span>
          {inf.payoutRequests.length === 0 ? (
            <p className="text-[12px] text-[color:var(--ink-muted)] mt-1">No payout requests yet.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {inf.payoutRequests.map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded-[var(--r-md)] hairline bg-white/60 px-3 py-2">
                  <div>
                    <div className="text-[13px] tabular">{money(r.amountCents / 100)}</div>
                    <div className="text-[11px] text-[color:var(--ink-muted)]">{r.status.toLowerCase()}</div>
                  </div>
                  {r.status === "PENDING" && (
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => rejectPayoutRequest(r.id), "Rejected")}>
                        Reject
                      </Button>
                      <Button size="sm" disabled={busy} onClick={() => run(() => approvePayoutRequest(r.id), "Approved — queued for transfer")}>
                        Approve
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {pendingReqs.length === 0 && inf.balances.clearedCents > 0 && (
            <p className="text-[11px] text-[color:var(--ink-faint)] mt-1.5">
              {money(inf.balances.clearedCents / 100)} cleared and available — the influencer can request a payout from their dashboard.
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[var(--r-md)] hairline bg-white/60 px-3 py-2.5">
      <div className="quiet-caps">{label}</div>
      <div className={`stat-numeric text-[20px] mt-1 ${accent ? "text-[color:var(--accent)]" : "text-[color:var(--ink)]"}`}>
        {value}
      </div>
    </div>
  );
}
