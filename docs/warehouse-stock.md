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
- **The board** (`/dashboard/<trade>-estimator/board`, in the sidebar under
  the estimator): the trade's open and sold proposals, the warehouse stock
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

## Data layer

New tables `Supplier`, `InventoryItem`, `InventoryMovement`; new columns
`Proposal.trade` and `Job.materialsLoadedAt`, both nullable. The build's
`prisma db push` adds them without touching existing rows.

## Proof

`scripts/qa/inventory.check.ts` (10 checks: matching, reserved, forecast,
short, the two thresholds, the suggested order, untracked lines, the pick
list, the purchase order text). On the stand (`adshoot/trade-board.js`):
the board opens under the estimator, a supplier and an item are added, the
item reads low with an order suggested, the strip and the purchase order
appear, receiving stock clears it. The job page's pick list was not walked:
the stand seed has no job with a proposal.
