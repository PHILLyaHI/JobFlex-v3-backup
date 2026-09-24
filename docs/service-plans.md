# Service plans (memberships)

*2026-09-22.* What a maintenance plan is in JobFlex, how it runs itself,
and where each piece lives. Built after the owner's Housecall Pro
comparison ("we need that too — make it smart and easy").

## What a plan is

- **A template** is what the shop sells (`ServicePlanTemplate`): visits a
  year, term, price, monthly or yearly billing, discount on repairs,
  benefits, priority scheduling, waived diagnostic. Three starter plans are
  one click away on the Service plans page (`STARTER_PLANS` in
  `lib/servicePlans`): Comfort $21/mo · 2 visits · 15%, Essential $149/yr ·
  1 visit · 10%, Premium $29/mo · 2 visits · 20%.
- **A plan** is one client's membership (`ServicePlan`): a snapshot of the
  terms at signing, `DRAFT → SENT → ACTIVE → EXPIRED | CANCELED`, with its
  visits (`ServicePlanVisit`, each tied to a calendar `Appointment`) and the
  invoices that bill it (`Invoice.servicePlanId`).

## What it does on its own

- **Enroll** from the Service plans page or the client page: "send to sign"
  emails the client the plan card with an accept link (`/plan/[token]`,
  public); "start today" activates it when it was signed with the office.
- **Activation** (`lib/servicePlanBook` `activatePlan`): term set; the visits
  land on the calendar — seasonal for HVAC (spring cooling tune-up ≈ Apr 15,
  fall heating tune-up ≈ Oct 1; one a year = the next season; otherwise
  spread through the term) at 9:00 in the shop's time zone, two hours, the
  crew's tune-up checklist in the appointment notes; the first invoice is
  written (MANUAL provider, due in 7 days); the client gets a welcome email.
- **Daily** (`/api/cron/service-plans`, 14:00 UTC): bills due go out (invoice
  + email + bell); visits two weeks out are announced (bell to the office,
  email to the client); plans ending within 30 days get one warning (bell +
  email); at the end a plan renews on its own (new term, new visits, new
  invoice) or, with auto-renew off, expires (bell: call to renew).
- **Member discount**: every new proposal for a client with an active plan
  gets the plan's discount line (`applyMemberDiscount`, hooked into every
  proposal creation: saveProposal and the five estimator converts), priced
  the way proposals price a discount (off before tax). A proposal that
  already has a discount keeps the contractor's own.
- **Paid by hand**: "Mark paid" closes the invoice and writes a MANUAL
  payment, so Financials counts it.

## Where

- Page `/dashboard/service-plans` (blueprint shell; Money in the sidebar):
  KPIs (active, expiring in 30 days, monthly recurring, due for billing),
  enroll, members with actions (send / start / renew / auto-renew / cancel),
  visits in the next 30 days (Done), due for billing (Mark paid), the plans
  you sell (edit / retire / new).
- Client page: a "Service plan" panel — the membership with next visit and
  billing, or the enroll form.
- Public `/plan/[token]`: the card, a typed-name acceptance, then the
  membership view.
- Bell notices: kinds `PLAN_*` with `meta.href`.

## Checks

- `scripts/qa/service-plans.check.ts` — the rules (schedule, billing, MRR,
  phases, the calendar hour, the checklist).
- Stand walk `plans.js` (scratchpad): starter plans → enroll → public accept
  → member numbers, calendar, client page → mark paid → the cron's report.

## Not done

- Card pay links for plan invoices (the payment rails are proposal-bound
  today); the invoice email asks the client to pay the shop's usual way.
- SMS reminders (email + bell only).
- A member badge on leads (leads have no client link).
