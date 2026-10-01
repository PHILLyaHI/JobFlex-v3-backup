# Traffic Analytics

`/admin/traffic` is an admin-only, aggregated PostHog dashboard. The existing
admin guard protects both its page and its server action. No personal key is
sent to the browser. The dashboard does not need an MCP connection.

## Configuration

- `NEXT_PUBLIC_POSTHOG_KEY`: public project token, never a personal/secret API key.
- `NEXT_PUBLIC_POSTHOG_HOST`: ingestion host, `https://us.i.posthog.com` or EU equivalent.
- `POSTHOG_PERSONAL_API_KEY`: server-only key authorized for `query:read` on this project.
- `POSTHOG_PROJECT_ID`: numeric project ID.
- `POSTHOG_HOST`: query API host, `https://us.posthog.com` or `https://eu.posthog.com`.

Use matching regions and projects. Public environment changes require a new
frontend build/deploy. Query results are cached for 60 seconds, up to 24 filter
combinations. Upstream errors remain visible; missing reports do not become
invented zero-valued results.

## Definitions

- Visitors: distinct PostHog `person_id` values, not guaranteed unique humans.
- New: first observed pageview on/after the start date. Returning: first observed before it.
- Repeat: 2+ recorded sessions within the selected range; includes some new visitors.
- All-time and today: site-wide within host/environment, not the page/audience/source/device slice.
- Pages: only `$pageview`; registration screens: only `jf_registration_step_viewed`.
- Acquisition: source/referrer/campaign at session entry. A visitor can have multiple sources.
- Funnel: first eligible landing in range, each later step in order within 1/7/14 days.
  Later outcomes may arrive after the end of the selected date range.
- Google signup skips the account/password step; choose its separate funnel.
- Live billing outcomes are the default. Test mode changes verified outcomes only;
  a browser attempt does not yet know which Stripe mode the server will choose.

Dates include both endpoints and follow the selected timezone, including DST.
Admin routes are excluded. Old environment labels are inferred from hostname.
Historical unrecorded registration steps cannot be backfilled from pageviews:
all three screens share `/auth/register`.

Ranges starting on/before the first observed step date have partial coverage.
The dashboard withholds entry-to-step and overall rates for those ranges;
observed step-to-step rates remain available. Choose later dates for fully
instrumented entry cohorts.

## Capture Contract

`src/lib/traffic-contract.ts` owns the event names and shared report types.

| Event | Recorded When |
| --- | --- |
| `$pageview` | A public/app URL changes; token-bearing query parameters removed |
| `jf_registration_step_viewed` | A registration screen 1, 2 or 3 is rendered |
| `jf_checkout_attempted` | Trial/purchase button is pressed; includes intent, plan and interval |
| `jf_checkout_opened` | Checkout endpoint returns a successful redirect URL |
| `jf_signup_completed` | Server verifies Stripe and creates the account; includes outcome and billing mode |
| `jf_registration_error` | Checkout cannot open; coarse reason only, no form values |
| `jf_experiment_exposed` | An approved experiment variant is actually rendered |

Anonymous browser/session IDs are optionally parked with the pending signup so
the verified server event joins the same visitor. Analytics failures never block
signup. The completion event is scheduled with Next `after`, has a bounded
request timeout and a Stripe-session-derived deduplication ID. Replaying a
consumed signup return does not emit another completion. This is best-effort
analytics, not a replacement for Stripe's billing ledger or webhooks.

Autocapture and session replay are disabled to avoid collecting contractor form
contents. URL properties retain only `utm_source`, `utm_medium`, `utm_campaign`,
`utm_content` and `utm_term`; signup tokens, OAuth handles and Stripe session IDs
are stripped. Respect the application's consent policy when enabling analytics.

## Adding a Future A/B Test

No test is launched by this release. No pages are randomly changed.

1. Agree on the page, control/treatment, primary outcome, allocation and stopping
   rule. Create a multivariate flag/experiment in PostHog for the same project.
2. Add its unique key, exact pathname and allowed string variants to
   `TRAFFIC_EXPERIMENTS` in `src/lib/traffic-experiments.ts`. A nonempty registry
   enables the SDK flag request. Never reuse a previous experiment's key.
3. In the tested page, use `useTrafficExperiment(key)` from
   `src/components/providers/use-traffic-experiment.ts` and render the returned
   variant. While it is null, render a neutral loading state, not a visible
   control that may immediately turn into treatment. After a two-second timeout,
   the hook locks to the first configured variant (put control first) without
   recording an experiment exposure, so blocked analytics cannot break the page.
   Preserve registration and
   checkout tracking in both branches.
4. The hook records exposure after commit. The report cohorts by the visitor's
   first-ever exposure to that experiment, excludes visitors exposed to multiple
   variants, and counts later attempts and verified outcomes in the chosen window.
5. Select the baseline in the experiment bench. Compare counts, rates, relative
   lift and 95% Wilson intervals. These intervals are not a between-variant
   significance test, and the dashboard never automatically declares a winner.

The page filter does not constrain the funnel or experiment report. An
experiment defines its own tested page. Source, device, audience, host and
environment segment the entry/exposure cohort. Renamed landing URLs require
updating the funnel entry predicate; rendering variants at the same URL does not.

## Attribution Limits

PostHog can capture referring domains and tagged campaigns. It cannot recover
arbitrary browsing history or searches the browser/search engine does not share.
`utm_term` is a campaign keyword, not an organic Google/Bing query. Connect Google
Search Console or Bing Webmaster Tools separately for aggregate search queries;
those services are not connected by this implementation.

References: [PostHog attribution](https://posthog.com/docs/data/utm-segmentation),
[Query API](https://posthog.com/docs/api/queries),
[Experiments](https://posthog.com/docs/experiments),
[Search Console API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query).

## Live now (2026-09-28)

Owner: "add to the statistics at admin a way to look at live users coming
from advertisements and looking at the app; if they sign up, a different
colour — make it smart."

A plate at the top of `/admin/traffic`, `LivePanel`
(`components/v3/admin-traffic/live-panel.tsx`), fed by `getLiveTraffic`
(`actions/trafficDashboard`) → `lib/traffic-server fetchLiveEvents` → ONE
HogQL query (`lib/traffic-live buildLiveQuery`): the last 30 minutes of
`$pageview` and the registration / checkout / signup events. The server
keeps the rows for 25 s for every admin; the panel polls every 45 s while
its tab is in front and refreshes when the tab comes back — the query
endpoint's budget is small and shared with the reports.

`lib/traffic-live shapeLive` (pure) turns the rows into one line per
PostHog person: **where from** (the first event of the latest visit:
`utm_*` first — a paid medium is an *ad*, an ad platform tagged with no
medium is counted as one and says so, `medium=social` is a post; then the
referrer — a Facebook / Instagram / TikTok / YouTube referrer with no tag is
"untagged, most likely an ad", search engines are search, the rest referral
or Direct), **what they are looking at** (the last pageview, pages this
visit, the trail), **how far they got** (browsing → on the sign-up form → at
checkout → **signed up**; a person on `/dashboard…` is a *member*), and
whether they are **on the site now** (an event in the last 5 minutes) or
just left (dimmer, up to 30 minutes). A verified signup is tied to the
organization the database created within 15 minutes of it with the same
campaign tag (`freshSignups`, last 24 h, the first member as the owner),
so the green line names the company and the email; a row nobody matched
is listed under the table with its own source. KPIs: on the site now, of
those from ads, signing up, signed up in the window, members in the app,
and today's signups with how many came from ads (database).

Localhost visits are hidden unless "Include localhost" is on; "From ads
only" keeps the ad visitors and the signups. In a non-production build
`POSTHOG_HOST` may point at `http://127.0.0.1:<port>` so a stand can answer
as PostHog (`scripts/qa/traffic-live.check.ts` covers the shaping; the
stand walk `$SP/live/walk.js` the page).

### The live map (2026-09-29)

Owner: "make the same live map statistic as in AVACO and adopt it to the
JobFlex admin." `components/v3/admin-traffic/live-map.tsx` is AVACO's
`LiveMap` brought over and re-skinned: the world in Natural Earth
projection from pre-drawn files (`public/maps/world-110m.json`,
`world-50m.json` once zoomed, `us-states.json` over North America — Natural
Earth and us-atlas, loaded only on this page), countries and states shaded
blueprint by their visitors, a pin per visitor at the place PostHog's
GeoIP gives the browser (`$geoip_latitude/longitude`, country and state
codes, now in the live query), coloured by stage — red looking around,
amber on the sign-up form or at checkout, green signed up, grey a member —
with a violet ring for a visit off an ad and a pulse while active. Scroll,
pinch or the buttons zoom; drag moves; hover names; a click on a pin, a
country chip or a row of the list opens who is there: the stage, the
source and campaign, the page they are on now, the trail, the device, the
signup's organization when there is one, and the others at the same place.
"Now · 5 min" keeps the map to the people on the site now. Visitors
without a GeoIP place are counted but not drawn (the legend says how
many). Where AVACO polls its own visit log every two seconds, this map
rides the same 45-second PostHog poll as the panel.

### The ad platforms, live, and the links for the ads (2026-09-29)

Owner: "statistics from Twitter, Instagram, Facebook, TikTok, Google Ads
cards like AVACO has, that track exactly where it came from — we're going
to run the advertisement." Two more pieces of AVACO's statistics, brought
over:

- **Platform cards** (`live-platforms.tsx`, `lib/traffic-live
  platformCards`) sit under the KPIs of Live now: a card each for
  Facebook, Instagram, TikTok, X and Google Ads — always, in that order,
  even at zero — then any other platform that sent someone in the window
  (YouTube, LinkedIn, Yelp…), and Search / Direct / Other sites last. Each
  card, in the platform's own colour: visitors in the window and how many
  are on the site now, from ads vs organic (a bar), signing up and signed
  up in the window, today's signups the database credits to the platform
  (the organization's `utmSource`), and the campaigns and ads seen
  (`utm_campaign` · `utm_content`, with their signups). A card pressed is a
  filter: the map and the list keep only that platform's people.
- **Platform reading** got sharper: Meta's own `{{site_source_name}}`
  values (`fb`, `ig`, `msg`, `an`) are credited to Facebook / Instagram; the
  ad platforms' **click ids** are read from the events (`gclid`/`gbraid`/
  `wbraid` Google, `ttclid` TikTok, `twclid` X, `msclkid` Bing, `li_fat_id`
  LinkedIn — each a paid click even with no tag; `fbclid` names Facebook
  without proving an ad, and with no referrer means the in-app browser).
  Every visitor now carries `platform` and `content` (the ad).
- **Links for your ads** (`ad-links.tsx`, a card under Live now): the link
  to put in each ad or post. Meta and TikTok presets carry the placeholders
  those platforms fill in themselves (`{{site_source_name}}`,
  `{{campaign.name}}`, `{{ad.name}}`; `__CAMPAIGN_NAME__`, `__CID_NAME__`)
  as the "URL parameters" beside a plain website address; Google Ads uses
  ValueTrack (`{campaignid}`, `{creative}`, `{keyword}`) in the final URL
  suffix; X and organic posts take a typed campaign name (slugged). The
  link can open the landing on a trade's hero (`?industry=roofing`…), which
  the signup keeps as its landing trade. Copy buttons for the address, the
  parameters and the full link.

