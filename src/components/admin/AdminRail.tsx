"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Tag,
  LifeBuoy,
  Megaphone,
  Activity,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface NavGroup {
  title: string;
  items: { href: string; label: string; icon: React.ReactNode }[];
}

const GROUPS: NavGroup[] = [
  {
    title: "Platform",
    items: [
      { href: "/admin", label: "Overview", icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
      { href: "/admin/health", label: "Health & telemetry", icon: <Activity className="h-3.5 w-3.5" /> },
      { href: "/admin/integrations", label: "Integrations", icon: <Plug className="h-3.5 w-3.5" /> },
      { href: "/admin/campaigns", label: "Email campaigns", icon: <Megaphone className="h-3.5 w-3.5" /> },
    ],
  },
  {
    title: "Manage",
    items: [
      { href: "/admin/users", label: "Users", icon: <Users className="h-3.5 w-3.5" /> },
      { href: "/admin/plans", label: "Pricing plans", icon: <CreditCard className="h-3.5 w-3.5" /> },
      { href: "/admin/specialties", label: "Specialties", icon: <Tag className="h-3.5 w-3.5" /> },
      { href: "/admin/support", label: "Support tickets", icon: <LifeBuoy className="h-3.5 w-3.5" /> },
    ],
  },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">
      <aside className="hidden lg:flex flex-col gap-5">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="quiet-caps mb-2 px-3">{g.title}</div>
            <nav className="flex flex-col gap-1">
              {g.items.map((item) => {
                const active =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href as any}
                    className={cn(
                      "relative flex items-center gap-2.5 h-9 px-3 rounded-[var(--r-sm)] text-[13px] transition-colors",
                      active
                        ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
                        : "text-[color:var(--ink-soft)] hover:bg-black/[0.04]",
                    )}
                  >
                    <span className={cn(active ? "opacity-100" : "opacity-70")}>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
