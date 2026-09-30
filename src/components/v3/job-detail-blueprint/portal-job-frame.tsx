"use client";

// PORTAL JOB FRAME — the worker portal's frame around the blueprint job page
// (stage C, 2026-09-30).
//
// On the dashboard the job page sits inside BlueprintShell: its root carries
// the blueprint classes and tokens, the sprite, the `.layout > .main >
// .content` structure the page module is scoped to, and the fluid scale. The
// portal has no session and no dashboard to navigate, so it cannot mount the
// shell (sidebar, search, estimator, support composer are all office chrome).
// This frame gives the SAME root, sprite and structure with a portal bar in
// the topbar's slot and no sidebar column, so the desk edition renders exactly
// as it does for an installer on the dashboard.
//
// At ≤768px the handheld edition is the page, as on the dashboard, where the
// shell renders this route bare: it is `position: fixed; inset: 0` and brings
// its own bar (MobileJobDetail → PortalBar when `record.chrome` is "portal").
// The same `(max-width: 768px)` literal as job-detail-viewport-switch.tsx.

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Route } from "next";
import Link from "next/link";
import proposalStyles from "@/components/v3/proposals-blueprint/proposals.module.css";
import dashboardStyles from "@/components/v3/dashboard-blueprint/blueprint.module.css";
import "@/components/v3/dashboard-blueprint/blueprint-global.css";
import jobsStyles from "@/components/v3/jobs-blueprint/jobs.module.css";
import { Sprite } from "@/components/v3/blueprint-shell/sprite";
import { OverlayLayer } from "@/components/v3/blueprint-shell/overlay-layer";
import { JobDetailViewportSwitch } from "@/components/v3/mobile-job-detail/job-detail-viewport-switch";
import type { JobDetailRecord } from "./job-detail-data";
import frame from "./portal-job-frame.module.css";

const HANDHELD = "(max-width: 768px)";
function subscribe(onStoreChange: () => void) {
  const mq = window.matchMedia(HANDHELD);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}
const getSnapshot = () => window.matchMedia(HANDHELD).matches;
const getServerSnapshot = () => false;

export function PortalJobFrame({ record }: { record: JobDetailRecord }) {
  const handheld = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const rootRef = useRef<HTMLDivElement>(null);

  // The shell's FLUID SCALE (blueprint-shell/shell-behavior.ts), the same
  // numbers: the desk edition is composed at 1728 and scales with the window.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const apply = () => {
      const raw = window.innerWidth <= 860 ? 1 : Math.min(1.35, Math.max(0.78, window.innerWidth / 1728));
      const z = Math.abs(raw - 1) < 0.02 ? 1 : raw;
      root.style.setProperty("zoom", String(z));
      root.style.setProperty("--app-h", window.innerHeight / z + "px");
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [handheld]);

  if (handheld) return <JobDetailViewportSwitch record={record} />;

  const portal = record.portal;
  return (
    <div
      ref={rootRef}
      className={[proposalStyles.bp, dashboardStyles.bp, jobsStyles.bp, "jf-blueprint", frame.frame].join(" ")}
      data-page="jobs"
    >
      <Sprite />
      <div className="layout">
        <div className="main">
          <header className="topbar" data-portal-bar>
            {portal && (
              <Link className="btn btn-ghost" href={portal.backHref as Route}>
                <svg className="ic" style={{ transform: "rotate(90deg)" }} aria-hidden="true">
                  <use href="#i-chev" />
                </svg>
                All jobs
              </Link>
            )}
            <div className={frame.who}>
              <b>{portal?.workerName ?? "Crew"}</b>
              <span>{portal?.orgName ? `${portal.orgName} · crew portal` : "Crew portal"}</span>
            </div>
          </header>
          <div className="content">
            <JobDetailViewportSwitch record={record} />
          </div>
        </div>
      </div>
      <OverlayLayer />
    </div>
  );
}
