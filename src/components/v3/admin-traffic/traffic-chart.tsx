"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { TrafficPoint } from "@/lib/traffic-contract";
import s from "./traffic.module.css";

const n = (value: number) => value.toLocaleString("en-US");
export function TrafficChart({ points }: { points: TrafficPoint[] }) {
  const [metric, setMetric] = useState<"visitors" | "pageviews">("visitors");
  const [active, setActive] = useState<number | null>(null);
  const [width, setWidth] = useState(960);
  const svg = useRef<SVGSVGElement>(null);
  const markers = useRef<(SVGGElement | null)[]>([]);
  const hasPoints = points.length > 0;
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const measured = entries[0]?.contentRect.width;
      if (measured) setWidth(Math.max(280, Math.round(measured)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasPoints]);
  const id = useId().replace(/:/g, "");
  const peak = Math.max(1, ...points.map(p => p[metric]));
  const ceiling = Math.max(4, Math.ceil(peak / 4) * 4);
  const x = (i: number) => 52 + i / Math.max(1, points.length - 1) * (width - 72);
  const y = (v: number) => 225 - v / ceiling * 200;
  const line = (key: "visitors" | "newVisitors" | "returningVisitors" | "pageviews") => points.map((p, i) => `${x(i)},${y(p[key])}`).join(" ");
  const selected = points[Math.min(active ?? points.length - 1, points.length - 1)];
  return <>
    <div className={s.chartToolbar}>
      <div className={s.legend}><span><i />{metric === "visitors" ? "All visitors" : "Pageviews"}</span>{metric === "visitors" && <><span><i />New</span><span><i />Returning</span></>}</div>
      <div className={s.segment} aria-label="Chart metric">
        {(["visitors", "pageviews"] as const).map(key => <button key={key} aria-pressed={metric === key} onClick={() => setMetric(key)}>{key === "visitors" ? "Visitors" : "Views"}</button>)}
      </div>
    </div>
    {points.length ? <>
      <div className={s.chartReadout} aria-live="polite"><span>{selected?.date}</span><strong>{n(selected?.[metric] ?? 0)}</strong><span>{metric}{metric === "visitors" && selected ? ` / ${n(selected.newVisitors)} new / ${n(selected.returningVisitors)} returning` : ""}</span></div>
      <svg ref={svg} className={s.chart} viewBox={`0 0 ${width} 260`} role="group" aria-label={`Daily ${metric}. Use left and right arrows to inspect dates.`}>
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--blueprint)" stopOpacity=".22"/><stop offset="100%" stopColor="var(--blueprint)" stopOpacity=".02"/></linearGradient></defs>
        {[0, 1, 2, 3, 4].map(i => <g key={i}><line x1="52" x2={width - 20} y1={y(ceiling * i / 4)} y2={y(ceiling * i / 4)} stroke="var(--ink)" strokeOpacity=".15" strokeDasharray={i ? "3 5" : undefined}/><text x="40" y={y(ceiling * i / 4) + 4} textAnchor="end">{n(ceiling * i / 4)}</text></g>)}
        <polygon points={`52,225 ${line(metric)} ${x(points.length - 1)},225`} fill={`url(#${id})`}/>
        <polyline points={line(metric)} fill="none" stroke="var(--ink)" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>
        {metric === "visitors" && <><polyline points={line("newVisitors")} fill="none" stroke="var(--blueprint)" strokeWidth="2" vectorEffect="non-scaling-stroke"/><polyline points={line("returningVisitors")} fill="none" stroke="var(--sky)" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke"/></>}
        {points.map((p, i) => <g key={p.date} ref={el => { markers.current[i] = el; }} tabIndex={i === Math.min(active ?? points.length - 1, points.length - 1) ? 0 : -1} role="button" aria-label={`${p.date}: ${n(p[metric])} ${metric}, ${p.newVisitors} new, ${p.returningVisitors} returning`} onFocus={() => setActive(i)} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)} onKeyDown={e => {
          const next = e.key === "ArrowLeft" ? Math.max(0, i - 1) : e.key === "ArrowRight" ? Math.min(points.length - 1, i + 1) : e.key === "Home" ? 0 : e.key === "End" ? points.length - 1 : i;
          if (["ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "].includes(e.key)) { e.preventDefault(); setActive(next); markers.current[next]?.focus(); }
        }}>
          <rect x={x(i) - Math.max(3, (width - 72) / (2 * points.length))} y="20" width={Math.max(6, (width - 72) / points.length)} height="210" fill="transparent"/>
          {(active === i || points.length === 1) && <><line x1={x(i)} x2={x(i)} y1="20" y2="225" stroke="var(--blueprint)" strokeOpacity=".4"/><rect x={x(i) - 4} y={y(p[metric]) - 4} width="8" height="8" fill="var(--blueprint)" stroke="var(--paper)" strokeWidth="2"/></>}
        </g>)}
        {Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])).map(i => <text key={i} x={x(i)} y="250" textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}>{points[i].date.slice(5)}</text>)}
      </svg>
      <details className={s.details}><summary>Daily data table</summary><div className={s.tableScroll}><table className={s.table}><thead><tr><th>Date</th><th>Visitors</th><th>New</th><th>Returning</th><th>Sessions</th><th>Views</th></tr></thead><tbody>{points.map(p => <tr key={p.date}><td>{p.date}</td><td>{n(p.visitors)}</td><td>{n(p.newVisitors)}</td><td>{n(p.returningVisitors)}</td><td>{n(p.sessions)}</td><td>{n(p.pageviews)}</td></tr>)}</tbody></table></div></details>
    </> : <div className={s.empty}>Chart unavailable. Retry the report.</div>}
  </>;
}
