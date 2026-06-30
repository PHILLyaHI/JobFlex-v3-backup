# Company Page Updates — Design Spec

- **Date:** 2026-06-05
- **Branch:** `editorial-rollout`
- **Status:** Approved decisions; pending spec review → implementation plan
- **Author:** Claude (brainstormed with user)

## 1. Context & Goal

Three changes to the **Company** area of the live dashboard (`/dashboard/company`), plus a
sidebar/nav change and a supporting data-layer addition:

1. **Landing builder** → present the tab as "still in production / coming soon" (the builder
   already exists and works; it is preserved, not deleted).
2. **Team tab** → add a **Team Activity** feed showing who did what across the proposal
   lifecycle (created · edited · scheduled · sent · accepted · completed), attributed to the
   team member and timestamped, built on the Impeccable design system.
3. **Subscription** → remove the Subscription company-tab; surface subscription as a **main
   sidebar nav link** with the page relocated to `/dashboard/subscription`.

All work targets the **live `(dashboard)` pages only** — the parallel `v3` variant pages are
out of scope for this spec.

## 2. Locked Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Landing tab | **Coming-soon placeholder, existing builder code preserved** behind a one-line flag |
| 2 | Subscription placement | **Sidebar nav link** (Account group); page moved to `/dashboard/subscription` |
| 3 | Activity data depth | **Capture full activity** — approved data-layer changes: EDITED + SCHEDULED-by-whom + COMPLETED activity events (**server-action only; no migration** — completion rides the existing job-completion hook, `ActivityEvent.kind` is free-text) |
| 4 | Scope | **Main `(dashboard)` pages only** (no `v3` variant) |
| 5 | Feed layout | **Timeline + member filter chips**, day-grouped |

## 3. Non-Goals

- No changes to `v3/(dashboard)/...` variant pages.
- No redesign of the existing `LandingBuilder` component (preserved as-is).
- No change to the shared `TeamClient` member-management UI (activity is composed *around*
  it at the page level, not inside it — `TeamClient` is also used by `settings/team`).
- The sidebar plan-status footer text stays hardcoded as today (making it dynamic is a
  separate task); we only make it a link.
- No new test scaffolding (no framework installed).

---

## 4. Part 1 — Landing tab → "In production" placeholder

**File:** `src/app/(dashboard)/dashboard/company/landing/page.tsx`

- Introduce a module-level flag **typed as `boolean`** so the preserved builder branch stays
  type-checked and is not flagged as unreachable:
  ```ts
  const LANDING_BUILDER_ENABLED: boolean = false;
  ```
- When disabled, render a coming-soon placeholder and return early. When re-enabled later,
  the existing `LandingBuilder` render path runs unchanged.
- The tab itself **stays** in `CompanyTabs` (only the page contents change).
- `src/components/company/LandingBuilder.tsx` is **untouched**.

**Placeholder copy** (editorial voice — "in progress, not abandoned"):
- eyebrow: `Landing builder`
- title: `Coming soon`
- description: one line, e.g. *"Your public landing page is being built. It's in production
  now and ships shortly."*
- A short "what's shipping" list: **Hero editor · Services & trades · Live preview**.

**Component choice:** reuse `src/components/ui/ComingSoon.tsx` (props: `eyebrow`, `title`,
`description`, `body`). To render the "what's shipping" list, extend `ComingSoon` with an
**optional** `items?: string[]` prop (backward-compatible; renders a small hairline list
under the EmptyState when present). If we prefer zero changes to the shared primitive, render
the list inline in the landing page instead — decide in planning. Default: extend `ComingSoon`
with `items` (smallest, reusable).

---

## 5. Part 2 — Team Activity feed (Team tab)

### 5.1 Composition

**File:** `src/app/(dashboard)/dashboard/company/team/page.tsx`

- Add a third parallel query alongside the existing `memberships` / `invites` fetch:
  ```ts
  db.activityEvent.findMany({
    where: { organizationId },
    include: {
      actor:    { select: { id: true, name: true, email: true } },
      proposal: { select: { id: true, title: true } },
      client:   { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  })
  ```
- Map results to a plain serializable shape (ISO date strings) and render a new
  `<TeamActivity activities={...} members={...} />` **below** the existing `<TeamClient />`.
- `members` for the filter chips is derived from the existing `memberships` (id + name/email).

### 5.2 New component

**File:** `src/components/company/TeamActivity.tsx` (client component)

Built only from existing Impeccable primitives: `Avatar`, `Badge`, `Card`/section, hairline
dividers, `quiet-caps` labels, tabular timestamps. Pressed Sage reserved for Accepted/Paid/
Completed states only (Confident-Accent rule).

**Layout (approved — Timeline + filter chips):**

```
Team activity                                  <- section header (quiet-caps eyebrow + title)
[ All ] ( Maya ) ( Devon ) ( Sam )             <- filter chips (All + members with activity)
─────────────────────────────────────────
TODAY                                          <- day group label (quiet-caps)
 (M)  Maya  · created proposal      2:14 PM
      Kitchen Remodel — Acme Corp   [Created]  <- summary line + tonal pill
 (D)  Devon · edited                11:02 AM
      Bathroom Reno — Riverside     [Edited]
YESTERDAY
 (S)  Sam   · sent to client        4:48 PM
      Deck Build — J. Powell        [Sent]
 ( )  Client · accepted             9:30 AM    <- null actor → "Client"
      Deck Build                    [Accepted]
            [ Show more ]
```

**Row anatomy:** `Avatar(actor)` → actor name + relative time (right-aligned) → `summary`
(reuses `ActivityEvent.summary`, already human-readable) → tonal `Badge` for the kind.

**Event kind → label + Badge tone** (`Badge` tones: neutral · accent · success · warn ·
danger · info):

| kind | label | tone |
|------|-------|------|
| CREATED | created | neutral |
| EDITED | edited | neutral |
| SENT | sent to client | info |
| ACCEPTED | accepted | success |
| PAID | paid | success |
| SCHEDULED | scheduled | warn |
| COMPLETED | completed | success |
| DECLINED | declined | danger |
| VIEWED | viewed | neutral |

- **Null actor** (client-driven events like ACCEPTED/VIEWED): show a neutral avatar + label
  "Client".
- **Day grouping:** Today / Yesterday / `longDate` for older, computed client-side.
- **Filter chips:** "All" + one chip per member that appears in the fetched activity;
  filtering is client-side over the fetched batch.
- **Pagination:** initial visible ~15 rows; "Show more" reveals the rest of the fetched batch
  (take: 40). Server-side "load older" is a future enhancement (note in code).
- **Empty state:** if no activity, render `EmptyState` ("No team activity yet").
- **Motion:** `fade-up` (280ms) row entrance; respect `prefers-reduced-motion`.

---

## 6. Part 3 — Subscription → sidebar nav link

### 6.1 Remove the company tab
**File:** `src/components/company/CompanyTabs.tsx`
- Remove the `Subscription` entry (line 12) from `TABS`.
- Remove the now-unused `CreditCard` import (line 5).

### 6.2 Relocate the page
- **New:** `src/app/(dashboard)/dashboard/subscription/page.tsx` — move the current
  subscription page content here verbatim (server component + `UsageBar`/`labelFor` helpers).
  - Fix the relative import depth: `../../settings/account/plan-actions` →
    `../settings/account/plan-actions` (one fewer level after the move).
  - Other imports use the `@/` alias and are unaffected.
- **Old:** `src/app/(dashboard)/dashboard/company/subscription/page.tsx` — replace body with a
  permanent redirect so existing links/bookmarks resolve:
  ```ts
  import { redirect } from "next/navigation";
  export default function Page() { redirect("/dashboard/subscription"); }
  ```

### 6.3 Add the sidebar link
**File:** `src/components/layout/Sidebar.tsx`
- Add a `CreditCard` import from `lucide-react`.
- In the **Account** group, add (after "Company"):
  ```ts
  { href: "/dashboard/subscription", label: "Subscription", icon: <CreditCard className="h-4 w-4" /> }
  ```
- Wrap the existing plan-status footer card (lines 151–159) in a
  `<Link href="/dashboard/subscription">` so the status block is clickable (text stays
  hardcoded for now — out of scope to make dynamic).
- Existing active-state logic (`pathname.startsWith(item.href + "/")`) already covers the new
  route.

---

## 7. Part 4 — Data layer (approved, server-action only)

> Re-scoped after inspection. This project uses Prisma **`db push`** (no migrations
> directory / history). More importantly, all three new events are just `ActivityEvent` rows
> with new `kind` strings (`ActivityEvent.kind` is a free-text column), and completion already
> has a hook — so **no schema change and no `db push` are required.**

### 7.1 Activity kinds (type only)
**File:** `src/lib/prismaEnums.ts` — add `EDITED`, `SCHEDULED`, `COMPLETED` to the
`ActivityKind` const. TS-only; the DB column already accepts any string.

### 7.2 EDITED — who edited
**File:** `src/actions/proposals.ts`, `saveProposal()` update branch — after the
ownership-gated `updateMany` succeeds (`count > 0`):
```ts
await db.activityEvent.create({ data: {
  organizationId, actorId: user.id, proposalId: data.id,
  clientId: data.clientId ?? null,
  kind: "EDITED", summary: `Edited "${data.title}"`,
}});
```

### 7.3 ACCEPTED — accurate kind
**File:** `src/actions/proposals.ts`, `updateProposalStatus()` — replace
`kind: status === "PAID" ? "PAID" : "UPDATED"` so ACCEPTED / DECLINED / PAID emit their own
kinds (the feed otherwise mislabels accepted as "UPDATED").

### 7.4 SCHEDULED — who scheduled
**File:** `src/actions/jobs.ts`
- `scheduleJobFromTray()` — change the event `kind` `"UPDATED"` → `"SCHEDULED"` (already
  carries `actorId` + a good summary).
- `createJobFromProposal()` — change `kind: "CREATED"` → `"SCHEDULED"` and add `actorId`
  (add `user` to the `requireOrg()` destructure).
- `createJob()` — when `starts` is set, emit a `SCHEDULED` `ActivityEvent` with `actorId`
  (add `user` to the destructure).

### 7.5 COMPLETED — who completed
**File:** `src/actions/jobs.ts`, `updateJob()` — inside the existing
`raw.status === "COMPLETED" && existing.status !== "COMPLETED"` block, add `user` to the
destructure and emit:
```ts
await db.activityEvent.create({ data: {
  organizationId, actorId: user.id,
  proposalId: existing.proposalId ?? null, clientId: existing.clientId ?? null,
  kind: "COMPLETED", summary: `Completed "${existing.title}"`,
}});
```
The event's `createdAt` is the completion timestamp — no `completedAt` column needed.

### 7.6 No migration
No `schema.prisma` change, no `db push`. Existing **created / sent / paid** events flow
unchanged.

---

## 8. Design-System Adherence

- **One-Accent / Confident-Accent:** Pressed Sage (`#1f7a52`) only on Accepted/Paid/Completed
  pills and active nav — never decorative.
- **Tonal-Pill:** each event kind uses its own tonal `Badge` (table in §5.2); no gray-on-gray.
- **Hairline-Beats-Border:** 0.5px `--ink-line` dividers between activity rows / footer list.
- **Tabular Numeric:** timestamps use tabular figures.
- **Quiet-Caps:** section eyebrow, day-group labels, filter region.
- **Single-Typeface:** Geist throughout; no new tokens introduced.
- No `.dark` variants added for new code (light-only per project rules).

## 9. Files Touched (summary)

| File | Change |
|------|--------|
| `app/(dashboard)/dashboard/company/landing/page.tsx` | Flag + coming-soon render (builder preserved) |
| `components/ui/ComingSoon.tsx` | Optional `items?: string[]` prop (or inline list in landing page) |
| `app/(dashboard)/dashboard/company/team/page.tsx` | Fetch activity; render `<TeamActivity>` below `<TeamClient>` |
| `components/company/TeamActivity.tsx` | **New** — activity feed (timeline + chips) |
| `components/company/CompanyTabs.tsx` | Remove Subscription tab + unused import |
| `app/(dashboard)/dashboard/subscription/page.tsx` | **New** — relocated subscription page (import depth fixed) |
| `app/(dashboard)/dashboard/company/subscription/page.tsx` | Replace with `redirect()` |
| `components/layout/Sidebar.tsx` | Add Subscription nav item; link plan-status footer |
| `src/lib/prismaEnums.ts` | Add EDITED/SCHEDULED/COMPLETED to `ActivityKind` (TS only) |
| `src/actions/proposals.ts` | EDITED event; accurate ACCEPTED/DECLINED/PAID kinds |
| `src/actions/jobs.ts` | SCHEDULED events (+actor); COMPLETED event in job-complete hook |

## 10. Risks & Open Items

- **Completion source:** completion is captured at **job completion** (the existing
  `updateJob` COMPLETED hook), attributed to the acting user — not a new proposal status. No
  new UI control required; it reuses the place where work is already marked done.
- **No migration:** re-scoped to server-action-only — no `schema.prisma` change, no `db push`.
- **Feed volume:** initial implementation fetches the latest 40 events with client-side
  "show more"; server-side paging deferred.

## 11. Verification Plan (no test framework)

1. `npm run typecheck` — clean.
2. `npm run dev` — manual checks:
   - Landing tab shows the coming-soon placeholder; flipping the flag restores the builder.
   - Subscription tab gone from Company; sidebar shows Subscription; `/dashboard/subscription`
     renders; old `/dashboard/company/subscription` redirects; footer card links through.
   - Team tab shows the activity feed below members; chips filter; pills/day-groups correct;
     empty state when no activity.
   - After an edit / schedule / job-complete action, the corresponding events appear in the
     feed, correctly attributed (no migration needed).
