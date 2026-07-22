# Smart Proposal "Make changes" Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the confirmed bugs in the post-estimate refine flow (scope/timeline discarded, rename→reprice, unit drift, clobbered inputs, silent re-shop failure, no undo, unconfirmed reset, raw errors) and add: diff preview with confirm, undo, stable line IDs, short-term memory, re-priced badges, staged progress, and a first-class discount that flows into the converted proposal.

**Architecture:** The refine stays a stateless server action, but its contract grows: lines carry client IDs through the model round-trip (ID-first matching, name fallback), the action returns `warnings` + `reshopFailed` alongside the data, and the client gates every AI result behind a diff preview computed by a small pure util. Discount is already modeled in Prisma (`Discount` on Proposal) — the estimator schema gains a matching `{label, amount, isPercent}` shape that rides the existing JSON paths and materializes on convert. No Prisma schema changes, no new endpoints.

**Tech Stack:** Next.js 16 App Router server actions, Zod, OpenAI chat completions (json_object), React 19 client state, existing design system (Tonal-Pill, Hairline-Beats-Border, hand-rolled sheets, no Radix).

## Global Constraints

- Design tokens in `src/app/globals.css` are FROZEN — reuse existing classes (`quiet-caps`, `paper-card`, `stat-numeric`, tonal pills via `--accent-soft`/`--accent-ink`, rose for destructive).
- No Prisma schema changes (Discount model already exists). No new API routes.
- No test framework exists — verification is `npm run typecheck` + driving the running app. Do NOT add test scaffolding.
- No commits — the user has not asked for commits.
- No Radix; confirm/preview UIs are in-place card swaps, not modal dialogs.
- Existing behavior preserved: demo mode (no OPENAI_API_KEY) still short-circuits and applies directly (no preview); plan-limit result handling (`reportPlanLimitResult`) unchanged.
- lineSchema is shared with roof/fence estimators and convertInput — all additions must be optional/backwards-compatible.

## File Map

- Modify: `src/lib/estimatorSchema.ts` — optional `id` on lines; new `discountSchema`; `discount` on `estimateSchema`.
- Modify: `src/actions/advancedEstimator.ts` — refine input/prompt/laundering/re-shop/return/error mapping; convert + saveEstimate discount.
- Create: `src/app/(dashboard)/dashboard/advanced-ai/refine-diff.ts` — pure diff util.
- Modify: `src/components/estimator/EstimatorBreakdown.tsx` — `changedIds` badge + `disabled`.
- Modify: `src/components/estimator/EstimatorSummary.tsx` — discount row + remove, timeline line.
- Modify: `src/app/(dashboard)/dashboard/advanced-ai/estimator-studio.tsx` — scope/timeline/discount/history/pending/undo/badges/staged-progress/two-step-reset state + preview UI.

---

### Task 1: Schema — line IDs + discount

**Files:**
- Modify: `src/lib/estimatorSchema.ts`

**Interfaces:**
- Produces: `lineSchema` gains `id: z.string().optional()`. New export `discountSchema` = `z.object({ label: z.string().min(1).max(80), amount: z.number().positive(), isPercent: z.boolean() })`, type `EstimateDiscount`. `estimateSchema` gains `discount: discountSchema.nullish()`.

- [ ] **Step 1: Add `id` to lineSchema** — insert as the first field with a comment that it is a client-side row identity passed through the model round-trip so edits match by identity, not name; the model must echo it, new lines omit it.

```ts
export const lineSchema = z.object({
  // Client row identity, passed through the AI round-trip. Lets the refine
  // match lines by identity (not name), so a rename never re-shops/re-prices.
  // The model echoes it; brand-new lines omit it. Optional for back-compat.
  id: z.string().optional(),
  name: z.string(),
  ...
```

- [ ] **Step 2: Add discountSchema + wire into estimateSchema** (after lineSchema):

```ts
// One order-level discount, mirroring the Prisma Discount row on Proposal
// ({label, amount, isPercent}) so it converts 1:1. amount is dollars when
// isPercent=false, a 0-100 percentage when true.
export const discountSchema = z.object({
  label: z.string().min(1).max(80),
  amount: z.number().positive(),
  isPercent: z.boolean(),
});
export type EstimateDiscount = z.infer<typeof discountSchema>;
```

and in `estimateSchema`: `discount: discountSchema.nullish(),` after `estimatedTimelineDays`.

- [ ] **Step 3: `npm run typecheck` — expect PASS (all additions optional).**

### Task 2: Server — refine action upgrade

**Files:**
- Modify: `src/actions/advancedEstimator.ts:706-969`

**Interfaces:**
- Consumes: `discountSchema`/`estimateSchema` from Task 1.
- Produces: `refineAdvancedEstimate` success shape becomes `{ ok: true; data: GeneratedEstimate; warnings: string[]; reshopFailed: boolean; disabled?: boolean }`. Input drops `description`, adds `history: string[]` (≤10, each ≤4000 chars), caps `instructions` at 4000.

- [ ] **Step 1: Replace `refineInputSchema`** — drop dead `description`; add capped `instructions` + `history` with comments (memory for the stateless refine).
- [ ] **Step 2: Extend the system prompt** — JSON shape includes `id` on material/labor lines and `discount: {label, amount, isPercent} | null`; add rules: (6) preserve `id` on kept/edited lines incl. renames, omit only on new lines; (7) renaming/rewording alone never changes price, quantity, or product link; (8) discount requests set the `discount` field — never fold into line prices; removal sets null; (9) update `scope`/`estimatedTimelineDays` when affected, else copy through.
- [ ] **Step 3: Inject history into the user message** — before the change request: `Changes already applied earlier (oldest first):\n- …` when non-empty.
- [ ] **Step 4: ID-first laundering** — build `originalById` (from `current.materials` with ids) + existing `originalByName`; `originalFor(mat)` prefers id. Use it in the launder loop AND the `toPrice` filter (`!m.productUrl || !originalFor(m)`) so a renamed-but-id-matched line keeps its link and is NOT re-shopped.
- [ ] **Step 5: Preserve ids through re-shop merge** — in `applyLine`, `const keepId = parsed.materials[slotIdx]?.id ?? line.id;` and spread `id: keepId` into the replacement.
- [ ] **Step 6: Unit-change warnings** — `const warnings: string[] = []`; after the merge, for each re-shopped slot where `originalFor(mat)?.unit` differs (case-insensitive) from the new `unit`, push `“<name>” now sells per <new> (was <old>) — double-check its quantity.` Also append the same short note to that line's `notes`.
- [ ] **Step 7: Surface re-shop failure** — `let reshopFailed = false`; the existing catch sets it true and pushes a warning: `Live price lookup failed — changed lines keep AI-estimated prices and may be missing store links.`
- [ ] **Step 8: Return + friendly errors** — success returns `{ ok: true, data: parsed, warnings, reshopFailed }` (demo path: `warnings: [], reshopFailed: false, disabled: true`). Outer catch maps: ZodError/SyntaxError → "The AI returned an edit we couldn't apply. Try rephrasing or making one change at a time."; numeric `err.status` → "The AI service had a problem. Try again in a moment."; else "Couldn't apply changes. Try again." Raw error still logged.
- [ ] **Step 9: `npm run typecheck` — expect PASS** (old client sends `description`; Zod strips unknown keys, so the interim state compiles and runs).

### Task 3: Server — convert + save carry the discount

**Files:**
- Modify: `src/actions/advancedEstimator.ts` (`convertInput` ~:1003, totals ~:1086-1125, `saveEstimate` ~:989)

**Interfaces:**
- Consumes: `discountSchema` (Task 1).
- Produces: `convertEstimateToProposal` accepts `discount?: EstimateDiscount | null`; writes `discountTotal`, a `discounts.create` row, and taxes the discounted base. `saveEstimate` stashes `discount` in the `categories` JSON.

- [ ] **Step 1: `convertInput`** — add `discount: discountSchema.nullish(),`.
- [ ] **Step 2: Totals** — after `subtotal`:

```ts
// Order-level discount (estimator "10% off" etc). Percent clamps to 100,
// dollars clamp to the subtotal, tax applies to the discounted base.
const discountTotal = data.discount
  ? Math.min(
      subtotal,
      data.discount.isPercent
        ? (subtotal * Math.min(data.discount.amount, 100)) / 100
        : data.discount.amount,
    )
  : 0;
```
`taxTotal = (subtotal - discountTotal) * taxRate`; proposal data gains `discountTotal`, `total: subtotal - discountTotal + taxTotal`, and
```ts
discounts: data.discount
  ? { create: [{ label: data.discount.label, amount: data.discount.amount, isPercent: data.discount.isPercent }] }
  : undefined,
```
- [ ] **Step 3: `saveEstimate`** — `categories` JSON adds `discount: raw.data.discount ?? null`.
- [ ] **Step 4: `npm run typecheck` — expect PASS.**

### Task 4: Diff util

**Files:**
- Create: `src/app/(dashboard)/dashboard/advanced-ai/refine-diff.ts`

**Interfaces:**
- Produces:
```ts
export type FieldChange = { label: "Name" | "Qty" | "Unit $" | "Unit"; from: string; to: string };
export type LineDelta =
  | { kind: "added"; group: "materials" | "labor"; index: number; name: string }
  | { kind: "removed"; group: "materials" | "labor"; name: string }
  | { kind: "changed"; group: "materials" | "labor"; index: number; name: string; fields: FieldChange[] };
export type RefineDiff = {
  deltas: LineDelta[];
  /** `${group}:${index}` of every added/changed line in the NEXT arrays — used to badge rows on apply. */
  changedKeys: Set<string>;
  isEmpty: boolean;
};
export function diffEstimate(current: { materials: EstimateLine[]; labor: EstimateLine[] }, next: GeneratedEstimate): RefineDiff;
```
- Matching: by `id` when the next line carries one that exists in `current`, else by `name.trim().toLowerCase()`, consuming each current line at most once; leftovers are `removed`. `changed` compares name/quantity/unitPrice/unit (prices via `money()`, numbers via `String`). Product-link churn alone is NOT a delta.

- [ ] **Step 1: Implement exactly the interface above** (pure module, no React).
- [ ] **Step 2: `npm run typecheck` — expect PASS.**

### Task 5: EstimatorBreakdown — badges + lock (frontend-design fires)

**Files:**
- Modify: `src/components/estimator/EstimatorBreakdown.tsx`

**Interfaces:**
- Produces: `BreakdownProps` gains `changedIds?: Set<string>` and `disabled?: boolean`. Rows in `changedIds` show a tonal "Updated" pill by the name; `disabled` disables every input/button (no pointer-events hacks — real `disabled` attrs, `aria-disabled` on the card body).

- [ ] **Step 1: Add props; thread `disabled` to all inputs, the per-row remove button, and "Add line".**
- [ ] **Step 2: "Updated" pill** — Tonal-Pill: `bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)] rounded-full px-1.5 py-0.5 text-[10px] font-medium`, rendered inside the name cell without breaking the input layout.
- [ ] **Step 3: `npm run typecheck` — expect PASS (props optional).**

### Task 6: EstimatorSummary — discount + timeline (frontend-design fires)

**Files:**
- Modify: `src/components/estimator/EstimatorSummary.tsx`

**Interfaces:**
- Produces: props gain `discount?: EstimateDiscount | null`, `onRemoveDiscount?: () => void`, `timelineDays?: number | null`. Renders `Discount · <label>` row as `−$X` (percent → computed off materials+labor subtotal, clamped) with a quiet remove ×; Total becomes the discounted total; timeline as a quiet caps line `Est. timeline · N days` when present.

- [ ] **Step 1: Implement rows per the design system (Row pattern already in file; discount value in rose? No — Status-Is-Not-Decoration: keep ink, minus sign carries meaning).**
- [ ] **Step 2: `npm run typecheck` — expect PASS.**

### Task 7: Studio — preview gate, undo, scope, locks, staged progress, reset confirm (frontend-design fires)

**Files:**
- Modify: `src/app/(dashboard)/dashboard/advanced-ai/estimator-studio.tsx`

**Interfaces:**
- Consumes: Tasks 1-6 (`EstimateDiscount`, refine return `{warnings, reshopFailed}`, `diffEstimate`, new component props).
- Produces: the full UX: type request → locked UI + staged status line → "Review changes" panel (request echo, warnings, per-line deltas, meta changes) → Apply/Discard → badges + Undo; scope textarea; discount in summary; two-step Start over.

- [ ] **Step 1: State** — add `scope`, `timelineDays`, `discount`, `history`, `pendingRefine: { data; warnings; reshopFailed; diff: RefineDiff; instructions } | null`, `undoSnap: Snapshot | null`, `changedIds: Set<string>`, `refineStage`, `confirmReset`. `Snapshot` captures title/scope/timelineDays/discount/assumptions/baseline/materials/labor/changedIds/history.
- [ ] **Step 2: Generate success** — also `setScope(res.data.scope || description)`, `setTimelineDays(res.data.estimatedTimelineDays ?? null)`, `setDiscount(res.data.discount ?? null)`, clear `changedIds`/`undoSnap`/`pendingRefine`/`history`.
- [ ] **Step 3: onRefine** — payload: no `description`; `history: history.slice(-5)`; `current` includes line `id`s, `scope: scope || description`, `discount`. Demo (`res.disabled`): apply directly as today. Otherwise `diffEstimate`; empty diff + no meta/warnings → `toast.info("No changes detected", …)` keeping the text; else `setPendingRefine`.
- [ ] **Step 4: applyPending / discardPending / undo** — apply: snapshot→`undoSnap`, set all fields, map lines with `id: m.id ?? nanoid(6)` collecting badge ids via `diff.changedKeys`, push `instructions` into `history` (cap 8), clear text+pending, toast success (or `toast.info` mentioning warnings when `reshopFailed`). Discard: clear pending only (text kept). Undo: restore snapshot wholesale, clear `undoSnap`, toast.
- [ ] **Step 5: Locks + staged progress** — `busyLocked = refineBusy || !!pendingRefine`; textarea/assumption inputs/add/remove/breakdowns get `disabled={busyLocked}`; while `refineBusy` show a stage line cycling at 0s/6s/14s: "Editing your estimate…", "Re-shopping changed items…", "Linking real products…" (timer effect mirroring the generate stepper).
- [ ] **Step 6: Scope section** — `quiet-caps` "Scope of work" + `Textarea rows=3` bound to `scope`, between Make changes and Assumptions; convert/save/refine all send `scope: scope || description`; save also sends `estimatedTimelineDays` + `discount`.
- [ ] **Step 7: Review panel** — when `pendingRefine`, the edit rail swaps to: header "Review changes" + request echo; amber warning block (AlertTriangle) listing `warnings`; delta rows (Added → tonal accent pill, Removed → rose-soft pill, Changed → field chips `Qty 24 → 18`); meta rows for title/scope/timeline/discount when changed; action bar becomes ghost "Discard" + primary "Apply changes".
- [ ] **Step 8: Two-step Start over** — first click arms (label "Really start over?", rose text) with a 3s disarm timer; second click runs extended `reset()` (also clears every new piece of state).
- [ ] **Step 9: Wire summary/breakdown props** (`discount`, `onRemoveDiscount`, `timelineDays`, `changedIds`, `disabled`).
- [ ] **Step 10: `npm run typecheck` — expect PASS.**

### Task 8: Verification (verification-before-completion)

- [ ] `npm run typecheck` clean.
- [ ] Restart dev server; `GET /dashboard/advanced-ai` renders 200 logged-in.
- [ ] Drive one real refine over HTTP (logged-in server-action POST with a 2-line current estimate + instruction "add a 10% discount and rename shingles to premium shingles"): response contains `warnings` array, `reshopFailed` boolean, `data.discount` set, renamed line keeps its `id`/`productUrl`.
- [ ] Report results honestly, including anything that failed.

## Self-Review

- Spec coverage: bugs 1-8 → Tasks 2 (rename/unit/silent/errors), 3 (discount), 5-7 (clobber/undo/reset/scope/badges/progress/memory/preview) ✓. Metering refines deliberately excluded — needs a product decision + would pollute AiEstimate rows; flagged in the final report instead.
- Types: `EstimateDiscount` named identically in Tasks 1/3/6/7; `RefineDiff.changedKeys` naming matches Task 7 Step 4 ✓.
- No placeholders: each code-bearing step shows the code or the exact contract ✓.
