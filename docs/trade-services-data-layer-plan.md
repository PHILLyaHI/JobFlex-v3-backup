# Trade & Services — Data-Layer Plan + Implementation Record

Status: **IMPLEMENTED 2026-06-06** (decisions below approved by the user). Originally a
proposal; the implementation summary is in the "IMPLEMENTED" section at the end. The
sections below remain as the design rationale.

**Approved decisions:** tenant model = **cross-org, opt-in (option C)**; DB =
**SQLite-safe** modeling (JSON-string arrays, checked-String statuses, no enums);
**server actions** (not API routes); new models named **`TradeJob*`** (the existing
`TradePost`/`TradeReply` forum at `/dashboard/trade` was left untouched). Migration run
via `prisma db push` against dev `dev.db`.

---

## 0. The one decision that gates everything: tenant boundary

This is the headline question, because it changes the schema, the matching query, and
the security posture.

- **joblfex-v3 today** has a *simple* `TradePost` / `TradeReply` forum that is
  **org-scoped** (`organizationId`, `requireOrg()`). It is a discussion board *inside*
  one company.
- **The feature you described** ("contractor-to-contractor", "LinkedIn Jobs meets
  Craigslist") is a **cross-org network**: a poster in company A broadcasts to matching
  contractors in companies B, C, D. The Job-FLEX reference matches across *all* users by
  trade + specialties.

These are incompatible tenant models. We must pick one before writing a line of schema:

| Option | What it means | Implications |
|---|---|---|
| **A. Cross-org network** (matches your description) | Jobs broadcast to matching pros across the whole platform | New cross-tenant data path. **Requires a `/security-review`** (tenant isolation, who-can-see-whom, opt-in/visibility, abuse/spam controls, the 500 cap as a real guardrail). Bigger, but it's the actual feature. |
| **B. Intra-org only** | Jobs shared among one company's own team/crew | Reuses existing org-scoping; much smaller; but it is **not** the "pass work to peer contractors" product. Effectively a different (smaller) feature. |
| **C. Cross-org, but gated** | Network, but contractors opt in to a shared "trade network" and control their trade/skill profile + radius | Same security needs as A, plus a consent/visibility model. Safest framing of A. |

**Recommendation: C** (cross-org with explicit opt-in + visibility controls). It is the
real feature and the responsible way to ship a cross-tenant broadcast. **A/C trigger the
mandatory `/security-review` per CLAUDE.md.**

Everything below assumes a cross-org network (A/C). If you choose B, this plan shrinks
to "add recipient/interest/chat tables scoped to one org."

---

## 1. Prisma schema additions

Ported from the Job-FLEX reference, adapted to joblfex-v3 naming. The existing simple
`TradePost`/`TradeReply` models would be **superseded** (migration note in §5) — they are
a different feature and should not be conflated.

```prisma
enum TradePostStatus { OPEN  FILLED  CANCELLED }
enum TradeRecipientStatus { NEW  INTERESTED  NOT_INTERESTED }

model TradePost {
  id            String               @id @default(cuid())
  authorId      String               // posting user
  authorOrgId   String               // poster's org (provenance / "my posts" scoping)
  title         String
  description   String
  tradeType     String
  specialties   String[]             @default([])
  location      String?
  serviceArea   String?
  budget        String?
  timeWindow    String?
  urgency       String?              // low | medium | high | urgent
  status        TradePostStatus      @default(OPEN)
  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt
  author        User                 @relation(fields: [authorId], references: [id])
  recipients    TradePostRecipient[]
  conversations TradeConversation[]
  @@index([authorId, createdAt])
  @@index([status, createdAt])
}

model TradePostRecipient {
  id              String               @id @default(cuid())
  tradePostId     String
  recipientId     String               // the matched contractor (a User)
  status          TradeRecipientStatus @default(NEW)
  interestedAt    DateTime?
  notInterestedAt DateTime?            // drives the 7-day hidden auto-clear
  conversationId  String?
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt
  tradePost       TradePost            @relation(fields: [tradePostId], references: [id], onDelete: Cascade)
  recipient       User                 @relation(fields: [recipientId], references: [id])
  @@unique([tradePostId, recipientId])
  @@index([recipientId, status, createdAt])  // powers New / Engaged / Hidden tabs
}

model TradeConversation {
  id          String         @id @default(cuid())
  tradePostId String
  authorId    String         // poster
  recipientId String         // interested contractor
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  tradePost   TradePost      @relation(fields: [tradePostId], references: [id], onDelete: Cascade)
  messages    TradeMessage[]
  @@unique([tradePostId, recipientId])
  @@index([authorId]); @@index([recipientId])
}

model TradeMessage {
  id             String            @id @default(cuid())
  conversationId String
  authorId       String
  body           String
  createdAt      DateTime          @default(now())
  conversation   TradeConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  @@index([conversationId, createdAt])
}
```

Plus, for matching, a contractor trade/skill profile. joblfex-v3 already has
`WorkerProfile.specialties`; we either reuse that or add a per-user `tradeTypes` +
`serviceRadius` + a `tradeNetworkOptIn` boolean (option C).

> SQLite note: dev uses SQLite, which does **not** support `String[]` or `enum`. The
> reference ran on Postgres. We either (a) model `specialties` as a JSON string and
> enums as checked `String`s for dev parity, or (b) confirm the prod DB. **Decision
> needed.**

## 2. Server actions (`src/actions/tradeServices.ts`)

Per CLAUDE.md the project favors server actions over API routes; the reference used API
routes. Proposed actions (all `requireOrg()` / authenticated, ownership-checked):

- `createTradePost(input)` → validates (Zod), creates post, runs matching, fan-out
  inserts `TradePostRecipient` rows, returns `{ id, broadcastCount }`.
- `listTradeInbox()` → the viewer's NEW + INTERESTED + NOT_INTERESTED(within 7d) rows.
- `listMyPosts()` → author's posts + interest counts.
- `respondToPost(postId, "INTERESTED" | "NOT_INTERESTED")` → updates recipient row,
  stamps timestamp, creates the conversation on INTERESTED.
- `restoreHidden(postId)` → NOT_INTERESTED → NEW, clears `notInterestedAt`.
- `setPostStatus(postId, "FILLED" | "CANCELLED")` → author only.
- `sendTradeMessage(postId, body)` / `getTradeConversation(postId, recipientId)`.

## 3. Matching engine

`findMatchingRecipients(authorId, tradeType, specialties[])`:
- candidates = users with a matching `tradeType` **or** overlapping `specialties`,
  excluding the author (and, in option C, only those opted into the network);
- optional radius filter on `serviceArea`/location;
- **hard cap `take: 500`** (real guardrail, not cosmetic — surface "notified N pros" and
  log when the cap clips results, per the no-silent-caps rule).

## 4. Hidden / 7-day expiry

`NOT_INTERESTED_TTL = 7d`. Inbox query filters `notInterestedAt >= now-7d`; older rows
fall out of the Hidden tab automatically (no deletion). The UI countdown already exists;
it would read `notInterestedAt` instead of the mock `hiddenDaysAgo`.

## 5. Migration

1. Add models + enums (or SQLite-safe equivalents per §1 decision).
2. `prisma migrate` / `db push` — **requires your explicit approval** (CLAUDE.md).
3. The existing simple `TradePost`/`TradeReply` forum at `/dashboard/trade`: decide to
   **rename** it (e.g. `CommunityPost`) to free the name, or retire it. It is a separate
   feature and must not be merged into these models.
4. Optional seed for dev.

## 6. UI swap path (low-risk)

The mobile UI is deliberately structured so wiring is a swap, not a rewrite:
- `trade-data.ts` types already mirror the real models (`viewerStatus` ↔
  `TradeRecipientStatus`, `JobStatus` ↔ `TradePostStatus`).
- Replace `SEED_JOBS` + local `setJobs` mutations in
  `trade-services-workspace.tsx` with server-action calls (optimistic update, then
  revalidate). The card/detail/tabs components take props and don't change.
- `hoursAgo`/`hiddenDaysAgo` integers → derive from real `createdAt`/`notInterestedAt`
  (the `relative()` helper already exists in `src/lib/format.ts`).

## 7. Security review triggers (cross-org options A/C)

Mandatory `/security-review` items: tenant isolation on every query; recipients can only
see posts broadcast to them; authors can only mutate their own posts; conversation access
limited to the post's author + that recipient; rate-limiting + the 500 cap as anti-spam;
opt-in/visibility (option C); PII exposure across orgs.

---

## What I need from you to proceed

1. **Tenant model: A, B, or C** (recommend **C**).
2. **DB target for the arrays/enums** (SQLite-safe modeling vs confirmed Postgres).
3. **Server actions vs API routes** (recommend server actions, matching project norm).
4. Approval to add the Prisma models and run a migration.

Until then: the mobile UI stays on mock data and is fully reviewable at
`/trade-services`.

---

## IMPLEMENTED (2026-06-06)

### Schema (`prisma/schema.prisma`, SQLite-safe)
`TradeNetworkProfile` (per-user `optIn` + JSON `tradeTypes`/`specialties` + `serviceArea`),
`TradeJob`, `TradeJobRecipient`, `TradeJobConversation`, `TradeJobMessage`, plus `User`
back-relations. Statuses are checked Strings; arrays are JSON strings. Pushed with
`DATABASE_URL="file:./dev.db" npx prisma db push` (client regenerated).

### Server actions (`src/actions/tradeServices.ts`)
`getTradeNetworkProfile`, `setTradeNetworkOptIn`, `getTradeInbox`, `getMyTradeJobs`,
`createTradeJob` (consent-gated matching + fan-out, **500 cap**), `respondToTradeJob`,
`restoreTradeJob`, `setTradeJobStatus`, `getTradeConversation`, `sendTradeMessage`.
Every action is authz-scoped to the caller (own recipient row / author-only status /
participant-only chat). Matching selects only `optIn: true` users, excludes the author,
and uses parameterized `contains` (no SQL injection).

### UI wiring
`page.tsx` is an authed server component fetching inbox/my-posts/profile;
`trade-services-workspace.tsx` drives optimistic updates + `router.refresh()`
reconciliation; `post-job-sheet.tsx` posts via `createTradeJob`; chat loads via
`getTradeConversation`/`sendTradeMessage`. New users see an opt-in gate.

### Dev seed (`src/actions/tradeServicesDevSeed.ts`)
`devSeedTradeNetwork` — dev-gated (`NODE_ENV !== production`), idempotent
(`demo-<userId>-*` ids), builds synthetic peer users/orgs/profiles + jobs broadcast to
the caller. Synthetic peers have no password (cannot authenticate). Recipient selection
is scoped to the `@tradedemo.local` cohort. Surfaced as a dev-only "Load demo data" button.

### Security review (workflow, 25 raw → 10 confirmed; all addressed)
- **Fixed:** poster account email no longer surfaced cross-org (drops `email` from the
  select; falls back to org name then "A contractor"); dev seed scoped to the synthetic
  cohort; recipients can't express interest on non-OPEN jobs; messaging blocked on
  CANCELLED jobs; per-author broadcast cooldown (5/min); zod per-element length bounds.
- **Cleared as non-issues:** SQL injection (parameterized `contains`); synthetic peers
  are not auth-bypass accounts; production is blocked for the seed.

### Verification
`tsc --noEmit` clean; `eslint` clean. **Runtime not yet exercised:** the running dev
server holds the old Prisma client + locks the engine DLL, so it needs a **restart** to
load the new models. `prisma db push` succeeded; tables exist. Recommend restarting dev
(when no other session depends on it), opening `/trade-services`, and tapping
"Load demo data".

### Remaining optional hardening (low)
Finer-grained message rate limiting; an explicit `ENABLE_*` flag + role gate on the dev
seed; pushing the trade/skill match into the DB query instead of an in-JS scan of up to
2000 candidate profiles. None are blockers.
