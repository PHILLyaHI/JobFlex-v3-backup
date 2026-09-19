# Roof estimator — the first click gets the whole answer (2026-09-17)

Owner's ask: *"check roofing estimator make sure all good logic and make sure
there is no problem to get result from first time, make sure it gets all api
results and then show. check polish."* Three reviewers (the aerial order and
first-result path; the takeoff and pricing rules; the page on the stand at
1440 and 390) → the fixes below, in one pass.

## Why the first click did not get everything

`measureRoofInstant` bought the seven EagleView Property Data packs one order
at a time and **polled each to completion (30 s ceiling) before placing the
next**: pack 001, then the grouped order, then up to five single-pack probes.
A first click on a new address could wait 30 s × 7 before the free elevation
pass even started, the platform's function limit cut the request off, and the
page saw an error. The second click recovered only the area order (the one
pending row it looked at), so the report showed squares with no pitch, no
facets and no outline, and a "Re-measure — new paid lookup" that read as
paying for everything again.

## What holds now

**The area is the measurement; the rest lands behind it** (2026-09-18,
`lib/eagleviewOrder.ts`). The first live run of the 2026-09-17 planner
(all seven placed up front, all waited for together) showed its cost: the
click waited the whole 75 s budget for the slowest pack, and with seven
orders on one address at once the area itself was still processing after it
— the page sat on STILL PROCESSING and the contractor had nothing. Now 001 is
placed **alone** and waited for **alone** (asked every two seconds, up to
75 s); the moment it lands the other packs are placed — the packs the account
is known to have in one request, then the probes, each written to the ledger
the moment EagleView accepts it — and the click returns. Those are reported
as **`pending`** — placed, paid, never waited for by the click — and the page
collects them every few seconds (`collectPendingInstant`), pricing nothing
until they are in. A transport error on one ask is not a verdict (asked again
next round); only EagleView's own failed/rejected/cancelled status closes an
order as failed. If 001 itself has not answered within the budget, the click
fails with the order id kept and the next click collects it.

**The action runs under one budget** (`actions/roofMeasurement.ts`,
`ACTION_BUDGET_MS` 250 s under the page's `maxDuration = 300`). Orders an
earlier click left processing are collected first — the area on the way is
waited for (45 s, and the wait ends the moment it lands); detail orders on
the way are asked once and left to the page — then a stored answer is
reused, then — only then — the packs the address lacks are bought, skipping
what is complete **and what is still on the way**. An area order the provider
has sat on for 15 minutes (`STALE_PENDING_MS`) is the one exception: the
STILL PROCESSING panel then also offers **Order a new lookup — billed**,
which abandons the stale order (ledger row failed, reason kept) and buys
again. The
elevation pass takes what is left of the budget and is skipped (and says so on
the row) when the order used it up; the page's free retry runs it then. The
unused Google-segments call is gone.

**The witnesses are one function** (`witnessInstant`): parcel veto, main
structure, registration, coverage, measured pitch, completeness. Used by the
measure and by `collectPendingInstant`, so a pack that lands late (the
outline, the pitch, the details) gets the same treatment as a first-click
one. Coverage is now measured on rings converted into the raster's own frame
(`recon.origin`, the pin the tile was fetched around) and moved by the
registration transform — before, rings converted from EagleView's pin were
measured unregistered, and a few metres of offset read as roof "not seen".

**The report is held until the details are in** (owner, 2026-09-18: a
half-filled report with a "still collecting" banner that fills in fifteen
seconds later reads as broken). When the measurement comes back with packs
still on the way, the page keeps the measuring screen up on the details
step — worded with what is still being read ("Reading pitch and eave
height, shape, facets and details…", shortening as each part lands), the
percent creeping a point at a time toward 96 — collects the rest behind
it (`collectPendingInstant`), and opens the finished report once at 100 %
with one "Roof measured" toast. A provider slower than two minutes opens
the report anyway with the collecting note, and "Open the report now"
under the progress does the same on request. Reopening a row from Recent
is not the click and shows what it has at once.

**Nothing is priced on a roof whose packs are on the way.** The page's collect
loop shows STILL COLLECTING from the first paint (it used to appear only after
the first check resolved, ~20 s in), names the packs on the way, and the build
card prices nothing — Review and Convert disabled with the reason, no pitch
picker while the pitch pack is coming. Once the loop gives up (about two
minutes), the contractor prices on what is there with an entered pitch. A row
whose packs are missing for good says NOT EVERYTHING WAS BOUGHT, names them,
and offers "Order the missing packs — billed" (the page action says the same),
which buys just those.

**Answers with no roof, plain errors, honest captions.** An answer with no
structure carrying an area is a failure (`hasRoof`), kept so a plain click
never re-bills, with "Order a new lookup — billed" on the intake's error card;
an order still processing offers "Check again — free". Failure text is one
plain sentence (credentials, refusal, timeout, no data) — the vendor payload
stays in the console. The measuring screen (2026-09-18) shows a timed
percentage and a five-step list ("Locate the property" → "Finish the
report") that ticks as the measurement goes; the answer, not the clock,
makes it 100, and nothing on the screen — or in the wait and error copy —
names how or through whom the roof is measured. The ELEVATION notice has its own words per kind and
offers the free retry only where a retry can help (not for no-coverage or a
key problem), and the retry measures **the open measurement's own address**
(on a row reopened from Recent it used to measure nothing).

**Convert never drops an edit.** The build card's Convert stamps converted the
package as configured and threw away lines edited in the review tables (a qty
edited 15 → 99 landed as 15). Now edited tables are what converts from any
button, and "Review N lines" asks before replacing edited lines. Review
scrolls the tables into view and focuses them. A sample estimate (no AI key)
cannot become a proposal, and the Smart estimate mode is not offered when the
server has no key.

**The roof convert writes the address and the state's sales tax** the way the
HVAC convert does (`actions/roofEstimator.ts`: the measurement row's address
wins over the browser's; `taxRate`, `taxTotal`, `total`). Data-layer change:
a server action now writes four more Proposal columns; no schema change.

**Pricing rules** (`lib/roofPackage/takeoff.ts`, `catalog.ts`):

- A hand takeoff (squares + pitch, no outline) gets an edge estimate from the
  plan area the pitch implies, so drip edge, starter, cap and the ridge vent
  are priced (they were all missing, and the takeoff still converted).
- Rakes and hips run up the slope: plan length × √(1+t²) for a rake,
  × √(2+t²)/√2 for a hip.
- Tear-off and disposal are seeded by what is on the roof (`EXISTING_STEEP`:
  tile $120 + $75 per square per layer, slate $130 + $90, shake $70 + $40,
  metal $60 + $25, shingle $55 + $28); the line and an assumption say so.
- Intake at least matches the ridge's exhaust (soffit count), and the
  ventilation check fails when intake < exhaust.
- Starter strip only on asphalt, synthetic and shake; tile and slate get an
  eave riser, metal its eave trim and closures; fasteners named per family.
- Install labor carries a storey factor from the reported eave heights
  (2 storeys +8 %, 3 +15 %), stated in the line and an assumption.
- A ticked outbuilding joins the perimeter, footprint, facets, chimney and
  rooftop-unit counts, not only the squares.
- Basis words: the chimney kit and curbs read "measured" only while the count
  is the data's; a measured valley total reads "Valleys: 84 ft in total".
- A saved catalog row without `wastePct` / `capPerFt` no longer prices as NaN.

**Page polish**: retyping the address keeps hand-filled city/state/ZIP (it
wiped all three); Enter measures (the intake is a form); the failed report
lookup no longer leaves the report "loading" forever; the commercial notice
says the answer re-seeds the flat assembly; the waste picker is the catalog's
list; "Measure another" puts the cursor in the address; phone: the estimate
total's Convert button wraps under the figure, the viewer head ellipsises in
its column, a long token in a notice wraps.

Not done, on purpose: server-side idempotency for two simultaneous clicks
(the button is disabled while busy; a real lock needs a schema change and the
owner's word). `scripts/qa/roof-test.js` drives the retired page and is stale;
the browser walks for this pass are the scratchpad's `roof-review.js` /
`roof-review-phone.js` with `roof-seed.js`.

## Proof

`scripts/qa/roof-review.check.ts` (74 checks): the planner against fakes —
seven submits before the first poll, single asks, a slow pack pending with its
ledger row intact, the area pending → the click fails with the id kept, a
refused group probed pack by pack, EagleView's own failure recorded, nothing
skipped is re-bought, transport errors retried; the pack report and the roof
test; every pricing rule above. `roofReview` (50), `likeForLike` (25),
`lowSlope` (77) unchanged and green. On the stand (no EagleView or Solar
credentials): a failed measure shows the plain sentence and keeps the fields;
a seeded pending row collects from first paint with pricing blocked; a
missing-packs row offers the partial order; the free retry on a reopened row
reuses the stored answer without ordering; Review → qty 99 → the card's
Convert lands the 99 with the address and Texas tax on the proposal; a
two-storey tile house prices the storey factor, the tile tear-off and the
eave riser; phone 390 has no clipping and no sideways scroll.
