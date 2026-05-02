"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Workflow, Clock } from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/dashboard/crm", label: "Overview", icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
  { href: "/dashboard/crm/customers", label: "Customer book", icon: <Users className="h-3.5 w-3.5" /> },
  { href: "/dashboard/crm/workflows", label: "Workflows", icon: <Workflow className="h-3.5 w-3.5" /> },
  { href: "/dashboard/crm/queue", label: "Follow-up queue", icon: <Clock className="h-3.5 w-3.5" /> },
];

export function CrmTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 -mt-2 mb-6 overflow-x-auto pb-1">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href as any}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-medium transition-all",
              active
                ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
                : "text-[color:var(--ink-muted)] hover:bg-black/[0.04] hairline",
            )}
          >
            {t.icon}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
