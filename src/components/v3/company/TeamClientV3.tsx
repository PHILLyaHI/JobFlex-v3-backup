"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Copy, Check, MailPlus, Clock3, Users } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Select } from "@/components/ui/Select";
import { Sheet } from "@/components/ui/Sheet";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";
import { relative, longDate } from "@/lib/format";
import {
  createInvite,
  revokeInvite,
  updateMembershipRole,
  removeMember,
} from "@/actions/team";
import { reportPlanLimit, ensureWithinLimit } from "@/stores/usePlanLimitStore";

interface MemberRow {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: string;
  joinedAt: Date;
}

interface InviteRow {
  id: string;
  email: string;
  role: string;
  token: string;
  invitedByName: string | null;
  expiresAt: Date;
  createdAt: Date;
}

const ROLES = ["OWNER", "ADMIN", "SALES", "ESTIMATOR", "INSTALLER", "ACCOUNTANT", "USER"] as const;
type RoleKey = (typeof ROLES)[number];

const ROLE_TONE: Record<RoleKey, "success" | "accent" | "neutral"> = {
  OWNER: "success",
  ADMIN: "accent",
  SALES: "accent",
  ESTIMATOR: "neutral",
  INSTALLER: "neutral",
  ACCOUNTANT: "neutral",
  USER: "neutral",
};

const ROLE_DESCRIPTION: Record<RoleKey, string> = {
  OWNER: "Full access. Billing, team, and all data.",
  ADMIN: "Manage team and most settings. No billing.",
  SALES: "Create and send proposals. View clients & leads.",
  ESTIMATOR: "Build estimates and measurements.",
  INSTALLER: "Field access — assignments and job updates.",
  ACCOUNTANT: "View financials, invoices, and payments.",
  USER: "Baseline access to assigned work only.",
};

export function TeamClientV3({
  members,
  invites,
}: {
  members: MemberRow[];
  invites: InviteRow[];
}) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = React.useState(false);

  const byRole = React.useMemo(() => {
    const counts = new Map<string, number>();
    members.forEach((m) => counts.set(m.role, (counts.get(m.role) ?? 0) + 1));
    return counts;
  }, [members]);

  async function changeRole(id: string, role: string) {
    try {
      await updateMembershipRole(id, role);
      toast.success("Role updated");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't update", err?.message);
    }
  }

  async function drop(id: string, name: string) {
    if (!confirm(`Remove ${name} from the team?`)) return;
    try {
      await removeMember(id);
      toast.success("Removed");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't remove", err?.message);
    }
  }

  async function revoke(id: string) {
    try {
      await revokeInvite(id);
      toast.success("Invite revoked");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't revoke", err?.message);
    }
  }

  return (
    <div className="space-y-6">
      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile label="Active members" value={members.length} icon={<Users className="h-3.5 w-3.5" />} />
        <StatTile label="Owners" value={byRole.get("OWNER") ?? 0} />
        <StatTile label="Admins" value={byRole.get("ADMIN") ?? 0} />
        <StatTile label="Pending invites" value={invites.length} icon={<Clock3 className="h-3.5 w-3.5" />} />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Members</CardTitle>
            <CardSubtitle>{members.length} on the team</CardSubtitle>
          </div>
          <Button icon={<MailPlus className="h-3.5 w-3.5" />} onClick={() => setInviteOpen(true)}>
            Invite teammate
          </Button>
        </CardHeader>

        {/* Header row */}
        <div className="hidden md:grid grid-cols-[1fr_180px_140px_40px] gap-3 px-1 pb-2 mb-1 border-b border-[color:var(--ink-line)]">
          <div className="quiet-caps">Person</div>
          <div className="quiet-caps">Role</div>
          <div className="quiet-caps">Joined</div>
          <div />
        </div>

        <ul className="divide-y divide-[color:var(--ink-line)]">
          {members.map((m) => (
            <li
              key={m.id}
              className="grid grid-cols-1 md:grid-cols-[1fr_180px_140px_40px] items-center gap-3 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name={m.name ?? m.email} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
                    {m.name ?? m.email}
                  </div>
                  <div className="text-[11px] text-[color:var(--ink-muted)] truncate">{m.email}</div>
                </div>
                {/* Mobile-only inline role badge */}
                <div className="md:hidden">
                  <Badge tone={ROLE_TONE[m.role as RoleKey] ?? "neutral"}>
                    {m.role.toLowerCase()}
                  </Badge>
                </div>
              </div>

              <div className="hidden md:block">
                <Select value={m.role} onChange={(e) => changeRole(m.id, e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r.toLowerCase()}
                    </option>
                  ))}
                </Select>
              </div>

              <span className="hidden md:inline text-[11px] text-[color:var(--ink-muted)] tabular">
                {relative(m.joinedAt)}
              </span>

              <button
                onClick={() => drop(m.id, m.name ?? m.email)}
                className="h-8 w-8 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-rose-700 justify-self-end"
                aria-label="Remove member"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>

        {members.length === 0 && (
          <div className="text-center py-10 text-[12px] text-[color:var(--ink-muted)]">
            No members yet. Invite your first teammate above.
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Pending invites</CardTitle>
            <CardSubtitle>Invites expire after 7 days.</CardSubtitle>
          </div>
          <Badge tone="neutral">{invites.length}</Badge>
        </CardHeader>
        {invites.length === 0 ? (
          <div className="text-center py-8 text-[12px] text-[color:var(--ink-muted)]">
            No pending invites.
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {invites.map((i) => (
              <InviteRowItem key={i.id} invite={i} onRevoke={() => revoke(i.id)} />
            ))}
          </ul>
        )}
      </Card>

      <InviteSheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSubmit={async (values) => {
          // Installer invites draw from the worker seat cap; office roles from teamSeats.
          if (!(await ensureWithinLimit(values.role === "INSTALLER" ? "workers" : "teamSeats"))) return;
          try {
            await createInvite(values);
            toast.success("Invite sent", "Share the magic link if email is disabled.");
            router.refresh();
          } catch (err: any) {
            if (!reportPlanLimit(err)) toast.error("Invite failed", err?.message);
          }
        }}
      />
    </div>
  );
}

function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="paper-card !shadow-none p-4">
      <div className="quiet-caps inline-flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-display text-[28px] leading-none tracking-[-0.02em] tabular">
        {value}
      </div>
    </div>
  );
}

function InviteRowItem({
  invite,
  onRevoke,
}: {
  invite: InviteRow;
  onRevoke: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/invite/${invite.token}`
      : `/auth/invite/${invite.token}`;
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="h-9 w-9 rounded-full bg-[color:var(--accent-soft)] grid place-items-center shrink-0">
        <MailPlus className="h-4 w-4 text-[color:var(--accent)]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
          {invite.email}
        </div>
        <div className="text-[11px] text-[color:var(--ink-muted)]">
          {invite.invitedByName ? `invited by ${invite.invitedByName} · ` : ""}
          expires {longDate(invite.expiresAt)}
        </div>
      </div>
      <Badge tone={ROLE_TONE[invite.role as RoleKey] ?? "neutral"}>
        {invite.role.toLowerCase()}
      </Badge>
      <button
        onClick={() => {
          navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="h-8 w-8 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.05]"
        aria-label="Copy invite link"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <button
        onClick={onRevoke}
        className="h-8 w-8 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-rose-700"
        aria-label="Revoke invite"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function InviteSheet({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (v: { email: string; role: string }) => Promise<void>;
}) {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<RoleKey>("SALES");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await onSubmit({ email: email.trim().toLowerCase(), role });
      setEmail("");
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Invite a teammate"
      description="They'll get an email with a magic link that expires in 7 days."
      width="min(520px, 100vw)"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} icon={<Plus className="h-3.5 w-3.5" />}>
            Send invite
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@example.com"
        />
        <div>
          <div className="quiet-caps mb-2">Role</div>
          <div className="grid grid-cols-1 gap-1.5">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                aria-pressed={role === r}
                className={`text-left p-3 rounded-[var(--r-md)] hairline transition-colors ${
                  role === r
                    ? "bg-[color:var(--accent-soft)]/40 border-[color:var(--accent)]/40"
                    : "bg-white/40 hover:bg-white/70"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-[color:var(--ink)] capitalize">
                    {r.toLowerCase()}
                  </span>
                  {role === r && (
                    <Check className="h-3.5 w-3.5 text-[color:var(--accent)]" />
                  )}
                </div>
                <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5 leading-relaxed">
                  {ROLE_DESCRIPTION[r]}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
