# Text messages (2026-09-24)

JobFlex owns the Twilio account. A contractor never sees a key: they verify a
mobile, tick which events reach it, add their crew's numbers, and the texts
flow. The office gets one line per event; the crew gets the things that
change their day.

## Setup, once, on the platform

- **/admin/integrations/twilio** (2026-09-24): the platform admin pastes the
  Account SID, the Auth Token (stored encrypted with `TOKEN_ENCRYPTION_KEY`,
  never shown back), the Messaging Service SID (preferred) or a sending
  number, and a switch. "Check with Twilio" is a real round trip; "Send test"
  texts a number; the page lists the webhook URLs to paste and the last texts
  with Twilio's delivery status. Every contractor runs on these settings
  within a minute of a save (a one-minute cache per process).
- The env keys stay the fallback when the admin row is empty:
  `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and either `TWILIO_MESSAGING_SERVICE_SID`
  (preferred) or `TWILIO_PHONE_NUMBER`. US carriers only honor an A2P
  registration for traffic sent through a Messaging Service — a bare number
  reads as unregistered and comes back undelivered (error 30034). Register a
  toll-free number (toll-free verification) or a 10DLC campaign
  ("account notifications and reminders") under a Messaging Service.
- Twilio console → the Messaging Service → Integration: inbound webhook
  `https://www.jobflex.app/api/twilio/sms` (POST), and turn on Advanced
  Opt-Out so STOP / START / HELP are handled by Twilio too. Delivery
  status arrives at `/api/twilio/sms/status` (set per message). Both verify
  the Twilio signature; set `TWILIO_APP_URL` when the public URL differs.
- Vercel cron `/api/cron/sms-crew` runs hourly (`15 * * * *`).

Without the keys the app works the same: every text is a `SKIPPED` row in
`SmsMessage`, which is how the local stand shows what would have gone.

## Production record (2026-09-29)

- Twilio account **Jobflex LLC**, ISV Reseller compliance profile
  `BUb28368a569264579990ef6a0a5de1279` (approved 2026-09-29).
- Platform number **+1 866 897 5760** (`PNbb44dd70d0f505e1c88ae59eef4c1254`,
  toll-free, SMS + Voice; voice webhook → `/api/twilio/voice`).
- Messaging Service **JobFlex** `MG837450cfa0296fc503c810b0699dfa69`:
  inbound webhook `/api/twilio/sms` (POST), sticky sender, use case
  notifications, the number in its pool. Set in /admin/integrations/twilio
  with the Account SID and Auth Token.
- Toll-free verification `HH46f4f5318f2309024fd8c84e8db70819`, submitted
  through the API (`Tollfree/Verifications`): categories account
  notifications + customer care, opt-in type web form, 10,000/month, the
  opt-in pictures at `/twilio/opt-in-settings.png` and
  `/twilio/opt-in-worker.png` (public/twilio — a real capture of the
  Settings → Texting consent card and the worker sheet's checkbox).
  Twilio caps the summary, sample and additional-information fields at
  500 characters and wants `BusinessType=PRIVATE_PROFIT` plus the EIN as
  registration number/authority. Until it is approved US carriers return
  undelivered (30034); the admin page shows those rows.
- The number was bought in the console by the owner (a purchase is not
  something an assistant session may make); everything after it was done
  with the REST API.

## What the contractor does

- Settings → Notifications: the matrix has a third column, **Text**. The
  **Text messages** card below it: type a mobile, "Text me a code", enter
  the six digits. The code is the consent. "Stop texting me" drops it.
- **Also text**: extra office numbers (the dispatcher, whoever runs the
  books) get every office event; each gets a welcome text with the STOP line
  and can be paused or removed. Up to ten.
- **Quiet hours** (default 8 PM–7 AM): a text that lands in the window waits
  and goes out at the end, folded with anything else that waited into one
  "overnight" message. A new lead never waits.
- Workers → edit a worker: phone + "Text their schedule to this phone". The
  worker gets the welcome text; a STOP reply wins over the switch.

## Clients, a company's own number, the allowance (2026-09-24)

- **Text clients** (switch in the card, default on): the proposal link the
  moment a proposal is sent (`Ridgeline Roofing: your proposal "…" ($11,306.52)
  is ready — see it and accept here: <link> Reply STOP to opt out.`) and a
  reminder at 6 PM the evening before a visit (`reminder — we're scheduled at
  4567 Rainier Ave S tomorrow, Fri Sep 25, 9 AM–4 PM (Roof tear-off). Reply
  here with any questions.`). Both need a phone on the client (or the lead).
- **Your own number**: one click buys a local number in the company's area
  code on the platform's Twilio account, points its inbound webhook at
  `/api/twilio/sms`, adds it to the platform's Messaging Service (so the A2P
  registration still covers it) and keeps it on the organization
  (`smsFromNumber`, `smsNumberSid`). That company's texts then show that
  number and replies to it route straight to the company. "Release it" puts
  it back. Billed through at cost.
- **Allowance per plan** (`SMS_ALLOWANCE` in `src/lib/entitlements.ts`):
  FREE 50, STARTER 250, PROFESSIONAL 1,000, ENTERPRISE 4,000 texts a month;
  the card shows "142 of 1,000 texts this month". Beyond it texts still go
  and are billed through at 3¢ each (`SMS_OVERAGE_CENTS`); the daily caps
  still apply.

## What gets texted

Office (through each member's Text cell, or every event to the extra numbers):

| event | line |
|---|---|
| proposal accepted | `Rick Stevens accepted "Roof replacement" — $11,306.52. Schedule it: <link>` |
| proposal declined / decline taken back | `Rick declined "…": "…"` |
| payment received | `Rick paid $3,391.96 on "…" — $7,914.56 still due.` |
| change order answered | `Rick approved change order #2 "Plywood" ($850) on "…".` |
| worker responded | `Marcus Bell declined "Roof replacement" on Wed Oct 7.` |
| new lead / lead offer | `New lead: Pat, Roofing in Seattle, WA ((206) 555-0100). Open: <link>` |

Crew (phone + switch on):

- put on a job or an appointment: `you're on "Roof replacement" Wed Oct 7, 8 AM–4 PM at 4567 Rainier Ave S. Details + confirm: <link>`
- moved: `"Roof replacement" moved to Thu Oct 8, 8 AM–4 PM at …`
- cancelled: `"Roof replacement" on Wed Oct 7 is cancelled — you're not needed for it.`
- 6 PM: `Ridgeline Roofing — tomorrow (Wed Oct 7): 8 AM Roof replacement, 4567 Rainier Ave S · 1 PM Gutter repair, 12 Main St. Details: <link>`; 7 AM the same for today. Only when there is something on the list; once per day.

Replies from the field or a client come back on the bell ("Marcus texted:
…", kind `SMS_REPLY`) and are forwarded to the office numbers at once.

## Rules in `src/lib/sms/send.ts`

- A number that replied STOP is never texted (`SmsOptOut`); START clears it.
- The same words to the same number within ten minutes go once.
- Caps per day: 25 per number, 500 per company, 5,000 platform-wide;
  fail-closed when the limiter cannot answer.
- Every text is an `SmsMessage` row (direction, status from Twilio's
  callback, kind, the held `sendAfter`), which is the month counter in
  Settings and the answer to any support question.

## Data layer (additive)

`User.smsPhone`, `User.smsVerifiedAt`; `WorkerProfile.smsOptIn`,
`WorkerProfile.smsOptedInAt`; `Organization.smsClientsOn`, `smsFromNumber`,
`smsNumberSid`; tables `NotificationPhone`, `PhoneVerification`,
`SmsMessage`, `SmsOptOut`, `PlatformIntegration` (the admin's encrypted
Twilio settings, key "twilio"). Applied to production by hand before the
deploy.

## Files

`src/lib/sms/format.ts` (pure words), `send.ts` (rules, office, worker,
overnight flush), `crew.ts` (assignment, move, cancel, digests, the hourly
tick); `src/actions/sms.ts` (verify, extras, test); hooks in
`src/lib/notify.ts`, the decline and revert routes,
`src/lib/changeOrders/send.ts`, `src/actions/appointments.ts`,
`src/actions/jobs.ts`, `src/actions/workers.ts`; webhooks under
`src/app/api/twilio/sms`; cron `src/app/api/cron/sms-crew`. QA:
`scripts/qa/sms.check.ts`.

## Open

- Invoice-paid and payment-due texts to clients.
- Billing the overage and the own-number cost through Stripe automatically
  (today: counts in the table, the note in the card).

## The crew on site (2026-09-27)

Work started, a crew back for another day, the job done, and the first
photos or video of a batch text the owner and the manager; the owner sets
who gets which texts on Settings → Texting. See `docs/crew-onsite.md`.

## Who gets texted, person by person (2026-09-29)

Owner: "I just add their name and phone number and the list of what they will receive… for sales most of it is appointments or their proposal sold, for installers when they get the job or we reschedule it." Settings → Texting (desk and handheld, one component: `src/components/v3/texting-people/`) lists every member who can be texted in three rosters, by role (`audienceForRole`):

| Roster | Roles | What they can get (Text seed on unless noted) |
|---|---|---|
| Office | OWNER, ADMIN, MANAGER, ACCOUNTANT | New lead · Proposal accepted · Proposal declined (off) · Payment received · Change order answered · Appointment booked · Appointment moved or cancelled · Job scheduled · Crew on site · Job completed · Photos & videos · Worker responded (off) |
| Sales & estimators | SALES, ESTIMATOR | Only their own: lead assigned to them · their proposal accepted / declined · payment (off) / change order (off) / job completed (off) on their deal · visits they booked or are staffed on (booked, moved, cancelled) · their job scheduled |
| Crew | INSTALLER | Put on a job · Job moved or cancelled · Tomorrow's list 6 PM · Today's list 7 AM |

- Each person: their mobile (verified by them, or **typed in by the office** — `setMemberMobile`, which sends the welcome text with the STOP line and writes a TEAM trail row; `smsAddedBy` in the prefs blob), Change / Stop texts, a number on file with texting off gets "Text this number", and one switch per event (`setMemberTextEvents`, only keys of their roster). Under each roster, "What the texts say" shows every text with sample facts (`PrefEventMeta.example`).
- A crew member's number is `WorkerProfile.phone` + `smsOptIn` (the Workers sheet box and this page write the same fields); their switches live in their own `User.notificationPrefsJson` under `crew-*` keys (`CREW_TEXT_EVENTS`, kept out of the Notifications matrix; `mergeMatrixSave` keeps them).
- Targeting: `textOffice(org, key, line, { alsoUserIds })` texts the office by role plus named members (the proposal's `ownerId`, the lead's `assignedToId`, the appointment's `createdById` and staffed members), each through their own cells, never the actor, and **only for keys on their own roster** (a crew member named on a visit gets the crew's text, not the office's).
- New texts (`src/lib/sms/schedule.ts`, words in `format.ts`): `Booked: Roof inspection · Sarah Mitchell · Wed Oct 7, 9 AM–10 AM · 18412 92nd Ave NE · online.` / `Moved: … — was Wed Oct 7, 9 AM, now Fri Oct 9, 1 PM–2 PM.` / `Cancelled: … — Fri Oct 9, 1 PM–2 PM, by the client.` / `Scheduled: "<job>" — Tue Oct 13, 8 AM–4 PM at 18412 92nd Ave NE. <link>`. Hooks: `createAppointment`, `updateAppointment` (a real move / a cancel), `deleteAppointment`, `rescheduleAppointment`, online `createBooking` / `rescheduleBooking` / `cancelBooking`, `createJob` with a date, `createJobFromProposal`, `scheduleJobFromTray`.
- No schema change.

## Your own texts (2026-09-29)

Owner: "make option for user to create new text situation by themselves." Settings → Texting → **Your own texts** (desk and handheld, `components/v3/texting-people/text-rules.tsx`): a list of the company's texts (on/off switch, Edit, Delete with a second tap), eight ready-made ideas, and an editor — **When** (17 moments; four are timed: hours before an appointment, hours before a crew day, days with no answer on a proposal, days after a job), **Who** (the client, owner & managers, the rep on it, the crew on it, plus named people), **The text** with `{fields}` chips (`{client} {first} {company} {phone} {job} {when} {address} {total} {amount} {rep} {link} {note}` — only the ones the moment can fill), a live "How it reads" preview for the client and for the team, and "Send me a test".

- Catalog, fields, ideas, renderer: `src/lib/sms/textRules.ts` (pure). Sends: `src/lib/sms/rulesEngine.ts` — `fireTextRules(trigger, context)` from the hooks, `runTimedTextRules(now)` from the hourly `/api/cron/sms-crew`. Actions: `src/actions/textRules.ts` (save/switch/delete/test, managers only, trail rows). Table `TextRule` (additive, no relations).
- Rules: clients only when Text clients is on, always signed with the company (once — not when the words already name it) and the STOP line; client texts never 9 PM–8 AM, team texts never 8 PM–7 AM (they wait); a delayed text that would land at night waits for the morning; the person who clicked is not texted; a rule says a thing once per proposal / visit / job day (`SmsMessage.kind = rule:<rule>:<thing>`); held rule texts are never folded into the overnight digest. Up to 30 texts per company, 300 characters each.
- Hooks: new lead, proposal sent / first opened / accepted / declined, payment, change order answered, appointment booked / moved / cancelled, job scheduled / started / completed (+ days after).
