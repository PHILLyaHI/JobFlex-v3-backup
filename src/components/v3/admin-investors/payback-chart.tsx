// THE PAYBACK CURVE (2026-10-06) — ad spend against revenue, day by day, from
// the launch to the horizon. Three lines to one scale: spend (ink), revenue
// if every trial pays (light blue), realistic revenue (blueprint blue). A
// dashed rule at today splits booked from projected; a mark where the
// realistic line meets the spend is the break-even. Plain SVG, no hooks, so
// the admin page, the public link and a static render all draw the same thing.
import type { CurvePoint } from "@/lib/investorModel";
import { dollars } from "@/lib/investorModel";
import s from "./investor-report.module.css";

const W = 760;
const H = 300;
const PAD = { l: 58, r: 18, t: 18, b: 40 };

const niceMax = (v: number) => {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return step * p;
};
const short = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function PaybackChart({ curve, today, breakEven }: { curve: CurvePoint[]; today: string; breakEven: string | null }) {
  const n = curve.length;
  if (n < 2) return null;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const maxCents = niceMax(Math.max(...curve.map((p) => Math.max(p.spendCents, p.allPayCents, p.realisticCents))));
  const x = (i: number) => PAD.l + (i * plotW) / (n - 1);
  const y = (c: number) => PAD.t + plotH - (c / maxCents) * plotH;
  const path = (pick: (p: CurvePoint) => number) => curve.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(pick(p)).toFixed(1)}`).join(" ");
  const todayIdx = curve.findIndex((p) => p.date === today);
  const beIdx = breakEven ? curve.findIndex((p) => p.date === breakEven) : -1;
  // Six date ticks across, and the y rules at nice fractions.
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => Math.round(f * (n - 1)));
  const rules = [0.25, 0.5, 0.75, 1];
  return (
    <figure className={s.chart}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Ad spend against revenue from ${short(curve[0].date)} to ${short(curve[n - 1].date)}${breakEven ? `; break-even ${short(breakEven)}` : ""}`}>
        {rules.map((f) => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(f * maxCents)} y2={y(f * maxCents)} className={s.rule} />
            <text x={PAD.l - 8} y={y(f * maxCents) + 4} textAnchor="end" className={s.axis}>{dollars(f * maxCents)}</text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className={s.base} />
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 14} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className={s.axis}>{short(curve[i].date)}</text>
        ))}
        {todayIdx > 0 && (
          <g>
            <rect x={x(todayIdx)} y={PAD.t} width={W - PAD.r - x(todayIdx)} height={plotH} className={s.future} />
            <line x1={x(todayIdx)} x2={x(todayIdx)} y1={PAD.t} y2={PAD.t + plotH} className={s.today} />
            <text x={x(todayIdx) + 5} y={PAD.t + 12} className={s.axisStrong}>today</text>
          </g>
        )}
        <path d={path((p) => p.allPayCents)} className={s.lineAll} />
        <path d={path((p) => p.realisticCents)} className={s.lineReal} />
        <path d={path((p) => p.spendCents)} className={s.lineSpend} />
        {beIdx >= 0 && (
          <g>
            <circle cx={x(beIdx)} cy={y(curve[beIdx].realisticCents)} r={5} className={s.mark} />
            <text x={x(beIdx) + (beIdx > n * 0.7 ? -9 : 9)} y={y(curve[beIdx].realisticCents) - 10} textAnchor={beIdx > n * 0.7 ? "end" : "start"} className={s.axisStrong}>break-even · {short(breakEven!)}</text>
          </g>
        )}
      </svg>
      <figcaption className={s.legend}>
        <span><i className={s.swSpend} />Ad spend</span>
        <span><i className={s.swReal} />Revenue, realistic share</span>
        <span><i className={s.swAll} />Revenue if every trial pays</span>
        <span className={s.legendNote}>Shaded: projected at today&apos;s pace. Revenue at list price per month.</span>
      </figcaption>
    </figure>
  );
}
