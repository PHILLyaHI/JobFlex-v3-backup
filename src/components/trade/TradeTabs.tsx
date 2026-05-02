"use client";
import * as React from "react";
import { MessageSquare, Megaphone } from "lucide-react";
import { cn } from "@/lib/cn";

export type TradeTab = "posts" | "influencers";

interface Props {
  active: TradeTab;
  onChange: (next: TradeTab) => void;
}

export function TradeTabs({ active, onChange }: Props) {
  return (
    <nav className="flex items-center gap-1 mb-5">
      {[
        { key: "posts" as const, label: "Posts", icon: <MessageSquare className="h-3.5 w-3.5" /> },
        { key: "influencers" as const, label: "Influencers", icon: <Megaphone className="h-3.5 w-3.5" /> },
      ].map((t) => {
        const a = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              "inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-medium transition-all",
              a
                ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
                : "text-[color:var(--ink-muted)] hover:bg-black/[0.04] hairline",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
