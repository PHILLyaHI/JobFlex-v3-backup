"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
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
  CreditCard,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  // Override the active-highlight prefix when the nav target is a sub-page but
  // the item should stay lit across the whole section (e.g. Hire → /hire/hub).
  match?: string;
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
      { href: "/dashboard/hire/hub", label: "Hire", icon: <UserPlus className="h-4 w-4" />, match: "/dashboard/hire" },
      { href: "/dashboard/company", label: "Company", icon: <Building2 className="h-4 w-4" />, match: "/dashboard/company" },
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
      { href: "/dashboard/advanced-ai", label: "Smart Proposal", icon: <Sparkles className="h-4 w-4" /> },
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
      { href: "/dashboard/subscription", label: "Subscription", icon: <CreditCard className="h-4 w-4" /> },
      { href: "/dashboard/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
    ],
  },
];

// Field workers (INSTALLER) get a read-only slice of the dashboard: their jobs
// and their schedule. This matches the middleware allow-list so the nav never
// shows a link the route-gate would bounce.
const WORKER_GROUPS: NavGroup[] = [
  {
    title: "Your work",
    items: [
      { href: "/dashboard/jobs", label: "Jobs", icon: <Hammer className="h-4 w-4" /> },
      { href: "/dashboard/calendar", label: "Schedule", icon: <Calendar className="h-4 w-4" /> },
      { href: "/dashboard/messages", label: "Messages", icon: <MessagesSquare className="h-4 w-4" /> },
    ],
  },
];

export function Sidebar({ role }: { role?: string | null }) {
  const pathname = usePathname();
  const isWorker = role === "INSTALLER";
  const navGroups = isWorker ? WORKER_GROUPS : groups;

  // Single source of truth for the active item: the nav target that is the
  // LONGEST prefix of the current path wins. Without this, the index route
  // ("/dashboard") and section parents ("/dashboard/advanced-ai") stay lit
  // alongside the deeper page actually being viewed — two active links.
  const activeBase = React.useMemo(() => {
    let best = "";
    for (const g of navGroups) {
      for (const item of g.items) {
        const base = item.match ?? item.href;
        const matches = pathname === base || pathname.startsWith(base + "/");
        if (matches && base.length > best.length) best = base;
      }
    }
    return best;
  }, [pathname, navGroups]);

  return (
    <aside className="hidden lg:flex flex-col w-[252px] shrink-0 h-dvh sticky top-0 border-r border-[color:var(--ink-line)] bg-white shadow-[1px_0_2px_rgba(20,24,31,0.03)]">
      <Link
        href="/dashboard"
        className="flex items-center gap-1.5 px-6 h-16 border-b border-[color:var(--ink-line)]"
      >
        <Image
          src="/jobflex-mark.png"
          alt="JobFlex"
          width={52}
          height={52}
          priority
          className="h-[52px] w-[52px] -ml-1.5 object-contain"
        />
        <div className="flex flex-col leading-none">
          <span className="font-display text-[20px] tracking-[-0.015em]">JobFlex</span>
          <span className="text-[10px] text-[color:var(--ink-muted)] mt-0.5 tracking-[0.14em] uppercase">
            Contractor OS
          </span>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 pb-5 pt-4 space-y-5">
        {navGroups.map((g) => (
          <div key={g.title} className="space-y-1">
            <div className="quiet-caps px-3 mb-1.5">{g.title}</div>
            {g.items.map((item) => {
              const active = (item.match ?? item.href) === activeBase;
              return (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                <Link key={item.href} href={item.href as any}
                  className={cn(
                    "group flex items-center gap-2.5 px-3 h-9 rounded-[var(--r-md)] text-[13px] transition-colors duration-150 ease-[var(--ease)]",
                    active
                      ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)] font-semibold shadow-[inset_0_0_0_1px_rgba(31,122,82,0.14)]"
                      : "text-[color:var(--ink)] hover:bg-[color:var(--paper-deep)] hover:text-[color:var(--accent-ink)]",
                  )}
                >
                  <span
                    className={cn(
                      "transition-opacity duration-150 ease-[var(--ease)]",
                      active ? "opacity-100" : "opacity-60 group-hover:opacity-100",
                    )}
                  >
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {!isWorker && (
        <div className="p-3 border-t border-[color:var(--ink-line)]">
          <Link
            href="/dashboard/subscription"
            className="block rounded-[var(--r-md)] border border-[color:var(--ink-line)] bg-[color:var(--paper-deep)] p-3 text-[11px] leading-relaxed text-[color:var(--ink-muted)] transition-colors hover:border-[color:var(--ink-faint)]"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="quiet-caps !mb-0">Live</span>
            </div>
            <p>Professional plan · 12 days left in cycle</p>
          </Link>
        </div>
      )}
    </aside>
  );
}
