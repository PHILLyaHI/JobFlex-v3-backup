"use client";
// THE FRAMING PLAN (2026-10-04) — the deck seen from above, drawn the way a
// framer sketches it: the outline in heavy ink, the house wall hatched, the
// ledger along it, every joist, the beams (dashed where they sit under the
// joists, solid where they are flush), posts on their footings, the blocking,
// and the dimensions a crew lays out by. Drawn from the same frame the 3D and
// the material list read (lib/deck/frame), in inches.
import type { DeckFrame } from "@/lib/deck/frame";
import { ftIn } from "@/lib/deck/codeTables";
import { shapeOutline } from "@/lib/deck/design";
import s from "./deck-studio.module.css";

export function DeckPlan({ frame }: { frame: DeckFrame }) {
  const zones = frame.zones.map((z) => z.zone);
  const W = Math.max(...zones.map((z) => z.x1));
  const D = Math.max(...zones.map((z) => z.y1));
  const size = Math.max(W, D);
  const font = Math.max(9, size / 34);
  const pad = font * 5.5;
  const houseBand = font * 2.2;
  const outline = shapeOutline(frame.design.shape);
  const ring = outline.map((p) => `${p.x},${p.y}`).join(" ");
  const sticks = (role: string) => frame.sticks.filter((st) => st.role === role);
  const lw = Math.max(0.8, size / 260);
  const dimY = D + font * 2.6;
  const dimX = W + font * 2.6;
  const joistNote = `${frame.joistSize} joists @ ${frame.spacingIn}" o.c.`;
  const vb = `${-pad} ${-pad - (frame.design.placement !== "detached" ? houseBand : 0)} ${W + pad * 2} ${D + pad * 2 + (frame.design.placement !== "detached" ? houseBand : 0)}`;
  return (
    <svg className={s.planSvg} viewBox={vb} role="img" aria-label={`Framing plan: ${ftIn(W)} by ${ftIn(D)}, ${joistNote}`}>
      <defs>
        <pattern id="deckHatch" width={font} height={font} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2={font} stroke="var(--muted-light)" strokeWidth={lw} />
        </pattern>
      </defs>
      {/* The house, where the deck meets it. */}
      {frame.edges.filter((e) => e.house).map((e, i) => {
        const horizontal = e.y0 === e.y1;
        const x = Math.min(e.x0, e.x1);
        const y = Math.min(e.y0, e.y1);
        return horizontal ? (
          <rect key={`h${i}`} x={x} y={y - houseBand} width={Math.abs(e.x1 - e.x0)} height={houseBand} fill="url(#deckHatch)" stroke="var(--ink)" strokeWidth={lw} />
        ) : (
          <rect key={`h${i}`} x={x - (e.side === "left" ? 0 : houseBand)} y={y} width={houseBand} height={Math.abs(e.y1 - e.y0)} fill="url(#deckHatch)" stroke="var(--ink)" strokeWidth={lw} />
        );
      })}
      {frame.design.placement !== "detached" ? (
        <text x={W / 2} y={-houseBand / 2 + font * 0.35} fontSize={font} textAnchor="middle" className={s.planLabel}>
          HOUSE
        </text>
      ) : null}
      {/* Footings under the posts, dashed: they are below the deck. */}
      {frame.posts.map((p) => (
        <circle key={`f${p.id}`} cx={p.x} cy={p.y} r={p.footing.padIn / 2} fill="none" stroke="var(--muted)" strokeWidth={lw} strokeDasharray={`${lw * 3} ${lw * 2}`} />
      ))}
      {/* Beams: dashed under the joists, solid when flush. */}
      {frame.beams.map((b) => (
        <rect key={b.id} x={b.x0} y={b.y - b.spec.thickIn / 2} width={b.x1 - b.x0} height={b.spec.thickIn} fill={b.style === "flush" ? "var(--paper-deep)" : "none"} stroke="var(--blueprint)" strokeWidth={lw * 1.6} strokeDasharray={b.style === "dropped" ? `${lw * 6} ${lw * 3}` : undefined} />
      ))}
      {/* Joists and rim. */}
      {sticks("joist").map((j, i) => (
        <rect key={`j${i}`} x={j.cx - j.sx / 2} y={j.cy - j.sy / 2} width={j.sx} height={j.sy} fill="var(--paper-deep)" stroke="var(--ink-soft)" strokeWidth={lw * 0.6} />
      ))}
      {sticks("rim").map((r, i) => (
        <rect key={`r${i}`} x={r.cx - r.sx / 2} y={r.cy - r.sy / 2} width={r.sx} height={r.sy} fill="var(--paper-deep)" stroke="var(--ink-soft)" strokeWidth={lw * 0.6} />
      ))}
      {sticks("blocking").map((b, i) => (
        <rect key={`k${i}`} x={b.cx - b.sx / 2} y={b.cy - b.sy / 2} width={b.sx} height={b.sy} fill="var(--muted-light)" />
      ))}
      {/* The ledger, along the house. */}
      {sticks("ledger").map((l, i) => (
        <rect key={`l${i}`} x={l.cx - l.sx / 2} y={l.cy - l.sy / 2} width={l.sx} height={l.sy} fill="var(--ink)" />
      ))}
      {/* Posts. */}
      {frame.posts.map((p) => {
        const w = p.size === "8x8" ? 7.5 : p.size === "6x6" ? 5.5 : 3.5;
        const d = p.size === "4x6" ? 5.5 : w;
        return <rect key={p.id} x={p.x - w / 2} y={p.y - d / 2} width={w} height={d} fill="var(--ink)" />;
      })}
      {/* The outline. */}
      <polygon points={ring} fill="none" stroke="var(--ink)" strokeWidth={lw * 2.2} />
      {/* Beam labels. */}
      {frame.beams.map((b) => (
        <text key={`bt${b.id}`} x={b.x0 + font * 0.6} y={b.y - b.spec.thickIn / 2 - font * 0.45} fontSize={font * 0.9} className={s.planNote}>
          {`${b.spec.size} ${b.style === "flush" ? "flush " : ""}beam · posts ${ftIn(b.spanIn)} o.c.`}
        </text>
      ))}
      {/* The joists' size, where the deck is deepest. */}
      <text x={W / 2} y={(frame.zones[0].zone.y0 + (frame.beams[0]?.y ?? D)) / 2} fontSize={font * 0.95} textAnchor="middle" className={s.planNote}>
        {joistNote}
      </text>
      {/* Dimensions. */}
      <g className={s.planDim}>
        <line x1={0} y1={dimY} x2={W} y2={dimY} strokeWidth={lw} />
        <line x1={0} y1={dimY - font * 0.6} x2={0} y2={dimY + font * 0.6} strokeWidth={lw} />
        <line x1={W} y1={dimY - font * 0.6} x2={W} y2={dimY + font * 0.6} strokeWidth={lw} />
        <text x={W / 2} y={dimY + font * 1.5} fontSize={font} textAnchor="middle">{ftIn(W)}</text>
        <line x1={dimX} y1={0} x2={dimX} y2={D} strokeWidth={lw} />
        <line x1={dimX - font * 0.6} y1={0} x2={dimX + font * 0.6} y2={0} strokeWidth={lw} />
        <line x1={dimX - font * 0.6} y1={D} x2={dimX + font * 0.6} y2={D} strokeWidth={lw} />
        <text x={dimX + font * 0.9} y={D / 2} fontSize={font} transform={`rotate(90 ${dimX + font * 0.9} ${D / 2})`} textAnchor="middle">{ftIn(D)}</text>
      </g>
    </svg>
  );
}
