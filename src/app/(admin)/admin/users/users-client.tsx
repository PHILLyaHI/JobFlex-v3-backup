"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, ShieldCheck } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import { longDate } from "@/lib/format";
import { updateAdminUser } from "@/actions/adminUsers";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  isPlatformAdmin: boolean;
  orgId: string | null;
  orgName: string | null;
  plan: string;
  planStatus: string;
  orgMemberCount: number;
  createdAt: string;
}

interface PlanOption {
  slug: string;
  name: string;
}

const STATUS_TONE: Record<string, "success" | "info" | "warn" | "neutral" | "danger"> = {
  ACTIVE: "success",
  TRIALING: "info",
  PAST_DUE: "warn",
  CANCELED: "neutral",
  FREE: "neutral",
};

export function UsersClient({
  users,
  plans,
  currentUserId,
}: {
  users: UserRow[];
  plans: PlanOption[];
  currentUserId: string;
}) {
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<UserRow | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = !q
      ? users
      : users.filter(
          (u) =>
            (u.name ?? "").toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            (u.orgName ?? "").toLowerCase().includes(q),
        );
    // Surface the signed-in admin first so "where am I?" is always answerable.
    return [...matched].sort(
      (a, b) => (b.id === currentUserId ? 1 : 0) - (a.id === currentUserId ? 1 : 0),
    );
  }, [users, query, currentUserId]);

  const columns: Column<UserRow>[] = [
    {
      key: "user",
      header: "User",
      render: (u) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar name={u.name ?? u.email} size={28} />
          <div className="min-w-0">
            <div className="font-medium text-[color:var(--ink)] truncate flex items-center gap-1.5">
              {u.name ?? "—"}
              {u.id === currentUserId && <Badge tone="accent">You</Badge>}
              {u.isPlatformAdmin && (
                <ShieldCheck className="h-3.5 w-3.5 text-[color:var(--accent)]" aria-label="Platform admin" />
              )}
            </div>
            <div className="text-[11px] text-[color:var(--ink-muted)] truncate">{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: "org",
      header: "Organization",
      render: (u) => (
        <span className="text-[12px] text-[color:var(--ink-soft)] truncate">{u.orgName ?? "—"}</span>
      ),
    },
    {
      key: "plan",
      header: "Plan",
      render: (u) => <Badge tone={u.plan === "FREE" ? "neutral" : "accent"}>{u.plan.toLowerCase()}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      render: (u) => (
        <Badge tone={STATUS_TONE[u.planStatus] ?? "neutral"}>{u.planStatus.toLowerCase().replace("_", " ")}</Badge>
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="w-full md:w-auto md:min-w-[320px]">
          <Input
            placeholder="Search by name, email, or org…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            prefix={<Search className="h-3.5 w-3.5" />}
          />
        </div>
        <div className="ml-auto text-[11px] text-[color:var(--ink-muted)] tabular">
          {filtered.length} / {users.length} users
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(u) => u.id}
        onRowClick={(u) => setSelected(u)}
        empty={<EmptyState title="No users match" description="Adjust your search." />}
      />

      <EditUserSheet user={selected} plans={plans} onClose={() => setSelected(null)} />
    </>
  );
}

function EditUserSheet({
  user,
  plans,
  onClose,
}: {
  user: UserRow | null;
  plans: PlanOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [planSlug, setPlanSlug] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate fields when a user is opened */
  React.useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setEmail(user.email);
      // Pre-select the plan if the user's current plan matches a known slug.
      const match = plans.find((p) => p.slug.toLowerCase() === user.plan.toLowerCase());
      setPlanSlug(match?.slug ?? "");
    }
  }, [user, plans]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function save() {
    if (!user) return;
    setBusy(true);
    try {
      await updateAdminUser({
        userId: user.id,
        email: email.trim() !== user.email ? email.trim() : undefined,
        name: name.trim() !== (user.name ?? "") ? name.trim() : undefined,
        planSlug: planSlug || undefined,
      });
      toast.success("Saved");
      onClose();
      router.refresh();
    } catch (err: unknown) {
      toast.error("Couldn't save", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!user}
      onClose={onClose}
      title={user?.name ?? user?.email}
      description="Edit account details and assign a pricing plan."
      width="min(460px, 100vw)"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} onClick={save}>
            Save
          </Button>
        </div>
      }
    >
      {user && (
        <div className="space-y-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="user-plan" className="quiet-caps">
              Pricing plan
            </label>
            <select
              id="user-plan"
              value={planSlug}
              onChange={(e) => setPlanSlug(e.target.value)}
              className="h-10 rounded-[var(--r-md)] bg-white/60 px-3 text-sm text-[color:var(--ink)] hairline outline-none focus-visible:shadow-[0_0_0_3px_rgba(31,122,82,0.18)]"
            >
              <option value="">— Leave unchanged —</option>
              {plans.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-[color:var(--ink-muted)] leading-relaxed">
              Plan is set on <strong>{user.orgName ?? "this org"}</strong> and is shared by all{" "}
              {user.orgMemberCount} member{user.orgMemberCount === 1 ? "" : "s"}. Changing it affects
              everyone in that org, not just this user. Manual override; it doesn&rsquo;t change Stripe billing.
            </p>
          </div>

          <div className="pt-2 mt-1 border-t border-[color:var(--ink-line)] text-[11px] text-[color:var(--ink-muted)] space-y-1">
            <div>Organization: {user.orgName ?? "—"}</div>
            <div>Current plan: {user.plan.toLowerCase()} · {user.planStatus.toLowerCase().replace("_", " ")}</div>
            <div>Member since {longDate(user.createdAt)}</div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
