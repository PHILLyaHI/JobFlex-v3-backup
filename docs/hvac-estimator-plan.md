> **2026-09-16, review pass.** Two review lenses (a contractor/inspector on the ledgers and checks; a contractor on a phone on the flow) and their fixes: furnace-only return check sized from the load; package-unit houses get a package unit; a condensing furnace on any job carries PVC vent, neutralizer, CO alarm and vent labor; an A2L coil on a kept furnace adds the detection kit and a listing check; tankless water heaters are wall-hung, sealed and sized in GPM; the gas check names the appliance and counts the other load; a ductless zone carries no duct loss; the furnace companion respects the blower (`maxTons`); duct jobs price insulation and never a return on a guess; service surfaces the R-22 rule and R-22 pricing; a heat-pump conversion reuses the condenser circuit; NEC count skips strips on dual fuel; HSPF2 floor checked; CO alarm / combustion air / garage / orphaned-flue flags. Flow: file pickers (not camera-only), Save/Convert under the subtotal and sticky on a phone, "start over?" before wiping the intake, the guide opens once on a desk, AI-off callout first, the dead end explained where it happens, no sideways pan at 390px, state/county selects only after the lookup, yes/no facts as not-seen/yes/no selects, one heat-preference select, "More" groups, tappable coverage rows, toasts that name what was filled, phone tables stack, water heater/service skip the lookup. Good · Better · Best strip prices the job three ways (tiers on catalog rows; starter ladders carry them). OpenStreetMap's Nominatim is the third geocoder when the Census one is down.
>
> **2026-09-16, later: the job comes first.** A job picker opens the page — full system, outdoor unit, furnace, add cooling, heat-pump conversion (dual fuel or all-electric), ductless zone, water heater, ductwork, service/repair (`src/lib/hvac/jobs.ts`). The job decides which intake sections show, what the engine selects (kinds per job; a furnace by heating output; a ductless zone by its own area), which checks run, and which lines the ledger writes. Water heaters are sized from the household with gas / circuit / vent checks (`waterHeater.ts`). Labor is priced **by the task against a measure** (per unit set, per ln ft of line set, per register, per lb) — never by the hour; saved v1 rate cards (hours × crew rate) convert on read (`normalizeRateCard`). QA: `hvac-jobs.check.ts` (45 checks).
>
> **Status 2026-09-16 — Milestones 1–5 built** (`/dashboard/hvac-estimator`; engine `src/lib/hvac/*`; actions `src/actions/hvacEstimator.ts`; tables `HvacEstimate`, `HvacCatalogItem`, `HvacSettings`). Site facts come from the assessor's parcel record (ReportAll `bldg_sqft`, `year_built`, `story_height`, `county_name`, building polygons via `return_buildings`) with the Census Bureau geocoder and the FCC block API as keyless fallbacks for the point and county; video walk with the filming guide; nameplate photo reading; typed confirmations with source badges; block load at the county design day; Manual S selection (2–3 systems when needed); duct/NEC/gas/refrigerant checks; rate-card ledger; Cool Calc permit-grade report (project + system + report pull, `COOLCALC_*` env; or a pasted report link) noted on the proposal; AHRI/NEEP directory import read by column meaning; the twenty-jobs calibration loop (record the actual quote per estimate, fit shown on the page). QA: `scripts/qa/hvac-{engine,intake,ledger,site,parcel,coolcalc,directory}.check.ts` (227 checks). House facts, by source order (2026-09-16): ReportAll parcel record → the county's own open-data layer where one exists (`src/lib/hvac/assessors.ts`, verified live 2026-09-16: King, Skagit, Whatcom, Clark — year built, living area, storeys; Thurston — year built only; Snohomish — year built and storeys for houses sold in the last few years. Pierce is referrer-locked and Kitsap's building table is licensed non-commercial, so both stay out) → Regrid's assessor record (`REGRID_API_KEY`; `yearbuilt`, `numstories`, `recrdareno`) → building outline × storeys → the walk. Snohomish and King publish no year built / living area on any public map service (their assessor rolls are bulk downloads without them), so there the answer is Regrid or the walk. Still open: a live Cool Calc account to run the client against (verified only against the public docs and a fake server), AHRI subscription for the full directory, a Regrid key on the server, and the twenty real jobs themselves.

# HVAC Estimator — Build Plan

Status: **PROPOSED 2026-09-15** (rev A). Nothing here is built. Decisions marked
"decide now" gate the schema and need the owner's word before code.

Written for: the developer who builds it and the owner who approves it.

---

## 0. The short version

Build the HVAC estimator the way the roof and fence estimators already work:
address first, the house measured before anyone types, a deterministic engine
that does the arithmetic, the shop's own rate card on every line, one ledger,
one proposal, the client portal. **Replacement and retrofit first.** Blueprint
intake for new construction is the second front door onto the same engine.

What is different from a generic "AI HVAC estimator": the model **reads and
narrates**; it never sizes, never picks equipment from memory, never recalls a
code value or a rebate. Those come from data with a source and a date, and the
contractor sees the source on every number.

JobFlex already has half of this. The owner's HVAC itemized-proposal method
(`src/lib/estimate/hvac-prompt.ts`, 2026-09-05) rides the Smart Proposal and the
video estimator today, and it is good: job type, the walk by phase, the trigger
rules (orphaned flue, return sizing, A2L line sets), assumptions with sources.
This plan keeps that method as the walk and moves everything numeric out of the
model and into an engine.

---

## 1. What is already in the repo, and what this plan reuses

| Exists today | Where | Reused as |
|---|---|---|
| HVAC proposal method (prompt), trade detection, phases | `lib/estimate/hvac-prompt.ts`, `trade-knowledge.ts` (id `hvac`), `legacy/specialties.ts` | The "walk": line reasoning, phase grouping, assumptions and field-verify lists |
| Smart Proposal pipeline: generate → refine → save → convert | `actions/advancedEstimator.ts`, `lib/estimatorSchema.ts` (`lineSchema`, `estimateSchema`), `AiEstimate` model, `estimatorUses` plan meter | Output contract (`GeneratedEstimate`), quota, proposal conversion |
| Video walkthrough reader with the HVAC reading addendum (nameplates, panel, ducts, flue, gas, line set) | `actions/videoEstimator.ts`, `lib/estimate/video-schema.ts` (measurement `confidence` + `source`) | One of the intake adapters; the `source: spoken / visual / inferred` idea becomes per-field provenance |
| Address → parcel → building footprints and heights → roads | `/api/parcels`, `actions/fenceBoundary.ts`, `mapProjection.buildingsToFootprints` | Conditioned footprint, storeys, wall orientations, neighbours |
| Roof measurement (area, pitch, facets, eave heights, existing material, building use) | `actions/roofMeasurement.ts`, `RoofMeasurement` | Attic and roof inputs: ceiling type, roof colour/material (Manual J roof absorptance), storeys from eave heights |
| Ground elevation lattice (USGS 3DEP) | `lib/elevationProfile.ts` | Site elevation (design conditions are elevation-adjusted) |
| Rate-card pattern: shop's editable rates, saved per session/org, catalog is the truth | `components/estimator/fence/fencePricing.ts`, roof `lib/roofPackage/catalog.ts` + package builder | HVAC rate card: labor tasks by hours, material assemblies, equipment price book |
| Markups, tax, proposal settings | `Organization.materialMarkupPct / laborMarkupPct / defaultTaxRate`, `proposalSettingsJson` | Sell price |
| Material price cache + retail lookup | `lib/priceCache.ts`, `ProductPriceCache` | Consumables (line set, PVC, pads, thermostats) |
| Jobs, change orders, expenses | `Job`, `JobExpense`, `ChangeOrder` | Estimate-versus-actual calibration loop |
| Estimator hub card roster | `components/v3/estimators-blueprint/estimators-data.ts` | New active engine card (catalogue no. 09; 05–07 are the printed queued stubs) |
| Blueprint design system, QA check-script convention | `DESIGN.md`, `scripts/qa/*.check.ts` | UI and verification |

Not in the repo: any load calculation, any equipment data, design temperatures,
code rules, rebate data, a nameplate decoder. Those are the work.

---

## 2. Facts verified 2026-09-15 that shape the plan

Each of these has a date; the data tables carry a `verifiedOn` for the same reason.

- **Federal 25C tax credit ended.** No credit for property placed in service
  after 2025-12-31 (Public Law 119-21). A 2026 install gets nothing federal.
  The prompt already says "do not assume 25C" — the rebate table must say
  *expired*, not omit it, or the model will be asked about it by the customer.
- **HEAR / HEEHRA state rebates** (income-qualified, up to $8,000 heat pump, ≤150%
  AMI) are live in some states (CA, MN, NY, WI, MA, CO as of mid-2026; others
  activating late 2026 into 2027). California single-family retrofit funds were
  fully reserved as of 2026-02-24 (waitlist). Status changes monthly → a table
  with per-state status and date, never a hard-coded sentence.
- **Refrigerant.** EPA's final rule (effective 2026-07-27) lets R-410A split
  systems manufactured or imported before 2025-01-01 be installed until supplies
  run out; **New York** bans R-410A installs since 2026-01-01. New equipment is
  R-454B or R-32 (A2L): higher pressures, leak detection, not a drop-in, line
  set usually new. Equipment records need `refrigerant` and a per-state install
  rule.
- **ACCA-approved load software** is a closed list (Wrightsoft, Elite, Adtek,
  EnergyGauge, Carmelsoft, Avenir, Cool Calc, Conduit, Amply, Zero Homes for
  Manual J; Wrightsoft, Elite, Adtek, Cool Calc, EnergyGauge for Manual D).
  ACCA: "if software is not listed, it is not ACCA-approved." Many
  jurisdictions (California by rule) want an approved Manual J with the permit.
  **Our own engine is estimating-grade unless we submit it to ACCA.**
- **Cool Calc has a REST API** (HTTP Basic, client id + API key;
  `dealers/{dealerId}/MJ8Projects`, `HVACSystems`, `MJ8Report`; "all of the
  functionality in the UI is exposed via the REST API") and an embeddable UI. Its
  site lists full API access on the Pro Plus plan ($250 per user per month);
  per-report pricing is quoted by third parties at $5–15. Confirm with Cool
  Calc before relying on either figure.
- **Design temperatures.** The ENERGY STAR *Design Temperature Limit Reference
  Guide* (2019 ed., 126 pp.) tabulates 1% cooling and 99% heating design
  temperatures **by state and county** for every state and territory, from the
  ASHRAE 2017 Handbook and Manual J 8th-edition design conditions. Free. Its
  method is conservative (highest cooling / lowest heating station within 40
  miles; cooling rounded up, heating rounded down), which is fine for an
  estimate; a permit-grade report uses the approved tool's own station.
- **Equipment data.** AHRI licenses its directory as bulk CSV with an optional
  API add-on for the Unitary package (fees on request; commercial use of the
  public site is prohibited). NEEP's cold-climate heat pump list (40,000+
  systems, capacity and COP at 47/17/5 °F) now takes its data through AHRI's
  process; it has no documented public API — ask NEEP for a feed. Manufacturer
  expanded-performance tables remain the ground truth for capacity at
  temperature.
- **Efficiency floor.** DOE regional SEER2 / EER2 / HSPF2 minimums since 2023
  (e.g. Southwest 14.3 SEER2 / 12.2 EER2). No newer federal change verified.

---

## 3. Architecture: one building model, two front doors, one engine

```
address ──► site facts (parcel, footprints, roof, elevation)
                  │
   ┌──────────────┼──────────────────────────┐
   │ retrofit intake            blueprint intake (later)
   │ guided questions, photos,  schedules + CF1R first,
   │ nameplate decode, video    assisted takeoff, geometry
   └──────────────┬──────────────────────────┘
                  ▼
          BUILDING MODEL  (per-field provenance: measured | read | default)
                  │
        ┌─────────┼──────────┬────────────┬──────────────┐
        ▼         ▼          ▼            ▼              ▼
   block load  equipment   duct +      code +        price
   (own, QA'd) match       electrical  rebates       (rate card)
   + approved  (AHRI/NEEP) checks      (tables)      + model's walk
   report                                            for line reasoning
        └─────────┴──────────┴────────────┴──────────────┘
                  ▼
        ledger → proposal → portal → job actuals → calibration
```

**Building model (decide now).** One object, stored as JSON on the estimate
row, with every field carrying `{ value, source, confidence }` where `source`
is `measured` (instrument, scan, plan dimension), `read` (photo, nameplate,
record), `stated` (contractor or customer said so) or `default` (era / state
table, with the table named). Rooms are an optional array; v1 runs a block
load on the whole envelope and fills rooms only when a scan or plan supplies
them. A remodel with an addition is then just rooms with different sources —
no project-level mode flag.

**Engine boundary.** The model (OpenAI, as configured) receives the building
model *and the engine's results* and writes the walk: job type and evidence,
per-line reasoning, assumptions, field-verify items, homeowner summary. It
returns the same quote-draft JSON the Smart Proposal uses. It is not allowed to
change a load, a capacity, a price basis, a code value or a rebate; a post-check
compares its lines to the engine's quantities and refuses the draft on drift.

---

## 4. The engine, piece by piece

### 4.1 Site facts (free, automatic)
From the address: parcel ring and area, building footprints with heights
(storeys), footprint edge orientations, roof area / pitch / material / eave
heights from the roof estimator when the address has a measurement, site
elevation, state and county. County → design conditions; state → code table,
rebate table, refrigerant rule.

### 4.2 Retrofit intake (the phone in the kitchen)
Twelve confirmations, most pre-filled: conditioned area and storeys (from the
footprint), year built (parcel record where present), ceiling height, window
share and type, insulation era, existing equipment (nameplate photo → decode),
fuel available, duct location and condition, return grille size, measured
total external static pressure (optional, encouraged), panel main amps and free
slots (photo), customer constraints (all-electric, keep gas, budget, noise).
The video estimator's HVAC reading addendum already extracts most of this from
a walkthrough; it becomes an adapter that pre-fills the same form.

### 4.3 Block load — our own, estimating grade
Manual J-style block load in TypeScript: envelope by orientation, window gain
by orientation and shading, era defaults for U-factor / SHGC / infiltration
(state and year-built tables with the source named), duct location and leakage,
occupants and internal gains, design temperatures and grains from the county
table, elevation adjustment. Output: heating BTU/h, cooling sensible + latent,
target airflow. Deterministic, `scripts/qa/hvac-load.check.ts` with published
worked examples, and a validation gate before launch: 20 real jobs run through
both this and an approved tool, target within ±10% on the block load. Loads are
rounded to 500 BTU/h; defaults show a range, not false precision.

### 4.4 Permit-grade report — buy, don't build (decide now)
When the job needs an approved Manual J (California, any jurisdiction that
asks, or the contractor wants the PDF for the customer), push the building
model to Cool Calc's REST API, read back per-room loads and the MJ8 report, and
attach the PDF to the proposal. Our block load stays the instant number; the
approved report is on demand and billed as a cost line or absorbed by plan.
Alternative if the partnership stalls: embed Cool Calc's UI in the estimator
page (documented pattern) or link out. Building our own to ACCA approval is
the fallback of last resort — months and fees.

### 4.5 Equipment selection (Manual S) and performance at temperature
- Catalog: start with the **shop's own list** ("the systems you install",
  imported from distributor price sheets as CSV with model, AHRI reference,
  cost). Platform-wide data comes second: AHRI unitary data under license,
  NEEP cold-climate performance, manufacturer expanded-performance tables for
  capacity at 47 / 17 / 5 °F.
- Rules (deterministic): cooling 90–115% of load (variable-capacity latitude
  per Manual S), heat pump capacity at the 99% design temperature versus the
  heating load with the balance point and backup strips sized, furnace output
  ≤140% of load, refrigerant allowed in the state, efficiency at or above the
  DOE regional floor, physical fit (clearances from photos) and the
  contractor's brand list.
- The trust screen: capacity-versus-outdoor-temperature chart with the balance
  point, side by side with the old unit decoded from the nameplate. This is the
  screen contractors judge the product by.

### 4.6 Duct and electrical checks (pure math, high trust)
- Ducts: target CFM (350–400 per ton, adjusted for climate humidity), return
  grille area rule, measured static versus the equipment's rated static, duct
  leakage class from condition photos. Says plainly when the existing ducts
  will not carry the new system, and prices the fix.
- Electrical: NEC 220.83 existing-dwelling load calculation from the panel
  photo and the new equipment's MCA → "fits", "new circuit", or "service
  upgrade allowance" as an optional line with a warning. Gas: pipe size versus
  BTU input for a furnace change.

### 4.7 Code and money tables (data, dated)
- One normalized requirement set per state and climate zone with two resolvers:
  *what did this alteration trigger* (retrofit) and *does this design comply*
  (new construction). v1 covers the rules the prompt already names: California
  Title 24 HERS tests and heat-pump baseline, Washington and Oregon ventilation
  and duct testing, Florida wind and product approval, the federal efficiency
  floor, the refrigerant install rule, and every jurisdiction's "approved Manual
  J required" flag.
- Rebates and credits: per-state HEAR status with date, utility programs added
  per metro as they are confirmed, federal 25C recorded as **expired** with the
  date so the customer's question has an answer. Every row has `verifiedOn`
  and a source URL; the proposal prints "as of <date>".
- Utility rates for 15-year cost of ownership: EIA state averages, dated.

### 4.8 Pricing
Labor tasks with crew hours from the walk (each phase's items map to task
codes), material assemblies per task, equipment cost from the shop's price
book, permits and tests from a per-jurisdiction table, markups and tax from the
organization. The model supplies a *typical local range* only where the shop
has no price, labelled as an estimate — the same rule the roof builder follows.
Calibration: when a job closes, its expenses and change orders feed back into
hours per task for that shop.

---

## 5. Data layer (needs approval per CLAUDE.md)

New models, SQLite-safe (JSON-as-string, checked strings, no enums), all
org-scoped:

- `HvacEstimate` — address, site facts JSON, building model JSON (with
  provenance), engine results JSON (load, selection, checks), the quote draft,
  `approvedReportUrl`, `approvedReportSource`, status, `createdById`.
- `HvacCatalogItem` — org-scoped equipment: kind (outdoor / indoor / furnace /
  coil / water heater / ductless), brand, model, AHRI ref, refrigerant, nominal
  tons / BTU input, SEER2 / EER2 / HSPF2 / AFUE, capacity at 47/17/5 °F when
  known, cost, `source` (shop CSV | AHRI | NEEP), `verifiedOn`.
- `HvacRateCard` — labor task hours and rates, material assemblies, permit and
  test fees, per org (or a JSON blob on `Organization` like the other settings
  pages, if simpler).
- Static data shipped in the repo, not the DB, with `verifiedOn`: design
  conditions by county, era defaults by state, code requirement set, rebate
  status by state, utility rates by state.

Server actions: `hvacSiteFacts`, `hvacRunEngine` (load + selection + checks,
pure and testable), `hvacDraftWalk` (the model call), `hvacApprovedReport`
(Cool Calc), `convertHvacEstimateToProposal`. Same gates as the other
estimators: `requireEstimatorOrManager`, plan feature, `estimatorUses` meter.

---

## 6. Surfaces

- Estimator hub: an active **HVAC** card (catalogue 09, method "measure the
  house"), route `/dashboard/hvac-estimator`, blueprint design system.
- The page mirrors the roof estimator: **facts hero** (design conditions with
  source and date, conditioned area, storeys, existing system decoded), the
  **intake card** (twelve confirmations, photo slots, measured fields), the
  **design card** (load, selected system, capacity-at-temperature chart, duct
  and electrical checks with pass / fix / verify), the **ledger** (every line
  editable, rates saved), then Convert to proposal → portal.
- Per-field badges: measured · read from photo · stated · default (table
  named). No global accuracy score anywhere.
- Mobile first (≤768 px): the intake is the field screen; photos come from the
  camera; the chart and ledger stack.

---

## 7. Milestones

Rough developer effort; each milestone ships and is usable on its own.

1. **Replacement estimator, one system, single zone** (3–4 weeks). Site facts,
   intake with nameplate decode, own block load with QA script, shop catalog
   from CSV, Manual S rules, ledger, proposal, hub card. Validation gate on 20
   real jobs before it leaves the owner's org.
2. **Trust layer** (2 weeks). Design-condition and era tables with sources,
   capacity-at-temperature chart, duct and electrical checks, per-field badges,
   assumptions and field-verify into the proposal.
3. **Approved report** (1–2 weeks after the Cool Calc agreement). Push, read
   back, attach PDF, "permit-ready" flag on the proposal.
4. **Money and code tables** (2 weeks, then ongoing upkeep). Rebates by state
   with dates, utility rates, code requirement set with both resolvers,
   refrigerant rule per state.
5. **Video and voice adapters** (1 week). The existing walkthrough reader and
   the phone flow pre-fill the intake.
6. **Blueprint intake, stage one** (3 weeks). Sheet classification, equipment
   schedule and CF1R extraction into the building model with `source: plan`.
7. **Assisted takeoff** (4–6 weeks). Vector PDF rooms and windows proposed on
   an overlay, contractor confirms; scale verified two ways; area check against
   the title block.
8. **Duct routing** (later). Only once the rest earns its keep.

---

## 8. Decide now

| Decision | Recommendation | Why it gates |
|---|---|---|
| Permit-grade calc | Cool Calc API for the approved report; own engine for the instant number | Determines whether we spend months on ACCA approval |
| Equipment data | Shop CSV first; AHRI license when 5+ shops need the full directory; ask NEEP for a feed | Licensing cost and the catalog schema |
| Building model provenance | Per-field `{value, source, confidence}`, rooms optional | Schema; blueprint mode later depends on it |
| Where rebate and code data live | Repo tables with `verifiedOn`, reviewed monthly | Someone owns the upkeep or the numbers rot |
| Model role | Narrates and walks; never computes; drift check refuses the draft | The trust story |
| First market | The owner's own shops and states (WA, then CA for HERS) | Which code table ships first |

---

## 9. What we will not do

- Present a global accuracy percentage.
- Let the model recall design temperatures, code values, credits or prices.
- Scrape the AHRI directory (prohibited for commercial use).
- Call the output an engineered or stamped design; "Manual J-based" until an
  approved report is attached.
- Start with blueprint parsing.

## Status — US catalog (2026-09-16)

`src/lib/hvac/data/usFamilies.ts` holds 106 equipment families (479 rows once
expanded by `usCatalog.ts`): the current-production AC, heat-pump (incl. the
cold-climate ENERGY STAR families), furnace, ductless, air-handler, coil and
water-heater lines of Goodman, Carrier, Trane, Lennox, Rheem, York, Bosch,
Mitsubishi, Daikin, Gree, MrCool, LG, A.O. Smith, Bradford White, Rinnai and
Navien, as read from manufacturer / distributor pages that day (78 of 106
verified on the page; the rest carry a note saying where the figure came
from). Ratings are the families' headline "up to" figures; heat-pump
capacities at 17 / 5 °F are the read share or the rule-of-thumb share, so
the AHRI / NEEP import still replaces them for a matched system. Shop cost
is empty on purpose: the rate card prices by tier until the shop fills the
`cost` column. The Catalog panel has **Load the US catalog** (two SQL
statements, ~0.4 s), **Download CSV** (the current catalog as the import
sheet) and the CSV import with Replace. Companion picks (furnace, coil, air
handler) now prefer the outdoor unit's brand, then its sales tier, so a Good
condenser gets the 80% furnace and a Best one the modulating furnace from the
same maker. QA: `scripts/qa/hvac-catalog.check.ts` (45 checks).

Not in the catalog: multi-zone ductless outdoor units and package units
(no ratings read), Fujitsu (Halcyon RLS3 retired, Orion figures not
published yet), non-condensing tankless. Re-verify the families after the
2026 model year turns over.

## Sources checked 2026-09-15

ACCA approved software list (acca.org/standards/approved-software); Cool Calc
developer docs (docs.coolcalc.com/developer-docs); EPA R-410A final rule as
reported by NAHB (2026-05) and ACCA; IRS / P.L. 119-21 coverage of 25C's end;
HEAR state program pages (CEC, WA Commerce, NH DOE) and 2026 status trackers;
ENERGY STAR Design Temperature Limit Reference Guide (2019 ed.); AHRI Data
Subscription Program page; NEEP ccASHP list (ashp.neep.org); DOE consumer
central AC and heat pump standards page.
