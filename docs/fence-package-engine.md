# Fence estimator — the package engine (2026-09-18)

Owner's ask: *"go to fence scan and add to job flex fence estimator same
type of fence and material calculations make smart check every thing look
closely and polish."* FenceScan is the owner's other app
(`~/Documents/FenceTrace`); its fence calculator is a real material takeoff
over a typed fence catalog. JobFlex's fence page priced a flat dollars-per-
foot rate per material with no bill of materials at all, and its convert
rebuilt the rate card from constants, so a rate the contractor edited on
the row moved the ticket but not the proposal.

## What holds now

**`src/lib/fence/` — the engine, pure and checked.** Ported from FenceScan
with the same rules and numbers, plus JobFlex's shapes.

- `catalog.ts` — 15 fence types (FenceScan's 14 plus composite privacy,
  which the page already offered): build spec (post stock and width,
  terminal stock, cap, concrete or gravel, rails, infill and its pitch),
  offered heights, post spacing, build kind (stick / panel / mesh / rail),
  rails per section by height, picket width and gap, national material and
  labor rates per LF at the default height, the walk-gate price, whether it
  stains, and the look the map and 3D render it as. `heightFactor`,
  `nearestHeight`, `TERRAIN_FACTOR` (flat 1 · gentle 1.18 · steep 1.4 ·
  rocky 1.55), the spacing rule (stick ≤ 8', mesh ≤ 12', panels and rails
  fixed).
- `takeoff.ts` — `computeFenceTakeoff`: sections per run, posts by kind
  (line / corner / end / two per gate), concrete from the hole actually dug
  (auger rule, frost-aware burial, minus the post), rails, pickets from the
  fabric length and the picket pitch (a taller fence uses longer pickets,
  not more; shadowbox both faces; horizontal boards by course), prefab
  panels per section, chain-link fabric, top rail, tension wire, bars,
  bands, cups, ties, caps per system, gate kits by width, hinge sets,
  stain by the square foot (two coats), tear-out, extended posts at
  steps, the post upgrade, crew-hours, post lengths.
- `slope.ts` — burial (a third of the height, never under 2', never above
  the frost line), racking limits, code-sized steps (≤ 1' each), wall-like
  drops, racked extra fabric, ground difficulty from the measured grade —
  fed by JobFlex's own per-segment terrain report.
- `market.ts` — FenceScan's tables: 51 states (labor and material indices,
  sales tax, whether labor is taxed, frost depth) and ~180 ZIP3 metros;
  `resolveMarket` from the site's state + ZIP or a formatted address.
- `rates.ts` — the shop's price book: sparse per-type overrides of
  material / lf, labor / lf and the walk gate; sanity limits; a value equal
  to the catalog is not stored.
- `pricing.ts` — `priceFencePackage`: the per-LF package (materials, with
  waste and the post-spacing share), professional installation (labor, with
  the terrain factor), gates priced continuously by width (4' walk = 1×,
  10' drive = 2.4×, arched +40 %, doors less), slope steps, the post
  upgrade, tear-out at the shop's rate, stain, and a $450 mobilization
  floor on a tiny job. **Every line carries its material and labor halves**
  so the proposal prints both and the org's markup lands on each.
  `jobRates`: the catalog rate scaled to the market unless the book sets
  it — a typed rate is the number charged. `fenceTiers` (Good / Better /
  Best held to the job's height; Good never out-prices Better),
  `fenceScope` (the client's sentences: the fence, the posts, the gates,
  the steps, the stain, the tear-out) and `fenceChecks` (the contractor's
  notes: a height the type does not offer, over 6', pool-code spacing,
  spacing off standard, steep ground, steps and post lengths, a wall-like
  drop, racked extra fabric, the holes and the concrete, a swing gate over
  12', tear-out longer than the fence, the job minimum, market-calibrated
  rates).
- `layout.ts` — the traced path → runs: a polyline with corners inside and
  ends at the tips, a ring with no ends, a gap starting a second fence;
  typed runs are one fence whose runs meet at corners.
- `catalogSchema.ts` — the org's saved book (rates, the shop's own types
  built like a catalog type, the tear-out rate, waste).

**The page** (`fence-estimator-blueprint`): the type list grouped by
family with a blurb and the all-in $/lf per type; the rate strip under a
row (material, labor, walk gate; Catalog to reset; blank = the catalog's
number, scaled to the market); "Add a type of your own" (name, built like,
its two rates); "Save as company defaults" → `FenceCatalog`; heights are
the type's; Site rows for tear-out (with its rate), stain (wood), posts
(steel / 6×6, wood), post spacing (stick and mesh), ground (auto from the
measured profile, or picked); the ticket's lines from the engine with a
Good / Better / Best strip anchored on the designed type and the notes
under it; a Material takeoff card (posts by kind, every part, post stock,
crew time); opening prices from the type at the height. The 3D scene and
the map render each type as one of the five looks.

**Full-screen stage** (owner's ask, same day): a Full screen button in the
map's zoom stack pins the stage card to the whole screen while tracing —
the browser's own full screen where it exists, a fixed overlay elsewhere
(iOS has no element full screen); the tools stay on top, the map or the 3D
view takes every remaining pixel, the trace controls and the hint sit
under it, safe-area insets respected. The same button or Escape leaves
(Escape defers to the surface while a run or a house is being traced), a
system exit unpins the overlay, and the map surface re-lays its tiles at
the same centre (`FenceDrawMapApi.resized`).

**Convert** writes the engine's lines with `materialCost` / `laborCost`
per unit (the org's markup on each half), the engine's scope, assumptions
with the takeoff summary and every warning, the job address, and the
state's sales tax from it (org default without a site).

## Data-layer changes

- New Prisma model `FenceCatalog` (`organizationId @unique`, `catalogJson`)
  — additive, created by the deploy's `prisma db push`; read in try/catch.
- New actions `getFenceCatalog` / `saveFenceCatalog` (`actions/fenceCatalog.ts`).
- `convertFenceEstimateToProposal` accepts `lines` (split per unit) and
  `address`; writes `Proposal.address` and the state's `taxRate`. The older
  `materials` / `labor` inputs still work for the legacy studio and AI form.

## Proof

`scripts/qa/fence-package.check.ts` (109 checks): the catalog, FenceScan's
canonical fixture (cedar 6', 100 LF + a walk gate: 13 sections, the posts,
pickets 230–260, concrete 2–3.5 bags a post, crew hours), runs as
polylines and rings, every family's BOM, the slope rules, the market
tables, the price book, package lines and their halves, gates continuous
by width, rates from catalog / market / book, tiers, scope and checks.
The existing fence suites (terrain, 3D ground, house, topo) are unchanged
and green. On the stand (no map key path): three typed runs price as one
fence with two corners to the dollar, the takeoff card counts 18 sections
and 19 posts, heights and options follow the type, the rate strip and a
type of the shop's own reprice the ticket, the company book saves, tiers
swap the type and Better brings the designed fence back, and Convert lands
a proposal whose lines carry the halves and whose subtotal is the ticket.
Phone 390: no clipping, no sideways scroll. The full-screen stage
(`adshoot/fence-full.js`, 20 checks): the stage fills the viewport with the
tools on top and the canvas taking the rest, the button and Escape leave,
the page still prices after the round trip — desktop and phone.

Not exercised on the stand: the traced-map path (no billable Google key
here), covered by `layout.ts` checks and the terrain suites.
