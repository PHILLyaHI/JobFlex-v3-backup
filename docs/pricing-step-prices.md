# Smart Proposal — the price book (2026-09-18)

Owner's ask, after a street sewer and a bathroom came back far too cheap:
*"all specialtys that we have needed to be addressed as a price creations."*

Every AI specialty (229) has a procedure: the lines a professional estimate
itemizes, in order, each with its unit (`lib/estimate/procedures`). Until
now only the material side had prices, from the previous JobFlex's price
book. The labor on most lines was the model's guess, so totals came out
low. The price book in `lib/estimate/step-prices` now prices every step of
every procedure, and gives every specialty a benchmark for a whole job.

## How the prices were made

- **One research pass per group of specialties** (17 batches), each by an
  estimator agent working from the same written brief.
- **What a price is.** What a customer pays a licensed contractor per unit,
  supplied and installed. US national average, standard grade, 2025-2026
  dollars, no sales tax, overhead and profit included. That is what cost
  guides, bid tabulations and fee schedules publish. Each price is a range
  covering the middle of the market, with the labor share of it.
- **Overhead and profit.** Each specialty records the markup of the firm
  that does the work (about 15% for public-works bids, 20-35% for
  residential trades, 30-45% for remodelers). The estimator writes lines at
  the contractor's cost, and the company's own markup adds overhead and
  profit afterwards. So the prompt shows every price divided by 1 plus that
  markup. Permits and other pass-through fees are shown as charged.
- **The self-check.** Each specialty's typical job was built from its own
  step prices. The total per unit had to land inside the published all-in
  benchmark for the trade, within 15%. The QA runs the same check again.
- **Sources.** Each batch sourced the benchmark and the costliest steps of
  every specialty: cost guides (HomeGuide, HomeAdvisor and Angi, Fixr,
  Homewyse, Forbes Home), distributor list prices, state DOT average bid
  prices, municipal fee schedules and published billing rates. The rest
  were derived from those or estimated to agree with them. Every step is
  tagged `src`, `derived` or `est`.
- **Earlier research reused.** The remodel ranges
  (`docs/remodel-price-audit.md`), the utility bid prices
  (`docs/pricing-sources-utilities.md`), and the fence, roof and HVAC
  catalogs already in the repo.

## How the estimator uses them

- **Every step of the procedure block carries its cost**, for example the
  roof's `4. [core] Tear-off of the existing roofing to the bare deck … —
  sqft · cost $0.50-$0.77 per sqft (material $0.03-$0.04 + labor
  $0.48-$0.73)`, and its permit `fee $150-$450 for the line, passed
  through without markup`. A header above the steps says what the numbers
  are, that they scale by the LOCATION factor, and that they govern the
  line prices.
- **The trade profile's anchors and the master prompt's guidelines** are a
  cross-check now. They price only what the book leaves unpriced.
- **A whole job of stated size gets a range.** When the brief states the
  job's size in the unit the trade sells by (a fence's length, a roof's
  area, a floor's area, a count of windows), the prompt carries the
  benchmark's range at contractor cost, scaled to the job's city. A reply
  under nine tenths of it is asked again once. No range when the brief
  states a price, names only part of a room, gives no size, or gives a size
  far outside a typical job. Remodels and utility runs keep their own
  ranges.
- **The utility bid prices are shown at cost too.** Public bid prices
  include the bidder's overhead and profit (about 15%). The sewer, storm
  and water anchors and ranges now show them less that. A 300 LF street
  sewer in Lynnwood reads $208,700-417,400 at cost, which is $240,000-480,000
  at a 15% markup.
- **A utility job keeps its own bid prices** when the specialty's book is
  the wrong scale for it. The detector sends "run sewer in the street" to
  the sanitary-sewer specialty, whose procedure and book describe a side
  sewer from the house ($90-280/LF). On a street main ($350-1,100/LF) its
  step costs stay out and the street main's bid prices govern; a yard
  lateral keeps them. The rule: the book's per-foot benchmark must overlap
  the job's national bid range by a quarter.
- **The fallback and the remodelers get no benchmark range.** A brief no
  specialty matches falls to general contracting, whose benchmark is a
  remodel's; remodelers keep the method's reviewed ranges.
- **An admin-edited step** that no longer matches the book's text goes
  unpriced rather than wrongly priced. The `/admin/prompts` preview shows
  how many steps the book prices.

## Coverage

| Group | Specialties | Steps | Sourced | Derived | Estimated |
|---|---:|---:|---:|---:|---:|
| CORE BUILDING TRADES | 11 | 210 | 19 | 68 | 123 |
| MECHANICAL–ELECTRICAL–PLUMBING (MEP) | 23 | 365 | 36 | 94 | 235 |
| EXTERIOR SYSTEMS | 21 | 316 | 31 | 101 | 184 |
| INTERIOR FINISHES | 24 | 375 | 27 | 161 | 187 |
| SPECIALTY SURFACE & DECOR | 7 | 115 | 11 | 34 | 70 |
| SITE & LANDSCAPE | 9 | 145 | 23 | 39 | 83 |
| WATERPROOFING & ENVELOPE | 6 | 100 | 4 | 16 | 80 |
| SPECIALTY SYSTEMS | 8 | 127 | 2 | 19 | 106 |
| CIVIL & DEMOLITION | 25 | 470 | 49 | 155 | 266 |
| FABRICATION & CUSTOM WORK | 4 | 70 | 3 | 12 | 55 |
| GENERAL & PROFESSIONAL | 31 | 456 | 30 | 136 | 290 |
| ROADWAY & TRANSPORTATION | 17 | 257 | 46 | 71 | 140 |
| ENGINEERING & DESIGN | 22 | 324 | 11 | 139 | 174 |
| DEVELOPMENT & CONSULTING | 21 | 284 | 12 | 165 | 107 |

## Trade anchors corrected

Each batch compared the trade profile anchors it owned against its research
at cost. An anchor off by more than 30% was rewritten in the same format.
Nearly all were too high, most by 1.5 to 3 times: roofing, siding, gutters,
decking, windows and doors, concrete labor, painting, drywall labor,
flooring labor, insulation labor, HVAC set-and-start labor, the epoxy base
and top coats, and the landscape patio, wall and grading lines. Two were
too low: fence posts and deck footings. The corrected figures agree with
the repo's own roof, fence and HVAC estimators, which the batches read as
sources. The old anchors had been raised when answers came back thin; the
procedures and the price book now carry the lines and the prices, so the
anchors no longer need to overshoot.

## Known limits

- **Web research ran short.** The session's shared web-search limit ran
  out partway through, and several cost guides refuse automated fetches.
  Every benchmark cites a source, but most small fixed lines (site walks,
  cleanup, logs) and several mid-size steps are estimates tagged `est`.
  The coverage table above counts them.
- **Least verified benchmarks.** The batches named these as resting on
  estimates or thin sources: the five commercial MEP benchmarks, permit
  consulting, manufactured and mobile home setup, the fire-feature end of
  fire pits and fireplaces, ADA ramps and traffic control, lift and pump
  stations, and the engineering disciplines without a fee survey
  (environmental, MEP, fire protection, transportation, traffic,
  hydrology, utility survey, BIM).
- **Some procedures build the job only in conditional steps.** Fencing,
  stucco, metal cladding, flooring, tree removal, stump grinding and
  signage keep their main build lines conditional (by material or size).
  Their typical jobs count the usual conditional line so the self-check
  compares like with like.
- **A benchmark measures one thing.** Painting is priced per sqft of wall
  and ceiling area. A brief that states the house's floor area gets a
  range that is too low, which never asks again, so it does no harm.
- **Counts do not feed ranges.** The brief reader records areas, lengths
  and volumes, not counts. A trade sold per window, per pier or per stop
  prices its steps but gets no range.
- **National figures.** Every price is a US average; the LOCATION factor
  (the 306-city index) scales it. Budget and premium work take the low and
  high ends.

## Data-layer changes

- None to the schema. No migration.
- New module `lib/estimate/step-prices/` (types, index, one data file per
  procedure group).
- `formatProcedureBlock` takes the specialty's prices and prints a cost
  after each step. `buildLegacyEstimatePrompt` sends them, returns
  `priced` (steps priced of the procedure's) and may return a
  `specialty` range. `retryReasons` handles that range.
- `actions/advancedEstimator.ts`: the first log line also names the price
  coverage and the range (`prices=21/21 range=10400-16200`). No other
  action or API route changed.
- `/admin/prompts`: a price-book chip in the preview, and the specialty
  view's procedure block shows the costs.
- Text changes: the master prompt's pricing guidelines and the procedure
  rules now say the price book governs; the utility block and range read
  "at contractor cost".

## Proof

- `scripts/qa/step-prices.check.ts`: every one of the 229 specialties has
  a price book and every one of the 3,614 procedure steps a price, with no
  stale entries; every price, labor share, markup and benchmark is well
  formed; every specialty's typical job, built from its step prices, lands
  inside its benchmark. It also checks the cost conversion, fees passed
  through, the few free steps, a cost on every step of every procedure
  block, and an admin-edited step going unpriced. It checks the ranges for
  a Spokane fence (the run, not the height), a Bothell roof, a Dallas
  epoxy floor and a Denver paint job; no range with a stated price or no
  size; remodels and sewers keeping their own ranges; the owner's street
  sewer priced by its bid prices while a yard lateral keeps its step
  costs; and the retry naming the price book.
- `pricing.check.ts` (the sewer ranges at cost), `remodel-method.check.ts`
  (the roof now gets its benchmark), `procedures.check.ts`,
  `estimate-brief.check.ts` and the other 23 suites stay green.
- On the stand (`adshoot/prompts-remodel.js`, 26 checks, desktop and
  phone): the price-book chip on the sink, bath and roof briefs, the roof's
  Bothell range at cost, and both sewer briefs "priced by the utility bid
  prices".

Not verified here: a live OpenAI run (no key on the stand). On jobflex.app
the console line `[advancedEstimator] Step 1` names `prices=` and `range=`.

## Benchmarks by specialty

All-in customer prices, US national, standard grade, overhead and profit included. The prompt shows them divided by 1 + O&P and scaled by the city index.

#### Core building trades

| Specialty | Sold | National all-in | O&P | Typical job | Sources |
|---|---|---|---:|---|---|
| Concrete Contractor | slab area placed, with its footings | $8.00-$15 per sqft | 20% | 1,500-5,000 sqft | HomeGuide 2026: concrete slab foundation $6-$14/sqft installed; Estimators.us 2026: standard residential slab $6-$12/sqft installed; HomeGuide 2026: slab installer labor $3-$5/sqft |
| Framing Contractor | building floor area framed (all floors) | $16-$30 per sqft | 20% | 1,800-3,200 sqft | HomeGuide 2026: frame a house $11-$30/sqft, labor and materials; HomeGuide 2026: roof trusses $5-$14/sqft installed; wall framing $11-$32/linear ft; HomeAdvisor 2025: framing $7-$16/sqft (older lumber prices) |
| Masonry Contractor | masonry wall face area laid (block plus veneer) | $18-$32 per sqft | 20% | 800-2,500 sqft | Homewyse 2026: concrete block wall $15.11-$19.61/sqft basic install; NEDES 2026: cinder block wall $15-$35/sqft installed; Homewyse 2026: brick veneer $14.99-$24.05/sqft installed |
| Excavation / Grading Contractor | earthwork cut (bank cu yards), whole site package | $20-$50 per cu yards | 18% | 1,000-5,000 cu yards | HomeGuide 2026: excavation $2.50-$15/cu yard digging only; grading $0.40-$2.00/sqft; WisDOT 2025 average bids: common excavation $8.65-$14.47/cu yard, borrow $7.39-$9.11/cu yard; Angi 2026: cut-and-fill excavation $60-$200/cu yard on small residential jobs |
| Foundation / Retaining Wall Contractor | wall length, 4-6 ft cast-in-place wall with its footing | $240-$450 per linear ft | 25% | 60-200 linear ft | HomeAdvisor 2025: poured concrete retaining wall $60-$270/linear ft (3-6 ft) plus $30-$100/linear ft for footings; WisDOT 2025 average bids: concrete masonry retaining walls $1,238/cu yard (FY2024), rebar $1.36/lb; Angi 2026: stem walls about $45-$55/linear ft on top of the slab price |
| Structural Steel / Welding Contractor | building floor area framed in steel (about 6-10 lb of steel per sqft) | $15-$30 per sqft | 18% | 4,000-15,000 sqft | SteelFlo 2026: moderately complex structural steel $4,000-$6,500/ton installed; SteelFlo 2026: fabricated and erected $2,100-$4,000+/ton; W-shapes $1,100-$1,400/ton from service centers; SteelFlo 2026: erection labor $300-$700/ton; shop drawings $100-$300/ton |
| Concrete Flatwork Contractor | flatwork area placed (walks, drives, pads) | $9.00-$16 per sqft | 18% | 1,500-6,000 sqft | WisDOT 2025 average bids: concrete sidewalk 4 in. $7.63/sqft, 6 in. $12.43/sqft (base and excavation separate); WisDOT 2025 average bids: concrete driveway 6 in. $65.55/sq yard; HomeGuide 2026: concrete driveway $6-$15/sqft installed |
| Residential Concrete Flatwork Contractor | driveway, walk or patio area poured | $8.00-$14 per sqft | 30% | 400-1,000 sqft | HomeGuide 2026: concrete driveway $6-$15/sqft; standard gray $6-$10/sqft; HomeGuide 2026: stamped driveway $8-$26/sqft; removing the old one adds $2-$6/sqft; HomeGuide 2026: slab installer labor $3-$5/sqft |
| Residential Foundation Repair Contractor | piers installed (per pier, whole job) | $2,000-$3,500 each | 35% | 6-14 unit | HomeGuide 2026: pier installation $2,000-$4,000 per pier; jobs $8,000-$30,000+; Dalinghaus 2025: helical or push pier underpinning $2,000-$3,000 per pier location, about 10 per job; FoundationQHub 2025: push piers $1,200-$3,000 per pier installed |
| House Lifting / Raising Contractor | house footprint lifted (new foundation on its own line) | $20-$40 per sqft | 30% | 1,000-2,000 sqft | Fixr 2025: raising only $10-$35/sqft; with foundation work $14-$60/sqft; HomeGuide 2026: raise a house $10,000-$40,000; lift and replace foundation $20,000-$100,000; Fixr 2025: supporting $2-$4/sqft, jacking $3-$5/sqft, permit $4,000-$6,000 |
| Structural Retrofit / Seismic Retrofit Contractor | house floor area over the crawl space | $3.50-$7.00 per sqft | 30% | 1,000-2,000 sqft | HomeGuide 2026: earthquake retrofit $3-$5/sqft; $3,000-$10,000 per house; Fixr 2025: $3-$7/sqft; average $7,000 for bolting and cripple-wall bracing; Custom Home 2026: Bay Area bolt-and-brace $3,000-$7,000 |

#### Mechanical–electrical–plumbing (mep)

| Specialty | Sold | National all-in | O&P | Typical job | Sources |
|---|---|---|---:|---|---|
| Electrical Contractor | floor area wired (commercial build-out) | $16-$32 per sqft | 20% | 2,500-7,500 sqft | Homewyse 2026: light fixture installed $394-$583 each; appliance circuit $741-$910 per circuit; Fixr 2025: electrician $88-$163/hour; new outlet $120-$200 installed |
| Plumbing Contractor | plumbing fixtures installed (fixture count) | $3,500-$7,000 each | 20% | 8-20 unit | Homewyse 2026: toilet installed $635-$1,151; faucet installed $514-$845; Fixr 2025: plumber $75-$150/hour |
| HVAC Contractor | conditioned floor area served | $16-$34 per sqft | 20% | 3,000-10,000 sqft | Fixr 2025: galvanized sheet-metal ductwork $21.38-$62.36/linear ft installed; Homewyse 2026: heat pump installed from $6,638-$7,837 per unit (residential reference) |
| Fire Sprinkler / Fire Protection Contractor | sprinklered floor area | $3.00-$7.00 per sqft | 18% | 5,000-20,000 sqft | Bob Vila 2025 (citing Angi): sprinkler systems $0.80-$7/sqft, average $2/sqft; Fixr 2025: sprinklers $1.30-$1.50/sqft new construction, $1.75-$2/sqft in an existing home |
| Low-Voltage / Security / Data Wiring | cable drops plus security devices (each drop, camera, controlled door, sensor) | $450-$1,300 each | 25% | 30-70 unit | Fixr 2025: Cat6 data drop $125-$250 installed; Homewyse 2026: network wiring run $291-$349; home security system $805-$1,141 |
| Residential Electrical Contractor | devices, fixtures and alarms installed (points) | $175-$400 each | 30% | 10-36 unit | Fixr 2025: outlet installed $120-$200; recessed light $176-$328 per light; Homewyse 2026: new outlet $297-$360; appliance circuit $741-$910 |
| Home Surge Protection Installer | surge protective devices installed | $300-$800 each | 35% | 1 unit | Bob Vila 2025 (citing Angi/HomeAdvisor): whole-house surge protector $70-$700 installed, average $300; Fixr 2025: electrician service visit $176-$327 |
| Residential Plumbing Contractor | fixtures or repair points served | $300-$700 each | 35% | 2-4 unit | Homewyse 2026: plumbing leak repair $340-$411 per leak; faucet installed $514-$845; Fixr 2025: plumber $75-$150/hour, average $90 |
| Gas Line Installation Contractor | gas pipe run length | $28-$60 per linear ft | 30% | 20-60 linear ft | Fixr 2025: gas line $500-$2,000, average $800 for a 25 ft line to a furnace; black iron $15-$30/linear ft installed; Homewyse 2026: gas line from $864-$1,060 per piping run |
| Water Heater Replacement Contractor | water heaters replaced | $1,700-$3,500 each | 30% | 1 unit | Fixr 2025: 50-gallon water heater installed $900-$2,500, average $1,800; Homewyse 2026: water heater replacement from $1,586-$1,843 per heater; Bob Vila 2025 (citing Angi): permit $25-$300; removal $100-$500; labor $150-$450 |
| Tankless Water Heater Installer | tankless heaters installed | $3,500-$6,500 each | 30% | 1 unit | Fixr 2025: gas tankless installed $2,500-$4,500, average $2,811; 6-10 h labor at $75-$130/hour; Homewyse 2026: tankless gas water heater from $3,293-$3,859 per heater |
| Whole-House Repiping Contractor | plumbing fixtures served (stub-outs) | $750-$1,500 each | 30% | 8-16 unit | Homewyse 2026: repipe water supply lines from $3,438-$4,113 per job (basic, walls not repaired); Fixr 2025: plumber $75-$150/hour |
| Leak Detection Specialist | one leak-detection visit | $325-$850 per job | 40% | 1 job | HomeGuide 2026: slab leak detection $150-$400, average $280; Drizzlex 2026: plumber leak detection $175-$350; hidden slab or wall leaks $1,000+ |
| Drain Cleaning / Hydro-Jetting Contractor | one main-line drain call | $400-$1,000 per job | 40% | 1 job | HomeGuide 2026: main sewer line cleaning $200-$500; with hydro jetting $600-$1,400; HomeGuide 2026: sewer camera inspection $125-$500 |
| Backflow Preventer Installer | assemblies installed (3/4-1 in.) | $600-$1,800 each | 30% | 1 unit | RateYourPlumber 2025: installed DCVA $300-$800, RPZ $600-$1,500, PVB $150-$500; HomeGuide 2026: backflow preventer $200-$1,000 installed by type |
| Sump Pump Installer | sump systems installed | $1,000-$2,800 each | 30% | 1 unit | The Basement Guide 2026: new system with pit $1,200-$2,500; pump swap in an existing pit $650-$1,200; FixUpFirst 2026: new install with pit $800-$2,500; pump swap in an existing pit $300-$700 |
| Residential HVAC Contractor | split systems replaced (AC, coil, furnace) | $9,000-$15,500 each | 30% | 1 unit | HomeCostCalcs 2026: furnace + AC replacement $7,000-$14,000 standard, $10,000-$20,000 high efficiency; Today's Homeowner 2025: complete HVAC system install $5,000-$12,500; JobFlex HVAC rate card 2026 (src/lib/hvac/ledger.ts): 3-ton AC + 80k 96% furnace builds to about $13,700 |
| Whole-House Fan Installer | whole-house fans installed | $1,300-$3,000 each | 30% | 1 unit | HomeGuide 2026: whole-house fan $600-$2,300 installed; labor $600-$1,600 with a new circuit; Homewyse May 2026: $1,045-$1,899 per fan installed with a new circuit, before permit and GC overhead |
| Indoor Air Quality (IAQ) Specialist | one IAQ assessment and upgrade | $1,800-$4,200 per job | 30% | 1 job | HomeAdvisor 2025: indoor air quality test $292-$584, average $437; HomeGuide 2026: extended media filter $400-$800 and UV light $400-$800 installed; HomeGuide 2026: whole-house air purifier $400-$4,000, average $2,610 |
| Duct Sealing Contractor | duct systems sealed and tested | $1,200-$3,200 each | 30% | 1 unit | HomeGuide 2026: air duct sealing $1-$2/sqft or $1,000-$6,000; Aeroseal $1,500-$6,900; Angi 2026: duct leakage test $115-$450, average $325 |
| Radiant Floor Heating Installer | heated floor area | $9.00-$18 per sqft | 25% | 500-1,500 sqft | HomeGuide 2026: hydronic radiant floor $7-$17/sqft; whole house $10,000-$34,000; HomeGuide 2026: new boiler $3,200-$9,000 installed when a heat source is added |
| Fire Alarm Contractor | building gross area | $2.00-$5.00 per sqft | 20% | 5,000-20,000 sqft | Spectrum Fire Protection 2026: commercial fire alarm $3-$7/sqft installed; Safe and Sound 2026: $1-$3/sqft new construction, $4-$12 occupied retrofit; addressable panel $2,000-$10,000+ |
| Residential Sprinkler Retrofit Installer | floor area protected | $4.00-$8.00 per sqft | 25% | 1,500-2,800 sqft | HomeGuide 2026: sprinkler retrofit $2-$7/sqft; NFSA 2025: residential retrofit bid $5.14/sqft; West Coast in-unit retrofits $5-$10/sqft |

#### Exterior systems

| Specialty | Sold | National all-in | O&P | Typical job | Sources |
|---|---|---|---:|---|---|
| Roofing Contractor | roof area in squares (measured, before waste) | $450-$700 per square | 30% | 20-30 sq boards | HomeGuide 2026: architectural shingles $400-$600 per square installed, $7,500-$16,000 average roof; Roof tear-off guides 2026 (SquareDash, RoofingCalculatorHQ): tear-off $1.00-$2.40/sqft incl. dumpster; permit $100-$500; JobFlex roofPackage catalog 2026: architectural $125 mat + $200 labor/sq; tear-off $55 + disposal $28/sq/layer (sell) |
| Siding Contractor | wall area sided, net of openings | $7.00-$14 per sqft | 30% | 1,500-2,500 sqft | HomeGuide 2026: fiber-cement siding $6-$15/sqft installed, labor $4-$9/sqft; HomeGuide/This Old House 2026: vinyl siding $4-$8/sqft installed; Modernize/Dropcurb 2026: siding removal $0.25-$1.50/sqft |
| Gutter Installer | gutter length along the eaves (downspouts and fittings in the rate) | $10-$18 per linear ft | 30% | 120-200 linear ft | HomeGuide 2026: seamless gutters $6-$20/lf installed; aluminum $900-$2,400 average job; HomeGuide 2026: seamless downspouts $5-$16/lf; old gutter removal $1-$2/lf; This Old House 2026: micro-mesh guards about $9/lf installed |
| Window & Door Installer | openings replaced (windows and exterior doors), full-frame | $900-$1,700 each | 30% | 6-14 unit | HomeGuide 2026: vinyl windows $350-$1,500 per window installed; Window replacement guides 2025: full-frame $1,300-$1,800 per window, retrofit $700-$1,100; HomeGuide 2026: front door replacement $505-$1,898; sliding glass door $900-$3,500 installed |
| Deck & Patio Builder | deck surface area | $30-$60 per sqft | 30% | 240-400 sqft | HomeGuide 2026: pressure-treated deck $25-$50/sqft installed, labor $15-$30/sqft; Ergeon 2026: composite deck $30-$60/sqft installed; HomeGuide 2026: composite railing $25-$60/lf, aluminum $50-$200/lf installed |
| Stucco / EIFS Contractor | wall area net of openings | $9.00-$16 per sqft | 25% | 1,500-3,000 sqft | Homewyse 2026: three-coat stucco with paper and lath $10.69-$17.33/sqft installed; HomeAdvisor 2026: hard-coat stucco $6-$9/sqft, EIFS $8-$12/sqft; 2,000 sqft home $10,200-$18,700; Fixr 2025: stucco $6-$8/sqft installed; painting stucco $2-$5/sqft |
| Fence Contractor | fence length | $32-$60 per linear ft | 30% | 100-250 linear ft | Homewyse 2026: 6 ft wood privacy fence $33-$53/linear ft installed; HomeGuide 2026: cedar privacy fence $35-$40/linear ft installed on average; vinyl $30-$60; HomeAdvisor 2026: fence installation avg $3,277 ($1,860-$4,843); removal $3-$5/linear ft |
| Residential Roof Repair Contractor | repair area in sqft (shingles removed and rewoven), visit costs included | $20-$40 per sqft | 40% | 20-80 sqft | HomeGuide 2026: roof leak repair $150-$2,000 depending on the source; HomeGuide 2026: flashing repair $200-$500 minor, $500-$1,500 major; HomeGuide 2026: cracked pipe boot replacement $250-$550 |
| Commercial Roofing Contractor | roof area in squares (low-slope, tear-off to deck) | $850-$1,450 per square | 20% | 100-300 sq boards | Commercial TPO guides 2025-26 (Angi, HomeGuide, Schoenherr): full replacement with tear-off and insulation $8.50-$15.50/sqft; TPO alone $6.50-$11.50/sqft; HomeGuide 2026: polyiso insulation adds $0.50-$3.00/sqft; tear-off adds $1-$2/sqft; JobFlex lowSlope/commercial catalogs 2026: TPO 60-mil $290/sq, R-30 polyiso $293/sq, tear-off $95 + disposal $45/sq/layer, GC + insurance 10.5% |
| Skylight Installer | skylights installed | $2,500-$5,500 each | 30% | 1-3 unit | Bill Ragan Roofing 2026: skylight installed $3,000-$7,300 (fixed $3,000-$5,000, solar venting $4,250-$7,150); HomeAdvisor 2026: skylight installation avg $1,920 ($1,014-$2,828); ventilating unit $400-$2,000; Fixr 2025: fixed skylight $295-$537, venting $574-$1,044 (unit only) |
| Sun Tunnel / Solar Tube Installer | tubular skylights installed | $750-$1,400 each | 30% | 1-3 unit | Litespeed Construction 2025: 14 in. VELUX Sun Tunnel $1,100-$1,400 installed up to 6 ft; 10 in. ~$100 less; GoGreen Daylight Systems 2025: sun tunnel $700-$1,200 professionally installed; labor $300-$800; HomeAdvisor 2026: tubular skylight unit $200-$500 |
| Attic Ventilation Contractor | attic floor area vented | $1.10-$2.40 per sqft | 30% | 1,200-2,000 sqft | HomeAdvisor 2026: ridge vent $300-$650 installed (avg $500); soffit vents $315-$465; gable vents $60-$150 each; RoofMedic 2026: ridge vent $7-$15/linear ft installed, $300-$750 for a 40-50 ft ridge |
| Residential Siding Repair Contractor | repair area in sqft, visit costs included | $18-$40 per sqft | 40% | 30-100 sqft | HomeGuide 2026: siding repair $2-$14/sqft, $200-$1,100 on average; HomeGuide 2026: extensive section replacement $4-$16/sqft; repair labor $40-$80/hr |
| Window Replacement Specialist | windows replaced | $750-$1,400 each | 35% | 6-14 unit | HomeGuide 2026: vinyl windows $350-$1,500 per window installed, labor $100-$500; Window replacement guides 2025: retrofit $700-$1,100, full-frame $1,300-$1,800 per window installed |
| Patio Cover / Pergola Builder | cover area (roofed or shaded footprint) | $25-$60 per sqft | 30% | 180-360 sqft | HomeGuide 2026: patio cover $20-$60/sqft installed over an existing patio; HomeGuide 2026: Alumawood patio cover $18-$55/sqft installed; HomeGuide 2026: covered patio $10,000-$22,500 installed on average |
| Outdoor Kitchen Builder | island length | $900-$1,900 per linear ft | 35% | 10-16 linear ft | Fixr 2025: outdoor kitchen avg $16,000 ($6,000-$30,000); framing $100-$300/linear ft; stone veneer $15-$25/sqft; HomeAdvisor 2026: outdoor kitchen avg $16,533 ($6,269-$27,087); permits $250-$2,000 |
| Fire Pit / Outdoor Fireplace Builder | fire features built (masonry fire pit or outdoor fireplace) | $3,500-$12,000 each | 30% | 1 unit | HomeAdvisor 2026: built-in masonry fire pit $1,000-$3,000+; natural-gas fire pit $400-$3,000; gas line $15-$25/linear ft; Fixr 2025: 36 in. natural-gas burner kit $1,300-$2,000; stone fire pit $350-$3,010 |
| Residential Fence Repair Contractor | one fence repair job (post, rail, pickets, gate) | $600-$1,500 per job | 40% | 1 job | Fixr 2025: fence repair avg $500 ($200-$850); post replacement $200-$500; gate repair $150-$500; Fixr 2025: picket replacement $150-$350; panel replacement $200-$750; pressure washing $125-$235 |
| Garage Door / Automation Installer | garage doors replaced with opener (16x7 double; a single door runs about 60%) | $2,000-$3,800 each | 30% | 1-2 unit | HomeGuide 2026: 16x7 insulated garage door $1,200-$2,500 installed; R-18+ $3,000-$4,000; HomeGuide 2026: garage door opener installed $300-$900; HomeGuide 2026: insulated door install labor $150-$500 single, $300-$700 double |
| Carport Builder | roof area covered | $16-$34 per sqft | 30% | 300-600 sqft | HomeAdvisor 2026: metal carport $20-$40/sqft, wood $15-$35/sqft installed; two-car $4,000-$14,000; Angi 2026: carport installation $12-$40/sqft; most pay $3,145-$9,693; HomeAdvisor 2026: carport slab $4-$8/sqft; permits $60-$800 |
| Chimney Repair Contractor | chimneys repaired (repoint, crown, flashing, cap, waterproof) | $2,800-$6,500 each | 30% | 1 unit | Fixr 2025: chimney crown replacement $1,000-$3,000; repointing $500-$2,500; flashing replacement $300-$800; cap $300-$600; Fixr 2025: stainless liner avg $2,500 ($1,800-$4,000); chase cover $300-$700; sealing $150-$500 |

#### Interior finishes

| Specialty | Sold | National all-in | O&P | Typical job | Sources |
|---|---|---|---:|---|---|
| Painting Contractor | wall and ceiling area painted | $1.90-$3.60 per sqft | 30% | 1,000-4,000 sqft | HomeGuide 2026: painters charge $1-$3/sqft; a room $350-$850; trim $1-$4/linear ft; HomeGuide 2026: whole-home interior $3,500-$10,000 (1,500 sqft home $4,500-$6,000); labor 70-85% of the job |
| Drywall Contractor | board area hung and finished (walls and ceilings) | $2.25-$4.25 per sqft | 25% | 800-3,200 sqft | HomeGuide 2026: drywall installed $1.50-$3.50/sqft hung, taped and finished; board $0.50-$0.80/sqft; HomeGuide 2026: hanging only $0.85-$1.90/sqft; taping and mudding $0.35-$1.10/sqft; Homewyse May 2026: drywall installation $2.26-$2.69/sqft |
| Flooring Contractor | floor area finished | $8.00-$15 per sqft | 30% | 300-1,000 sqft | HomeGuide 2026: new flooring $4-$15/sqft installed, labor $2-$8/sqft; HomeGuide 2025: LVP $4-$16/sqft installed (material $2-$10, labor $2-$6); Angi 2026: old flooring removal $1.50-$3.50/sqft |
| Kitchen Remodeling Contractor | kitchen floor area remodeled | $305-$530 per sqft | 35% | 120-216 sqft | JobFlex REMODEL_JOBS / remodel method section 8 (reviewed 2026): full 12x14 kitchen, same layout, semi-custom, 3 cm quartz, LVP $38,000-$66,000 before markup (x1.35 / 168 sqft = $305-$530/sqft); JobFlex REMODEL_JOBS (reviewed 2026): 10x10 galley, same layout, stock cabinets $22,000-$40,000 before markup ($297-$540/sqft at x1.35); HomeGuide 2026: quartz countertops $50-$200/sqft installed |
| Bathroom Remodeling Contractor | bathrooms remodeled (full hall bath gut, about 5x8) | $24,300-$43,200 each | 35% | 1 unit | JobFlex REMODEL_JOBS / remodel method section 8 (reviewed 2026): hall bath gut 5x8 $18,000-$32,000 before markup (x1.35 = $24,300-$43,200); tiled shower with glass instead of the tub +$2,000-$4,000; JobFlex remodel method section 8 (reviewed 2026): powder room in place $6,000-$12,000, primary bath $35,000-$70,000 before markup |
| Tile & Stone Contractor | tile area installed (floor and wall) | $22-$42 per sqft | 25% | 100-400 sqft | HomeGuide 2026: tile installation $10-$50/sqft installed, $2,000-$10,000 for 200 sqft; Homewyse May 2026: tile floor $16.38-$20.21/sqft installed (12x12 ceramic, set and grouted) |
| Cabinet / Millwork / Closet Contractor | cabinet run (base and wall measured separately) | $550-$1,150 per linear ft | 30% | 20-50 linear ft | HomeGuide 2026: custom cabinets $500-$1,200/linear ft installed; $15,000-$30,000 for an average kitchen; HomeGuide 2026: labor to build and install custom cabinets $200-$300/linear ft; HomeGuide 2026: cabinet installation labor $50-$300/linear ft |
| Countertop Fabricator / Installer | finished countertop area | $65-$125 per sqft | 25% | 30-80 sqft | HomeGuide 2026: quartz countertops $50-$200/sqft installed, $1,500-$8,000 for an average kitchen; JobFlex kitchen anchors (reviewed 2026): quartz $60-$120/sqft, granite $50-$100/sqft installed (fabricator's price) |
| Finish Carpentry Contractor | trim installed (base and casing), doors and hardware included | $11-$22 per linear ft | 30% | 300-1,000 linear ft | HomeGuide 2026: interior trim $4-$10/linear ft installed; baseboard $6-$9; casing $5-$10; crown $7-$16; HomeGuide 2026: interior door $50-$500 for the door plus $100-$300 installation |
| Insulation Contractor | attic floor area insulated and air sealed | $2.50-$4.75 per sqft | 25% | 800-2,000 sqft | HomeGuide 2026: blown-in insulation $0.90-$2.40/sqft, $900-$3,600 total; Angi 2026: home energy audit $212-$698; blower door test $200-$450 |
| Acoustic Ceiling Installer | ceiling area (room footprint) | $5.50-$10 per sqft | 20% | 1,000-6,000 sqft | Fixr 2025: suspended acoustic ceiling $9.35/sqft installed on average; grid $1.50-$2.25/sqft material; Homewyse 2026: drop-in acoustic ceiling tile $6.65-$9.29/sqft installed |
| Attic Insulation Contractor | attic floor area insulated | $2.00-$3.75 per sqft | 25% | 800-1,800 sqft | HomeGuide 2026: blown-in insulation $0.90-$2.40/sqft, $900-$3,600 total; HomeEnergyDecisions 2026: attic insulation removal $1-$2/sqft for dry, uncontaminated insulation |
| Attic Air Sealing Contractor | attic floor area sealed | $1.25-$3.00 per sqft | 30% | 1,000-2,000 sqft | Angi 2026: blower door test $200-$450, average $325; LatestCost 2026: attic air sealing $1,000-$6,000, $0.50-$2.50 per sqft of attic area |
| Radiant Barrier Installer | roof deck and gable area covered with foil | $0.80-$2.00 per sqft | 30% | 1,500-2,500 sqft | HomeGuide 2026: radiant barrier $0.30-$2.00/sqft installed, attic $350-$2,700; HomeAdvisor 2026: labor $0.60-$1.00/sqft, two-sided foil $0.50-$0.90/sqft; 2,000 sqft attic $1,400-$4,000 |
| Hardwood Floor Refinishing Contractor | floor area sanded and refinished | $3.00-$8.00 per sqft | 30% | 400-900 sqft | HomeGuide 2026: refinishing $3-$8/sqft; Homewyse May 2026: $6.49-$7.92/sqft basic (2-pass sand, 2 coats 2K waterborne) |
| Trim & Molding Installer | molding installed, all profiles | $7.00-$16 per linear ft | 30% | 300-700 linear ft | HomeGuide 2025: crown molding $7-$16/linear ft installed; HomeAdvisor 2025: baseboard $5.70-$9.00/linear ft installed; Fixr 2025: whole house, 500 linear ft of crown $2,000-$4,000 |
| Wainscoting / Wall Paneling Installer | wall area paneled (length x panel height) | $12-$30 per sqft | 30% | 100-250 sqft | HomeGuide 2025: wainscoting $10-$40/sqft installed; Fixr 2025: board and batten $9-$23/sqft, raised panel $12-$33/sqft; 12x12 room about $3,600 |
| Built-In Cabinetry Contractor | built-in face length, full-height units | $500-$1,200 per linear ft | 35% | 8-16 linear ft | HomeAdvisor 2026: custom cabinets $500-$1,200/linear ft; Angi 2026: built-in cabinets $200-$600/linear ft, average project $4,500 ($2,000-$7,500) |
| Residential Soundproofing Contractor | wall and ceiling area treated | $14-$32 per sqft | 30% | 200-500 sqft | Fixr 2025: soundproofing $10-$30/sqft in existing rooms; soundproof doors $1,200-$4,000; HomeGuide 2026: $10-$30/sqft installed, $1,400-$4,300 per room |
| Interior Remodeling Contractor | floor area remodeled (rooms taken to the framing) | $61-$115 per sqft | 35% | 400-1,000 sqft | JobFlex remodel method section 8 (reviewed), 2026: basement finish $45-$85/sqft before markup, x1.35 = $60.75-$114.75; HomeGuide 2026: gut to the studs and remodel $60-$150/sqft |
| Laundry Room Remodel Contractor | whole laundry room remodeled in place (about 40-80 sqft) | $8,100-$20,250 per job | 35% | 1 job | JobFlex remodel method section 8 (reviewed), 2026: laundry remodel in place $6,000-$15,000 before markup, x1.35 = $8,100-$20,250; HomeAdvisor 2026: laundry room remodel $6,000-$17,000, average $11,000; HomeGuide 2025: typical laundry remodel $5,000-$15,000, $140-$250/sqft |
| Home Office Build-Out Contractor | whole office build-out in one room (about 100-150 sqft) with built-ins | $16,200-$33,750 per job | 35% | 1 job | JobFlex remodel method section 8 (reviewed), 2026: office with built-ins and a glass door $12,000-$25,000 before markup (x1.35 = $16,200-$33,750); basic from a bedroom $3,500-$9,000; Fixr 2025: custom bookcase $450-$3,000, soundproofing $1,000-$2,500, mini-split $1,000-$3,000 |
| Garage Conversion Contractor | garage floor area converted | $122-$230 per sqft | 35% | 400-520 sqft | JobFlex remodel method section 8 (reviewed), 2026: attached two-car, no bath $90-$170/sqft before markup, x1.35 = $121.50-$229.50; Angi 2026: garage-to-ADU conversion $150-$400/sqft; a basic finish $25-$75/sqft; HomeAdvisor 2025: permits $300-$1,000, electrical $1,000-$3,000, HVAC $300-$5,000 |
| Fireplace Installer | fireplace installed, all-in | $6,500-$15,000 each | 30% | 1 unit | The Stove Shop 2026: direct-vent prefab gas fireplace on a blank wall $8,200-$16,200 installed; HomeGuide 2026: gas fireplace installation $2,300-$10,000 |

#### Specialty surface & decor

| Specialty | Sold | National all-in | O&P | Typical job | Sources |
|---|---|---|---:|---|---|
| Epoxy Flooring Contractor | floor area coated | $5.00-$11 per sqft | 30% | 400-1,500 sqft | The Garage Guide 2026: professional epoxy $3-$7/sqft installed; polyaspartic $5-$12/sqft; diamond grinding $1-$3/sqft; JobFlex owner 2026: epoxy flake garage floor sells at about $10/sqft |
| Decorative Concrete / Polishing Contractor | floor area finished | $4.00-$10 per sqft | 30% | 600-2,500 sqft | Concrete Network 2025: polished concrete $3-$12/sqft; basic $3-$5, mid-range $5-$8, high-end $8-$12+; Concrete Network 2025: floor overlays $3-$7/sqft basic, $7-$12 mid-range, stamped $8-$20+ |
| Wallpaper / Wall Covering Installer | wall area covered | $5.00-$11 per sqft | 30% | 200-600 sqft | Homewyse 2026: hang wallpaper $4.99-$10.53/sqft incl. standard paper, supplies and labor; HomeAdvisor 2025: wallpaper removal $0.60-$3/sqft |
| Glass & Glazing Contractor | lites (glass units) replaced | $300-$700 each | 25% | 4-10 unit | Angi / HomeGuide 2026 cost guides: window glass replacement about $300-$650 per window; American Window Film (undated): commercial window film $6-$18/sqft installed, solar film $6-$10 |
| Shower / Mirror Installer | frameless shower enclosures (door and panel) installed, with the vanity mirror | $1,800-$3,600 each | 30% | 1 unit | HomeGuide 2026: frameless shower door $600-$1,900 installed (glass $400-$1,300 plus $200-$600 labor); Angi 2026: frameless shower door average $1,400, most $1,000-$2,500; Homewyse 2026: mirror installed $13.86-$19.93/sqft |
| Storefront / Curtain Wall Installer | glazed elevation area | $75-$140 per sqft | 20% | 400-1,200 sqft | Insight Glass 2026 (Bay Area): thermally broken storefront with tempered low-E IGU $90-$140/sqft installed; one 8x9 ft opening with frame and door $5,500-$9,500; Hotian Windows 2026: storefront $50-$150/sqft installed |
| Garage Flooring / Coatings Installer | garage slab area coated | $7.00-$12 per sqft | 35% | 400-600 sqft | The Garage Guide 2026: polyaspartic $5-$12/sqft installed; 2-car garage (400 sqft) $2,400-$6,000; The Garage Guide 2026: diamond grinding $1-$3/sqft; crack repair $0.50-$2/sqft; old coating removal $1-$3/sqft; JobFlex owner 2026: epoxy flake garage floor sells at about $10/sqft |

#### Site & landscape

| Specialty | Sold | National all-in | O&P | Typical job | Sources |
|---|---|---|---:|---|---|
| Landscaping Contractor | landscaped area installed (planting beds plus new lawn) | $5.00-$12 per sqft | 30% | 1,000-3,000 sqft | HomeGuide 2026: sod $1-$2/sqft installed; shrub planted $25-$85; tree planted $200-$700; Fixr 2025: landscaping $5-$20/sqft, average job $10,000 ($8,000-$15,000) |
| Hardscape / Paver Contractor | paver patio area installed | $13-$25 per sqft | 30% | 200-600 sqft | HomeGuide 2026: paver patio $10-$17/sqft installed (materials $4-$6, labor $6-$11); American Paving Design 2025: patios, walks and pool decks $10-$25/sqft installed; Fixr 2025: segmental retaining wall $15-$35/sqft of face, labor from $15/sqft |
| Irrigation Contractor | irrigation zones installed (whole system spread per zone) | $800-$1,600 each | 30% | 4-8 unit | HomeGuide 2026: $600-$2,000 per zone; $3,000-$10,000 for a 1/4-acre lawn; LawnLove 2025: $590-$1,340 per zone; drip $225-$900 per zone; Fixr 2025: 5 zones $3,250-$6,000; 7 zones $4,550-$7,000 |
| Asphalt / Paving Contractor | new asphalt driveway area on a new base | $6.00-$12 per sqft | 25% | 400-1,200 sqft | HomeGuide 2026: asphalt driveway $5-$12/sqft installed; 20x20 ft $2,000-$4,800; HomeAdvisor 2025: new asphalt driveway $7-$13/sqft; average job $5,347; hot mix $100-$200/ton |
| Pool & Spa Installation | pool water surface area (gunite pool, deck, fence and equipment included) | $120-$260 per sqft | 30% | 300-500 sqft | HomeGuide 2026: gunite pool $100-$250/sqft, $50,000-$120,000; Fixr 2025: concrete pool $50,000-$90,000 (12x24 shotcrete, tiled, basic equipment $60,000); built-in gunite $100.50-$278/sqft; Pool Research 2024: 14x28 concrete pool about $60,000 ($30,000-$150,000) |
| Snow & Ice Removal Contractor | paved lot area served for one season (about 10 pushes and 15 salt runs) | $0.12-$0.30 per sqft | 25% | 20,000-80,000 sqft | HomeGuide 2026: commercial lots $50-$200/hr; salting $150-$350 per acre; Trillium 2026: seasonal contracts $2,000-$10,000; lots over 50,000 sqft $300-$600+ per event; LawnLove 2026: about $6,000 per season for a 50-space lot |
| Tree Removal / Arborist | trees removed (mixed sizes), per tree all-in | $500-$1,500 each | 30% | 1-3 unit | HomeGuide 2026: tree removal $400-$1,200 per tree on average, $200 small to $3,000 large; Fixr 2025: $400-$1,100 per tree; 30-60 ft $450-$700; debris haul-off $150-$300 extra |
| Stump Grinding Contractor | stumps ground (mixed sizes), per stump all-in | $100-$250 each | 35% | 1-5 unit | HomeGuide 2026: $120-$400 for the first stump, $30-$60 each additional; $2-$6 per inch; Fixr 2025: $150-$300 per job (average $200); additional stumps $40-$75; $100 minimum |
| Erosion Control / Silt Fence Contractor | perimeter silt fence length, the site's other BMPs spread over it | $15-$35 per linear ft | 20% | 300-1,200 linear ft | HomeGuide and Angi 2026: silt fence $3-$7/linear ft installed, average job $835; $500 minimums; MnDOT average bids 2014 (MN Stormwater Manual): silt fence $1.99-$2.58/ft; straw and compost logs $2.58-$2.90/ft |

#### Waterproofing & envelope

| Specialty | Sold | National all-in | O&P | Typical job | Sources |
|---|---|---|---:|---|---|
| Waterproofing Contractor | membrane area (net substrate) | $7.00-$15 per sqft | 20% | 1,500-5,000 sqft | Jaspector (undated): below-grade sheet membranes $7-$15/sqft installed on new construction, premium $15-$25; dimple drainage board $2-$6/sqft; ConstructEstimates 2026: sheet membrane waterproofing $8-$15/sqft installed; below-grade exterior membrane $7-$15/sqft |
| Sealant / Caulking Contractor | joint length sealed | $5.00-$14 per linear ft | 20% | 1,000-5,000 linear ft | Rockford Commercial Caulking (undated): exterior wall joint replacement $4-$12/lf; expansion joints $7-$18; window perimeter at elevated access $10-$16; WCP Building Renewal 2025: window perimeter sealant $10-$16/lf; expansion joints $14-$18/lf; cold joints $12-$20/lf |
| Exterior Insulated Panel / Metal Cladding Installer | net panel area | $28-$55 per sqft | 20% | 2,000-8,000 sqft | Alcadex 2025: ACM panels $40-$55/sqft installed (materials and labor); 4 mm FR panel material $22-$30/sqft; Wallnova 2025: insulated metal panels $7-$14/sqft (panel price) |
| Crawlspace Repair Contractor | crawlspace floor area encapsulated | $4.00-$9.00 per sqft | 35% | 1,000-2,000 sqft | Palm Build 2026: encapsulation $1,500-$15,000, averaging about $5,500; $3-$7/sqft standard, up to $10/sqft for wet or damaged spaces; Palm Build 2026: crawl space dehumidifier $1,000-$3,500 installed; liner floor and walls $1,200-$4,000 installed; HomeGuide 2026: crawl space dehumidifier $1,000-$3,000 installed |
| Basement Waterproofing Specialist | perimeter length of interior drain | $60-$120 per linear ft | 35% | 80-180 linear ft | This Old House 2026: weeping-tile drainage system $60-$120/lf; sump pump installed $1,200-$2,500; Jaspector (undated): interior perimeter drains $70-$150/lf installed; sump pump $1,200-$3,500; Basement Waterproofing Scientists 2025: interior drain tile $40-$85/lf |
| House Wrap / Air Barrier Installer | wall area wrapped, less openings over 20 sqft | $1.25-$2.75 per sqft | 25% | 1,800-3,200 sqft | Homewyse 2026: install house wrap $0.70-$0.86/sqft (wrap, fasteners, basic flashing); Well Built Florida 2026: Tyvek installed about $0.85-$2.50/sqft (material $0.60-$1.50, labor $0.25-$1.00); 2,000 sqft mid-range job $3,190-$4,590 |

#### Specialty systems

| Specialty | Sold | National all-in | O&P | Typical job | Sources |
|---|---|---|---:|---|---|
| Solar / Renewable Energy Installer | solar modules in the array (about 0.42 kW DC each) | $1,050-$1,400 each | 30% | 16-28 unit | NREL Spring 2025 Solar Industry Update: residential PV about $2.56-$3.03/W before incentives; Solar.com 2026: average 12 kW system about $30,500 before incentives |
| Smart Home / Automation Contractor | home floor area served by the system | $6.00-$12 per sqft | 30% | 2,500-4,500 sqft | unanswered.io 2026: Control4 targeted installs $15,000-$30,000, mid-size homes $30,000-$75,000; Audio Den: 3-4 bedroom Control4 system $20,000 or more (audio in 6-8 rooms, video in 4) |
| EV Charger Installer | Level 2 chargers installed (40-48 A, charger included) | $1,300-$2,800 each | 30% | 1 unit | HomeGuide 2026: complete Level 2 charger install $1,200-$3,000; HomeGuide 2026: Level 2 charger unit $300-$800 before installation |
| IT / Data Cabling Contractor | cable drops installed, terminated and certified (Cat6) | $200-$375 each | 20% | 24-96 unit | The Network Installers 2026: Cat6 drop $125-$400 installed, terminated and tested; Cat6A $175-$500; The Network Installers 2026: 50-150 drop projects $7,750-$64,000; telecom room setup $1,500-$4,000 |
| Residential Generator Installer | standby generators installed (22-26 kW air-cooled, whole-house ATS) | $10,500-$16,000 each | 30% | 1 unit | HomeAdvisor 2026: 20-24 kW standby unit $5,000-$6,500 plus $1,500-$5,000 installer labor; HomeAdvisor 2026: permits $50-$200 each; concrete pad about $1,000 |
| Battery Backup / Home Energy Storage Installer | battery units installed (10-15 kWh each, Powerwall 3 class) | $10,000-$16,000 each | 30% | 1-3 unit | SolarReviews 2026: Powerwall 3 $15,300-$16,200 installed before incentives; SolarReviews 2026: expansion pack $5,900 plus $700-$1,000 labor; about $1,140-$1,200 per kWh |
| Greywater System Installer | greywater sources connected (a washer, shower or lavatory group, each with its diverter) | $1,500-$3,500 each | 30% | 1-3 unit | Greywater Action: full installation laundry-to-landscape $700-$2,000, branched drain $800-$3,000, pumped $1,000-$4,000 |
| Gate & Access Control Installer | automated gates (operator, safety devices and access control per gate) | $4,500-$9,500 each | 30% | 1 unit | Fixr 2026: electric gate installed $2,500-$5,500 (average $4,000); Fixr 2026: add-ons installed keypad $400-$800, sensors $200-$2,000, intercom $1,000-$7,000 |

#### Civil & demolition

| Specialty | Sold | National all-in | O&P | Typical job | Sources |
|---|---|---|---:|---|---|
| Underground Utility Contractor | main length installed in a street (sewer, water or storm) | $350-$1,000 per linear ft | 15% | 200-800 linear ft | Renton WA award 2024: 8 in. sewer main replacement with a manhole and street restoration $1,041/linear ft (about 750 LF); US EPA CWNS cost curve 2022: sewer project $1,120/ft at 300 ft, $650/ft at 1,000 ft; City of Phoenix unit cost study 2024: 8 in. sewer with pavement $350/LF; 8 in. ductile iron water with pavement $410/LF |
| Septic System Installer | complete septic system for one home (3-4 bedrooms) | $7,000-$15,000 each | 25% | 1 unit | HomeAdvisor 2026: new septic system $3,593-$12,463, average $8,017; mound or aerobic $10,000-$20,000; theseptic.guide 2026: conventional $3,000-$8,000, chamber $5,000-$12,000; tank, drainfield, excavation, piping, permits, perc test, survey and grading together $6,150-$19,500; HomeGuide 2026: conventional system $3,500-$8,500 installed, plus $500-$3,500 for permits, soil testing and design |
| Demolition Contractor | building floor area demolished | $8.00-$16 per sqft | 20% | 1,200-2,500 sqft | HomeAdvisor 2026: house demolition $4-$17/sqft, average $15,800 ($6,000-$25,000); HomeGuide 2026: house demolition $4-$10/sqft, up to $25/sqft with asbestos; $3-$7/sqft with the foundation left; WisDOT 2023-25 average bids: removing a building $7,500-$14,006 each |
| Concrete Cutting / Coring Contractor | linear ft of saw cut | $14-$40 per linear ft | 20% | 80-300 linear ft | Concrete Cutting Miami 2025: flat sawing $4-$7/linear ft for residential slabs; $3-$12/linear ft typical; wall sawing $8-$25/linear ft; Castle Company 2026: slab sawing $1.20-$1.50 per inch-foot; cores $50 per inch of bit diameter; removal $4-$8/sqft plus disposal |
| Mass Excavation Contractor | cubic yards of mass cut (bank) | $12-$30 per cu yards | 15% | 10,000-30,000 cu yards | WisDOT 2023-25 average bids: excavation common $8.65-$14.47/cu yd; borrow $7.39-$9.11/cu yd; TxDOT 3-year average (Caliche 2026): roadway excavation $13/cu yd; WSDOT NWR 2023-26 (JobFlex utility research): structure excavation incl. haul, median $31.50/cu yd |
| Utility Excavation Contractor | trench length excavated, bedded, backfilled and restored | $45-$130 per linear ft | 20% | 100-400 linear ft | JobFlex utility research 2026 (WSDOT, Neenah WI, TxDOT bids): trench excavation and backfill $15-$40/LF at 0-5 ft, $25-$60/LF at 5-10 ft national, before restoration; Excavating Insurance Partners 2025: potholing $700-$1,100 per hole; HomeAdvisor 2026: trenching $5-$12/linear ft standard, $13-$40 for large or difficult digs |
| Trenching Contractor | trench length | $8.00-$28 per linear ft | 20% | 300-1,500 linear ft | HomeAdvisor 2026: trenching $5-$12/linear ft standard, $13-$40 for large or difficult digs; average job $950; JobFlex utility research 2026: trench excavation and backfill 0-5 ft $15-$40/linear ft national (public bids); TxDOT 3-year average (Caliche 2026): trench excavation protection $5.70/linear ft |
| Hydrovac Excavation Contractor | potholes dug and logged (all-in per pothole, truck time included) | $600-$1,200 each | 20% | 4-16 unit | Excavating Insurance Partners 2025: potholing $700-$1,100 per hole; Hydrovac News 2025: truck and crew $250-$500/hour; a one-day job $3,300 with mobilization, water and disposal; Hole Hogz 2025: $300-$400/hour; about $500 per pothole subject to minimums |
| Directional Drilling / HDD Contractor | bore length, entry to exit | $35-$100 per linear ft | 20% | 200-800 linear ft | Excavating Insurance Partners 2025: $15-$25/ft residential, $25-$50 suburban crossing, $50-$75 urban, $60-$100 rock; a 300 ft crossing bid $24,470 all-in; HomeGuide 2026: directional boring $10-$30/linear ft, $1,000-$9,000 a job (bore only); Pro Trenchless 2026: residential bores $15-$50/ft, range $10-$100 |
| Rock Excavation / Blasting Contractor | cubic yards of rock removed (bank, to the neat lines) | $30-$100 per cu yards | 20% | 500-3,000 cu yards | WisDOT 2023-25 average bids: excavation rock $9.84-$21.83/cu yd (highway mass rock); WisDOT 2023-25 average bids: storm sewer rock excavation $67.88-$101.43/cu yd (trench rock) |
| Shoring / Excavation Support Contractor | square feet of shored excavation face | $45-$120 per sqft | 20% | 2,000-6,000 sqft | WisDOT 2023-25 average bids: temporary shoring (structure) $36.24-$99.19/sqft; left in place $74.57-$180/sqft; WisDOT 2023-25 average bids: steel sheet piling delivered $27-$50/sqft plus driving $2-$8/sqft; WSDOT NWR 2023-26 (JobFlex utility research): trench shoring or extra excavation $1-$5/sqft |
| Dewatering Contractor | header length dewatered, about a month of pumping | $150-$350 per linear ft | 20% | 200-600 linear ft | Aramenco, 2025: wellpoint dewatering for a medium commercial site about $22,000; sites over 2,000 m2 $30,000-$100,000+; Puyallup WA bid tab, 2025 (via JobFlex utility research): dewatering lump sum $2,500-$175,377 across 4 bidders; national estimate $300-$2,500/day |
| Soil Stabilization / Lime Treatment Contractor | area treated 8-12 in. deep with lime | $7.00-$15 per sq yards | 15% | 5,000-25,000 sq yards | TxDOT San Antonio District average low bids, 2024: lime treatment of existing material $3.30/SY (6 in.) and $3.56/SY (12 in.), quicklime slurry $200/ton; TxDOT San Antonio District average low bids, 2024: cement $130.70/ton; cement treatment of subgrade (6 in.) $2.16/SY |
| Compaction / Proofrolling Contractor | pad or subgrade area compacted and proof-rolled | $2.50-$6.50 per sq yards | 18% | 4,000-16,000 sq yards | Village of Bluffton OH bid tab, 2025: subgrade compaction $1.50-$3.00/SY; excavation of subgrade (undercut) $25-$75/CY; TxDOT San Antonio District average low bids, 2024: proof rolling $60/hr |
| Underground Utility Installation Contractor | total length of utility runs | $120-$300 per linear ft | 18% | 600-2,000 linear ft | HomeAdvisor and bid tabs, 2024-2026 (via JobFlex utility research): side sewer in a yard $60-$250/LF; water service in a yard $50-$150/LF; WisDOT, Forney TX and Leominster MA bids, 2023-2025 (via JobFlex utility research): 48 in. precast manhole $3,400-$13,000; new connection to an existing main $3,000-$13,500 |
| Water Utility Installation Contractor | length of water main | $250-$600 per linear ft | 15% | 500-2,000 linear ft | City of Phoenix unit cost study, 2024 (via JobFlex utility research): DI main with pavement 6 in. $350, 8 in. $410, 12 in. $490/LF; Mercer Island WA engineer's estimates, 2024-2025 (via JobFlex utility research): DI main replacements with hydrants and services $411-$754/LF |
| Sanitary Sewer Contractor | side sewer length, building to the main | $90-$280 per linear ft | 25% | 50-120 linear ft | HomeAdvisor 2026 (via JobFlex utility research): sewer line installed or replaced by trench $50-$250/linear ft; On Pattison 2026 (Seattle): open-cut side sewer $120-$350/linear ft, typical job $10,000-$18,000; Leominster MA bid 2025: 4-6 in. sewer pipe at 0-4 ft $125-$200/linear ft, trench included |
| Storm Sewer Contractor | length of storm pipe | $200-$600 per linear ft | 15% | 300-1,200 linear ft | City of Houston storm sewer unit cost rates, 2023 (via JobFlex utility research): all-in 24 in. $550/LF, 36 in. $640/LF incl. 20% engineering and contingency; WisDOT Average Unit Price List, 2025: RCP Class III storm sewer 18 in. $104/LF, 24 in. $136/LF; TxDOT 3-year statewide averages (Caliche), 2026: RC pipe Class III 18 in. $82/LF, 24 in. $118/LF |
| Culvert Installation Contractor | culvert length | $250-$800 per linear ft | 15% | 30-70 linear ft | WisDOT Average Unit Price List, 2025: corrugated steel culvert 24 in. $87/LF, 36 in. $179/LF; RCP Class III 36 in. $217/LF; apron endwalls 24-36 in. $604-$1,535 each; TxDOT 3-year statewide averages (Caliche), 2026: RC pipe Class III 36 in. $187/LF; Icon Grading, 2026: driveway culverts 12-15 in. $1,500-$3,000; 18-24 in. and longer $3,000-$7,500 |
| Catch Basin / Manhole Installation Contractor | structures installed (manholes and catch basins) | $6,000-$15,000 each | 15% | 2-8 unit | WisDOT Average Unit Price List, 2025: catch basin 4 ft $3,235; manhole 4 ft $3,382; inlet 2x3 ft $2,710 each; WisDOT, Forney TX, Leominster MA and WSDOT bids, 2023-2026 (via JobFlex utility research): 48 in. precast manhole 0-10 ft $3,400-$13,000; WSDOT Northwest Region bids, 2023-2026 (via JobFlex utility research): catch basin Type 2 48 in. median $4,998 |
| Lift Station Installation Contractor | duplex submersible stations built | $500,000-$1,500,000 each | 15% | 1 unit | City of Lacey WA, 2026: Lift Station 6 replacement awarded $1,847,251 (9 bids; engineer's estimate $2.30M); Jefferson Parish LA, 2024: 2700 Destrehan lift station upgrade awarded $841,410; City of Norman OK, 2023: Post Oak lift station (1,000 gpm at 120 ft TDH) $580,484 before its force main |
| Pump Station Installation Contractor | pump stations built (2-4 pumps) | $1,200,000-$4,000,000 each | 15% | 1 unit | West Yost for the City of Tracy CA (2012 dollars): booster stations 0.5-10 mgd $1.0-$2.3M, about $1.5-$3.4M at the 2025 ENR cost index; City of Boerne TX, 2025: ground storage tank and 3,604 gpm pump station base bid about $8.9M; Bay County FL, 2025: Frankfort Avenue booster station improvements awarded $8.57M |
| Utility Vault / Duct Bank Contractor | precast vaults set, with their duct runs | $25,000-$75,000 each | 18% | 1-3 unit | Duct Bank One, 2025: installed duct bank 2-way 2 in. PVC $175-$230/LF, 8-way 4 in. $355-$460/LF; WisDOT Average Unit Price List, 2025: Schedule 40 PVC conduit 4 in. $22.85/LF; steel pull box 12x36 in. $1,400 |
| Conduit / Duct Bank Installation Contractor | duct bank length | $100-$280 per linear ft | 18% | 300-1,200 linear ft | Duct Bank One, 2025: installed cast-in-place duct bank 2-way 2 in. PVC $175-$230/LF, 8-way 4 in. $355-$460/LF; WisDOT Average Unit Price List, 2025: Schedule 40 PVC conduit 2 in. $11.69/LF, 4 in. $22.85/LF installed |
| Septic Repair & Maintenance Contractor | one repair visit: diagnosis, pump-out and a typical component repair | $800-$3,500 per job | 30% | 1 job | HomeAdvisor 2026: septic repair average $1,829, typical $627-$3,043; theseptic.guide 2026: septic repairs $600-$3,000 on average; baffle $250-$900, distribution box $500-$1,500; HomeAdvisor 2026: tank pumping $290-$550 |

#### Fabrication & custom work

| Specialty | Sold | National all-in | O&P | Typical job | Sources |
|---|---|---|---:|---|---|
| Metal Fabrication Contractor | railing length along the top rail (guards plus handrails) | $150-$325 per linear ft | 25% | 40-120 linear ft | Handrail Cost Estimator 2026: custom mild-steel railing from about $250/linear ft installed for straight runs |
| Prefab / Modular Builder | finished floor area of the modular home | $120-$200 per sqft | 30% | 1,400-2,400 sqft | HomeAdvisor 2025: modular home $180,000-$360,000 total (average $270,000); $80-$160/sqft installed; HomeAdvisor 2025: base unit $50-$100/sqft; foundation $7-$30/sqft; delivery $5,000-$15,000; permits $500-$5,000 |
| Signage & Graphics Installer | signs installed (a channel-letter set on one raceway, a cabinet or a monument each count as one) | $5,000-$12,000 each | 25% | 1 unit | Flexlume 2025: channel-letter signs $2,000-$20,000; basic signs $4,000-$6,000 |
| Elevator / Lift Installer | landings (stops) served by a new low-rise passenger elevator | $30,000-$60,000 each | 20% | 2-4 unit | Elevator Blueprint 2026: MRL elevator $100,000-$250,000 installed; hydraulic 2-6 stops $75,000-$150,000; Elevator Blueprint 2026: maintenance $2,400-$14,000/yr; full modernization $120,000-$400,000 |

#### General & professional

| Specialty | Sold | National all-in | O&P | Typical job | Sources |
|---|---|---|---:|---|---|
| General Contractor | remodeled or added floor area | $120-$260 per sqft | 35% | 400-1,000 sqft | HomeGuide 2026: home addition $125-$250/sqft; a 600 sqft addition $75,000-$150,000; JobFlex remodel method sec. 8 (reviewed 2026): garage conversion $90-$170/sqft and basement finish $45-$85/sqft before markup; JobFlex remodel price audit 2026: rough plumbing $600-$1,200 per fixture in place, new circuit $450-$900 before markup |
| Design-Build Contractor | building gross floor area, design through closeout | $220-$420 per sqft | 30% | 1,000-3,000 sqft | HomeGuide 2026: custom home $280-$450+/sqft; HomeGuide 2026: home addition $125-$250/sqft; NAHB 2024 Cost of Constructing a Home: construction cost $162/sqft before builder overhead and profit |
| Home Inspector / Energy Auditor | one standard inspection with report and review, 2,000-2,500 sqft home | $350-$600 per job | 20% | 1 job | Fixr 2025: home inspection $300-$500 (avg $400); 2,000 sqft $360-$500; re-inspection $175-$225; homeinspectioncost.net 2026: standard inspection $300-$450; add-ons radon $100-$200, sewer scope $150-$300, WDO $75-$150, pool/spa $100-$300 |
| Permit & Code Consultant | one commercial permit, intake through certificate of occupancy | $6,000-$16,000 per job | 20% | 1 job | JobFlex estimate 2026 (no cost guide fetchable on 2026-09-18): 45-70 consultant hours at $110-$200/h plus fixed deliverables |
| Appliance Repair | one repair visit, one appliance | $250-$500 per job | 40% | 1 job | Fixr 2025: refrigerator repair $350-$500 (avg $400); service call $70-$120; technician $100-$250/h; Fixr 2025: sealed-system repair $800-$1,200; compressor $500-$1,000; emergency calls add 10-20% |
| Pest & Termite Control Contractor | initial general pest service with two follow-ups, one home | $250-$550 per job | 40% | 1 job | Fixr 2025: one-time or initial pest visit $158-$288 (avg $223); quarterly $98-$178 per visit; annual plan $471-$867; Fixr 2025: subterranean termite treatment $7-$14/linear ft; drywood fumigation $1,570-$2,857 |
| Restoration & Mitigation Contractor | affected floor area, mitigation through rebuild | $22-$45 per sqft | 20% | 300-700 sqft | Fixr 2025: water damage restoration $1,200-$5,000 (avg $3,000); extraction and drying $3.75-$4.25/sqft clean water, $7-$7.50 black water; Fixr 2025: restoration by material: drywall $1.50-$3/sqft, carpet $4.75-$10.50, hardwood $10-$15, mold remediation $4.75-$5.50; labor $70-$200/h |
| Residential New Home Builder | conditioned floor area, lot excluded | $170-$260 per sqft | 25% | 1,800-3,000 sqft | NAHB 2024 Cost of Constructing a Home: $428,215 construction cost, $162/sqft for 2,647 sqft, before builder overhead and profit; HomeGuide 2026: cost to build a house $180-$450+/sqft by size, grade and location; NAHB 2024: exterior finishes 13.4% and major systems rough-ins 19.2% of construction cost |
| Custom Home Builder | conditioned floor area, lot excluded | $300-$550 per sqft | 20% | 2,800-5,000 sqft | HomeGuide 2026: custom home $280-$450+/sqft, over $500/sqft in major metros; NAHB 2024 Cost of Constructing a Home: production average $162/sqft construction cost |
| Spec Home Builder | conditioned floor area at the standard package, lot excluded | $145-$225 per sqft | 25% | 1,600-2,600 sqft | NAHB 2024 Cost of Constructing a Home: $162/sqft construction cost for 2,647 sqft, before overhead and profit; HomeGuide 2026: cost to build a house $180-$450+/sqft; builder-grade at the low end |
| ADU (Accessory Dwelling Unit) Builder | ADU floor area | $200-$400 per sqft | 30% | 400-800 sqft | Angi/HomeGuide 2026: ADU about $180,000 on average, $150-$300/sqft; Cost guides 2025-26: detached ADU $200-$400/sqft; JobFlex remodel method sec. 8 (reviewed 2026): garage conversion $90-$170/sqft before markup |
| Manufactured Home Installer | home floor area set | $10-$20 per sqft | 30% | 1,000-2,000 sqft | JobFlex estimate 2026 (cost guides not fetchable on 2026-09-18): double-section transport, set, pad, piers, anchors, utilities, skirting and steps $15,000-$30,000 |
| Mobile Home Setup / Tie-Down Contractor | one home re-leveled and tied down, single section | $3,000-$7,000 per job | 35% | 1 job | JobFlex estimate 2026 (cost guides not fetchable on 2026-09-18): re-level $600-$1,500, anchors $90-$180 each, skirting $10-$22/linear ft |
| Commercial Tenant Improvement (TI) Contractor | leased area built out | $110-$190 per sqft | 15% | 2,000-10,000 sqft | Cushman & Wakefield 2026 Office Fit Out Cost Guide: Americas average $149/sqft; SF $228, Seattle $223; Cushman & Wakefield 2025: Northeast and West $175/sqft, Midwest $123/sqft |
| Garage Builder | garage floor area | $55-$110 per sqft | 30% | 480-672 sqft | Garage cost guides 2026 (Angi, HomeGuide): detached garage $50-$100/sqft on average, high-end to $120/sqft; Garage cost guides 2026: 24x24 finished detached $35,000-$50,000; slab $4-$8/sqft; roof about $4-$5/sqft; permits $1,200-$1,500 |
| Chimney Sweep / Inspection Contractor | one flue swept with a Level 1 inspection and report | $225-$450 per job | 40% | 1 job | Fixr 2025: chimney cleaning $100-$500 (avg $400); wood stove $200-$500; Level 2 inspection $150-$1,000; Fixr 2025: liner $1,000-$7,000 (avg $2,500); cap $425; crown repair $900; damper $150-$500 |
| Residential Energy Audit Contractor | one comprehensive home energy audit | $500-$950 per job | 20% | 1 job | HomeAdvisor 2026: comprehensive audit $500-$900; all audits avg $437 ($212-$698); HomeAdvisor 2026: blower door test $350, duct leakage test $100, infrared imaging $200 each |
| Blower Door Testing Contractor | one single-family blower door test with report | $200-$450 per job | 20% | 1 job | HomeGuide 2026: blower door test $200-$250 basic, $350-$450 high-tech; HomeAdvisor 2026: blower door test about $350; duct leakage test about $100 |
| Thermal Imaging Inspection Contractor | one whole-house infrared envelope scan with report | $250-$550 per job | 20% | 1 job | HomeAdvisor 2026: thermal imaging inspection avg $400, typical $200-$500; HomeAdvisor 2026: $50-$200 as an add-on to a home inspection |
| Permit Expediter | permits carried from application to issuance | $800-$3,000 each | 20% | 1-3 unit | PermitPlace 2025: expediter fee residential $500-$2,500, commercial $1,500-$5,000 per project; PermitFlow 2025: expediter hourly rates $75-$150+ |
| Code Compliance Specialist | one code compliance engagement (small commercial or change of use) | $5,500-$13,000 per job | 20% | 1 job | Seattle SDCI 2025: code-related services billed at $274/hour; HighSpire 2025: construction consultants $100-$200/hour |
| Appliance Repair Contractor | one appliance repair visit (diagnosis, part and labor) | $150-$450 per job | 40% | 1 job | HomeGuide 2026: appliance repair $100-$400; labor $50-$125/hr; service call $70-$130; Cinch 2026: repair ranges refrigerator $300-$1,000, washer $125-$450, dishwasher $160-$300 |
| Pest Exclusion / Rodent Proofing Contractor | one whole-home rodent exclusion with trapping | $900-$2,400 per job | 30% | 1 job | PestControlPricing 2026: full-home rodent exclusion $500-$3,000+, avg $1,200; 1960s-80s homes $800-$2,000; PestControlPricing 2026: inspection $99-$250; one-way doors $200-$400 each; insulation replacement $1-$2/sqft |
| Water Damage Restoration Contractor | affected floor area, dried and rebuilt | $15-$32 per sqft | 21% | 200-600 sqft | HomeAdvisor 2026: water damage restoration avg $3,868 ($1,383-$6,369); $3.50-$7.50/sqft by water category (drying only); Xactimate zip 94010 Jun 2024 (Water's Fault): air mover $38/day, dehumidifier $83.54/day, carpet extraction $0.69/sf, antimicrobial $0.45/sf; III 2019-2023: average water damage and freezing claim $15,400 |
| Fire Damage Restoration Contractor | fire- and smoke-affected floor area, cleaned and rebuilt | $25-$60 per sqft | 21% | 600-1,800 sqft | LawnStarter 2026: fire and smoke restoration $4.25-$6.50/sqft cleanup; avg $20,470 ($2,900-$38,325); Palm Build 2026: fire damage restoration $3K-$51K; III 2019-2023: average fire and lightning claim $88,170 |
| Mold Remediation Contractor | mold-affected area remediated | $12-$30 per sqft | 25% | 80-240 sqft | HomeGuide 2026: mold remediation $15-$30/sqft, $1,500-$6,000 average; RestoreAdvisor 2026: $10-$25/sqft standard; 100-200 sqft jobs $2,500-$6,500; RestoreAdvisor 2026: HEPA air scrubbers $75-$120/day; clearance $150-$400 per visit |
| Asbestos / Lead Testing Contractor | one pre-renovation asbestos survey of a house | $450-$1,000 per job | 20% | 1 job | Angi 2026: asbestos testing avg $483, typical $231-$776; Asbestos Institute 2025: testing $250-$850; lab about $22 per sample, extra samples $25-$75; MJC Environmental 2025: lead paint inspection $300-$700, XRF $250-$700 |
| Radon Mitigation Contractor | radon mitigation systems installed | $950-$2,000 each | 30% | 1 unit | HomeGuide 2026: radon mitigation $800-$2,500, avg about $1,200; Bob Vila 2022: fan $100-$300+, U-tube $10-$20, permits $25-$150 |
| Environmental Remediation Contractor | impacted soil excavated and disposed | $150-$320 per cu yards | 18% | 200-600 cu yards | Illinois EPA LUST FY2025: excavation, transport and disposal $87.70/cu yd; backfill $30.77/cu yd; Illinois EPA LUST FY2025: UST removal $3,231 (110-999 gal) to $4,847 (1,000-14,999 gal); USTContractors 2026: petroleum soil $50-$200/ton delivered to a licensed facility |
| Insurance Repair Contractor | damaged floor area repaired to pre-loss | $22-$55 per sqft | 21% | 300-700 sqft | III 2019-2023: average claim $15,400 water damage and freezing, $14,747 wind and hail; HomeAdvisor 2026: drywall replacement $1.50-$3/sqft; Xactimate zip 94010 Jun 2024 (Water's Fault): 20-yd dumpster $904.52, tear out drywall $1.64/sf |
| Disaster Rebuild Contractor | rebuilt floor area | $150-$300 per sqft | 30% | 1,200-2,400 sqft | Copeland Insurance 2025: rebuild about $150/sqft national average, $100-$500 range; III 2019-2023: average fire and lightning claim $88,170 |

#### Roadway & transportation

| Specialty | Sold | National all-in | O&P | Typical job | Sources |
|---|---|---|---:|---|---|
| Roadway / Highway Contractor | roadway pavement area, lanes plus shoulders | $85-$170 per sq yards | 15% | 25,000-60,000 sq yards | Under the Hard Hat 2025: two-lane rural road $2-3M/mile, four-lane rural highway $4-6M/mile; AsphaPro 2026: highway $80-$200/sq yd all-in; WisDOT avg unit prices FY2023-25: HMA $68-$100/ton, base aggregate $12-$24/ton, common excavation $8.65-$14.47/CY |
| Road Construction Contractor | road centerline length, 28 ft street with curb both sides | $250-$600 per linear ft | 15% | 800-2,200 linear ft | AsphaPro 2026: residential street $30-$60/sq yd, collector $40-$80/sq yd; rural 2-lane $1-3M/mile; Under the Hard Hat 2025: two-lane rural road $2-3M/mile, two-lane urban road $3-5M/mile; TxDOT 3-yr avg bids (Caliche 2026): curb and gutter $36/LF, dense-graded HMA $91/ton, roadway excavation $13/CY |
| Road Milling Contractor | milled area | $3.00-$8.00 per sq yards | 15% | 4,000-16,000 sq yards | WisDOT avg unit prices FY2023-25: asphalt milling $1.50-$1.99/SY (large state jobs); Federal Way WA overlay bid tab 2026: planing $4.20-$8.00/SY; WSDOT Northwest Region bids 2023-26: planing median $8.50/SY |
| Chip Seal Contractor | treated road area | $2.50-$6.00 per sq yards | 15% | 10,000-50,000 sq yards | SaveMyRoad (Ergon) 2025: conventional chip seal averages $2.25/sq yd; WisDOT avg unit prices FY2023-25: seal-coat asphalt $2.77-$4.39/gal; seal coat $165.90/ton of cover aggregate |
| Slurry Seal Contractor | treated pavement area | $2.25-$5.00 per sq yards | 18% | 8,000-40,000 sq yards | SaveMyRoad (Ergon) 2025: conventional slurry seal averages $2.50/sq yd, premium slurry $2.75/sq yd; Homewyse May 2026: slurry seal $0.66-$1.08/sqft on small residential jobs |
| Crack Sealing Contractor | crack length sealed | $0.90-$2.50 per linear ft | 18% | 3,000-15,000 linear ft | TruTec 2026: crack sealing $0.60-$1.00/LF municipal, $0.90-$1.50/LF commercial, $1.50-$3.00/LF routed; HomeGuide 2026: asphalt crack sealing $0.50-$3.00/LF, $100-$250 minimum |
| Sealcoating Contractor | sealed pavement area | $0.22-$0.55 per sqft | 25% | 10,000-60,000 sqft | HomeGuide 2025: asphalt sealcoating $0.14-$0.25/sqft; FixAsphalt 2025: lot sealcoating $0.20-$0.50/sqft; with crack sealing and striping $0.65-$0.90/sqft (NJ) |
| Pothole Repair Contractor | patched area | $7.00-$17 per sqft | 22% | 150-650 sqft | FixAsphalt 2025: asphalt patching $4-$10/sqft, $2,500-$5,000 minimum (NJ); JobFlex utility bid research 2026: full-depth HMA patch $40-$150/sq yd national, saw-cut $1.50-$3/LF |
| Concrete Curb & Gutter Contractor | curb and gutter length | $35-$75 per linear ft | 18% | 200-1,000 linear ft | WisDOT avg unit prices FY2023-25: 30 in. curb and gutter $24-$47/LF; TxDOT 3-yr avg bids (Caliche 2026): curb and gutter Ty II $36/LF; Homewyse May 2026: concrete curb $47-$58/LF on a small job |
| Sidewalk Contractor | sidewalk area | $9.00-$18 per sqft | 20% | 500-2,500 sqft | TxDOT 3-yr avg bids (Caliche 2026): 4 in. sidewalk $75/sq yd ($8.33/sqft); WisDOT avg unit prices FY2023-25: 4 in. sidewalk $6.62-$7.63/sqft; Homewyse May 2026: concrete sidewalk $12.00-$14.71/sqft on a small job, no base or removal |
| ADA Ramp Contractor | curb ramps built | $4,500-$12,000 each | 18% | 2-8 unit | TxDOT 3-yr avg bids (Caliche 2026): curb ramp Ty 1 $2,790 each (ramp item only); WisDOT avg unit prices FY2023-25: detectable warning field $43-$54/sqft, 4 in. sidewalk $6.62-$7.63/sqft |
| Parking Lot Construction Contractor | paved lot area | $45-$95 per sq yards | 20% | 2,000-8,000 sq yards | AsphaPro 2026: residential street or lot pavement $30-$60/sq yd; all-in components $4.85-$14.30/sqft; WisDOT avg unit prices FY2023-25: HMA $68-$100/ton, base aggregate $12-$24/ton, curb and gutter $24-$47/LF |
| Parking Lot Maintenance Contractor | lot area maintained | $0.28-$0.70 per sqft | 25% | 20,000-100,000 sqft | FixAsphalt 2025: sealcoat with crack sealing and striping $0.65-$0.90/sqft (NJ); crack filling $1-$2/LF; HomeGuide 2025: sealcoating $0.14-$0.25/sqft; TruTec 2026: commercial crack sealing $0.90-$1.50/LF |
| Traffic Control / Flagging Services | flagger-hours on site | $80-$150 per hour | 20% | 40-160 hour | WSDOT Northwest Region bids 2023-26: flaggers $74-$110/hr (median $86); Federal Way WA 2026 $60-$75/hr; JobFlex utility bid research 2026: lane closure with two flaggers, devices and a supervisor $1,000-$2,000/day national; WisDOT avg unit prices FY2023-25: arrow board $10/day, PCMS $27-$38/day, TMA $200-$390/day (long state contracts) |
| Road Striping / Pavement Marking Contractor | painted line length, 4 in. equivalent | $0.50-$1.40 per linear ft | 20% | 5,000-35,000 linear ft | WisDOT avg unit prices FY2023-25: 4 in. paint line $0.21-$0.49/LF, epoxy $0.50-$0.79/LF, epoxy arrow $222-$230 ea; FixAsphalt 2025: line striping $0.02-$0.06 per sqft of lot |
| Guardrail Installation Contractor | guardrail length, terminals included | $45-$95 per linear ft | 15% | 200-800 linear ft | WisDOT avg unit prices FY2023-25: MGS guardrail $26.92-$30.76/LF; MGS energy-absorbing terminal $3,709-$3,986 ea; TxDOT 3-yr avg bids (Caliche 2026): guardrail end treatment installed $3,138 ea |
| Road Sign Installation Contractor | signs installed, each with its post | $350-$900 each | 20% | 10-40 unit | WisDOT avg unit prices FY2023-25: Type II reflective signs $21-$31/sqft, 2x2 in. tubular steel posts $190-$243 ea, sign removal $27-$34 ea; FixAsphalt 2025: traffic signs $135-$250 per sign installed on lots |

#### Engineering & design

| Specialty | Sold | National all-in | O&P | Typical job | Sources |
|---|---|---|---:|---|---|
| Landscape Architect | one full-service landscape design, concept through construction observation (residential estate or small commercial site) | $18,000-$45,000 per job | 20% | 1 job | GSA CALC 2026: landscape architect ceiling rate median $127/hr (70 rates), principal landscape architect $250-$321/hr; BLS OEWS May 2025: landscape architects median wage $38.40/hr (billed at about 3x salary) |
| Architect | building gross area designed | $9.00-$20 per sqft | 20% | 2,500-8,000 sqft | Fixr 2022: architect $2-$15/sqft or 5%-20% of construction; new construction with oversight $20,000-$150,000; GSA CALC 2026: principal architect ceiling rate median $220/hr, senior architect $170/hr; BLS OEWS May 2025: architects median wage $47.73/hr (billed at about 3x salary) |
| Residential Architect | home or addition area designed (conditioned sqft) | $9.00-$22 per sqft | 20% | 1,500-3,500 sqft | Fixr 2022: architect $2-$15/sqft or 5%-20% of construction; new construction with oversight $20,000-$150,000; Fixr 2022: new home drawings only $10,000-$30,000; addition $8,000-$20,000 and remodel $16,000-$40,000 with oversight; BLS OEWS May 2025: architects median wage $47.73/hr (billed at about 3x salary) |
| Commercial Architect | building gross area (architecture only; consultants separate) | $8.00-$18 per sqft | 20% | 8,000-30,000 sqft | Fixr 2022: architects charge 5%-20% of construction cost, $100-$200/hr most common; GSA CALC 2026: principal architect ceiling rate median $220/hr, senior architect $170/hr; project architect $130/hr; BLS OEWS May 2025: architects median wage $47.73/hr (billed at about 3x salary) |
| Interior Architect | interior area planned (usable sqft) | $4.00-$10 per sqft | 20% | 4,000-15,000 sqft | Fixr 2025: interior designer $5-$17/sqft (average $10); mid-level designer $125-$200/hr; GSA CALC 2026: interior designer ceiling rate median $101/hr, senior architect $170/hr; BLS OEWS May 2025: architects median wage $47.73/hr (billed at about 3x salary) |
| Architectural Drafting / CAD Services | drawing sheets in the set | $300-$650 each | 20% | 5-12 unit | Fixr 2025: draftsman $50-$130/hr, CAD services $75-$135/hr; new building drawings $1,000-$6,000; Fixr 2025: custom plans for a 2,000 sqft home $2,000-$20,000; change requests $50-$60 per sheet; BLS OEWS May 2025: architectural and civil drafters median wage $31.80/hr |
| BIM / Revit Specialist | building area modeled | $1.00-$2.60 per sqft | 20% | 20,000-60,000 sqft | GSA CALC 2026: BIM labor categories ceiling rate median $117/hr (37 rates); CAD technician $66/hr; BLS OEWS May 2025: architectural and civil drafters median wage $31.80/hr |
| Structural Engineer | building area engineered | $1.50-$4.00 per sqft | 20% | 2,000-10,000 sqft | Fixr 2025: structural engineer $0.50-$2/sqft, $100-$500/hr; typical consult $500-$2,000; GSA CALC 2026: structural engineer ceiling rate median $159/hr (97 rates); BLS OEWS May 2025: civil engineers median wage $48.48/hr (billed at about 3x salary) |
| Civil Engineer | site area developed (1 acre = 43,560 sqft) | $0.40-$0.95 per sqft | 18% | 43,560-174,240 sqft | GSA CALC 2026: civil engineer ceiling rate median $112/hr ($130 at contractor site), principal engineer $197/hr; BLS OEWS May 2025: civil engineers median wage $48.48/hr (billed at about 3x salary) |
| Geotechnical Engineer | soil borings drilled (the job's size) | $2,200-$5,000 each | 18% | 3-9 unit | Fixr 2025: soil boring (15 ft) $1,000-$1,200; two 15-ft borings with report $1,400-$1,600; commercial $3,000-$5,000; Fixr 2025: compaction test $100-$125 per location; geotechnical engineer $65-$300/hr; GSA CALC 2026: geotechnical engineer ceiling rate median $139/hr (25 rates) |
| Environmental Engineer | one site: Phase I ESA, limited Phase II (about 8 borings) and closure | $25,000-$60,000 per job | 18% | 1 job | GSA CALC 2026: environmental engineer ceiling rate median $139/hr (322 rates); geologist $112/hr; BLS OEWS May 2025: environmental engineers median wage $51.50/hr (billed at about 3x salary) |
| Mechanical Engineer | building area served | $1.25-$3.25 per sqft | 20% | 8,000-30,000 sqft | GSA CALC 2026: mechanical engineer ceiling rate median $136/hr (333 rates), principal engineer $197/hr; BLS OEWS May 2025: mechanical engineers median wage $50.05/hr (billed at about 3x salary); Fixr 2025: mechanical engineer $90-$200/hr |
| Electrical Engineer | building area served | $1.10-$3.00 per sqft | 20% | 8,000-30,000 sqft | GSA CALC 2026: electrical engineer ceiling rate median $137/hr (394 rates), principal engineer $197/hr; BLS OEWS May 2025: electrical engineers median wage $58.00/hr (billed at about 3x salary) |
| Plumbing Engineer | building area served | $0.70-$1.90 per sqft | 20% | 8,000-30,000 sqft | GSA CALC 2026: mechanical engineer ceiling rate median $136/hr (plumbing billed at the same rates); BLS OEWS May 2025: mechanical engineers median wage $50.05/hr (billed at about 3x salary) |
| Fire Protection Engineer | building area protected | $0.60-$1.60 per sqft | 20% | 10,000-50,000 sqft | GSA CALC 2026: fire protection engineer ceiling rate median $142/hr (85 rates); BLS OEWS May 2025: mechanical engineers median wage $50.05/hr (billed at about 3x salary) |
| Transportation Engineer | roadway corridor length studied and designed | $70-$170 per linear ft | 15% | 1,000-4,000 linear ft | GSA CALC 2026: transportation engineer ceiling rate median $151/hr, traffic engineer $148/hr, principal engineer $197/hr; BLS OEWS May 2025: civil engineers median wage $48.48/hr (billed at about 3x salary) |
| Traffic Engineer | signalized intersections designed | $30,000-$70,000 each | 15% | 1-3 unit | GSA CALC 2026: traffic engineer ceiling rate $148/hr, transportation engineer median $151/hr; BLS OEWS May 2025: civil engineers median wage $48.48/hr (billed at about 3x salary) |
| Hydrology / Drainage Engineer | site area draining to the design (1 acre = 43,560 sqft) | $0.14-$0.32 per sqft | 18% | 87,120-348,480 sqft | GSA CALC 2026: hydrologist ceiling rate median $120/hr, civil engineer $112/hr, principal engineer $197/hr; BLS OEWS May 2025: civil engineers median wage $48.48/hr (billed at about 3x salary) |
| Land Surveyor | one residential parcel boundary survey with corners set (up to about 1 acre) | $900-$2,500 per job | 22% | 1 job | Fixr 2025: land survey average $600 ($400-$1,000); boundary $200-$2,000; surveyor $175-$250/hr; Bob Vila 2023: land survey average $526 ($376-$745); fence survey $250-$1,000; new construction $1,000-$2,000; BLS OEWS May 2025: surveyors median wage $36.27/hr, surveying technicians $26.08/hr |
| Boundary & Topographic Survey | one parcel boundary and topographic survey (about 0.5-2 acres, 1-ft contours) | $2,500-$6,500 per job | 22% | 1 job | Fixr 2025: topographic survey $500-$1,200; boundary $200-$2,000; 5 acres $1,500-$2,000; surveyor $175-$250/hr; Bob Vila 2023: topographic survey $500-$1,200; $0.15-$0.70 per sqft of lot |
| ALTA / NSPS Survey | one commercial parcel ALTA/NSPS survey with common Table A items (about 1-3 acres) | $2,800-$7,500 per job | 22% | 1 job | Fixr 2025: ALTA survey $2,000-$3,000; surveyor $175-$250/hr; Bob Vila 2023: ALTA survey $2,000-$3,000 |
| Utility Survey | utility length designated (quality level B) | $4.50-$11 per linear ft | 18% | 2,000-8,000 linear ft | GSA CALC 2026: subsurface utility field technician $125-$135/hr; land surveyor median $134/hr; BLS OEWS May 2025: surveying technicians median wage $26.08/hr |

#### Development & consulting

| Specialty | Sold | National all-in | O&P | Typical job | Sources |
|---|---|---|---:|---|---|
| Land Development Analysis (LDA) | one parcel analysis with 2-3 development scenarios | $12,000-$35,000 per job | 20% | 1 job | OGS Capital 2026: pre-feasibility / initial screening study $5,000-$15,000; consultants $150-$500/hr; OGS Capital 2026: standard feasibility study $15,000-$50,000; real estate development $20,000-$75,000+; consultants $150-$500/hr |
| Feasibility Study Consultant | one development feasibility study, 2 scenarios | $18,000-$55,000 per job | 20% | 1 job | OGS Capital 2026: standard feasibility study $15,000-$50,000; real estate development $20,000-$75,000+; consultants $150-$500/hr; Vertex 2018: market feasibility study $6,000-$15,000 per project (California, market portion only) |
| Highest & Best Use Analysis | one HBU analysis testing 3 candidate uses | $8,000-$25,000 per job | 20% | 1 job | OGS Capital 2026: pre-feasibility / initial screening study $5,000-$15,000; consultants $150-$500/hr; Archiwise 2025: land-use / zoning consultants $150-$350/hr; California zoning consultant fees $20,000-$100,000+ on complex projects |
| Zoning & Code Analysis | one parcel zoning and building-code analysis for a proposed use | $4,000-$14,000 per job | 20% | 1 job | Archiwise 2025: land-use / zoning consultants $150-$350/hr; California zoning consultant fees $20,000-$100,000+ on complex projects; City of Pittsburgh fee schedule 2026: ZBA variance $400, zone change petition $1,500, posted notice $450, property certification $100 |
| FAR / Density Study | one parcel FAR and density study, 3 massing scenarios | $8,000-$28,000 per job | 20% | 1 job | OGS Capital 2026: pre-feasibility / initial screening study $5,000-$15,000; consultants $150-$500/hr; Archiwise 2025: land-use / zoning consultants $150-$350/hr; California zoning consultant fees $20,000-$100,000+ on complex projects |
| Buildable Area Calculation | one parcel net buildable area exhibit and capacity calculation | $3,000-$10,000 per job | 20% | 1 job | OGS Capital 2026: pre-feasibility / initial screening study $5,000-$15,000; consultants $150-$500/hr; Archiwise 2025: land-use / zoning consultants $150-$350/hr; California zoning consultant fees $20,000-$100,000+ on complex projects |
| Lot Split / Subdivision Analysis | one parent parcel split analysis, 2 lot configurations | $4,000-$12,000 per job | 20% | 1 job | OGS Capital 2026: pre-feasibility / initial screening study $5,000-$15,000; consultants $150-$500/hr; Archiwise 2025: land-use / zoning consultants $150-$350/hr; California zoning consultant fees $20,000-$100,000+ on complex projects; City of Pittsburgh fee schedule 2026: ZBA variance $400, zone change petition $1,500, posted notice $450, property certification $100 |
| Entitlement Strategy Consulting | one project entitlement strategy engagement incl. about 9 months of retainer | $45,000-$140,000 per job | 20% | 1 job | OGS Capital 2026: development consultants $150-$500/hr; Highspire 2025: consulting retainer example $4,000/month; senior experts $200+/hr; City of Pittsburgh fee schedule 2026: ZBA variance $400, zone change petition $1,500, posted notice $450, property certification $100 |
| Rezoning / Variance Support | one variance or rezoning case through one board hearing cycle | $6,000-$20,000 per job | 20% | 1 job | City of Pittsburgh fee schedule 2026: ZBA variance $400, zone change petition $1,500, posted notice $450, property certification $100; OGS Capital 2026: development consultants $150-$500/hr |
| Traffic Impact Study Consultant | study intersections | $3,000-$6,000 each | 20% | 4-8 unit | Greenlight Traffic Engineering 2024: about $3,500 per intersection, $2,500-$5,000 per intersection for 3+ intersections; LatestCost 2026: traffic engineers $100-$180/hr; TIA $5,000-$9,000 suburban, $6,500-$12,000 large metro; Mike on Traffic 2010: peak-hour counts $200-$400 per intersection per peak (escalated) |
| Environmental Impact Review Consultant | one IS/MND or EA-level document with about 5 technical studies | $40,000-$150,000 per job | 20% | 1 job | CDFW 2025: environmental filing fee $2,968.75 for an ND/MND, $4,123.50 for an EIR; MRCA 2019: EIR consultant contract about $150,000-$300,000 by milestone (EIR level, above this benchmark); CPUC Res. T-17517 via Rinehart 2022: MND $399,853 for a linear broadband project (upper outlier) |
| Pre-Construction Consulting | one preconstruction engagement, ~$10M building, 3 design milestones | $40,000-$130,000 per job | 20% | 1 job | Highspire 2025: construction management consultants $100-$200/hr typical, $200+ senior; $800-$2,500/day; $40,000 flat fee for a six-month phase; GSA CALC 2026: construction manager ceiling rates $99-$135/hr (IQR), median $120 (federal-discounted) |
| Conceptual Cost Estimating | one Class 5/4 conceptual estimate, ~$5-20M building, 2 scenarios | $8,000-$25,000 per job | 20% | 1 job | Highspire 2025: construction management consultants $100-$200/hr typical, $200+ senior; $800-$2,500/day; $40,000 flat fee for a six-month phase; GSA CALC 2026: cost estimator ceiling rates $73-$95/hr (IQR, federal-discounted) |
| ROM (Rough Order of Magnitude) Estimating | one ROM estimate with 2 options | $2,500-$8,000 per job | 20% | 1 job | Highspire 2025: construction management consultants $100-$200/hr typical, $200+ senior; $800-$2,500/day; $40,000 flat fee for a six-month phase; GSA CALC 2026: cost estimator ceiling rates $73-$95/hr (IQR, federal-discounted) |
| Cost Engineering | months of construction-phase cost management (setup amortized) | $9,000-$16,000 each | 20% | 10-18 unit | Highspire 2025: construction management consultants $100-$200/hr typical, $200+ senior; $800-$2,500/day; $40,000 flat fee for a six-month phase; Highspire 2025: CM consulting 2%-8% of project cost; GSA CALC 2026: cost estimator ceiling rates $73-$95/hr (IQR, federal-discounted) |
| Constructability Review | one review milestone of a mid-size building set, 6 disciplines | $10,000-$35,000 per job | 20% | 1 job | Highspire 2025: construction management consultants $100-$200/hr typical, $200+ senior; $800-$2,500/day; $40,000 flat fee for a six-month phase; GSA CALC 2026: construction manager ceiling rates $99-$135/hr (IQR), median $120 (federal-discounted) |
| Construction Phasing Analysis | one phasing plan for an occupied building, 4 phases | $12,000-$40,000 per job | 20% | 1 job | Highspire 2025: construction management consultants $100-$200/hr typical, $200+ senior; $800-$2,500/day; $40,000 flat fee for a six-month phase; GSA CALC 2026: construction manager ceiling rates $99-$135/hr (IQR), median $120 (federal-discounted) |
| Schedule / CPM Analysis | months of scheduling service (baseline amortized) | $4,000-$8,000 each | 20% | 12-24 unit | GSA CALC 2026: project scheduler ceiling rates $94-$155/hr (IQR), median $119 (federal-discounted); Highspire 2025: construction management consultants $100-$200/hr typical, $200+ senior; $800-$2,500/day; $40,000 flat fee for a six-month phase |
| Risk & Contingency Analysis | one quantitative (Monte Carlo) risk assessment, ~$10-50M project | $15,000-$60,000 per job | 20% | 1 job | Highspire 2025: construction management consultants $100-$200/hr typical, $200+ senior; $800-$2,500/day; $40,000 flat fee for a six-month phase; OGS Capital 2026: consultants $150-$500/hr |
| Owner's Representative | months of engagement (design through closeout) | $9,000-$18,000 each | 20% | 12-24 unit | Terrapin 2026: owner's rep 2%-4% of cost on a $5M project; retainers $5,000-$25,000+/mo; $150-$300/hr; Mastt 2025: owner's rep $150-$250+/hr senior; lump sums $10,000-$50,000+ small to mid-size |
| Construction Manager | months of construction (CM services, cost of work excluded) | $50,000-$90,000 each | 15% | 9-15 unit | Northspyre 2023: CM fees 3%-5% on office and medical office, 5%+ multifamily, 2%-3% industrial; HomeAdvisor 2026: construction management 5%-9% of cost on $1M-$10M projects; GSA CALC 2026: construction manager ceiling rates $99-$135/hr (IQR), median $120 (federal-discounted) |
