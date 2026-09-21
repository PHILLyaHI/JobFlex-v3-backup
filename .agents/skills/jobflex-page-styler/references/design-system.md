# JOBFLEX — BLUEPRINT DESIGN SYSTEM (full specification)

Use everything below as the design context for any JobFlex work.

---

I'm working on JobFlex — a SaaS for contractors (roofing, fences, general
contractors) in the US. The product has an established design system in the
"blueprint / technical drawing" aesthetic. Below are all the current rules.
Follow them strictly when building any new page or component so everything
looks like one product.

═══════════════════════════════════════════
VISUAL LANGUAGE: "BLUEPRINT / TECHNICAL DRAWING"
═══════════════════════════════════════════
The aesthetic is a hybrid of Brutalist + Blueprint (architectural drawing /
graph paper). Hard frames, near-square corners, a grid in the background,
heavy typography, stamps. It should feel like an engineering drawing, not a
"soft" modern SaaS.

═══════════════════════════════════════════
PRODUCT CONTEXT (the strategy the visuals serve)
═══════════════════════════════════════════
Users: general contractors, remodelers and small-trade owners running
1–10 person shops. Every surface must survive three scenes:
- on a jobsite mid-task (direct sunlight, gloves, one-handed);
- at a desk at end-of-day (longer sessions, denser data is fine);
- standing in front of a homeowner (must look credible, cannot embarrass).

Accessibility commitments (hard constraints, not aspirations):
- WCAG 2.2 AA baseline (contrast, focus, keyboard, semantic structure).
- Outdoor-sunlight readability on top of AA — contractors work in glare.
- Touch targets ≥44px on mobile surfaces.
- prefers-reduced-motion respected everywhere (built into "Balanced").
- Light theme only. No dark mode.

Anti-references (refuse on sight — carried from the retired PRODUCT.md,
minus what the blueprint style deliberately overrides):
- Construction-app cliché: no hi-vis safety yellow, no hardhat icons, no
  hammer mascots, no jobsite-photo heroes, no orange CTAs. (The graph-paper
  grid and drawing language ARE the house style — engineering documents,
  not construction-site kitsch.)
- Generic SaaS-cream: no identical icon+heading+text card grids, no
  hero-metric template tiles, no marketing chrome bolted onto product UI.
- AI-startup purple-gradient: no purple-pink gradients, no sparkle icons,
  no glassmorphism, no Linear-clone dark. (Reinforces the no-AI-words
  rule — the feature is "Smart Proposal".)
- Consumer-cute: no mascots, no playful pastels, no gamified streaks, no
  oversized emoji.

Voice in copy: plain, confident, never breathless or marketing-buzzy. If
text adds no information to what is already visible, it should not exist.

═══════════════════════════════════════════
COLOR TOKENS
═══════════════════════════════════════════
Core:
  --color-ink:        #0a0a0a   (ink / near-black — text, frames)
  --color-paper:      #f2f0eb   (paper / cream — main background)
  --color-blueprint:  #1854a0   (blueprint blue — accent, drawing-cards)
  --color-sky:        #4a9eff   (sky blue — secondary accent, numerals)

Status colors (used ONLY for statuses, never for decoration).
Each status has tones like the Confirmed/Pending badges on the dashboard:
base (text/frame), dark (hover) and a soft fill (badge backgrounds):
  --color-success:      #3a7d44   (success, paid, confirmed)
  --color-success-dark: #2c6335   (hover for success links/buttons)
  --color-success-soft: rgba(58, 125, 68, 0.07)
  --color-warning:      #b88420   (waiting, pending, expiring)
  --color-warning-dark: #96691a   (hover for warning links/buttons)
  --color-warning-soft: rgba(184, 132, 32, 0.08)
  --color-danger:       #a83232   (overdue, error)
  --color-danger-soft:  rgba(168, 50, 50, 0.08)

Status badge pattern: 1.5px border in the base tone + soft-tone fill
+ text in the base tone (caps, 10px/800, letter-spacing 0.12em).
Informational message banners (e.g. Lead Center) use the warning palette
and NO ink frame: a 2px border in the base amber (6px left edge),
no offset shadow; a large 26px icon without a box; kicker/link in the base
tone, link hover in the dark tone; background — soft tone over paper.
Dismissal — a smooth height collapse together with the grid gap.

Distribution rule: ~80% neutrals (paper/ink) / ~15% blueprint /
~5% sky and status accents. Don't flood everything with blue — blueprint
is an accent.

═══════════════════════════════════════════
TYPOGRAPHY
═══════════════════════════════════════════
  --font-sans: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;

Rules:
- Headings: heavy weights (800–900), UPPERCASE, tight (compressed)
  letter-spacing.
- Large numerals (amounts, metrics): Inter 900 + font-variant-numeric:
  tabular-nums — digit columns align like an estimate sheet. Tracking on
  large numerals is slightly relaxed (-0.005em); do not compress further.
- Monospace (JetBrains Mono, weight 500–600) — ONLY the "drawing
  annotation" layer: chart axis labels, meta rows, date/time tags, ⌘K,
  technical numbers. NOT for large amounts.
- Body text: regular weight, readable.

Sizes (reference):
  --font-size-xs:   10px
  --font-size-sm:   12px
  --font-size-base: 16px
  --font-size-lg:   24px
  --font-size-xl:   48px
  --font-size-hero: 78px

═══════════════════════════════════════════
BORDERS, CORNERS, SPACING
═══════════════════════════════════════════
  --border-thin:  1.5px solid var(--color-ink);
  --border-thick: 2px solid var(--color-ink);   ← main borders are 2px
  --radius-sm:    2px    ← near-square corners everywhere (do NOT round much)
  --radius-md:    4px

Spacing (4px scale):
  --space-1: 4px   --space-2: 8px   --space-3: 16px
  --space-4: 24px  --space-5: 32px  --space-6: 48px

Content area of internal pages: fixed side margins (~96px), no
max-width centering — content stretches the full width.

═══════════════════════════════════════════
SIGNATURE ELEMENTS (visual devices)
═══════════════════════════════════════════
- Fine GRID background (graph paper) — especially on blueprint sections
  and drawing-cards.
- Black "STAMPS" — e.g. "APPROVED", inverse plates (white text on a
  black/blue background).
- "Kicker" / badges — small caps labels above headings (e.g.
  "● V1.3 — REBUILT FOR 2026", "LIVE ON JOBFLEX · DRAWING № 2847").
- Technical annotations as on a drawing: numbers, dimensions ("14'0\""),
  "DRAWING №".
- Line items as in an estimate: monospaced numerals on the right, thin
  dividers.
- Inverse sections: dark (ink/blueprint) blocks among light paper sections.
- SVG schematics directly in code (kitchen/roof plans) — not images but
  inline SVG with stroke="currentColor" so they can be tinted via CSS.
- Hard offset shadows with NO blur: cards 3px 3px 0 rgba(ink, .06);
  interactive hover — translate(-1px,-1px) + 2–3px 0 solid ink
  (an "imprint").
- Chart data points are SQUARES (not circles): paper fill + 2.5px
  blueprint stroke; the active point fills with blueprint.
- Empty states — a 1.5px dashed border, like a note on a drawing.

═══════════════════════════════════════════
MOTION SYSTEM — "BALANCED" (animation standard, package 02)
═══════════════════════════════════════════
The chosen motion standard for ALL pages. Motion is noticeable but
restrained: it explains causality and hierarchy; nothing moves "just
because". The character is draughtsman-like: lines get drawn, elements
settle into place, clicks press like a stamp. No soft blur shadows and no
springy bounces beyond a light overshoot.

Curves (tokens):
  --ease-out:    cubic-bezier(0.22, 0.61, 0.36, 1)   ← primary
  --ease-soft:   cubic-bezier(0.34, 1.2,  0.64, 1)   ← light overshoot (indicators)
  --ease-draw:   cubic-bezier(0.4,  0,    0.2,  1)   ← line drawing

Durations:
  micro (hover/press):  120–180ms
  UI (menus, rows):     250–350ms
  reveal on load:       420ms
  reveal on scroll:     550–900ms (adaptive to speed) + 200ms delay
  chart draw:           850ms

Triggers and patterns:
- PAGE LOAD: content blocks cascade in (opacity 0→1, translateY 14px→0,
  stagger 60ms); KPI/stage cells — left to right (dy 5px, stagger 45ms,
  160ms delay after the block); sidebar items cascade (dx -8px, 320ms,
  stagger 22ms).
- SCROLL REVEAL: .rv/.rv-in classes via IntersectionObserver (threshold 0,
  rootMargin 60px at the bottom — triggers just before entering the frame),
  fires once. Stagger delays — only for the blocks of the initial screen;
  elements below the fold get a 200ms delay and a duration adaptive to
  scroll speed: slow scroll ≈ 900ms, fast — never shorter than 550ms
  (dur = max(550, 900 − v·160), v in px/ms). Inline delay/duration are
  reset after transitionend so they don't slow down hover.
- LISTS: rows on every (re)render — fade + translateY 8px→0,
  300ms, stagger 45ms (MutationObserver on the list container).
- CHART: the line "draws itself" via stroke-dashoffset 850ms --ease-draw;
  points appear along the line; the fill and the peak annotation come after
  (~950ms). Changing the range filter replays the drawing. The hover layer
  (callout, tooltip, active point fill) moves smoothly: transform 180ms,
  opacity 150ms.
- SELECTION/SWITCHING: the sidebar active-item indicator slides
  (top/height 340ms --ease-soft); a calendar day — press-pulse
  (scale .94→1.02→1, 280ms); dropdown — fade + translateY(-6px) 180ms,
  the arrow rotates 180°.
- MICRO-INTERACTIONS: button hover — translate(-1px,-1px) + hard shadow
  (the system's base); click — press scale .97→1 (180ms); link arrows
  shift translate(2px,-2px); button icons scale 1.12 on hover;
  KPI numeral count-up 750ms (easeOutCubic, tabular-nums don't jump).
- PARALLAX: the background graph paper shifts by scrollTop × 0.06.
- ACCESSIBILITY: with prefers-reduced-motion ALL animations and transitions
  are disabled (a global media query + early return in JS).

═══════════════════════════════════════════
LANDING STRUCTURE (reference, blueprint style)
═══════════════════════════════════════════
Hero (split: left — paper with a large rotating headline "FULL PROPOSAL. IN 47
SEC.", Start Free / Watch Demo buttons; right — a blueprint-blue card with a
kitchen plan drawing and an estimate, an APPROVED stamp, TOTAL ESTIMATE)
→ black Marquee (ticker strip)
→ Estimators (dark section, 6 tool cards)
→ Feature Showcase (auto-carousel)
→ Testimonials
→ Pricing (2 plans)
→ FAQ
→ Footer
At the bottom of the hero — a metrics strip (TIME TO PROPOSAL 9 min /
CLOSE RATE +38% / BUILT FOR 70+ pros).

═══════════════════════════════════════════
DASHBOARD STRUCTURE (reference, blueprint style)
═══════════════════════════════════════════
Sidebar ~264px (a fixed block at the bottom: avatar/account name + Settings
button), main with a topbar (⌘K search, New Estimate button, notifications).
Content: Lead Center banner → page head (kicker + H1, actions Smart
Proposal / Manual proposal) → KPI strip (a single block, internal 1.5px
dividers, NO labels under the numerals) → Revenue Trend (interactive chart:
7/30/90-day filter, hover tooltip, peak = dataset maximum) + Recent Activity
(limit 10 records, internal scroll, height = chart height) → This Week
(clickable day strip; today is always filled blueprint; another selected
day — inset border; the selected day's events, sorted by time) +
Upcoming Jobs (sorted by date, today's items get a blue date plate; height =
This Week height, internal scroll) → Lead Flow — kanban: stage columns
with lead cards (name, job·city, amount, age), drag & drop between stages;
while dragging over another column an animated card-sized slot preview
expands at the bottom. All cards are visible; the board grows in height.

Terminology: no mention of AI anywhere in the interface — the feature is
called "Smart Proposal", its icon is a lightbulb.

List rules in cards: ≤4 records — a plain list; ≥5 — internal scroll
(~4 visible); >10 VISIBLE rows — an inline "Go to …" button as the last
list element (reachable by scrolling to the end).

Sidebar navigation map (the entire app structure):
- Work: Overview, Proposals, Clients, Leads, Projects, CRM
- Delivery: Calendar, Jobs, Workers, Hire, Company
- Money: Financials
- Automation: Smart Proposal, Roof estimator, Fence estimator, Phone,
  Messages, Announcements, Reviews, Trade board, Referrals, Reports
- Account is moved out of the navigation into the sidebar's bottom fixed block
Active item — 1.5px outline + 2px offset shadow (a sliding indicator),
NOT a black fill. The logo block is a flat black rectangle, without the
blue square.

═══════════════════════════════════════════
ARCHITECTURE (how to implement the system)
═══════════════════════════════════════════
Tokens are defined once in design-tokens.css (the :root variables above) and
used everywhere via var(). Change a token — the whole product changes.

Primitive components (reusable "bricks"):
  components/ui/     — Button, Card, Input, Badge, Heading, Stamp, BlueprintGrid
  components/layout/ — Nav, Footer, PageShell, HeroSection
  components/brand/  — JfLogo (SVG pinwheel/logo), ApprovedStamp
Icons: lucide-react. Logo and schematics: inline SVG components (not PNG).
No inline styles — tokens/CSS only.

Motion is implemented with the same tokens (--ease-*, durations) + utility
classes .rv/.rv-in/.rv-cell and helpers (reveal-observer, animateRows,
countUp, pressify) — one module for the whole app.

Principle: any new page (dashboard, pricing, settings, etc.) is assembled
from the SAME tokens and components as the landing — then everything looks
like one product, not a collection of different pages.

═══════════════════════════════════════════
CURRENT IMPLEMENTATION STATUS
═══════════════════════════════════════════
- Landing page — converted to the blueprint style (done).
- Dashboard / Overview — converted to blueprint + Motion System "Balanced"
  (done; interactive reference: jobflex-dashboard-blueprint.html).
- The remaining internal pages — still to be converted to this system,
  including animations.
The source of truth for visuals and motion is
`assets/jobflex-dashboard-blueprint.html` (built in the Claude sandbox).
It is the only reference file bundled with the skill; no other reference
files are attached.


---

## Fluid Scale — responsiveness

The composition reference is a **1728px** viewport (MacBook 16"). Every
page carries the FLUID SCALE module (in the reference shell): a root
`zoom = clamp(0.78, innerWidth/1728, 1.35)` scales the whole interface
proportionally — typography, components, spacing and the sidebar keep the
same ratios on any screen (at ≤860px zoom resets to 1 and the mobile
layout takes over: the sidebar becomes a slide-out drawer behind a burger
button with an overlay, density compacts, the kanban columns swipe
horizontally). Mandatory rule: **viewport heights only via
`var(--app-h, 100vh)`** — the module sets it to `innerHeight/zoom`; bare
`100vh` with zoom != 1 breaks scrolling and bottom-pinned blocks.
JS geometry of fixed elements divides window coordinates by zoom.
In a React port the same principle is implemented with rem tokens.

## Proposals page patterns

- **Masthead**: one numeral per tab (46px/900, accent/good) + a mono
  kicker + exactly two annotations; a card frame, full width, a 320ms
  slide-in.
- **Payments**: 1–5 items — `.pcols` columns; 6+ — a `.psched--div` row
  table with 2px verticals and low rows; Remind — a cell button.
- **Stamp button** for primary actions: 1.5px ink border + 2px 2px 0
  shadow, hover lift, `background-clip: padding-box`.
- **Card zoning**: white header → beige service strips → white content →
  beige bar. Titles 20px/900 caps +0.02em.
- **Line weights**: card frame 2px ink; internal structural lines
  (verticals and horizontals) 2px hair-soft; 1.5px — only the All ledger
  rows.
- **The "⋮" menu**: 254px, 4px shadow, icons in 26px tonal boxes
  (bp/sky/ok/warn/danger), disabled and danger items.
- **Statuses**: Sent — the sky palette, Viewed — deep blueprint; active
  filter chips inherit their badge tones via `data-f`.
- **Bar icons**: 18px (3/4 of the 24 grid), stroke 2, geometricPrecision.
- **Completed tear-sheet**: the same stat strip via `.pcols--sheet`
  classes, a checklist with dashed leaders, 180px/1px-dashed photo boxes,
  the footer on a single 36px axis.
