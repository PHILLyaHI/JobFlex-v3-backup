# U.S. city construction location factors: residential remodeling and small sitework

Prepared 2026-09-18 for JobFlex. National average = 1.00. 306 cities in all 50 states plus DC.

## Methodology

Each factor is the total installed cost of labor-heavy residential remodeling or small civil/sitework in that city (material, labor and equipment, including the contractor's labor burden and markup, excluding sales tax) relative to the U.S. average = 1.00. A national price × the factor = the local price. The factor comes from public federal wage data plus a published material index: **factor = 0.60 × labor + 0.40 × materials**. Labor is the metro's construction wage relative to the U.S. (BLS OEWS, May 2025), adjusted by county inside large metros (BLS QCEW 2025). Materials is the Craftsman ZIP3 material factor (2023-2026 editions). The 0.60 weight reproduces how the RSMeans Residential 2024 location factors respond to local wages. Everything is put on one scale, the employment-weighted U.S. average. The published cross-check indices (RSMeans Residential 2024, HUD 2024 TDC, DoD FY26 ACF, Craftsman totals) keep their own bases, so they are compared by regression rather than read one-to-one. Limits: treat each factor as about ±5%. There is one number per county inside a metro. Wage data understate union-dominated cores and overstate towns where one industrial employer dominates construction; both are adjusted or flagged below. Material-heavy trades (HVAC equipment, fence material) should move less than the factor and labor-only work more.

### Details

- **Labor index (L).** The BLS OEWS May 2025 mean hourly wage for all construction occupations (SOC 47-0000) in the city's metro area (2023 OMB delineation), divided by the U.S. mean of $31.42. The series come from the BLS Public Data API: `OEUM00<CBSA>000000470000003` for metros and `OEUN000000000000047000003` for the U.S. Nonmetro capitals (Juneau, Hilo, Frankfort, Augusta, Helena, Concord, Pierre, Montpelier, Rutland, Minot, Laramie) use the state series `OEUS<FIPS>00000000000470000003`.
- **County adjustment.** In multi-county metros, L is multiplied by √(county ÷ metro) of the 2025 average weekly wage of private specialty trade contractors (BLS QCEW, NAICS 238), capped at ±7%. The square root damps it because crews cross county lines. Nonmetro capitals are scaled against the state instead. Counties with under 500 NAICS 238 jobs are not adjusted.
- **Material index (M).** Craftsman Book Co. "Area Modification Factors", material column, for the city's 3-digit ZIP. The publisher's free previews print different pages each year, so each row uses the newest edition that prints it: 2026 for most states, 2024 or 2023 for parts of the Northeast and Midwest. Rows were mapped to states by ZIP prefix, not by page layout.
- **Why 0.60 labor.** Regressing the RSMeans Residential 2024 factors on the OEWS wage ratio across 68 cities gives factor = 0.360 + 0.601 × wage ratio (r = 0.87). Remodeling and small sitework are at least as labor-heavy as the new-home work RSMeans prices.
- **Agreement with the published indices.** The composite correlates with RSMeans Residential 2024 at r = 0.90 (65 cities), HUD 2024 TDC at 0.87 (203), DoD FY26 ACF at 0.86 (61, excluding AK/HI and remote sites), and Craftsman 2025/26 totals at 0.72 (306; that series is noisy, with rows moving up to ±13 points a year). The main systematic difference is Washington. RSMeans-based sources put Seattle-area work only 4-13% above national, while WA construction wages run 26% (state) to 34% (Seattle metro) above the U.S. The composite follows the wages.
- **Bases of the cross-check columns in the Note field.** "RSMeans res." is the published RSMeans factor; its 30-city base sits about 4% above this table's scale, so a city with U.S.-average wages reads about 0.96 there. "HUD" is the 2024 detached-house housing construction cost (3 BR) ÷ the mean of 413 U.S. localities. "DoD" is the Area Cost Factor (96 base cities = 1.00; its AK/HI values include military logistics and are not comparable). "Craftsman" is its all-in total factor, based on the average of its ZIP3 data points.
- **Rows set by rule rather than the plain formula.** (1) *Site-mix rule*: in Tri-Cities/Kennewick/Richland/Pasco (Hanford) and Bremerton (naval shipyard), OEWS includes non-residential site trades. The metro is instead placed within WA by the average of its OEWS wage and its QCEW specialty-contractor pay: 1.17 becomes 1.13, and 1.14 becomes 1.09. (2) *South Snohomish* (Lynnwood, Edmonds, Mill Creek; ZIP 980xx on the King line): labor uses the midpoint of the King and Snohomish county adjustments. (3) *Manhattan*: the metro-wide wage understates building-access, insurance and union-building costs. The value is the median of the formula (1.22) and four Manhattan-specific indices rebased to this scale (RSMeans res. (Long Island City 1.279) 1.29, HUD (New York 1.38) 1.27, DoD (New York City 1.31) 1.20, Craftsman (100-102, 1.32) 1.33), which gives 1.27.
- **If JobFlex's national anchors are RSMeans national averages** (a 30-city base) rather than all-U.S. averages, multiply these factors by about 0.96.
- **How to read the Note column.** "L" = labor index (metro wage × county adjustment), "M" = material index, "checks" = published indices on their own bases.

**Washington at a glance:** Seattle and every King County city 1.25; Lynnwood, Edmonds and Mill Creek 1.21; Everett and Marysville 1.16; Tacoma, Puyallup and Lakewood 1.16; Bellingham 1.16; Tri-Cities 1.13; Olympia 1.13; Wenatchee 1.12; Vancouver 1.11; Bremerton 1.09; Spokane 1.06; Yakima 1.04.

## City factors

| City | State | Factor | Source (year) | Note |
|---|---|---:|---|---|
| Seattle | WA | 1.25 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.40 (metro 1.34 x county 1.05), M 1.03; checks: HUD 1.11, Craftsman 1.13; RSMeans-based sources run lower (also RSMeans res. Tacoma 1.04); WA construction wages are 1.26-1.34x U.S., so labor-heavy work lands higher |
| Bellevue | WA | 1.25 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.40 (metro 1.34 x county 1.05), M 1.03; checks: Craftsman 1.13 |
| Kirkland | WA | 1.25 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.40 (metro 1.34 x county 1.05), M 1.03; checks: Craftsman 1.13 |
| Redmond | WA | 1.25 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.40 (metro 1.34 x county 1.05), M 1.03; checks: Craftsman 1.13 |
| Bothell | WA | 1.25 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.40 (metro 1.34 x county 1.05), M 1.03; checks: Craftsman 1.13; city straddles King/Snohomish; King figure used |
| Renton | WA | 1.25 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.40 (metro 1.34 x county 1.05), M 1.03; checks: Craftsman 1.13 |
| Kent | WA | 1.25 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.40 (metro 1.34 x county 1.05), M 1.03; checks: Craftsman 1.13 |
| Auburn | WA | 1.25 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.40 (metro 1.34 x county 1.05), M 1.03; checks: Craftsman 1.13 |
| Federal Way | WA | 1.25 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.40 (metro 1.34 x county 1.05), M 1.03; checks: Craftsman 1.13 |
| Issaquah | WA | 1.25 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.40 (metro 1.34 x county 1.05), M 1.03; checks: Craftsman 1.13 |
| Sammamish | WA | 1.25 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.40 (metro 1.34 x county 1.05), M 1.03; checks: Craftsman 1.13 |
| Mercer Island | WA | 1.25 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.40 (metro 1.34 x county 1.05), M 1.03; checks: Craftsman 1.13 |
| Shoreline | WA | 1.25 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.40 (metro 1.34 x county 1.05), M 1.03; checks: Craftsman 1.13; ZIP 981xx; King County |
| Lynnwood | WA | 1.21 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | interpolated: Snohomish County but ZIP 980xx on the King line, so labor uses the midpoint of the King (1.05) and Snohomish (0.93) county adjustments; L 1.33 (metro 1.34 x county 0.99), M 1.03; checks: Craftsman 1.13 |
| Edmonds | WA | 1.21 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | interpolated: Snohomish County but ZIP 980xx on the King line, so labor uses the midpoint of the King (1.05) and Snohomish (0.93) county adjustments; L 1.33 (metro 1.34 x county 0.99), M 1.03; checks: Craftsman 1.13 |
| Mill Creek | WA | 1.21 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | interpolated: Snohomish County but ZIP 980xx on the King line, so labor uses the midpoint of the King (1.05) and Snohomish (0.93) county adjustments; L 1.33 (metro 1.34 x county 0.99), M 1.03; checks: Craftsman 1.13 |
| Everett | WA | 1.16 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.25 (metro 1.34 x county 0.93), M 1.02; checks: HUD 1.11, Craftsman 1.04; Snohomish County adjustment (0.93); Craftsman ZIP 982 +4% |
| Marysville | WA | 1.16 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.25 (metro 1.34 x county 0.93), M 1.02; checks: Craftsman 1.04 |
| Tacoma | WA | 1.16 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.25 (metro 1.34 x county 0.94), M 1.02; checks: RSMeans res. 1.04, HUD 1.10, DoD 1.13, Craftsman 1.03; Pierce County adjustment (0.94); DoD Tacoma 1.13, JBLM 1.15 |
| Puyallup | WA | 1.16 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.25 (metro 1.34 x county 0.94), M 1.02; checks: Craftsman 1.03 |
| Lakewood | WA | 1.16 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.25 (metro 1.34 x county 0.94), M 1.02; checks: Craftsman 1.03 |
| Olympia | WA | 1.13 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.20, M 1.02; checks: HUD 1.10, Craftsman 1.01; own metro (Olympia-Lacey-Tumwater) |
| Bremerton | WA | 1.09 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | site-mix rule: formula gave 1.14; OEWS here includes naval-shipyard trades, so the metro is placed within WA by the average of its OEWS wage and QCEW specialty-contractor pay; L 1.14, M 1.02; checks: Craftsman 1.03 |
| Spokane | WA | 1.06 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.10 (metro 1.10 x county 1.00), M 1.00; checks: HUD 1.00, DoD 1.07, Craftsman 0.97; DoD Spokane 1.07 / Fairchild 1.09 |
| Vancouver | WA | 1.11 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.17 (metro 1.26 x county 0.93), M 1.02; checks: HUD 1.02, Craftsman 1.01; Portland metro wage x Clark County adjustment (0.93) |
| Bellingham | WA | 1.16 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.25, M 1.02; checks: Craftsman 1.04; Whatcom refinery work lifts trade wages; treat as upper bound |
| Yakima | WA | 1.04 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.07, M 1.00; checks: HUD 1.01, DoD 1.06, Craftsman 0.93; carpenters alone 1.17x U.S. (above the all-trades mean) |
| Tri-Cities | WA | 1.13 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | site-mix rule: formula gave 1.17; OEWS here includes Hanford site trades, so the metro is placed within WA by the average of its OEWS wage and QCEW specialty-contractor pay; L 1.22, M 1.00; checks: Craftsman 1.01 |
| Kennewick | WA | 1.13 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | site-mix rule: formula gave 1.17; OEWS here includes Hanford site trades, so the metro is placed within WA by the average of its OEWS wage and QCEW specialty-contractor pay; L 1.22, M 1.00; checks: Craftsman 1.01 |
| Richland | WA | 1.13 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | site-mix rule: formula gave 1.17; OEWS here includes Hanford site trades, so the metro is placed within WA by the average of its OEWS wage and QCEW specialty-contractor pay; L 1.22, M 1.00; checks: Craftsman 1.01 |
| Pasco | WA | 1.12 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | site-mix rule: formula gave 1.15; OEWS here includes Hanford site trades, so the metro is placed within WA by the average of its OEWS wage and QCEW specialty-contractor pay; L 1.19, M 1.00; checks: Craftsman 1.01 |
| Wenatchee | WA | 1.12 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.19 (metro 1.14 x county 1.04), M 1.01; checks: HUD 0.99, Craftsman 0.97; small metro; noisy wage sample |
| Anchorage | AK | 1.19 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.22 (metro 1.19 x county 1.03), M 1.16; checks: HUD 1.16, DoD 2.26, Craftsman 1.21; materials +16% (freight); DoD 2.26 is a military-logistics factor, not comparable |
| Fairbanks | AK | 1.24 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.29, M 1.16; checks: RSMeans res. 1.16, HUD 1.18, DoD 2.30, Craftsman 1.23; materials +16%; carpenters 1.38x U.S. |
| Juneau | AK | 1.22 | OEWS 2025 (state), QCEW 2025, Craftsman 2026 | L 1.24, M 1.18; checks: HUD 1.20, Craftsman 1.12; nonmetro: Alaska state wage; materials +18% (barge freight) |
| Birmingham | AL | 0.90 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.85 (metro 0.84 x county 1.02), M 0.97; checks: RSMeans res. 0.89, HUD 0.88, Craftsman 1.06 |
| Huntsville | AL | 0.89 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.82 (metro 0.80 x county 1.02), M 1.01; checks: HUD 0.89, DoD 0.89, Craftsman 1.03 |
| Mobile | AL | 0.88 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.80, M 0.99; checks: RSMeans res. 0.87, HUD 0.88, DoD 0.84, Craftsman 0.99 |
| Montgomery | AL | 0.86 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.77 (metro 0.76 x county 1.02), M 0.99; checks: HUD 0.87, DoD 0.87, Craftsman 0.99 |
| Little Rock | AR | 0.85 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.76 (metro 0.74 x county 1.03), M 0.99; checks: RSMeans res. 0.85, HUD 0.91, DoD 0.84, Craftsman 0.98 |
| Fayetteville | AR | 0.88 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.79 (metro 0.79 x county 1.01), M 1.00; checks: HUD 0.89, Craftsman 0.96 |
| Bentonville | AR | 0.87 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.79 (metro 0.79 x county 1.00), M 1.00; checks: Craftsman 0.96 |
| Fort Smith | AR | 0.83 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.72 (metro 0.71 x county 1.01), M 0.99; checks: HUD 0.87, Craftsman 0.93 |
| Phoenix | AZ | 0.97 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.94 (metro 0.94 x county 1.00), M 1.01; checks: RSMeans res. 0.91, HUD 0.92, DoD 0.90, Craftsman 1.05 |
| Scottsdale | AZ | 0.97 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.94 (metro 0.94 x county 1.00), M 1.01; checks: Craftsman 1.05 |
| Mesa | AZ | 0.97 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.94 (metro 0.94 x county 1.00), M 1.01; checks: Craftsman 1.05 |
| Tucson | AZ | 0.91 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.85, M 1.00; checks: RSMeans res. 0.88, HUD 0.88, DoD 0.88, Craftsman 0.95 |
| Flagstaff | AZ | 0.94 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.89, M 1.02; checks: HUD 0.92, Craftsman 0.92 |
| Los Angeles | CA | 1.10 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.15 (metro 1.18 x county 0.97), M 1.03; checks: RSMeans res. 1.12, HUD 1.14, Craftsman 1.08 |
| Long Beach | CA | 1.10 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.15 (metro 1.18 x county 0.97), M 1.03; checks: Craftsman 1.09 |
| Santa Monica | CA | 1.10 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.15 (metro 1.18 x county 0.97), M 1.03; checks: Craftsman 1.08 |
| Anaheim | CA | 1.14 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.22 (metro 1.18 x county 1.03), M 1.03; checks: Craftsman 1.12 |
| Irvine | CA | 1.14 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.22 (metro 1.18 x county 1.03), M 1.03; checks: Craftsman 1.13 |
| Riverside | CA | 1.05 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.07 (metro 1.10 x county 0.97), M 1.01; checks: RSMeans res. 1.10, HUD 1.11, Craftsman 1.03 |
| San Bernardino | CA | 1.09 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.15 (metro 1.10 x county 1.04), M 1.00; checks: HUD 1.09, Craftsman 1.02 |
| San Diego | CA | 1.11 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.16, M 1.03; checks: RSMeans res. 1.10, HUD 1.12, Craftsman 1.06 |
| San Francisco | CA | 1.30 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.48 (metro 1.39 x county 1.06), M 1.03; checks: RSMeans res. 1.26, HUD 1.33, Craftsman 1.26 |
| Oakland | CA | 1.26 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.42 (metro 1.39 x county 1.02), M 1.03; checks: Craftsman 1.17 |
| Walnut Creek | CA | 1.20 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.31 (metro 1.39 x county 0.95), M 1.03; checks: DoD 1.30, Craftsman 1.17; affluent suburb: Contra Costa adjustment (0.95); high-end jobs often price at the Oakland factor (1.26) |
| San Mateo | CA | 1.23 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.36 (metro 1.39 x county 0.98), M 1.04; checks: HUD 1.28, Craftsman 1.19 |
| Palo Alto | CA | 1.29 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.45 (metro 1.45 x county 1.01), M 1.04; checks: Craftsman 1.19; San Jose metro; Craftsman ZIP 943 |
| San Jose | CA | 1.28 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.45 (metro 1.45 x county 1.01), M 1.03; checks: HUD 1.28, Craftsman 1.29; Santa Clara specialty-contractor pay is the highest in the U.S. (data-center work) |
| Santa Rosa | CA | 1.16 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.24, M 1.03; checks: HUD 1.19, Craftsman 1.06 |
| Sacramento | CA | 1.11 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.17 (metro 1.16 x county 1.01), M 1.01; checks: HUD 1.17, Craftsman 1.06 |
| Fresno | CA | 1.06 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.10 (metro 1.10 x county 1.00), M 1.00; checks: HUD 1.18, Craftsman 1.00 |
| Bakersfield | CA | 1.06 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.10, M 1.00; checks: HUD 1.14, Craftsman 0.98 |
| Stockton | CA | 1.07 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.10, M 1.02; checks: HUD 1.15, Craftsman 1.03 |
| Oxnard | CA | 1.08 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.12, M 1.03; checks: Craftsman 1.02 |
| Santa Barbara | CA | 1.06 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.09, M 1.03; checks: HUD 1.15, Craftsman 1.03 |
| Salinas | CA | 1.09 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.12, M 1.03; checks: HUD 1.15, Craftsman 1.02 |
| Denver | CO | 1.06 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.08 (metro 1.05 x county 1.03), M 1.03; checks: RSMeans res. 0.92, HUD 0.98, Craftsman 1.09; DoD Denver 1.06 |
| Aurora | CO | 1.04 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.04 (metro 1.05 x county 0.99), M 1.03; checks: Craftsman 1.08 |
| Lakewood | CO | 1.04 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.05 (metro 1.05 x county 1.00), M 1.03; checks: Craftsman 1.09 |
| Boulder | CO | 1.03 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.02, M 1.03; checks: RSMeans res. 0.87, HUD 0.95, Craftsman 1.05; RSMeans res. 0.87 looks low against Boulder wages |
| Colorado Springs | CO | 0.98 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.95 (metro 0.94 x county 1.00), M 1.02; checks: RSMeans res. 0.88, HUD 0.94, Craftsman 1.00 |
| Fort Collins | CO | 0.99 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.96, M 1.03; checks: HUD 0.95, Craftsman 1.02 |
| Pueblo | CO | 0.96 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.94, M 0.99; checks: HUD 0.92, Craftsman 0.95 |
| Hartford | CT | 1.08 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.14 (metro 1.13 x county 1.00), M 1.00; checks: HUD 1.14, Craftsman 1.05 |
| Bridgeport | CT | 1.09 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.16 (metro 1.14 x county 1.02), M 1.00; checks: HUD 1.13, Craftsman 1.06 |
| Stamford | CT | 1.09 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.13 (metro 1.14 x county 0.99), M 1.04; checks: HUD 1.18, Craftsman 1.11 |
| Greenwich | CT | 1.09 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.13 (metro 1.14 x county 0.99), M 1.04; checks: Craftsman 1.11 |
| New Haven | CT | 1.08 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.12, M 1.01; checks: RSMeans res. 1.06, HUD 1.10, Craftsman 1.04 |
| Washington | DC | 1.05 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.06 (metro 1.04 x county 1.02), M 1.02; checks: RSMeans res. 0.98, HUD 1.01, DoD 1.04, Craftsman 1.12; DoD Fort McNair 1.04 |
| Wilmington | DE | 1.03 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.04 (metro 1.11 x county 0.94), M 1.00; checks: HUD 1.08, DoD 1.10, Craftsman 1.03 |
| Dover | DE | 0.94 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.90, M 1.01; checks: RSMeans res. 1.05, HUD 1.06, DoD 1.08, Craftsman 0.97; RSMeans res. 1.05 looks high against Dover wages |
| Miami | FL | 0.92 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.86 (metro 0.89 x county 0.96), M 1.02; checks: RSMeans res. 0.89, HUD 0.94, Craftsman 0.98; Miami-Dade adjustment (0.96) |
| Fort Lauderdale | FL | 0.96 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.91 (metro 0.89 x county 1.03), M 1.03; checks: Craftsman 1.02 |
| West Palm Beach | FL | 0.94 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.90 (metro 0.89 x county 1.01), M 1.01; checks: Craftsman 1.01 |
| Boca Raton | FL | 0.94 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.90 (metro 0.89 x county 1.01), M 1.01; checks: Craftsman 1.01 |
| Tampa | FL | 0.92 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.87 (metro 0.85 x county 1.03), M 0.99; checks: RSMeans res. 0.88, HUD 0.93, Craftsman 1.00 |
| St. Petersburg | FL | 0.91 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.85 (metro 0.85 x county 1.00), M 1.00; checks: Craftsman 0.95 |
| Orlando | FL | 0.91 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.85 (metro 0.84 x county 1.01), M 1.00; checks: RSMeans res. 0.89, HUD 0.94, Craftsman 1.00 |
| Jacksonville | FL | 0.92 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.87 (metro 0.85 x county 1.02), M 0.99; checks: HUD 0.93, DoD 0.96, Craftsman 1.00 |
| Tallahassee | FL | 0.88 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.80 (metro 0.79 x county 1.01), M 1.00; checks: HUD 0.92, Craftsman 0.93 |
| Sarasota | FL | 0.91 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.86 (metro 0.85 x county 1.00), M 1.00; checks: HUD 0.94, Craftsman 0.95 |
| Fort Myers | FL | 0.89 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.82, M 1.00; checks: RSMeans res. 0.87, HUD 0.90, Craftsman 0.94 |
| Naples | FL | 0.94 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.89, M 1.03; checks: Craftsman 0.97 |
| Pensacola | FL | 0.89 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.82 (metro 0.81 x county 1.02), M 0.99; checks: HUD 0.89, Craftsman 0.93 |
| Atlanta | GA | 0.97 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.93 (metro 0.90 x county 1.04), M 1.03; checks: RSMeans res. 0.91, HUD 0.95, DoD 0.85, Craftsman 1.17; carpenters alone 13% below the all-trades mean; Craftsman 1.17 is an outlier |
| Marietta | GA | 0.97 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.94 (metro 0.90 x county 1.04), M 1.01; checks: Craftsman 1.07 |
| Lawrenceville | GA | 0.94 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.90 (metro 0.90 x county 1.00), M 1.01; checks: Craftsman 1.07 |
| Savannah | GA | 0.91 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.86 (metro 0.85 x county 1.01), M 0.99; checks: HUD 0.90, DoD 0.87, Craftsman 0.99 |
| Augusta | GA | 0.90 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.85 (metro 0.85 x county 0.99), M 0.98; checks: HUD 0.87, DoD 0.90, Craftsman 0.94 |
| Columbus | GA | 0.85 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.76 (metro 0.75 x county 1.02), M 0.99; checks: HUD 0.87, DoD 0.93, Craftsman 0.96 |
| Honolulu | HI | 1.25 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.30, M 1.17; checks: RSMeans res. 1.22, DoD 2.03, Craftsman 1.20; materials +17% (ocean freight); excludes 4.5% GET; DoD 2.03 not comparable |
| Kahului | HI | 1.27 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.33, M 1.17; checks: Craftsman 1.18; Maui: wages lifted by post-2023 Lahaina rebuild; volatile; Craftsman HI average used for materials |
| Hilo | HI | 1.24 | OEWS 2025 (state), QCEW 2025, Craftsman 2026 | L 1.29, M 1.17; checks: HUD 1.38, Craftsman 1.17; nonmetro: Hawaii state wage x Hawaii County adjustment |
| Des Moines | IA | 1.01 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.02 (metro 1.00 x county 1.02), M 0.98; checks: RSMeans res. 0.96, HUD 0.98, DoD 0.96, Craftsman 1.02 |
| Cedar Rapids | IA | 0.98 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.97 (metro 0.96 x county 1.01), M 1.00; checks: HUD 0.97, Craftsman 1.00 |
| Davenport | IA | 1.04 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.07 (metro 1.05 x county 1.02), M 0.99; checks: HUD 1.04, Craftsman 1.05 |
| Boise | ID | 0.97 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.95 (metro 0.91 x county 1.04), M 1.01; checks: RSMeans res. 0.94, HUD 1.00, DoD 0.98, Craftsman 1.01 |
| Meridian | ID | 0.97 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.95 (metro 0.91 x county 1.04), M 1.00; checks: Craftsman 0.94 |
| Idaho Falls | ID | 0.97 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.95 (metro 0.94 x county 1.01), M 0.99; checks: HUD 0.97, Craftsman 0.92 |
| Pocatello | ID | 0.92 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.87, M 0.99; checks: HUD 0.96, Craftsman 0.89 |
| Coeur d'Alene | ID | 0.96 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.93, M 1.00; checks: Craftsman 0.93 |
| Chicago | IL | 1.20 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.32 (metro 1.30 x county 1.01), M 1.02; checks: RSMeans res. 1.17, HUD 1.24, Craftsman 1.21; RSMeans res. 1.17 |
| Naperville | IL | 1.22 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.35 (metro 1.30 x county 1.04), M 1.02; checks: Craftsman 1.17 |
| Aurora | IL | 1.17 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.27 (metro 1.30 x county 0.97), M 1.02; checks: Craftsman 1.17 |
| Joliet | IL | 1.18 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.30 (metro 1.30 x county 1.00), M 1.00; checks: HUD 1.22, Craftsman 1.17 |
| Springfield | IL | 1.09 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.16 (metro 1.16 x county 1.00), M 0.98; checks: HUD 1.06, Craftsman 0.98 |
| Rockford | IL | 1.12 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.21 (metro 1.19 x county 1.02), M 0.98; checks: HUD 1.15, Craftsman 1.04 |
| Peoria | IL | 1.11 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.19 (metro 1.17 x county 1.02), M 0.99; checks: HUD 1.07, Craftsman 1.08 |
| Indianapolis | IN | 1.02 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.04 (metro 1.03 x county 1.02), M 0.99; checks: RSMeans res. 0.92, HUD 0.98, DoD 0.93, Craftsman 1.05 |
| Carmel | IN | 1.01 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.03 (metro 1.03 x county 1.00), M 0.99; checks: Craftsman 1.05 |
| Fort Wayne | IN | 0.99 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.01 (metro 1.00 x county 1.01), M 0.97; checks: HUD 0.98, Craftsman 1.01 |
| Evansville | IN | 1.00 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.02 (metro 1.01 x county 1.01), M 0.98; checks: HUD 0.96, Craftsman 0.98 |
| South Bend | IN | 0.99 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.01 (metro 1.01 x county 1.01), M 0.96; checks: HUD 0.99, Craftsman 0.98 |
| Wichita | KS | 0.92 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.89 (metro 0.88 x county 1.01), M 0.98; checks: RSMeans res. 0.87, HUD 0.92, DoD 0.88, Craftsman 0.95 |
| Overland Park | KS | 1.05 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.09 (metro 1.07 x county 1.02), M 1.00; checks: Craftsman 1.06 |
| Kansas City | KS | 1.06 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.10 (metro 1.07 x county 1.03), M 1.00; checks: HUD 1.05, Craftsman 1.06 |
| Topeka | KS | 0.94 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.92 (metro 0.91 x county 1.02), M 0.97; checks: HUD 0.96, Craftsman 0.96 |
| Louisville | KY | 0.98 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.97 (metro 0.94 x county 1.03), M 0.99; checks: RSMeans res. 0.91, HUD 0.95, DoD 0.86, Craftsman 1.01 |
| Lexington | KY | 0.94 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.90 (metro 0.89 x county 1.01), M 1.01; checks: HUD 0.95, DoD 0.88, Craftsman 1.03 |
| Bowling Green | KY | 0.90 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.83 (metro 0.83 x county 1.01), M 1.00; checks: HUD 0.94, Craftsman 0.97 |
| Frankfort | KY | 0.90 | OEWS 2025 (state), QCEW 2025, Craftsman 2023 | L 0.82 (state 0.89 x county 0.93), M 1.01; checks: HUD 0.95, Craftsman 0.93; nonmetro: Kentucky state wage x Franklin County adjustment |
| New Orleans | LA | 0.96 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.93 (metro 0.87 x county 1.07), M 1.00; checks: HUD 0.94, DoD 0.96, Craftsman 1.09 |
| Metairie | LA | 0.88 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.80 (metro 0.87 x county 0.93), M 1.00; checks: Craftsman 1.09; affluent suburb: the county adjustment follows where trade firms are based; high-end jobs here often price at the New Orleans factor (0.96) |
| Baton Rouge | LA | 0.95 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.91 (metro 0.89 x county 1.02), M 1.00; checks: RSMeans res. 0.88, HUD 0.91, Craftsman 1.15 |
| Shreveport | LA | 0.90 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.84 (metro 0.83 x county 1.02), M 0.98; checks: HUD 0.90, Craftsman 0.94 |
| Lafayette | LA | 0.90 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.83 (metro 0.81 x county 1.02), M 1.00; checks: HUD 0.92, Craftsman 1.04 |
| Boston | MA | 1.22 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.35 (metro 1.27 x county 1.06), M 1.03; checks: RSMeans res. 1.12, HUD 1.23, DoD 1.23, Craftsman 1.29; RSMeans res. 1.12, DoD 1.23 |
| Cambridge | MA | 1.18 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.27 (metro 1.27 x county 1.00), M 1.03; checks: Craftsman 1.29 |
| Newton | MA | 1.18 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.27 (metro 1.27 x county 1.00), M 1.03; checks: DoD 1.21, Craftsman 1.20 |
| Brookline | MA | 1.21 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.33 (metro 1.27 x county 1.05), M 1.03; checks: Craftsman 1.20 |
| Lowell | MA | 1.17 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.27 (metro 1.27 x county 1.00), M 1.02; checks: HUD 1.15, Craftsman 1.16 |
| Worcester | MA | 1.11 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.17, M 1.01; checks: HUD 1.12, Craftsman 1.10 |
| Springfield | MA | 1.09 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.15, M 0.99; checks: HUD 1.12, DoD 1.13, Craftsman 1.06 |
| Baltimore | MD | 0.98 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.97 (metro 0.97 x county 1.00), M 0.99; checks: RSMeans res. 0.96, HUD 0.97, Craftsman 1.04 |
| Annapolis | MD | 1.01 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.99 (metro 0.97 x county 1.02), M 1.04; checks: Craftsman 1.07 |
| Bethesda | MD | 1.01 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.99 (metro 1.04 x county 0.95), M 1.03; checks: Craftsman 1.10; DC metro wage x Montgomery County adjustment (0.95); affluent-suburb pricing may run higher |
| Silver Spring | MD | 1.01 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.99 (metro 1.04 x county 0.95), M 1.03; checks: Craftsman 1.10; DC metro wage x Montgomery County adjustment (0.95) |
| Frederick | MD | 1.00 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.99 (metro 1.04 x county 0.95), M 1.01; checks: Craftsman 1.03; DC metro wage x Frederick County adjustment |
| Portland | ME | 1.03 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.03 (metro 1.00 x county 1.03), M 1.02; checks: RSMeans res. 0.97, HUD 1.00, Craftsman 1.04 |
| Bangor | ME | 0.92 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.87, M 0.99; checks: HUD 0.96, Craftsman 0.98 |
| Lewiston | ME | 0.96 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.95, M 0.99; checks: HUD 1.01, Craftsman 0.97 |
| Augusta | ME | 0.96 | OEWS 2025 (state), QCEW 2025, Craftsman 2023 | L 0.93 (state 0.96 x county 0.97), M 0.99; checks: HUD 1.02, Craftsman 0.99; nonmetro: Maine state wage x Kennebec County adjustment |
| Detroit | MI | 1.04 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.07 (metro 1.05 x county 1.01), M 1.00; checks: HUD 1.07, DoD 1.04, Craftsman 1.08 |
| Ann Arbor | MI | 1.04 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.06, M 1.00; checks: RSMeans res. 0.97, Craftsman 1.08 |
| Grand Rapids | MI | 0.98 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.98 (metro 0.96 x county 1.02), M 0.98; checks: HUD 0.97, Craftsman 1.05 |
| Lansing | MI | 1.00 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.01 (metro 1.01 x county 1.00), M 0.99; checks: HUD 0.98, Craftsman 1.03 |
| Minneapolis | MN | 1.15 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.24 (metro 1.20 x county 1.03), M 1.01; checks: RSMeans res. 1.07, HUD 1.14, DoD 1.13, Craftsman 1.12; RSMeans res. 1.07, DoD 1.13 |
| St. Paul | MN | 1.17 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.28 (metro 1.20 x county 1.07), M 1.01; checks: Craftsman 1.13 |
| Eagan | MN | 1.12 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.20 (metro 1.20 x county 1.00), M 1.01; checks: Craftsman 1.13 |
| Rochester | MN | 1.09 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.16 (metro 1.14 x county 1.02), M 1.00; checks: HUD 1.08, Craftsman 1.00; Mayo campus construction lifts trade wages |
| Duluth | MN | 1.05 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.09 (metro 1.09 x county 0.99), M 0.98; checks: HUD 1.07, DoD 1.09, Craftsman 1.01 |
| Kansas City | MO | 1.05 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.10 (metro 1.07 x county 1.03), M 0.98; checks: HUD 1.06, Craftsman 1.08 |
| St. Louis | MO | 1.12 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.21 (metro 1.13 x county 1.07), M 0.98; checks: Craftsman 1.08 |
| Springfield | MO | 0.97 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.96 (metro 0.94 x county 1.02), M 0.98; checks: RSMeans res. 0.90, HUD 0.96, Craftsman 0.92 |
| Jefferson City | MO | 1.01 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.00 (metro 0.99 x county 1.02), M 1.01; checks: HUD 0.97, Craftsman 0.96 |
| Jackson | MS | 0.85 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.77 (metro 0.79 x county 0.98), M 0.97; checks: HUD 0.90, Craftsman 1.04 |
| Gulfport | MS | 0.88 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.82 (metro 0.85 x county 0.97), M 0.98; checks: HUD 0.89, DoD 0.84, Craftsman 1.02 |
| Hattiesburg | MS | 0.85 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.76 (metro 0.74 x county 1.03), M 0.97; checks: Craftsman 1.03 |
| Billings | MT | 1.00 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.01 (metro 1.00 x county 1.01), M 1.00; checks: RSMeans res. 0.92, HUD 0.95, Craftsman 0.98 |
| Missoula | MT | 0.98 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.96 (metro 0.96 x county 1.00), M 1.01; checks: HUD 0.94, Craftsman 0.95 |
| Bozeman | MT | 1.03 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.04, M 1.01; checks: Craftsman 1.04 |
| Great Falls | MT | 0.97 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.96, M 0.99; checks: HUD 0.95, Craftsman 0.96 |
| Helena | MT | 0.98 | OEWS 2025 (state), QCEW 2025, Craftsman 2024 | L 0.97 (state 0.97 x county 0.99), M 1.00; checks: HUD 0.94, Craftsman 0.95; nonmetro: Montana state wage x Lewis and Clark County adjustment |
| Charlotte | NC | 0.94 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.90 (metro 0.88 x county 1.03), M 1.01; checks: RSMeans res. 0.89, HUD 0.97, Craftsman 1.08 |
| Raleigh | NC | 0.95 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.90 (metro 0.88 x county 1.02), M 1.03; checks: RSMeans res. 0.85, HUD 0.97, Craftsman 1.10 |
| Durham | NC | 0.94 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.89 (metro 0.88 x county 1.02), M 1.02; checks: HUD 0.98, Craftsman 1.06 |
| Greensboro | NC | 0.91 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.84 (metro 0.83 x county 1.01), M 1.01; checks: HUD 0.96, Craftsman 1.01 |
| Winston-Salem | NC | 0.89 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.82 (metro 0.80 x county 1.02), M 1.00; checks: HUD 0.94, Craftsman 0.99 |
| Asheville | NC | 0.90 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.83 (metro 0.82 x county 1.00), M 1.01; checks: HUD 0.97, Craftsman 0.96 |
| Wilmington | NC | 0.90 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.83 (metro 0.83 x county 1.01), M 1.01; checks: HUD 0.94, Craftsman 0.97 |
| Fargo | ND | 1.00 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.99 (metro 0.98 x county 1.01), M 1.00; checks: RSMeans res. 0.90, HUD 0.95, Craftsman 1.02 |
| Bismarck | ND | 0.97 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.96 (metro 0.97 x county 0.99), M 0.99; checks: HUD 0.98, Craftsman 0.99; energy-sector mix; carpenters alone 11% lower |
| Grand Forks | ND | 0.98 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.97 (metro 0.96 x county 1.01), M 1.00; checks: HUD 0.96, Craftsman 0.97 |
| Minot | ND | 0.98 | OEWS 2025 (state), QCEW 2025, Craftsman 2023 | L 0.97 (state 1.02 x county 0.95), M 0.99; checks: HUD 0.95, Craftsman 0.98; nonmetro: North Dakota state wage (energy-influenced) x Ward County adjustment |
| Omaha | NE | 0.96 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.94 (metro 0.94 x county 1.00), M 0.99; checks: RSMeans res. 0.92, HUD 0.94, Craftsman 1.01 |
| Lincoln | NE | 0.93 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.88 (metro 0.88 x county 1.00), M 1.00; checks: HUD 0.92, Craftsman 0.97 |
| Grand Island | NE | 0.89 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.81 (metro 0.81 x county 1.00), M 1.00; checks: HUD 0.94, Craftsman 0.94 |
| Manchester | NH | 0.99 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.98, M 1.00; checks: HUD 1.01, Craftsman 1.01 |
| Nashua | NH | 0.99 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.98, M 1.01; checks: HUD 1.08, Craftsman 1.06 |
| Concord | NH | 0.98 | OEWS 2025 (state), QCEW 2025, Craftsman 2024 | L 0.97 (state 0.98 x county 0.99), M 1.00; checks: HUD 0.99, Craftsman 1.01; nonmetro: New Hampshire state wage x Merrimack County adjustment |
| Portsmouth | NH | 1.11 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.18 (metro 1.27 x county 0.93), M 1.01; checks: RSMeans res. 0.95, HUD 1.02, Craftsman 1.06; Boston metro wage x Rockingham County adjustment; RSMeans res. 0.95 |
| Newark | NJ | 1.16 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.26, M 1.01; checks: HUD 1.25, Craftsman 1.08 |
| Jersey City | NJ | 1.18 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.30 (metro 1.26 x county 1.03), M 1.01; checks: RSMeans res. 1.11, HUD 1.21, Craftsman 1.08 |
| Hackensack | NJ | 1.15 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.23 (metro 1.26 x county 0.98), M 1.03; checks: Craftsman 1.09 |
| Morristown | NJ | 1.17 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.27 (metro 1.26 x county 1.01), M 1.03; checks: Craftsman 1.14 |
| Edison | NJ | 1.19 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.31 (metro 1.26 x county 1.04), M 1.01; checks: Craftsman 1.11 |
| Toms River | NJ | 1.11 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.17 (metro 1.26 x county 0.93), M 1.02; checks: Craftsman 1.02 |
| Trenton | NJ | 1.13 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.24, M 0.97; checks: HUD 1.20, Craftsman 1.10 |
| Cherry Hill | NJ | 1.05 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.10 (metro 1.11 x county 1.00), M 0.98; checks: Craftsman 1.02 |
| Albuquerque | NM | 0.91 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.84 (metro 0.85 x county 0.99), M 1.02; checks: RSMeans res. 0.90, HUD 0.90, Craftsman 0.98 |
| Santa Fe | NM | 0.90 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.82, M 1.03; checks: HUD 0.92, Craftsman 0.93 |
| Las Cruces | NM | 0.86 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.78, M 0.99; checks: HUD 0.90, Craftsman 0.91 |
| Las Vegas | NV | 1.03 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.04, M 1.02; checks: RSMeans res. 1.07, HUD 1.06, Craftsman 1.04; union-heavy market; RSMeans res. 1.07 |
| Henderson | NV | 1.03 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.04, M 1.02; checks: Craftsman 1.04 |
| Reno | NV | 1.02 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.03 (metro 1.03 x county 0.99), M 1.02; checks: HUD 0.99, Craftsman 1.02 |
| Carson City | NV | 1.06 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.09, M 1.02; checks: HUD 0.99, Craftsman 1.00 |
| New York | NY | 1.27 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023, HUD 2024, DoD FY26, RSMeans res. 2024 | adjusted: the formula (1.22) uses the metro-wide wage, which understates Manhattan building-access, insurance and union-building costs; set to the median of the formula and four Manhattan-specific indices rebased to this scale (RSMeans res. (Long Island City 1.279) 1.29, HUD (New York 1.38) 1.27, DoD (New York City 1.31) 1.20, Craftsman (100-102, 1.32) 1.33) |
| Manhattan | NY | 1.27 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023, HUD 2024, DoD FY26, RSMeans res. 2024 | adjusted: the formula (1.22) uses the metro-wide wage, which understates Manhattan building-access, insurance and union-building costs; set to the median of the formula and four Manhattan-specific indices rebased to this scale (RSMeans res. (Long Island City 1.279) 1.29, HUD (New York 1.38) 1.27, DoD (New York City 1.31) 1.20, Craftsman (100-102, 1.32) 1.33) |
| Brooklyn | NY | 1.11 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.17 (metro 1.26 x county 0.93), M 1.03; checks: HUD 1.37, Craftsman 1.04; sources split: HUD 1.37 (RSMeans union basis) vs Craftsman 1.04; brownstone restoration prices above this |
| Queens | NY | 1.20 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.31 (metro 1.26 x county 1.04), M 1.04; checks: HUD 1.35, Craftsman 1.13; RSMeans res. Long Island City 1.28 |
| Bronx | NY | 1.17 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.27 (metro 1.26 x county 1.01), M 1.02; checks: HUD 1.36, Craftsman 1.09 |
| Staten Island | NY | 1.16 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.24 (metro 1.26 x county 0.99), M 1.03; checks: HUD 1.30, Craftsman 1.07 |
| Hempstead | NY | 1.18 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.28 (metro 1.26 x county 1.02), M 1.03; checks: Craftsman 1.12 |
| Huntington | NY | 1.15 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.24 (metro 1.26 x county 0.98), M 1.02; checks: Craftsman 1.08 |
| White Plains | NY | 1.16 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.25 (metro 1.26 x county 0.99), M 1.03; checks: Craftsman 1.10 |
| Buffalo | NY | 1.02 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.06 (metro 1.04 x county 1.02), M 0.96; checks: HUD 1.11, Craftsman 1.00 |
| Rochester | NY | 1.00 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.01 (metro 1.03 x county 0.98), M 0.97; checks: HUD 1.07, Craftsman 1.03 |
| Syracuse | NY | 1.03 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.06 (metro 1.05 x county 1.01), M 0.97; checks: RSMeans res. 0.99, HUD 1.07, Craftsman 1.04 |
| Albany | NY | 1.07 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.12 (metro 1.08 x county 1.04), M 0.99; checks: HUD 1.08, Craftsman 1.09 |
| Columbus | OH | 1.05 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.08 (metro 1.07 x county 1.02), M 0.99; checks: RSMeans res. 0.93, HUD 1.00, Craftsman 1.06 |
| Cleveland | OH | 1.03 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.06 (metro 1.02 x county 1.04), M 0.97; checks: HUD 1.02, Craftsman 1.01 |
| Cincinnati | OH | 1.01 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.02 (metro 1.01 x county 1.01), M 0.99; checks: HUD 0.97, Craftsman 1.03 |
| Toledo | OH | 1.02 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.04 (metro 1.04 x county 1.01), M 0.99; checks: HUD 1.02, Craftsman 1.07 |
| Akron | OH | 1.02 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.05 (metro 1.04 x county 1.01), M 0.98; checks: HUD 0.99, Craftsman 1.03 |
| Dayton | OH | 0.99 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.00 (metro 0.99 x county 1.01), M 0.97; checks: HUD 0.97, Craftsman 1.00 |
| Oklahoma City | OK | 0.93 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.89 (metro 0.87 x county 1.03), M 0.98; checks: RSMeans res. 0.88, HUD 0.92, Craftsman 0.98 |
| Tulsa | OK | 0.92 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.87 (metro 0.86 x county 1.01), M 0.99; checks: RSMeans res. 0.85, HUD 0.89, Craftsman 0.98 |
| Portland | OR | 1.21 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.34 (metro 1.26 x county 1.07), M 1.02; checks: HUD 1.04, Craftsman 1.13; Multnomah adjustment at the +7% cap; HUD 1.04 / DoD 1.10 lower |
| Beaverton | OR | 1.17 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.26 (metro 1.26 x county 1.01), M 1.02; checks: Craftsman 1.13 |
| Lake Oswego | OR | 1.14 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.22 (metro 1.26 x county 0.97), M 1.02; checks: Craftsman 1.13; affluent suburb: Clackamas adjustment (0.97); high-end jobs often price at the Portland factor (1.21) |
| Salem | OR | 1.05 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.07 (metro 1.07 x county 1.01), M 1.02; checks: HUD 1.02, Craftsman 0.99 |
| Eugene | OR | 1.03 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.03, M 1.02; checks: HUD 1.04, Craftsman 0.97 |
| Bend | OR | 1.03 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.05 (metro 1.07 x county 0.98), M 1.01; checks: RSMeans res. 0.98, HUD 1.05, Craftsman 1.01 |
| Medford | OR | 1.03 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.04, M 1.02; checks: HUD 1.03, Craftsman 0.97 |
| Philadelphia | PA | 1.08 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.16 (metro 1.11 x county 1.05), M 0.97; checks: HUD 1.20, DoD 1.15, Craftsman 1.08 |
| King of Prussia | PA | 1.08 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.15 (metro 1.11 x county 1.04), M 0.97; checks: Craftsman 1.10 |
| West Chester | PA | 1.06 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.10 (metro 1.11 x county 0.99), M 1.00; checks: Craftsman 1.08 |
| Pittsburgh | PA | 1.01 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.05 (metro 1.02 x county 1.03), M 0.96; checks: HUD 1.06, Craftsman 1.05 |
| Harrisburg | PA | 1.03 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.07 (metro 1.03 x county 1.03), M 0.98; checks: HUD 1.02, DoD 0.96, Craftsman 1.03 |
| Allentown | PA | 1.03 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 1.06 (metro 1.03 x county 1.02), M 0.98; checks: HUD 1.09, Craftsman 1.03 |
| Lancaster | PA | 0.96 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.95, M 0.98; checks: HUD 1.00, Craftsman 1.00 |
| Scranton | PA | 0.97 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.97 (metro 0.98 x county 0.99), M 0.98; checks: HUD 1.01, DoD 1.07, Craftsman 0.97 |
| Erie | PA | 0.94 | OEWS 2025 (metro), QCEW 2025, Craftsman 2023 | L 0.92, M 0.97; checks: HUD 1.02, Craftsman 0.92 |
| Providence | RI | 1.06 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.11, M 1.00; checks: RSMeans res. 1.06, HUD 1.14, DoD 1.15, Craftsman 1.06 |
| Newport | RI | 1.02 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 1.03 (metro 1.11 x county 0.93), M 1.01; checks: HUD 1.09, DoD 1.17, Craftsman 1.05; Newport County adjustment (0.93); high-end waterfront work often prices at or above Providence (1.06) |
| Columbia | SC | 0.92 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.87 (metro 0.84 x county 1.03), M 1.00; checks: HUD 0.94, DoD 0.94, Craftsman 0.99 |
| Charleston | SC | 0.92 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.88 (metro 0.87 x county 1.01), M 0.99; checks: HUD 0.97, DoD 0.96, Craftsman 1.05 |
| Greenville | SC | 0.93 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.88 (metro 0.85 x county 1.03), M 1.00; checks: RSMeans res. 0.88, HUD 0.97, Craftsman 1.06 |
| Myrtle Beach | SC | 0.88 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.79, M 1.00; checks: Craftsman 0.94 |
| Sioux Falls | SD | 0.93 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.89 (metro 0.87 x county 1.02), M 1.00; checks: RSMeans res. 0.93, HUD 0.99, DoD 0.98, Craftsman 1.02 |
| Rapid City | SD | 0.90 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.85 (metro 0.84 x county 1.01), M 0.98; checks: HUD 0.93, DoD 0.97, Craftsman 0.95 |
| Pierre | SD | 0.90 | OEWS 2025 (state), QCEW 2025, Craftsman 2024 | L 0.84, M 0.98; checks: HUD 0.94, Craftsman 0.90; nonmetro: South Dakota state wage (Hughes County too small to adjust) |
| Nashville | TN | 0.96 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.93 (metro 0.91 x county 1.02), M 1.01; checks: HUD 0.94, Craftsman 1.09 |
| Franklin | TN | 0.96 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.93 (metro 0.91 x county 1.02), M 1.01; checks: Craftsman 1.05 |
| Murfreesboro | TN | 0.93 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.88 (metro 0.91 x county 0.97), M 1.01; checks: Craftsman 1.09 |
| Memphis | TN | 0.93 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.89 (metro 0.87 x county 1.02), M 0.99; checks: RSMeans res. 0.90, HUD 0.93, DoD 0.87, Craftsman 1.09 |
| Knoxville | TN | 0.91 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.85 (metro 0.85 x county 1.00), M 0.99; checks: HUD 0.89, Craftsman 1.03 |
| Chattanooga | TN | 0.93 | OEWS 2025 (metro), QCEW 2025, Craftsman 2024 | L 0.88 (metro 0.87 x county 1.01), M 0.99; checks: HUD 0.92, DoD 0.87, Craftsman 1.03 |
| Houston | TX | 0.92 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.88 (metro 0.87 x county 1.00), M 0.99; checks: RSMeans res. 0.87, HUD 0.90, Craftsman 1.08 |
| Sugar Land | TX | 0.92 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.88 (metro 0.87 x county 1.01), M 0.99; checks: Craftsman 1.08 |
| The Woodlands | TX | 0.88 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.82 (metro 0.87 x county 0.94), M 0.98; checks: Craftsman 1.05; affluent suburb: the county adjustment follows where trade firms are based; high-end jobs here often price at the Houston factor (0.92) |
| Dallas | TX | 0.92 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.88 (metro 0.86 x county 1.02), M 0.99; checks: RSMeans res. 0.85, HUD 0.91, Craftsman 1.07; carpenters alone 11% below the all-trades mean |
| Plano | TX | 0.91 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.85 (metro 0.86 x county 0.98), M 1.00; checks: Craftsman 1.07 |
| Frisco | TX | 0.91 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.85 (metro 0.86 x county 0.98), M 1.00; checks: Craftsman 1.07 |
| Fort Worth | TX | 0.91 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.86 (metro 0.86 x county 1.00), M 0.98; checks: HUD 0.90, DoD 0.84, Craftsman 1.06 |
| Arlington | TX | 0.91 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.86 (metro 0.86 x county 1.00), M 0.99; checks: Craftsman 1.07 |
| Austin | TX | 0.94 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.89 (metro 0.88 x county 1.02), M 1.01; checks: RSMeans res. 0.86, HUD 0.87, Craftsman 1.10 |
| San Antonio | TX | 0.89 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.83 (metro 0.83 x county 1.00), M 0.98; checks: RSMeans res. 0.85, HUD 0.85, DoD 0.80, Craftsman 1.01 |
| El Paso | TX | 0.82 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.72, M 0.97; checks: HUD 0.88, DoD 0.84, Craftsman 0.88 |
| Corpus Christi | TX | 0.88 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.82 (metro 0.82 x county 1.00), M 0.98; checks: HUD 0.91, DoD 0.79, Craftsman 1.02 |
| Lubbock | TX | 0.84 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.76 (metro 0.76 x county 1.00), M 0.97; checks: HUD 0.88, Craftsman 0.96 |
| McAllen | TX | 0.80 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.68, M 0.97; checks: Craftsman 0.88 |
| Midland | TX | 0.92 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.89, M 0.97; checks: HUD 0.89, Craftsman 1.05; oilfield demand; swings with drilling activity |
| Salt Lake City | UT | 0.98 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.95 (metro 0.94 x county 1.00), M 1.02; checks: RSMeans res. 0.91, HUD 0.92, DoD 0.99, Craftsman 1.02 |
| Provo | UT | 0.94 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.88 (metro 0.88 x county 1.00), M 1.02; checks: RSMeans res. 0.90, HUD 0.92, Craftsman 0.94 |
| Ogden | UT | 0.93 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.89 (metro 0.90 x county 0.99), M 1.00; checks: RSMeans res. 0.89, HUD 0.93, DoD 0.98, Craftsman 0.94 |
| St. George | UT | 0.91 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.83, M 1.02; checks: Craftsman 0.94 |
| Arlington | VA | 1.04 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.04, M 1.03; checks: DoD 1.07, Craftsman 1.11; county QCEW too small; DC metro wage used; DoD Fort Myer 1.07 |
| Alexandria | VA | 1.03 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.03 (metro 1.04 x county 0.99), M 1.03; checks: Craftsman 1.11 |
| Fairfax | VA | 1.02 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.02 (metro 1.04 x county 0.98), M 1.03; checks: RSMeans res. 0.93, DoD 1.07, Craftsman 1.11; RSMeans res. 0.93 / VA DMAS-RSMeans 2024 0.926 (commercial basis) |
| Reston | VA | 1.02 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.02 (metro 1.04 x county 0.98), M 1.03; checks: Craftsman 1.10 |
| Ashburn | VA | 1.08 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.12 (metro 1.04 x county 1.07), M 1.03; checks: Craftsman 1.10 |
| Woodbridge | VA | 1.01 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.99 (metro 1.04 x county 0.95), M 1.03; checks: DoD 1.07, Craftsman 1.11 |
| Richmond | VA | 0.93 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.88 (metro 0.88 x county 1.00), M 0.99; checks: HUD 1.02, Craftsman 1.03 |
| Virginia Beach | VA | 0.92 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.87 (metro 0.89 x county 0.99), M 1.00; checks: DoD 0.94, Craftsman 0.99 |
| Norfolk | VA | 0.94 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.90 (metro 0.89 x county 1.02), M 1.00; checks: HUD 0.98, DoD 0.91, Craftsman 1.04 |
| Roanoke | VA | 0.88 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.81 (metro 0.80 x county 1.01), M 0.99; checks: HUD 0.98, Craftsman 0.98 |
| Charlottesville | VA | 0.94 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.90 (metro 0.90 x county 1.00), M 1.01; checks: HUD 0.96, Craftsman 0.98 |
| Burlington | VT | 1.01 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.00 (metro 0.99 x county 1.01), M 1.02; checks: RSMeans res. 0.95, HUD 1.00, DoD 1.01, Craftsman 1.03 |
| Montpelier | VT | 0.97 | OEWS 2025 (state), QCEW 2025, Craftsman 2026 | L 0.94 (state 0.95 x county 0.99), M 1.02; checks: HUD 1.03, DoD 1.04, Craftsman 0.98; nonmetro: Vermont state wage x Washington County adjustment |
| Rutland | VT | 0.93 | OEWS 2025 (state), QCEW 2025, Craftsman 2026 | L 0.90 (state 0.95 x county 0.95), M 0.99; checks: HUD 1.00, Craftsman 0.93; nonmetro: Vermont state wage x Rutland County adjustment |
| Milwaukee | WI | 1.08 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.13 (metro 1.12 x county 1.01), M 1.00; checks: HUD 1.07, DoD 1.10, Craftsman 1.06 |
| Waukesha | WI | 1.08 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.13 (metro 1.12 x county 1.01), M 1.00; checks: Craftsman 1.06 |
| Madison | WI | 1.09 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.13 (metro 1.12 x county 1.01), M 1.02; checks: HUD 1.06, DoD 1.03, Craftsman 1.06 |
| Green Bay | WI | 1.04 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 1.07 (metro 1.06 x county 1.01), M 1.00; checks: HUD 1.05, Craftsman 1.03 |
| Charleston | WV | 0.96 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.93 (metro 0.93 x county 1.00), M 1.01; checks: RSMeans res. 0.95, HUD 1.01, DoD 0.98, Craftsman 1.04; energy/industrial mix; carpenters alone 15% lower -> residential may run ~0.05 lower |
| Huntington | WV | 0.93 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.90 (metro 0.89 x county 1.01), M 0.99; checks: HUD 1.00, Craftsman 0.98 |
| Morgantown | WV | 0.90 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.85 (metro 0.84 x county 1.01), M 0.97; checks: HUD 1.01, Craftsman 0.96 |
| Wheeling | WV | 0.98 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.99 (metro 1.01 x county 0.98), M 0.97; checks: HUD 1.00, Craftsman 0.95 |
| Cheyenne | WY | 0.98 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.96, M 1.01; checks: HUD 0.88, DoD 0.95, Craftsman 0.98 |
| Casper | WY | 0.95 | OEWS 2025 (metro), QCEW 2025, Craftsman 2026 | L 0.92, M 0.98; checks: RSMeans res. 0.91, HUD 0.87, DoD 1.00, Craftsman 1.00; energy-sector trades lift the all-construction wage; carpenters alone 14% lower -> residential may run ~0.05 lower |
| Laramie | WY | 0.95 | OEWS 2025 (state), QCEW 2025, Craftsman 2026 | L 0.91 (state 0.98 x county 0.93), M 1.01; checks: Craftsman 0.98; nonmetro: Wyoming state wage x Albany County adjustment |

## State index corrections

The existing `STATE_COST_INDEX` (JobFlex `src/lib/estimate/trade-knowledge.ts`) was checked against the same formula at state level: the OEWS May 2025 state construction wage and the Craftsman state-average material factor. 25 of 51 values differ by more than 0.05. The pattern is consistent. The Sunbelt and Mountain West (TX, FL, GA, NC, AZ, UT, ID, VA, CO) and the smaller Northeast states are set too high, because their construction wages run 8-16% below the U.S. mean. The union-wage Midwest (IL, MN, WI, MO, IN, ND) and WV are set too low. CA and NY are set at their big-city level rather than their state average. The DoD and Craftsman state averages are shown for context. DoD's CA, HI, ND and NH values carry remote-base and military-logistics premiums.

| State | Current | Corrected | Change | Construction wage vs U.S. (OEWS May 2025) | Materials (Craftsman) | DoD ACF FY26 state avg | Craftsman state avg |
|---|---:|---:|---:|---:|---:|---:|---:|
| CA | 1.25 | **1.13** | -0.12 | 1.20 | 1.02 (2026) | 1.24 | 1.08 |
| FL | 1.02 | **0.91** | -0.11 | 0.85 | 0.99 (2026) | 0.96 | 0.95 |
| MD | 1.10 | **1.00** | -0.10 | 1.00 | 1.01 (2023) | 1.01 | 1.01 |
| VA | 1.05 | **0.95** | -0.10 | 0.91 | 1.00 (2026) | 0.88 | 0.98 |
| TX | 1.00 | **0.90** | -0.10 | 0.84 | 0.98 (2026) | 0.82 | 0.99 |
| IL | 1.05 | **1.15** | +0.10 | 1.25 | 0.99 (2024) | 1.01 | 1.06 |
| NY | 1.20 | **1.10** | -0.10 | 1.17 | 1.00 (2024) | 1.07 | 1.05 |
| AZ | 1.05 | **0.96** | -0.09 | 0.92 | 1.01 (2026) | 0.89 | 0.95 |
| CO | 1.10 | **1.01** | -0.09 | 1.01 | 1.02 (2026) | 1.06 | 1.00 |
| NH | 1.08 | **0.99** | -0.09 | 0.98 | 1.01 (2024) | 1.06 | 1.02 |
| MO | 0.93 | **1.02** | +0.09 | 1.03 | 0.99 (2024) | 0.96 | 0.96 |
| DC | 1.18 | **1.09** | -0.09 | 1.13 | 1.02 (2026) | 1.04 | 1.12 |
| VT | 1.05 | **0.97** | -0.08 | 0.95 | 1.01 (2026) | 1.03 | 0.97 |
| DE | 1.05 | **0.98** | -0.07 | 0.96 | 1.01 (2026) | 1.09 | 1.01 |
| MN | 1.02 | **1.09** | +0.07 | 1.15 | 0.99 (2023) | 1.11 | 1.01 |
| UT | 1.02 | **0.95** | -0.07 | 0.91 | 1.01 (2026) | 0.99 | 0.96 |
| WI | 0.97 | **1.04** | +0.07 | 1.07 | 0.99 (2026) | 1.07 | 1.00 |
| GA | 0.98 | **0.91** | -0.07 | 0.86 | 0.99 (2026) | 0.88 | 1.00 |
| NC | 0.98 | **0.91** | -0.07 | 0.84 | 1.01 (2023) | 0.85 | 0.99 |
| AR | 0.90 | **0.84** | -0.06 | 0.74 | 0.98 (2026) | 0.86 | 0.93 |
| HI | 1.30 | **1.24** | -0.06 | 1.29 | 1.17 (2026) | 2.15 | 1.18 |
| ID | 1.00 | **0.94** | -0.06 | 0.90 | 1.00 (2024) | 1.04 | 0.93 |
| IN | 0.94 | **1.00** | +0.06 | 1.01 | 0.98 (2024) | 0.92 | 0.98 |
| ND | 0.95 | **1.01** | +0.06 | 1.02 | 0.99 (2023) | 1.17 | 0.99 |
| WV | 0.88 | **0.94** | +0.06 | 0.91 | 0.98 (2026) | 0.97 | 0.92 |

Within 0.05, no change needed (current → formula): AK 1.25 (->1.20), AL 0.92 (->0.87), CT 1.12 (->1.07), IA 0.93 (->0.96), KS 0.94 (->0.94), KY 0.92 (->0.93), LA 0.95 (->0.90), MA 1.15 (->1.15), ME 1.00 (->0.98), MI 0.95 (->0.99), MS 0.90 (->0.86), MT 0.98 (->0.98), NE 0.95 (->0.93), NJ 1.15 (->1.14), NM 0.96 (->0.92), NV 1.05 (->1.04), OH 0.95 (->1.00), OK 0.92 (->0.89), OR 1.08 (->1.10), PA 1.02 (->1.00), RI 1.10 (->1.05), SC 0.95 (->0.90), SD 0.93 (->0.90), TN 0.95 (->0.92), WA 1.15 (->1.16), WY 0.98 (->0.99).

A state value is an employment-weighted state average: the right fallback for towns not in the city table. Rural parts of a state will run below it (eastern WA, downstate IL, upstate NY). The full suggested replacement, same scale as the city table:

```ts
export const STATE_COST_INDEX: Record<string, number> = {
  AK: 1.20, AL: 0.87, AR: 0.84, AZ: 0.96, CA: 1.13, CO: 1.01, CT: 1.07, DC: 1.09, DE: 0.98, FL: 0.91, GA: 0.91, HI: 1.24, IA: 0.96, ID: 0.94, IL: 1.15, IN: 1.00, KS: 0.94, KY: 0.93, LA: 0.90, MA: 1.15, MD: 1.00, ME: 0.98, MI: 0.99, MN: 1.09, MO: 1.02, MS: 0.86, MT: 0.98, NC: 0.91, ND: 1.01, NE: 0.93, NH: 0.99, NJ: 1.14, NM: 0.92, NV: 1.04, NY: 1.10, OH: 1.00, OK: 0.89, OR: 1.10, PA: 1.00, RI: 1.05, SC: 0.90, SD: 0.90, TN: 0.92, TX: 0.90, UT: 0.95, VA: 0.95, VT: 0.97, WA: 1.16, WI: 1.04, WV: 0.94, WY: 0.99,
};
```

## Sources

1. U.S. Bureau of Labor Statistics, Occupational Employment and Wage Statistics (OEWS), May 2025. Mean hourly wage, SOC 47-0000 (all metros and states) and 47-2031 carpenters (50-metro mix check), via the BLS Public Data API: https://api.bls.gov/publicAPI/v1/timeseries/data/ (program page https://www.bls.gov/oes/).
2. BLS Quarterly Census of Employment and Wages (QCEW), 2025 annual averages, private NAICS 238 and 236118, all counties and states: https://data.bls.gov/cew/data/api/2025/a/industry/238.csv and https://data.bls.gov/cew/data/api/2025/a/industry/236118.csv
3. OMB 2023 CBSA delineation (Census list 1), for county-to-metro mapping: https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx
4. Craftsman Book Co., "Area Modification Factors" (material/labor/equipment/total by 3-digit ZIP), from the publisher's free book previews. 2026 National Construction Estimator https://craftsman-book.com/media/static/previews/2026_NCE_book_preview.pdf; 2026 National Home Improvement Estimator https://craftsman-book.com/media/static/previews/2026_NHI_book_preview.pdf; 2026 National Building Cost Manual https://craftsman-book.com/media/static/previews/2026_NBC_book_preview.pdf; 2025 National Building Cost Manual https://craftsman-book.com/media/static/previews/2025_NBC_book_preview.pdf; 2024 and 2023 National Home Improvement Estimator (`2024_NHI_book_preview.pdf`, `2023_NHI_book_preview.pdf`) and 2023 NCE (`2023_NCE_book_preview.pdf`), same path.
5. RSMeans Residential Cost Data 2024 location factors (72 cities), as reproduced in Home Innovation Research Labs, *Estimated Costs of the 2024 IRC Code Changes* (for NAHB, July 2, 2024), Appendix B, Table B1: https://www.nahb.org/-/media/NAHB/advocacy/docs/top-priorities/codes/code-adoption/estimated-costs-of-2024-irc-changes.pdf
6. HUD, 2024 Unit Total Development Cost (TDC) Limits (HCC, detached/semi-detached, 3 BR; HUD builds these from RSMeans and Marshall & Swift/CoreLogic): https://www.hud.gov/sites/dfiles/PIH/documents/2024_Units_TDC_Limits.pdf
7. U.S. Army Corps of Engineers, DoD Area Cost Factors, PAX Newsletter 3.2.1 dated 29 March 2024 (Table 4-1, UFC 3-701-01; for FY2026 projects; national average 1.00): https://usace.contentdm.oclc.org/digital/api/collection/p16021coll8/id/4495/download
8. Virginia DMAS, "RS Means Data 2024" (RSMeans location factors for Virginia ZIP3s, e.g. Fairfax 92.6, Richmond 88.6): https://www.dmas.virginia.gov/media/kbubj1qy/rs-means-data-2024.pdf
9. Context only: JLC/Remodeling *Cost vs. Value 2025* national midrange bathroom remodel $26,138 (city pages could not be retrieved; not used in any factor): https://www.jlconline.com/cost-vs-value/2025/

## JSON

City names are as a contractor would type them; the state is the 2-letter code. "New York" and "Manhattan" are both present, as are "Tri-Cities" and its three cities.

```json
[
  {"city":"Seattle","state":"WA","factor":1.25},
  {"city":"Bellevue","state":"WA","factor":1.25},
  {"city":"Kirkland","state":"WA","factor":1.25},
  {"city":"Redmond","state":"WA","factor":1.25},
  {"city":"Bothell","state":"WA","factor":1.25},
  {"city":"Renton","state":"WA","factor":1.25},
  {"city":"Kent","state":"WA","factor":1.25},
  {"city":"Auburn","state":"WA","factor":1.25},
  {"city":"Federal Way","state":"WA","factor":1.25},
  {"city":"Issaquah","state":"WA","factor":1.25},
  {"city":"Sammamish","state":"WA","factor":1.25},
  {"city":"Mercer Island","state":"WA","factor":1.25},
  {"city":"Shoreline","state":"WA","factor":1.25},
  {"city":"Lynnwood","state":"WA","factor":1.21},
  {"city":"Edmonds","state":"WA","factor":1.21},
  {"city":"Mill Creek","state":"WA","factor":1.21},
  {"city":"Everett","state":"WA","factor":1.16},
  {"city":"Marysville","state":"WA","factor":1.16},
  {"city":"Tacoma","state":"WA","factor":1.16},
  {"city":"Puyallup","state":"WA","factor":1.16},
  {"city":"Lakewood","state":"WA","factor":1.16},
  {"city":"Olympia","state":"WA","factor":1.13},
  {"city":"Bremerton","state":"WA","factor":1.09},
  {"city":"Spokane","state":"WA","factor":1.06},
  {"city":"Vancouver","state":"WA","factor":1.11},
  {"city":"Bellingham","state":"WA","factor":1.16},
  {"city":"Yakima","state":"WA","factor":1.04},
  {"city":"Tri-Cities","state":"WA","factor":1.13},
  {"city":"Kennewick","state":"WA","factor":1.13},
  {"city":"Richland","state":"WA","factor":1.13},
  {"city":"Pasco","state":"WA","factor":1.12},
  {"city":"Wenatchee","state":"WA","factor":1.12},
  {"city":"Anchorage","state":"AK","factor":1.19},
  {"city":"Fairbanks","state":"AK","factor":1.24},
  {"city":"Juneau","state":"AK","factor":1.22},
  {"city":"Birmingham","state":"AL","factor":0.90},
  {"city":"Huntsville","state":"AL","factor":0.89},
  {"city":"Mobile","state":"AL","factor":0.88},
  {"city":"Montgomery","state":"AL","factor":0.86},
  {"city":"Little Rock","state":"AR","factor":0.85},
  {"city":"Fayetteville","state":"AR","factor":0.88},
  {"city":"Bentonville","state":"AR","factor":0.87},
  {"city":"Fort Smith","state":"AR","factor":0.83},
  {"city":"Phoenix","state":"AZ","factor":0.97},
  {"city":"Scottsdale","state":"AZ","factor":0.97},
  {"city":"Mesa","state":"AZ","factor":0.97},
  {"city":"Tucson","state":"AZ","factor":0.91},
  {"city":"Flagstaff","state":"AZ","factor":0.94},
  {"city":"Los Angeles","state":"CA","factor":1.10},
  {"city":"Long Beach","state":"CA","factor":1.10},
  {"city":"Santa Monica","state":"CA","factor":1.10},
  {"city":"Anaheim","state":"CA","factor":1.14},
  {"city":"Irvine","state":"CA","factor":1.14},
  {"city":"Riverside","state":"CA","factor":1.05},
  {"city":"San Bernardino","state":"CA","factor":1.09},
  {"city":"San Diego","state":"CA","factor":1.11},
  {"city":"San Francisco","state":"CA","factor":1.30},
  {"city":"Oakland","state":"CA","factor":1.26},
  {"city":"Walnut Creek","state":"CA","factor":1.20},
  {"city":"San Mateo","state":"CA","factor":1.23},
  {"city":"Palo Alto","state":"CA","factor":1.29},
  {"city":"San Jose","state":"CA","factor":1.28},
  {"city":"Santa Rosa","state":"CA","factor":1.16},
  {"city":"Sacramento","state":"CA","factor":1.11},
  {"city":"Fresno","state":"CA","factor":1.06},
  {"city":"Bakersfield","state":"CA","factor":1.06},
  {"city":"Stockton","state":"CA","factor":1.07},
  {"city":"Oxnard","state":"CA","factor":1.08},
  {"city":"Santa Barbara","state":"CA","factor":1.06},
  {"city":"Salinas","state":"CA","factor":1.09},
  {"city":"Denver","state":"CO","factor":1.06},
  {"city":"Aurora","state":"CO","factor":1.04},
  {"city":"Lakewood","state":"CO","factor":1.04},
  {"city":"Boulder","state":"CO","factor":1.03},
  {"city":"Colorado Springs","state":"CO","factor":0.98},
  {"city":"Fort Collins","state":"CO","factor":0.99},
  {"city":"Pueblo","state":"CO","factor":0.96},
  {"city":"Hartford","state":"CT","factor":1.08},
  {"city":"Bridgeport","state":"CT","factor":1.09},
  {"city":"Stamford","state":"CT","factor":1.09},
  {"city":"Greenwich","state":"CT","factor":1.09},
  {"city":"New Haven","state":"CT","factor":1.08},
  {"city":"Washington","state":"DC","factor":1.05},
  {"city":"Wilmington","state":"DE","factor":1.03},
  {"city":"Dover","state":"DE","factor":0.94},
  {"city":"Miami","state":"FL","factor":0.92},
  {"city":"Fort Lauderdale","state":"FL","factor":0.96},
  {"city":"West Palm Beach","state":"FL","factor":0.94},
  {"city":"Boca Raton","state":"FL","factor":0.94},
  {"city":"Tampa","state":"FL","factor":0.92},
  {"city":"St. Petersburg","state":"FL","factor":0.91},
  {"city":"Orlando","state":"FL","factor":0.91},
  {"city":"Jacksonville","state":"FL","factor":0.92},
  {"city":"Tallahassee","state":"FL","factor":0.88},
  {"city":"Sarasota","state":"FL","factor":0.91},
  {"city":"Fort Myers","state":"FL","factor":0.89},
  {"city":"Naples","state":"FL","factor":0.94},
  {"city":"Pensacola","state":"FL","factor":0.89},
  {"city":"Atlanta","state":"GA","factor":0.97},
  {"city":"Marietta","state":"GA","factor":0.97},
  {"city":"Lawrenceville","state":"GA","factor":0.94},
  {"city":"Savannah","state":"GA","factor":0.91},
  {"city":"Augusta","state":"GA","factor":0.90},
  {"city":"Columbus","state":"GA","factor":0.85},
  {"city":"Honolulu","state":"HI","factor":1.25},
  {"city":"Kahului","state":"HI","factor":1.27},
  {"city":"Hilo","state":"HI","factor":1.24},
  {"city":"Des Moines","state":"IA","factor":1.01},
  {"city":"Cedar Rapids","state":"IA","factor":0.98},
  {"city":"Davenport","state":"IA","factor":1.04},
  {"city":"Boise","state":"ID","factor":0.97},
  {"city":"Meridian","state":"ID","factor":0.97},
  {"city":"Idaho Falls","state":"ID","factor":0.97},
  {"city":"Pocatello","state":"ID","factor":0.92},
  {"city":"Coeur d'Alene","state":"ID","factor":0.96},
  {"city":"Chicago","state":"IL","factor":1.20},
  {"city":"Naperville","state":"IL","factor":1.22},
  {"city":"Aurora","state":"IL","factor":1.17},
  {"city":"Joliet","state":"IL","factor":1.18},
  {"city":"Springfield","state":"IL","factor":1.09},
  {"city":"Rockford","state":"IL","factor":1.12},
  {"city":"Peoria","state":"IL","factor":1.11},
  {"city":"Indianapolis","state":"IN","factor":1.02},
  {"city":"Carmel","state":"IN","factor":1.01},
  {"city":"Fort Wayne","state":"IN","factor":0.99},
  {"city":"Evansville","state":"IN","factor":1.00},
  {"city":"South Bend","state":"IN","factor":0.99},
  {"city":"Wichita","state":"KS","factor":0.92},
  {"city":"Overland Park","state":"KS","factor":1.05},
  {"city":"Kansas City","state":"KS","factor":1.06},
  {"city":"Topeka","state":"KS","factor":0.94},
  {"city":"Louisville","state":"KY","factor":0.98},
  {"city":"Lexington","state":"KY","factor":0.94},
  {"city":"Bowling Green","state":"KY","factor":0.90},
  {"city":"Frankfort","state":"KY","factor":0.90},
  {"city":"New Orleans","state":"LA","factor":0.96},
  {"city":"Metairie","state":"LA","factor":0.88},
  {"city":"Baton Rouge","state":"LA","factor":0.95},
  {"city":"Shreveport","state":"LA","factor":0.90},
  {"city":"Lafayette","state":"LA","factor":0.90},
  {"city":"Boston","state":"MA","factor":1.22},
  {"city":"Cambridge","state":"MA","factor":1.18},
  {"city":"Newton","state":"MA","factor":1.18},
  {"city":"Brookline","state":"MA","factor":1.21},
  {"city":"Lowell","state":"MA","factor":1.17},
  {"city":"Worcester","state":"MA","factor":1.11},
  {"city":"Springfield","state":"MA","factor":1.09},
  {"city":"Baltimore","state":"MD","factor":0.98},
  {"city":"Annapolis","state":"MD","factor":1.01},
  {"city":"Bethesda","state":"MD","factor":1.01},
  {"city":"Silver Spring","state":"MD","factor":1.01},
  {"city":"Frederick","state":"MD","factor":1.00},
  {"city":"Portland","state":"ME","factor":1.03},
  {"city":"Bangor","state":"ME","factor":0.92},
  {"city":"Lewiston","state":"ME","factor":0.96},
  {"city":"Augusta","state":"ME","factor":0.96},
  {"city":"Detroit","state":"MI","factor":1.04},
  {"city":"Ann Arbor","state":"MI","factor":1.04},
  {"city":"Grand Rapids","state":"MI","factor":0.98},
  {"city":"Lansing","state":"MI","factor":1.00},
  {"city":"Minneapolis","state":"MN","factor":1.15},
  {"city":"St. Paul","state":"MN","factor":1.17},
  {"city":"Eagan","state":"MN","factor":1.12},
  {"city":"Rochester","state":"MN","factor":1.09},
  {"city":"Duluth","state":"MN","factor":1.05},
  {"city":"Kansas City","state":"MO","factor":1.05},
  {"city":"St. Louis","state":"MO","factor":1.12},
  {"city":"Springfield","state":"MO","factor":0.97},
  {"city":"Jefferson City","state":"MO","factor":1.01},
  {"city":"Jackson","state":"MS","factor":0.85},
  {"city":"Gulfport","state":"MS","factor":0.88},
  {"city":"Hattiesburg","state":"MS","factor":0.85},
  {"city":"Billings","state":"MT","factor":1.00},
  {"city":"Missoula","state":"MT","factor":0.98},
  {"city":"Bozeman","state":"MT","factor":1.03},
  {"city":"Great Falls","state":"MT","factor":0.97},
  {"city":"Helena","state":"MT","factor":0.98},
  {"city":"Charlotte","state":"NC","factor":0.94},
  {"city":"Raleigh","state":"NC","factor":0.95},
  {"city":"Durham","state":"NC","factor":0.94},
  {"city":"Greensboro","state":"NC","factor":0.91},
  {"city":"Winston-Salem","state":"NC","factor":0.89},
  {"city":"Asheville","state":"NC","factor":0.90},
  {"city":"Wilmington","state":"NC","factor":0.90},
  {"city":"Fargo","state":"ND","factor":1.00},
  {"city":"Bismarck","state":"ND","factor":0.97},
  {"city":"Grand Forks","state":"ND","factor":0.98},
  {"city":"Minot","state":"ND","factor":0.98},
  {"city":"Omaha","state":"NE","factor":0.96},
  {"city":"Lincoln","state":"NE","factor":0.93},
  {"city":"Grand Island","state":"NE","factor":0.89},
  {"city":"Manchester","state":"NH","factor":0.99},
  {"city":"Nashua","state":"NH","factor":0.99},
  {"city":"Concord","state":"NH","factor":0.98},
  {"city":"Portsmouth","state":"NH","factor":1.11},
  {"city":"Newark","state":"NJ","factor":1.16},
  {"city":"Jersey City","state":"NJ","factor":1.18},
  {"city":"Hackensack","state":"NJ","factor":1.15},
  {"city":"Morristown","state":"NJ","factor":1.17},
  {"city":"Edison","state":"NJ","factor":1.19},
  {"city":"Toms River","state":"NJ","factor":1.11},
  {"city":"Trenton","state":"NJ","factor":1.13},
  {"city":"Cherry Hill","state":"NJ","factor":1.05},
  {"city":"Albuquerque","state":"NM","factor":0.91},
  {"city":"Santa Fe","state":"NM","factor":0.90},
  {"city":"Las Cruces","state":"NM","factor":0.86},
  {"city":"Las Vegas","state":"NV","factor":1.03},
  {"city":"Henderson","state":"NV","factor":1.03},
  {"city":"Reno","state":"NV","factor":1.02},
  {"city":"Carson City","state":"NV","factor":1.06},
  {"city":"New York","state":"NY","factor":1.27},
  {"city":"Manhattan","state":"NY","factor":1.27},
  {"city":"Brooklyn","state":"NY","factor":1.11},
  {"city":"Queens","state":"NY","factor":1.20},
  {"city":"Bronx","state":"NY","factor":1.17},
  {"city":"Staten Island","state":"NY","factor":1.16},
  {"city":"Hempstead","state":"NY","factor":1.18},
  {"city":"Huntington","state":"NY","factor":1.15},
  {"city":"White Plains","state":"NY","factor":1.16},
  {"city":"Buffalo","state":"NY","factor":1.02},
  {"city":"Rochester","state":"NY","factor":1.00},
  {"city":"Syracuse","state":"NY","factor":1.03},
  {"city":"Albany","state":"NY","factor":1.07},
  {"city":"Columbus","state":"OH","factor":1.05},
  {"city":"Cleveland","state":"OH","factor":1.03},
  {"city":"Cincinnati","state":"OH","factor":1.01},
  {"city":"Toledo","state":"OH","factor":1.02},
  {"city":"Akron","state":"OH","factor":1.02},
  {"city":"Dayton","state":"OH","factor":0.99},
  {"city":"Oklahoma City","state":"OK","factor":0.93},
  {"city":"Tulsa","state":"OK","factor":0.92},
  {"city":"Portland","state":"OR","factor":1.21},
  {"city":"Beaverton","state":"OR","factor":1.17},
  {"city":"Lake Oswego","state":"OR","factor":1.14},
  {"city":"Salem","state":"OR","factor":1.05},
  {"city":"Eugene","state":"OR","factor":1.03},
  {"city":"Bend","state":"OR","factor":1.03},
  {"city":"Medford","state":"OR","factor":1.03},
  {"city":"Philadelphia","state":"PA","factor":1.08},
  {"city":"King of Prussia","state":"PA","factor":1.08},
  {"city":"West Chester","state":"PA","factor":1.06},
  {"city":"Pittsburgh","state":"PA","factor":1.01},
  {"city":"Harrisburg","state":"PA","factor":1.03},
  {"city":"Allentown","state":"PA","factor":1.03},
  {"city":"Lancaster","state":"PA","factor":0.96},
  {"city":"Scranton","state":"PA","factor":0.97},
  {"city":"Erie","state":"PA","factor":0.94},
  {"city":"Providence","state":"RI","factor":1.06},
  {"city":"Newport","state":"RI","factor":1.02},
  {"city":"Columbia","state":"SC","factor":0.92},
  {"city":"Charleston","state":"SC","factor":0.92},
  {"city":"Greenville","state":"SC","factor":0.93},
  {"city":"Myrtle Beach","state":"SC","factor":0.88},
  {"city":"Sioux Falls","state":"SD","factor":0.93},
  {"city":"Rapid City","state":"SD","factor":0.90},
  {"city":"Pierre","state":"SD","factor":0.90},
  {"city":"Nashville","state":"TN","factor":0.96},
  {"city":"Franklin","state":"TN","factor":0.96},
  {"city":"Murfreesboro","state":"TN","factor":0.93},
  {"city":"Memphis","state":"TN","factor":0.93},
  {"city":"Knoxville","state":"TN","factor":0.91},
  {"city":"Chattanooga","state":"TN","factor":0.93},
  {"city":"Houston","state":"TX","factor":0.92},
  {"city":"Sugar Land","state":"TX","factor":0.92},
  {"city":"The Woodlands","state":"TX","factor":0.88},
  {"city":"Dallas","state":"TX","factor":0.92},
  {"city":"Plano","state":"TX","factor":0.91},
  {"city":"Frisco","state":"TX","factor":0.91},
  {"city":"Fort Worth","state":"TX","factor":0.91},
  {"city":"Arlington","state":"TX","factor":0.91},
  {"city":"Austin","state":"TX","factor":0.94},
  {"city":"San Antonio","state":"TX","factor":0.89},
  {"city":"El Paso","state":"TX","factor":0.82},
  {"city":"Corpus Christi","state":"TX","factor":0.88},
  {"city":"Lubbock","state":"TX","factor":0.84},
  {"city":"McAllen","state":"TX","factor":0.80},
  {"city":"Midland","state":"TX","factor":0.92},
  {"city":"Salt Lake City","state":"UT","factor":0.98},
  {"city":"Provo","state":"UT","factor":0.94},
  {"city":"Ogden","state":"UT","factor":0.93},
  {"city":"St. George","state":"UT","factor":0.91},
  {"city":"Arlington","state":"VA","factor":1.04},
  {"city":"Alexandria","state":"VA","factor":1.03},
  {"city":"Fairfax","state":"VA","factor":1.02},
  {"city":"Reston","state":"VA","factor":1.02},
  {"city":"Ashburn","state":"VA","factor":1.08},
  {"city":"Woodbridge","state":"VA","factor":1.01},
  {"city":"Richmond","state":"VA","factor":0.93},
  {"city":"Virginia Beach","state":"VA","factor":0.92},
  {"city":"Norfolk","state":"VA","factor":0.94},
  {"city":"Roanoke","state":"VA","factor":0.88},
  {"city":"Charlottesville","state":"VA","factor":0.94},
  {"city":"Burlington","state":"VT","factor":1.01},
  {"city":"Montpelier","state":"VT","factor":0.97},
  {"city":"Rutland","state":"VT","factor":0.93},
  {"city":"Milwaukee","state":"WI","factor":1.08},
  {"city":"Waukesha","state":"WI","factor":1.08},
  {"city":"Madison","state":"WI","factor":1.09},
  {"city":"Green Bay","state":"WI","factor":1.04},
  {"city":"Charleston","state":"WV","factor":0.96},
  {"city":"Huntington","state":"WV","factor":0.93},
  {"city":"Morgantown","state":"WV","factor":0.90},
  {"city":"Wheeling","state":"WV","factor":0.98},
  {"city":"Cheyenne","state":"WY","factor":0.98},
  {"city":"Casper","state":"WY","factor":0.95},
  {"city":"Laramie","state":"WY","factor":0.95}
]
```
