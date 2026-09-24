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
