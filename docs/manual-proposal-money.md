# Manual proposal — what the client sees is one number (2026-09-17)

## The two reports

Owner, on `/dashboard/manual-blueprint`:

1. *"Labor-only proposal … it should show labor and material together, the
   totals; when off, show labor and material cost."* The switch was a
   client-buys-materials quote: it dropped every material dollar from the
   price (a $6,012 epoxy job became $3,456) and printed one line, "Complete
   scope of work as described". "Cost breakdown per line" only printed
   qty × unit price. None of the four options were saved, so the emailed
   portal never saw them — the editor said $3,680.64 while the client's link
   said the full amount.
2. *"When you add more to the material it adds up in the totals but it's not
   proportionally spreading in the item lines."* The two cost sliders did
   reach the client's printed prices and were baked into the lines on save,
   but the line table showed the raw costs until then. And overhead / profit
   were spread into the printed sheet only: `saveProposal` ignored both, so a
   proposal with 10% overhead and 10% profit was emailed at the pre-overhead
   figure.

## What holds now

**Card 06 is "Show to client"** (`bp-blocks.tsx`). One choice, *Price per
line*: **Totals only** (name, qty × unit price, amount) or **Labor + material
breakdown** (the same plus the client-facing material and labor halves of
each line, which add up to the amount). Two switches: Scope of work,
Signature lines. Both views print the same total; the choice never changes
the price. The labor-only mode is gone from this builder — the client's copy,
the PDF and the caption no longer have that branch. (The `laborOnly` field
stays on `ProposalOptions` for the other card-lab variants; the blueprint
never sets it.)

**The printed line carries its split** (`manual-focus-math.ts`,
`PrintedLine.materialAmount / laborAmount`): the material half with its
markup and the overhead/profit load, labor as the remainder.

**The sliders show in every row** (`lines-v2.tsx`, `lines-mobile.tsx`, new
optional `adjust` on `LineItemsProps`). With Materials or Labor off neutral,
each row and the foot print the adjusted figures — the numbers the sliders
bake into the lines on save — and a figure typed into a row is read back
through the same factor, so the table shows what the client is charged. The
foot says "Materials +10% · Labor −5% — every line shows the adjusted price;
saved as the line costs". Overhead and profit stay sheet-level (card 04 and
the client's copy).

**The saved lines carry overhead and profit** (`lib/pricing/markup.ts`
`overheadProfitLoad` + `priceLinesForClient`; `actions/proposals.ts`
`saveProposal`). A stored `LineItem.unitPrice` is now the client-facing
price — markup, then the overhead/profit load, quoted in cents — and
`total` is quantity × that price; `Proposal.subtotal` is the sum. The editor's
sheet uses the same helper for its load factor, so the builder, the portal
(`/portal/q/…`), both PDF routes, notifications and Financials quote one
number. `materialCost` / `laborCost` stay raw, so reopening a proposal
reads the costs back unchanged (`draftFromProposal` divides an unsplit
stored price by the load as well as the markup).

This is a **server action change** (data layer): every caller of
`saveProposal` that sends `overheadPct` / `profitPct` now gets them applied to
the stored prices — including proposal-builder-a's draft store, whose own
preview already shows a "grand total" with them.

## The choice reaches the client (same day)

Owner: *"when labor + materials is on, the client proposal still shows totals
only."* It did, because the four switches were never saved. Three columns on
`Proposal` — `showBreakdown`, `showScope`, `showSignature` (all default
true) — now ride with the row: `payloadFromDraft` sends them, `saveProposal`
stores them, `draftFromProposal` reads them back, and the client-facing
surfaces read them:

- the portal (`/portal/q/[publicId]`) prints "Materials $ · Labor $" under
  each line when `showBreakdown`, and the scope section only when
  `showScope`;
- the mobile client page (`mobile-proposal-client-v2`) prints the same split
  line;
- both PDF routes (`api/proposals/[id]/pdf`, `api/public-quote/[publicId]/pdf`)
  add the split caption to each row and drop the scope when asked.

The split of a STORED line is `clientSplit` (`lib/pricing/markup.ts`): the
marked-up raw halves' ratio of the stored total, labor as the remainder, so
the halves add up to the total and match the editor's own printed halves to
the cent (the editor's `printedLines` uses the same arithmetic). A line with
one side only — roof, fence and HVAC estimators write separate material and
labor lines — prints just that side ("Materials $500.00"); a line with no
split prints no breakdown. Every estimator that creates a proposal writes
`materialCost` / `laborCost` (Smart Proposal, roof, fence, HVAC, templates),
so their proposals can show the breakdown too.

Schema change: three Boolean columns with defaults; the deploy's `prisma db
push` adds them without touching data. Existing proposals default to
breakdown shown, scope shown, signature lines shown — what the builder's
card 06 defaulted to all along.

## Where overhead and profit go (same day)

Owner: *"when you throw extra on profit and overhead it just gets the total
bigger … the client will ask where that money comes from."* They never were
a row the client sees — the sheet, the portal and the PDF spread them into
every line's price — but the builder's own line table showed costs only, so
the contractor saw $10,730 of lines under a $29,463 pre-tax and assumed the
client would too.

- **Card 03 prints the client price under every line** once overhead or
  profit is on (desk and handheld tables, `client` on `LineItemsProps`):
  card 10's printed amount per line, and the pre-tax under the foot, with a
  note — "Client price $29,463.58 — 69.5% overhead and 62% profit spread
  across every line". At 0% / 0% cost and price are one number and nothing
  extra prints.
- **Card 04 says it and offers the one real choice**: a note under the two
  sheet-level sliders, and "In the breakdown they land: Across materials and
  labor | In labor only" (`Draft.marginOnLabor`, `Proposal.marginOnLabor`,
  default false). Across: each half of a line carries the load in
  proportion. In labor only: the material half reads at its (marked-up)
  cost and the labor half carries overhead and profit; a line with no labor
  keeps them in its material price. The choice never moves a line's amount
  or the total — only how the two halves read when the breakdown is shown.
- The stored split (`clientSplit`) takes the same choice, so the portal,
  the mobile client page and both PDF routes show the same halves as card
  10 (`proposal-money.check.ts`: same amounts either way; the portal's halves
  match the sheet's under both settings).

The Materials / Labor sliders remain the tool for moving the price of a
whole bucket (baked into the costs on save); overhead and profit remain
rates the proposal remembers, so the margin badge and Financials can read
them back. Both end up in the line prices the client sees.

## Proof

`scripts/qa/proposal-money.check.ts` (17 checks): neutral sheet, overhead +
profit spread into the printed column, breakdown halves, the sliders in the
printed prices and baked on save, and the server pricing agreeing with the
sheet to the cent at four rate settings. On the stand (`manual-money.js`,
`manual-money-phone.js`): card 06 renders the control; the client's copy
shows or hides "Materials $ · Labor $" per line; Materials +10% moves row 2
from $1,360 to $1,496 and the foot to $3,912 with the ledger and the grand
total agreeing; save + reload shows the baked costs at a neutral slider; with
overhead 10% + profit 10% the ledger, the client's copy and the grand total
all read $4,312.00, and the saved row's subtotal and line prices match.
