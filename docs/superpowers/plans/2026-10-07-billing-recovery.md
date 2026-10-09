# Billing recovery implementation plan

> Execute inline in the existing authorized workspace with the executing-plans workflow. No new dependencies, migrations, or test framework.

**Goal:** Preserve valid access and give owners a truthful, usable recovery path on desktop and mobile.

**Architecture:** Resolve access from explicit manual grant terms and the subscription mirror. Recheck a stale Stripe subscription before closing an active plan. Share a recovery card between blocked pages and both subscription editions; payments use Stripe's hosted invoice and existing card-update flow.

**Tech stack:** Next.js 16, React 19, Prisma, Stripe SDK; existing Blueprint tokens.

**Spec:** Current user request, AGENTS.md, DESIGN.md.

## Constraints

- Keep genuine grant expiry, cancellation, trial expiry and owner-only billing enforced.
- Never infer that a missing grant means permanent free access.
- Reads and status checks must not charge a card or create a subscription.
- Show specific decline reasons only when reported by Stripe; never expose fraud codes.
- No bulk production overrides. The owner's approved legacy expiry repair is complete.
- Verify the actual desktop and 390×844 mobile layouts.

## Tasks

- [x] Centralize effective subscription reads for quotas, feature tiers and page gates. Explicit `endsAt: null` overrides stale mirror dates. Refresh expired ACTIVE Stripe mirrors without changing payment settings; preserve terminal states and fail closed on errors.
- [x] Add owner-scoped billing recovery status, including actual outstanding invoice, safe decline explanation and next retry date. Rechecking can synchronize Stripe's existing subscription but cannot pay or restart it.
- [x] Render a shared recovery card in blocked pages and both subscription views. Offer review/pay invoice, update card, check payment status, or restart plan as appropriate. Non-owners see instructions to contact their owner.
- [x] Verify real access and billing cases using isolated mocks, run typecheck and targeted lint, inspect desktop/mobile browser output, and review the diff. Do not exercise real payment actions during verification.

## Verification

- 23 isolated access/recovery checks passed without real database or Stripe calls.
- TypeScript and targeted lint passed during implementation; final checks repeated after review.
- Real Chrome inspected at 1440×1000 and 390×844 using actual desktop and handheld shells. Mobile controls measured 44 px; no horizontal overflow. Owner, member, cancellation, outage and error feedback inspected.
- Temporary local preview route removed. No real charge or checkout was performed.
- Production owner repair complete; one other legacy manual expiry has no grant terms and was left unchanged pending evidence. Shared code changes remain local for review.
