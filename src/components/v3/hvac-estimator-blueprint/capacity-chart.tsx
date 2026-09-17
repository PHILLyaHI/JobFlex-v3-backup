"use client";

// Heat-pump capacity against the house's heating load, from below the design
// day up to 65 °F. Where the two lines cross is the balance point; below it
// the backup strips run. Drawn to one scale, labels inside the viewBox.

import type { CapacityPoint } from "@/lib/hvac/types";

export function CapacityChart({ curve, designF, balanceF, cx }: { curve: CapacityPoint[]; designF: number; balanceF?: number; cx: (...n: Array<string | false | null | undefined>) => string }) {
  if (curve.length < 2) return null;
  const W = 420;
  const H = 190;
  const L = 46;
  const R = 12;
  const T = 14;
  const B = 30;
  const xs = curve.map((p) => p.outdoorF);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const yMax = Math.max(...curve.map((p) => Math.max(p.capacityBtuh, p.loadBtuh))) * 1.08;
  const X = (t: number) => L + ((t - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v: number) => T + (1 - v / yMax) * (H - T - B);
  const path = (k: "capacityBtuh" | "loadBtuh") => curve.map((p, i) => `${i ? "L" : "M"}${X(p.outdoorF).toFixed(1)} ${Y(p[k]).toFixed(1)}`).join(" ");
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((yMax * f) / 5000) * 5000).filter((v, i, a) => a.indexOf(v) === i);
  const xTicks = curve.filter((_, i) => i % 2 === 0).map((p) => p.outdoorF);
  const bx = balanceF !== undefined ? X(balanceF) : null;
  const byLoad = balanceF !== undefined ? curve.find((p) => p.outdoorF >= balanceF) : undefined;
  return (
    <svg className={cx("chart")} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Heat pump capacity against the heating load by outdoor temperature">
      {bx !== null && <rect className={cx("band")} x={L} y={T} width={Math.max(0, bx - L)} height={H - T - B} />}
      {yTicks.map((v) => (
        <g key={v}>
          <line className={cx("ax")} x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} />
          <text x={L - 5} y={Y(v) + 3} textAnchor="end">{v >= 1000 ? `${Math.round(v / 1000)}k` : v}</text>
        </g>
      ))}
      {xTicks.map((t) => (
        <text key={t} x={X(t)} y={H - B + 14} textAnchor="middle">{t}°</text>
      ))}
      <line className={cx("ax")} x1={L} x2={W - R} y1={H - B} y2={H - B} />
      <line className={cx("ax")} x1={L} x2={L} y1={T} y2={H - B} />
      <path className={cx("ld")} d={path("loadBtuh")} />
      <path className={cx("cap")} d={path("capacityBtuh")} />
      <line className={cx("ax")} x1={X(designF)} x2={X(designF)} y1={T} y2={H - B} strokeDasharray="2 3" />
      <text x={X(designF) + 4} y={T + 10}>design {designF}°</text>
      {bx !== null && byLoad && (
        <g>
          <circle className={cx("mk")} cx={bx} cy={Y(byLoad.loadBtuh)} r={3.5} />
          <text x={bx + 6} y={Y(byLoad.loadBtuh) - 6}>balance {balanceF}°</text>
        </g>
      )}
      <text x={W - R} y={H - 4} textAnchor="end">BTU/h · outdoor °F</text>
    </svg>
  );
}
