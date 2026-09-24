# Equipment on file, visit reports, online booking

*2026-09-23.* Phases 3 and 4 of the owner's Housecall Pro comparison.

## Equipment on file (`ClientEquipment`)

- Every client page has an **Equipment on file** panel: the units at the
  home, one line each (`lib/equipment` `equipmentLine`: "AC + gas furnace ·
  Carrier 24ACC636 · 3 ton · R-410A · 2010 (16 years)") with the **age
  advice** (`equipmentAdvice`: 10+ keep on tune-ups; 15+ / heat pump 12+
  quote the replacement next to any big repair; 18+ plan it; R-22 its own
  line).
- A unit gets on file three ways: typed; **read off a nameplate photo**
  (the HVAC estimator's reader, `readHvacNameplate`, prefills the form);
  **filed by the HVAC estimator** when an estimate converts for a client
  (`fileEquipmentFromModel` from the estimate's existing system, never
  overwriting a typed row). The visit report writes the filter size back.

## The visit report (`VisitReport`)

- `/dashboard/visits/[appointmentId]`: the visit, the client, the units on
  file with their advice, and the report form — readings by the side of the
  system (`readingFieldsFor`: cooling = split, superheat/subcool, capacitor
  µF vs rated, amps, drain; heating = gas pressure, flame sensor µA, CO in
  the flue and at the register, heat rise, heat exchanger; both = static
  pressure, filter, blower amps). The readings **raise findings on their
  own** (`readingFindings`: high static, low split, weak capacitor, weak
  flame sensor, CO — with severities); the tech adds lines (`!!` now, `!`
  repair, `?` watch); a client-facing summary is written from all of it
  when the tech leaves it blank (`reportSummary`).
- **Save and send**: email with the findings and a public page
  (`/report/[token]`: summary, chips, readings against their normal ranges,
  the equipment, the next step with a link to book), the appointment
  completed, a plan visit marked done. Reached from the Service plans page
  ("Report" on a visit), from an online booking's row ("Visit"), and from
  the first line of a plan visit's calendar notes.

## Online booking (`Booking`, `Organization.bookingSettingsJson`)

- **Public `/book/<company slug>`**: service → time → details → receipt.
  The **services come from the shop's trades** (`defaultServicesFor`: HVAC
  = repair/diagnostic, same-day no-cooling/no-heat, seasonal tune-up,
  replacement estimate; roofing = inspection & estimate, leak call; fencing
  = estimate visit; plumbing/electrical service calls; remodel consultation;
  always "something else"); each has a length, a price line, a **member
  price line**, and the one or two **questions that matter** (what is it
  doing, the system, its age…) so the tech arrives knowing the job.
- **Open times come from the real calendar** (`availableSlots`): the shop's
  hours per weekday, slot grid, notice hours (an urgent service can start
  two hours out), crews out at once, arrival windows; busy = appointments +
  jobs + org-wide blocks. The slot is checked again at booking.
- **What a booking does**: matched to a client the shop knows by email
  (any case) — a member (active plan) gets the member price on the receipt
  — or becomes a **lead** (source BOOKING, the answers as its scope, so the
  lead page's estimator buttons work); an **appointment on the calendar**;
  a bell notice; a confirmation email with a **manage link**
  (`/book/manage/[token]`: move to another open time, or cancel); a
  reminder the day before (rides the daily cron).
- **Office page `/dashboard/booking`** (Delivery → Online booking): the link
  and a paste-in website button, the numbers, the visits booked online
  (with Visit / Done / Cancel), hours and rules, the services (edit, add,
  remove, reset to the smart defaults).

## Checks

- `scripts/qa/equipment-booking.check.ts` — the rules.
- Stand walks (scratchpad): `equipment-visit.js`, `booking.js`.

## Not done

- A QR code for trucks and invoices (no QR library in the app; the link and
  the button are there).
- SMS confirmations (email + bell only).
- Prefilling the HVAC estimator's existing system from equipment on file
  when opened for a client.
