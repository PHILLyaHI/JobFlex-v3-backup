"use client";

import { conversionInterval, percent, type ExperimentResult } from "@/lib/traffic-contract";
import s from "./experiment-results-mobile.module.css";

const rate = (value: number | null) => value == null ? "--" : `${value.toFixed(1)}%`;

export default function MobileExperimentResults({ variants, baseline, label }: {
  variants: ExperimentResult[];
  baseline?: ExperimentResult;
  label: (variant: string) => string;
}) {
  return <div className={s.results}>{variants.map(v => {
    const conversion = percent(v.completed, v.visitors);
    const base = baseline ? percent(baseline.completed, baseline.visitors) : null;
    const interval = conversionInterval(v.completed, v.visitors);
    return <article className={s.variant} key={v.variant}>
      <header><h3>{label(v.variant)}</h3>{v === baseline && <span>Baseline</span>}</header>
      <dl>
        <div><dt>Verified signups</dt><dd>{v.completed.toLocaleString("en-US")}</dd></div>
        <div><dt>Signup rate</dt><dd>{rate(conversion)}</dd></div>
        <div><dt>Exposed visitors</dt><dd>{v.visitors.toLocaleString("en-US")}</dd></div>
        <div><dt>Attempts</dt><dd>{v.attempts.toLocaleString("en-US")}</dd></div>
        <div><dt>Attempt rate</dt><dd>{rate(percent(v.attempts, v.visitors))}</dd></div>
        <div><dt>Lift</dt><dd>{v !== baseline && base && conversion != null ? rate((conversion / base - 1) * 100) : "--"}</dd></div>
      </dl>
      <p>95% interval: {interval ? `${rate(interval[0])} to ${rate(interval[1])}` : "--"}</p>
    </article>;
  })}</div>;
}
