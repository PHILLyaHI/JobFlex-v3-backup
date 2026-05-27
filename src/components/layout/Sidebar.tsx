"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Users,
  Inbox,
  Calendar,
  Hammer,
  Sparkles,
  HardHat,
  MessagesSquare,
  Megaphone,
  Clock,
  BarChart3,
  Settings,
  Star,
  Gift,
  MessageSquare,
  Phone,
  Home,
  Fence,
  Folder,
  UserPlus,
  Wallet,
  Building2,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const groups: NavGroup[] = [
  {
    title: "Work",
    items: [
      { href: "/dashboard", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
      { href: "/dashboard/proposals", label: "Proposals", icon: <FileText className="h-4 w-4" /> },
      { href: "/dashboard/clients", label: "Clients", icon: <Users className="h-4 w-4" /> },
      { href: "/dashboard/leads", label: "Leads", icon: <Inbox className="h-4 w-4" /> },
      { href: "/dashboard/projects", label: "Projects", icon: <Folder className="h-4 w-4" /> },
      { href: "/dashboard/crm", label: "CRM", icon: <Workflow className="h-4 w-4" /> },
    ],
  },
  {
    title: "Delivery",
    items: [
      { href: "/dashboard/calendar", label: "Calendar", icon: <Calendar className="h-4 w-4" /> },
      { href: "/dashboard/jobs", label: "Jobs", icon: <Hammer className="h-4 w-4" /> },
      { href: "/dashboard/workers", label: "Workers", icon: <HardHat className="h-4 w-4" /> },
      { href: "/dashboard/hire", label: "Hire", icon: <UserPlus className="h-4 w-4" /> },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/dashboard/financials", label: "Financials", icon: <Wallet className="h-4 w-4" /> },
    ],
  },
  {
    title: "Automation",
    items: [
      { href: "/dashboard/advanced-ai", label: "AI Estimator", icon: <Sparkles className="h-4 w-4" /> },
      { href: "/dashboard/advanced-ai/roof", label: "Roof estimator", icon: <Home className="h-4 w-4" /> },
      { href: "/dashboard/advanced-ai/fence", label: "Fence estimator", icon: <Fence className="h-4 w-4" /> },
      { href: "/dashboard/phone", label: "Phone", icon: <Phone className="h-4 w-4" /> },
      { href: "/dashboard/messages", label: "Messages", icon: <MessagesSquare className="h-4 w-4" /> },
      { href: "/dashboard/announcements", label: "Announcements", icon: <Megaphone className="h-4 w-4" /> },
      { href: "/dashboard/reviews", label: "Reviews", icon: <Star className="h-4 w-4" /> },
      { href: "/dashboard/trade", label: "Trade board", icon: <MessageSquare className="h-4 w-4" /> },
      { href: "/dashboard/referrals", label: "Referrals", icon: <Gift className="h-4 w-4" /> },
      { href: "/dashboard/follow-ups", label: "Follow-ups", icon: <Clock className="h-4 w-4" /> },
      { href: "/dashboard/reports", label: "Reports", icon: <BarChart3 className="h-4 w-4" /> },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/dashboard/company", label: "Company", icon: <Building2 className="h-4 w-4" /> },
      { href: "/dashboard/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex flex-col w-[252px] shrink-0 h-dvh sticky top-0 border-r border-[color:var(--ink-line)] bg-[color:var(--paper)]/60 backdrop-blur">
      <Link
        href="/dashboard"
        className="flex items-center gap-2.5 px-6 h-16 border-b border-[color:var(--ink-line)]"
      >
        <div className="h-7 w-7 rounded-[6px] bg-[color:var(--ink)] text-[color:var(--paper)] grid place-items-center font-display text-sm leading-none">
          J
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-display text-[17px] tracking-[-0.015em]">JobFlex</span>
          <span className="text-[10px] text-[color:var(--ink-muted)] mt-0.5 tracking-[0.14em] uppercase">
            Contractor OS
          </span>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-5">
        {groups.map((g) => (
          <div key={g.title} className="space-y-1">
            <div className="quiet-caps px-3 mb-1.5">{g.title}</div>
            {g.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href as any}
                  className={cn(
                    "group relative flex items-center gap-2.5 px-3 h-9 rounded-[var(--r-sm)] text-[13px] transition-colors",
                    active
                      ? "bg-[color:var(--accent-soft)] text-[color:var(--accent)] font-medium"
                      : "text-[color:var(--ink-soft)] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
                  )}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r bg-[color:var(--accent)]"
                    />
                  )}
                  <span className={cn("opacity-80", active && "opacity-100")}>{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                  {active && (
                    <span className="ml-auto h-1 w-1 rounded-full bg-[color:var(--accent)]" />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-[color:var(--ink-line)]">
        <div className="paper-card p-3 text-[11px] leading-relaxed text-[color:var(--ink-muted)]">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="quiet-caps !mb-0">Live</span>
          </div>
          <p>Professional plan · 12 days left in cycle</p>
        </div>
      </div>
    </aside>
  );
}
