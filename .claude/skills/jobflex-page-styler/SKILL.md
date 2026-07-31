---
name: jobflex-page-styler
description: Build or restyle any JobFlex page (Proposals, Clients, Leads, Projects, CRM, Calendar, Jobs, Workers, Hire, Company, Financials, Smart Proposal, Roof/Fence estimator, Phone, Messages, Announcements, Reviews, Trade board, Referrals, Reports, Settings, landing sections) in the established Blueprint design system, one-shot, matching the reference dashboard pixel-for-pixel in tokens, typography, motion and interaction patterns. Use this skill whenever the user asks to design, redesign, restyle, "переведи в blueprint", "сделай страницу", "apply the design md", or mentions making any JobFlex page/screen/component look like the dashboard — even if they don't say "skill" or "design system". Also use it for tweaks to existing JobFlex blueprint pages so changes stay on-system.
---

# JobFlex Page Styler

Builds a JobFlex page in the house blueprint system in one shot — the same
system as the reference dashboard, with all of the owner's preferences
earned through iteration. Goal: zero repeat rounds of "wrong font, wrong
frame, wrong animation".

## Mandatory steps before writing code

1. Read `references/design-system.md` — tokens, palette (including the
   3-tone status colors), typography, Motion System "Balanced", page
   structure and terminology.
2. Read `references/decisions.md` — WHY the rules are what they are: the
   process, hard-won fixes, exact numbers, and the list of anti-patterns
   the owner has already rejected. Violating an anti-pattern = a
   guaranteed redo. **Session 3 at the end of that file is the highest-value
   section for work on a LIVE page**: eleven traps that each shipped as a
   bug and were re-reported on several different pages before the cause was
   found. Read it before touching an existing page, not after.
3. Open `assets/jobflex-dashboard-blueprint.html` — the source of truth.
   It is not "an example for inspiration"; it is a code donor.
4. **Only if the page lives under `src/app/(mobile)/mobile-*-v2/`** — read
   `references/handheld.md`. The handheld fleet is ~22 separate pages with
   their own shell and their own token blocks, not the desktop pages
   shrunk, so the "Responsiveness" section below does not describe them.
   That file carries the traps that have actually cost time there: the
   `:where()` reset (a plain `.app button` silently deletes the border and
   background off every button rule in the file), the 320px topbar width
   budget, and the fact that tokens are declared per page so one token is a
   22-file edit. Skip it entirely for desktop work.

## Assembling a page

**Reuse the shell verbatim; do not rewrite it from scratch.** Copy from the
reference HTML as-is:
- the entire `<head>` (Inter + JetBrains Mono fonts, the whole `:root`
  token block, base/reset, layout, sidebar, topbar, cards, lists, chips,
  dropdown, motion CSS);
- the SVG icon sprite (add new `<symbol>`s in the same line style —
  24×24 / stroke 2 / currentColor);
- the sidebar markup (the full navigation map) and the topbar — only the
  `active` class moves to the current page's item (the indicator follows
  on its own);
- the JS helpers: the motion module (reveal with adaptive scroll, cascades,
  MutationObserver row stagger, countUp, pressify, parallax), the sliding
  sidebar indicator, the dropdown, the list-limit logic, card height
  synchronization, banner collapse, the mobile nav drawer, the FLUID SCALE
  module. The kanban and the chart — when the page has analogous blocks.

**Design the page content** from its meaning in the navigation map
(design-system.md → "Sidebar navigation map") and the dashboard patterns:
kicker + H1 in caps + actions on the right; the KPI strip as a single block
with no labels under the numerals; cards with card-head; lists by the
≤4 / scroll / inline-button-at->10-visible rule; estimate-style tables with
mono numerals on the right; statuses only through the 3-tone tokens. Data —
JS arrays with realistic contractor texture from the Seattle area (see
decisions.md). Ask the owner a question only when the page's composition is
genuinely ambiguous — and then one question, not a survey.

If a contested visual decision comes up along the way — don't ask in words:
build 2–3 variants stacked on the page; the owner will pick.

## Pre-delivery checks (mandatory)

Python is NOT installed in this environment — checks run on Node only.
`$SCRATCH` = the current session's scratchpad directory.

```bash
node -e '
const fs = require("fs");
const [file, out] = process.argv.slice(1);
const s = fs.readFileSync(file, "utf8");
const n = (t) => s.split(t).length - 1;
for (const [a, b] of [["<div","</div>"], ["<svg","</svg>"], ["<table","</table>"],
                      ["<button","</button>"], ["<section","</section>"], ["<tr","</tr>"]])
  if (n(a) !== n(b)) throw new Error("balance: " + a);
// Courier is legitimate ONLY as the system fallback of the mono font stack
const c = n("Courier");
if (c !== 0 && !(c === 1 && s.includes("\x27Courier New\x27, monospace")))
  throw new Error("Courier misuse");
for (const bad of ["data-theme", "i-sparkles", "select-wrap",
                   "Draft with AI", "New Proposal"])
  if (s.includes(bad)) throw new Error("forbidden: " + bad);
const m = [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const js = m[m.length - 1][1];
// Dead shell CSS (stage-board etc.) is NORMAL. Look for dashboard leftovers in JS only:
for (const leftover of ["renderWeek", "renderChart", "renderBoard",
                        "weekEvents", "jobsData", "leadsData", "chartDatasets"])
  if (js.includes(leftover)) throw new Error("dashboard leftover in js: " + leftover);
// Responsiveness: the mobile layer must be last in the cascade
const mob = s.lastIndexOf("@media (max-width: 860px)");
const styleEnd = s.lastIndexOf("</style>");
if (mob === -1) throw new Error("mobile layer missing");
if (mob < styleEnd - 20000) throw new Error("mobile layer not at end of <style>");
if (!s.includes("var(--app-h") || !js.includes("FLUID SCALE"))
  throw new Error("fluid scale missing");
fs.writeFileSync(out, js);
console.log("structure OK");
' "<file>" "$SCRATCH/page.js"
node --check "$SCRATCH/page.js" && echo "js OK"
```

(`align-items: stretch` is forbidden in grid rows of variable-height
cards — heights there are synchronized by JS; in card flex bars
(.pjob-foot) stretch is legitimate and needed for full-height buttons.)

## Responsiveness — a mandatory part of every page

The reference shell carries the **FLUID SCALE** module. Rules without which
the page will break (details and symptoms — in decisions.md):

1. **The composition reference is a 1728px viewport.** `zoom = clamp(0.78, w/1728, 1.35)`
   on desktop; at `w <= 860` the zoom is forced to 1 (native mobile mode).
2. **Viewport heights only via `var(--app-h, 100vh)`.** The module sets
   `--app-h = innerHeight / zoom`. A bare `100vh` at zoom != 1 kills scrolling
   and any bottom-pinned blocks.
3. **Breakpoints go by effective width, not by media.** The module puts the
   classes `eff-1280` / `eff-1000` on `<html>` (`innerWidth / zoom`); rules for
   the mid-size layouts are written as `html.eff-1280 .grid-23 { ... }`. Plain
   `@media` for those ranges is forbidden — otherwise zoom and media fire at
   the same time and the composition drifts.
4. **The mobile layer (`@media (max-width: 860px)`) goes AT THE VERY END of
   `<style>`, after all of the page's CSS.** Otherwise the page's later rules
   override it at equal specificity, and part of the responsive behavior
   silently fails to apply.
5. **Grids are intrinsic, not breakpoint-driven:**
   `grid-template-columns: repeat(auto-fit, minmax(190px, 1fr))` for the KPIs,
   the payment columns, and card bodies. Then the tablet range needs no
   separate rules and nothing spills out of a card.
6. **Any new node inside `.layout`** (an overlay drawer, a toast hint) MUST
   have a base `display: none` outside media queries and `display: block`
   inside the mobile block. Otherwise on desktop it takes a grid column and
   pushes `.main` off-screen (this trap has fired twice).
7. **JS geometry for fixed elements** (context menus) divides window
   coordinates by the current zoom; after a scale change the module calls
   `layoutSync()` itself, and `layoutSync` does not equalize heights when the
   grids are collapsed (`eff-1280`).

Mobile mode (<= 860px) turns on by default: a sidebar drawer with a burger
and an overlay, a compact topbar (the button shrinks to an icon at <= 520px),
header buttons in 2 columns with text wrapping, KPIs 2x2, lists with a fixed
height and internal scrolling, tables without horizontal scrolling (hide the
secondary columns + `table-layout: fixed`), a kanban as vertical sections
where cards move on tap, and a palette half a shade cooler
(`--paper: #f6f5f1`) — warm paper reads yellower on phones.

## Delivery

- Mock: `$SCRATCH/jobflex-<page>-blueprint.html` — one self-contained
  HTML file, written with the Write tool. Give the full path in the
  reply: the file opens directly in a browser. There is no
  `present_files` tool here.
- Port into the app (after the mock is approved):
  `src/app/v3/(dashboard)/<page>/` — `page.tsx` + a scoped
  `<page>.module.css`, as already done for `dashboard-v2`. Since
  2026-07-23 the app-level tokens (`src/app/globals.css` +
  `tailwind.config.ts`) are blueprint too (`--paper`/`--ink`/`--accent`
  names, blueprint values) — reuse them; keep page-specific vocabulary
  (grid patterns, drawing annotations) in the page's CSS module.
- In the reply: what was assembled, which blocks came from the reference,
  which data is faked, which spots to look at first. Briefly.
- Follow-up edits are surgical (the Edit tool, a unique `old_string`),
  with the checks re-run.
- If the page introduced a NEW reusable pattern — offer the owner to
  codify it in design-system.md.

## Editing a LIVE page (not a mock)

The 22 blueprint pages are shipped and imperative: a `*-content.tsx`
renders static markup once, a `*-behavior.ts` fills the `#id` regions and
owns every event. Some markup is built as HTML STRINGS inside the behavior
module — always check both places before concluding a control does not
exist.

Before writing a line, check whether a shared module already does it.
Re-deriving one of these is a bug, not a variant:

    blueprint-shell/mdl-motion      openMdl / closeMdl / MDL_EXIT_MS
    blueprint-shell/list-motion     staggerIn / leaveRow
    blueprint-shell/places-suggest  Google Places on a plain <input>
    blueprint-shell/react-island    mountIsland (React inside a DOM page)
    blueprint-shell/nav-map         NAV_SECTIONS — the ONE nav truth
    lib/scrollLock                  lockScroll
    blueprint-global.css            .bp-sel, .bp-sug, the .mdl enter/exit

Three rules that account for most of the bugs found on live pages:

1. **Never attach a MutationObserver to replay a row stagger.** It fires on
   every render, so a filter, a keystroke or a selection replays the whole
   list's entrance and the owner reports that the list wiped itself.
2. **Never hand-roll `document.body.style.overflow`.** Nested locks poison
   each other and the page stays locked until a reload.
3. **A repaint is not a re-render.** When only ONE thing changed — a
   selection, a toggle, a count — patch that node in place. Rebuilding a
   container's `innerHTML` destroys the element the user just interacted
   with, steals focus from it, and replays every entrance animation inside.

Verification: the dashboard routes are auth-gated and dev.db has no seeded
login, so a page CANNOT be rendered locally. `tsc --noEmit`, eslint on the
touched dirs, and a postcss parse of every changed stylesheet is the whole
gate. Report "not visually confirmed" plainly — do not imply an appearance
was checked when it was not.
