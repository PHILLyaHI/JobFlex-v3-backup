# From the homeowner's request to an estimate

*2026-09-21.* What happens between a homeowner typing a project and a
contractor pricing it, and where each piece lives.

## The homeowner's side

1. The homeowner types the project and answers a few clarifying questions
   (the wizards in `components/v3/homeowner-blueprint`, `mobile-homeowner`
   and `homeowner-landing`; the older form at `/homeowners`). The answers
   ride along in the description as "question answer" lines.
2. **The street address is required when the job is measured at the
   property** — a roof, a fence, siding, gutters, solar, a driveway, a deck,
   a patio cover, landscaping (`lib/leadRules` `needsAddressFor`). The
   contact step marks the field "needed to measure this job"; for anything
   else it says "(optional)". The wizards check the words *and* the answers
   (an answer can reveal a roof the first sentence did not), and the server
   applies the same rule: `submitHomeownerRequest` answers
   `{ ok: false, error }` instead of creating anything, and the wizard shows
   the sentence. The JSON route (`/api/homeowner-request`) says 400.
3. On submit, alongside trade detection and geocoding, the model writes the
   **scope of work a contractor prices from** (`lib/leadScope`
   `writeProfessionalScope`): 3–8 sentences in the third person — what
   exists, what is to be done, every size, count, material and condition
   the homeowner stated, then what must be confirmed on site. Nothing
   invented, no prices. It is stored on `PlatformLead.scope`; when the model
   is off or fails the request goes out with the homeowner's words only.

## The contractor's side

- **Leads page**: the table row and the offer card show the scope when there
  is one, else the description.
- **Accepting an offer** copies the scope onto the company's `Lead.scope`.
- **Lead page** (`/dashboard/leads/[id]`): "Scope of work" above "In the
  homeowner's words"; the job address, with a note when there is no street
  address yet; and **Estimate this job** — four buttons, the lead's own
  trade first and filled (`lib/leadRules` `estimatorFor`: Roofing → roof,
  Fencing → fence, HVAC → hvac, everything else → Smart Proposal). Roof and
  fence stay off until the lead has a street address.
- **The hand-off** (`actions/leadEstimate` → `lib/estimateSeed`): the button
  writes a ten-minute, httpOnly cookie with the lead id, the address, the
  state and the brief (scope, else description), then redirects. The
  estimator page reads a seed meant for it and this company only:
  - Roof estimator: the address is in the search field; press *Measure*.
  - Fence estimator: the address is in the search bar; *Find* is pressed for
    you when the browser map key is configured.
  - HVAC estimator: the address is in the field (a `?client=` address wins).
  - Smart Proposal: the scope is the brief, address and state are filled.
  Each page shows a "From the lead · name · address · Back to the lead" strip
  (`components/v3/estimate-seed-strip`), and mounting the strip spends the
  seed (`actions/estimateSeed`), so a reload or a later visit starts empty.

## Checks

- `scripts/qa/lead-scope.check.ts` — the rules, the paths, the seed round
  trip (pure, no model).
- Stand walk `lead-handoff.js` (scratchpad): lead → each estimator, the
  strip, the spent seed, the wizard's address rule.

## Not done

- The proposal made from a hand-off is not linked back to the lead (no
  status change to QUOTED). The seed carries the lead id, so that is the
  next step.
- The scope is not re-written when a contractor edits the lead.
