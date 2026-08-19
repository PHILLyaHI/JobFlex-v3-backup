// /dashboard/beige — A/B preview of the Overview sheet with the OLD beige
// card treatment (pre-2026-08-17 restyle). Renders the real dashboard page —
// same queries, same behavior, same shell from ../layout.tsx — wrapped in a
// scope class that beige-skin.css keys off. Not linked from the sidebar;
// visit the URL directly to compare against /dashboard. Delete this folder
// to retire the preview.

import type { Metadata } from "next";
import DashboardPage from "../page";
import "./beige-skin.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Overview (beige preview)",
  description: "The Overview sheet with the pre-restyle beige card treatment, for side-by-side comparison.",
};

export default function DashboardBeigePreview() {
  // display:contents keeps the wrapper out of layout — the donor's .content
  // children flow exactly as they do on /dashboard.
  return (
    <div className="beige-skin" style={{ display: "contents" }}>
      <DashboardPage />
    </div>
  );
}
