"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CreditCard,
  Building2,
  Palette,
  FileText,
  Inbox,
  Sparkles,
  Users,
  Mail,
  AtSign,
  Webhook,
  Banknote,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface SettingsItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface SettingsGroup {
  title: string;
  items: SettingsItem[];
}

const GROUPS: SettingsGroup[] = [
  {
    title: "Account",
    items: [
      { href: "/dashboard/settings/account", label: "Account", icon: <CreditCard className="h-3.5 w-3.5" /> },
      { href: "/dashboard/settings/company", label: "Company", icon: <Building2 className="h-3.5 w-3.5" /> },
      { href: "/dashboard/settings/theme", label: "Theme", icon: <Palette className="h-3.5 w-3.5" /> },
    ],
  },
  {
    title: "Workflow",
    items: [
      { href: "/dashboard/settings/proposals", label: "Proposals", icon: <FileText className="h-3.5 w-3.5" /> },
      { href: "/dashboard/settings/leads", label: "Leads", icon: <Inbox className="h-3.5 w-3.5" /> },
      { href: "/dashboard/settings/ai", label: "AI Assistant", icon: <Sparkles className="h-3.5 w-3.5" /> },
    ],
  },
  {
    title: "Team",
    items: [
      { href: "/dashboard/settings/team", label: "Team & workers", icon: <Users className="h-3.5 w-3.5" /> },
    ],
  },
  {
    title: "Comms",
    items: [
      { href: "/dashboard/settings/email", label: "Email", icon: <Mail className="h-3.5 w-3.5" /> },
      { href: "/dashboard/settings/gmail", label: "Gmail", icon: <AtSign className="h-3.5 w-3.5" /> },
      { href: "/dashboard/settings/meta", label: "Meta", icon: <Webhook className="h-3.5 w-3.5" /> },
    ],
  },
  {
    title: "Billing",
    items: [
      { href: "/dashboard/settings/payment", label: "Payment", icon: <Banknote className="h-3.5 w-3.5" /> },
    ],
  },
];

export function SettingsRail() {
  const pathname = usePathname();
  return (
    <aside className="lg:sticky lg:top-24">
      {/* Mobile horizontal scroll */}
      <div className="lg:hidden flex gap-1.5 overflow-x-auto pb-3 -mx-4 px-4 mb-4">
        {GROUPS.flatMap((g) => g.items).map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href as any}
              className={cn(
                "shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium hairline transition-colors",
                active
                  ? "bg-[color:var(--ink)] text-[color:var(--paper)] border-transparent"
                  : "text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Desktop vertical rail */}
      <nav className="hidden lg:flex flex-col gap-5 w-[220px]">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="quiet-caps mb-2 px-3">{g.title}</div>
            <div className="flex flex-col gap-0.5">
              {g.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href as any}
                    className={cn(
                      "relative flex items-center gap-2.5 h-9 px-3 rounded-[var(--r-sm)] text-[13px] transition-all",
                      active
                        ? "bg-[color:var(--accent-soft)]/60 text-[color:var(--accent-ink)] font-medium"
                        : "text-[color:var(--ink-soft)] hover:bg-black/[0.03]",
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r bg-[color:var(--accent)]" />
                    )}
                    <span
                      className={cn(active ? "text-[color:var(--accent)]" : "opacity-70")}
                    >
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
