# CLAUDE.md — JobFlex v3 Mobile Redesign

## Project Context
- Folder: `c:\joblfex-v3` — mobile redesign workspace.
- Goal: mobile UI/UX layout + interaction patterns. Not a responsive desktop pass.
- Stack: Next.js 16.0.7 (App Router), React 19, TypeScript 5.6, Tailwind 3.4, Framer Motion 11, Lucide.
- Data: Prisma 5.22 (54 models, SQLite dev.db), NextAuth v5 beta, Zustand, React Hook Form + Zod.
- Integrations: Stripe / PayPal / Square, Twilio, Resend, OpenAI, fal-ai, Vercel Blob, Google APIs.
- Git: single `main` branch, remote `origin` → `github.com/PHILLyaHI/JobFlex-v3-backup`.

## Reference: Original Job-FLEX
- Path: `c:\Job-FLEX` — READ-ONLY design reference.
- Do not edit, copy from, or run commands in that folder.
- Use it only to view existing desktop layouts when translating to mobile.

## Key Folders
- `src/app/` — App Router. Route groups: `(admin)`, `(auth)`, `(dashboard)`, `(marketing)`, `(portal)`, `(worker-portal)`.
- `src/components/` — feature-organized (23 dirs): `leads/`, `jobs/`, `proposal/`, `calendar/`, `financials/`, `hire/`, `comms/`, `vision/`, `estimator/`, `phone/`, `workers/`, `trade/`, `referrals/`, `reviews/`, `settings/`, `admin/`, `billing/`, `changeOrders/`, `dashboard/`, `projects/`, plus `ui/` (16 primitives), `layout/`, `providers/`.
- `src/actions/` — 33 server-action modules.
- `src/app/api/` — 25 route handlers.
- `prisma/schema.prisma` — schema of record.
- `src/app/globals.css` — design tokens (open for theming).

## Design System — OPEN FOR THEMING
Tokens are unlocked. Theme experimentation is explicitly allowed and does not need approval.
- Tokens in `src/app/globals.css` (palette, typography, radii, motion) may be changed freely.
- New color/font/shadow/spacing primitives are allowed. Still check for an existing token first — reuse beats adding a near-duplicate.
- Change values at the token layer, not by hardcoding literals in components. A theme swap should be achievable by editing tokens alone.
- `DESIGN.md` describes the *current* theme (blueprint). It is hand-authored (synced from the `jobflex-page-styler` skill's `references/design-system.md`) — do NOT regenerate it with `/impeccable document`; that would overwrite the authored spec. The `.impeccable/design.json` sidecar was removed 2026-07-23 (it described the retired sage theme).
- Still out of bounds without asking: restructuring what a token *means* across the app (e.g. repurposing `--accent` to a different semantic role), or ripping out the token system itself.
- The anti-slop rules and product context (users, three scenes, accessibility commitments) live in `DESIGN.md` → "Product Context" section. Change the palette freely; don't drift into the four anti-references listed there.
- Light/dark is a separate decision — see the dark-mode line under Scope Boundaries. Unlocking tokens did not unlock `.dark` variants.

## Design Context
One root file captures the design system — strategy and visuals. Read it before any frontend work.

- **[DESIGN.md](DESIGN.md)** — the Blueprint design system (full specification, English). Opens with "Product Context": users (1–10 person contractor shops), the three scenes every surface must survive (jobsite sunlight / desk / in-front-of-homeowner), accessibility commitments (WCAG 2.2 AA + outdoor-sun-readability + ≥44px targets + reduced-motion + light-only), and the four anti-references (construction-cliché, generic SaaS-cream, AI-startup purple-gradient, consumer-cute). Visuals: Brutalist + Blueprint / technical drawing — paper `#f2f0eb`, ink `#0a0a0a`, blueprint blue `#1854a0` accent, sky `#4a9eff`, 3-tone status colors (statuses only, never decoration), Inter 800–900 caps headings + tabular numerals, JetBrains Mono for the drawing-annotation layer, 2px ink borders, 2px radii, hard offset shadows (`3px 3px 0`, no blur), graph-paper grid backgrounds, Motion System "Balanced". Distribution rule ~80% neutral / ~15% blueprint / ~5% sky+status.
- `DESIGN.md` is synced from `.claude/skills/jobflex-page-styler/references/design-system.md`; `references/decisions.md` (same skill) records WHY each rule exists and the owner's rejected anti-patterns; `assets/jobflex-dashboard-blueprint.html` is the interactive source of truth. Do not regenerate these with `/impeccable document` — they are authored, not extracted. `PRODUCT.md` was removed 2026-07-23 (sage-era; its surviving strategy was folded into DESIGN.md's Product Context; git history has the original).

## Mobile-First Rule
- Target viewport: handheld (≤768px). Build layouts mobile-only.
- Do not add desktop breakpoints or `md:` / `lg:` variants for new mobile work.
- No UA-detection logic. Assume mobile-only viewport.
- Touch targets ≥44px. Bottom-sheet / sticky-action patterns preferred over modal dialogs.
- Test in mobile viewport (DevTools device toolbar) before reporting work complete.

## Mobile Redesign — Locked Decisions
- Tab bar: Dashboard · Proposals · Schedule · Jobs · More
- Primary action: context-aware FAB (label changes per active tab)
- Every surface gets a real mobile build. NO surface gets desktop-gated without explicit user approval. Read-only fallback is option of last resort.
- Phase order: 0 (primitives) → 1 (nav shell) → 2 (global surfaces) → 3 (lists A) → 4 (lists B) → 5 (detail/forms) → 6 (calendar/kanban) → 7 (auth polish) → 8 (settings/admin) → 9 (polish)
- Each phase has a hard review gate. No chaining phases autonomously.

## Mobile Route Strategy
- All new mobile pages live under route group `src/app/(mobile)/`.
- Mobile pages live side-by-side with existing routes — they do NOT replace `(dashboard)`, `(admin)`, etc.
- Existing desktop code stays as-is unless explicitly assigned for conversion.

## Scope Boundaries
- **Data layer is out of scope by default.** Server actions, API routes, and Prisma schema changes require explicit approval. Mobile work reuses existing endpoints unless I approve a new one.
- **`(worker-portal)` and `(portal)` route groups are out of scope** unless explicitly assigned. Revisit later.
- **Dark mode is out of scope.** Build for light mode only. Do not add `.dark` variants.

## Component Reuse
- Before creating a new mobile component, check `src/components/ui/` and feature folders for existing primitives.
- Reuse and re-layout existing components rather than duplicating.
- New components only when no existing primitive can be re-laid-out for mobile.

## Page-Batch Review Gate
- Mobile redesign work proceeds in batches of 5 pages/components.
- After each batch, stop and wait for review before starting the next batch.
- Do not chain batches autonomously.

## Plugin Precedence
Resolve overlap by always deferring to:
- **Planning** → `superpowers:writing-plans`. Not GSD planning, not ad-hoc.
- **Execution** → `superpowers:executing-plans`. Not GSD execution.
- **TDD** → `superpowers:test-driven-development`. **Dormant** — applies once a test framework is installed.
- **Debugging** → `superpowers:systematic-debugging` for any non-trivial bug.
- **Memory** → harness auto-memory at `C:\Users\trade\.claude\projects\c--joblfex-v3\memory\` is canonical. `claude-mem` is supplementary; do not write to it as primary store.
- **Code search** → Grep / Glob first. `claude-mem:smart-explore` only when explicitly requested.

## Standard Phase Workflow
Each mobile phase follows this sequence:

1. `superpowers:brainstorming` — when problem is open-ended
2. `superpowers:writing-plans` → `PLAN.md`
3. `superpowers:executing-plans` + frontend-design (auto) → build
4. `superpowers:verification-before-completion` → internal verify
5. `/gsd-ui-review` — opt-in UX audit checkpoint after build
6. `/gsd-code-review` — opt-in code quality checkpoint
7. `/security-review` — required only on auth, payment, or tenant-scoping phases

Skip steps only with explicit user approval. GSD commands are checkpoints, not substitutes for the superpowers spine.

## UI Authority
- `frontend-design` skill is the authority for UI component construction. It must fire on any component build, including small primitives. Do not skip it on Phase 0 work.

## Deliberate Slash Commands
Use only when invoked by name. Do not auto-invoke or substitute:
- `/gsd-fast` — quick GSD-style task.
- `/gsd-plan-phase` then `/gsd-execute-phase` — full GSD planning/execution loop.
- `/gsd-ui-review` — visual / UX audit.
- `/gsd-code-review` — code review pass with severity classification.
- `/security-review` — security review of pending branch changes.

## Memory Capture
- Auto-memory at `C:\Users\trade\.claude\projects\c--joblfex-v3\memory\` is canonical for facts.
- Use `claude-mem` manually to record cross-session institutional knowledge: architectural decisions with rationale, abandoned approaches and why, cross-cutting patterns. Do not auto-write to `claude-mem` at end of every phase. Invoke deliberately.

## Context-Mode
- Tool outputs >20 lines route through context-mode (`mcp__plugin_context-mode__ctx_*`) automatically. If the hook doesn't fire, run `/context-mode:ctx-doctor`.
- Do not paste raw long outputs into conversation.

## Skill Creation
- If a recurring pattern emerges that should be encoded as a skill, pause work, propose it, use `skill-creator` after my approval.
- Do NOT silently codify patterns into untracked conventions.
- Do NOT invent skills. The skill `jobflex-migration` was hallucinated in a prior audit and does not exist anywhere on disk. Do not reference it.

## Testing
- No test framework installed.
- Do not add tests or test scaffolding without approval.
- TDD precedence rule activates once a framework lands.

## Safety Rules
- No destructive ops without explicit confirmation: no `rm -rf`, no `git reset --hard`, no `git push --force`, no DB drops, no migration rollbacks.
- No secrets in code or commits. `.env.example` is the contract; real values stay in `.env.local`.
- Never commit `prisma/dev.db` content as part of unrelated work.
- Never bypass git hooks (`--no-verify`) or signing.
- Confirm before running `prisma migrate` or `prisma db push` against any environment.
- Do not use Radix patterns. This project's modals are hand-rolled (see `src/components/calendar/InboxSheet.tsx` for the in-house style).

## Git Workflow
- Create commits only when explicitly asked.
- Conventional Commits format: `feat: …` / `fix: …` / `chore: …` / `refactor: …` / `style: …`.
- Never push without explicit instruction.
- Do not create new branches or open PRs unless asked.

## Build / Dev Commands
- `npm run dev` — Next dev server.
- `npm run build` — Prisma generate + Next build.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — Next lint.
- `npm run prisma:migrate` / `prisma:push` / `prisma:seed` — schema ops (require approval).
