# Trade boards and warehouse stock (2026-09-20)

Owner's ask: under each of the Fence, Roofing and HVAC estimators, a board
that shows that trade's proposals and the company's own stock of materials,
draws the proposals' materials from it, warns before it runs short, emails a
purchase order to the supplier, and hands the crew a list of what to take
from the warehouse. The main Proposals page keeps every proposal. Modelled
on the installer dashboard in SmartSpace Pro, adapted to what JobFlex holds.

## What holds

- **Every new proposal carries its trade** (`Proposal.trade`: fence, roof,
  hvac). The three estimators set it, and a Smart Proposal for one of those
  jobs does too. Older proposals have none and appear only on Proposals.
- **The board** (`/dashboard/<trade>-estimator/board`, "Fence inventory",
  "Roofing inventory", "HVAC inventory", folded under each estimator in
  the sidebar behind a chevron; the handheld drawer lists it after the
  estimator): the trade's open and sold proposals, the warehouse stock
  with the work counted against it, the suppliers, and a purchase order.
  Managers and owners write; sales and estimator roles read; field workers
  never see it.
- **Stock** (`InventoryItem`, one warehouse per company): name, unit, on
  hand, an optional reorder point, a supplier and its SKU. Every change is a
  movement (`InventoryMovement`): received, counted, picked for a job.
  Items come from the lines the proposals already use — the board offers
  each untracked material line as a one-tap item — or are typed in.
- **The arithmetic** (`lib/inventory`, pure):
  - reserved = what SOLD jobs still take and have not loaded;
  - available = on hand − reserved;
  - forecast = what the OPEN proposals would take if every one sold;
  - short = forecast beyond what is available;
  - low = available under the reorder point, or, when none is set, under
    the biggest single job on the books, so the shelf always covers the
    next truck;
  - suggested order, for a low or short item = enough for the sold and open
    work with the threshold left on the shelf.
  Lines match items by meaning, not spelling ("Starter strip · eaves +
  rakes" and "starter strip (eaves & rakes)" are one item).
- **The warning**: an attention strip on the board, a count badge on the
  board's sidebar item, and the low rows tinted in the table.
- **The purchase order**: everything low or short, grouped by supplier and
  sized to the suggested order, emailed from the company's own mail
  (Gmail when connected) with one button; logged as an activity.
- **The crew's list**: every job page shows "Take from the warehouse" — the
  proposal's material lines in whole units, with whether the shelf has each.
  A field worker sees it with no price on it. "Loaded" takes the tracked
  lines out of the warehouse once, stamps the job
  (`Job.materialsLoadedAt`) and releases the reservation. A worker can
  press it only on a job they are assigned to.

## Later the same day: the loop closes

- **Leftovers back.** Once a job's truck is loaded, its page lists what is
  out on the job; the crew or the office enters what came back and the
  shelf corrects itself. What stayed on the job, at each item's last cost,
  is the job's "from the warehouse" cost on its money card.
- **Orders on the way.** A purchase order emailed from the board stays on
  it until "Received" puts every line on the shelf in one tap.
- **The daily check** (`/api/cron/stock-check`, 6:30 am Pacific): a bell
  notice per board with items low for the next job, and a notice for any
  job starting within two days whose materials are short on the shelf.
  Each notice opens the board or the job.
- **Workers page:** each worker's earnings on their jobs and what is still
  owed, from the pay on their assignments.

## The standard items come off the estimators (2026-09-20, later)

Owner: "look into the material package and estimator … use all those
materials as items already preset — fence boards, two by fours, pressure
treated or cedar boards and posts … same for roofing and HVAC."

- `lib/inventoryPresets` runs each trade's estimator over its own catalog
  — every fence type at 4, 6 and 8 ft with gates; every roof system on a
  hip house and a flat roof; the HVAC jobs on a gas and an all-electric
  house — and every material line it prices becomes a standard item.
  Nothing is typed by hand, so the names match the proposals' lines by
  construction. Fence 88 items, roofing 97, HVAC 37.
- The fence list is the takeoff's bill of materials, not the "package"
  line: line, corner, end and gate posts by length, concrete by the bag,
  rails, pickets, nails, post caps, gate kits and hinge sets.
- `lib/inventoryBom` reads a fence proposal's package and gate lines back
  through the takeoff, so stock, forecasts, the pick list and the daily
  check count the components a job was priced from. Roof and HVAC lines
  are already components and pass through.
- The board offers "Add the N standard items" until they are all on the
  list; they start at zero on hand, then the office receives what it has.

## What the company keeps in stock (2026-09-23)

Owner: "not every contractor stocks everything to get the job done … when
they set up their inventory, mark what they keep in stock … check-box what
they're stocking and calculate on that … make it understandable how to set
up the inventory."

- **Two kinds of item.** *Kept in stock*: everything above — counted on the
  shelf, reserved by sold jobs, forecast by open ones, low against a reorder
  point, on the restock order. *Bought per job*: the shelf is not expected
  to hold it — never low, never short, never on a restock order; when a job
  sells, its per-job materials go on that job's shopping list instead, and
  the crew's list says "ordered for this job", not "short".
- **The checklist ("What we stock")** on each board: every standard material
  of the trade and every item on the list, grouped by shelf, one checkbox
  each, with a search, all/none per group and "Suggested". It opens by
  itself for a company whose list is empty, with the three steps written
  out: tick what you stock → count the shelf → let the proposals do the
  rest. Saving adds the standard items not on the list yet (at zero) and
  rewrites the choice. Any item's choice can also be changed in its edit
  form ("Kept in stock" / "Bought per job").
- **The suggestion** (`lib/inventoryStockDefaults`, one sentence per trade,
  shown over the list): roofing keeps the small stuff every truck carries
  and buys shingles, membranes and coatings per job; fence keeps posts,
  rails, concrete, fasteners, caps and gate hardware and buys pickets,
  panels, fabric and the non-wood systems per job; HVAC keeps the service
  truck's parts and orders equipment per job. "Add the standard items" in
  one go applies the same suggestion.
- **The shopping list** (`jobBuyList`, pure): for each sold job still to
  load, soonest first, its per-job materials in whole units; what is on
  hand already (an order that arrived) is given to the soonest job, the
  rest reads "to buy", and a purchase order emailed for the job marks its
  lines "on the way". The Orders tab shows it as "Buy for upcoming jobs",
  one email per supplier per job (`sendPurchaseOrder` takes `jobId`);
  "Restock the shelf" below it is the old suggested order, stocked items
  only. The next-load card, the coverage column and the bell notice say
  "N short on the shelf · M to buy for the job".
- **Storage, no schema change:** one `ActivityEvent` per company and trade
  (kind `INVENTORY_STOCK_POLICY`, meta `{ trade, perJob: [item keys] }`),
  newest wins, absent = kept in stock — `lib/inventoryPolicy`
  (`stockPolicyOf`, `recordStockPolicy`, `stockItemsOf`: the one read every
  page that counts against the shelf now uses). Keyed by the item's
  normalized name, which survives a delete and re-seed.
- **The three steps** stay on the board as a strip — what you stock (with
  the counts and a Change button), count the shelf (how many stocked items
  still show zero), proposals draw on it — each marked done as it happens.
- Proof: `scripts/qa/inventory.check.ts` (per-job rows, the crew's flag,
  the shopping list) and `scripts/qa/inventory-stock-defaults.check.ts`.

## Data layer

New tables `Supplier`, `InventoryItem`, `InventoryMovement`; new columns
`Proposal.trade` and `Job.materialsLoadedAt`, both nullable (2026-09-20,
when the build still pushed the schema). Everything since — the
connect-or-not choice and what the company keeps in stock — is an
`ActivityEvent`, because the production build no longer pushes the schema.

## Proof

`scripts/qa/inventory.check.ts` (10 checks: matching, reserved, forecast,
short, the two thresholds, the suggested order, untracked lines, the pick
list, the purchase order text). On the stand (`adshoot/trade-board.js`):
the board opens under the estimator, a supplier and an item are added, the
item reads low with an order suggested, the strip and the purchase order
appear, receiving stock clears it. The job page's pick list was not walked:
the stand seed has no job with a proposal.
