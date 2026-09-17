# Smart Proposal — the brief is binding (2026-09-17)

## What went wrong

Owner's brief: *"install 400 sq ft full flake epoxy with polyaspartic top
coat make 10$ per sq"*. The proposal came back with 450 sq ft (the model added
waste to the billed area), an $8.50 coating line plus a $2.50 "substrate
preparation and moisture testing" line plus an $800 cleanup (nothing near
$10/sq ft, and moisture testing was never asked for), and before that a
dialog asking the contractor what colour the flake should be and whether the
site had easy access — a homeowner's intake form, not a contractor's question.

Three causes:

- The epoxy specialty preamble literally said "include substrate prep,
  moisture testing … return-to-service", and the master prompt's waste table
  told the model to put waste into quantities.
- Nothing read the brief's numbers. A stated area or price was just more
  prose to the model.
- The intake gate asked whatever the model thought made the brief "thin".

## What holds now

**`lib/estimate/brief.ts`** — the contractor's numbers.

- `readBrief(text, {sqft})` reads the stated area (`400 sq ft`, `20x24`,
  the intake's size field), run (`120 lf`, the largest length — a height is
  the small one), the customer price per unit (`$10 per sq ft`, `10$ per
  sq`, `$45/lf`, `$650 each`) and a stated total (`total $4,500`, `make it
  $9,600 all-in`, `budget of $38k`, `charge $6,800 for the whole job`).
  A price near cost words (*"the planks cost $3.20 per sq ft from Home
  Depot"*) is the contractor's cost, not the customer's price, and is
  ignored. `targetSell` is the total, else per-unit × the matching measure.
- `briefRulesBlock(facts)` is appended to every estimate prompt (the
  `Summary:` slot of the old quote-draft prompt, next to the brief): the
  brief is the whole intake; the lines are the steps of the job asked for
  and nothing else (extras go to `upsells`); a stated quantity is exact and
  waste lives in the material unit price; a stated price is what the lines
  must add up to. When numbers were stated, they are listed as binding.
- `bindLinesToBrief(items, facts, markup)` holds the reply: every sqft line
  within 0.85–1.6× of the stated area snaps back to it (450 → 400, the line
  total kept — a line at 2× is another surface and is left alone); then all
  prices are scaled by one factor so the **sell** total (after the org's
  material/labor markup, the number the proposal will print) equals the
  target, landing on the cent through the fixed line. Notes for the sheet
  say what was held ("Priced to 400 sq ft × $10.00/sq ft: the proposal
  totals $4,000.00 before tax").
- `scrubUnaskedWork` / `scrubUnaskedText` — for the coatings specialties
  only: moisture testing / vapor-barrier work comes off a line that bundles
  it with real prep and a line that is nothing else is dropped, unless the
  brief mentions moisture, a wet slab or a new pour.
- `bindEstimateToBrief` — the same on the refine shape (material + labor
  rows sharing an id), used when a change request states a total.
- `keepCostCritical(questions, brief)` — the server-side filter on the
  intake gate.

**The epoxy recipe.** `legacy/specialties.ts` (epoxy-flooring) and a new
`coatings` profile in `trade-knowledge.ts`: surface prep (diamond grind CSP
2-3, crack/joint fill, vacuum) → 100% solids pigmented epoxy base coat →
full flake broadcast to rejection, scrape and vacuum → the clear topcoat the
brief names (polyaspartic or urethane) → masking, protection and cleanup.
Moisture testing, vapor-barrier primers, cove base and slab repairs only
when asked. Anchors: $6–12/sq ft installed for a full-flake system.

**The intake gate** (`analyzeEstimatePrompt`). Owner: *"only ask questions
when critical to know … that will affect cost, like cracks."* The model is
told to ask only about an existing condition that adds a line or moves the
price by ~10% (cracks or an old coating to grind off, a second layer of
shingles, rotten decking, a fence to tear out, rocky ground, drywall repairs
before paint), never a preference or logistics (colour, brand, style,
schedule, access), never anything the brief states, at most three, each with
a `why` (how the answer moves the price) and the standard case as the first
option. `keepCostCritical` enforces the preference/logistics blocklist and
drops questions about a stated area, run or price whatever the model said.
The dialog now reads "What moves this price" and shows each question's
reason; "Generate anyway" still stands.

## Proof

`scripts/qa/estimate-brief.check.ts` (38 checks): the readings, the prompt
text, the coatings detection, the Kirkland reply replayed through the old
parser and held to 400 sq ft and exactly $4,000.00 at 0% markup and at
20%/10% markup (proposal $4,000.00, costs beneath it), the scope text
following the quantity and losing the moisture clause, the refine shape, and
the question filter. No model call is needed for any of it; the prompt
wording was checked by reading. The live model was not run — there is no
OpenAI key on this machine.
