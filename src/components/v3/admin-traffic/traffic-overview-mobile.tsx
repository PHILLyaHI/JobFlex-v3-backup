"use client";

import type { TrafficOverviewProps } from "./traffic-overview";
import s from "./traffic-redesign.module.css";

export default function TrafficOverviewMobile(props: TrafficOverviewProps) {
  return <div className={s.mobileOverview}>
    <div className={s.mobileMetrics}>{props.metrics}</div>
    <div className={s.trend}>{props.trend}</div>
    {props.secondary}
    {props.sources}
  </div>;
}
