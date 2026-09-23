# Meta lead imports

Implemented flow: JobFlex owner/manager connects Facebook, explicitly selects one Page for their workspace, then clicks **Import leads**. Import reads available Instant Form submissions across that Page's forms. It does not run ads, change campaigns, send prospect messages, or automatically import via webhooks. A Page can be connected to one JobFlex workspace at a time. Instagram lead ads are covered when their Instant Form submissions belong to the selected Facebook Page; this is not an Instagram messaging integration.

## Meta app configuration

1. In Meta for Developers, select the correct app. Find **App ID** under **App settings → Basic** (some dashboards label this **Settings → Basic**). The Google project number is unrelated to Meta.
2. Add/configure **Facebook Login for Business**, then open **Configurations**. Create a configuration requesting a **User access token**. This implementation exchanges a user token for a long-lived token and lists `/me/accounts`; a Business Integration System User token configuration is not supported.
3. Configure Page access and these permissions: `pages_show_list`, `pages_read_engagement`, `leads_retrieval`, `pages_manage_ads`, `ads_management`. Meta's Lead Ads documentation lists these for lead retrieval. The code checks grants and only reads Page/form/lead data; the ad permissions do not cause it to create or edit ads. Do not add unrelated scopes. The manual import does not require `pages_manage_metadata` or a `leadgen` webhook subscription.
4. Copy the resulting **Configuration ID**. Set the exact production Valid OAuth Redirect URI to `https://www.jobflex.app/api/integrations/meta/callback`. Use the same value in the server environment; apex and www hosts must not differ.
5. Set the deauthorization callback to `https://www.jobflex.app/api/integrations/meta/deauthorize`.
6. Set the privacy URL to `https://www.jobflex.app/privacy`, terms URL to `https://www.jobflex.app/terms`, and user-data deletion **instructions URL** to `https://www.jobflex.app/privacy#meta-leads`. The latter describes the actual email-based request process; it is not an automated deletion callback.

## Server configuration

Add these in `.env.local` for local development, and Vercel → project → Settings → Environment Variables for Production when ready to deploy. Do not paste secrets into chat, browser code, screenshots, or Git.

```dotenv
META_APP_ID="your Meta App ID"
META_APP_SECRET="your Meta App Secret"
META_LOGIN_CONFIG_ID="your User-token Configuration ID"
META_REDIRECT_URI="https://www.jobflex.app/api/integrations/meta/callback"
META_GRAPH_VERSION="v25.0"
META_LEADS_TEST_USERS="your-jobflex-login@example.com,friends-jobflex-login@example.com"
META_LEADS_PUBLIC=""
```

`TOKEN_ENCRYPTION_KEY` must also be set to the existing 32-byte base64 encryption key. Do not replace an existing key: doing so prevents decryption of Gmail/payment credentials. The Meta App Secret is separate from the Meta Pixel / Conversions API token. Do not reuse the Google OAuth client ID or project number.

For local testing, register a separate callback URI allowed by Meta for your test setup and set `META_REDIRECT_URI` to that exact URI. Changing environment variables requires restarting the development server or redeploying Vercel. Credentials are never required for a compile or mocked check; they are required for real OAuth.

## First real test

1. Use the real Facebook account with permission to the business Page and its lead data. If that is your friend, have your friend authorize personally. Do not share passwords or create fake personal accounts. Your Meta App Administrator role alone does not grant access to another person's Page.
2. In the app's **App roles**, use **Add People** and select **Tester** for your friend's account. Have them accept the invitation. If testing with the app administrator's own Page, an additional tester account is unnecessary.
3. Confirm the account has Page and lead access. Where customized Leads Access is enabled in Meta Business settings, the person and JobFlex's CRM integration must have access to the Page's leads. If a Page is missing, revisit the permissions/assets selected during authorization.
4. Sign into the JobFlex workspace that is authorized to receive those leads as owner/manager. Its login email must be in `META_LEADS_TEST_USERS` while public access is off.
5. Settings → Integrations → Meta → **Connect Meta Business account**. Complete Facebook authorization, then **Connect selected Page**. Connection verification reads the Page's forms before marking it connected.
6. In Development mode, use a lead submitted by an account with a role in this same Meta app. Existing customer submissions may not be retrievable yet. Use Meta's [Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing/) with the actual Page and form. The tool only allows one test lead on a form at a time; remove an earlier test lead there before creating another. Follow the available form preview controls when a submission must be made as the role-bearing user.
7. In JobFlex click **Import leads**. The button reads forms/leads in small batches and displays imported/already-imported counts. Check the Leads screen for the test prospect with source Facebook. Click Import leads again and verify no duplicate is created.
8. Pause/resume an import, and test Disconnect. Disconnect removes the Page token and pending import state; imported leads remain. Revoking JobFlex in Facebook Business Integrations also clears the connection when Meta delivers the signed deauthorization request.

Until this sequence is observed with real credentials, do not describe Meta integration as verified end-to-end. Public customers outside app roles need the applicable Meta App Review / advanced permission access and business verification. Keep `META_LEADS_PUBLIC` unset until those requirements and the actual production test are complete.

## Storage and operations

- No Prisma schema migration is required. Namespaced `SyncState` records hold encrypted pending authorizations, a Page-to-workspace ownership record with an encrypted Page token, and import cursors. Pending selection expires after 15 minutes; daily cleanup purges expired pending credentials.
- `Organization.metaSettingsJson` stores the selected Page reference and display information, never the token. Settings responses expose only Page IDs/names and connection/import status.
- `WebhookEvent` entries under provider `META_LEADS` are import receipts, keyed by workspace plus Meta lead ID. Together with deterministic lead IDs and transactional writes, they prevent duplicate imports and re-importing a lead deleted locally. They do not contain form answers.
- Imports are manager-only, enforce the existing lead limit, and use a persisted lease to prevent concurrent imports. A crashed batch can be retried after the two-minute lease expires. Cursors advance in the same transaction as successful inserts.
- The connection is rechecked inside each batch transaction; a disconnected or deleted workspace cannot accept later batches.
- Disconnect does not call a broad app-permission deletion endpoint that could affect other Pages authorized by the same Facebook user. The UI links to Facebook Business Integrations for provider-side revocation.

## Official sources checked

- [Facebook Login for Business](https://developers.facebook.com/docs/facebook-login/facebook-login-for-business/): configuration ID, User versus System User tokens.
- [Manual Facebook login flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/): server code exchange and state validation.
- [Lead Ads overview](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/): review and development-mode role restrictions.
- [Retrieving leads](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving/): permissions and bulk reads.
- [Testing and troubleshooting](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/testing-troubleshooting/): test lead creation and Page access requirements.

Meta's dashboard menus vary by app type/use case. If the configuration menu is missing, inspect that app's actual dashboard before prescribing different button names.
