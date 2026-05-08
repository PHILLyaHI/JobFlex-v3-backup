"use client";
import * as React from "react";
import {
  Bell,
  Calendar,
  ChevronRight,
  FileText,
  Folder,
  Hammer,
  Inbox,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { MobileDrawer } from "@/components/ui/MobileDrawer";
import { useIsMobile } from "@/lib/hooks/useIsMobile";

interface NavItem {
  label: string;
  icon: React.ReactNode;
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Work",
    items: [
      { label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
      { label: "Proposals", icon: <FileText className="h-4 w-4" /> },
      { label: "Clients", icon: <Users className="h-4 w-4" /> },
      { label: "Leads", icon: <Inbox className="h-4 w-4" /> },
    ],
  },
  {
    title: "Delivery",
    items: [
      { label: "Calendar", icon: <Calendar className="h-4 w-4" /> },
      { label: "Jobs", icon: <Hammer className="h-4 w-4" /> },
      { label: "Projects", icon: <Folder className="h-4 w-4" /> },
    ],
  },
];

export function SandboxClient() {
  const isMobile = useIsMobile();
  const [width, setWidth] = React.useState<number | null>(null);
  const [openSheet, setOpenSheet] = React.useState(false);
  const [openLeft, setOpenLeft] = React.useState(false);
  const [openRight, setOpenRight] = React.useState(false);

  React.useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <main className="min-h-dvh bg-[color:var(--paper)] px-5 py-6 pt-safe">
      <header className="mb-6">
        <div className="quiet-caps">Phase 0 · Sandbox</div>
        <h1 className="font-display text-[26px] tracking-[-0.02em]">Mobile primitives</h1>
        <p className="mt-1 text-[12px] text-[color:var(--ink-muted)] max-w-[42ch]">
          Dev-only inspection route for <code className="text-[color:var(--ink-soft)]">BottomSheet</code> and{" "}
          <code className="text-[color:var(--ink-soft)]">MobileDrawer</code>. Returns 404 outside development.
        </p>
      </header>

      <section className="paper-card p-4 mb-5">
        <div className="quiet-caps !mb-2">Live readout</div>
        <dl className="text-[13px] space-y-1.5">
          <div className="flex justify-between items-baseline">
            <dt className="text-[color:var(--ink-muted)]">useIsMobile()</dt>
            <dd className="tabular font-medium">{String(isMobile)}</dd>
          </div>
          <div className="flex justify-between items-baseline">
            <dt className="text-[color:var(--ink-muted)]">window.innerWidth</dt>
            <dd className="tabular font-medium">{width === null ? "—" : `${width}px`}</dd>
          </div>
          <div className="flex justify-between items-baseline">
            <dt className="text-[color:var(--ink-muted)]">breakpoint</dt>
            <dd className="tabular font-medium">
              {width === null ? "—" : width <= 767 ? "mobile" : width <= 1023 ? "tablet" : "desktop"}
            </dd>
          </div>
        </dl>
      </section>

      <div className="quiet-caps !mb-2">Triggers</div>
      <div className="flex flex-col gap-2.5">
        <SandboxTrigger
          title="BottomSheet"
          subtitle="Form sheet · drag-to-dismiss"
          onClick={() => setOpenSheet(true)}
        />
        <SandboxTrigger
          title="MobileDrawer (left)"
          subtitle="Nav surface · slide from left"
          onClick={() => setOpenLeft(true)}
        />
        <SandboxTrigger
          title="MobileDrawer (right)"
          subtitle="Account panel · slide from right"
          onClick={() => setOpenRight(true)}
        />
      </div>

      <p className="mt-6 text-[11px] text-[color:var(--ink-faint)]">
        Try: backdrop click · Escape · drag the bottom sheet down past 30% · Tab inside · resize across 768px.
      </p>

      <BottomSheet
        open={openSheet}
        onClose={() => setOpenSheet(false)}
        title="New proposal"
      >
        <NewProposalForm onSubmit={() => setOpenSheet(false)} onCancel={() => setOpenSheet(false)} />
      </BottomSheet>

      <MobileDrawer
        open={openLeft}
        onClose={() => setOpenLeft(false)}
        side="left"
        title="Menu"
      >
        <NavSurface />
      </MobileDrawer>

      <MobileDrawer
        open={openRight}
        onClose={() => setOpenRight(false)}
        side="right"
        title="Account"
      >
        <AccountPanel />
      </MobileDrawer>
    </main>
  );
}

function SandboxTrigger({
  title,
  subtitle,
  onClick,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="paper-card group flex items-center gap-3 px-4 py-3 text-left hover:bg-black/[0.02] focus-ring transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-[color:var(--ink)]">{title}</div>
        <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">{subtitle}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-[color:var(--ink-faint)] group-hover:text-[color:var(--ink-muted)] transition-colors" />
    </button>
  );
}

function NewProposalForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor="sb-title" className="quiet-caps !mb-1.5 block">
          Title
        </label>
        <input
          id="sb-title"
          type="text"
          defaultValue="Kitchen renovation — 213 Oak St"
          className="w-full px-3 py-2.5 rounded-[var(--r-md)] bg-white border border-[color:var(--ink-line)] focus-ring text-[14px]"
        />
      </div>

      <div>
        <label htmlFor="sb-client" className="quiet-caps !mb-1.5 block">
          Client
        </label>
        <input
          id="sb-client"
          type="text"
          defaultValue="Margaret Chen"
          className="w-full px-3 py-2.5 rounded-[var(--r-md)] bg-white border border-[color:var(--ink-line)] focus-ring text-[14px]"
        />
      </div>

      <div>
        <div className="quiet-caps !mb-1.5">Tags</div>
        <div className="flex flex-wrap gap-1.5">
          {["Renovation", "Kitchen", "Tier-2", "Q3", "Repeat client"].map((t) => (
            <span
              key={t}
              className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]"
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="sb-scope" className="quiet-caps !mb-1.5 block">
          Scope
        </label>
        <textarea
          id="sb-scope"
          rows={4}
          defaultValue="Demo cabinets, full electrical refresh, tile backsplash, undercabinet lighting, soft-close hinges throughout."
          className="w-full px-3 py-2.5 rounded-[var(--r-md)] bg-white border border-[color:var(--ink-line)] focus-ring text-[13px] leading-relaxed resize-none"
        />
      </div>

      <div>
        <label htmlFor="sb-amount" className="quiet-caps !mb-1.5 block">
          Total
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ink-faint)] text-[14px]">$</span>
          <input
            id="sb-amount"
            type="text"
            defaultValue="48,200"
            className="w-full pl-7 pr-3 py-2.5 rounded-[var(--r-md)] bg-white border border-[color:var(--ink-line)] focus-ring text-[14px] tabular"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 rounded-[var(--r-md)] text-[13px] font-medium text-[color:var(--ink-muted)] hover:bg-black/[0.04] focus-ring"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 px-4 py-2.5 rounded-[var(--r-md)] text-[13px] font-medium bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ink-soft)] focus-ring"
        >
          Save draft
        </button>
      </div>
    </form>
  );
}

function NavSurface() {
  return (
    <nav className="space-y-5">
      <div className="paper-card p-3 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-[color:var(--accent-soft)] grid place-items-center font-display text-[14px] text-[color:var(--accent-ink)]">
          PD
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-medium truncate">Phillip Derman</div>
          <div className="text-[11px] text-[color:var(--ink-muted)] truncate">Acme Renovations</div>
        </div>
      </div>

      {NAV_GROUPS.map((g) => (
        <div key={g.title}>
          <div className="quiet-caps !mb-2">{g.title}</div>
          <ul className="space-y-0.5">
            {g.items.map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--r-sm)] text-[13px] text-[color:var(--ink-soft)] hover:bg-black/[0.04] focus-ring text-left"
                >
                  <span className="text-[color:var(--ink-muted)]">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="pt-3 border-t border-[color:var(--ink-line)]">
        <button
          type="button"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--r-sm)] text-[13px] text-[color:var(--ink-muted)] hover:bg-black/[0.04] focus-ring text-left"
        >
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </button>
      </div>
    </nav>
  );
}

function AccountPanel() {
  return (
    <div className="space-y-4">
      <div className="paper-card p-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-[color:var(--accent-soft)] grid place-items-center font-display text-[16px] text-[color:var(--accent-ink)]">
            PD
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium truncate">Phillip Derman</div>
            <div className="text-[11px] text-[color:var(--ink-muted)] truncate">phillip@example.com</div>
          </div>
          <span className="text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]">
            Pro
          </span>
        </div>
      </div>

      <div className="paper-card divide-y divide-[color:var(--ink-line)]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="text-[13px] text-[color:var(--ink-soft)]">Plan</div>
          <div className="text-[12px] text-[color:var(--ink-muted)] tabular">Pro · $48 / mo</div>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="text-[13px] text-[color:var(--ink-soft)]">Proposals this month</div>
          <div className="text-[12px] text-[color:var(--ink-muted)] tabular">23 / 100</div>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="text-[13px] text-[color:var(--ink-soft)]">Org seats</div>
          <div className="text-[12px] text-[color:var(--ink-muted)] tabular">3 / 5</div>
        </div>
      </div>

      <button
        type="button"
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--r-sm)] text-[13px] text-[color:var(--ink-soft)] hover:bg-black/[0.04] focus-ring text-left"
      >
        <Bell className="h-4 w-4 text-[color:var(--ink-muted)]" />
        <span>Notifications</span>
        <span className="ml-auto text-[11px] text-[color:var(--ink-muted)]">On</span>
      </button>

      <button
        type="button"
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--r-sm)] text-[13px] text-[color:var(--ink-soft)] hover:bg-black/[0.04] focus-ring text-left"
      >
        <Settings className="h-4 w-4 text-[color:var(--ink-muted)]" />
        <span>Settings</span>
      </button>

      <div className="pt-3 border-t border-[color:var(--ink-line)]">
        <button
          type="button"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--r-sm)] text-[13px] text-[color:var(--rose)] hover:bg-rose-50 focus-ring text-left"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}
