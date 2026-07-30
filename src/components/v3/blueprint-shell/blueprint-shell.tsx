"use client";

// Blueprint shell — the persistent chrome for every blueprint page.
//
// Mounted from src/app/dashboard/layout.tsx, so the sidebar, topbar, sprite
// and graph-paper field survive navigation: moving between /dashboard and
// /dashboard/proposals swaps ONLY the contents of `.content`, which fades up
// via the donor's reveal cascade. Previously each page owned its own copy of
// the whole shell, so every navigation tore the chrome down and replayed the
// 21-item sidebar cascade — the "screen reload" flicker this replaces.
//
// CSS: both page modules are imported here and both `.bp` classes are applied
// to the root. Every donor rule inside them is `:global(...)`, so they match
// descendants no matter which component imported them — that is what lets one
// shell serve both pages without rewriting either stylesheet. The two tokens
// the donors disagree on are arbitrated in blueprint-global.css via
// `[data-page]`.

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { initBlueprintShell, type ShellHandle } from "./shell-behavior";
import { Sprite } from "./sprite";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import proposalStyles from "@/components/v3/proposals-blueprint/proposals.module.css";
import dashboardStyles from "@/components/v3/dashboard-blueprint/blueprint.module.css";
import "@/components/v3/dashboard-blueprint/blueprint-global.css";
import calendarStyles from "@/components/v3/calendar-blueprint/calendar.module.css";
import clientsStyles from "@/components/v3/clients-blueprint/clients.module.css";
import companyStyles from "@/components/v3/company-blueprint/company.module.css";
import crmStyles from "@/components/v3/crm-blueprint/crm.module.css";
import financialsStyles from "@/components/v3/financials-blueprint/financials.module.css";
import hireStyles from "@/components/v3/hire-blueprint/hire.module.css";
import jobsStyles from "@/components/v3/jobs-blueprint/jobs.module.css";
import leadsStyles from "@/components/v3/leads-blueprint/leads.module.css";
import projectsStyles from "@/components/v3/projects-blueprint/projects.module.css";
import workersStyles from "@/components/v3/workers-blueprint/workers.module.css";
import advancedAiStyles from "@/components/v3/advanced-ai-blueprint/advanced-ai.module.css";
import announcementsStyles from "@/components/v3/announcements-blueprint/announcements.module.css";
import fenceEstimatorStyles from "@/components/v3/fence-estimator-blueprint/fence-estimator.module.css";
import messagesStyles from "@/components/v3/messages-blueprint/messages.module.css";
import phoneStyles from "@/components/v3/phone-blueprint/phone.module.css";
import referralsStyles from "@/components/v3/referrals-blueprint/referrals.module.css";
import reportsStyles from "@/components/v3/reports-blueprint/reports.module.css";
import reviewsStyles from "@/components/v3/reviews-blueprint/reviews.module.css";
import roofEstimatorStyles from "@/components/v3/roof-estimator-blueprint/roof-estimator.module.css";
import tradeStyles from "@/components/v3/trade-blueprint/trade.module.css";

/**
 * Per-page stylesheets. Only the ACTIVE page's `.bp` class is applied, so the
 * donors' shared class names (.card, .kpi, …) can never collide across pages —
 * CSS-module hashing keeps each page's rules addressable only while it is the
 * one on screen. The dashboard + proposals modules stay always-on because they
 * also carry the shell chrome's own rules.
 */
const PAGE_STYLES: Record<string, string> = {
  "advanced-ai": advancedAiStyles.bp,
  announcements: announcementsStyles.bp,
  calendar: calendarStyles.bp,
  clients: clientsStyles.bp,
  company: companyStyles.bp,
  crm: crmStyles.bp,
  "fence-estimator": fenceEstimatorStyles.bp,
  financials: financialsStyles.bp,
  hire: hireStyles.bp,
  jobs: jobsStyles.bp,
  leads: leadsStyles.bp,
  messages: messagesStyles.bp,
  phone: phoneStyles.bp,
  projects: projectsStyles.bp,
  referrals: referralsStyles.bp,
  reports: reportsStyles.bp,
  reviews: reviewsStyles.bp,
  "roof-estimator": roofEstimatorStyles.bp,
  trade: tradeStyles.bp,
  workers: workersStyles.bp,
};

/**
 * Drives the `[data-page]` token arbitration in blueprint-global.css and the
 * PAGE_STYLES lookup above: the first path segment after `/dashboard`, or
 * "dashboard" for the index itself.
 */
function pageKey(pathname: string): string {
  const rest = pathname.replace(/^\/dashboard\/?/, "");
  if (!rest) return "dashboard";
  return rest.split("/")[0];
}

export function BlueprintShell({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<ShellHandle | null>(null);
  const pathname = usePathname() ?? "/dashboard";
  const key = pageKey(pathname);

  useEffect(() => {
    if (!rootRef.current) return;
    const handle = initBlueprintShell(rootRef.current);
    handleRef.current = handle;
    return () => {
      handle.destroy();
      handleRef.current = null;
    };
  }, []);

  // React re-renders which item carries `active`; the plate follows it.
  useEffect(() => {
    handleRef.current?.syncIndicator();
  }, [pathname]);

  return (
    <div
      ref={rootRef}
      className={[proposalStyles.bp, dashboardStyles.bp, PAGE_STYLES[key], "jf-blueprint"]
        .filter(Boolean)
        .join(" ")}
      data-page={key}
    >
      <Sprite />

      <div className="layout">
        <Sidebar />

        <div className="sb-overlay" id="sbOverlay"></div>

        <div className="main">
          <Topbar />
          <div className="content">{children}</div>
        </div>
      </div>
    </div>
  );
}
