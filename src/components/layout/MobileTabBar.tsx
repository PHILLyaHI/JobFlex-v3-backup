"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  FileText,
  Hammer,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Plus,
  Settings,
  Sparkles,
  Users,
  Inbox,
  BarChart3,
  HardHat,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/cn";
import { MobileDrawer } from "@/components/ui/MobileDrawer";

type TabKey = "dashboard" | "proposals" | "schedule" | "jobs" | "more";

interface Tab {
  key: TabKey;
  label: string;
  href: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
  { key: "proposals", label: "Proposals", href: "/dashboard/proposals", icon: <FileText className="h-5 w-5" /> },
  { key: "schedule", label: "Schedule", href: "/dashboard/calendar", icon: <Calendar className="h-5 w-5" /> },
  { key: "jobs", label: "Jobs", href: "/dashboard/jobs", icon: <Hammer className="h-5 w-5" /> },
  { key: "more", label: "More", href: "#more", icon: <MoreHorizontal className="h-5 w-5" /> },
];

interface MoreNavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const MORE_NAV: MoreNavItem[] = [
  { label: "Clients", href: "/dashboard/clients", icon: <Users className="h-4 w-4" /> },
  { label: "Leads", href: "/dashboard/leads", icon: <Inbox className="h-4 w-4" /> },
  { label: "Workers", href: "/dashboard/workers", icon: <HardHat className="h-4 w-4" /> },
  { label: "Reports", href: "/dashboard/reports", icon: <BarChart3 className="h-4 w-4" /> },
  { label: "Settings", href: "/dashboard/settings", icon: <Settings className="h-4 w-4" /> },
];

function getActiveKey(pathname: string): TabKey {
  if (pathname === "/dashboard") return "dashboard";
  if (pathname.startsWith("/dashboard/proposals")) return "proposals";
  if (pathname.startsWith("/dashboard/calendar")) return "schedule";
  if (pathname.startsWith("/dashboard/jobs")) return "jobs";
  return "more";
}

interface FabConfig {
  href: string;
  icon: React.ReactNode;
  label: string;
}

function fabFor(active: TabKey): FabConfig | null {
  if (active === "more") return null;
  if (active === "dashboard" || active === "proposals") {
    return { href: "/dashboard/proposals/ai", icon: <Sparkles className="h-5 w-5" />, label: "Draft proposal" };
  }
  return { href: "/dashboard/jobs/new", icon: <Plus className="h-5 w-5" />, label: "New job" };
}

export function MobileTabBar() {
  const pathname = usePathname();
  const active = getActiveKey(pathname ?? "");
  const fab = fabFor(active);
  const [moreOpen, setMoreOpen] = React.useState(false);

  return (
    <>
      {fab && (
        <Link
          href={fab.href as never}
          aria-label={fab.label}
          className={cn(
            "fixed right-4 z-40 grid place-items-center",
            "h-14 w-14 rounded-full",
            "bg-[color:var(--ink)] text-[color:var(--paper)]",
            "shadow-[0_8px_24px_-8px_rgba(17,17,19,0.35)]",
            "active:translate-y-[1px] transition-transform",
            "focus-ring",
          )}
          style={{ bottom: "calc(56px + env(safe-area-inset-bottom, 0px) + 12px)" }}
        >
          {fab.icon}
        </Link>
      )}

      <nav
        aria-label="Primary"
        className={cn(
          "fixed inset-x-0 bottom-0 z-30",
          "border-t border-[color:var(--ink-line)]",
          "bg-[color:var(--paper)]/95 backdrop-blur-md",
          "pb-safe",
        )}
      >
        <ul className="flex items-stretch h-14">
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            const isMoreTab = tab.key === "more";
            const itemClass = cn(
              "relative flex-1 flex flex-col items-center justify-center gap-1",
              "min-h-[44px] select-none",
              isActive ? "text-[color:var(--ink)]" : "text-[color:var(--ink-muted)]",
              "transition-colors",
            );
            const indicator = isActive ? (
              <span
                aria-hidden="true"
                className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-6 rounded-full bg-[color:var(--accent)]"
              />
            ) : null;
            const body = (
              <>
                {indicator}
                <span className={cn("opacity-90", isActive && "opacity-100")}>{tab.icon}</span>
                <span className="text-[10px] font-medium tracking-[0.01em] leading-none">{tab.label}</span>
              </>
            );

            if (isMoreTab) {
              return (
                <li key={tab.key} className="flex-1">
                  <button
                    type="button"
                    onClick={() => setMoreOpen(true)}
                    className={cn(itemClass, "w-full")}
                    aria-expanded={moreOpen}
                  >
                    {body}
                  </button>
                </li>
              );
            }

            return (
              <li key={tab.key} className="flex-1">
                <Link href={tab.href as never} className={itemClass}>
                  {body}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <MobileDrawer
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        side="right"
        title="More"
      >
        <nav className="space-y-1">
          {MORE_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href as never}
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--r-sm)] text-[13px] text-[color:var(--ink-soft)] hover:bg-black/[0.04] focus-ring"
            >
              <span className="text-[color:var(--ink-muted)]">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
          <div className="pt-3 mt-3 border-t border-[color:var(--ink-line)]">
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                signOut({ callbackUrl: "/" });
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--r-sm)] text-[13px] text-[color:var(--rose)] hover:bg-rose-50 focus-ring text-left"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </button>
          </div>
        </nav>
      </MobileDrawer>
    </>
  );
}
