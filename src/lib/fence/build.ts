// What a fence is BUILT FROM, as plain numbers the 3D can stand up — read off
// the catalog type (2026-09-28, owner: "make sure the 3D builds exactly what
// it's going to be built from"). Posts every `spacingFt`, `rails` horizontal
// members per section, the infill the type really has (butted privacy boards,
// spaced pickets, the two interleaved faces of a shadowbox, the two layers of
// board-on-board, stacked horizontal boards, square bars through channel
// rails, diamond mesh, or nothing at all on a rail fence), line and terminal
// posts at their real face width, round or square, with the cap the system
// ships. THREE-free and JSON-shaped: the studio hands it to the model and
// stores it in the proposal's scene, so the client sees the same fence.
import { effectiveSpacingFt, fenceType, type FenceType, type RenderFamily } from "./catalog";

export type FenceInfill = "boards" | "board-on-board" | "shadowbox" | "pickets" | "horizontal" | "bars" | "mesh" | "none";
export type FenceBuildKind = "stick" | "panel" | "mesh" | "rail";
export type FencePostCap = "flat" | "pyramid" | "gothic" | "dome" | "loop" | "none";

export interface FenceBuild {
  /** Post to post, at most (bays divide a run evenly under it). */
  spacingFt: number;
  kind: FenceBuildKind;
  /** Horizontal members per section; 0 when the boards ARE the horizontals. */
  rails: number;
  infill: FenceInfill;
  /** One board / picket / bar: face width, the gap to the next (negative =
   *  overlap, board-on-board) and its thickness. Feet. */
  boardWidthFt: number;
  boardGapFt: number;
  boardDepthFt: number;
  /** A rail's cross-section: tall (vertical) and deep (into the fence). Feet. */
  railHeightFt: number;
  railDepthFt: number;
  /** Line post face width / outside diameter, and the corner / end / gate post's. */
  postWidthFt: number;
  terminalWidthFt: number;
  postProfile: "square" | "round";
  postCap: FencePostCap;
  /** How far the post top stands above the infill top. */
  postProudFt: number;
  /** Chain-link diamond, feet (mesh only). */
  meshDiamondFt?: number;
  /** Steeper than this a section cannot follow the grade and must step —
   *  prefab privacy panels barely rack, a stick-built run follows a hill. */
  rackMaxDeg: number;
}

const IN = 1 / 12;

/** The old studio's fence when no type is known: a stick-built privacy run
 *  with two rails and 5½" boards — the constants the layout always had. */
export const DEFAULT_FENCE_BUILD: FenceBuild = {
  spacingFt: 8,
  kind: "stick",
  rails: 2,
  infill: "boards",
  boardWidthFt: 0.46,
  boardGapFt: 0.04,
  boardDepthFt: 0.75 * IN,
  railHeightFt: 3.5 * IN,
  railDepthFt: 1.5 * IN,
  postWidthFt: 3.5 * IN,
  terminalWidthFt: 3.5 * IN,
  postProfile: "square",
  postCap: "flat",
  postProudFt: 2 * IN,
  rackMaxDeg: 20,
};

/** How far a section of this kind follows the grade before it must step.
 *  Stick-built and rail fences rack freely (plumb pickets on pitched rails);
 *  chain link drapes; ornamental panels rack on their pivots; a prefab
 *  privacy panel is a rigid rectangle and takes almost no grade at all. */
export function rackMaxDegFor(t: FenceType): number {
  if (t.build === "mesh") return 25;
  if (t.build === "panel") return t.family === "aluminum" ? 25 : 4;
  return 20;
}

function infillOf(t: FenceType): FenceInfill {
  if (t.build === "mesh") return "mesh";
  if (t.build === "rail") return "none";
  if (t.id === "shadowbox") return "shadowbox";
  if (t.id === "board-on-board") return "board-on-board";
  if (t.id === "horizontal-modern") return "horizontal";
  if (t.build === "panel") return t.family === "aluminum" ? "bars" : t.id === "vinyl-picket" ? "pickets" : "boards";
  return (t.picketGapIn ?? 0) > 0 ? "pickets" : "boards";
}

/** The build of a catalog type at a height (rails depend on it), with the
 *  page's post-spacing override where the type allows one. */
export function fenceBuildFor(t: FenceType, heightFt: number, spacingOverride?: number | null): FenceBuild {
  const infill = infillOf(t);
  const pitch = t.spec.infillPitchIn;
  const width = t.picketWidthIn ?? (infill === "bars" ? 0.75 : infill === "pickets" ? 3 : 6);
  // The catalog gives a gap for stick builds and a pitch for the rest.
  const gap = t.picketGapIn ?? (pitch ? Math.max(0, pitch - width) : 0);
  const wood = t.category === "wood" || t.category === "split-rail";
  const rail: { h: number; d: number } =
    t.build === "mesh"
      ? { h: 1.375, d: 1.375 } // 1⅜" top rail
      : t.family === "aluminum"
        ? { h: t.category === "steel" ? 1.25 : 1, d: t.category === "steel" ? 1.25 : 1 }
        : t.build === "panel"
          ? { h: 5.5, d: 1.5 } // 2×6 pocket rail, boards inside it
          : t.build === "rail"
            ? t.id === "split-rail-2"
              ? { h: 4, d: 3.5 } // a split rail
              : { h: 5.5, d: 0.75 } // 1×6 ranch board
            : { h: 3.5, d: 1.5 }; // a 2×4 on edge
  const depth = infill === "bars" ? width : t.build === "panel" ? 0.9 : 0.75;
  return {
    spacingFt: effectiveSpacingFt(t, spacingOverride),
    kind: t.build,
    rails: Math.max(0, Math.round(t.railsPerSection(heightFt))),
    infill,
    boardWidthFt: width * IN,
    boardGapFt: gap * IN,
    boardDepthFt: depth * IN,
    railHeightFt: rail.h * IN,
    railDepthFt: rail.d * IN,
    postWidthFt: t.spec.postWidthIn * IN,
    terminalWidthFt: t.spec.terminalWidthIn * IN,
    postProfile: t.spec.postProfile,
    postCap: t.spec.postCap,
    postProudFt: t.spec.postProudIn * IN,
    meshDiamondFt: t.spec.meshDiamondIn ? t.spec.meshDiamondIn * IN : undefined,
    rackMaxDeg: wood && t.build === "stick" ? 20 : rackMaxDegFor(t),
  };
}

const FAMILY_TYPE: Record<RenderFamily, string> = {
  cedar: "cedar-privacy",
  vinyl: "vinyl-privacy",
  "chain-link": "chain-link-galv",
  aluminum: "aluminum-ornamental",
  composite: "composite-privacy",
};

/** A build for a scene that stored only its look (plans before 2026-09-28). */
export function fenceBuildForFamily(family: string, heightFt: number): FenceBuild {
  const id = FAMILY_TYPE[family as RenderFamily] ?? FAMILY_TYPE.cedar;
  return fenceBuildFor(fenceType(id), heightFt);
}

const KINDS: readonly FenceBuildKind[] = ["stick", "panel", "mesh", "rail"];
const INFILLS: readonly FenceInfill[] = ["boards", "board-on-board", "shadowbox", "pickets", "horizontal", "bars", "mesh", "none"];
const CAPS: readonly FencePostCap[] = ["flat", "pyramid", "gothic", "dome", "loop", "none"];
const num = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

/** A stored build read back defensively: anything off is no build (the
 *  scene then falls back to its family's), never a crash. */
export function parseFenceBuild(raw: unknown): FenceBuild | null {
  const r = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!r) return null;
  if (!num(r.spacingFt, 2, 24) || !num(r.rails, 0, 8)) return null;
  if (!num(r.boardWidthFt, 0.01, 2) || !num(r.boardGapFt, -1, 2) || !num(r.boardDepthFt, 0.005, 0.5)) return null;
  if (!num(r.railHeightFt, 0.01, 1) || !num(r.railDepthFt, 0.01, 1)) return null;
  if (!num(r.postWidthFt, 0.05, 1.5) || !num(r.terminalWidthFt, 0.05, 1.5) || !num(r.postProudFt, 0, 2)) return null;
  if (!KINDS.includes(r.kind as FenceBuildKind) || !INFILLS.includes(r.infill as FenceInfill) || !CAPS.includes(r.postCap as FencePostCap)) return null;
  if (r.postProfile !== "square" && r.postProfile !== "round") return null;
  const rack = num(r.rackMaxDeg, 0, 45) ? r.rackMaxDeg : 20;
  return {
    spacingFt: r.spacingFt,
    kind: r.kind as FenceBuildKind,
    rails: Math.round(r.rails),
    infill: r.infill as FenceInfill,
    boardWidthFt: r.boardWidthFt,
    boardGapFt: r.boardGapFt,
    boardDepthFt: r.boardDepthFt,
    railHeightFt: r.railHeightFt,
    railDepthFt: r.railDepthFt,
    postWidthFt: r.postWidthFt,
    terminalWidthFt: r.terminalWidthFt,
    postProfile: r.postProfile,
    postCap: r.postCap as FencePostCap,
    postProudFt: r.postProudFt,
    meshDiamondFt: num(r.meshDiamondFt, 0.05, 1) ? r.meshDiamondFt : undefined,
    rackMaxDeg: rack,
  };
}

/** One line for a legend or a caption: "posts every 8 ft · 3 rails · 5½" boards". */
export function describeBuild(b: FenceBuild): string {
  const inches = (ft: number) => {
    const v = Math.round(ft * 12 * 4) / 4;
    const whole = Math.floor(v);
    const frac = v - whole;
    const f = frac === 0.25 ? "¼" : frac === 0.5 ? "½" : frac === 0.75 ? "¾" : "";
    return `${whole === 0 && f ? "" : whole}${f}"`;
  };
  const parts = [`posts every ${Math.round(b.spacingFt * 10) / 10} ft`];
  if (b.rails) parts.push(`${b.rails} ${b.rails === 1 ? "rail" : "rails"}`);
  switch (b.infill) {
    case "boards":
      parts.push(`${inches(b.boardWidthFt)} boards`);
      break;
    case "board-on-board":
      parts.push(`${inches(b.boardWidthFt)} boards, two layers`);
      break;
    case "shadowbox":
      parts.push(`${inches(b.boardWidthFt)} boards both sides`);
      break;
    case "pickets":
      parts.push(`${inches(b.boardWidthFt)} pickets, ${inches(Math.max(0, b.boardGapFt))} apart`);
      break;
    case "horizontal":
      parts.push(`${inches(b.boardWidthFt)} boards laid flat`);
      break;
    case "bars":
      parts.push(`${inches(b.boardWidthFt)} bars`);
      break;
    case "mesh":
      parts.push(b.meshDiamondFt ? `${inches(b.meshDiamondFt)} mesh` : "mesh");
      break;
    case "none":
      parts.push("open");
      break;
  }
  return parts.join(" · ");
}
