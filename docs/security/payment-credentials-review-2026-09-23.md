# Payment credential security review — 2026-09-23

Scope: JobFlex Settings payment credentials, Stripe/Square OAuth transitions, credential encryption, SDK lifetime, and payment error handling. This was a source review with synthetic checks, not a live penetration test or an audit of every application route or production system.

## Findings addressed

- **Provider errors could disclose sensitive request data.** The existing helpers copied arbitrary Stripe/Square/Stax error text to the UI and several logs. They now return fixed messages based on HTTP status. Stripe's Accounts Read permission identifier produces actionable text without copying the provider's response, key, or dashboard URL. Payment webhook failures also redact messages before logging, database storage, and responses.
- **Switching from an API key to OAuth retained stale credentials.** A Stripe connection could show a new account while still using the previous account's key. OAuth updates now clear the old key and webhook fields. Square OAuth updates also replace the authentication mode and clear old personal-token webhook credentials. Old manual webhook endpoints no longer authenticate against that connection after the transition.
- **Submitted Stripe keys accumulated in a global SDK cache.** Contractor keys now create request-scoped clients. The separate platform cache is bounded to two clients.
- **Manual credential validation had no attempt limit.** Stripe, Square, and Stax now share limits of ten attempts per ten minutes for both the user and organization, after owner authorization. This uses the existing database-backed limiter, whose shared layer deliberately fails open during database failures; the per-process limit still applies.
- **OAuth state signing could fall back to an empty secret.** Signing now rejects missing configuration; verification rejects missing configuration, malformed envelopes, incorrectly typed fields, and expired states.
- **Encrypted envelopes accepted shortened GCM authentication tags.** Decryption now requires the expected four-part envelope, 12-byte IV, and full 16-byte authentication tag. This is hardening against manipulated stored ciphertext, not evidence of an unauthenticated route to the database.
- **Sensitive modules had no explicit client-import guard.** Encryption, OAuth state, and the server Stripe SDK now import server-only.
- **Stripe key setup instructions omitted Accounts Read.** Settings now recommends a restricted key and lists that permission.

## Existing protections reviewed

Connection actions authorize the current organization owner on the server. Key input has length validation. Stored credentials and webhook secrets use AES-256-GCM encryption with random IVs. Settings data returns explicit status/last-four summaries instead of encrypted or plaintext credentials. API-key form inputs are masked; dashboard recordings are disabled and inputs masked in the analytics configuration. Stripe webhook paths verify signatures and scope payment processing to the connection's organization.

## Stripe setup

For a contractor pasting their own key into JobFlex, create or edit a restricted key and explicitly grant:

| Permission | Access |
| --- | --- |
| Accounts | Read |
| Checkout Sessions | Write |
| Webhook Endpoints | Write |
| PaymentIntents | Read |
| Charges | Read |
| Refunds | Read |

An rk_ key is restricted; leaving custom permissions unchecked does not make it an unrestricted sk_ key. For the third-party website name/URL fields, use JobFlex and https://www.jobflex.app. That website field is separate from an OAuth callback URL. The platform's own Stripe key belongs in server environment configuration; users connecting through OAuth do not paste their keys.

References: [Stripe restricted keys](https://docs.stripe.com/keys/restricted-api-keys), [Stripe key types](https://docs.stripe.com/keys), [Stripe Connect OAuth](https://docs.stripe.com/connect/oauth-standard-accounts).

## Validation

- Ten synthetic checks exercised authenticated encryption (including a reproduction of truncated-tag acceptance in the previous implementation), provider-error redaction, OAuth fail-closed behavior, client caching, owner and rate-limit gates, Stripe/Square OAuth replacement, and webhook error handling.
- Three additional synthetic checks covered safe Accounts Read guidance, successful encrypted Stripe credential storage with both rate-limit scopes, and updated Settings instructions. No real provider keys, payment requests, or database writes were used.
- Full TypeScript check passed against the latest schema using an isolated generated Prisma client.
- Targeted ESLint passed for all changed TypeScript files.
- A real browser at 390×844 rejected an invalid Stripe OAuth callback with the badstate result and redirected to login.
- Repository-wide ESLint reported 415 pre-existing findings (316 errors, 99 warnings) outside these changes.

No database migration, secret rotation, or production account configuration is included. Actual restricted-key connection, webhook registration, and payment/refund synchronization still require a Stripe test account. Source review cannot guarantee that an application is unhackable or establish whether a prior compromise occurred.
