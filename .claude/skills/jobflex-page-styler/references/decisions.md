# JobFlex — decisions and preferences (distilled from dashboard iterations)

This document is the compressed experience of ~30 rounds of revisions to the
reference dashboard. It complements design-system.md: that file has the tokens
and rules, this one has WHY they are the way they are, what the owner
rejected, and which pitfalls have already been stepped on. A new page built
from these two documents + the reference HTML should land on-taste on the
first try.

═══════════════════════════════════════════
HOW THE OWNER WORKS (process)
═══════════════════════════════════════════
- One self-contained HTML file per page: all styles in <style>, all JS in
  a single <script> at the end of body, icons as an SVG sprite
  <symbol>/<use>.
- Data is data-driven: JS arrays + renderer functions, NOT static list
  markup. When porting to Next.js the arrays are swapped for APIs.
- Fake data is realistic: a roofing/fence contractor from the Seattle area
  (Bothell, Kirkland, Redmond, Kenmore, Everett, Woodinville, Bellevue),
  amounts $1,600–$24,600, materials like "GAF Timberline HDZ", diverse
  client names (Alvarez, Nguyen, Okafor, Reyes, Kim...).
- When unsure about a design decision — do NOT ask in words; build 2–4
  variants stacked on the page, the owner picks, the losers get deleted.
  That's how the chart frame, the banner icon and the banner palette were
  chosen.
- Edits are surgical (the Edit tool with a unique old_string), never a full
  file rebuild. The string-uniqueness guard has saved the file more than
  once.
- After every batch: node --check on the extracted <script>, <div>/</div>
  and <svg>/</svg> balance, grep for accidentally deleted entities.

═══════════════════════════════════════════
TYPOGRAPHY — hard-won rules
═══════════════════════════════════════════
- Large numerals (KPIs, counters): Inter 800–900 + font-variant-numeric:
  tabular-nums, letter-spacing −0.005em. Do NOT compress further (−0.035em
  was rejected as "digits stuck together").
- JetBrains Mono weight 500–600 — ONLY the "drawing annotation" layer:
  chart axes, meta rows, date/time tags, ⌘K. Courier New was rejected:
  "hard to read, too harsh". Mono weight 700 is also too harsh — use 600.
- Chart axis labels: 13px/700 (10.5px was "hard to read").
- No redundant text: page subtitles, card subtitles that restate the
  heading, labels under KPI numerals — all of that is "cognitive noise" the
  owner deletes. Rule: if text adds no information to what is already
  visible, it should not exist.

═══════════════════════════════════════════
LAYOUT
═══════════════════════════════════════════
- Content: fixed margins 40px top / 96px sides / 80px bottom, NO max-width
  and no auto-centering. The 264px sidebar is a constant; when margins
  grow, the content shrinks, not the sidebar.
- Vertical rhythm: 22px gap between blocks, page-head + 14px below.
- The sidebar header height equals the topbar height via a shared token
  --topbar-h: 62px (otherwise their bottom border lines drift apart by
  subpixels — that was a bug).
- Card height synchronization — ONLY via explicit JS
  (cardB.style.height = cardA.offsetHeight), recomputed on resize/load.
  Pitfall: a flex container with a list inside a grid row inflates the row
  to the content's intrinsic size — "clever" CSS schemes broke here twice.
- Lists in cards: ≤4 records — a plain list; ≥5 — internal scroll with
  ~4 visible (height = bottom of the 4th row, measured for real); >10
  VISIBLE rows — an inline "Go to …" button as the LAST element inside the
  scroll (visible only after scrolling to the end; not a separate block,
  doesn't inflate the card). Count VISIBLE rows, not the whole dataset —
  that was a bug.

═══════════════════════════════════════════
SIDEBAR
═══════════════════════════════════════════
- Logo block: a flat black rectangle, the mark + "JOBFLEX / Contractor
  OS", subtitle in --sky. A blue square around the mark — rejected.
- Active item: NEVER a black fill (rejected as "really bad"). Instead, a
  sliding indicator: an absolute plate with a 1.5px ink border + a
  2px 2px 0 offset shadow, transition top/height 340ms with a soft
  overshoot. CRITICAL: the indicator needs z-index: 2 and background:
  transparent — otherwise the neighbor item's hover underlay paints over
  the shadow (that was a bug).
  Hover: .sb-link:hover:not(.active).
- At the bottom — a fixed (non-scrolling) block: a 32px avatar (blueprint,
  "I") + name/role + a 34×34 Settings button. There is NO
  Account/Subscription section in the navigation. Notifications (a bell
  with a sky dot) live in the topbar.
- There is NO dark theme and there will be none — it was removed on demand;
  do not bring it back.

═══════════════════════════════════════════
ICONS AND TERMINOLOGY
═══════════════════════════════════════════
- Style: line icons 24×24, stroke 2, currentColor, a <symbol> sprite.
  Base size 17px (sidebar), 15px (buttons/lists).
- Any mention of AI in the interface is FORBIDDEN. The feature is called
  "Smart Proposal". The icon is a hand-drawn "switched-on" lightbulb with
  5 rays (the i-bulb symbol in the reference — take it from there; the
  Tabler variant was rejected in favor of this one). In page-actions
  buttons icons are 20px (.page-actions .btn .ic).
- The topbar button is "New Estimate" (not New Proposal).
- Reviews — thumbs-up, not a star.

═══════════════════════════════════════════
CALENDAR (week strip)
═══════════════════════════════════════════
- "Today" is ALWAYS filled blueprint blue (background, white digits/dot).
- Another selected day — a 2px blueprint inset border + a blue digit.
- The seam between a filled cell and its neighbor is closed by repainting
  borders: .day.today { border-right-color: var(--blueprint) } +
  .day:has(+ .day.today) { border-right-color: var(--blueprint) };
  the outlined cell gets transparent neighboring borders. Without this
  there's a white gap (was a bug, with a screenshot).
- Clicking a day filters that day's event list; events are sorted by time;
  the row tag is the time (not the day). An empty day — a dashed note.
- The list height is fixed at 4 rows so the card doesn't jump when
  switching days.

═══════════════════════════════════════════
CHARTS
═══════════════════════════════════════════
- Points are SQUARES 10×10 (rect x-5 y-5), paper fill + 2.5 blueprint
  stroke. The current day (the dataset's last point) is filled blueprint BY
  DEFAULT; on hover the fill moves to the hovered point and returns when
  the cursor leaves.
- The hover layer is SMOOTH: the guide dashes and the tooltip are
  positioned via transform with a 180ms transition (x/cx attributes don't
  transition — transform only), show/hide via opacity 150ms. Tooltip:
  mono 13px, "TUE · $4,400", clamped to bounds, flips downward near the
  top edge.
- Peak annotation: 18px/700 mono, COMPUTED from the dataset maximum (not
  hardcoded), hides during hover, returns when the cursor leaves.
- The range filter WORKS: 7d/30d/90d datasets with their own yMax/ticks,
  redrawn with the draw animation. 90d — exactly 7-day steps between
  points; the last point of every dataset = "now" (buckets end today).
- Geometry: viewBox 860×332, plot 70..790 × 16..288 (symmetric 70/70
  margins — otherwise the chart looks "off-center"), a pale graph-paper
  pattern, 4 horizontal major lines, two 1.5px ink axes, NO vertical major
  lines (removed as noise). The chart is vertically centered in the card
  (card--chart: flex-column, chart-wrap flex:1 align-center).
- Drawing: stroke-dashoffset 850ms, points along the way, fill and peak
  after — this lives INSIDE the renderer (replays on filter change).
- The dropdown is custom (.dd), not a native select: a button with a
  rotating arrow, a menu with a 2px border and a 3px 3px 0 ink shadow.

═══════════════════════════════════════════
KANBAN (Lead Flow) — the interactive board reference
═══════════════════════════════════════════
- Columns in a single block (2px border, internal 1.5px dividers), column
  header: sky dot + caps label + live counter.
- ALL cards are visible; the board grows in height (a "+N more" limit
  existed and was rejected).
- Drag & drop: there is NO column highlight (rejected); instead, while
  dragging over another column a drop-slot smoothly expands at the bottom —
  a dashed blue slot with the height of the dragged card (measured on
  dragstart). The drop puts the lead at the end of the array → exactly
  where the slot is.
- Re-render ONLY the two affected columns, no animation on untouched
  cards; the moved card gets a "landing" (keyframe leadLand: a lift + a
  blue background flash, 450ms).
- If the slot pushed the board's bottom past the viewport — auto smooth
  scroll of .main until fully visible (setTimeout 230ms after the slot
  opens, with a check that the slot is still alive).

═══════════════════════════════════════════
STATUSES AND INFO BANNERS
═══════════════════════════════════════════
- A status has three tones: base / dark (hover) / soft (fill). The values
  are in design-system.md. Badge: 1.5px border in base + soft fill + caps.
- Info banner (the Lead Center pattern): warning palette, a 2px AMBER
  border (6px left edge), NO offset shadow, NO ink frame — a black frame
  clashed with the amber and was rejected. A 26px icon without a box.
  Background — the soft tone as a gradient layer over paper (opaque).
- Banner dismissal: a smooth collapse (height→0 + a negative margin eats
  the grid gap, transitionend → display:none), not an instant
  disappearance.

═══════════════════════════════════════════
MOTION (numbers beyond design-system.md)
═══════════════════════════════════════════
- The Balanced package is the standard; exact values and triggers are in
  design-system.md.
- Adaptive scroll-reveal: elements below the fold — 200ms delay, duration
  max(550, 900 − v·160) by scroll speed (slow ≈ 900ms, fast ≥ 550ms),
  rootMargin 60px. History: first it "lagged on fast scroll", then it was
  "too fast, can't see it" — the current formula is the balance point.
  The stagger cascade only applies to the initial screen.
- List rows animate via a MutationObserver on the container — the renderer
  knows nothing about motion.
- Reset inline delay/duration after transitionend, otherwise they slow
  down hover.
- prefers-reduced-motion: a global CSS kill + early returns in JS.

═══════════════════════════════════════════
ANTI-PATTERNS (explicitly rejected by the owner — do not propose again)
═══════════════════════════════════════════
- A black fill on the active sidebar item. Courier New. A blue square on
  the logo. Decorative mono indices next to KPIs. Labels under KPI
  numerals. A page subtitle. A stamp row at the bottom of the sheet. The
  PIPELINE kicker. A Calendar link in the This Week header. The
  "Who did what, just now" subtitle.
- A dark theme. Any "AI" words and the AI-lettering icon. Stars as icons.
- Round chart points. Vertical major grid lines. A double chart frame
  (card border + plot border). A hardcoded peak annotation.
- Kanban column highlight on dragover. A full board re-render on drop.
  A visible-card limit with "+N more". A "Go to" button as a separate
  block that inflates the card.
- An ink frame and shadow on the info banner. A box around the banner
  icon.
- max-width content centering. Stretching cards via align-items: stretch
  without JS height synchronization.


---

# Session 2 — the Proposals page: standards and pitfalls

## Fluid Scale (responsiveness; the module is mandatory)
- The reference composition = a **1728px** viewport (MacBook 16"). A module
  at the end of the script: `z = clamp(0.78, innerWidth/1728, 1.35)` →
  `documentElement.style.zoom = z`.
- **CRITICAL: zoom is incompatible with bare 100vh.** All viewport heights
  (layout, sb) only via `var(--app-h, 100vh)`; on every resize the module
  sets `--app-h = innerHeight/z + 'px'`. Breakage symptoms: content can't
  be scrolled to the end, the sidebar's bottom block disappears, nested
  scroll is dead.
- JS geometry of fixed elements (the "⋮" menu) divides
  innerWidth/innerHeight by z.
- React port: the same principle via rem tokens on the root font-size.

## Buttons
- **TRAP:** the shell's base `.btn` has `height: 40px`. Any compact variant
  (`btn--sm`) must set `height: auto` — otherwise stretch doesn't work and
  the "small" buttons secretly stay 40px and inflate the bars.
- **Stamp button** (primary actions — Mark completed, Send receipt): 1.5px
  ink border + 2px 2px 0 ink shadow, hover translate(-1,-1) + 3px shadow,
  active reset, `background-clip: padding-box` (otherwise a light-blue AA
  fringe on hover).
- **Cell button** (Remind in the row table): td padding 0, the button fills
  100% of the cell, border none, radius 0, hover = paper background +
  blueprint text. The button's borders are the table's own dividers. No
  "boxes in boxes".
- Quiet bar actions: transparent border, ink-soft text; on hover the ink
  outline and paper background appear. Request payment — `.btn--accent`.
- The bar's height is set by `min-height` on `.pjob-foot` (52px) with
  `padding: 0`; the inner spacing is carried by the left button group.

## Payments in the card (Accepted)
- **1–5 items → columns** `.pcols/.pcol` (value 19px/900 tabular, sub mono
  11px caps: "30% of total" / "due JUL 20").
- **6+ items → a row table** `.psched.psched--div`: label 13.5/700, mono due
  date, amount 15.5px on the right, Remind = a cell button; rows are low
  (td 6px 16px). The zone's beige background in both forms.
- Don't write a "fixed amount" sub: subs only for a percent or a due date.

## Lines
- Page tokens: `--hair: #0a0a0a`, `--hair-soft: rgba(10,10,10,0.55)`.
- Vertical **and** horizontal structural lines inside cards = **2px**
  (hair-soft), the same weight as the frame. 1.5px — only the rows of dense
  ledgers (All).
- **Never paint scrollbars with the --hair token**: thumb
  rgba(10,10,10,0.12), hover muted-faint (the reference's values, hardcoded
  as literals).
- Joints without fractions: don't overlap 2px onto 1.5px with negative
  margins — AA grows the line to ~3px. One shared line of one weight
  instead of overlaps.

## Card zoning (Accepted and Completed identically)
- White header (identity) → beige service strip (payments/stats) → white
  content (checklist/photos) → beige action bar.
- Card title: **20px/900 UPPERCASE, letter-spacing +0.02em** (don't
  compress).
- "Contract value" — a mono label **above** the amount; the amount 22px
  blueprint.
- `overflow: hidden` on the card — flush elements don't show gaps at the
  radius.

## Completed tear-sheet
- No kicker above the title.
- The stat strip uses **the same classes** `.pcols.pcols--sheet/.pcol` as
  in Accepted. Lesson: never create parallel style sets for identical
  blocks — the main source of typography drift.
- Checklist: green square checkboxes + dashed leaders `.pchk-lead`, amounts
  15.5px.
- Photo boxes "like the original": 180px, 1px dashed muted-faint,
  background rgba(10,10,10,.03), radius 4px, sans caps, lucide image-plus
  icon 20px.
- Footer: the input and both buttons **36px** tall; the "SEND PAID /
  RECEIPT TO" label wraps to 2 lines (max-width 96px) with a **zeroed
  margin-bottom** on `.kpi-lbl` — the inherited 9px skews the centering
  (a trap).

## The row "⋮" menu
- fixed, 254px, 2px border, 4px 4px 0 ink shadow; items: an icon in a 26px
  tonal box (`pmi--bp / --sky / --ok / --warn / --danger` / neutral),
  title + sub, dividers, disabled ("No address on client") and a danger
  item (Delete).
- Positioned at the button, clamped to the viewport **adjusted for zoom**;
  closes on outside click and on scroll.

## Statuses and filters
- **Sent** = the sky palette (sky border, rgba(74,158,255,.13) fill,
  blueprint text); **Viewed** = deep blueprint. Both are blue, instantly
  distinguishable.
- An active filter chip inherits its badge's tones (pure CSS via `data-f`).

## Icons
- In bars **18px** — exactly 3/4 of the 24 grid: stroke 2 renders as clean
  1.5px.
- Stroke is always 2: thickening it (2.4–2.5) at small sizes glues dense
  glyphs into mush. Fractional sizes (12.5, 17px) are forbidden.
- `shape-rendering: geometricPrecision` globally on svg.ic.
- Only original lucide paths (image-plus, package, rotate-ccw, etc.).

## Form scale along the funnel
- Density decreases toward the end: All — compact rows (td 11px 16px) →
  Accepted — medium-weight cards → Completed — large sheets (4px shadow).

## Section masthead
- One primary numeral per tab (46px/900 tabular; accent in All/Accepted,
  good in Completed) + a mono kicker with a short line + **exactly two**
  annotations (mono label + value 15px/800). Full width, a card frame with
  a shadow, a 320ms slide-in on tab change.
