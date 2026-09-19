# Smart Proposal — the remodel method (2026-09-18)

Owner's ask: *"need better prompt … for remodeler, bath remodel, kitchen
remodel and others. Need deep prompt what to price out, for example if
replacing sink need to understand that under the sink plumbing or there is
disposal … estimate projects like that with right item lines, think smart
and offer me first."* A full bathroom remodel in Kirkland WA had come back
as eight lines at $12,600. The owner approved the offer with "go".

## How the method was made

Six domain rulebooks (kitchen; bathroom; whole interior, basement, laundry,
office, garage and ADU; MEP implications; structure and finishes; the
estimator's discipline) were drafted by master-estimator agents. Two
reviewers attacked each one: a master plumber, electrician and HVAC lens on
the trade facts and code claims, and a production remodeling estimator on
billing completeness, units and realistic totals. Every refuted claim was
dropped, every missing line a pro bills was added, and five synthesis
passes wrote the parts. The assembled text, as a document, is
`docs/remodel-estimating-method.md`; the price audit behind it is
`docs/remodel-price-audit.md`.

## What holds now

**`lib/estimate/remodel-method/`** — `text.ts` holds six parts:

| Part | Sections |
|---|---|
| How to read a brief | 1: the six connections of every fixture (feed, drain and vent, power, exhaust, hold, surface), stated vs implied vs unknown, like-for-like / upgrade in place / relocation, the assumption ladder, allowances as lines, room dimensions into quantities, quality tiers, a full remodel in kind |
| Kitchen | 2A with worked examples 9.1 (sink, faucet, new disposal) and 9.3 (12x14 Kirkland kitchen) |
| Bathroom | 2B with worked examples 9.2 (tub to shower) and 9.5 (the Kirkland hall bath) |
| Interior | 2C with worked example 9.4 (800 sqft basement with a bedroom and bath) |
| Chains and code | 3 (hidden-work chains) and 4 (code triggers: touch X, the code forces Y, the line) |
| Rules | 5 never forgotten, 6 ask only when it moves the price, 7 never write these lines, 8 sanity ranges and labor realism |

`index.ts` decides what a brief carries:

- **Which rooms** (`remodelDomainsFor`): the remodel specialties always
  carry the method; interior-finish, MEP, surface, restoration and
  envelope specialties carry it only when the brief's words name a
  kitchen, bath or interior piece; every other specialty (roofing, fence,
  civil, engineering) never. The words pick the room parts: a sink brief
  gets the kitchen part, a basement with a bath gets bathroom and
  interior, "whole house" gets all three, an exterior paint job none.
  The three core parts ride with any room part.
- **Whole job or part of a room** (`briefScope`): a room-remodel specialty
  detected on a brief that names a piece of the room ("replace the kitchen
  sink", "replace toilet", "tub to shower", "remove the wall") is
  *partial*. Its procedure is then a menu, not a line quota:
  `formatProcedureBlock(..., { partial: true })` drops the "at least N
  lines" rule and says so twice, and the thin-answer retry does not fire.
  Without this, the thin-answer retry of the same day would have pushed a
  sink swap toward a full kitchen's 17 lines.

`buildLegacyEstimatePrompt` sends the procedure block, then the method,
then the trade profile (gpt-4o-class models), in the old prompt's extra
slot. A kitchen-sink brief's prompt grows by about 100,000 characters.

**`lib/estimate/remodel-sanity.ts`** — a whole remodel of a known kind
(hall, primary or powder bath; tub to shower; galley, full or re-laid-out
kitchen; basement finish per sqft; garage conversion per sqft; laundry)
gets its standard-grade range, before markup: the method's metro checks in
Seattle-Bellevue-Kirkland, the Bay Area, LA, San Diego, New York, Boston and
DC, the state index elsewhere. The prompt carries it ("THIS BRIEF'S
RANGE: a full hall bath remodel in Kirkland runs $28,000-$45,000 …"). A
brief that states a price has no range; the stated price binds.

**The check after the reply** (`actions/advancedEstimator`) — one retry
carrying every reason: a whole job under seven tenths of its procedure's
core steps, or a total under nine tenths of the job's range. The fuller
answer is kept (`fullerAnswer`: more lines, or as many lines and a higher
total, or nearly as many lines and a much higher total). The console
logs both answers' line counts and totals.

**What taught thin, cheap answers, removed** (every item verified in the
code first):

- Master prompt: the "minimum 8-15 / 6-12 line items" rule; the fixed
  15-line kitchen checklist every photo-less brief got; the sample kitchen
  that hid the under-sink plumbing in one line and lumped plumbing and
  electrical into fixed lines (rewritten line by line); waste added to
  quantities (now priced into the material unit price, stated in notes);
  counts and sums in sample line names; overhead and profit as lines;
  consumables as a siding line; the low pricing guidelines and hourly
  rates (raised to the reviewed 2025-26 numbers).
- Kitchen and bathroom trade profiles: "8-15 lines" / "6-12 lines minimum"
  preambles, fixed or linear-ft units for countable work, the low anchors
  (a new circuit $200-500 → $450-900, a new ducted bath fan $350-600 →
  $1,000-2,200, the shower valve, glass by the foot, tile labor), and the
  permit, protection, clean-up, patch and Washington asbestos numbers the
  model had nothing for.
- The trade block: "every phase REQUIRED as its own line, including
  consumables" became "phases of a whole job; a brief for part of the job
  writes only the phases it touches; consumables ride inside their lines";
  its roofing example no longer adds waste to quantities.
- The old price book (not sent on the live path, but corrected): its
  header claimed "material & labor" for material-only prices; the
  entries the audit named are updated, sinks and faucets split kitchen
  from bath, carpet sold by the square yard.

**The specialty detector** — phrase votes that land even on a specialty
with no keyword overlap: tub-to-shower and toilet/vanity/tub replacements
→ bathroom remodel; dishwasher, disposal, hood, range, microwave,
kitchen sink and faucet installs → kitchen remodel (repairs stay with the
keyword pass); finishing a basement → interior remodel; replacing windows
→ window replacement; retiling → tile and stone; lawn sprinklers →
irrigation; pocket doors → interior remodel; interior, barn and closet
doors → finish carpentry; front, patio and sliding doors → window and
door. The dead token votes (tile, countertop, window, irrigation pointed
at ids that do not exist) now point at real specialties.

**The admin page** (`/admin/prompts`) — a Remodel method card with a
picker over the six parts, each editable like the other boxes (override
key `remodel:<part>`), and three new preview chips: the room parts the
brief carries, whole job or part of a room, and the range. The card that
lists the prompt's order no longer claims the price book, material
profile and tax guidance are sent (the live builder passes all three as
empty), and names the method and the check after the reply.

## Data-layer changes

- None to the schema. Six new override keys (`remodel:read`,
  `remodel:kitchen`, `remodel:bathroom`, `remodel:interior`,
  `remodel:chains`, `remodel:rules`) live in the existing
  `PromptOverride` table.
- `buildLegacyEstimatePrompt` returns `scope`, `remodelDomains` and
  `range`; `generateAdvancedEstimate` retries on the combined reasons.

## Proof

`scripts/qa/remodel-method.check.ts`: the six parts and their sections,
every implication bullet and example row ending in a legal unit, prices
only in section 8, the owner's sink and disposal lines; the room parts for
fifteen briefs; whole vs partial for eleven; the procedure block's
partial mode; the sink, Kirkland bath, Spokane and Bothell kitchens,
Dallas tub-to-shower, stated-price, Denver basement and roof prompts and
ranges; the retry on the Kirkland failure (8 lines, $12,600) for both
reasons and the fuller-answer choice; the override parse, block and save
checks; the master-prompt, trade-profile, trade-block and price-book
fixes; the detector on nineteen briefs and two repairs. The existing
`procedures.check.ts` and `estimate-brief.check.ts` stay green. On the
stand (`adshoot/prompts-remodel.js`, 24 checks, desktop and phone): the
truthful order card, the six-part picker, an edited kitchen part landing
in the composed prompt and resetting, the chips for a sink (kitchen, part
of a room, no range), the Kirkland bath (bathroom, whole job,
$28,000-45,000, its prompt carrying section 2B, example 9.5 and the range line) and a roof (no method).

Not verified here: a live OpenAI run (no key on the stand). The owner sees
the lines on jobflex.app; the console line `[advancedEstimator] Step 1`
names the scope, the method's rooms and, on a retry, both totals.
