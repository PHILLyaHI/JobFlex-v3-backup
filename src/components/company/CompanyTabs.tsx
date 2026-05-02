"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Palette, Globe, Users, CreditCard } from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/dashboard/company", label: "Branding", icon: <Palette className="h-3.5 w-3.5" /> },
  { href: "/dashboard/company/landing", label: "Landing builder", icon: <Globe className="h-3.5 w-3.5" /> },
  { href: "/dashboard/company/team", label: "Team", icon: <Users className="h-3.5 w-3.5" /> },
  { href: "/dashboard/company/subscription", label: "Subscription", icon: <CreditCard className="h-3.5 w-3.5" /> },
];

export function CompanyTabs() {
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
