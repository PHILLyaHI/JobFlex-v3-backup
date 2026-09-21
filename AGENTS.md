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
- Read **[DESIGN.md](DESIGN.md)** before any frontend work. It is the full spec — palette, type, borders, shadows, motion, product context, accessibility, and the anti-references. Do not duplicate its contents here.
- Tokens in `src/app/globals.css` are unlocked. Change palette, type, radii, and motion freely without approval.
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
- This file and `DESIGN.md` take precedence over generic skill suggestions. The app stays light-only and uses the established ≤768px mobile switch. The page-styler's 860px breakpoint and standalone HTML checks apply only to its reference prototypes.
- Read the applicable skill before using it. Globally installed skills and plugins are shared across projects; do not copy the entire user skill library into this repository.
- `$source-command-fleet` runs the existing dashboard for Claude workflow logs. It does not display Codex subagents. Use Codex's native agent tools to manage Codex subagents when the task authorizes delegation.
- `.codex/config.toml` defines this project's MCP servers. Load the folder as a trusted Codex project and start a new task to activate project configuration. A shell command with this working directory does not reattach an existing task.
- See `.codex/README.md` for setup, verification results, and account logins. A configured server or installed plugin is not evidence of a working authenticated connection; check the tools available in the current task.
- No Claude hooks, permission bypasses, or credentials are imported. No additional application npm dependencies are required for Codex.


<claude-mem-context>
# Memory Context

# [joblfex-v3] recent context, 2026-09-20 10:07pm PDT

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (16,014t read) | 344,257t work | 95% savings

### Sep 12, 2026
S1960 Roof estimator wrong-building guard refactored from hard block to warnings; Smart console layout implemented; Stripe integration questions clarified (Sep 12, 10:00 PM)
S1961 Reposition "Edit roof types" and "Edit underlayments" links: move from beside field selectors to below them; rename to "Add roof type" and "Add underlayment" (Sep 12, 10:28 PM)
S1962 Integrate Stripe payment processing into JobFlex so contractors can connect their Stripe account in Settings and clients can pay proposals directly through the platform with 1% commission to JobFlex. (Sep 12, 10:50 PM)
S1963 Implement Stripe integration for JobFlex so users can connect their Stripe account in settings; when users send proposals to clients, clients pay through Stripe with 1% platform commission. Expanded to include Square and Stax payment processors. (Sep 12, 11:26 PM)
### Sep 13, 2026
S1964 Consolidate proposal editor routes; classic pages → blueprint builder. Design three roof estimator card variants. (Sep 13, 12:04 AM)
17439 12:04a 🔵 Auth.js API endpoints failing; CSRF and callback handlers not responding
17440 12:05a 🔵 Email normalization mismatch in rate-limit table; slow database round-trip (1.1s)
17441 " 🔵 Dev server at :3000 is DOWN; log file stale for 1+ hour
17443 12:07a ✅ Dev server restarted; npm run dev:pg spawned in background
17444 12:08a 🟣 Dev server successfully restarted; healthy and responding on all routes
17445 12:11a 🔵 Test still times out on login despite server recovery; auth flow remains broken
17446 12:12a 🔵 Auth.js CredentialsSignin error on login attempt; credentials rejected
17447 " ✅ Test script modified to retry login up to 3 times; handles transient auth failures
17448 12:19a 🔄 Proposal routes consolidated to blueprint-based navigation
17449 12:24a 🟣 Proposal editor consolidated to blueprint builder
S1965 Integrate Stripe, Square, and Stax payment processors into JobFlex user settings with encrypted key storage and webhook support; deploy to production with roof estimator improvements and proposals editor refactor from parallel session. (Sep 13, 12:24 AM)
17450 1:22p 🟣 Square-token and Stax columns pushed to Neon dev database
17451 1:23p 🔵 Square-token and Stax implementation passes strict eslint with zero warnings
17452 1:24p ✅ QA test environment provisioned on Neon dev branch
17453 " ✅ Playwright test script created for Square-token and Stax manual browser verification
17454 " 🔵 Dev server started successfully with regenerated Prisma schema
17455 1:26p 🔵 Square-token and Stax payment forms verified end-to-end on desktop and mobile
17456 1:27p 🔵 TypeScript compilation errors in Next.js validator for proposal pages
17457 1:30p 🟣 Three payment providers integrated with encrypted key storage
17458 " 🔵 Branch divergence: origin/main ahead with roof estimator changes
17459 1:31p ✅ Merged origin/main roof changes into blueprint-design branch
17460 " 🟣 paymentConnections.ts expanded for multi-provider webhook support
17461 " 🔴 Missing server actions from previous payment commit (305ee90)
17462 1:32p 🔴 Fix commit c0eb9ec added missing paymentConnections server actions
17463 1:34p 🔵 TypeScript errors in merged tree: old routes + missing Prisma model
17464 " ✅ Pushed blueprint-design and fast-forwarded main to c0eb9ec
17465 1:35p ✅ Regenerated Prisma client and synced ProposalSitePhoto model to Neon dev branch
17466 " ✅ Production deployment building with merged roof + payments commits
17467 " 🔵 Dev server restarted; Prisma errors resolved, validator cache stale
17468 1:39p ✅ Production deployment c0eb9ec READY; all aliases active
S1966 Polish roof estimator intake and build card UI; simplify information hierarchy and visual clutter (Sep 13, 1:39 PM)
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
S1968 Diagnostic check on crashed Next.js dev server; server recovered automatically and is now serving on port 3000 (Sep 13, 10:38 PM)
17479 10:39p 🔵 Linting errors in review feature implementation
17480 10:40p 🔴 Fixed Next.js Link navigation in public reviews component
17481 " 🔴 Fixed TypeScript any types in review error handling
17482 " 🔵 ESLint validation passed after type safety fixes
17483 10:41p 🔵 Review feature database schema changes identified
17484 10:44p 🟣 ReviewRequest schema deployed to Neon dev branch
17485 " 🟣 Extended ReviewEntry type for proposal-based reviews and photos
17486 10:47p 🟣 Implemented reviews data loader with public rating and photos support
17502 10:57p 🔵 Next.js dev server crashed with exit code 1
S1971 Set up email domain verification for jobflex.app using Resend API, determine DNS configuration approach (Sep 13, 10:59 PM)
17512 11:07p 🔄 Mobile test context reuse via storageState to avoid auth duplication
### Sep 16, 2026
17519 8:04p 🔵 Missing landing-d page module references in Next.js type definitions
S1972 Merge friend's work (origin/main) into blueprint-design branch; resolve conflicts with uncommitted local edits. (Sep 16, 8:09 PM)
**Investigated**: Pulled origin/main, checked merge status and conflicts (34 incoming commits, 11 conflicting files from parallel-session edits). Ran typecheck. Identified 39 uncommitted files from other session, 18 of which changed in main.

**Learned**: Merge itself clean—no conflicts between branches. Conflicts arose from uncommitted local edits vs. friend's latest work on portal, roof card, workers, settings. Leftover Next.js build cache references deleted landing-d page (clears on next build). Schema adds 89 lines (Prisma client regeneration + db push required).

**Completed**: Merge commit 23a9d34 created. Tree reset to clean merge state. Conflicted edits stashed as "parallel-session work before merging origin/main 2026-09-16" for recovery if needed. Typecheck clean (only stale cache errors).

**Next Steps**: Run `prisma generate` (stop dev server first on Windows), then `prisma db push` against Neon dev branch to sync local database schema. Awaiting confirmation per CLAUDE.md.


Access 344k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>