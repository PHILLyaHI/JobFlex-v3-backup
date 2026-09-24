# API quick links in the admin (2026-09-24)

Owner: "in admin, where all the APIs are, add quick links to the API
website — in case we need to change the plan or add more credits, a quick
link instead of going to find the website."

- `lib/integrationLinks` (pure) holds two or three doors per service the
  console lists — the console, the billing or plan page, and the one other
  page an operator opens (keys, usage, webhooks, docs). Keyed by the
  integration key of `lib/sdk/integrations`; the health card's names
  (`email`, `square-app`, `gmail-oauth`) alias onto the same doors. Only
  public URLs; nothing reads a key or an account id. Every link answered
  when checked on 2026-09-24. SMTP and the internal checks (processor
  links, influencer payouts) have none.
- `components/v3/admin-integrations/integration-links.tsx` renders them:
  on every row of `/admin/integrations` at the end of the first line (a
  phone wraps them onto their own line), and under each service name on
  the overview's health card, first two only.
- Each opens a new tab (`rel="noopener noreferrer"`).
- Proof: `scripts/qa/integration-links.check.ts`; on the stand
  (`$SP/stock/links-walk.js`) the rows carry their doors at desk and phone
  width.
