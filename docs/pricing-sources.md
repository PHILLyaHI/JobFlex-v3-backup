# Smart Proposal — prices by place and by kind of work (2026-09-18)

Owner's ask, after a street sewer came back far too cheap: *"Run sewer in
the street 300 linear feet. Usually it costs around 300,000 dollars … go
and look their state, their major cities pricing and update the price book,
because this is totally wrong."*

The price book for every specialty's steps, researched the same day, is
in `docs/pricing-step-prices.md`. Two research reports sit behind this
note:

- `docs/pricing-sources-utilities.md` — installed unit prices for sewer,
  storm and water work, national and Seattle area, with every source.
- `docs/pricing-sources-cities.md` — construction cost factors for 306
  cities in every state and DC, and the corrected state table.

## What was wrong

- **A sewer brief was priced as house plumbing.** "Sewer" belonged to the
  plumbing trade profile, whose only per-foot anchor was a PEX repipe at
  $2-4 material and $8-15 labor. Nothing in the prompt priced a trench,
  shoring, a manhole, a pavement cut and patch, flaggers, bypass pumping or
  the connection to the main.
- **The market was read by state only.** The prompt scaled national anchors
  by a state index (Lynnwood and Yakima both 1.15), and the remodel ranges
  used a flat 1.25 for a short list of metros.
- **The state table was off.** 25 of 51 states differed from their own
  construction wages by more than 0.05. Texas, Florida, Georgia, the
  Carolinas, Arizona and Utah were set too high. The union-wage Midwest was
  set too low. California and New York were set at their big-city level.

## The owner's number checks out

A public 8-12 in. sewer main in a paved Seattle-area street runs about
$1,000 per linear foot all-in. Three independent checks agree:

| Check | $/LF |
|---|---|
| Renton WA award, Aug 2024, about 750 LF with a manhole and full restoration | 1,041 |
| US EPA Clean Watersheds Needs Survey cost curve at 300 LF (2022 dollars) | 1,120 |
| Component build-up from Western Washington bid prices | 750-2,300 |

Long runs, greenfield subdivisions and trenchless lining run far lower.
Deep, wet or arterial jobs run $1,500-3,200/LF. The utilities report
lists when each applies.

## What holds now

**Underground utility work** (`lib/estimate/utility-work.ts`, data in
`lib/estimate/utility-prices-data.ts`):

- A brief is read as one of six jobs: a side sewer in a yard, a side sewer
  out to the street, a sewer main in the street, a storm drain in the
  street, a water main in the street, or a water service in a yard. A
  backup, clog, roots or jetting brief is drain cleaning, not installation.
- Each job has an installed range per linear foot:

  | Job | National $/LF | Seattle area $/LF |
  |---|---|---|
  | Side sewer in a yard | 60-250 | 120-350 |
  | Side sewer from the house to the street main | 150-450 | 350-900 |
  | Sewer main in a city street | 350-1,100 | 800-1,600 |
  | Storm drain in a street | 200-600 | 350-900 |
  | Water main in a street | 250-600 | 450-1,000 |
  | Water service in a yard | 50-150 | 75-250 |

- The range is the per-foot price times the run the brief states. A job in
  a listed Washington city with a factor of 1.15 or more uses the Seattle
  column. Everywhere else uses the national column times the city or state
  factor. A brief with no run gets the unit prices but no range.
- **Shown at contractor cost** (added later the same day, with the price
  book in `docs/pricing-step-prices.md`). Bid prices include the bidder's
  overhead and profit, about 15%. The estimator writes lines at cost and
  the company's markup adds overhead and profit, so the prompt's anchors
  and ranges show every bid price divided by 1.15. Fees and permits are
  shown as charged. The table above keeps the bid prices as published.
- The prompt carries 34 installed component prices: trench by depth,
  shoring, pipe by size, manholes, cleanouts, reconnections, saw-cut,
  pavement removal and patch, flaggers and lane closures, bypass pumping,
  dewatering, CCTV and testing, mobilization, permits and Seattle fees.
  GPT-4o-class models get them in a new utilities trade profile. Reasoning
  models get them as an installed-price block with the location line.
- A total under the range is asked again once, naming the bid prices and
  the lines it is missing. The fuller answer is kept.
- Routing: "sewer" moved from the plumbing trade to the new utilities
  trade. Backup, clog and roots phrases stay with plumbing, and the
  specialty detector sends them to drain cleaning.

**The market, city first** (`lib/estimate/location-index.ts`, data in
`lib/estimate/location-index-data.ts`):

- Each city factor is 0.60 × the metro's construction wage + 0.40 × its
  material index, on a US average of 1.00. It tracks the RSMeans
  Residential 2024 factors (r 0.90), HUD 2024 cost limits (0.87) and the
  DoD area cost factors (0.86). Treat each factor as about ±5%.
- The city is read from the city part of an address. The street segment is
  skipped, so "100 Seattle Hill Rd, Snohomish, WA" is not Seattle. The city
  must be in the address's state. A city name two states share
  ("Portland", "Springfield") is not guessed without the state.
- An unlisted town uses its state's factor. No city or state falls to the
  national average, and the prompt tells the model to say so.
- `STATE_COST_INDEX` in `lib/estimate/trade-knowledge.ts` now holds the
  corrected values. Biggest moves: CA 1.25 to 1.13, FL 1.02 to 0.91, TX
  1.00 to 0.90, NY 1.20 to 1.10, IL 1.05 to 1.15, MO 0.93 to 1.02.
- Washington at a glance: Seattle and every King County city 1.25;
  Lynnwood, Edmonds and Mill Creek 1.21; Everett, Tacoma and Bellingham
  1.16; Olympia 1.13; Vancouver 1.11; Spokane 1.06; Yakima 1.04.

**Where the factor applies:** every Smart Proposal prompt (the trade
block's region line, or the location line on reasoning models), the
remodel ranges and the utility ranges. The fence, roof and HVAC estimators
keep their own market data and were not changed.

**The state reader** (`lib/pricing/salesTax.ts`) reads a whole segment
before its single words. "Charleston, West Virginia" was read as Virginia.
It is now West Virginia. The sales tax estimate and the fence, roof and
HVAC estimators share this reader, so they get the fix too.

## Not re-researched yet

The national anchors of the other trades (roofing, siding, gutters,
fencing, decks, concrete, HVAC, electrical, plumbing service, windows and
doors, insulation, painting, flooring, landscaping) are the earlier ones.
They are now scaled by the new city and state factors, but their base
prices were not checked against current data. The remodel prices were
audited the same day (`docs/remodel-price-audit.md`).

Other known limits:

- Several Seattle-area utility figures are derived from components, not
  published all-in: the side sewer to the street and the storm drain.
- Bid prices carry the contractor's overhead and profit. They do not carry
  the owner's engineering or contingency. Washington sales tax may apply to
  utility work.
- The factors are on an all-US base. An anchor taken from a 30-city
  RSMeans national average would need about 0.96 on top; none is applied.

## Data-layer changes

- None to the schema. No migration.
- `buildLegacyEstimatePrompt` also returns `utilityJob`. Its `range` is a
  remodel range or a utility range (`JobRange`), which the retry in
  `actions/advancedEstimator.ts` already reads.
- `actions/advancedEstimator.ts`: its first log line also names the utility
  job (`utility=sewer-main-street`). No other action or API route changed.
- `/admin/prompts` preview shows a utility chip and the range with its
  place ("Lynnwood, WA").

## Proof

- `scripts/qa/pricing.check.ts`: the utility data and anchor lines; ten
  briefs sorted into the six jobs or drain cleaning; trade and detector
  routing; both prompt paths; the Dallas sewer range at cost
  ($84,000-264,000 at 0.92); the retry on the owner's old $37,500 answer
  with $300,000 standing; the Spokane side sewer; city, state and national
  reads; shared city names; the state reader; and the owner's case, 300 LF
  of street sewer in Lynnwood at $208,700-417,400 at cost, which is
  $240,000-480,000 at a 15% markup.
- `remodel-method.check.ts`, `procedures.check.ts` and
  `estimate-brief.check.ts` stay green, with the remodel ranges moved to
  the new factors.
- On the stand (`adshoot/prompts-remodel.js`, 26 checks, desktop and
  phone): the Dallas and Lynnwood sewer chips and prompts carry the
  utilities trade profile, the bid-price range and no plumbing anchors.

Not verified here: a live OpenAI run (no key on the stand). On jobflex.app
the console line `[advancedEstimator] Step 1` names `utility=`, and a retry
logs both totals against the range.
