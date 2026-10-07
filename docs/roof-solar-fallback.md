# Google aerial roof estimates

The roof estimator keeps one **Measure this roof** action. The server uses Google while EagleView is unavailable. It uses the existing `GOOGLE_MAPS_API_KEY`; Google Solar must be enabled for that key. Usage is metered by Google and the existing JobFlex trial/rate limits. No database migration or new dependency is required.

`ROOF_MEASUREMENT_PROVIDER` defaults to `eagleview` (since 2026-10-07, when roof-area orders were accepted again): the action uses EagleView with Google as a fallback for explicit access/entitlement failures. Set it to `google` and redeploy to measure with Google only. Pending orders, trial limits, and database errors do not trigger another provider purchase. Imagery and measurement details remain available under Measurement details; provider naming is omitted from that panel while stored provenance remains intact.

The source is saved as `solar`, separate from EagleView and retired reconstruction records. The existing numeric takeoff contract is reused, but no EagleView order ID, facet count, measured linear footage, or classification is invented. Valid estimates can be priced and converted immediately, without a review checkbox. Estimated labels and preliminary assumptions remain; missing pitch/area and pending paid-report checks still apply. The result can be reopened from Recent. Same-address/same-pin results are reused within 24 hours.

The report displays **Roof facets ≈N · estimated planes** from the accepted model's positive integer `segmentCount`, including previously saved Solar estimates. This is a display estimate, not a verified architectural count: the stored measured `facetCount` and pricing fact remain null for Solar. Missing or malformed counts display unavailable. No additional lookup, AI call, migration, or measurement charge is needed to reopen the counter.

## Calculation and limits

Google's roof surface area already includes slope. The estimator uses `wholeRoofStats.areaMeters2 × buildingStats.groundAreaMeters2 / wholeRoofStats.groundAreaMeters2`, following the [Solar schema guidance](https://developers.google.com/maps/documentation/solar/reference/rest/v1/buildingInsights/findClosest). This extrapolates the modeled average slope into unmodeled areas. It is not an independent elevation measurement or an accuracy guarantee.

The estimator requires HIGH imagery, valid roof segments, 85–105% modeled footprint coverage, consistent segment/whole-roof totals, and a selected building close to the requested pin. Pitch families use actual sloped segment areas for pricing shares. Unknown values stay unknown. Old imagery and partial modeling are disclosed. The satellite display can use imagery from a different date than Solar's measurements. Detached buildings are not automatically added.

## Initial comparison — 2026-10-06

Compared 37 distinct saved roof pins against fresh Google Solar Building Insights, without using EagleView targets to fit the formula. These saved EagleView Property Data figures are comparison references, not independent surveyed ground truth.

| Outcome | Count |
|---|---:|
| Google HIGH data returned | 33 |
| No HIGH coverage | 4 |
| Passed the estimator's checks | 27 |
| Refused for location mismatch | 3 |
| Refused for insufficient modeled coverage | 2 |
| Refused for unsupported steep segment | 1 |

For 24 accepted results whose Google center lay inside the saved main-building EagleView outline: median absolute area difference **6.65%**, mean **9.30%**, 14/24 within 10%, 21/24 within 20%, largest difference **25.23%**. A center inside an outline is a limited identity check, not proof that both sources cover the same roof sections.

The other three accepted results had no saved outline to verify identity. Their signed area differences were **−55.90%, +3508.33%, and −37.23%**. They remain unresolved; they are not silently removed as bad EagleView data. Across all 27 accepted results, median absolute difference was **9.55%**, mean **141.65%**. The large outliers mean this fallback must remain a reviewed preliminary estimate, not an automatic replacement for a verified material-order measurement.

Pitch comparison on the same 24 outline-matched roofs: 17 exact predominant-pitch matches, 21 within one rise-per-12 unit, largest difference three units. This compares Google-derived predominant surface pitch to EagleView's published pitch, not a survey.

Customer-level benchmark inputs and results are retained only in ignored `.cache/roof-fallback/`. No API keys or customer benchmark records are included in the source changes.

## Raster consistency check — 2026-10-06

The user-supplied Nashville example displayed 2,932 sq ft at 4/12. A fresh Building Insights request reproduces **2,931.799 sq ft**: `246.48232 m² × 256.48 / 232.10 × 10.7639104167`. The raw modeled roof is 2,653.114 sq ft; 90.494% footprint coverage leads to a 1.105041 adjustment. The full footprint is 2,760.728 sq ft. The modeled pitch families contain both 4/12 and 5/12 surfaces; 4/12 is the largest family, not a claim that every surface has that pitch.

A separate diagnostic downloaded Google's 0.1 m DSM and building mask, used the raster's WGS84 UTM projection to locate the returned building, and flood-filled only its connected mask component. It contains exactly 256.48 m² of mask pixels, agreeing with Google's full-building footprint. The component is fully inside the raster; neighboring detached masks were excluded. No bounding-box area was substituted for the roof footprint.

Least-squares planes were fit to fully interior samples using 1 m, 2 m, and 3 m windows. Fits with median height residual over 0.06096 m or extreme slopes were excluded. Each window size's mean accepted slope factor was applied to the mask footprint. This gives **2,915–2,917 sq ft** and a predominant **4/12** for the Nashville example, approximately 0.50–0.57% below Building Insights. Building Insights dates its imagery to 2024-03-17; the raster response dates it to 2024-03-10. Source dates can differ and are approximate.

The same diagnostic was run on all three requested saved Washington benchmarks, including the largest area discrepancy in the outline-matched comparison set:

| Case | Building Insights sq ft | DSM sensitivity range sq ft | Saved EagleView sq ft | Google / DSM / EagleView predominant pitch |
|---|---:|---:|---:|---|
| Nashville example | 2,932 | 2,915–2,917 | Unavailable | 4 / 4 / unavailable |
| Washington benchmark A | 2,481 | 2,387–2,425 | 2,216 | 6 / 6 / 6 |
| Washington benchmark B | 4,822 | 4,763–4,788 | 4,198 | 6 / 6 / 4 |
| Washington benchmark C | 2,913 | 2,894–2,916 | 2,326 | 7 / 7 / 6 |

These are **same-source consistency checks**, not independent accuracy validation. In all four cases, the isolated mask area exactly matches the full-building ground-area statistic, so the footprint evidence is shared. Clean interior plane fits also omit edges, ridges, obstructions, and rejected cells; extrapolating their slope distribution is itself an assumption. The reported ranges describe sensitivity to sample-window size, not confidence intervals. The selected Washington results still differ from EagleView by +11.94%, +14.86%, and +25.23%; two disagree on predominant pitch. One benchmark's Google source dates are more than 12 years old. This evidence supports the calculation and the selected mask, but cannot certify present-day roof dimensions, included roof sections, or material-order accuracy. No independent measured roof area is available for the Nashville example.

## Verification

- Pure numeric/parser checks: missing values, units, no double slope factor, coverage boundaries, wrong building, incompatible totals, stale imagery, explicit zero pitch/azimuth, and mixed-pitch surface weighting passed.
- Focused ESLint and diff whitespace checks passed.
- Browser at actual 390×844: measured a house using Google, saved it, reopened it from Recent, verified the review gate, built 27 editable lines, and converted to a draft in QA Co on the development database. No horizontal overflow. The resulting draft includes the preliminary-measurement disclosure in its client preview; no message was sent.
- Full TypeScript check passed after regenerating stale route types and restoring the installed Stripe/Blob SDK versions to the lockfile. Package manifests and the lockfile were not changed.
- The restored single-button UI was checked at 390×844 and 1440px. The Nashville example produced 2,932 sq ft and 4/12 through the generic action. Measurement details start collapsed, expand correctly, and the mobile review/disclosure targets are at least 44px with no horizontal overflow.
- Typed provider-access fallback/refund checks passed nine cases, including pending order IDs containing 401/403, polling failures and ambiguous errors. These cannot trigger a second provider lookup.
- No schema migration is required. Benchmark database reads were read-only; local interaction checks used the development QA organization. Production compilation and release status are recorded in the Vercel deployment for this commit.

## Direct-pricing follow-up — 2026-10-06

At the owner's request, removed provider naming from Measurement details and removed the Solar-only confirmation checkbox and pricing/conversion gate. Stored source metadata, map attribution, estimated quantity labels, preliminary assumptions, and existing missing-data/pending-report checks remain.

Verified at 390×844 that a saved Solar result immediately prices, builds 25 lines, and converts to a development QA draft without confirmation. Measurement details contains no provider name; no horizontal overflow. At 1440px, package pricing and Smart Estimate generation are enabled. Focused ESLint, full TypeScript, and diff checks passed.

## Facet counter comparison — 2026-10-06

Matched the selected main structure (including nonzero main-structure indices) to the existing 24 accepted, outline-matched benchmark roofs. Two lacked an EagleView facet value, leaving 22 comparable counts. Google's detected segment count matched EagleView on 4/22 roofs; 13/22 differed by at most one and 16/22 by at most two. Mean absolute difference was 1.77 facets; the largest difference was six. These are agreement statistics, not measured accuracy. The stored EagleView Property Data facet confidence scores ranged from 0.2312 to 0.6205; these references are not independently verified architectural reports.

Also ran the existing DSM plane reconstruction against the four cached, isolated building rasters, using minimum plane areas of 6, 12, and 24 sq ft. Counts changed from 11/6/4 for Nashville (Google 5, no EagleView reference), 11/10/8 for benchmark A (Google 8, EagleView 8), 15/12/9 for B (Google 8, EagleView 9), and 16/11/8 for C (Google 10, EagleView 10). The reconstructed mask areas agreed with the previously isolated building masks, but the facet counts were sensitive to the noise threshold. No reconstruction threshold was fitted to those targets or shipped as an accuracy improvement.

The counter therefore uses the existing validated segment count with an approximation sign and explicit estimated label. A visual AI recount was not deployed: there is no independently labeled evaluation proving it improves these counts, and imagery can obscure small surfaces. At the owner's request, Measurement details now shows only its data rows; the explanatory paragraphs and model warnings are omitted from that panel. Diagnostics remain in stored provenance, and the approximation sign and estimated labels remain visible. Customer-level comparison and diagnostic results remain in ignored `.cache/roof-fallback/`.
