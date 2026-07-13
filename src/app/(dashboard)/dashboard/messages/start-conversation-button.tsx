"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { Avatar } from "@/components/ui/Avatar";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { roleLabel } from "@/lib/prismaEnums";
import { createConversation } from "@/actions/messages";
import { reportPlanLimit, ensureWithinLimit } from "@/stores/usePlanLimitStore";

export interface MemberOption {
  userId: string;
  name: string;
  email: string;
  role: string;
}

export function StartConversationButton({ members }: { members: MemberOption[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [title, setTitle] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const isGroup = selected.length > 1;

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [members, search]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function reset() {
    setSelected([]);
    setTitle("");
    setSearch("");
  }
  function close() {
    setOpen(false);
    reset();
  }

  async function submit() {
    if (selected.length === 0) return;
    if (!(await ensureWithinLimit("conversationsStarted"))) return;
    setBusy(true);
    try {
      const chosen = members.filter((m) => selected.includes(m.userId));
      const res = await createConversation({
        participantIds: selected,
        kind: isGroup ? "GROUP" : "DIRECT",
        title: isGroup
          ? title.trim() || chosen.map((m) => m.name.split(" ")[0]).join(", ")
          : chosen[0]?.name,
      });
      close();
      router.push(`/dashboard/messages?c=${res.id}` as any);
      router.refresh();
    } catch (err: any) {
      if (!reportPlanLimit(err)) toast.error("Couldn't start", err?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>
        New conversation
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={isGroup ? "New group" : "New conversation"}
        description={
          selected.length === 0
            ? "Pick one teammate for a direct chat, or several for a group."
            : isGroup
              ? `Group with ${selected.length} people.`
              : "Direct chat."
        }
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy} disabled={selected.length === 0}>
              {isGroup ? "Create group" : "Start chat"}
            </Button>
          </>
        }
      >
        {members.length === 0 ? (
          <p className="text-sm text-[color:var(--ink-muted)]">
            No teammates yet. Add someone to your team first, then you can message them.
          </p>
        ) : (
          <div className="space-y-3">
            {isGroup && (
              <Input
                label="Group name (optional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Roof crew · Maple St"
              />
            )}
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search team…"
              prefix={<Search className="h-3.5 w-3.5" />}
            />
            <div className="-mx-1 max-h-[300px] space-y-1 overflow-y-auto px-1">
              {filtered.map((m) => {
                const active = selected.includes(m.userId);
                return (
                  <button
                    key={m.userId}
                    type="button"
                    onClick={() => toggle(m.userId)}
                    aria-pressed={active}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[var(--r-md)] px-2.5 py-2 text-left transition-colors",
                      active ? "bg-[color:var(--accent-soft)]" : "hover:bg-black/[0.03]",
                    )}
                  >
                    <Avatar name={m.name} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-[color:var(--ink)]">
                        {m.name}
                      </div>
                      <div className="truncate text-[11px] text-[color:var(--ink-muted)]">
                        {roleLabel(m.role)}
                        {m.email ? ` · ${m.email}` : ""}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors",
                        active
                          ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white"
                          : "border-[color:var(--ink-line)]",
                      )}
                    >
                      {active && <Check className="h-3 w-3" />}
                    </span>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className="px-2 py-5 text-center text-[12px] text-[color:var(--ink-muted)]">
                  No match.
                </p>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
