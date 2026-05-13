"use client";
import * as React from "react";
import Link from "next/link";
import { Search, Bell, Plus, Command } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useUiStore } from "@/stores/useUiStore";
import { OrgSwitcher, type OrgMembershipItem } from "@/components/layout/OrgSwitcher";

interface TopbarProps {
  user?: { name?: string | null; email: string };
  memberships?: OrgMembershipItem[];
  plan?: string | null;
}

export function Topbar({ user, memberships = [] }: TopbarProps) {
  const setCommandOpen = useUiStore((s) => s.setCommandOpen);
  return (
    <header className="sticky top-0 z-30 hidden md:flex items-center gap-3 h-16 px-6 border-b border-[color:var(--ink-line)] bg-[color:var(--paper)]/80 backdrop-blur-md">
      <button
        onClick={() => setCommandOpen(true)}
        className="flex items-center gap-2 h-9 px-3 rounded-[var(--r-md)] bg-white/60 dark:bg-white/[0.03] hairline text-[12px] text-[color:var(--ink-muted)] w-[360px] max-w-[40vw] transition-all hover:shadow-[0_0_0_3px_rgba(79,70,229,0.12)]"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search clients, proposals, leads…</span>
        <span className="ml-auto flex items-center gap-0.5 text-[10px] text-[color:var(--ink-faint)]">
          <Command className="h-3 w-3" />
          <span>K</span>
        </span>
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        {memberships.length > 0 && <OrgSwitcher memberships={memberships} />}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Link href={"/dashboard/proposals/ai" as any}>
          <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />}>
            New Proposal
          </Button>
        </Link>
        <button
          aria-label="Notifications"
          className="relative h-9 w-9 grid place-items-center rounded-[var(--r-md)] hover:bg-black/[0.04] dark:hover:bg-white/[0.05] text-[color:var(--ink-soft)]"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
        </button>
        <button
          aria-label="Account menu"
          title={user?.name ?? user?.email ?? "Guest"}
          className="ml-1 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40"
        >
          <Avatar name={user?.name ?? user?.email ?? "?"} size={32} />
        </button>
      </div>
    </header>
  );
}
