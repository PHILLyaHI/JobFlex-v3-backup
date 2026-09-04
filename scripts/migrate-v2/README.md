# Legacy JobFlex → JobFlex v3 subscriber import

Moves one old-JobFlex account into v3 so the customer signs in with **the email and
password they already use** and finds their proposals, calendar, messages, clients and
company details waiting for them.

Old passwords port verbatim: both apps hash with bcryptjs at cost 10, and the cost and
salt live inside the hash string, so no plaintext is ever needed.

## What comes across

| Old | v3 |
|---|---|
| `User` | `Organization` + `User` + `Membership` (OWNER) + `Subscription` |
| `Account` (Google) | `Account` — so a password-less account can still sign in |
| `Client` | `Client` (soft-deleted ones included: live quotes point at them) |
| `Quote` | `Proposal` + `LineItem[]` + `Discount` + `Installment[]` + `PricingSnapshot` |
| `JobEvent` | `Job` (one per quote) + `JobEvent` |
| `Appointment`, `LeadAppointment` | `Appointment` |
| `Conversation` + `Message` | `Conversation` + `ConversationParticipant` + `Message` |
| `Lead` | `Lead` |

Deliberately **not** migrated: invoices and payments, crew/team members, Gmail and Meta
OAuth tokens (different client ids — they must reconnect), and the old app's six other
messaging systems.

## Running it

Prisma does not read `.env.local`, so both database urls are passed inline. Generate the
Postgres client once per checkout:

```bash
node scripts/migrate-v2/build-pg-client.js
MIGRATE_V2_PLACEHOLDER_URL="postgresql://u:p@localhost:5432/db" \
  npx prisma generate --schema=scripts/migrate-v2/pgclient.prisma
```

Then, in order:

```bash
OLD='postgresql://…@ep-royal-truth-….neon.tech/neondb?sslmode=require'

# 0. reconnaissance — read-only, writes reports/probe-<stamp>.json
OLD_DATABASE_URL="$OLD" npx tsx scripts/migrate-v2/probe.ts --email someone@example.com

# 1. local rehearsal
OLD_DATABASE_URL="$OLD" TARGET_DATABASE_URL="file:C:/joblfex-v3/prisma/dev.db" \
  npx tsx scripts/migrate-v2/index.ts --email someone@example.com --target local --dry-run

# 2. production: dry run first — real INSERTs inside a transaction that rolls back,
#    so every unique index, NOT NULL and foreign key is exercised for real
OLD_DATABASE_URL="$OLD" TARGET_DATABASE_URL="$POSTGRES_URL_NON_POOLING" \
  npx tsx scripts/migrate-v2/index.ts --email someone@example.com --target prod --dry-run

# 3. the real thing
OLD_DATABASE_URL="$OLD" TARGET_DATABASE_URL="$POSTGRES_URL_NON_POOLING" \
  npx tsx scripts/migrate-v2/index.ts --email someone@example.com --target prod

# undo, from the manifest — never by cascade
OLD_DATABASE_URL="$OLD" TARGET_DATABASE_URL="$POSTGRES_URL_NON_POOLING" \
  npx tsx scripts/migrate-v2/index.ts --email someone@example.com --target prod --rollback
```

Use the **non-pooling** url for the target: PgBouncer and Prisma interactive
transactions do not mix, and the whole import is one transaction.

**Freeze production deploys while importing.** `vercel.json` runs
`prisma db push --accept-data-loss` on every production deploy.

### Flags

| Flag | Effect |
|---|---|
| `--email` | one old account to import |
| `--all-active-paid` | instead of `--email`: every paying account, taken from **Stripe** plus the old database's own paid-plan flag. Prints the cohort, imports each in its own transaction, ends with a per-account summary |
| `--include-trialing` | with the above, also import Stripe subscriptions still in their trial |
| `--include-internal` | with the above, also import `admin@jobflex.app` and `test@jobflex.app` |
| `--target local\|prod` | SQLite dev.db, or the v3 Neon database |
| `--dry-run` | do all the writes for real, then roll the transaction back |
| `--merge-into-existing` | the email already exists in v3: attach the old data to that account **and its existing organisation**, and hand it the old JobFlex password |
| `--keep-existing-password` | with the above, leave the existing v3 password in place instead |
| `--local-test-password <pw>` | local only: stamp a known password so the UI can be driven |
| `--rollback` | delete exactly what the manifest says this tool created |

## Who counts as paying

**Stripe is the authority, not the old database.** The old app stopped writing Stripe's
answer back into `User.subscriptionStatus`, and the column is stale in both directions:
8 of the 9 people Stripe bills read TRIALING or CANCELED there, and four canceled
subscriptions still read ACTIVE. So `--all-active-paid` takes the union of

- every current Stripe subscription (`active`, `past_due`; `--include-trialing` adds
  trials), matched to an old account by customer email or `stripeCustomerId`, and
- every **comped** account — a paid tier in the old database with **no Stripe
  subscription at all**, which only the database can know about.

An account whose Stripe subscription exists but is no longer current is neither, and
is not imported (owner's call, 2026-09-04). `admin@jobflex.app` and `test@jobflex.app`
are the operator's own and are skipped unless `--include-internal`. A Stripe customer
with no matching old account is reported and skipped.

## How the plan is recorded

Two shapes, exactly the two v3 itself uses (`src/actions/adminUsers.ts`):

| account | written as | who may rewrite it later |
|---|---|---|
| live Stripe subscriber | `provider: STRIPE`, Stripe's customer/subscription/price ids, status and real renewal date | Stripe — webhooks, the reconcile cron, the admin "Sync from Stripe" |
| comped | a **hand grant**: `provider: MANUAL`, status ACTIVE, no Stripe link, `currentPeriodEnd: null` | nobody — v3 never lets a sync overwrite a live hand grant, and a grant with no period end never reads as lapsed |

Every Stripe sync names a plan through the `PlanPrice` ledger first and Stripe metadata
second. The old prices were not in that ledger, so before the batch seeds them
(`ledger.ts`, 49 archived rows — archived so checkout never picks one) a sync would
rewrite whatever the import chose. Seeding them is what makes the import and every
later sync agree.

## Plans

Old plan -> the v3 plan of the **same name** (owner's call, 2026-09-04). Names and
prices differ a little:

| old plan | $/mo | -> v3 slug | catalogue name | $/mo |
|---|---|---|---|---|
| STARTER | 45 | `starter` | Starter | 25 |
| PROFESSIONAL | 75 | `professional` | Professional | 79 |
| ADVANCED (Stripe: "Enterprise") | 149 | `enterprise` | Advanced | 199 |

Trade-off worth knowing: v3's Starter is stingier than the old one (5 proposals/mo,
5 clients, 1 worker vs 15/mo, 3 workers). No migrated Starter account is over any of
those today; the admin page can hand-grant a higher tier per account if it ever bites.
Plan strings are written UPPER-CASE, as signup and the admin grants do — the admin
"By plan" strip groups on the raw string, and `entitlements.ts` compares case-sensitively.

## Local -> production copy (`copy.ts`)

Production was emptied on 2026-09-04 and is being filled from the local `dev.db`,
which holds the verified imports. `copy.ts` copies in foreign-key order with ids
preserved: tables with no foreign keys (plan catalogue, Stripe price ledger, caches,
influencers/promo codes) whole; everything else only when every foreign key it
carries points at a row that is itself being copied. Roots are the chosen
organisations and their members, plus platform admins who belong to no organisation.

```bash
PROD='postgresql://…@ep-blue-hall-….neon.tech/neondb?…'   # NON-pooling
TARGET_DATABASE_URL="$PROD" npx tsx scripts/migrate-v2/copy.ts --org <orgId> --dry-run
TARGET_DATABASE_URL="$PROD" npx tsx scripts/migrate-v2/copy.ts --org <orgId>
TARGET_DATABASE_URL="$PROD" npx tsx scripts/migrate-v2/copy.ts --migrated --allow-nonempty   # the legacy-import orgs
```

`--migrated` selects the organisations the legacy import created (each has a
`migrate:v2:*` manifest). Never use `--all-orgs` against production — the local
database also holds the Acme demo org and dozens of test signups. Re-running is
safe: existing ids are skipped. Nothing here writes to the local database.

## How it stays safe

- **One transaction.** A failure anywhere leaves the target untouched.
- **Deterministic ids.** Old rows keep their own id; synthesised rows get an id derived
  from the ids they came from (`org_<oldUserId>`, `li_<quoteId>_<n>`, …). Re-running
  creates nothing.
- **Create-only.** No write carries an `update` clause, so a re-run after cutover can
  never revert something the customer changed.
- **Manifest.** Everything created is recorded in `SyncState["migrate:v2:<oldUserId>"]`,
  and `--rollback` deletes from that list rather than trusting cascades — which matters
  whenever the account already existed in v3.
- **Refuses to clobber.** An email that already exists in v3 aborts the run unless
  `--merge-into-existing` is passed. With it, the old JobFlex password takes over — the
  point of the migration is that the customer's old password works — and
  `credentialVersion` is bumped so sessions opened under the previous one end, exactly
  as v3's own password reset behaves. The previous hash and version go into the
  manifest, so `--rollback` restores them.

## Who owns which row

The old app showed a row to an account if **either** `ownerId` or the denormalised
`companyOwnerId` matched, so one row can be visible to two accounts. `ownerId` wins;
`companyOwnerId` only claims a row nobody owns. Without that rule the batch gave 15
of one customer's calendar events to another account purely because it ran first
(alphabetically).

Two further guards, because id reuse alone does not prevent cross-tenant leaks:

- **`assertOwnedByOrg`** runs before every id-reusing write. If the row already
  exists in a *different* organisation the import stops with that id named, rather
  than silently skipping it and leaving this org's proposals pointing into someone
  else's workspace.
- **A client referenced by this account's quotes but owned by another account** gets
  a per-organisation copy (`xc_<org>_<clientId>`) and the proposal is repointed at
  it, so every organisation stays self-contained.

## Things the tool has to work around

- **The gates.** A migrated account needs a live `Membership` (or `requireOrg()` throws
  and every page redirects), an organisation that is not soft-deleted, and an address
  **or** a non-empty `tradeTypesJson` — an OWNER missing both is sent to
  `/auth/register?setup=1` on every dashboard load, forever. The importer guarantees a
  trade if the old account has no address.
- **Re-pricing on save.** `src/lib/pricing/markup.ts` `sellUnitPrice` returns
  `materialCost + laborCost` **per unit**, and `computeTotals` then does
  `Σ quantity × sellUnitPrice`. The old blob stores those as line totals, so they are
  divided by the quantity on the way in — otherwise a 22 sq ft line worth $3,114 would
  become $68,508 the first time the contractor saved the proposal. Markups are pinned
  to 0 for the same reason.
- **The old app's own arithmetic.** `calc.subtotalBeforeTax` does not always equal the
  sum of the line items stored beside it. The figure the customer and their client saw
  wins: the difference becomes an explicit "Estimate adjustment" (a line item when the
  lines fall short, an order-level adjustment when they overshoot), so the quoted total
  is preserved *and* a later re-save reproduces it exactly.
- **A lapsed-looking subscription.** `ACTIVE` with a `currentPeriodEnd` more than three
  days in the past resolves to FREE limits — 3 proposals, 10 clients, 3 jobs. A live
  Stripe record carries Stripe's real renewal date; a hand grant carries none, which
  v3 treats as never lapsing.
- **`Conversation.jobId` is `@unique`.** Old threads are keyed per (job event, worker),
  so several map onto one job. They come across as DIRECT threads with the counterpart's
  name in the title. The owner participant row is what makes a thread visible at all.
- **Accounts with no password.** Some old accounts only ever signed in with Google.
  Their `Account` row is ported, and v3's Google callback resolves an existing user
  by email anyway, so they keep working — but they can never use "old email + old
  password", because there was no password. The run names them.
- **Photos.** Base64 data URLs move with the row. `blob.vercel-storage.com` urls live in
  the **old** Vercel project's store and stop resolving if that project is removed; the
  run counts them.
