"use client";
// THE FRAMING PLAN (2026-10-04; the roof 2026-10-10) — the deck seen from
// above, drawn the way a framer sketches it: the outline in heavy ink, the
// house wall hatched, the ledger along it, every joist, the beams (dashed
// where they sit under the joists, solid where they are flush), posts on
// their footings, the blocking, and the dimensions a crew lays out by. With a
// roof: its posts, the headers between them, the rafters, hips and ridge in
// blueprint blue, and the eave line dashed outside the posts. Drawn from the
// same frame and roof the 3D and the material list read (lib/deck/frame,
// lib/deck/roof), in inches.
import type { DeckFrame } from "@/lib/deck/frame";
import type { RoofFrame } from "@/lib/deck/roof";
import { ftIn } from "@/lib/deck/codeTables";
import { shapeOutline } from "@/lib/deck/design";
import s from "./deck-studio.module.css";

export function DeckPlan({ frame, roof = null }: { frame: DeckFrame | null; roof?: RoofFrame | null }) {
  const zones = frame ? frame.zones.map((z) => z.zone) : [];
  const eave = roof?.eaveRing ?? [];
  const xs = [...zones.flatMap((z) => [z.x0, z.x1]), ...eave.map((p) => p.x), ...(roof ? [0] : [])];
  const ys = [...zones.flatMap((z) => [z.y0, z.y1]), ...eave.map((p) => p.y), ...(roof ? [0] : [])];
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 48);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 48);
  const W = frame ? Math.max(...zones.map((z) => z.x1)) : maxX;
  const D = frame ? Math.max(...zones.map((z) => z.y1)) : maxY;
  const size = Math.max(maxX - minX, maxY - minY);
  const font = Math.max(9, size / 34);
  const pad = font * 5.5;
  const onHouse = frame ? frame.design.placement !== "detached" : roof?.attach === "wall";
  const houseBand = font * 2.2;
  const outline = frame ? shapeOutline(frame.design.shape) : [];
  const ring = outline.map((p) => `${p.x},${p.y}`).join(" ");
  const sticks = (role: string) => (frame ? frame.sticks.filter((st) => st.role === role) : []);
  const lw = Math.max(0.8, size / 260);
  const dimY = maxY + font * 2.6;
  const dimX = maxX + font * 2.6;
  const joistNote = frame ? `${frame.joistSize} joists @ ${frame.spacingIn}" o.c.` : "";
  const roofNote = roof ? `${roof.rafters.size} rafters @ ${roof.rafters.spacingIn}" o.c.` : "";
  const vb = `${minX - pad} ${minY - pad - (onHouse ? houseBand : 0)} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2 + (onHouse ? houseBand : 0)}`;
  const roofMembers = (roles: string[]) => (roof ? roof.members.filter((m) => roles.includes(m.role)) : []);
  return (
    <svg className={s.planSvg} viewBox={vb} role="img" aria-label={`Framing plan: ${ftIn(maxX - minX)} by ${ftIn(maxY - minY)}${joistNote ? `, ${joistNote}` : ""}${roofNote ? `, ${roofNote}` : ""}`}>
      <defs>
        <pattern id="deckHatch" width={font} height={font} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2={font} stroke="var(--muted-light)" strokeWidth={lw} />
        </pattern>
      </defs>
      {/* The house, where the deck meets it. */}
      {frame
        ? frame.edges.filter((e) => e.house).map((e, i) => {
            const horizontal = e.y0 === e.y1;
            const x = Math.min(e.x0, e.x1);
            const y = Math.min(e.y0, e.y1);
            return horizontal ? (
              <rect key={`h${i}`} x={x} y={y - houseBand} width={Math.abs(e.x1 - e.x0)} height={houseBand} fill="url(#deckHatch)" stroke="var(--ink)" strokeWidth={lw} />
            ) : (
              <rect key={`h${i}`} x={x - (e.side === "left" ? 0 : houseBand)} y={y} width={houseBand} height={Math.abs(e.y1 - e.y0)} fill="url(#deckHatch)" stroke="var(--ink)" strokeWidth={lw} />
            );
          })
        : onHouse
          ? <rect x={minX} y={-houseBand} width={maxX - minX} height={houseBand} fill="url(#deckHatch)" stroke="var(--ink)" strokeWidth={lw} />
          : null}
      {onHouse ? (
        <text x={(minX + maxX) / 2} y={-houseBand / 2 + font * 0.35} fontSize={font} textAnchor="middle" className={s.planLabel}>
          HOUSE
        </text>
      ) : null}
      {/* The deck. */}
      {frame ? (
        <>
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
          {frame.posts.filter((p) => !p.roof).map((p) => {
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
          {!roof ? (
            <text x={W / 2} y={(frame.zones[0].zone.y0 + (frame.beams[0]?.y ?? D)) / 2} fontSize={font * 0.95} textAnchor="middle" className={s.planNote}>
              {joistNote}
            </text>
          ) : null}
        </>
      ) : null}
      {/* The roof: eave line dashed, rafters, hips and ridge in blue, headers heavy, posts solid. */}
      {roof ? (
        <g className={s.planRoof}>
          {roof.slab ? <rect x={Math.min(...roof.ring.map((p) => p.x)) - 12} y={Math.min(...roof.ring.map((p) => p.y)) - 12} width={Math.max(...roof.ring.map((p) => p.x)) - Math.min(...roof.ring.map((p) => p.x)) + 24} height={Math.max(...roof.ring.map((p) => p.y)) - Math.min(...roof.ring.map((p) => p.y)) + 24} fill="var(--paper)" stroke="var(--muted)" strokeWidth={lw} /> : null}
          <polygon points={roof.eaveRing.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--blueprint)" strokeWidth={lw * 1.2} strokeDasharray={`${lw * 5} ${lw * 3}`} />
          {roofMembers(["rafter", "jack", "fly", "purlin", "slat", "tie"]).map((m, i) => (
            <line key={`rf${i}`} x1={m.x0} y1={m.y0} x2={m.x1} y2={m.y1} stroke="var(--blueprint)" strokeWidth={m.role === "slat" ? lw * 0.4 : lw * 0.7} opacity={m.role === "slat" || m.role === "purlin" ? 0.5 : 0.85} />
          ))}
          {roofMembers(["hip", "ridge", "ring"]).map((m, i) => (
            <line key={`hr${i}`} x1={m.x0} y1={m.y0} x2={m.x1} y2={m.y1} stroke="var(--blueprint-dark)" strokeWidth={lw * 1.8} />
          ))}
          {roof.headers.map((h) => (
            <line key={h.id} x1={h.x0} y1={h.y0} x2={h.x1} y2={h.y1} stroke="var(--ink)" strokeWidth={lw * 2.4} />
          ))}
          {roof.ledger ? <rect x={Math.min(...roof.members.filter((m) => m.role === "roof-ledger").map((m) => m.x0))} y={0} width={roof.ledger.lengthIn} height={1.5} fill="var(--ink)" /> : null}
          {roof.posts.map((p) => {
            const w = p.size === "8x8" ? 7.5 : p.size === "6x6" ? 5.5 : 3.5;
            return <rect key={p.id} x={p.x - w / 2} y={p.y - w / 2} width={w} height={w} fill="var(--blueprint-dark)" stroke="#fff" strokeWidth={lw * 0.6} />;
          })}
          {roof.posts.filter((p) => p.footing).map((p) => (
            <circle key={`rf${p.id}`} cx={p.x} cy={p.y} r={(p.footing?.padIn ?? 12) / 2} fill="none" stroke="var(--muted)" strokeWidth={lw} strokeDasharray={`${lw * 3} ${lw * 2}`} />
          ))}
          <text x={roof.centreX} y={roof.centreY + font * 0.35} fontSize={font * 0.95} textAnchor="middle" className={s.planNote}>
            {roofNote}
          </text>
          {roof.headers[0] ? (
            <text x={roof.headers[0].x0 + font * 0.6} y={roof.headers[0].y0 - font * 0.6} fontSize={font * 0.85} className={s.planNote}>
              {`${[...new Set(roof.headers.map((h) => h.spec.size))].join("/")} headers · ${roof.posts.length} posts`}
            </text>
          ) : null}
        </g>
      ) : null}
      {/* Dimensions. */}
      <g className={s.planDim}>
        <line x1={minX} y1={dimY} x2={maxX} y2={dimY} strokeWidth={lw} />
        <line x1={minX} y1={dimY - font * 0.6} x2={minX} y2={dimY + font * 0.6} strokeWidth={lw} />
        <line x1={maxX} y1={dimY - font * 0.6} x2={maxX} y2={dimY + font * 0.6} strokeWidth={lw} />
        <text x={(minX + maxX) / 2} y={dimY + font * 1.5} fontSize={font} textAnchor="middle">{ftIn(maxX - minX)}</text>
        <line x1={dimX} y1={minY} x2={dimX} y2={maxY} strokeWidth={lw} />
        <line x1={dimX - font * 0.6} y1={minY} x2={dimX + font * 0.6} y2={minY} strokeWidth={lw} />
        <line x1={dimX - font * 0.6} y1={maxY} x2={dimX + font * 0.6} y2={maxY} strokeWidth={lw} />
        <text x={dimX + font * 0.9} y={(minY + maxY) / 2} fontSize={font} transform={`rotate(90 ${dimX + font * 0.9} ${(minY + maxY) / 2})`} textAnchor="middle">{ftIn(maxY - minY)}</text>
      </g>
    </svg>
  );
}
