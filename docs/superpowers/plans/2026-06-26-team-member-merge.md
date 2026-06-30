# TeamMember Merge + Company Page Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `WorkerProfile` + `Membership` into one `TeamMember` model so a company member and a worker are one record with one role; make `/dashboard/workers` the single team roster; and apply the requested company-page polish (branding autosave, tab reorder, Landing "coming soon", role dropdown, drop payment/specialty fields).

**Architecture:** `TeamMember` replaces both `WorkerProfile` and `Membership` (every org member is one `TeamMember` with a `role` string). `JobAssignment.workerId` becomes `teamMemberId`. All three roster UIs collapse onto `/dashboard/workers`; `/company/team` and `/settings/team` redirect there, and the company "Team" tab links there. Role stays a plain string (no Prisma enum), so adding `MANAGER` is code-only; the DB migration is for the model/table change + data backfill.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 5.22 (Postgres/Neon), NextAuth v5, Zod, Tailwind 3.4.

## Global Constraints

- No test framework installed — verify each task with `npm run typecheck` (and a manual dev-server check for UI). Do NOT add test scaffolding.
- Design system is LOCKED — reuse existing tokens/primitives only (CLAUDE.md). No new color/font/shadow primitives.
- Conventional Commits. Commit per task. Never `--no-verify`.
- Roles are plain strings on the model, not a Prisma enum. The canonical list lives in `src/lib/prismaEnums.ts` `Role`.
- Worker-add role choices = **Installer, Sales, Estimator, Manager**. Org/permission roles (Owner, Admin, Accountant, User) remain valid values but are not offered in the worker-add dropdown.
- `specialties` and `hourlyRate` columns are KEPT on `TeamMember` (lossless carry-over of existing data) but are REMOVED from the add/edit form and the roster display. "Remove field" = remove from UI, not drop the column.

---

## Prerequisites & Safety Gates (read before starting)

1. **Clean, building base.** `npm run typecheck` must be green before Phase 2 starts. Today the branch fails typecheck due to concurrent messaging-unification work (`jobs/[id]/page.tsx`, `messages/page.tsx`) and `prisma/schema.prisma` is being edited by another session. **Phase 2 must not begin until the schema is settled and the tree builds**, or it must run in an isolated branch/worktree, or data/work will be lost.
2. **Migration is GATED.** Tasks 3–9 edit code and the schema *file* and run `prisma generate` (regenerates TS types only — no DB writes). The actual `prisma migrate` / `db push` (Task 6) runs ONLY after explicit user approval. Per CLAUDE.md + memory: stop the dev server before `prisma generate` (Windows EPERM DLL lock); set `DATABASE_URL` inline for CLI commands.
3. **Phase 1 is independent** of the merge and safe to ship now (no schema touch).

---

## File Structure

**Phase 1 (UI only):**
- Modify: `src/components/company/BrandingForm.tsx` — remove Save button, debounced autosave.
- Modify: `src/components/company/CompanyTabs.tsx` — reorder tabs, add "soon" badge support.

**Phase 2 (schema + data layer):**
- Modify: `prisma/schema.prisma` — add `TeamMember`, change `JobAssignment` FK, remove `WorkerProfile` + `Membership`, update `User`/`Organization` relations.
- Modify: `src/lib/prismaEnums.ts` — add `MANAGER`, export `WORKER_ROLES`.
- Create: `prisma/migrations/<ts>_team_member_merge/migration.sql` — DDL + backfill (Prisma-generated DDL, hand-added backfill).
- Rewrite: `src/actions/workers.ts`, `src/actions/team.ts` — operate on `TeamMember`.
- Modify (FK rename `workerId`→`teamMemberId`, `workerProfile`→`teamMember`): `src/actions/jobs.ts`, `src/lib/auth.ts`, calendar pages, `src/app/(dashboard)/dashboard/jobs/[id]/page.tsx`, Topbar/OrgSwitcher, worker-portal pages.
- Modify: roster pages — `src/app/(dashboard)/dashboard/workers/page.tsx` (+ `[id]`), `src/app/(dashboard)/dashboard/company/team/page.tsx` + `src/app/(dashboard)/dashboard/settings/team/page.tsx` (redirect), `src/components/company/CompanyTabs.tsx` (Team → `/dashboard/workers`).

**Phase 3 (worker form):**
- Modify: `src/components/v3/workers-new/workers-ledger.tsx` — role dropdown, drop specialty/rate, roster shows role.

---

## PHASE 1 — Company page polish (no schema; safe to ship now)

### Task 1: Branding autosave

**Files:**
- Modify: `src/components/company/BrandingForm.tsx`

**Interfaces:**
- Consumes: `updateBranding(raw)` from `@/actions/company` (unchanged).
- Produces: a form that persists on field change (debounced), with a subtle "Saved/Saving" status instead of a button.

- [ ] **Step 1: Replace the manual `save()` + button with a debounced autosave.** Keep all fields. Add a `status: "idle" | "saving" | "saved" | "error"` state and a debounced effect that fires `updateBranding(...)` ~700ms after the last change, skipping the initial mount.

```tsx
// near the other state
const [status, setStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
const firstRun = React.useRef(true);

// debounced autosave — replaces the old save() button handler
React.useEffect(() => {
  if (firstRun.current) {
    firstRun.current = false;
    return;
  }
  setStatus("saving");
  const t = setTimeout(async () => {
    try {
      await updateBranding({
        name,
        phone: phone || null,
        billingEmail: billingEmail || null,
        address: address || null,
        website: website || null,
        primaryColor,
        logoUrl,
      });
      setStatus("saved");
      router.refresh();
    } catch (err: any) {
      setStatus("error");
      toast.error("Couldn't save", err?.message);
    }
  }, 700);
  return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [name, phone, billingEmail, address, website, primaryColor, logoUrl]);
```

- [ ] **Step 2: Remove the `Save branding` `<Button>` (lines ~119-121) and the old `save()`/`busy` state.** Replace the button row with a small status line reusing existing tokens:

```tsx
<div className="mt-6 flex items-center justify-end gap-2 text-[11px] text-[color:var(--ink-muted)]" aria-live="polite">
  {status === "saving" && <span>Saving…</span>}
  {status === "saved" && <span className="text-[color:var(--accent-ink)]">All changes saved</span>}
  {status === "error" && <span className="text-[color:var(--rose)]">Save failed — retrying on next edit</span>}
</div>
```

Remove the now-unused `Save` lucide import and `busy` state.

- [ ] **Step 3: Verify** — `npm run typecheck` (expect: no errors in `BrandingForm.tsx`). Manually: edit a field, confirm it persists after ~0.7s and "All changes saved" shows.
- [ ] **Step 4: Commit** — `git add src/components/company/BrandingForm.tsx && git commit -m "feat(company): autosave branding, drop the Save button"`

### Task 2: Reorder company tabs + Landing "coming soon"

**Files:**
- Modify: `src/components/company/CompanyTabs.tsx`

- [ ] **Step 1: Reorder `TABS` so Team is second, and tag Landing as soon-to-come.** Also point Team at the unified roster (Phase 2 makes `/dashboard/workers` canonical; using it now is harmless — the page already exists).

```tsx
const TABS = [
  { href: "/dashboard/company", label: "Branding", icon: <Palette className="h-3.5 w-3.5" /> },
  { href: "/dashboard/workers", label: "Team", icon: <Users className="h-3.5 w-3.5" /> },
  { href: "/dashboard/company/landing", label: "Landing builder", icon: <Globe className="h-3.5 w-3.5" />, soon: true },
];
```

- [ ] **Step 2: Render a "Soon" pill on tabs with `soon: true`.** In the tab map, after the label, conditionally render a tonal pill using existing tokens (mirrors the `Job` pill style used in `MessagesInbox`):

```tsx
{tab.soon && (
  <span className="ml-1.5 rounded-full bg-[color:var(--accent-soft)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.06em] text-[color:var(--accent-ink)]">
    Soon
  </span>
)}
```

Widen the `TABS` element type to include the optional `soon?: boolean`.

- [ ] **Step 3: Verify** — `npm run typecheck`. Manually: tab order reads Branding · Team · Landing builder (Soon).
- [ ] **Step 4: Commit** — `git commit -am "feat(company): Team tab second, mark Landing builder coming soon"`

---

## PHASE 2 — TeamMember merge (GATED on prerequisites + migration approval)

### Task 3: Add `MANAGER` role + worker-role subset

**Files:**
- Modify: `src/lib/prismaEnums.ts`

- [ ] **Step 1: Add `MANAGER` to the `Role` const and export the worker-role subset.**

```ts
export const Role = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  SALES: "SALES",
  ESTIMATOR: "ESTIMATOR",
  INSTALLER: "INSTALLER",
  ACCOUNTANT: "ACCOUNTANT",
  USER: "USER",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

// Roles offered when adding a team member from the Workers roster.
export const WORKER_ROLES = [Role.INSTALLER, Role.SALES, Role.ESTIMATOR, Role.MANAGER] as const;
```

- [ ] **Step 2:** Grep for the hardcoded role allow-list in `src/actions/team.ts` (`["OWNER","ADMIN",...]`) and add `"MANAGER"`.
- [ ] **Step 3: Verify** — `npm run typecheck`. **Commit** — `git commit -am "feat(roles): add MANAGER role + WORKER_ROLES subset"`

### Task 4: Schema — introduce `TeamMember`, re-point `JobAssignment`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the `TeamMember` model** (carries worker fields + role; replaces both old models):

```prisma
model TeamMember {
  id             String   @id @default(cuid())
  userId         String
  organizationId String
  role           String   @default("USER")
  displayName    String
  phone          String?
  specialties    String?  @default("[]")
  hourlyRate     Float?
  token          String   @unique @default(cuid())
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user         User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  assignments  JobAssignment[]

  @@unique([userId, organizationId])
  @@index([organizationId])
}
```

- [ ] **Step 2: Re-point `JobAssignment`** — rename `workerId` → `teamMemberId` and the relation `worker WorkerProfile` → `teamMember TeamMember`; update the `@@unique`/`@@index`. Read the current `JobAssignment` block first and edit exactly.
- [ ] **Step 3: Update `User` and `Organization` relation lists** — replace `workerProfile`/`memberships` relations with `teamMembers TeamMember[]` (User keeps a list since a user can be in multiple orgs; verify current cardinality before editing). Remove the old `WorkerProfile` and `Membership` models.
- [ ] **Step 4: Regenerate the Prisma client (NO DB writes).** Stop the dev server first.

Run: `npx prisma generate` (with `DATABASE_URL` set inline per memory)
Expected: client regenerated; `db.teamMember` now typed. `db.workerProfile`/`db.membership` no longer exist (downstream typecheck will now fail until Tasks 5–8 update callers — expected).

- [ ] **Step 5: Commit the schema + generated client** — `git commit -am "feat(schema): add TeamMember, re-point JobAssignment (no DB migration yet)"`

### Task 5: Rewrite data-layer actions onto `TeamMember`

**Files:**
- Rewrite: `src/actions/workers.ts`, `src/actions/team.ts`

**Interfaces (Produces — later tasks/UI rely on these):**
- `createTeamMemberInvite(raw)` → `{ id, token }` — upserts `User` + `TeamMember` with the chosen `role` (replaces `createWorkerInvite`, which hardcoded `INSTALLER`). Input zod: `{ name, email, role, phone? }` (no specialties/rate).
- `updateTeamMember(raw)` → `{ id }` — input `{ id, name, phone?, role }`.
- `updateTeamMemberRole(id, role)` → updates role (replaces `updateMembershipRole`).
- `removeTeamMember(id)` → deletes the `TeamMember` (guards last `OWNER`).
- `assignWorker(jobId, teamMemberId)` / `unassignWorker` / assignment-status fns — same names, now keyed on `teamMemberId`.

- [ ] **Step 1:** In `workers.ts`, replace every `db.workerProfile` + `db.membership` call with `db.teamMember`. `createTeamMemberInvite` writes one row (role from input, default to `Role.INSTALLER` if absent). Keep `assignWorker` etc. but use `teamMemberId`. Preserve the plan-limit enforcement (`enforcePlanLimit`).
- [ ] **Step 2:** In `team.ts`, replace `db.membership` with `db.teamMember`; `createInvite`/`acceptInvite` create/promote a `TeamMember`. Keep the `Invite` model + flow (pending email invites) unchanged — `acceptInvite` now upserts a `TeamMember` (role from invite) instead of a `Membership`.
- [ ] **Step 3: Verify** — `npm run typecheck` (errors now only in consumers, fixed next). **Commit.**

### Task 6: Database migration + backfill — **STOP: requires explicit user approval to run**

**Files:**
- Create: `prisma/migrations/<timestamp>_team_member_merge/migration.sql`

- [ ] **Step 1: Generate the migration WITHOUT applying** — `npx prisma migrate dev --create-only --name team_member_merge`. This writes the DDL (create `TeamMember`, add `teamMemberId`, drop old tables/columns) but does not run it.
- [ ] **Step 2: Hand-insert the BACKFILL between create and drop** so data carries over. Insert TeamMember from Membership left-joined to WorkerProfile, then re-key JobAssignment, BEFORE the drop statements:

```sql
-- Backfill TeamMember from existing Membership (+ worker fields when present)
INSERT INTO "TeamMember" (id, "userId", "organizationId", role, "displayName", phone, specialties, "hourlyRate", token, "createdAt", "updatedAt")
SELECT m.id, m."userId", m."organizationId", m.role,
       COALESCE(w."displayName", u.name, u.email),
       w.phone, COALESCE(w.specialties, '[]'), w."hourlyRate",
       COALESCE(w.token, gen_random_uuid()::text), m."createdAt", now()
FROM "Membership" m
LEFT JOIN "WorkerProfile" w ON w."userId" = m."userId" AND w."organizationId" = m."organizationId"
LEFT JOIN "User" u ON u.id = m."userId";

-- Workers that somehow have no Membership row → create a TeamMember too
INSERT INTO "TeamMember" (id, "userId", "organizationId", role, "displayName", phone, specialties, "hourlyRate", token, "createdAt", "updatedAt")
SELECT w.id, w."userId", w."organizationId", 'INSTALLER', w."displayName", w.phone, COALESCE(w.specialties,'[]'), w."hourlyRate", w.token, w."createdAt", now()
FROM "WorkerProfile" w
WHERE NOT EXISTS (SELECT 1 FROM "Membership" m WHERE m."userId" = w."userId" AND m."organizationId" = w."organizationId");

-- Re-key job assignments: old workerId (a WorkerProfile.id) → TeamMember.id via user+org
UPDATE "JobAssignment" ja
SET "teamMemberId" = tm.id
FROM "WorkerProfile" w
JOIN "Job" j ON j.id = ja."jobId"
JOIN "TeamMember" tm ON tm."userId" = w."userId" AND tm."organizationId" = j."organizationId"
WHERE ja."workerId" = w.id;
```

- [ ] **Step 3: Pre-flight integrity check (read-only).** Before dropping, confirm no `JobAssignment` is left with a null `teamMemberId`: `SELECT count(*) FROM "JobAssignment" WHERE "teamMemberId" IS NULL;` → expect 0. If non-zero, STOP and reconcile.
- [ ] **Step 4: ⛔ APPROVAL GATE — get explicit user go-ahead, then apply** — `npx prisma migrate deploy` (or `migrate dev`). Take a DB snapshot/backup first.
- [ ] **Step 5: Commit** the migration file — `git commit -am "feat(db): migrate WorkerProfile+Membership → TeamMember (backfilled)"`

### Task 7: Update all remaining consumers (FK + relation rename)

**Files (each: `worker`→`teamMember`, `workerId`→`teamMemberId`, `db.membership`/`db.workerProfile`→`db.teamMember`):**
- `src/actions/jobs.ts`, `src/lib/auth.ts` (session role from `TeamMember`), `src/app/(dashboard)/dashboard/jobs/[id]/page.tsx`, calendar: `src/app/(dashboard)/dashboard/calendar/page.tsx` + `src/app/v3/(dashboard)/calendar-a/**` data loaders, Topbar/OrgSwitcher, worker-portal pages, any `prisma/seed`.

- [ ] **Step 1:** Grep the repo for `workerProfile`, `\.membership`, `workerId`, `WorkerProfile`, `Membership` and update each call site to `TeamMember`/`teamMemberId`. Keep `TeamWorker`/`TeamEvent` UI types (calendar) as-is — only their data source changes.
- [ ] **Step 2: Verify** — `npm run typecheck` until zero errors. **Commit.**

### Task 8: Collapse the three rosters onto `/dashboard/workers`

**Files:**
- Modify: `src/app/(dashboard)/dashboard/workers/page.tsx` — load `db.teamMember` (all members), show role; this is the unified roster.
- Modify: `src/app/(dashboard)/dashboard/company/team/page.tsx` and `src/app/(dashboard)/dashboard/settings/team/page.tsx` — replace body with `redirect("/dashboard/workers")`.
- Confirm: `CompanyTabs` Team tab already points to `/dashboard/workers` (Task 2).

- [ ] **Step 1:** Make `/dashboard/workers` query all `TeamMember` rows for the org (not a worker-only subset) so owners/admins appear too.
- [ ] **Step 2:** Replace the two `team` pages with `import { redirect } from "next/navigation"; export default function() { redirect("/dashboard/workers"); }`.
- [ ] **Step 3: Verify** — `npm run typecheck`; manually confirm `/company/team` and `/settings/team` redirect. **Commit.**

---

## PHASE 3 — Worker/member add form

### Task 9: Role dropdown; remove specialty + payment

**Files:**
- Modify: `src/components/v3/workers-new/workers-ledger.tsx`

- [ ] **Step 1: Remove the Specialties section and the Rate (hourly) section** from `InviteSheet` (and their state: `selected`, `otherOpen`, `customDraft`, `rate`, the specialty helpers).
- [ ] **Step 2: Add a styled Role select** (reuse the `Select` primitive, options from `WORKER_ROLES`), defaulting to `INSTALLER`:

```tsx
import { WORKER_ROLES } from "@/lib/prismaEnums";
// ...
<Select label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
  {WORKER_ROLES.map((r) => (
    <option key={r} value={r}>{r[0] + r.slice(1).toLowerCase()}</option>
  ))}
</Select>
```

- [ ] **Step 3: Send `role` to the action** — submit calls `createTeamMemberInvite({ name, email, role, phone })` (add) / `updateTeamMember({ id, name, phone, role })` (edit). Drop `specialties`/`hourlyRate` from the payload.
- [ ] **Step 4: Show the role in the roster row** (replace the specialties chips / rate column with a role pill).
- [ ] **Step 5: Verify** — `npm run typecheck`; manually add a member with role = Sales, confirm it persists and shows. **Commit.**

---

## Self-Review

- **Spec coverage:** branding autosave (T1) ✓; Team tab 2nd + Landing soon (T2) ✓; unify workers+members into one model (T3–T8) ✓; add role field on worker form (T9) ✓; remove payment+specialty (T9) ✓; styled role dropdown Installer/Sales/Estimator/Manager (T3, T9) ✓; one roster (T8) ✓.
- **Placeholder scan:** none — concrete code/SQL/paths given for the risky steps; mechanical FK renames are grep-driven with the exact tokens.
- **Type consistency:** `createTeamMemberInvite`/`updateTeamMember`/`updateTeamMemberRole`/`removeTeamMember`, `JobAssignment.teamMemberId`, `db.teamMember` used consistently across T5/T7/T9.
- **Risk:** Task 6 is destructive (drops tables) and gated; backfill + null-check guard data; Phase-2 prerequisite is a clean, non-concurrently-edited schema.
