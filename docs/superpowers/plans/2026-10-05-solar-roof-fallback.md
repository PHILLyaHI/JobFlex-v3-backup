# Google aerial roof fallback

Goal: restore useful roof estimates while EagleView roof-area access is unavailable, using the existing approved Google Solar API and transparent measurement provenance.

Architecture: add an explicit `solar` measurement source, a pure Google Building Insights estimator, a server action that authenticates/geocodes/validates/saves to the existing RoofMeasurement columns, and desktop/mobile controls. Preserve all legacy reconstruction restrictions. Use the existing numeric roof contract to feed pricing, with source-specific labels and unknown linear measurements left unknown. No schema migration or new dependency.

- [x] Implement strict Solar response parsing and conservative area/pitch calculation, building selection checks, imagery date and coverage warnings. Do not train or tune on saved EagleView targets.
- [x] Add authenticated server measurement action and explicit source/DTO support. No EagleView call is required for this path.
- [x] Integrate desktop/mobile aerial measurement and honest source/limitations in pricing and saved rows.
- [x] Read saved production measurements without writing, collect/cache approved Google responses, and report benchmark errors and exclusions. Keep customer data in ignored local files.
- [x] Review scientific assumptions and implementation; run typecheck/lint and focused algorithm checks; verify mobile at 390×844. Full typecheck passes after restoring SDK versions and regenerating stale route types.

Acceptance: new addresses can produce saved/priced estimates where Google has suitable data; missing/invalid/ambiguous data produces actionable errors; old measurements still load; Google results are never presented as EagleView or certified measurements. Benchmark is a small comparison against existing Property Data results, not proof of general accuracy.

Ruling: use the current checkout without creating a branch. The user's explicit request to build a replacement and approval of Google usage authorizes the necessary server action work; no database schema changes are needed. The follow-up request authorizes committing, pushing and deploying after restoring the single measurement action.

- [x] Restore one Measure this roof button, with Google as the server default and source details collapsed. Preserve estimated labels and a compact review gate.
- [x] Verify the Nashville example and three saved comparison roofs against Google DSM/mask data, without treating same-source agreement as surveyed accuracy.
- [x] Review typed provider-access fallback and refund logic; paid pending orders cannot trigger another provider purchase.
- [x] Verify the restored interface at 390×844 and desktop width; Nashville produces 2,932 sq ft and 4/12 through the generic action.

Review corrections: use actual sloped surface shares for mixed-pitch pricing; center every photo on the selected building; include coordinates in static-photo cache identity; retain requested pin separately for reuse; preserve safe rate-limit messages; retain a preliminary-source disclosure on converted proposals. Evidence and limitations: `docs/roof-solar-fallback.md`.
