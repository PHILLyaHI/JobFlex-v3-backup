# Estimator hub + Manual builder — design

**Date:** 2026-07-30
**Status:** approved
**Surfaces:** `/dashboard/estimators`, `/dashboard/estimators/manual` (+ handheld twins)

## Problem

JobFlex has three estimating engines — Smart Proposal (`/dashboard/advanced-ai`), Roof
(`/dashboard/roof-estimator`) and Fence (`/dashboard/fence-estimator`) — each reachable only
as a separate sidebar item. There is no single place that answers "which estimator do I want,
and what does each one do", and there is no estimator at all for the trades that have no
geometry engine: you either use an AI flow or you leave the app.

Two pages close that:

1. **Estimator hub** — a picker for the available engines.
2. **Manual builder** — a hand-built line-item cost sheet with a price book, for any trade.

Desktop first, then handheld twins.

## Decisions taken during brainstorming

| Question | Decision |
| --- | --- |
| Is the list a picker or a ledger of saved estimates? | **Picker hub.** No saved-estimates ledger in this work. |
| What does the manual builder do? | **Line-item cost sheet as the spine, plus a price-book drawer.** Free-typed rows always allowed. |
| Routes and nav | **New "Estimators" hub with a child route.** Roof / Fence / Smart Proposal keep their own nav items *and* appear in the hub. |
| Builder scope | Estimate header, totals rail with markup + tax, save-as-template, convert-to-proposal — **all four in scope.** |
| Hub layout | **Spec-card grid.** |
| Builder layout | **Three zones: price book \| sheet \| totals rail.** |

## Architecture

Both pages follow the existing fleet convention: one `*-blueprint` component set per surface,
rendering only the donor `.content` children — the sidebar, topbar and sprite come from the
shared shell mounted in `src/app/dashboard/layout.tsx`.

```
src/components/v3/estimators-blueprint/
  estimators-content.tsx        hub markup; blocks are direct children of .content
  estimators-data.ts            ENGINES[] fixture
  estimators.module.css

src/components/v3/manual-builder-blueprint/
  manual-builder-content.tsx    three-zone workspace
  manual-builder-data.ts        PRICE_BOOK[], TEMPLATES[], seed sheet
  manual-builder-totals.ts      pure calc: subtotal -> markup -> tax -> contingency
  manual-builder.module.css

src/app/dashboard/estimators/page.tsx
src/app/dashboard/estimators/manual/page.tsx
```

Page shells match the fleet: `export const dynamic = "force-dynamic"`, `metadata`, an
`auth()` guard redirecting to `/auth/login?next=…`, and a single content component.

### Deliberate departure: React state, not a `*-behavior.ts` DOM port

Every existing blueprint page is a port of an authored HTML donor, so it drives the DOM
imperatively from a `*-behavior.ts` executed inside `useBlueprintContent`. These two pages
have **no donor**, and the builder is heavily stateful — rows, sections, recalc on every
keystroke. They are therefore built as idiomatic React with `useState`.

What is preserved from the fleet contract:

- Top-level blocks stay **direct children of `.content`**, because the shell's reveal cascade
  selects `.content > *`.
- Tokens, type scale, motion timings and interaction vocabulary are unchanged.

Totals math lives in `manual-builder-totals.ts` as pure functions so it is readable in
isolation and reused verbatim by the handheld twin.

### Navigation

`src/components/v3/blueprint-shell/nav-map.ts` gains one item at the top of the Automation
section:

```ts
{ label: "Estimators", icon: "i-ruler", href: "/dashboard/estimators" }
```

The child route `/dashboard/estimators/manual` lights the parent through the existing
longest-prefix match in `activeHref` — no change to that function. If `i-ruler` is not already
in the shell sprite, the symbol is added to the **shell** sprite, not a page-local one.

Handheld aliases are added to `SURFACE_ALIASES` in the same file:

```
"/mobile-estimators-v2"     -> "/dashboard/estimators"
"/mobile-manual-builder-v2" -> "/dashboard/estimators/manual"
```

## Page 1 — Estimator hub

**Header.** `ESTIMATORS` in Inter 900 caps; mono sub-line `4 ACTIVE · 3 QUEUED`.

**Body.** A spec-card grid, `repeat(auto-fill, minmax(280px, 1fr))` — 3-up at desktop width,
2-up at tablet, 1-up on phone, with no media queries.

**Active card** (Roof, Fence, Manual, Smart Proposal):

- Small inline-SVG blueprint diagram on graph-paper ground — roof planes, fence run with
  posts, a ruled sheet, a prose-to-sheet glyph.
- Caps title, mono method line (`satellite trace`, `map trace`, `line items`, `describe it`).
- A three-row mono spec table — `INPUT` / `OUTPUT` / `TYP. TIME` — in tabular numerals.
- Full-width `START ▸` button. The whole card is the click target.
- 2px ink border, `3px 3px 0` offset shadow. Hover/focus deepens the shadow to 4px and
  translates the card −1px: the fleet's existing lift, nothing new invented.

**Queued card** (Deck, Concrete, Paint): dashed 2px border, `--ink-faint` text, a `QUEUED`
mono tag, no button, not focusable. Honest placeholder, not a fake feature.

**Color.** Blueprint blue appears only on `START` buttons and the active diagrams. Everything
else is ink on paper — holding the ~80 / 15 / 5 neutral / blueprint / sky+status distribution.

## Page 2 — Manual builder

CSS grid, three zones: `280px 1fr 300px`.

### Left — price book

Sticky; collapsible to a 44px rail with the collapse state persisted in `localStorage`.
A search field, then accordion groups (Framing, Roofing, Concrete, Sitework); each item is a
row with a `+` that appends it to the active section. A second tab, **Templates**, inserts a
whole section at once.

### Centre — the sheet

An estimate header block first: client, project / address, `EST-1042`, date, trade tag,
valid-until — styled as a **drawing title block** (ruled boxes, mono labels), which is exactly
the annotation layer the design system calls for.

Below it, sections — Materials / Labor / Equipment / Other — each holding rows of
`description · qty · unit · unit cost · line total`. Inputs read as ruled paper rather than
boxed form fields: bottom rule only, blueprint-blue underline on focus. `+ ROW` per section,
`+ SECTION` at the end, drag-to-reorder within a section, per-row delete.

Empty state is a ruled blank sheet carrying the two add actions — no illustration.

### Right — totals rail

Sticky. Per-section subtotals, then global markup %, tax % and contingency % as inline mono
numeric fields, then a rule and the grand total at display size in tabular numerals.

Two actions below: `SAVE AS TEMPLATE` (secondary) and `CONVERT TO PROPOSAL ▸` (primary,
blueprint blue). Convert opens a **hand-rolled review sheet** in the house `.mdl` vocabulary —
no Radix, per the project rule — listing what carries over (sections, totals, header, terms)
behind a confirm.

Recalculation is synchronous on every keystroke. The changed total takes a one-shot 180ms
highlight so the movement is visible.

## Handheld twins

New pages under the `(mobile)` route group, registered in `HANDHELD_SURFACES` in
`src/components/v3/responsive-shell/responsive-dashboard-shell.tsx` so both URLs swap design
at ≤768px without a second address to remember:

```
src/app/(mobile)/mobile-estimators-v2/       -> /dashboard/estimators
src/app/(mobile)/mobile-manual-builder-v2/   -> /dashboard/estimators/manual
```

**Hub:** one card per row, full-bleed; the diagram shrinks, the spec table stays.

**Builder:**

- The sheet takes the full width.
- Totals become a **sticky bottom bar** — subtotal and grand total collapsed, tap to expand
  the full rail as a bottom sheet.
- The price book becomes a **bottom sheet**, opened from a `+ FROM BOOK` action.
- Row editing switches from a 5-column grid to a stacked 2-column card so numeric fields stay
  ≥44px, with a numeric keypad (`inputMode="decimal"`).
- Fluid scale through the existing `components/v3/fluid-scale.tsx`, holding 320px → 768px.
- Sticky bars pay out `env(safe-area-inset-bottom)`.

Page shells carry the fleet's handheld `viewport` export (`width=device-width`,
`initialScale: 1`, `maximumScale: 1`, `viewportFit: "cover"`, `themeColor: "#0a0a0a"`).

**Order of work: desktop is built and signed off before the handheld twins start.**

## Data and state

Fixtures only. No Prisma, no server actions, no API routes — the data layer is out of scope
per CLAUDE.md, and this matches how the rest of the blueprint fleet was signed off.

`CONVERT TO PROPOSAL` shows its review sheet and then routes to the existing proposal surface
**without persisting anything**. The file header comments say so plainly rather than implying
a working pipeline.

Builder state is component-local. Nothing is shared between the two pages.

## Guardrails

- Light mode only. No `.dark` variants.
- WCAG 2.2 AA contrast on every text pair, including the mono annotation layer at
  `--ink-muted`.
- Motion System "Balanced"; `prefers-reduced-motion` fully honored — the reveal cascade and
  the total-changed highlight both reduce to instant.
- Status color is used for status only (queued stubs, validation), never decoration.
- Touch targets ≥44px throughout, both surfaces.
- Keyboard: the sheet is fully tab-navigable; Enter on the last row appends a new row; Escape
  closes the book drawer and the convert sheet, returning focus to the trigger.
- Tokens are read from `globals.css` (`--paper`, `--ink`, `--ink-muted`, `--ink-faint`,
  `--r-*`, `--shadow-*`). No hardcoded color literals in components.

## Out of scope

- Any change to the Roof, Fence or Smart Proposal estimators.
- Any data-layer work — schema, server actions, API routes, persistence.
- A saved-estimates ledger. The hub is a picker; a ledger is a worthwhile later pass.
- Dark mode.
- Tests — no framework is installed and adding one needs approval.

## Verification

- `npm run typecheck` clean.
- `npm run lint` on the touched paths only (the repo has pre-existing lint failures elsewhere).
- Desktop reviewed at ≥1280px; handheld reviewed in the device toolbar at 320 / 375 / 414 /
  768px.
