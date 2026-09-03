"use client";
import * as React from "react";
import Link from "next/link";
import { logOutEverywhere } from "@/components/v3/blueprint-shell/sign-out";
import { Search, Bell, Plus, Command, User, Settings, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useUiStore } from "@/stores/useUiStore";
import { OrgSwitcher, type OrgMembershipItem } from "@/components/layout/OrgSwitcher";
import { recentNotifications, type NotificationItem } from "@/actions/notifications";
import { relative } from "@/lib/format";
import { cn } from "@/lib/cn";

interface TopbarProps {
  user?: { name?: string | null; email: string };
  memberships?: OrgMembershipItem[];
  plan?: string | null;
  // Field workers get a stripped header: no global search, no create, no bell —
  // those surface org-wide data/actions they aren't entitled to.
  isWorker?: boolean;
  // Sales reps / estimators: global search + notifications stay hidden (both are
  // org-wide manager surfaces), but they keep New Proposal and the org switcher.
  limited?: boolean;
}

/** Close `ref`'s element on outside click or Escape, while `open`. */
function useDismiss(open: boolean, onClose: () => void) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  return ref;
}

export function Topbar({ user, memberships = [], isWorker = false, limited = false }: TopbarProps) {
  const setCommandOpen = useUiStore((s) => s.setCommandOpen);
  const stripped = isWorker || limited;
  // This bar starts at 768px (`hidden md:flex`), and between there and about
  // 1024 it is a touch surface as often as a pointer one. Two rules follow, and
  // both are written as `lg:` overrides of a touch-first base rather than as a
  // patch on the desktop one: every control is 44px until the bar has the room
  // to relax to its desk sizes, and the search field spends its 360px only when
  // there is 360px to spend. Without the second, the right-hand group was one
  // control over budget at 800px and the browser took the difference out of the
  // last flex item it could shrink — the Help button measured 33.8×36. The
  // `shrink-0`s are what stop that happening again: a control that does not fit
  // must make the bar overflow visibly, not silently deform.
  return (
    <header className="sticky top-0 z-30 hidden md:flex items-center gap-3 h-16 px-6 border-b border-[color:var(--ink-line)] bg-white shadow-[0_1px_2px_rgba(20,24,31,0.04)]">
      {stripped ? (
        <div className="font-display text-[15px] tracking-[-0.01em]">My work</div>
      ) : (
        <button
          onClick={() => setCommandOpen(true)}
          aria-label="Search"
          className="shrink-0 flex items-center justify-center gap-2 h-11 w-11 lg:h-9 lg:w-[360px] lg:max-w-[40vw] lg:justify-start lg:px-3 rounded-[var(--r-md)] bg-[color:var(--paper-deep)] border border-[color:var(--ink-line)] text-[12px] text-[color:var(--ink-muted)] transition-all hover:border-[color:var(--ink-faint)] focus-visible:shadow-[0_0_0_3px_rgba(31,122,82,0.18)]"
        >
          <Search className="h-4 w-4 lg:h-3.5 lg:w-3.5 shrink-0" />
          <span className="hidden lg:inline">Search clients, proposals, leads…</span>
          <span className="ml-auto hidden lg:flex items-center gap-0.5 text-[10px] text-[color:var(--ink-faint)]">
            <Command className="h-3 w-3" />
            <span>K</span>
          </span>
        </button>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-2 shrink-0">
        {!isWorker && memberships.length > 0 && <OrgSwitcher memberships={memberships} />}
        {!stripped && (
          <>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Link href={"/dashboard/proposals/create" as any}>
              <Button
                size="sm"
                variant="primary"
                className="h-11 px-4 lg:h-8 lg:px-3"
                icon={<Plus className="h-3.5 w-3.5" />}
              >
                New Proposal
              </Button>
            </Link>
            <NotificationsBell />
          </>
        )}
        {limited && !isWorker && (
          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
          <Link href={"/dashboard/proposals/create" as any}>
            <Button
              size="sm"
              variant="primary"
              className="h-11 px-4 lg:h-8 lg:px-3"
              icon={<Plus className="h-3.5 w-3.5" />}
            >
              New Proposal
            </Button>
          </Link>
        )}
        {/* Help — the launcher for the support composer this group's layout
            mounts, and now the ONLY one, at every width this bar is on screen.
            The widget's floating plate is retired: parked in the bottom-right
            corner it lost that corner to the page, most recently to
            FloatingCostsCard, which is permanent furniture on
            /dashboard/proposals/new and /[id]. Below 768 this bar is
            display:none and the tab bar's More drawer carries the same control
            as a row — so there is still exactly one at every width.
            It is sized by the base 44px touch classes here and relaxes to the
            bar's desk size at lg, like the bell and the avatar beside it; the
            widget's own stylesheet keeps a 44px hit floor under it either way. */}
        <AccountMenu user={user} />
      </div>
    </header>
  );
}

function NotificationsBell() {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<NotificationItem[] | null>(null);
  const ref = useDismiss(open, () => setOpen(false));

  // Load once on mount so the unread dot reflects real activity.
  React.useEffect(() => {
    let alive = true;
    recentNotifications()
      .then((n) => alive && setItems(n))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, []);

  const hasItems = (items?.length ?? 0) > 0;

  return (
    <div className="relative" ref={ref}>
      <button
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative shrink-0 h-11 w-11 lg:h-9 lg:w-9 grid place-items-center rounded-[var(--r-md)] hover:bg-black/[0.04] text-[color:var(--ink-soft)]"
      >
        <Bell className="h-4 w-4" />
        {hasItems && (
          <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-80 paper-card shadow-pop overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 h-11 border-b border-[color:var(--ink-line)]">
            <span className="quiet-caps !mb-0">Activity</span>
            <Link
              href={"/dashboard/crm" as never}
              onClick={() => setOpen(false)}
              className="text-[11px] text-[color:var(--accent)] hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="max-h-[320px] overflow-y-auto py-1.5">
            {items === null && (
              <div className="px-4 py-6 text-center text-xs text-[color:var(--ink-muted)]">
                Loading…
              </div>
            )}
            {items !== null && items.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-[color:var(--ink-muted)]">
                Nothing recent.
              </div>
            )}
            {items?.map((n) => {
              const body = (
                <>
                  <span className="block text-[12.5px] text-[color:var(--ink-soft)] leading-snug">
                    {n.summary}
                  </span>
                  <span className="block text-[10.5px] text-[color:var(--ink-muted)] tabular mt-0.5">
                    {relative(n.createdAt)}
                  </span>
                </>
              );
              return n.href ? (
                <Link
                  key={n.id}
                  href={n.href as never}
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2.5 hover:bg-black/[0.025] transition-colors"
                >
                  {body}
                </Link>
              ) : (
                <div key={n.id} className="px-4 py-2.5">
                  {body}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AccountMenu({ user }: { user?: { name?: string | null; email: string } }) {
  const [open, setOpen] = React.useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const display = user?.name ?? user?.email ?? "Guest";

  return (
    <div className="relative ml-1" ref={ref}>
      <button
        aria-label="Account menu"
        aria-expanded={open}
        title={display}
        onClick={() => setOpen((v) => !v)}
        className="shrink-0 grid place-items-center h-11 w-11 lg:h-8 lg:w-8 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40"
      >
        <Avatar name={display} size={32} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-60 paper-card shadow-pop overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-[color:var(--ink-line)]">
            <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
              {user?.name ?? "Your account"}
            </div>
            {user?.email && (
              <div className="text-[11px] text-[color:var(--ink-muted)] truncate mt-0.5">
                {user.email}
              </div>
            )}
          </div>
          <div className="py-1.5">
            <MenuLink href="/dashboard/settings/account" icon={<User className="h-3.5 w-3.5" />} onNavigate={() => setOpen(false)}>
              Profile
            </MenuLink>
            <MenuLink href="/dashboard/settings" icon={<Settings className="h-3.5 w-3.5" />} onNavigate={() => setOpen(false)}>
              Settings
            </MenuLink>
          </div>
          <div className="py-1.5 border-t border-[color:var(--ink-line)]">
            <button
              onClick={() => {
                setOpen(false);
                void logOutEverywhere("/");
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-[color:var(--rose)] hover:bg-rose-50 transition-colors text-left"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  onNavigate,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href as never}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 px-4 py-2 text-[13px] text-[color:var(--ink-soft)]",
        "hover:bg-black/[0.025] transition-colors",
      )}
    >
      <span className="text-[color:var(--ink-muted)]">{icon}</span>
      {children}
    </Link>
  );
}
