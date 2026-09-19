"use client";

// FILING CHIP — "Filing to <project> · <client>" on an estimator page, with an
// × that drops it (2026-09-18). The estimator picker records where an estimate
// started (a project's or a client's "New proposal"); the estimators' convert
// actions file the proposal there. This chip is the part a contractor sees, so
// nothing is filed anywhere it was not visibly headed.
//
// Shown only on the estimator routes, and only while the filing cookie is set.
// Mounted once in each shell (desktop BlueprintShell, handheld MobileNav).
// Portalled to <body> and styled from the global tokens only, so the desktop
// shell's zoom and the handheld shell's missing module classes do not matter.

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { FILING_CHANGED_EVENT, clearFiling, readFiling, type Filing } from "@/lib/filingCookie";
import s from "./filing-chip.module.css";

/** The engines whose convert actions read the filing. The manual builder has its own project field. */
const ESTIMATOR_ROUTES = [
  "/dashboard/advanced-ai",
  "/dashboard/roof-estimator",
  "/dashboard/fence-estimator",
  "/dashboard/hvac-estimator",
  "/dashboard/video-estimator",
];

function subscribe(onChange: () => void) {
  window.addEventListener(FILING_CHANGED_EVENT, onChange);
  window.addEventListener("focus", onChange);
  return () => {
    window.removeEventListener(FILING_CHANGED_EVENT, onChange);
    window.removeEventListener("focus", onChange);
  };
}
// The cookie string itself is the snapshot: stable between reads, so the
// store only re-renders when the filing actually changes.
const getSnapshot = () => {
  const hit = document.cookie.split("; ").find((c) => c.startsWith("jf_file_to="));
  return hit ?? "";
};
const getServerSnapshot = () => "";

export function FilingChip() {
  const pathname = usePathname() ?? "";
  // The server snapshot is "", so the server and the hydrating client both draw
  // nothing; the real cookie is read on the client's next pass.
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!raw || typeof document === "undefined" || !ESTIMATOR_ROUTES.some((r) => pathname.startsWith(r))) return null;
  const f: Filing | null = readFiling();
  if (!f) return null;
  const where = f.projectName ?? f.clientName ?? "the chosen client";

  return createPortal(
    <div className={s.chip} role="status">
      <svg className={s.ic} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      </svg>
      <span className={s.txt}>
        <span className={s.lbl}>{f.projectName ? "Files to project" : "Files for"}</span>
        <b className={s.name}>{where}</b>
        {f.projectName && f.clientName ? <span className={s.sub}>{f.clientName}</span> : null}
      </span>
      <button type="button" className={s.x} onClick={clearFiling} aria-label={`Don't file this estimate under ${where}`} title="Don't file it there">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}
