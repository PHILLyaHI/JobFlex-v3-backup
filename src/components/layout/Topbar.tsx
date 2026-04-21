"use client";
import * as React from "react";
import Link from "next/link";
import { Search, Bell, Plus, Command } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useUiStore } from "@/stores/useUiStore";

interface TopbarProps {
  user?: { name?: string | null; email: string };
  orgName?: string;
}

export function Topbar({ user, orgName }: TopbarProps) {
  const setCommandOpen = useUiStore((s) => s.setCommandOpen);
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 h-16 px-6 border-b border-[color:var(--ink-line)] bg-[color:var(--paper)]/80 backdrop-blur-md">
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
        <Link href={"/dashboard/proposals/ai" as any}>
          <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />}>
            New Proposal
          </Button>
        </Link>
        <button className="relative h-9 w-9 grid place-items-center rounded-[var(--r-md)] hover:bg-black/[0.04] dark:hover:bg-white/[0.05] text-[color:var(--ink-soft)]">
          <Bell className="h-4 w-4" />
          <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
        </button>
        <div className="flex items-center gap-2 pl-2 border-l border-[color:var(--ink-line)]">
          <Avatar name={user?.name ?? user?.email ?? "?"} size={28} />
          <div className="hidden md:flex flex-col leading-tight">
            <span className="text-[12px] font-medium text-[color:var(--ink)]">{user?.name ?? user?.email ?? "Guest"}</span>
            {orgName && (
              <span className="text-[10px] text-[color:var(--ink-muted)] tracking-[0.06em]">
                {orgName}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
