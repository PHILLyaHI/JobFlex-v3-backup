# Contractor Payment Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each contractor connect their own Stripe, Square, and PayPal accounts so that when a homeowner pays a proposal through JobFlex, the money lands in the contractor's account (minus a JobFlex platform fee), instead of JobFlex's platform account.

**Architecture:** A single provider-agnostic `PaymentConnection` table (one row per org per provider) stores each contractor's connected-account identity and (for Square/PayPal) encrypted OAuth tokens. Each provider gets an OAuth/onboarding round-trip (connect → callback → status webhook) and the existing `/api/checkout/{provider}` routes are rewritten to route the charge to the connected account with an `application_fee`/`platform_fee`. A "Get paid" panel in Settings → Payments drives connect/disconnect and shows live status.

**Tech Stack:** Next.js 16 App Router (route handlers + server actions), Prisma 5.22 (SQLite dev), `stripe` SDK (already installed), Square + PayPal via REST (fetch), Node `crypto` (AES-256-GCM) for token-at-rest encryption, NextAuth v5 session + `requireOrg()` for tenant scoping.

## Global Constraints

- **No test framework is installed.** Do NOT add one. Each task verifies via `npm run typecheck` (`tsc --noEmit`), `npm run lint`, and the manual/CLI flow check stated in the task. (CLAUDE.md: TDD is dormant until a framework lands.)
- **Data-layer change is approved for this feature only.** Prisma schema + server actions + API routes are in scope here. Nothing else.
- **Prisma migration requires explicit confirmation.** Do NOT run `prisma migrate`/`db push` without stopping for the user's OK (CLAUDE.md safety rule). Use `prisma migrate dev --name <n>` on dev.db only after confirmation.
- **Security review is mandatory before merge.** This is a payments + OAuth-token + tenant-scoping feature → run `/security-review` as the final gate (CLAUDE.md).
- **Tenant scoping is non-negotiable.** Every connect/disconnect/charge path must resolve the org via `requireOrg()` (or, for public checkout, via the proposal's `organizationId`) and must never let one org act on another's connection. OAuth `state` carries the org id + a signed CSRF nonce and is verified on callback.
- **Secrets stay in env.** New env keys go in `.env.example` (contract only, no real values): `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `SQUARE_APP_ID`, `SQUARE_APP_SECRET`, `SQUARE_ENV`, `SQUARE_WEBHOOK_SIGNATURE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_PARTNER_MERCHANT_ID`, `PAYPAL_BN_CODE`, `PAYPAL_ENV`, `PAYMENT_TOKEN_ENC_KEY` (32-byte base64), `PLATFORM_FEE_BPS` (integer basis points, e.g. `200` = 2%).
- **Platform fee** is JobFlex's, configured by `PLATFORM_FEE_BPS` and applied at charge time via one shared helper. Default to `0` if unset (never guess a fee).
- **Money is integer minor units (cents).** Match the existing checkout routes, which already pass `amount` in cents.
- **Reuse existing patterns:** `requireOrg()` from `@/lib/orgContext`, the `db` client from `@/lib/db`, the SDK-disabled pattern from `@/lib/sdk/*` (`isXEnabled()` + `IntegrationDisabledError`), hand-rolled UI (no Radix), locked design tokens.
- **Fail closed.** If a provider has no active connection for the proposal's org, checkout returns a clear "not connected" response — it must NEVER fall back to charging the JobFlex platform account.

---

## File Structure

**New — shared core**
- `prisma/schema.prisma` (modify) — add `PaymentConnection` model + `PaymentProvider`/`ConnectionStatus` enums (as `String` per existing convention) + relation on `Organization`.
- `src/lib/payments/encryption.ts` — AES-256-GCM `encryptToken()` / `decryptToken()`.
- `src/lib/payments/fees.ts` — `computePlatformFeeCents(amountCents)` from `PLATFORM_FEE_BPS`.
- `src/lib/payments/connections.ts` — typed CRUD for `PaymentConnection` (`getConnection`, `upsertConnection`, `deleteConnection`, `getActiveConnection`).
- `src/lib/payments/oauthState.ts` — `signState()` / `verifyState()` (HMAC) carrying `{ organizationId, provider, nonce }`.

**New — Stripe (Phase 1)**
- `src/app/api/connect/stripe/start/route.ts` — builds the Stripe OAuth authorize URL, redirects.
- `src/app/api/connect/stripe/callback/route.ts` — exchanges `code`, stores `acct_...`, redirects to settings.
- `src/app/api/connect/stripe/disconnect/route.ts` — deauthorizes + deletes connection (server action alternative below).
- `src/app/api/webhooks/stripe/connect/route.ts` — handles `account.updated` to mirror status.
- `src/lib/sdk/stripe.ts` (modify) — add `getStripeConnectClientId()`.
- `src/app/api/checkout/stripe/route.ts` (modify) — route to connected account + `application_fee_amount`.

**New — Square (Phase 2)**
- `src/lib/sdk/square.ts` — env-gated Square REST helpers (token exchange, payment link).
- `src/app/api/connect/square/start/route.ts`, `.../callback/route.ts`, `.../disconnect/route.ts`.
- `src/app/api/webhooks/square/route.ts` — payment + `oauth.authorization.revoked`.
- `src/app/api/checkout/square/route.ts` (modify) — charge via merchant token + `app_fee_money`.

**New — PayPal (Phase 3)**
- `src/lib/sdk/paypal.ts` (modify existing) — add partner-referral onboarding + order-with-platform-fee.
- `src/app/api/connect/paypal/start/route.ts`, `.../callback/route.ts` (onboarding return), `.../disconnect/route.ts`.
- `src/app/api/webhooks/paypal/route.ts` (modify) — `MERCHANT.ONBOARDING.COMPLETED`.
- `src/app/api/checkout/paypal/route.ts` (modify) — order with `payee.merchant_id` + `platform_fees`.

**Settings UI (all phases)**
- `src/actions/payments.ts` — server actions: `disconnectProvider(provider)`, `getConnectionStatuses()`.
- `src/app/(dashboard)/dashboard/settings/payment/get-paid-panel.tsx` — connection cards.
- `src/app/(dashboard)/dashboard/settings/payment/page.tsx` (modify) — render the panel with live statuses.
- `.env.example` (modify) — document all new keys.

---

## Phase 0 — Shared payment-connection core

### Task 0.1: PaymentConnection schema + migration

**Files:**
- Modify: `prisma/schema.prisma` (add model + enums-as-strings; add relation field to `model Organization`)

**Interfaces:**
- Produces: `PaymentConnection` model with fields `id, organizationId, provider, status, accountId, merchantId, locationId, accessTokenEnc, refreshTokenEnc, tokenExpiresAt, scope, chargesEnabled, raw, connectedAt, updatedAt`; unique `@@unique([organizationId, provider])`.

- [ ] **Step 1: Add the model to `prisma/schema.prisma`**

```prisma
// Per-contractor connected payout account (Stripe/Square/PayPal). One row per
// org per provider. Stripe Standard stores only the acct_ id (charges use the
// platform key + Stripe-Account header); Square/PayPal store ENCRYPTED tokens.
model PaymentConnection {
  id              String   @id @default(cuid())
  organizationId  String
  provider        String   // "STRIPE" | "SQUARE" | "PAYPAL"
  status          String   @default("PENDING") // PENDING | ACTIVE | RESTRICTED | REVOKED
  accountId       String?  // Stripe acct_... / Square merchant_id / PayPal merchant_id
  merchantId      String?  // provider merchant id when distinct from accountId
  locationId      String?  // Square location id
  accessTokenEnc  String?  // AES-256-GCM, base64 (Square/PayPal)
  refreshTokenEnc String?  // AES-256-GCM, base64 (Square)
  tokenExpiresAt  DateTime?
  scope           String?
  chargesEnabled  Boolean  @default(false)
  raw             String?  // last provider status payload (JSON), for debugging
  connectedAt     DateTime @default(now())
  updatedAt       DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, provider])
  @@index([organizationId])
  @@index([provider, accountId])
}
```

- [ ] **Step 2: Add the relation to `model Organization`**

Find `model Organization {` and add alongside the other relation lists (e.g. near `influencerPayouts InfluencerPayout[]`):

```prisma
  paymentConnections PaymentConnection[]
```

- [ ] **Step 3: Validate the schema (no DB write yet)**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: STOP — confirm migration with the user, then run it**

Per CLAUDE.md, do not migrate without confirmation. After the user confirms:
Run: `npx prisma migrate dev --name add_payment_connection`
Expected: migration created + applied to dev.db, `prisma generate` runs automatically.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(payments): add PaymentConnection model for contractor connected accounts"
```

### Task 0.2: Token encryption util

**Files:**
- Create: `src/lib/payments/encryption.ts`

**Interfaces:**
- Produces: `encryptToken(plain: string): string`, `decryptToken(enc: string): string` (base64 `iv:tag:ciphertext`).

- [ ] **Step 1: Implement**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM. Key is 32 raw bytes provided base64 in PAYMENT_TOKEN_ENC_KEY.
function key(): Buffer {
  const b64 = process.env.PAYMENT_TOKEN_ENC_KEY;
  if (!b64) throw new Error("PAYMENT_TOKEN_ENC_KEY is not set");
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) throw new Error("PAYMENT_TOKEN_ENC_KEY must decode to 32 bytes");
  return k;
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decryptToken(enc: string): string {
  const [ivB64, tagB64, ctB64] = enc.split(":");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("malformed encrypted token");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 2: Verify round-trip via a throwaway script**

Run:
```bash
PAYMENT_TOKEN_ENC_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))") \
npx tsx -e "import {encryptToken,decryptToken} from './src/lib/payments/encryption'; const e=encryptToken('hello'); console.log(decryptToken(e)==='hello')"
```
Expected: `true`

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add src/lib/payments/encryption.ts
git commit -m "feat(payments): AES-256-GCM token encryption util"
```

### Task 0.3: Platform-fee + OAuth-state helpers

**Files:**
- Create: `src/lib/payments/fees.ts`
- Create: `src/lib/payments/oauthState.ts`

**Interfaces:**
- Produces: `computePlatformFeeCents(amountCents: number): number`; `signState(p: {organizationId: string; provider: string}): string`; `verifyState(state: string): {organizationId: string; provider: string} | null`.

- [ ] **Step 1: `fees.ts`**

```ts
// Platform fee in basis points (200 = 2%). Defaults to 0 (no fee) when unset.
export function computePlatformFeeCents(amountCents: number): number {
  const bps = Number(process.env.PLATFORM_FEE_BPS ?? "0");
  if (!Number.isFinite(bps) || bps <= 0) return 0;
  return Math.floor((amountCents * bps) / 10_000);
}
```

- [ ] **Step 2: `oauthState.ts`**

```ts
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function secret(): string {
  const s = process.env.PAYMENT_TOKEN_ENC_KEY ?? process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("no secret available for OAuth state signing");
  return s;
}

// state = base64url(json).hmac — carries org + provider + nonce, tamper-evident.
export function signState(p: { organizationId: string; provider: string }): string {
  const body = Buffer.from(
    JSON.stringify({ ...p, nonce: randomBytes(8).toString("hex") }),
  ).toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyState(state: string): { organizationId: string; provider: string } | null {
  const [body, mac] = state.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof parsed.organizationId === "string" && typeof parsed.provider === "string") {
      return { organizationId: parsed.organizationId, provider: parsed.provider };
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add src/lib/payments/fees.ts src/lib/payments/oauthState.ts
git commit -m "feat(payments): platform-fee + signed OAuth-state helpers"
```

### Task 0.4: PaymentConnection data accessor

**Files:**
- Create: `src/lib/payments/connections.ts`

**Interfaces:**
- Consumes: `db` from `@/lib/db`.
- Produces: `getConnection(orgId, provider)`, `getActiveConnection(orgId, provider)`, `upsertConnection(orgId, provider, data)`, `deleteConnection(orgId, provider)`, and a `ProviderId = "STRIPE"|"SQUARE"|"PAYPAL"` type.

- [ ] **Step 1: Implement**

```ts
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export type ProviderId = "STRIPE" | "SQUARE" | "PAYPAL";

export function getConnection(organizationId: string, provider: ProviderId) {
  return db.paymentConnection.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
  });
}

export async function getActiveConnection(organizationId: string, provider: ProviderId) {
  const c = await getConnection(organizationId, provider);
  return c && c.status === "ACTIVE" ? c : null;
}

export function upsertConnection(
  organizationId: string,
  provider: ProviderId,
  data: Omit<Prisma.PaymentConnectionUncheckedCreateInput, "organizationId" | "provider">,
) {
  return db.paymentConnection.upsert({
    where: { organizationId_provider: { organizationId, provider } },
    create: { organizationId, provider, ...data },
    update: data,
  });
}

export function deleteConnection(organizationId: string, provider: ProviderId) {
  return db.paymentConnection.deleteMany({ where: { organizationId, provider } });
}
```

- [ ] **Step 2: Typecheck (confirms the generated Prisma client has the model) + commit**

Run: `npm run typecheck`
Expected: clean (proves Task 0.1's `prisma generate` produced `db.paymentConnection`).
```bash
git add src/lib/payments/connections.ts
git commit -m "feat(payments): PaymentConnection data accessor"
```

### Task 0.5: Settings "Get paid" panel scaffold + status action

**Files:**
- Create: `src/actions/payments.ts`
- Create: `src/app/(dashboard)/dashboard/settings/payment/get-paid-panel.tsx`
- Modify: `src/app/(dashboard)/dashboard/settings/payment/page.tsx`

**Interfaces:**
- Consumes: `requireOrg()`, `getConnection`, `deleteConnection`.
- Produces: `getConnectionStatuses(): Promise<Record<ProviderId,{status:string;accountId:string|null}>>`, `disconnectProvider(provider: ProviderId)` server action.

- [ ] **Step 1: `src/actions/payments.ts`**

```ts
"use server";
import { requireOrg } from "@/lib/orgContext";
import { deleteConnection, getConnection, type ProviderId } from "@/lib/payments/connections";

const PROVIDERS: ProviderId[] = ["STRIPE", "SQUARE", "PAYPAL"];

export async function getConnectionStatuses() {
  const { organizationId } = await requireOrg();
  const out: Record<string, { status: string; accountId: string | null }> = {};
  for (const p of PROVIDERS) {
    const c = await getConnection(organizationId, p);
    out[p] = { status: c?.status ?? "NONE", accountId: c?.accountId ?? null };
  }
  return out;
}

export async function disconnectProvider(provider: ProviderId) {
  const { organizationId } = await requireOrg();
  await deleteConnection(organizationId, provider);
  return { ok: true as const };
}
```

- [ ] **Step 2: `get-paid-panel.tsx`** — a hand-rolled client panel: three provider cards, each showing status (Not connected / Connected · `accountId` / Action needed), a "Connect" link to `/api/connect/{provider}/start`, and a Disconnect button calling `disconnectProvider`. Use locked tokens, `.paper-card`, accent only on the connected pill. (Full JSX provided at implementation; mirror the existing `payment-form.tsx` style and the v1 portal's quiet aesthetic.)

- [ ] **Step 3: Render it in `page.tsx`** below the existing `<PaymentForm/>`, fetching `getConnectionStatuses()` server-side and passing as `initialStatuses`.

- [ ] **Step 4: Typecheck + lint + manual check**

Run: `npm run typecheck && npm run lint`
Manual: load `/dashboard/settings/payment` — three cards render, all "Not connected", no console errors.

- [ ] **Step 5: Commit**

```bash
git add src/actions/payments.ts "src/app/(dashboard)/dashboard/settings/payment"
git commit -m "feat(payments): Get-paid settings panel + connection status action"
```

---

## Phase 1 — Stripe Connect (Standard, OAuth) + platform fee

> Reference implementation. Phases 2–3 mirror this shape.

### Task 1.1: Stripe Connect config + OAuth start route

**Files:**
- Modify: `src/lib/sdk/stripe.ts` (add `getStripeConnectClientId()`, `isStripeConnectEnabled()`)
- Create: `src/app/api/connect/stripe/start/route.ts`

**Interfaces:**
- Consumes: `requireOrg()`, `signState()`, `getStripeConnectClientId()`.
- Produces: GET handler that 302-redirects to Stripe's OAuth authorize URL.

- [ ] **Step 1: Extend `src/lib/sdk/stripe.ts`**

```ts
export function isStripeConnectEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_CONNECT_CLIENT_ID);
}
export function getStripeConnectClientId() {
  const id = process.env.STRIPE_CONNECT_CLIENT_ID;
  if (!id) throw new Error("STRIPE_CONNECT_CLIENT_ID is not set");
  return id;
}
```

- [ ] **Step 2: Create `src/app/api/connect/stripe/start/route.ts`**

```ts
import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/orgContext";
import { signState } from "@/lib/payments/oauthState";
import { getStripeConnectClientId, isStripeConnectEnabled } from "@/lib/sdk/stripe";

export async function GET(req: Request) {
  if (!isStripeConnectEnabled()) {
    return NextResponse.redirect(new URL("/dashboard/settings/payment?connect=stripe_disabled", req.url));
  }
  const { organizationId } = await requireOrg();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getStripeConnectClientId(),
    scope: "read_write",
    redirect_uri: `${origin}/api/connect/stripe/callback`,
    state: signState({ organizationId, provider: "STRIPE" }),
    "stripe_user[business_type]": "company",
  });
  return NextResponse.redirect(`https://connect.stripe.com/oauth/authorize?${params.toString()}`);
}
```

- [ ] **Step 3: Typecheck + manual**

Run: `npm run typecheck`
Manual (with env set): click "Connect" on the Stripe card → lands on Stripe's OAuth consent screen showing the JobFlex platform name.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sdk/stripe.ts "src/app/api/connect/stripe/start/route.ts"
git commit -m "feat(payments): Stripe Connect OAuth start route"
```

### Task 1.2: Stripe OAuth callback (store acct_)

**Files:**
- Create: `src/app/api/connect/stripe/callback/route.ts`

**Interfaces:**
- Consumes: `verifyState()`, `getStripe()`, `upsertConnection()`.
- Produces: GET handler that exchanges `code` → `stripe_user_id`, upserts an ACTIVE connection, redirects to settings.

- [ ] **Step 1: Implement**

```ts
import { NextResponse } from "next/server";
import { getStripe } from "@/lib/sdk/stripe";
import { verifyState } from "@/lib/payments/oauthState";
import { upsertConnection } from "@/lib/payments/connections";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const settings = new URL("/dashboard/settings/payment", req.url);

  if (url.searchParams.get("error") || !code || !state) {
    settings.searchParams.set("connect", "stripe_error");
    return NextResponse.redirect(settings);
  }
  const verified = verifyState(state);
  if (!verified || verified.provider !== "STRIPE") {
    settings.searchParams.set("connect", "stripe_state");
    return NextResponse.redirect(settings);
  }

  const token = await getStripe().oauth.token({ grant_type: "authorization_code", code });
  const acct = token.stripe_user_id;
  if (!acct) {
    settings.searchParams.set("connect", "stripe_error");
    return NextResponse.redirect(settings);
  }

  // Pull live capability to set status accurately.
  const account = await getStripe().accounts.retrieve(acct);
  await upsertConnection(verified.organizationId, "STRIPE", {
    accountId: acct,
    merchantId: acct,
    status: account.charges_enabled ? "ACTIVE" : "RESTRICTED",
    chargesEnabled: Boolean(account.charges_enabled),
    scope: token.scope ?? "read_write",
    raw: JSON.stringify({ charges_enabled: account.charges_enabled, details_submitted: account.details_submitted }),
  });

  settings.searchParams.set("connect", "stripe_ok");
  return NextResponse.redirect(settings);
}
```

- [ ] **Step 2: Typecheck + manual**

Run: `npm run typecheck`
Manual: complete the Stripe OAuth consent → redirected back to `/dashboard/settings/payment?connect=stripe_ok`, the Stripe card now shows "Connected · acct_…".

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/connect/stripe/callback/route.ts"
git commit -m "feat(payments): Stripe Connect OAuth callback stores connected account"
```

### Task 1.3: Stripe Connect status webhook

**Files:**
- Create: `src/app/api/webhooks/stripe/connect/route.ts`

**Interfaces:**
- Consumes: `getStripe()`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `db`.
- Produces: POST handler verifying the Connect webhook signature, mirroring `account.updated` → connection `status`/`chargesEnabled`.

- [ ] **Step 1: Implement** (verify signature with `stripe.webhooks.constructEvent`, read the raw body, branch on `event.type === "account.updated"`, look up `PaymentConnection` by `accountId = event.account`, set `status = charges_enabled ? "ACTIVE" : "RESTRICTED"`). Return `200` quickly; `400` on signature failure.

- [ ] **Step 2: Manual via Stripe CLI**

Run: `stripe listen --forward-connect-to localhost:3000/api/webhooks/stripe/connect`
Then in the dashboard finish onboarding for the test connected account; expect the card status to flip to "Connected" without a re-login.

- [ ] **Step 3: Typecheck + commit**

```bash
git add "src/app/api/webhooks/stripe/connect/route.ts"
git commit -m "feat(payments): mirror Stripe Connect account status via webhook"
```

### Task 1.4: Route proposal checkout to the connected account + app fee

**Files:**
- Modify: `src/app/api/checkout/stripe/route.ts`

**Interfaces:**
- Consumes: `getActiveConnection()`, `computePlatformFeeCents()`, `getStripe()`.
- Produces: a Checkout Session created **on the connected account** (direct charge) with `application_fee_amount`.

- [ ] **Step 1: Rewrite the handler**

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStripe, isStripeEnabled } from "@/lib/sdk/stripe";
import { getActiveConnection } from "@/lib/payments/connections";
import { computePlatformFeeCents } from "@/lib/payments/fees";

export async function POST(req: Request) {
  if (!isStripeEnabled()) return NextResponse.json({ disabled: true });
  const { publicId, amount } = await req.json();

  const proposal = await db.proposal.findUnique({ where: { publicId } });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fail closed: must have a connected account, never charge the platform.
  const conn = await getActiveConnection(proposal.organizationId, "STRIPE");
  if (!conn?.accountId) {
    return NextResponse.json({ notConnected: true }, { status: 409 });
  }

  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await getStripe().checkout.sessions.create(
    {
      mode: "payment",
      line_items: [{
        price_data: {
          currency: proposal.currency.toLowerCase(),
          product_data: { name: proposal.title },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      payment_intent_data: { application_fee_amount: computePlatformFeeCents(amount) },
      success_url: `${origin}/portal/q/${publicId}?paid=1`,
      cancel_url: `${origin}/portal/q/${publicId}`,
      metadata: { proposalId: proposal.id, publicId },
    },
    { stripeAccount: conn.accountId }, // direct charge ON the contractor's account
  );
  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 2: Handle `notConnected` in `portal-actions.tsx`** — extend the `checkout()` branch: if `data?.notConnected`, `toast.info("Online payment isn't set up", "Ask the contractor to enable card payments.")`. (Mirrors the existing `data?.disabled` handling.)

- [ ] **Step 3: Typecheck + lint + manual end-to-end (Stripe test mode)**

Run: `npm run typecheck && npm run lint`
Manual: open a proposal portal whose org has a connected test account, click "Pay with Stripe", complete a test card; verify in the **connected account's** Stripe dashboard the payment shows with an application fee to the platform.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/checkout/stripe/route.ts" "src/app/(portal)/portal/q/[publicId]/portal-actions.tsx"
git commit -m "feat(payments): route proposal Stripe checkout to contractor account with platform fee"
```

### Task 1.5: Stripe disconnect

**Files:**
- Create: `src/app/api/connect/stripe/disconnect/route.ts` (or fold into `disconnectProvider` action by also calling Stripe `oauth.deauthorize`)

- [ ] **Step 1:** On disconnect, call `getStripe().oauth.deauthorize({ client_id, stripe_user_id })` then `deleteConnection(orgId, "STRIPE")`. Wire the panel's Disconnect button to it.
- [ ] **Step 2:** Typecheck + manual (disconnect → card returns to "Not connected"; the account no longer authorizes new charges).
- [ ] **Step 3:** Commit `feat(payments): Stripe disconnect (deauthorize + clear connection)`.

---

## Phase 2 — Square (OAuth) + app fee

> **Open this phase by fetching current docs** via context7 (`squareup/square` + OAuth/Payments) to confirm token-exchange endpoint, OAuth scopes (`PAYMENTS_WRITE`, `MERCHANT_PROFILE_READ`, `ORDERS_WRITE`), the `app_fee_money` seller-eligibility requirements, and webhook signature verification. Pin `SQUARE_ENV` (sandbox/production) base URLs.

### Task 2.1: Square SDK helper (`src/lib/sdk/square.ts`)
- `isSquareEnabled()`; `squareBase()` (env-gated host); `exchangeSquareCode(code)` → `{ access_token, refresh_token, merchant_id, expires_at }`; `revokeSquareToken(accessToken)`. Tokens are returned to callers for encryption (never logged).
- Verify: typecheck. Commit `feat(payments): Square OAuth/token SDK helper`.

### Task 2.2: Square connect start + callback
- `start/route.ts`: redirect to `https://connect.squareup.com/oauth2/authorize?client_id=...&scope=PAYMENTS_WRITE+ORDERS_WRITE+MERCHANT_PROFILE_READ&state=<signState>&session=false`.
- `callback/route.ts`: `verifyState` → `exchangeSquareCode` → encrypt access/refresh tokens (`encryptToken`) → fetch the seller's main location id → `upsertConnection(org,"SQUARE",{ accountId: merchant_id, merchantId, locationId, accessTokenEnc, refreshTokenEnc, tokenExpiresAt, status:"ACTIVE", chargesEnabled:true })`.
- Verify: complete sandbox OAuth → card shows "Connected · merchant_…". Commit.

### Task 2.3: Square checkout with `app_fee_money`
- Modify `src/app/api/checkout/square/route.ts`: load `getActiveConnection(org,"SQUARE")`; fail closed if none; decrypt access token; create a Payment Link / Checkout (`/v2/online-checkout/payment-links`) using the merchant's token with `quick_pay.price_money` and `payment_note`, and set `app_fee_money` = `computePlatformFeeCents(amount)` (Square requires the OAuth app + seller be fee-eligible). `success`/redirect back to the portal.
- Verify: sandbox buyer pays; confirm seller's Square dashboard shows the payment and the app fee. Commit.

### Task 2.4: Square webhook + disconnect
- `webhooks/square/route.ts`: verify `x-square-hmacsha256-signature` against `SQUARE_WEBHOOK_SIGNATURE_KEY`; handle `payment.updated` (idempotent) and `oauth.authorization.revoked` (→ set connection `REVOKED`).
- Disconnect: `revokeSquareToken` + `deleteConnection`.
- Verify: typecheck + lint + manual revoke. Commit.

---

## Phase 3 — PayPal (Commerce Platform) + platform fee

> **Open this phase by fetching current docs** via context7 (PayPal Partner Referrals + Orders v2 `platform_fees`) to confirm the onboarding-link generation, how the seller `merchant_id` is returned, the `PAYPAL_BN_Code`/`PayPal-Partner-Attribution-Id` header, and the `purchase_units[].payment_instruction.platform_fees` shape.

### Task 3.1: PayPal partner-onboarding helpers (`src/lib/sdk/paypal.ts`)
- Add `getPaypalAccessToken()` (client-credentials), `createPartnerReferral(orgId, returnUrl)` → onboarding action URL, `getMerchantIntegration(merchantId)` (status). Reuse existing PayPal env + the disabled pattern.
- Verify: typecheck. Commit.

### Task 3.2: PayPal connect start + callback (onboarding return)
- `start/route.ts`: `requireOrg` → `createPartnerReferral` with `state=signState` baked into the return URL → redirect to PayPal's onboarding `action_url`.
- `callback/route.ts`: read `merchantIdInPayPal` + `permissionsGranted`/`consentStatus` from the return query → `upsertConnection(org,"PAYPAL",{ accountId: merchantId, status: granted ? "ACTIVE" : "PENDING", chargesEnabled: granted })`.
- Verify: sandbox onboarding completes → card shows "Connected". Commit.

### Task 3.3: PayPal checkout with `payee.merchant_id` + `platform_fees`
- Modify `src/app/api/checkout/paypal/route.ts`: fail closed without an active connection; create an Order (`/v2/checkout/orders`) with `purchase_units[0].payee.merchant_id = conn.accountId`, `amount`, and `payment_instruction.platform_fees[0].amount` = `computePlatformFeeCents(amount)` (as decimal currency), plus the `PayPal-Partner-Attribution-Id` header. Return the approve link.
- Verify: sandbox buyer approves; confirm the seller account receives funds minus the platform fee. Commit.

### Task 3.4: PayPal webhook + disconnect
- Modify `webhooks/paypal/route.ts`: verify webhook signature; handle `MERCHANT.ONBOARDING.COMPLETED` / `MERCHANT.PARTNER-CONSENT.REVOKED` → update connection status.
- Disconnect: `deleteConnection` (+ revoke if API available).
- Verify: typecheck + lint. Commit.

---

## Phase 4 — Hardening + review

### Task 4.1: Env contract + docs
- [ ] Add every new key to `.env.example` (names only, with one-line comments). Commit `chore(payments): document payment-connect env keys`.

### Task 4.2: Portal "not connected" UX sweep
- [ ] Ensure the portal only shows a provider's pay button when that provider has an ACTIVE connection for the proposal's org (fetch statuses in the portal server component; pass enabled flags to `PortalActions`). This avoids dead buttons. Commit.

### Task 4.3: Security review (REQUIRED GATE)
- [ ] Run `/security-review` over the branch. Focus: tenant scoping on every connect/disconnect/checkout path; OAuth `state` verification; token encryption + no token logging; webhook signature verification for all three providers; fail-closed checkout; no platform-account fallback; idempotent webhook handling.
- [ ] Resolve all findings before opening a PR.

---

## Self-Review

**Spec coverage:** connect (Stripe OAuth, Square OAuth, PayPal onboarding) ✓; store connected account/tokens ✓ (Task 0.1–0.2, 1.2, 2.2, 3.2); route client payments to contractor ✓ (1.4, 2.3, 3.3); platform fee ✓ (`computePlatformFeeCents` used in 1.4/2.3/3.3); settings UI ✓ (0.5); webhooks/status ✓ (1.3, 2.4, 3.4); security ✓ (4.3); fail-closed ✓ (1.4 and mirrored). 

**Placeholder scan:** Phase 0 + Phase 1 carry full code. Phases 2–3 are specified at the task/endpoint level with an explicit doc-verification step opening each phase — appropriate because exact Square/PayPal request shapes must be confirmed against live API docs at implementation time (payment APIs drift); the implementer fetches them via context7 before coding, not from this plan's memory.

**Type consistency:** `ProviderId` ("STRIPE"|"SQUARE"|"PAYPAL") and `getActiveConnection`/`upsertConnection`/`computePlatformFeeCents`/`signState`/`verifyState`/`encryptToken` signatures are used consistently across all phases.

**Open risk to flag at execution:** Stripe is deprecating OAuth-for-Standard onboarding over time in favor of hosted onboarding + Account Links; if the Connect OAuth client is unavailable for the account, fall back to `accounts.create({type:"standard"})` + `accountLinks.create(...)` in Task 1.1–1.2 (same storage shape, different connect URL). Confirm at execution.
