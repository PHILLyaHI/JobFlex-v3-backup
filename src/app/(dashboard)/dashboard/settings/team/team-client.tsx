"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Copy, Check } from "lucide-react";
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

const ROLES = ["OWNER", "ADMIN", "SALES", "ESTIMATOR", "INSTALLER", "ACCOUNTANT", "USER"];

export function TeamClient({
  members,
  invites,
}: {
  members: MemberRow[];
  invites: InviteRow[];
}) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = React.useState(false);

  async function changeRole(id: string, role: string) {
    try {
      await updateMembershipRole(id, role);
      toast.success("Role updated");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't update", err?.message);
    }
  }

  async function drop(id: string) {
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
    <>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Members</CardTitle>
            <CardSubtitle>{members.length} on the team</CardSubtitle>
          </div>
          <Button icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setInviteOpen(true)}>
            Invite
          </Button>
        </CardHeader>
        <ul className="divide-y divide-[color:var(--ink-line)]">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-3">
              <Avatar name={m.name ?? m.email} size={34} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
                  {m.name ?? m.email}
                </div>
                <div className="text-[11px] text-[color:var(--ink-muted)] truncate">{m.email}</div>
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
              <span className="text-[11px] text-[color:var(--ink-muted)] tabular">
                Joined {relative(m.joinedAt)}
              </span>
              <button
                onClick={() => drop(m.id)}
                className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-rose-700"
                aria-label="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>Pending invites</CardTitle>
            <CardSubtitle>Invites expire after 7 days</CardSubtitle>
          </div>
          <Badge tone="neutral">{invites.length}</Badge>
        </CardHeader>
        {invites.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)]">No pending invites.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {invites.map((i) => (
              <InviteRow key={i.id} invite={i} onRevoke={() => revoke(i.id)} />
            ))}
          </ul>
        )}
      </Card>

      <InviteSheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSubmit={async (values) => {
          try {
            await createInvite(values);
            toast.success("Invite sent", "Share the magic link if email is disabled.");
            router.refresh();
          } catch (err: any) {
            toast.error("Invite failed", err?.message);
          }
        }}
      />
    </>
  );
}

function InviteRow({ invite, onRevoke }: { invite: InviteRow; onRevoke: () => void }) {
  const [copied, setCopied] = React.useState(false);
  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/invite/${invite.token}`
      : `/auth/invite/${invite.token}`;
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[color:var(--ink)]">{invite.email}</div>
        <div className="text-[11px] text-[color:var(--ink-muted)]">
          {invite.invitedByName ? `invited by ${invite.invitedByName} · ` : ""}
          expires {longDate(invite.expiresAt)}
        </div>
      </div>
      <Badge tone="accent">{invite.role.toLowerCase()}</Badge>
      <button
        onClick={() => {
          navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.05]"
        aria-label="Copy invite link"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <button
        onClick={onRevoke}
        className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-rose-700"
        aria-label="Revoke"
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
  const [role, setRole] = React.useState("SALES");
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
      width="min(460px, 100vw)"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            Send invite
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@example.com"
        />
        <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r.toLowerCase()}
            </option>
          ))}
        </Select>
      </div>
    </Sheet>
  );
}
