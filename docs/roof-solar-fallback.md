# Google aerial roof estimates

The roof estimator keeps one **Measure this roof** action. The server uses Google while EagleView is unavailable. It uses the existing `GOOGLE_MAPS_API_KEY`; Google Solar must be enabled for that key. Usage is metered by Google and the existing JobFlex trial/rate limits. No database migration or new dependency is required.

`ROOF_MEASUREMENT_PROVIDER` defaults to `google`. After EagleView confirms roof-area entitlement, set it to `eagleview` and redeploy; the same action uses EagleView with Google as a fallback for explicit access/entitlement failures. Pending orders, trial limits, and database errors do not trigger another provider purchase. Source and imagery details remain available under Measurement details instead of a provider-selection UI.

The source is saved as `solar`, separate from EagleView and retired reconstruction records. The existing numeric takeoff contract is reused, but no EagleView order ID, facet count, measured linear footage, or classification is invented. The contractor must review the selected building and preliminary measurements before pricing. The result can be reopened from Recent. Same-address/same-pin results are reused within 24 hours.

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
