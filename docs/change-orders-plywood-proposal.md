# Change orders with a plywood / sheathing type — technical proposal

Status: BUILT 2026-09-13 after an adversarial re-check (21 agents; 4 blockers and ~20 factual corrections folded in — see "What the re-check changed" at the end). Reminders with an auto / manual mode are the next batch.

## What exists today (read before designing)

- `ChangeOrder` model: one signed `amount`, title, description, status DRAFT → SENT → APPROVED / DECLINED, `publicToken`, timestamps, `approvedIp`. Attaches to a Proposal (the contract) or a Job (legacy).
- Actions in `src/actions/changeOrders.ts`: create (optionally send), send, delete, approve/decline (public, token-gated). Send emails the client a `/co/[token]` link.
- Client page `src/app/(portal)/co/[token]/page.tsx` + `ChangeOrderApprovalCard`: title, description, amount, approve / decline. No lines, no photos, no signature.
- Dashboard: `NewChangeOrderSheet` (title, description, ± amount) and `ChangeOrderList` — **not mounted on any reachable page** (the proposals page code says so). The job-detail blueprint has Send / Mark approved actions. Financials rollups count approved change orders by `amount`.
- Money: `Proposal.subtotal/taxRate/taxTotal/total`; `Installment` rows (percent or fixed) resolved by `lib/paymentSchedule.resolveSchedule` against the proposal total; `scheduleVersion` bumps expire open checkouts; Stripe / Square / PayPal charge installments from the portal. `Invoice` model exists but nothing creates invoices — "balance due" is the resolved schedule's `remainingMinor`.
- Photos: Vercel Blob (`lib/sdk/blob.uploadBlob`), a worker upload route as the pattern. SMS: `lib/sdk/twilio.ts` via `lib/notify.ts`.
- Defect to fix on the way: approval today does `subtotal += amount, total += amount` on the proposal — no tax, no schedule change, and it rewrites the original figures the spec says must stay.

## Data model (additive; two new tables, columns on ChangeOrder)

**ChangeOrder** (new nullable columns — safe to `db push` before the deploy):
`number Int` (per proposal, "CO #2"), `kind String` ("plywood_sheathing" | "custom" | any catalog key), `linesJson String` (`[{key, label, quantity, unit, unitPrice, kind: material|labor, meta}]`, amount = sum), `taxable Boolean default true`, `taxRate Float`, `taxTotal Float`, `total Float` (snapshot at send — tax rate copied from the proposal so a later rate edit cannot move a sent order), `photosJson String default "[]"` (`[{id,url,caption}]` on Blob), `reason String` (why the client is paying more), `approvedName String` (typed full name — the lightweight e-signature), `approvedUserAgent String`, `declineReason String`, `installmentId String?` (the stage approval created).

**ChangeOrderType** — the data-driven catalog: `organizationId` (null = built-in, seeded once), `key`, `label`, `unit`, `definitionJson`, `position`, `active`. The definition is a small form spec: item list with suggested unit prices, quantity helpers (sheets × 32, length × width, multiple named areas), whether photos / reason apply, smart-default rules (by roof family). Adding fascia, rafter repair or extra ventilation is a row, not a release.

**ChangeOrderPricePref** — `organizationId`, `userId`, `typeKey`, `itemKey`, `unitPrice`, `lastQuantity`, `updatedAt`, unique on the four keys. "The override is saved as their own default for next time, per material, per contractor."

Built-in plywood type (seed): 1/2" CDX, 5/8" CDX, 3/4" CDX, 7/16" OSB, 1/2" OSB, 5/8" OSB, Custom. Priced per sq ft installed (material + labor). Suggested 2026 defaults to verify against local market before launch: CDX 1/2" $3.75 · 5/8" $4.25 · 3/4" $5.00; OSB 7/16" $2.75 · 1/2" $3.00 · 5/8" $3.50. Smart default: 1/2" CDX for asphalt / synthetic, 5/8" CDX for tile / slate / metal panel (heavier or screw-down systems), 7/16" OSB when the contractor's own history says so; last price and last sheet count from the pref row.

Optional allowance: the roof package builder already has "Deck sheets to replace"; it becomes "Plywood allowance · up to N sheets at $/sq ft" on the estimate, and the plywood change order reads it and prices only the overage.

## Approval flow

1. **Create** — from the job (mobile job detail and the crew's phone), from the proposal page (roofing proposals included — the sheet gets mounted there, which today it is not), or from the dashboard list. Pick a type → the form the type defines → areas, material, price (pre-filled), photos from the camera, reason → running total with tax → **Send** (Draft is optional; one tap sends).
2. **Send** — status SENT; email + SMS with the `/co/[token]` link, same channel the proposal used.
3. **Client page** — the change (lines with material · area · $/sq ft · total), the photos, the reason, subtotal / tax / total, "your project: original $X → this change +$Y → new total $Z". Approve = typed full name + "I agree" + timestamp, IP, user agent. Decline = optional reason. Either way the contractor is notified.
4. **In person** — the contractor can mark it approved on site with the client's name typed on the phone; recorded as such.

## Totals — the rule

The proposal's own figures never change. The contract value is derived: `contractTotal = proposal.total + Σ approved change-order totals`, computed by one helper (`lib/contractTotal.ts`) and used everywhere money is read — portal, PDF, proposal list, job detail, financials. Each change order keeps its own subtotal / tax / total snapshot, so the record reads: original → CO #1 → CO #2 → current.

Payment schedule: on approval the change order becomes **its own fixed installment** ("Change order #2 · Plywood replacement", amount = CO total, position after the existing stages, UNPAID) with `installmentId` written back, and `scheduleVersion` bumps so any open checkout is re-minted. Percent stages (30% deposit / 70% completion) keep meaning percent of the **original** contract — `resolveSchedule` gains a `pctBaseMinor` input (defaults to total, so nothing else changes). Balance due is then correct by construction: total = original + change orders, paid = paid, remaining = the rest. Declined or reverted orders never touch the schedule.

Invoices: nothing creates `Invoice` rows today, so "invoice update" means the schedule. When invoices are introduced, one invoice per installment is the natural unit and a change-order installment is already one.

## Payments — what SmartSpace Pro does with the client, and how JobFlex plugs in

Read three times (schema, server actions, client portal) on 2026-09-13.

**SmartSpace Pro, end to end.**
- The office picks a **rail at send time** (`Proposal.payWith`: square | stax | null = bill by hand). On acceptance the default schedule is created and the first due installment is invoiced through that rail automatically, so the client can pay the moment they say yes. No rail chosen = no pay page is ever invented by the app.
- **Fees are not computed in the app — the rail choice IS the fee decision.** Three rails per installment, chosen by the office: (1) a Square/Stax hosted invoice, card or bank; (2) the same Square invoice **ACH-only** ("no card — the card fee on a five-figure install is worth a separate button"); (3) **direct ACH / wire** from the contractor's own bank details, stored once on the profile (business name, address, account, ACH routing, wire routing), shown on the portal as a collapsed tap-to-copy card, emailed as a "bank details" sheet, and stamped `bankDetailsSentAt` — after which the app refuses to mint a card page over it.
- The client's **payment hub**: status hero, paid amount and a progress bar, "$X remaining", each installment with Paid / overdue badges, one **"Pay $amount now — card or bank"** button on the next pending installment (the provider's hosted page), the bank-transfer card, the change-order cards, and the contractor's phone.
- **Change orders on the portal**: lines, "Type your full name to approve" (typed name = e-sign), Approve · $amount / Decline with reason. Approval in one transaction: CO APPROVED + name, a new installment "Change order #N — title" appended, `totalCents += amount`, then `syncMoneyState` recomputes paid/complete and **reopens a finished job** if a balance appears; the contractor is emailed the decision.
- **Paid detection**: a poller asks Square/Stax about open invoices; a paid one settles through the same bookkeeping as a hand-recorded payment (paid stamp with method card / bank transfer, money resync, completion cascade, PAID event, office push + SMS). Hand-recorded payments carry a method (card / cash / check / bank transfer / other) and send a **receipt email** (paid-in-full variant when the last dollar lands); receipts can be previewed and re-sent.
- **Reminders**: a three-rung ladder at day 1, 3 and 7 after the invoice went out, deposit wording ("releases the order and holds the slot") vs final wording, email + SMS carrying the pay link and the bank details, per-job on/off, max three, a manual Remind never consumes a rung; every send logged with its subject, body and per-channel delivery. The invoice SMS is written to pass the "is this a scam?" test (company names itself, says what the amount is for, only the provider's own link, one-way number).

**JobFlex today** already has the deeper processor side SmartSpace lacks — connected Stripe / Square / PayPal accounts, platform fee in bps, checkout sessions, webhooks, a settle path with over/unapplied handling, minimums — but not the client-facing choices above: no rail picked at send, no ACH-only or bank-details rail, no reminder ladder, no receipt email, and change orders that do not touch the schedule.

**Plug-in points (later phase), all on the installment, none on the change order:**
- `Proposal.payWith` (stripe | square | paypal | bank | null) chosen when the proposal is sent; `Organization.bankTransferJson` for the direct-transfer sheet, surfaced on the portal like SmartSpace's card.
- `Installment.rail` / `achOnly` so a five-figure balance can be offered bank-only; `Payment.method` already exists for the record.
- A client-side surcharge, if the owner ever wants one, is `Installment.surchargePct` applied inside `amountForTarget` — one function, already the single place amounts are computed.
- Receipts and the reminder ladder attach to installments and reuse `lib/notify` (email + Twilio SMS already wired).
Because the change-order phase only ever creates an installment and bumps `scheduleVersion`, every item above lands later without touching it.

## Build order

1. Schema (push first — additive) + `ChangeOrderType` seed + price prefs.
2. Actions: create with lines/photos/type, send (email + SMS), approve with e-sign, `contractTotal`, the installment on approval, `pctBaseMinor`.
3. Mobile-first change-order sheet (type picker → plywood form → photos → send), mounted on the job page, the proposal page and the mobile job detail.
4. Client page rebuilt: lines, photos, reason, totals, name + agree.
5. Replace direct `proposal.total` money reads with `contractTotal`; financials use CO totals with tax.
Verification in a real browser at 390 × 844 per CLAUDE.md before reporting done.


## What the re-check changed (2026-09-13)

Corrections to the "exists today" section, verified in code:
- Financials never totalled approved change orders (a count of DRAFT+SENT, and a books sum over every status); the snapshot now maps `total ?? amount`.
- The change-order LIST was reachable (financials pages, job page); CREATION was not — the sheet's only caller was unmounted. The sheet is now on the job page (desktop + handheld) and the proposals page (accepted card).
- `scheduleVersion` never expired checkouts on its own; approval now calls `expireOpenCheckoutsForProposal` explicitly.
- Only Stripe and Square charge; PayPal is a stub.
- The proposal goes out by email only (the contractor's own sender); client SMS is a new channel — the change order texts through Twilio after the email, in its own try/catch, with `toE164` normalizing the free-text phone.
- Production `db push` runs inside the Vercel build; previews do not push (push the Neon dev branch by hand).
- Built-in types live in code (`lib/changeOrders/types.ts`); `ChangeOrderType` rows are org-authored only; price prefs are per company (`ChangeOrderPricePref`, org + type + item).
- Crew (INSTALLER) creation is NOT in this batch: `createChangeOrder` stays manager-gated. Office roles create; a worker permission is a follow-up.
- Region-based defaults are not in this batch: the material is pre-selected from the roof family read off the proposal's line names.
- The plywood allowance in the original estimate is a follow-up (nothing structured survives on a proposal today).

The four blockers and their fixes, all built:
1. Approval after PAID / COMPLETED — approval reopens PAID → ACCEPTED; `createCheckout` and the portal model accept COMPLETED when something is owed.
2. `pctBase` is REQUIRED on `resolveSchedule` (not optional): all 17 call sites migrated in one change; a regression script (`scripts/qa/paymentSchedule.check.ts`) pins the $10k / 30-70 / +$1,080 case and the waive case.
3. `ensureSchedule` runs before the change-order stage is appended, so the implicit 100% stage becomes a real row first.
4. Legacy APPROVED rows with `total` null were already folded into `proposal.total` and are excluded from the contract sum; the old increment code is gone.

Also from the re-check: the change-order stage is locked (`Installment.changeOrderId`, kept and re-indexed by builder saves); approval is one conditional `updateMany` in a transaction with a rate-limited public route; in-person approval is its own manager action recorded as `approvedVia = in_person`; credits create no stage; the client page and email read original → approved so far → this change → new total; the office is emailed the client's answer (the `change-order` pref is now email-capable); the job page unions job- and proposal-scoped orders; the project view prints original → changes → current per job.

## Payment reminders — auto or manual (built 2026-09-13)

- Settings → Payments: **Auto / Manual / Off** (`PaymentSettings.reminderMode`, default Manual). Auto nudges the next unpaid stage on a day 1 / 3 / 7 ladder after the stage's due date (or acceptance), three times at most, never twice in a day. Manual sends only from Remind / Request payment. Off sends nothing.
- Each accepted proposal's card has an "Auto-remind" switch: company mode → on → off (`Proposal.remindersOn`, null = follow the company).
- One sender for both (`lib/payments/reminders.ts`): the branded email through the contractor's own sender plus a text with the pay link; the stage is stamped (`Installment.remindedAt`, `reminderCount`) and an activity line records email/text delivery. The daily cron is `/api/cron/payment-reminders` (15:00 UTC, `CRON_SECRET`-gated), added to `vercel.json`.
