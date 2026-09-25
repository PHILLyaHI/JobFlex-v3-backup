# Trial watch (2026-09-24)

Owner: "can we track and check if people on a free trial are trying to copy
our features by doing screenshots of pages?"

## What holds

- **A screenshot cannot be seen.** A web page gets no event for it and a
  phone photographing the screen is invisible by definition. Nothing here
  tries to block one — blurring on blur, killing right-click or DevTools
  is defeated in seconds and punishes real contractors.
- **Behaviour can be seen.** `lib/trialWatch` (pure) scores every company
  signed up in the last 60 days from four things: its **page views** (one
  row per screen a member opens, `PageView`, recorded for the company's
  first 45 days by `actions/pageView` from the `PageViewBeacon` the
  signed-in layouts mount — the route pattern, never the id or the query),
  the **records** it made (clients, proposals and proposals sent, jobs,
  leads), its members' **email domains**, and whether another trial was
  seen on the **same device and address** (a short hash of each, no
  address kept). The signals are sentences with weights:
  opened N screens and created nothing (+40) · browsed N screens for K
  records (+25) · N screens in M minutes (+20) · signed up from a
  competitor's domain (+45) · same device as another trial (+25) · a test
  name (+10); proposals sent (−30), jobs scheduled (−20) or records made
  (−15) score it down. 60 and up is "look at this", 30 to 59 "watch".
- **The admin page** `/admin/trials` (Platform · Trial watch): the KPI
  strip, the trials highest score first with screens, records, sittings and
  the score bar, and under each row the signals, the screens opened and
  what was made. When the PageView table is not in the database yet the
  page says so and shows the signals that need no page views.
- **The watermark.** Every screen of an account that has not paid (its
  subscription is not ACTIVE or PAST_DUE) carries a faint tiled line —
  "Trial · company · email · date" — above everything, touching nothing,
  kept when printed. It stops no screenshot; it makes every screenshot name
  its source. Both signed-in layouts mount it (`TrialWatchMount`).

## Data layer

One new table, `PageView` (organizationId, userId, route, ipHash, uaHash,
at; no relation, so it reaches production without touching any table the
app already reads). The production build does not push the schema: until
`prisma db push` is run against Neon by hand, the write is silently
skipped and the admin page says page views are not recorded yet. Pruned by
the write itself (rows older than 120 days, one write in five hundred).

## Proof

`scripts/qa/trial-watch.check.ts` (route patterns, sittings, each signal,
the levels, the watermark text and tile). On the stand
(`$SP/stock/trial-walk.js`): the watermark on the dashboard, page views
recorded as the owner moves between screens, the admin list with a seeded
competitor tour on top and its reasons, at desk and phone width.
