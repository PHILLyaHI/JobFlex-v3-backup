"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Palette, Globe, Users, CreditCard } from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/v3/company", label: "Branding", icon: Palette },
  { href: "/v3/company/landing-builder", label: "Landing builder", icon: Globe, beta: true },
  { href: "/v3/company/team", label: "Team", icon: Users },
  { href: "/v3/company/subscription", label: "Subscription", icon: CreditCard },
];

export function CompanyTabsV3() {
  const pathname = usePathname();

  return (
    <div className="relative -mt-2 mb-8 border-b border-[color:var(--ink-line)]">
      <nav className="flex items-center gap-1 overflow-x-auto -mb-px">
        {TABS.map((t) => {
          const active = pathname === t.href;
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href as any}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative shrink-0 inline-flex items-center gap-2 px-4 py-3 text-[13px] font-medium transition-colors",
                active
                  ? "text-[color:var(--ink)]"
                  : "text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)]",
              )}
            >
              <Icon
                className={cn(
                  "h-3.5 w-3.5 transition-colors",
                  active
                    ? "text-[color:var(--accent)]"
                    : "text-[color:var(--ink-muted)] group-hover:text-[color:var(--ink-soft)]",
                )}
              />
              <span>{t.label}</span>
              {t.beta && (
                <span className="ml-0.5 text-[9px] uppercase tracking-[0.14em] font-semibold text-[color:var(--ink-muted)] px-1 py-px rounded-sm bg-black/[0.04]">
                  beta
                </span>
              )}
              <span
                aria-hidden
                className={cn(
                  "absolute left-3 right-3 -bottom-px h-px transition-colors",
                  active ? "bg-[color:var(--ink)]" : "bg-transparent",
                )}
              />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
