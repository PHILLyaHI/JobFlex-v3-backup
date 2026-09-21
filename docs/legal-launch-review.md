# JobFlex legal-page review — September 20, 2026

Prepared from the current source and primary public sources. This is an implementation inventory and legal-review brief, not a legal opinion or a certification of compliance across all states.

## Operator facts

- User supplied: Dmitiriy Apetenok; business name JobFlex; Washington, United States; intended nationwide U.S. offering and possible future Canada expansion.
- User suggested support@jobflex.app. Verify the spelling of the legal name, the business entity/DBA status, and that this mailbox receives and is monitored for requests before publication. No LLC or corporation status has been assumed.
- Expected production routes: https://jobflex.app/privacy and https://jobflex.app/terms. Local edits do not update production. Verify the deployed hostname and both public pages before entering them in Google Cloud.
- The pre-existing terms promised a full refund within 14 days of the first charge. That promise is preserved, not newly introduced. The operator must honor it or obtain advice about a prospective change and existing customers.

## Material issues to resolve before calling the site compliant

1. **Tracking choice is incomplete.** `src/app/layout.tsx` has an existing owner change disabling CookieBanner. The footer's Cookie settings button dispatches an event with no mounted manager. `src/components/providers/posthog-capture.tsx` starts capture when no choice exists. `src/lib/consent.ts` does not handle GPC or DNT. Restore working choices, gate optional tracking appropriately, and implement applicable opt-out signals. Do not treat the page's disclosure of limitations as a substitute for fixing them.
2. **Server advertising ignores a complete opt-out.** `src/lib/metaCapi.ts` includes hashed email/phone/external identifiers and can send without marketing consent; `metaSignupEvents.ts` and billing events reuse the choice saved at signup. Hashing is not anonymization. A browser opt-out does not cover all later server events. An enforceable suppression mechanism and request-handling process are needed. Assess whether Google sign-in identifiers reach these advertising events, as Google-data advertising restrictions need a separate provenance review.
3. **Gmail token storage and revocation need review.** The callback stores `JSON.stringify(tokens)` in `gmailTokensJson`; no application-level encryption occurs there. This does not establish whether the hosting database encrypts storage. Disconnect removes the token field but does not call Google's revocation endpoint; the policy accurately gives separate Google-account revocation instructions. Do not claim encryption of all tokens, automatic Google revocation, immediate backup deletion, or complete security without verification.
4. **Privacy operations must exist.** Document retention periods by data category, backup deletion, provider contracts, rights-request verification and response handling, appeals, incident response, and any legally required data-processing agreement. No automatic 24-month homeowner purge was established, so that old promise was removed. Email requests are a contact channel, not evidence of a working fulfillment process.
5. **Google connection disclosure.** Add a prominent privacy link and summary before Connect Gmail on desktop/mobile: send-only access; workspace-wide sending and configured automations; stored email/tokens; disconnect instructions. This batch changes the legal pages and signup links, not Gmail settings components. Google Cloud Branding must separately contain the public privacy/terms URLs. Verify Google's full requirements and actual implementation before asserting approval readiness.
6. **All-state operations.** Have U.S. counsel evaluate applicable state privacy thresholds and required notices/opt-out mechanisms, renewals/cancellation, communication consent, call-recording notices, proposal/contract requirements, and processor terms. Terms preserve mandatory rights instead of claiming Washington law overrides other states' protections. Existing voicemail code supports recordings and transcriptions; inspect actual greetings and consent before enabling recording across states.
7. **Canada is a future launch review.** These pages do not certify PIPEDA, provincial privacy law, Quebec requirements, CASL, or Canadian consumer-law compliance. Review consent, notices, processor arrangements, international processing, and language requirements before offering the service there.

## Verified Gmail behavior

- `src/lib/sdk/gmail.ts`: gmail.send and userinfo.email; offline access; connected email and access/refresh tokens. No inbox-reading or contacts scope.
- `src/app/api/integrations/gmail/callback/route.ts`: organization-bound connection, manager requirement, token storage.
- `src/actions/settings.ts`: disconnect clears tokens and connected-account label but preserves separately configured reply-to/settings.
- `src/lib/email/orgSend.ts`: organization-wide sending and fallback to Resend/SMTP after a failed or unavailable Gmail send.
- Call sites include invoices, payment reminders, follow-ups, review requests, client messages, inventory, and proposal notifications. Scope disclosure must not imply proposals are the only use.

## Name conflict: preliminary public search

An existing JobFLEX product advertises estimating and invoicing software specifically for contractors at https://www.job-flex.com/features/ and has a Google Play listing at https://play.google.com/store/apps/details?id=com.jobflex.android . This is substantial overlap in name and services. It is evidence of a potential conflict, not a determination of infringement, ownership priority, or a current federal registration.

Do not treat JobFlex as available or legally cleared. A trademark attorney should examine live/pending federal records, state records, common-law use, priority, related names, and Canada if expansion is planned. A domain registration or business-name registration is not clearance. Resolve the name before further brand investment or final Google branding verification. No trademark application was filed and no unrelated party was contacted.

## Primary references

- Google verification and privacy placement: https://support.google.com/cloud/answer/13464321?hl=en
- Google Workspace data and Limited Use rules: https://developers.google.com/workspace/workspace-api-user-data-developer-policy
- Google API Services User Data Policy: https://developers.google.com/terms/api-services-user-data-policy
- California privacy rights, applicability, notices and opt-out signals: https://oag.ca.gov/privacy/ccpa
- FTC: privacy promises must match practices: https://www.ftc.gov/business-guidance/privacy-security
- FTC retention and security: https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business
- FTC commercial email guidance: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- Washington breach-notice law: https://app.leg.wa.gov/rcw/default.aspx?cite=19.255
- Canadian meaningful consent: https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/principles/p_consent/
- USPTO comprehensive clearance search: https://www.uspto.gov/trademarks/search/comprehensive-clearance-search-similar-trademarks
- USPTO likelihood of confusion: https://www.uspto.gov/trademarks/search/likelihood-confusion
