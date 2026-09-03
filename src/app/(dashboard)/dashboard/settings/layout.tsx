// KNOWN LIMITATION (owner call, 2026-09-03 — docs/KNOWN-LIMITATIONS.md):
// the eight child routes still under this classic layout (team, email,
// proposals, leads, theme, ai, preferences, company) are functionally fine but
// log a console hydration mismatch that comes from the classic shell itself,
// not from the pages — only a port of the branch to the blueprint shell fixes
// it. They are ported as needed, not proactively. The other six former
// children (account/billing/payment/integrations/gmail/meta) already redirect
// to the blueprint hub's panes.
import { SettingsRail } from "@/components/settings/SettingsRail";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8 lg:gap-12 items-start">
      <SettingsRail />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
