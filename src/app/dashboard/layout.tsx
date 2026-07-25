// Blueprint layout — wraps the promoted blueprint pages (/dashboard and
// /dashboard/proposals) in the shared donor shell, so the sidebar and topbar
// mount once and persist across navigation between them.
//
// Scope: this layout only covers routes under src/app/dashboard/. The
// classic-shell children (/dashboard/proposals/new, /create, /[id], /ai,
// /templates and the rest) live under the (dashboard) route group, a separate
// branch of the tree, and keep their own layout untouched.

import { BlueprintShell } from "@/components/v3/blueprint-shell/blueprint-shell";

export default function DashboardBlueprintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <BlueprintShell>{children}</BlueprintShell>;
}
