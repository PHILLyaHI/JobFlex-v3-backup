"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore, type ReactNode } from "react";
import s from "./traffic-redesign.module.css";

export type TrafficOverviewProps = { metrics: ReactNode; secondary: ReactNode; trend: ReactNode; sources: ReactNode };
const MobileOverview = dynamic(() => import("./traffic-overview-mobile"), { ssr: false });
function subscribe(listener: () => void) {
  const query = window.matchMedia("(max-width: 768px)");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
export function TrafficOverview(props: TrafficOverviewProps) {
  const mobile = useSyncExternalStore(subscribe, () => window.matchMedia("(max-width: 768px)").matches, () => false);
  if (mobile) return <MobileOverview {...props} />;
  return <div className={s.overview}>
    <div className={s.metrics}>{props.metrics}</div>
    <div className={s.trendGrid}><div className={s.trend}>{props.trend}{props.secondary}</div>{props.sources}</div>
  </div>;
}
