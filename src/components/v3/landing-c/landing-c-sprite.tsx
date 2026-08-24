/**
 * Landing C — drawn sprite.
 *
 * Every visual on this page is authored here as inline SVG rather than
 * generated as raster art. Two reasons, and they are the same reason:
 *
 *  1. A blueprint-language page is MADE of line weights. A drawing whose
 *     strokes are set by `landing-c.css` (`[data-lc-art]`, `data-lc-w`) shares
 *     its hairline / 1.5 / 2.5 vocabulary with the frames, rules and dividers
 *     around it. A raster would land as a foreign object with its own
 *     anti-aliasing, its own greys and its own idea of "thin".
 *  2. `stroke="currentColor"` means one drawing serves both grounds — blue on
 *     paper in the light bays, sky on ink inside the one dark band — with no
 *     second asset and no second export.
 *
 * Nothing here is decorative. Each figure states a capability the product
 * actually has, and the figures carry the numbers the copy claims, so the
 * page's arithmetic is checkable rather than atmospheric.
 */

/* ── BRAND ──────────────────────────────────────────────────────────────
   A drawing sheet seen from above: the sheet edge, the two layout lines that
   divide it, and a filled title block in the top-left pane. Geometric, no
   trade cliché, legible at 20px. */
export function LcMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" data-lc-art>
      <rect x="2" y="2" width="20" height="20" data-lc-w="bold" />
      <path d="M10 2 V22" data-lc-w="bold" />
      <path d="M2 14 H22" data-lc-w="bold" />
      <rect x="3.5" y="3.5" width="5" height="9" data-lc-fill fill="#1854a0" />
    </svg>
  );
}

/* ── UI ICONS ───────────────────────────────────────────────────────────── */
export function LcArrow() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" data-lc-glyph>
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}
export function LcPlay() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" data-lc-glyph>
      <path d="M8 5.5v13l10-6.5-10-6.5Z" />
    </svg>
  );
}
export function LcBurger({ open = false }: { open?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" data-lc-glyph>
      {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M3 7h18M3 12h18M3 17h18" />}
    </svg>
  );
}

/* ── BENEFIT GLYPHS ─────────────────────────────────────────────────────
   Drawn rather than pulled from lucide so the 2px round-cap weight is the
   page's own and cannot drift when the icon library changes. */
export const LC_GLYPHS = {
  proposal: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h4",
  pipeline: "M3 20V9h4v11M10 20V4h4v16M17 20v-7h4v7M2 20h20",
  calendar: "M4 6h16v15H4zM4 11h16M8 3v4M16 3v4M8 15h2M14 15h2",
  progress: "M2 9h20v6H2zM8 9v6M14 9v6M14 3.5v3.5",
  invoice: "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6M9 16h3",
  network: "M3.5 3.5h5v5h-5zM15.5 3.5h5v5h-5zM9.5 15.5h5v5h-5zM8.5 6h7M6.5 8.5L11 15.5M17.5 8.5L13 15.5",
} as const;

export function LcGlyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" data-lc-glyph>
      <path d={d} />
    </svg>
  );
}

/* ── HERO PLAN ──────────────────────────────────────────────────────────
   The deck the hero's estimate prices: house wall in poché, joists at 16" on
   centre, rim beam, stair run, perimeter posts, and the two dimensions the
   line items are computed from. 24'-0" × 20'-0" = 480 SF, which is exactly
   the decking quantity in the ledger beside it. */
export function LcPlanDrawing() {
  const joists = [];
  for (let x = 50; x <= 254; x += 22.7) joists.push(x);
  const posts = [];
  for (let x = 34; x <= 268; x += 33.4) posts.push(x);

  return (
    <svg viewBox="0 0 340 214" role="img" aria-label="Plan drawing of a 24 by 20 foot attached deck with stair run and perimeter posts" data-lc-art>
      {/* house wall — poché */}
      <rect x="30" y="18" width="240" height="9" data-lc-fill />
      <text x="30" y="13" data-lc-ghost>EXIST. WALL</text>

      {/* joists at 16" o.c. */}
      {joists.map((x) => (
        <path key={x} d={`M${x.toFixed(1)} 29 V145`} data-lc-w="hair" data-lc-ghost />
      ))}

      {/* deck outline + rim beam */}
      <rect x="30" y="27" width="240" height="120" data-lc-w="bold" />
      <path d="M30 145 H270" data-lc-w="bold" />

      {/* perimeter posts */}
      {posts.map((x) => (
        <rect key={x} x={x.toFixed(1)} y="141" width="7" height="7" data-lc-fill />
      ))}

      {/* stair run */}
      <path d="M186 147 V186 M262 147 V186" />
      <path d="M186 157 H262 M186 167 H262 M186 177 H262 M186 186 H262" data-lc-w="hair" />
      <text x="196" y="200">STAIR 4R</text>

      {/* dimension — width */}
      <path d="M30 168 V180 M158 168 V180" data-lc-w="hair" />
      <path d="M30 174 H62 M126 174 H158" data-lc-w="hair" />
      <text x="70" y="178">24&#39;-0&quot;</text>

      {/* dimension — depth */}
      <path d="M292 27 H304 M292 147 H304" data-lc-w="hair" />
      <path d="M298 27 V62 M298 112 V147" data-lc-w="hair" />
      <text x="298" y="92" transform="rotate(-90 298 92)" textAnchor="middle">20&#39;-0&quot;</text>

      {/* ledger key */}
      <text x="30" y="212" data-lc-ghost>DECK · 480 SF · DWG 01</text>
    </svg>
  );
}

/* ── STEP 01 · DESCRIBE ─────────────────────────────────────────────────── */
export function LcArtDescribe() {
  return (
    <svg viewBox="0 0 300 118" role="img" aria-label="A plain-English job description typed into a field" data-lc-art>
      <text x="2" y="9" data-lc-ghost>DESCRIBE THE JOB</text>
      <rect x="2" y="16" width="296" height="70" />
      <text x="12" y="36">NEW CEDAR FENCE, 214 LINEAR FEET,</text>
      <text x="12" y="52">6 FT BOARD-ON-BOARD, TWO GATES.</text>
      <text x="12" y="68">TEAR OUT THE OLD CHAIN LINK.</text>
      <rect x="204" y="60" width="2" height="11" data-lc-fill />
      <path d="M2 98 H68" data-lc-w="bold" />
      <text x="2" y="114" data-lc-ghost>OR RECORD A WALKTHROUGH</text>
    </svg>
  );
}

/* ── STEP 02 · PRICE ────────────────────────────────────────────────────── */
export function LcArtPrice() {
  const rows: [string, string][] = [
    ["CEDAR PICKETS · 214 LF", "3,210.00"],
    ["POSTS + CONCRETE · 28 EA", "1,092.00"],
    ["GATE HARDWARE · 2 SET", "318.00"],
    ["LABOR · 3 DAYS", "2,760.00"],
  ];
  return (
    <svg viewBox="0 0 300 118" role="img" aria-label="A line-itemed estimate with live retail material prices totalling 7,380 dollars" data-lc-art>
      <text x="2" y="9" data-lc-ghost>PRICED LINE BY LINE</text>
      {rows.map(([label, n], i) => {
        const y = 28 + i * 16;
        return (
          <g key={label}>
            <text x="2" y={y}>{label}</text>
            <text x="298" y={y} textAnchor="end">{n}</text>
            <path d={`M2 ${y + 5} H298`} data-lc-w="hair" data-lc-ghost />
          </g>
        );
      })}
      <path d="M2 100 H298" data-lc-w="bold" />
      <text x="2" y="114" data-lc-t="total">TOTAL</text>
      <text x="298" y="114" textAnchor="end" data-lc-t="total">7,380.00</text>
    </svg>
  );
}

/* ── STEP 03 · SEND ────────────────────────────────────────────────────
   Carries the page's only stamp. One is a signature; a page full of them is
   the furniture the brief asked to strip out. */
export function LcArtSend() {
  return (
    <svg viewBox="0 0 300 118" role="img" aria-label="The proposal open in a client portal, marked accepted" data-lc-art>
      <text x="2" y="9" data-lc-ghost>CLIENT PORTAL</text>
      <rect x="2" y="16" width="296" height="100" />
      <path d="M2 34 H298" />
      <circle cx="13" cy="25" r="2.5" data-lc-fill data-lc-ghost />
      <circle cx="22" cy="25" r="2.5" data-lc-fill data-lc-ghost />
      <text x="34" y="28" data-lc-ghost>PROPOSAL · CEDAR FENCE</text>
      <path d="M14 52 H150 M14 66 H190 M14 80 H120" data-lc-w="hair" data-lc-ghost />
      <path d="M14 100 H88" data-lc-w="bold" />
      <g transform="rotate(-5 232 74)">
        <rect x="186" y="58" width="92" height="32" data-lc-w="bold" />
        <text x="232" y="78" textAnchor="middle" data-lc-t="stamp">ACCEPTED</text>
      </g>
    </svg>
  );
}

/* ── TOOL · ROOF ────────────────────────────────────────────────────────
   Hip roof read off aerial imagery: footprint, ridge, four hips, one facet
   hatched, the capture crosshair on the north-west corner, and the numbers
   the estimator returns. */
export function LcArtRoof() {
  const hatch = [];
  for (let y = 34; y <= 136; y += 11) hatch.push(y);
  return (
    <svg viewBox="0 0 300 190" role="img" aria-label="Roof plan measured from aerial imagery: 2,140 square feet at a 6 in 12 pitch" data-lc-art>
      <g transform="translate(0 8)">
      <rect x="34" y="26" width="232" height="118" data-lc-w="bold" />
      <path d="M96 85 H204" data-lc-w="bold" />
      <path d="M34 26 L96 85 M266 26 L204 85 M34 144 L96 85 M266 144 L204 85" />
      <clipPath id="lc-roof-facet">
        <path d="M34 26 L96 85 L34 144 Z" />
      </clipPath>
      <g clipPath="url(#lc-roof-facet)">
        {hatch.map((y) => (
          <path key={y} d={`M34 ${y} H96`} data-lc-w="hair" data-lc-faint />
        ))}
      </g>

      {/* capture crosshair */}
      <circle cx="34" cy="26" r="9" data-lc-w="hair" data-lc-dash />
      <path d="M34 14 V38 M22 26 H46" data-lc-w="hair" />

      {/* pitch call-out */}
      <path d="M204 85 L232 85 L232 71" data-lc-w="hair" data-lc-dash />
      <text x="236" y="70">6:12</text>

      {/* dimension */}
      <path d="M34 158 V170 M266 158 V170" data-lc-w="hair" />
      <path d="M34 164 H118 M182 164 H266" data-lc-w="hair" />
      <text x="126" y="168">44&#39;-6&quot;</text>

      <rect x="34" y="2" width="82" height="16" data-lc-w="hair" />
      <text x="42" y="14">2,140 SF</text>
      </g>
    </svg>
  );
}

/* ── TOOL · FENCE ───────────────────────────────────────────────────────
   Parcel boundary with the street side identified and dropped, the three
   remaining runs drawn heavy with posts, and two gate swings. */
export function LcArtFence() {
  const posts: [number, number][] = [
    [30, 44], [30, 74], [30, 104], [33, 134],
    [70, 30], [112, 27], [154, 24], [196, 22], [238, 19],
    [258, 46], [262, 76], [266, 106],
  ];
  return (
    <svg viewBox="0 0 300 190" role="img" aria-label="Parcel boundary traced on a map: 214 linear feet of fence on three sides with two gates" data-lc-art>
      <g transform="translate(0 8)">
      {/* parcel */}
      <path d="M30 44 L258 18 L268 128 L38 148 Z" data-lc-w="hair" data-lc-dash data-lc-ghost />

      {/* fenced runs — heavy */}
      <path d="M30 44 L258 18" data-lc-w="bold" />
      <path d="M258 18 L268 128" data-lc-w="bold" />
      <path d="M30 44 L38 148" data-lc-w="bold" />

      {posts.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x - 2.5} y={y - 2.5} width="5" height="5" data-lc-fill />
      ))}

      {/* gates — a break plus the swing arc */}
      <path d="M148 24 A22 22 0 0 1 158 44" data-lc-w="hair" data-lc-dash />
      <path d="M148 24 L158 44" data-lc-w="hair" />
      <path d="M34 96 A20 20 0 0 1 54 104" data-lc-w="hair" data-lc-dash />
      <path d="M34 96 L54 104" data-lc-w="hair" />

      {/* street side */}
      <path d="M38 148 L268 128" data-lc-w="hair" data-lc-ghost />
      <path d="M40 158 L270 138" data-lc-w="hair" data-lc-ghost />
      <text x="120" y="172" data-lc-ghost>STREET — NOT FENCED</text>

      <rect x="30" y="2" width="60" height="16" data-lc-w="hair" />
      <text x="38" y="14">214 LF</text>
      <text x="200" y="60">2 GATES</text>
      </g>
    </svg>
  );
}

/* ── TOOL · VIDEO ───────────────────────────────────────────────────────
   The capability that is hardest to describe and easiest to draw: the frame,
   the scrub, and two timecoded lines of what the contractor SAID resolving
   into two line items. The arrow is the whole product in one glyph. */
export function LcArtVideo() {
  const bars = [];
  for (let i = 0; i < 46; i++) {
    const h = 3 + Math.abs(Math.sin(i * 1.27) * 9) + (i % 5 === 0 ? 3 : 0);
    bars.push({ x: 18 + i * 5.9, h });
  }
  return (
    <svg viewBox="0 0 300 190" role="img" aria-label="A job walkthrough video with timecoded speech resolving into estimate line items" data-lc-art>
      <rect x="16" y="8" width="268" height="80" />
      {/* what the camera sees */}
      <path d="M60 70 L60 44 L110 24 L160 44 L160 70" data-lc-w="hair" data-lc-ghost />
      <path d="M60 44 L110 24 L160 44" data-lc-w="hair" data-lc-ghost />
      <path d="M186 70 L186 38 L232 38 L232 70" data-lc-w="hair" data-lc-ghost />
      <path d="M30 70 H270" data-lc-w="hair" data-lc-ghost />
      <circle cx="28" cy="20" r="3.5" data-lc-fill />
      <text x="38" y="23">REC 00:47</text>

      {/* scrub + waveform */}
      <path d="M16 98 H284" data-lc-w="hair" />
      <rect x="136" y="92" width="3" height="12" data-lc-fill />
      {bars.map((b) => (
        <path key={b.x} d={`M${b.x.toFixed(1)} ${112 + (12 - b.h)} V124`} data-lc-w="hair" data-lc-ghost />
      ))}

      {/* transcript → line items */}
      <path d="M16 132 V182" data-lc-w="bold" />
      <text x="24" y="142">00:12  &quot;TWO LAYERS UP HERE&quot;</text>
      <text x="34" y="156" data-lc-ghost>&#8594; TEAR-OFF · 2 LAYERS · 2,140 SF</text>
      <text x="24" y="170">00:31  &quot;FLASHING&#39;S SHOT&quot;</text>
      <text x="34" y="182" data-lc-ghost>&#8594; STEP FLASHING · 34 LF</text>
    </svg>
  );
}
