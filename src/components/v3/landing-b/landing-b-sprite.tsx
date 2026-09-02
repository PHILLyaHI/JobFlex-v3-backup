/* JobFlex landing — Version B · drawn sprite.
 *
 * Every mark on this page is authored SVG, not a raster and not an icon
 * font. The page's whole idea is that hierarchy is carried by LINE WEIGHT,
 * so the drawings have to obey the same three weights the CSS does:
 *
 *   L0  construction / reference   .10 ink   — grids, leaders, ticks
 *   L1  object edge                .26 ink   — outlines, frames
 *   L2  the cut                    1.0 ink   — the thing being described
 *
 * Conventions, applied without exception:
 *   - 24x24 viewBox for the icon set, stroke-width 1.75.
 *   - `stroke-linecap="square"` and `stroke-linejoin="miter"`. Round caps
 *     are a UI-kit tell; a technical pen leaves square ends.
 *   - `stroke="currentColor"` and no `fill` on strokes, so a mark inherits
 *     whatever weight the surrounding CSS gives it (see the `.lb-ico` and
 *     `.lb-dwg` rules).
 *   - Dimension text inside the schematics is JetBrains Mono via the
 *     `.lb-dwg-t` class — the drafting-annotation layer, used only for
 *     measurements, never for prose.
 *
 * No component here takes data. This is a static marketing surface; every
 * number drawn below is copy, and the schematics are illustrative drawings
 * of what the estimators return, not screenshots of a live run.
 */

import type { SVGProps } from "react";

type IcoProps = SVGProps<SVGSVGElement>;

/* ── Brand ─────────────────────────────────────────────────────────────
   The mark is a drawing sheet: square, corner cut, title block bottom-left.
   Deliberately not a hardhat, a hammer, a house or a wrench. */
export function LbMark(props: IcoProps) {
  return (
    <svg viewBox="0 0 26 26" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M3 3 H23 V16.5 L16.5 23 H3 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="miter"
      />
      <rect x="6.5" y="15" width="7" height="5" className="lb-mark-block" />
      <path d="M16.5 23 V16.5 H23" fill="none" stroke="currentColor" strokeWidth={1.25} opacity={0.45} />
    </svg>
  );
}

/* ── Icon set ──────────────────────────────────────────────────────────── */

function Ico({ children, ...p }: IcoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      {...p}
    >
      {children}
    </svg>
  );
}

export const LbArrow = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M4 12h15" />
    <path d="M13 6l6 6-6 6" />
  </Ico>
);

export const LbMenu = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Ico>
);

export const LbClose = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Ico>
);

export const LbCheck = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M4 12.5l5 5L20 6.5" />
  </Ico>
);

/* Trades */
export const LbRoofing = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M2 13L12 5l10 8" />
    <path d="M5 13v6h14v-6" />
    <path d="M12 5v14" />
  </Ico>
);

export const LbFencing = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M5 20V8l2-3 2 3v12M15 20V8l2-3 2 3v12" />
    <path d="M3 11h18M3 15h18" />
  </Ico>
);

export const LbDecks = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M3 8h18M3 12h18M3 16h18" />
    <path d="M7 8v12M17 8v12" />
  </Ico>
);

export const LbSiding = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M3 5h18v14H3z" />
    <path d="M3 9.7h18M3 14.3h18" />
    <path d="M9 5v4.7M15 9.7v4.6M9 14.3V19" />
  </Ico>
);

export const LbKitchenBath = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M3 4h18v16H3z" />
    <path d="M3 11h18" />
    <path d="M7 7.5h4M7 15h3M14.5 14v3" />
  </Ico>
);

/* Capabilities */
export const LbProposal = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M5 3h9l5 5v13H5z" />
    <path d="M14 3v5h5" />
    <path d="M8 17c1.6-2.4 2.6-2.4 3.4 0 .8 2.4 1.8 2.4 3.4 0" />
    <path d="M8 12h5" />
  </Ico>
);

export const LbPipeline = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M3 4h5v16H3zM9.5 4h5v10h-5zM16 4h5v13h-5z" />
  </Ico>
);

export const LbClients = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M3 5h18v14H3z" />
    <path d="M9.5 11.5a2 2 0 1 0 0-.01" />
    <path d="M6 16c.7-1.6 2-2.4 3.5-2.4S12.3 14.4 13 16" />
    <path d="M15 9.5h3.5M15 13h3.5" />
  </Ico>
);

export const LbCalendar = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M3 6h18v15H3z" />
    <path d="M3 10.5h18" />
    <path d="M8 3v5M16 3v5" />
    <path d="M7 14h3v3H7z" />
  </Ico>
);

export const LbJobs = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M4 4h16v16H4z" />
    <path d="M7.5 9l1.8 1.8L13 7" />
    <path d="M7.5 15.5h9" />
    <path d="M15 9.5h2" />
  </Ico>
);

export const LbInvoice = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M5 3h14v18l-3.5-2-3.5 2-3.5-2L5 21z" />
    <path d="M9 8.5h6M9 12.5h6" />
  </Ico>
);

export const LbNetwork = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M9.5 3h5v5h-5zM3 16h5v5H3zM16 16h5v5h-5z" />
    <path d="M12 8v4M12 12H5.5v4M12 12h6.5v4" />
  </Ico>
);

export const LbCrew = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M9 10.5a2.6 2.6 0 1 0 0-.01" />
    <path d="M3.5 20c.8-3.2 2.9-4.8 5.5-4.8s4.7 1.6 5.5 4.8" />
    <path d="M16 5.5a2.2 2.2 0 1 0 0-.01" />
    <path d="M16.5 12c2.1.3 3.5 1.8 4 4.2" />
  </Ico>
);

/* ── Schematics ────────────────────────────────────────────────────────
   Three drawings, one per estimator. Each is a plan or a frame with the
   measured thing on the L2 weight and everything else pushed to L0. */

/* Roof — plan view of a hip-and-gable roof with the pitch called out. */
export function LbRoofPlan(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 300 172" role="img" aria-label="Plan view of a roof, measured from aerial imagery" {...props}>
      {/* reference grid, L0 */}
      <g className="lb-dwg-l0">
        <path d="M0 24h300M0 60h300M0 96h300M0 132h300" />
        <path d="M36 0v172M84 0v172M132 0v172M180 0v172M228 0v172M276 0v172" />
      </g>
      {/* outline, L2 */}
      <path
        className="lb-dwg-l2 lb-dwg--draw"
        pathLength={1}
        d="M40 40 H198 V78 H262 V132 H40 Z"
        fill="none"
      />
      {/* hips + ridges, L1 dashed = the framing you cannot see from above */}
      <g className="lb-dwg-l1">
        <path d="M40 40 L74 74 M198 40 L164 74 M40 132 L74 98 M198 78 L172 98" />
        <path d="M74 74 H164" />
        <path d="M74 98 H172" />
        <path d="M74 74 V98 M164 74 L172 98" />
        <path d="M262 78 L232 104 M262 132 L232 104 M198 78 L228 104 M198 132 L228 104" />
        <path d="M228 104 H232" />
      </g>
      {/* pitch call-out — the little rise-over-run wedge a roofer looks for */}
      <g className="lb-dwg-l1">
        <path d="M210 32 h28 v-15 z" fill="none" />
      </g>
      <text className="lb-dwg-t" x="212" y="46">
        6/12
      </text>
      {/* dimension line below, L0 with ticks */}
      <g className="lb-dwg-l0">
        <path d="M40 152 H262" />
        <path d="M40 147v10M262 147v10" />
      </g>
      <text className="lb-dwg-t lb-dwg-t--mid" x="151" y="167">
        58&apos;-4&quot;
      </text>
      {/* facet stamps */}
      <g className="lb-dwg-node">
        <rect x="115" y="82" width="7" height="7" />
        <rect x="222" y="100" width="7" height="7" />
      </g>
    </svg>
  );
}

/* Fence — a parcel boundary with one run promoted to the cut weight. */
export function LbFenceTrace(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 300 172" role="img" aria-label="Property boundary with the fence run traced along one side" {...props}>
      <g className="lb-dwg-l0">
        <path d="M0 24h300M0 60h300M0 96h300M0 132h300" />
        <path d="M36 0v172M84 0v172M132 0v172M180 0v172M228 0v172M276 0v172" />
      </g>
      {/* parcel, L1 dashed — the surveyed boundary */}
      <path className="lb-dwg-l1 lb-dwg--dash" d="M34 30 H244 L266 62 V128 H34 Z" fill="none" />
      {/* the house footprint, L0 poche */}
      <g className="lb-dwg-l0">
        <rect x="70" y="52" width="86" height="52" />
        <path d="M70 52 L156 104 M156 52 L70 104" />
      </g>
      {/* the run, L2 */}
      <path className="lb-dwg-l2 lb-dwg--draw" pathLength={1} d="M34 128 H266" fill="none" />
      {/* posts */}
      <g className="lb-dwg-node">
        {[34, 63, 92, 121, 150, 179, 208, 237, 266].map((x) => (
          <rect key={x} x={x - 3.5} y={124.5} width="7" height="7" />
        ))}
      </g>
      {/* gate break */}
      <g className="lb-dwg-l1">
        <path d="M150 128 L166 114" />
      </g>
      <text className="lb-dwg-t" x="169" y="112">
        GATE
      </text>
      <g className="lb-dwg-l0">
        <path d="M34 150 H266" />
        <path d="M34 145v10M266 145v10" />
      </g>
      <text className="lb-dwg-t lb-dwg-t--mid" x="150" y="165">
        148&apos;-0&quot;
      </text>
    </svg>
  );
}

/* Video — a frame from a walkthrough, the timeline under it, and the line the
   contractor actually said. Laid out across the full 300-unit width: an earlier
   version stacked the transcript in a right-hand column and the longest line
   ran past the viewBox edge, where the SVG viewport silently clipped it. */
export function LbVideoWalk(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 300 172"
      role="img"
      aria-label="A video frame from a job walkthrough, its timeline, and the spoken scope it was read from"
      {...props}
    >
      <g className="lb-dwg-l0">
        <path d="M0 24h300M0 60h300M0 96h300M0 132h300" />
        <path d="M36 0v172M84 0v172M132 0v172M180 0v172M228 0v172M276 0v172" />
      </g>
      {/* the frame, L2 */}
      <rect className="lb-dwg-l2 lb-dwg--draw" pathLength={1} x="34" y="14" width="232" height="98" fill="none" />
      {/* what is in frame — the old fence, at construction weight */}
      <g className="lb-dwg-l0">
        <path d="M34 96 H266" />
        <path d="M52 96 V66 M74 96 V66 M96 96 V66 M162 96 V66 M184 96 V66 M206 96 V66 M228 96 V66 M250 96 V66" />
        <path d="M40 68 H258 M40 82 H258" />
      </g>
      {/* the two posts it flagged, promoted to object weight */}
      <g className="lb-dwg-l1">
        <path d="M118 96 V60 M140 96 V60" />
        <path d="M114 60 h30" />
      </g>
      {/* leader onto the flagged post */}
      <g className="lb-dwg-l0">
        <path d="M129 58 L192 38" />
      </g>
      <g className="lb-dwg-node">
        <rect x="125.5" y="55.5" width="7" height="7" />
      </g>
      <text className="lb-dwg-t" x="196" y="34">
        POST 14
      </text>
      <text className="lb-dwg-t" x="196" y="48">
        ROTTED
      </text>
      {/* timeline */}
      <g className="lb-dwg-l1">
        <path d="M34 128 H266" />
        <path d="M34 123v10M266 123v10" />
      </g>
      <g className="lb-dwg-node">
        <rect x="126" y="124.5" width="7" height="7" />
      </g>
      <text className="lb-dwg-t" x="34" y="147">
        HEARD
      </text>
      <text className="lb-dwg-t lb-dwg-t--end" x="266" y="147">
        01:47 / 04:12
      </text>
      <text className="lb-dwg-t lb-dwg-t--say" x="34" y="165">
        &ldquo;RUN THE WHOLE BACK LINE, CEDAR&rdquo;
      </text>
    </svg>
  );
}
