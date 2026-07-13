"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  User,
  CreditCard,
  CalendarCog,
  CalendarDays,
  SquareTerminal,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface SettingsItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
}

const ITEMS: SettingsItem[] = [
  { href: "/dashboard/settings/account", label: "Account", icon: <User /> },
  { href: "/dashboard/settings/payment", label: "Billing", icon: <CreditCard /> },
  { href: "/dashboard/settings/preferences", label: "Preferences", icon: <CalendarCog /> },
  { href: "/dashboard/calendar", label: "Schedules", icon: <CalendarDays />, badge: "NEW" },
  { href: "/dashboard/settings/integrations", label: "Integrations", icon: <SquareTerminal /> },
];

const FOOTER_ITEMS: SettingsItem[] = [
  { href: "/dashboard/support", label: "Help Center", icon: <BookOpen /> },
];

function NewBadge() {
  return (
    <span
      className="ml-1 rounded-[var(--r-sm)] px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em]"
      style={{
        background: "color-mix(in srgb, var(--amber) 16%, white)",
        color: "color-mix(in srgb, var(--amber), var(--ink) 35%)",
      }}
    >
      NEW
    </span>
  );
}

function RailLink({ item, active }: { item: SettingsItem; active: boolean }) {
  return (
    <Link
      href={item.href as any}
      className={cn(
        "flex h-11 items-center gap-3 rounded-[10px] px-3.5 text-[14px] transition-colors",
        active
          ? "bg-[color:var(--paper-deep)] font-medium text-[color:var(--ink)]"
          : "text-[color:var(--ink-soft)] hover:bg-black/[0.03]",
      )}
    >
      <span
        className={cn(
          "shrink-0 [&>svg]:h-[18px] [&>svg]:w-[18px]",
          active ? "text-[color:var(--ink)]" : "text-[color:var(--ink-muted)]",
        )}
      >
        {item.icon}
      </span>
      {item.label}
      {item.badge && <NewBadge />}
    </Link>
  );
}

export function SettingsRail() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="lg:sticky lg:top-24">
      {/* Mobile horizontal scroll */}
      <div className="lg:hidden -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-3">
        {[...ITEMS, ...FOOTER_ITEMS].map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href as any}
              className={cn(
                "hairline inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors",
                active
                  ? "border-transparent bg-[color:var(--ink)] text-[color:var(--paper)]"
                  : "text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
              )}
            >
              <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{item.icon}</span>
              {item.label}
              {item.badge && <NewBadge />}
            </Link>
          );
        })}
      </div>

      {/* Desktop vertical rail */}
      <div className="hidden w-[240px] lg:block">
        <nav className="flex flex-col gap-1 pt-5">
          {ITEMS.map((item) => (
            <RailLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </nav>
        <div className="my-4 border-t border-[color:var(--ink-line)]" />
        <nav className="flex flex-col gap-1">
          {FOOTER_ITEMS.map((item) => (
            <RailLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </nav>
      </div>
    </aside>
  );
}
