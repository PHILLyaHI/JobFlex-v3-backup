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

**What goes outside (2026-09-16, after the owner's first run on jobflex.app).**
On the Outdoor unit and Full system jobs a strip above Good / Better / Best
offers both kinds priced as the whole job at their Better tier — "Air
conditioner · like for like" and "Heat pump · dual fuel, the furnace stays
as backup" (or "+ air handler, all-electric" on a full system). It sets
`runEngine({ outdoorKind })`; the engine returns `dualFuel`, the ledger reads
it (dual-fuel thermostat, no strips, circuit-reuse rule, title "Dual-fuel heat
pump (outdoor swap)"), and the draft keeps the choice. The editable lines' reset
key now includes line names: a catalog swap that kept the size and the price
used to leave "Starter" names in the estimate.

**All-jobs sweep (2026-09-16, owner's ask "check all hvac sections").**
One checker per job (engine + ledger + the page on the local stand) and a
skeptic per finding. Confirmed and fixed: an AC pairs with the furnace or
air handler that stays whatever the fuel (add cooling on an electric
furnace, an outdoor swap on an all-electric house); the kept furnace's
blower is checked against the coil (fix when its input says it cannot carry
the tons, verify when the plate is unknown; the same for a kept air handler
and for a new furnace under an existing coil); "Already has cooling" on an
add; duct-insulation and no-ducts checks on an add; checks and tier prices
follow the picked unit (`runEngine({ pick })`, `tiersFor(…, rerun)`); a
heat pump on an all-electric house gets a heat-pump thermostat; a
same-refrigerant swap prices a heat-pump-rated coil and says so; a like-for-
like heat pump on a dual-fuel house buys no thermostat; a heat-pump house
defaults to a heat pump; the strip only offers a kind the engine can take;
the all-electric conversion runs a 240 V circuit for the air handler and
strip kit, caps the gas drop and checks the orphaned water-heater vent;
cold-climate rows derate below 5 °F; a furnace under a coil is picked for
the coil's tons; a no-gas house prices no gas lines and says a service is
needed; furnaces are priced on output so Good is not dearer than Better; the
B-vent kit has its own price; furnaces get their own floor flag and no
drain parts unless something condenses; a swap reuses the breaker (no
free-slot warning); the A2L check names the air handler when that is what
stays; ductless: one head is the catalog pair, several heads are a
multi-zone outdoor unit from the rate card plus heads, the zone target
starts at 0.5 t, the zone is loaded with its own people and no kitchen
allowance, the hero shows the zone, mini-split words on the lines, no EPA
608 line, an efficiency floor check; ductwork: replaced runs come insulated,
no ducts is a new duct system (trunk lot + runs + permit), a static fix
prices the return, one design airflow (tons × CFM/ton), WA/OR/CA duct
flags on the job; service: any priced line can be converted, the
refrigerant check is a service rule (R-22 reclaimed, R-410A free, A2L
tools, "not identified" when blank), scope keeps the task's case, no load
notes or permit card; water heater: never a smaller unit than the plan (the
note names the catalog's largest), electric→gas adds the gas branch and a
full vent, gas→electric caps the drop, a heat-pump tank is electric and
unvented, a like-for-like electric swap reuses its circuit, the scope keeps
the maker's name; full system: each furnace on a zoned house is sized to its own
zone, the gas branch is checked against the furnace the ledger will set (and
the upsizing priced), a blower-driven oversized furnace carries a Manual S
note and a verify check, a package house with no package rows is priced from
the rate card's package default with the gas connection, the curb and no line
set, and a coil or air handler is never paired across refrigerants (a
cross-brand match is worded as one). QA: hvac-jobs.check.ts 119 checks; the
suite is 413.

**Changing the unit (2026-09-17, owner's ask).** The design card carries a
"Change the unit" panel: every catalog unit that fits (best first, with how it
lands against the load), every unit the engine ruled out with its reason and a
"Use anyway", and a form for a unit the catalog does not have. `runEngine`
takes `pick` (any candidate, ruled out included — it returns
`SelectionCandidate.overridden` and the engine adds a fix check naming the
rule) and `custom` (a typed row that joins the catalog for the run, marked
`CatalogItem.typed`, priced from its cost, with a verify check to confirm it
against the submittal). `saveHvacCatalogItem` turns a typed unit into a
permanent row. The water-heater job picks through `LedgerOptions.pick` and
says so when the picked tank is under the sized gallons. Both the pick and the
typed unit ride in the draft. Catalog rows can also carry `states` /
`notStates` / `availabilityNote`, and `evaluateItem` rules out a unit that is
not sold or not permitted in the house's state — the panel then shows it with
its reason and the contractor can still override. The Furnace job on a house
with no gas now picks an air handler with a heat kit sized to the load
("Electric furnace replacement"), with no gas, vent, neutralizer or CO-alarm
lines.

**Package units and the state layer (2026-09-17, owner's ask).** The catalog
gained 18 package families (114 rows: gas/electric, package heat pump and
straight cool from Goodman, Carrier, Trane, Rheem, York and Lennox, all in
their current R-454B / R-32 model numbers — the old GPG / 48VL / 4YCC / RQPM
numbers are dead) and 8 California ultra-low-NOx furnace families (Lennox
NV/NE, Carrier 59SU5 / 59CU5, Goodman -U). 629 rows in all.

A row now carries where it may be sold (`states` / `notStates` /
`availabilityNote`) and what its gas section is certified to (`noxNgJ`).
`ultraLowNoxNeeded(state, county)` reads the county, not the state line: in
the 21 counties of the South Coast, San Joaquin Valley and Bay Area districts
a 40 ng/J furnace is ruled out with the reason and the ultra-low build is
offered instead; elsewhere in California it stays on the list with a note.
`coastalSite(state, county)` does the same for salt air, so Dallas is not told
about coastal coils. Single-package units answer to the national floor
(13.4 SEER2 / 11.0 EER2, 6.7 HSPF2, enforced by date of manufacture), not the
regional split-system rule — that was ruling every package out in California.
The Southwest EER2 floor was corrected to 11.7 / 11.2 with the 9.8 fallback
for a unit certified at 15.2 SEER2 or better.

CODE_FLAGS gained the state rules that survived an adversarial check (87 of
108 claims kept): California's ultra-low NOx, ECC verification of charge and
duct leakage, the electric-resistance-primary limit, the CARB 750 GWP cap and
the CF1R/CF2R/CF3R paperwork; Washington's Manual J+S sizing, supplementary
heat lockout, ENERGY STAR thermostat and the 750 GWP cap; Oregon's minor-label
limit and R-8 duct rule; Florida's install-enforced Southeast minimum, wind
tie-down and condensate float switch; the Texas TDLR licence; New York's
sizing-on-the-permit. Each carries its citation and verified date. The state
and county selects now reach the model, so correcting them changes the rules,
not just the design day.

**Intake, reorganised (2026-09-17, owner's ask).** The filming guide is folded
by default and remembers the choice (`jf.hvac.guideOpen`), saving about 560 px
on a desk and 1,260 px on a phone. The Confirm form is now two labelled
groups: **The house as it is** (tinted, dark rule — the envelope, the existing
system, the panel, the ducts and gas, the water heater that is there) and
**What we're putting in** (blueprint rule — the zone and heads, the new water
heater, the service visit, the heat preference, noise and line-set length).
Inside the house group the secondary fieldsets fold, each summary carrying
what it already holds ("AC + furnace · 3.5 t · R-410A", "200 A main · 4 free
slots", "in the attic · fair · 700 sq in return · ¾ in gas"), so the page
shows the figures without opening. A coverage button opens the fold its field
lives in, focuses it and scrolls to it. The intake is 1,066 px on a desk and
2,838 px on a phone, down from 1,340 and 4,408.

**Every job looks the house up (2026-09-17, owner's report).** The water-heater
and service jobs used to skip the parcel lookup for speed and say "no lookup
needed", which read as "address not found". They now put the form up at once
on the address and the state and run `hvacSiteFacts` behind it; when the
record lands the site hero shows the area, year built and county, and a
failed record becomes a warning rather than an error. The button reads "Look
up the house" on every job.

**Water heater, by brand (2026-09-17, owner's report).** The water-heater job
picked a tank in the ledger but never showed it on the card, and the makers
sat folded in "Change the unit". The card now names the picked tank (maker,
model, gallons, UEF, vent, where it came from) and a strip above it offers one
tank per maker that fits the sized plan (`waterHeaterOptions` in ledger.ts:
smallest at or above the gallons or the tankless input, vent-compatible, the
engine's pick first), each priced as the whole job; a tile says when its price
is a rate-card default because the row has no cost. Changing the fuel or the
type drops the pick, the ledger ignores a pick of another kind of appliance,
and the swap list shows only this job's kind.

**Service menu (2026-09-17, owner's ask).** The service job was a text box,
a refrigerant count and three part slots. `src/lib/hvac/serviceMenu.ts` now
carries 42 tasks in eight groups — tune-ups, refrigerant, electrical parts,
gas furnace, coils/drains/airflow, refrigeration parts, thermostats, ductless,
water heater — each with what it covers, typical 2026 shop labor, the part at a
typical shop cost and the makers a supply house stocks (Mars, Genteq, Honeywell,
Sporlan, Copeland, Ecobee…). `serviceMenuFor(model)` shows only what fits the
system on record (no furnace group on a heat pump, no blower motors on a
ductless), suggests the right tune-up, and opens with the words for an R-22 or
a 15-year-old system. The page is a grid of tick tiles; a tune-up carries the
diagnostic, a recharge takes the pounds, and "Not listed? Add it" takes a
task with labor and part — "Add to this estimate" or "Save to my menu", which
puts it on the rate card (`HvacRateCard.serviceMenu`, via
`saveHvacServiceTask`) so it is there next time. The ledger prices every line
as "typical — edit to your rate"; the older free-text estimates still price.

Not in the catalog: multi-zone ductless outdoor units
(no ratings read), Fujitsu (Halcyon RLS3 retired, Orion figures not
published yet), non-condensing tankless. Re-verify the families after the
2026 model year turns over.

## Status — the Danville furnace that found nothing (2026-09-17)

Owner ran a Furnace job at 24 Mira Loma Ln, Danville (Contra Costa) on
jobflex.app and got NO FIT with every Carrier 58SB0 "not certified to
14 ng/J". Cause: the shop's catalog on prod was loaded from the US list
*before* the California ultra-low-NOx families and the package units were
added (deploy 557d670). A load writes rows into `HvacCatalogItem`; a later
deploy does not touch them, so the older rows sat there with no `noxNgJ`,
which the district rule reads as the 40 ng/J class — and Contra Costa takes
only 14. Locally the same house against the current list picks a Goodman
GR9S96-040-U.

Built so it cannot happen quietly again:

- **The page knows the catalog is from an older build.** `usStale` compares
  the shop's `us-…` rows with `US_CATALOG` (missing ids, or gas rows with no
  NOx class). The Catalog panel's summary line reads "· update available" and
  the panel carries an update notice with the counts.
- **The no-fit call says what the wall is.** `noxWall`: every candidate is a
  gas unit above 14 ng/J in a "required" county. The call then says so in
  words, and carries an **Update the US catalog** button right there (same
  `loadUsCatalog`, `replace: false`, the shop's own rows stay); with a shop's
  own catalog it says to type the ULN model under Change the unit or put 14 in
  the CSV. The package-house no-fit gets the same button when the catalog
  predates the package rows.
- **The NOx compliance check reads the unit and the county**
  (`complianceChecks`): pass naming the unit and its class in a required
  county; fix naming a 40 ng/J unit used anyway; verify for the other
  California counties (their own districts) and when the county is not on
  record.
- **The NOx class can be typed and imported:** `noxNgJ` column on the catalog
  CSV (download and import), and a "NOx class (gas heat)" select on the
  typed-unit form (`buildTypedUnit`).

QA: `hvac-catalog.check.ts` +4 (pass/fix/verify wording, and the
older-catalog wall), `hvac-ledger.check.ts` +1 (CSV NOx column). Browser:
`hvac-stale.js` (older catalog → no-fit words → one click → GR9S96-040-U) and
`hvac-typed-nox.js` (typed 14 ng/J passes, typed 40 flagged by name). On prod
the owner presses **Update the US catalog** once (from the no-fit call or the
Catalog panel) — 629 rows.

## Status — the full inspection (2026-09-17)

Owner asked for "check inspection of entire hvac estimator and logic". Five
reviewers walked it in parallel — the load calculation, selection and
checks, the ledger, the catalog and rule data, the page and actions — each
proving its findings with probes, browser runs or sources. Everything they
proved is fixed and pinned in `scripts/qa/hvac-review.check.ts` (51 checks);
the older suites pass unchanged except where an assertion had encoded the
old behaviour (wall bearings, the package EER2 floor, the furnace under a
big coil, a load that moved with the ventilation term).

**The house and the load**
- Footprint walls carried their direction of travel where the solar table
  wanted the direction they face; an east–west wall was scored as east or
  west glass. `ringGeometry` now turns each wall by the ring's winding.
- The county design temperatures are the ENERGY STAR *limits* — the most
  extreme station within 40 miles (King County's 11 °F is Stampede Pass,
  Los Angeles's 14 °F is Mount Baldy). Nine metro counties (King, Pierce,
  Snohomish, Los Angeles, San Diego, San Bernardino, Riverside, Clark,
  Maricopa, Suffolk MA) now design on their metro station with the limit
  named in the source; the page carries two fields for the address's own
  1% / 99% figures (`JobInput.designCoolingF / designHeatingF`, saved with
  the estimate) and a note under the county when the row is a limit.
- A footprint with no height tag (every Regrid ring, most OSM ones)
  arrived as a 13 ft default and overwrote the assessor's storey count with
  1; a ridge height was read as ~11 ft a floor. Tagged heights only, never
  over the record, on a (h − 6) / 10 ladder.
- A tight (2012+) house now carries the ASHRAE 62.2 ventilation term; air
  constants carry Manual J's altitude factor; a ductless zone can be a
  100 sq ft room and says so; "Furnace capacity: 80,000 BTU" is an input,
  not 6.5 tons; attic and wall insulation read on the walk land in the
  envelope; Cool Calc gets a clean city/state from a typed address.

**Selection and checks**
- Manual S for a heat pump where heating governs: up to 125% of the
  cooling load (135% variable) and the size that carries the most heat
  ranks first — on heat-pump jobs; a gas house still leads with the AC.
- A furnace under a coil no 100–140% cabinet's blower carries takes the
  smallest cabinet that does, over 140% with a "Furnace fit" verify, instead
  of a 40k that starves the coil.
- Package units: judged on their heat (gas section vs the heating load, heat
  at design and backup for heat-pump packs, strips for electric packs),
  gas lines and the gas-pipe / CO checks only where they burn gas, no gas
  pack on a no-gas house, no package on a split house unless picked by
  hand, the NOx flags only on gas packs; the DOE floor is 13.4 SEER2 with
  10.6 EER2 in the Southwest only (the old 11.0 "nationwide" ruled out every
  value gas pack including the California ULN builds); the Southeast
  install rule is for splits.
- The electric furnace runs the NEC count with its heat kit; a strip kit on
  an indoor unit that ran on 120 V is a breaker to find room for; propane
  sizes on the propane table; runs past 200 ft are a verify; a missing
  HSPF2 is a verify and a low one fails at selection; ductless is judged on
  the heat-pump floor; the smallest unit made is accepted (said so) rather
  than "no fit"; a boiler house converts all-electric with the no-ducts
  flag; a heat pump picked by hand on a gas full system carries no
  "dual fuel" mark; the full system's companion furnace obeys the NOx
  district and the NOx check names it.

**The ledger**
- What is on site decides the lines: no gas flex on an electric furnace,
  no outdoor-unit removal on a furnace-only house, nothing hauled from a
  house with nothing installed, the strip-kit circuit only where the old
  indoor unit ran on 120 V (with its breaker on the quote), a drain and
  attic pan on a dual-fuel conversion's coil, the gas capped when a full
  system's heat pump pulls the furnace, gas lines by the package's heat
  kind, two circuits and two pumps on a two-system house, a measured line
  set on a same-refrigerant swap still "flush and reuse", a recharge with
  no pounds out of the headline, the pricing note true of the row, the
  catalog CSV round-tripping heat kind / vent / first-hour / states with
  same-model coil sizes kept apart, a blank cell blank, no division by a
  zero line-set default.

**The data**
- Carrier 27VNA1 is one 4.5-t row (27VNA154A003); Bosch IDS Premium names
  its two chassis; the R-410A ductless rows and the LG row say what they
  are; 59CU5 is single-stage; GR9S96-U is 14 ng/J; the furnace-floor flag
  says the 2028 rule is under review (vacated and remanded 2026-06-08);
  the coastal-county map covers the Gulf, the Atlantic, the Pacific
  Northwest and Alaska.

**The page and the actions**
- A reopened estimate keeps the ledger as edited and the tank picked on the
  strip (`draft.pick`, `draft.linesetFt`, line ids saved); the typed-unit
  schema keeps `noxNgJ` / `heatKind` / availability; a new address on a
  no-load job confirms and clears the last house; a hand pick is let go
  when the load re-sizes the job, with a note; switching the job leaves the
  saved row and the report behind; the Manual J sentence only on a load
  job; the converted proposal carries the address and the state's tax; the
  catalog import is one transaction; server errors reach the browser as a
  sentence; the radio strips answer the arrow keys; blanks clear a number,
  negatives are refused; the recent rows fit a phone.

Left as noted: York TM8V / YCV rows still need a distributor check; the
water-heater rows carry UEF / first-hour for one size per family; Carrier
48NL / 48NG packs have no gas input on the row (the gas check asks for the
submittal). Design temperatures outside the nine metro overrides are the
county limit, said so on the page.

## Sources checked 2026-09-15

ACCA approved software list (acca.org/standards/approved-software); Cool Calc
developer docs (docs.coolcalc.com/developer-docs); EPA R-410A final rule as
reported by NAHB (2026-05) and ACCA; IRS / P.L. 119-21 coverage of 25C's end;
HEAR state program pages (CEC, WA Commerce, NH DOE) and 2026 status trackers;
ENERGY STAR Design Temperature Limit Reference Guide (2019 ed.); AHRI Data
Subscription Program page; NEEP ccASHP list (ashp.neep.org); DOE consumer
central AC and heat pump standards page.
