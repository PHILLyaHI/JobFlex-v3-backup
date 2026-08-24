// Landing A — drawn artwork.
//
// Every mark on this page is authored here as inline SVG rather than
// generated, photographed or imported from an icon set. Three reasons:
//
// 1. A blueprint-language page is a drawing. Raster art would have to imitate
//    line weight; SVG just *is* line weight, and it inherits the page's
//    tokens, so a palette change is still one file.
// 2. The stroke system is shared. Every path below is classed with one of the
//    `la-art-*` primitives declared in landing-a.css (ln / ln-2 / bp / dim /
//    node / lbl), so the roof plan, the fence run and a 22px benefit icon all
//    draw at the same weights. An imported icon set would break that.
// 3. Nothing here is decorative. The roof plan shows a real hip roof with
//    ridge and hips resolved; the fence run leaves the street side open
//    because the product does; the video frame shows the scrub bar and the
//    spoken line because that is what the estimator reads.
//
// Components are exported individually rather than as a <symbol> sprite: no
// document-global ids to collide with, and each drawing keeps its own
// viewBox. Every drawing is aria-hidden — the surrounding card carries the
// text, so a screen reader is not asked to interpret a diagram.

/* ── Brand mark ───────────────────────────────────────────────────────────
   A drafting sheet with its corner turned. The two blueprint bars are the
   line items on it. Not a monogram, not a house, not a tool. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 26 26" aria-hidden="true" focusable="false">
      <path
        d="M2 2h15l7 7v15H2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M17 2v7h7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M6.5 14h9M6.5 19h6" fill="none" stroke="#1854a0" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function BurgerIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {open ? (
        <path d="M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      ) : (
        <path d="M3 6h18M3 12h18M3 18h18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      )}
    </svg>
  );
}

/* ── Plate: roof ──────────────────────────────────────────────────────────
   Plan view of a hip roof. Perimeter is the surveyed object (heavy ink);
   ridge and hips are what the measurement resolved (light ink); every blue
   mark is derived data the tool added — extension lines, the running
   dimension, the pitch tag, the area. That split is the whole idea: ink is
   what is there, blue is what JobFlex worked out. */
export function RoofPlate() {
  return (
    <svg viewBox="0 0 320 178" aria-hidden="true" focusable="false">
      {/* facets, tinted by plane so the hips read */}
      <polygon className="la-art-face" points="40,30 280,30 220,84 100,84" />
      <polygon className="la-art-face-2" points="40,138 280,138 220,84 100,84" />
      <polygon className="la-art-face-2" points="40,30 100,84 40,138" />
      <polygon className="la-art-face" points="280,30 220,84 280,138" />

      {/* perimeter — the object */}
      <rect className="la-art-ln" x="40" y="30" width="240" height="108" />
      {/* ridge + hips — resolved geometry */}
      <path className="la-art-ln-2" d="M100 84h120M40 30l60 54M280 30l-60 54M40 138l60-54M280 138l-60-54" />

      {/* running dimension, bottom */}
      <path className="la-art-dim" d="M40 148v16M280 148v16" />
      <path className="la-art-bp" d="M40 160h240" strokeWidth="1" />
      <path className="la-art-bp" d="M44 156l-4 4 4 4M276 156l4 4-4 4" strokeWidth="1" fill="none" />
      <rect x="132" y="152" width="56" height="16" fill="#f2f0eb" />
      <text className="la-art-lbl la-art-lbl-bp" x="160" y="164" textAnchor="middle">
        48&apos;&ndash;0&quot;
      </text>

      {/* pitch tag on the right slope */}
      <path className="la-art-bp" d="M243 100h22l-22 11z" strokeWidth="1.2" />
      <text className="la-art-lbl la-art-lbl-bp" x="252" y="98">
        6/12
      </text>

      {/* area callout */}
      <circle className="la-art-node" cx="160" cy="84" r="3.5" />
      <path className="la-art-dim" d="M160 84 122 18" />
      <rect x="70" y="6" width="70" height="16" fill="#ffffff" stroke="#1854a0" strokeWidth="1" />
      <text className="la-art-lbl la-art-lbl-bp" x="105" y="17" textAnchor="middle">
        2,140 SF
      </text>
    </svg>
  );
}

/* ── Plate: fence ─────────────────────────────────────────────────────────
   A parcel with the fence run traced on three sides. The street side is left
   open on purpose — the product reads the road off the map and fences the
   rest, so drawing a fence across the driveway would be drawing a lie. */
export function FencePlate() {
  return (
    <svg viewBox="0 0 320 178" aria-hidden="true" focusable="false">
      {/* lot */}
      <polygon className="la-art-face" points="36,22 286,30 280,124 42,120" />
      <path className="la-art-ln-2" d="M36 22 286 30 280 124 42 120Z" strokeDasharray="5 4" />

      {/* fence run — heavy blue, three sides */}
      <path className="la-art-bp" d="M36 22 286 30 280 124" strokeWidth="2.6" />
      <path className="la-art-bp" d="M42 120 36 22" strokeWidth="2.6" />

      {/* gate: a break in the left run with its swing arc */}
      <path d="M40 84h4" stroke="#f2f0eb" strokeWidth="5" />
      <path className="la-art-ln-2" d="M41 72v12" />
      <path className="la-art-dim" d="M41 72a12 12 0 0 1 12 12" />

      {/* corner nodes */}
      <circle className="la-art-node" cx="36" cy="22" r="4" />
      <circle className="la-art-node" cx="286" cy="30" r="4" />
      <circle className="la-art-node" cx="280" cy="124" r="4" />
      <circle className="la-art-node" cx="42" cy="120" r="4" />

      {/* Segment lengths, lettered along each run. Every label sits on a
          knockout rect wide enough to clear its own glyphs — at 9px JetBrains
          Mono the advance is ~0.66em with the tracking, so an n-character
          label needs ~6n px of clearance or the run strikes through it. */}
      <rect x="138" y="14" width="46" height="15" fill="#f2f0eb" />
      <text className="la-art-lbl la-art-lbl-bp" x="161" y="25" textAnchor="middle">
        126&apos;
      </text>
      <text className="la-art-lbl la-art-lbl-bp" x="290" y="80">
        47&apos;
      </text>
      <text className="la-art-lbl la-art-lbl-bp" x="4" y="74">
        49&apos;
      </text>
      <text className="la-art-lbl" x="54" y="96">
        GATE 4&apos;
      </text>
      <text className="la-art-lbl" x="54" y="110">
        6 FT HIGH
      </text>

      {/* street — the side the run skips */}
      <rect x="0" y="146" width="320" height="26" className="la-art-face" />
      <path className="la-art-ln-2" d="M0 146h320M0 172h320" />
      <path className="la-art-dim" d="M0 159h320" strokeDasharray="10 8" />
      <rect x="104" y="151" width="112" height="16" fill="#f2f0eb" />
      <text className="la-art-lbl" x="160" y="162" textAnchor="middle">
        STREET &mdash; SKIPPED
      </text>
    </svg>
  );
}

/* ── Plate: video ─────────────────────────────────────────────────────────
   A frame from a walk-through with two things pinned on it and the spoken
   line under the scrubber. The point of the drawing is that the estimator
   reads BOTH tracks — what is on screen and what was said out loud. */
export function VideoPlate() {
  return (
    <svg viewBox="0 0 320 178" aria-hidden="true" focusable="false">
      {/* frame — the video ends at y=120, leaving the band below it for the
          scrubber and the spoken line. Those used to sit inside the frame and
          collided with the drawing. */}
      <rect className="la-art-ln" x="14" y="8" width="292" height="112" />

      {/* the scene: a deck in one-point perspective, drawn light */}
      <path className="la-art-ln-2" d="M14 80h292" />
      <path className="la-art-face" d="M52 120 118 80h96l72 40Z" />
      <path className="la-art-ln-2" d="M52 120 118 80h96l72 40M118 120l12-40M186 120l-6-40M250 120l-14-40" />
      {/* railing along the far edge */}
      <path className="la-art-bp" d="M118 80V56h96v24" strokeWidth="2.2" />
      <path className="la-art-ln-2" d="M118 66h96M142 56v24M166 56v24M190 56v24" />

      {/* pin 1 — what the footage showed */}
      <circle className="la-art-node" cx="166" cy="58" r="4.5" />
      <path className="la-art-dim" d="M166 58 214 38" />
      <rect x="206" y="30" width="88" height="15" fill="#ffffff" stroke="#1854a0" strokeWidth="1" />
      <text className="la-art-lbl la-art-lbl-bp" x="250" y="41" textAnchor="middle">
        RAILING 24 LF
      </text>

      {/* pin 2 — what the footage showed */}
      <circle className="la-art-node" cx="168" cy="102" r="4.5" />
      <path className="la-art-dim" d="M168 102 92 108" />
      <rect x="18" y="100" width="74" height="15" fill="#ffffff" stroke="#1854a0" strokeWidth="1" />
      <text className="la-art-lbl la-art-lbl-bp" x="55" y="111" textAnchor="middle">
        DECK 384 SF
      </text>

      {/* scrubber */}
      <path className="la-art-ln-2" d="M14 140h292" strokeWidth="3" stroke="#0a0a0a" opacity="0.14" />
      <path className="la-art-bp" d="M14 140h158" strokeWidth="3" />
      <circle className="la-art-node" cx="172" cy="140" r="5" />
      <text className="la-art-lbl" x="14" y="134">
        0:00
      </text>
      <text className="la-art-lbl" x="306" y="134" textAnchor="end">
        3:12
      </text>

      {/* the spoken track — kept short enough to stay inside the 320 viewBox */}
      <text className="la-art-lbl" x="14" y="166">
        1:47 &mdash; &ldquo;THE WHOLE RAIL IS ROTTED&rdquo;
      </text>
    </svg>
  );
}

/* ── Plate: live material pricing ─────────────────────────────────────────
   A price comparison drawn as a bar chart. Suppliers are labelled by distance
   only — naming stores here would be inventing a partnership we have not
   claimed. The mechanism is the honest part: same SKU, three nearby shelves,
   the cheapest in-stock one wins. */
export function MaterialsPlate() {
  const rows = [
    { d: "2.1 MI", p: "$56.98", w: 132, best: true },
    { d: "4.6 MI", p: "$59.40", w: 152, best: false },
    { d: "7.8 MI", p: "$63.15", w: 182, best: false },
  ];
  return (
    <svg viewBox="0 0 320 178" aria-hidden="true" focusable="false">
      <text className="la-art-lbl" x="4" y="12">
        ARCHITECTURAL SHINGLE &mdash; 30 YR &mdash; PER BUNDLE
      </text>
      <path className="la-art-ln-2" d="M4 20h312" />

      {rows.map((r, i) => {
        const y = 38 + i * 40;
        return (
          <g key={r.d}>
            <text className="la-art-lbl" x="4" y={y + 12}>
              {r.d}
            </text>
            <rect
              x="52"
              y={y}
              width={r.w}
              height="18"
              className={r.best ? "la-art-face-2" : "la-art-face"}
              stroke={r.best ? "#1854a0" : "rgba(10,10,10,0.2)"}
              strokeWidth={r.best ? 2 : 1}
            />
            <text
              className={`la-art-lbl${r.best ? " la-art-lbl-bp" : ""}`}
              x={58 + r.w}
              y={y + 13}
            >
              {r.p}
            </text>
            {r.best ? (
              <text className="la-art-lbl la-art-lbl-bp" x="52" y={y + 30}>
                IN STOCK &mdash; SELECTED
              </text>
            ) : null}
          </g>
        );
      })}

      <path className="la-art-ln-2" d="M4 158h312" />
      <text className="la-art-lbl" x="4" y="172">
        74 BUNDLES &mdash; PRICED AT THE JOB ADDRESS
      </text>
    </svg>
  );
}

/* ── Benefit icons ────────────────────────────────────────────────────────
   Drawn at the same 2px weight as the plates above so the whole page reads as
   one hand. Deliberately not an icon-set import. */
const ICON = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function BenefitIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    proposal: (
      <>
        <path {...ICON} d="M5 3h9l5 5v13H5z" />
        <path {...ICON} d="M14 3v5h5M9 13h6M9 17h4" />
      </>
    ),
    pipeline: (
      <>
        <path {...ICON} d="M3 5h18l-7 8v6l-4 2v-8z" />
      </>
    ),
    calendar: (
      <>
        <path {...ICON} d="M4 6h16v15H4zM4 11h16M8 3v5M16 3v5" />
      </>
    ),
    crew: (
      <>
        <path {...ICON} d="M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11ZM3 20a6 6 0 0 1 12 0" />
        <path {...ICON} d="M16.5 10.5a2.6 2.6 0 1 0 0-5.2M17 14.6a5.4 5.4 0 0 1 4 5.4" />
      </>
    ),
    jobs: (
      <>
        <path {...ICON} d="M4 5h16v14H4z" />
        <path {...ICON} d="M4 12h9M8 5v14" />
      </>
    ),
    invoice: (
      <>
        <path {...ICON} d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
        <path {...ICON} d="M12 7v8M14.2 8.6a2.4 2.4 0 0 0-4.4 1c0 2 4.4 1 4.4 3a2.4 2.4 0 0 1-4.4 1" />
      </>
    ),
    network: (
      <>
        <path {...ICON} d="M12 3.6a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2ZM5 15.2a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2ZM19 15.2a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Z" />
        <path {...ICON} d="M10.2 8.4 6.4 14.6M13.8 8.4l3.8 6.2M7.6 17.8h8.8" />
      </>
    ),
    clients: (
      <>
        <path {...ICON} d="M3 5h18v14H3z" />
        <path {...ICON} d="M8.5 12a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8ZM5.2 16.2a3.4 3.4 0 0 1 6.6 0M14.5 10h4M14.5 14h4" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ color: "#1854a0" }}>
      {paths[name]}
    </svg>
  );
}
