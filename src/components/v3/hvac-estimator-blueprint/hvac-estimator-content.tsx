"use client";

// HVAC estimator — page CONTENT (the `.content` children; the shell owns the
// chrome). No donor exists for this page; the vocabulary is the roof and
// fence estimators', restated in ./hvac-estimator.module.css under the
// newer hashed-class convention, so nothing is registered in blueprint-shell.

import { HvacEstimatorForm } from "./hvac-estimator-form";
import s from "./hvac-estimator.module.css";

export function HvacEstimatorContent({ aiEnabled }: { aiEnabled: boolean }) {
  return (
    <>
      <div className={s["page-head"]}>
        <div>
          <div className={s.kicker}>Automation · Replacement</div>
          <h1 className={s["page-title"]}>HVAC estimator</h1>
          <p className={s["page-sub"]}>Walk the house on video, photograph the plates, confirm what you saw — the load, the unit and the price follow, with every assumption in the open.</p>
        </div>
      </div>
      <HvacEstimatorForm aiEnabled={aiEnabled} />
    </>
  );
}
