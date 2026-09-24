# AGENTS.md — JobFlex v3 (Codex)

Codex project instructions adapted from `CLAUDE.md`. Keep shared project rules in sync when intentionally changing either file; do not regenerate one over the other.

## Safety — read first
- Confirm before any destructive op: `rm -rf`, `git reset --hard`, `git push --force`, DB drops, migration rollbacks.
- Confirm before `prisma migrate` / `prisma db push` against any environment.
- Never bypass git hooks (`--no-verify`) or signing.
- No secrets in code or commits. `.env.example` is the contract; real values stay in `.env.local`.
- Never commit `prisma/dev.db` content as part of unrelated work.
- `c:\Job-FLEX` is READ-ONLY. View it for reference; never edit, copy from, or run commands in it.

## Project
- `c:\joblfex-v3` — mobile redesign of JobFlex. Goal is mobile UI/UX layout and interaction patterns.
- Next.js 16 (App Router), React 19, TypeScript 5.6, Tailwind 3.4, Framer Motion 11, Lucide.
- Prisma 5.22 (SQLite `dev.db`), NextAuth v5 beta, Zustand, React Hook Form + Zod.
- Route groups in `src/app/`: `(admin)`, `(auth)`, `(dashboard)`, `(marketing)`, `(mobile)`, `(portal)`, `(worker-portal)`.
- `src/components/` is feature-organized; `src/components/ui/` holds the shared primitives.
- `prisma/schema.prisma` is the schema of record. `src/app/globals.css` holds the design tokens.

## Design
- Read **[DESIGN.md](DESIGN.md)** before any frontend work. It is the single current Blueprint specification for every agent, including Codex, Claude and Impeccable. Its linked live components are the maintained examples; historical prototypes and generic skill aesthetics are not design authorities. Keep design decisions in that one file.
- Tune tokens in `src/app/globals.css` within the current Blueprint specification. Do not introduce another palette, font system, corner treatment or motion theme unless the user requests a design-system change; record approved changes in DESIGN.md.
- Change values at the token layer, never hardcode literals in components. A theme swap should be one file.
- Check for an existing token before adding a near-duplicate.
- Ask before repurposing what a token *means* app-wide, or removing the token system.
- Light mode only. Do not add `.dark` variants.
- Do not use Radix patterns. Modals here are hand-rolled — see [InboxSheet.tsx](src/components/calendar/InboxSheet.tsx) for the in-house style.
- DESIGN.md and the `jobflex-page-styler` skill references are hand-authored. Do not regenerate them with a doc tool.

## Mobile
- Target viewport is handheld (≤768px). Design the layout for that first.
- Do not scatter `md:` / `lg:` variants through markup. When a surface needs both, use the established pattern: a viewport switch at ≤768px that dynamically imports the mobile component — see [responsive-dashboard-shell.tsx](src/components/v3/responsive-shell/responsive-dashboard-shell.tsx).
- No UA-detection logic.
- Touch targets ≥44px. Prefer bottom sheets and sticky actions over modal dialogs.
- New standalone mobile pages live under `src/app/(mobile)/`, alongside existing routes — they do not replace them.
- Every surface gets a real mobile build. Desktop-gating needs explicit approval; read-only fallback is the last resort.
- Verify in a real browser at 390×844 before reporting work complete — use the playwright or chrome-devtools MCP.

## Scope
- **Data layer needs approval.** Server actions, API routes, and Prisma schema changes. Reuse existing endpoints otherwise.
- `(worker-portal)` and `(portal)` are out of scope unless explicitly assigned.
- Reuse and re-layout existing components before building new ones.
- No test framework installed. Do not add tests or test scaffolding without approval.

## How to work
- Once the design is clear, make the changes. Skip spec and plan ceremony unless the problem is genuinely open-ended.
- Open-ended problem → use the installed Superpowers `brainstorming` skill first. Non-trivial bug → its `systematic-debugging` skill.
- Multi-step build → use Superpowers `writing-plans` then `executing-plans` when available. Use the skill names exposed in the current Codex task.
- Any component build → use the `frontend-design` skill.
- Ship in batches of ~5 pages/components, then stop for review. Do not chain batches autonomously.
- Front-load blocking questions. Don't stop mid-batch for something answerable.
- Propose a skill before codifying a recurring pattern; use `skill-creator` after approval.

## Git
- Commit only when asked. Never push, branch, or open a PR without explicit instruction.
- Conventional Commits: `feat:` / `fix:` / `chore:` / `refactor:` / `style:`.

## Commands
- `npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint`
- `npm run prisma:migrate` / `prisma:push` / `prisma:seed` — require approval.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Codex setup

- Project skills live in `.agents/skills/`: `frontend-design`, `jobflex-page-styler`, `mobile-app-ui-design`, and `source-command-fleet`. Prefer these project versions when an identically named global skill also appears.
- This file and `DESIGN.md` take precedence over generic skill suggestions. The app stays light-only and uses the established ≤768px mobile switch. Project design skills point to the same root specification; do not restore a prototype-based theme or shell.
- Read the applicable skill before using it. Globally installed skills and plugins are shared across projects; do not copy the entire user skill library into this repository.
- `$source-command-fleet` runs the existing dashboard for Claude workflow logs. It does not display Codex subagents. Use Codex's native agent tools to manage Codex subagents when the task authorizes delegation.
- `.codex/config.toml` defines this project's MCP servers. Load the folder as a trusted Codex project and start a new task to activate project configuration. A shell command with this working directory does not reattach an existing task.
- See `.codex/README.md` for setup, verification results, and account logins. A configured server or installed plugin is not evidence of a working authenticated connection; check the tools available in the current task.
- No Claude hooks, permission bypasses, or credentials are imported. No additional application npm dependencies are required for Codex.


<claude-mem-context>
# Memory Context

# [joblfex-v3] recent context, 2026-09-22 8:51pm PDT

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (17,029t read) | 639,564t work | 97% savings

### Sep 13, 2026
17468 1:39p ✅ Production deployment c0eb9ec READY; all aliases active
17469 10:31p 🟣 Review submission form with photo upload and star ratings
17470 " 🟣 Review submission page with proposal/job context and photo parsing
17471 10:33p 🟣 Public reviews page at /r/[org-slug]
17472 " 🟣 PublicReviews component for displaying contractor review list and stats
17473 " 🟣 Public reviews stylesheet with blueprint design system
17476 " 🔵 Prisma schema generated with review fields; client types include photosJson, hiddenAt, remindedAt
17474 " 🟣 Public contractor reviews page with photo uploads
17475 10:34p 🔵 Schema mismatch in reviews implementation—missing fields and relations
17477 10:36p ✅ Roof estimator UI simplified and restyled
17478 10:37p ✅ Roof estimator polish pushed to origin/main
17479 10:39p 🔵 Linting errors in review feature implementation
17480 10:40p 🔴 Fixed Next.js Link navigation in public reviews component
17481 " 🔴 Fixed TypeScript any types in review error handling
17482 " 🔵 ESLint validation passed after type safety fixes
17483 10:41p 🔵 Review feature database schema changes identified
17484 10:44p 🟣 ReviewRequest schema deployed to Neon dev branch
17485 " 🟣 Extended ReviewEntry type for proposal-based reviews and photos
17486 10:47p 🟣 Implemented reviews data loader with public rating and photos support
17502 10:57p 🔵 Next.js dev server crashed with exit code 1
17512 11:07p 🔄 Mobile test context reuse via storageState to avoid auth duplication
### Sep 16, 2026
17519 8:04p 🔵 Missing landing-d page module references in Next.js type definitions
### Sep 20, 2026
17520 10:09p 🟣 Legal pages and billing management components deployed
17521 " ✅ Production database schema migration from SQLite to Postgres
17522 " 🟣 Centralized email routing with Gmail OAuth and platform fallback
17523 " ✅ Codebase linting verified with no warnings
S1987 Monitor and verify Vercel production deployment completion for jobflex-v3 release (Sep 20, 10:21 PM)
S1988 Inspect Vercel build logs to validate production deployment success and identify any build issues (Sep 20, 10:21 PM)
S1989 Monitor remaining Vercel build stages for production deployment completion (Sep 20, 10:22 PM)
S1990 Validate responsive design of newly deployed legal pages on mobile viewport (Sep 20, 10:22 PM)
S1991 Comprehensive validation of deployed legal pages (privacy and terms) across desktop and mobile viewports (Sep 20, 10:23 PM)
S1992 Validate deployed terms page content and layout in production (Sep 20, 10:23 PM)
S1993 Review Vercel build log compilation and TypeScript stages to confirm successful production build (Sep 20, 10:23 PM)
S1994 Verify privacy page deployment and disclosure through browser-based inspection (Sep 20, 10:23 PM)
### Sep 22, 2026
S1995 Verify JobFlex roofing inventory redesign through database validation and responsive browser testing (Sep 22, 4:22 PM)
17524 7:11p 🔵 Dev Postgres setup connects to Neon and generates Prisma Client successfully
17525 " 🔵 TypeScript executor (tsx) fails in Windows sandbox due to missing userInfo
17526 7:12p 🟣 Inventory board model for Claude redesign
17527 7:14p 🔴 Validation and auto-fixes for inventory redesign files
17528 7:15p 🔵 Blueprint sprite icon system for UI components
17529 " 🔵 Dual sprite system: desktop and mobile icon architecture
17531 7:16p 🟣 Roofing inventory pages implemented for desktop and mobile
17532 " 🔴 Dashboard shell CSS overrides breaking inventory button styles
17530 " ✅ Truck highlight icon swapped from hardhat to jobs
17534 " 🔵 QA test account and organization identified
17535 " 🔵 QA automation harness with session caching and control guards
S1996 Design and implement new roofing inventory pages for desktop and mobile using Impeccable skill with 2 GPT-6 Astra agents; verify layout, forms, and proposal linkage through browser testing. (Sep 22, 7:17 PM)
17536 7:17p 🔵 QA safety guards and forbidden control list
17537 7:18p 🔵 Prisma schema provider mismatch: repo SQLite vs generated PostgreSQL client
17538 " 🔵 QA sign-in failed: CredentialsSignin error
17539 " 🔵 SQLite dev.db exists but stale; schema column mismatch
17540 7:19p 🔵 QA test account and organization not seeded in dev.db
17541 " 🔵 Dev server using PostgreSQL, not SQLite dev.db
17542 7:20p 🔵 Roofing estimator defines 97 standard stock items
17543 " 🔵 Located sidebar and navigation label definitions across codebase
17544 7:21p 🟣 Development fixture for roofing inventory redesign preview
17545 7:22p 🟣 Component scaffolding and mobile routing for inventory redesign
17546 " 🟣 Mobile page route and dev preview for inventory redesign
17547 7:23p 🟣 Codex agents built complete roofing inventory redesign implementation
17548 " 🟣 Claude redesign preview route at /dashboard/roof-estimator/board/claude

Access 640k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>