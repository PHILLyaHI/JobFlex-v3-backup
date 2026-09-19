# Underground utility unit prices: sewer, storm and water (national and Seattle area)

Version: FINAL v3, 2026-09-18. Built for JobFlex estimating; the numbers live in src/lib/estimate/utility-prices-data.ts.

## 1. Methodology

- **What was pulled.** Public bid prices from 2023 to 2026 came first, followed by utility and city unit-cost studies, and then residential cost guides (used only for house-side work).
  - WSDOT Unit Bid Analysis, queried live on 2026-09-18 (https://wsdot.wa.gov/Biz/CONTAA/UBA/, Standard Item report, contracts advertised 1/1/2023 to 8/31/2026). "NWR" is WSDOT's Northwest Region, which covers King, Snohomish, Skagit, Whatcom and Island counties. That is the Seattle area. Sections pulled: 1, 2, 4, 5, 6, 7, 8, 9, 14, 18, 19. To re-run: open the Standard Item report on that page, pick the region and the date range, and export each section.
  - Bid tabs and awards from King and Pierce County cities: Renton award (2024), Federal Way bid tab (Jan 2026), Puyallup bid tab (Nov 2025), and Mercer Island engineer's estimates (2023 to 2024). Also a Kennewick WA bid tab (2025/26).
  - Out-of-state bid tabs: Leominster MA (June 2025, on-call unit prices by depth band), Neenah WI (Feb 2024), Forney TX (Feb 2024), Hastings MN (Apr 2025).
  - DOT average unit prices: WisDOT FY2023 to FY2025 statewide averages (list dated 10/21/2025), and TxDOT 3-year trailing statewide averages (via caliche.io, 2026).
  - Unit-cost studies and curves: City of Phoenix Water and Wastewater Unit Cost Study (Carollo, Aug 2024, costs at Sept 2023), City of Houston Storm Sewer Unit Cost Rates (Jan 2023), and the US EPA 2022 Clean Watersheds Needs Survey cost-curve methods (May 2024).
  - Seattle fees: SPU DSO Charge Menu v13.1 (effective 1/1/2026), and the King County capacity charge for 2026.
  - Residential guides: HomeAdvisor (updated June 2026), Angi Seattle, and On Pattison "Seattle sewer line installation cost 2026" (Apr 2026). Angi's national page and Fixr returned 403 or 404 and were not used.
- **How the Seattle numbers were set.** Wherever possible they come directly from Western Washington bid data: WSDOT NWR, King County cities, and SPU and SDOT fees. Where no local bid item exists, the Seattle figure is a component build-up from local prices, and the table marks it "derived". No RSMeans location factor was applied or verified in this session.
- **Price basis.**
  - Bid-tab and WSDOT prices are the contractor's unit bid prices to the owner. They already include the contractor's overhead and profit. They do not include the owner's engineering or contingency, and WA sales tax may be extra on utility (Rule 170) work.
  - Phoenix unit costs include contractor overhead (10%), profit (6%), general conditions (10%) and sales tax, with no contingency.
  - Houston rates include 20% engineering and contingency.
  - The EPA curve is total project cost from state revolving-fund project records, in 2022 dollars.
  - Cost-guide figures are consumer prices, so they include the contractor's markup.
  - Fees are agency charges.
  - The JSON `basis` field tags each number with one of these.
- **Reading WSDOT pipe items.** In WSDOT's pay structure, a pipe item covers furnishing and laying the pipe plus bedding. Trench excavation, shoring, pavement removal and restoration, traffic control and mobilization are separate pay items. Most city bid tabs (Puyallup, Leominster, Neenah, Forney) instead fold trench excavation and backfill into the pipe item and pay for paving separately.

## 2. All-in cost per linear foot

"All-in" means everything the contractor bids to deliver a working line: excavation, pipe, structures, connections, restoration, traffic control, testing and mobilization. Owner engineering is excluded.

| Scope | National $/LF | Seattle-area $/LF | Basis and sources |
|---|---|---|---|
| **side-sewer-yard** (4-6 in PVC, yard, 3-6 ft deep) | 60-250 | 120-350 | HomeAdvisor and Angi, national $50-$250/LF (2025-26). On Pattison Seattle 2026: open cut $120-$350/LF, typical lateral job $10k-$18k, range $8k-$30k. Angi Seattle $60-$220/LF. Bid tabs for pipe work only: Neenah WI 2024 lateral, ROW to house, $50-$71/LF; Leominster MA 2025 4-6 in pipe at 0-4 ft $125-$200/LF; WSDOT NWR 2025 6-in PVC sanitary $90-$225/LF (pipe and bedding only). Add the permit ($500-$1,200 in Seattle). |
| **side-sewer-to-street** (runs into the street to the main: pavement restoration, traffic control, the tap) | 150-450 blended (street segment alone 150-600) | 350-900 blended (street segment alone 500-1,400) | *Derived.* Blended figure assumes a 60-80 LF run with 20-40 LF in the street. Street segment build-up: trench 8-12 ft deep with shoring ($200-$400/LF), plus 2-3 days of traffic control ($1,400-$2,900/day), plus 15-25 SY of trench patch ($70-$200/SY), plus connection to the main ($1,500-$7,500), plus SDOT street use (~$1,768) and SPU side sewer permit ($500-$1,200), plus about 10% mobilization. That comes to roughly $20k-$60k for the street part alone. SPU (Strategic Business Plan 2021-26) says side sewer costs "range from several thousand dollars to many tens of thousands of dollars, especially when street and sidewalk restoration is required". National: Neenah WI 2024 lateral in ROW $71-$89/LF (inside a full street rebuild, so no restoration), and Leominster MA 2025 house tie-in $3,000-$7,500 each. |
| **sewer-main-street** (public 8-12 in main in a city street, with manholes, service reconnections and restoration) | 350-1,100 | 800-1,600 (up to 2,000-3,200 when deep, on an arterial, or wet) | **Renton WA, awarded 8/5/2024: $780,858 for about 750 LF (740 LF of 8-in, 10 LF of 12-in, one 48-in manhole, AC, curb and sidewalk restoration at 4 sites) = $1,041/LF.** EPA CWNS curve (2022 $, national): $/ft = 14,632 x L^-0.45, which gives $1,120/ft at 300 LF, $650/ft at 1,000 LF and $320/ft at 5,000 LF. Phoenix 2024 study, 8-in sewer with pavement $350/LF and 12-in $430/LF (long program runs, hard digging, manholes every 400 ft). Mercer Island 2023 pipe bursting, 1,125 LF with manholes, laterals, bypass and restoration: engineer's estimate $620-$755/LF. Forney TX 2024, 1,600 LF 8-in with manholes and bypass, no paving: $248-$268/LF. Neenah WI 2024 sanitary schedule, no paving: $180-$198/LF. The component build-up in section 5 gives $750-$2,300/LF. SPU E Pike/SW Dakota/NE 107th full-line replacement: $2.1M budget for 660 LF (153 LF 8-in sewer, 53 LF 12-in sewer, 454 LF 12-in drainage) = about $3,200/LF. That figure comes only from a search-engine snippet of SPU's Q1-2025 contracting list; the file has since been replaced and the number could not be re-verified. |
| **storm-street** (12-24 in in a street) | 200-600 | 350-900 | Houston Jan 2023 all-in rates: 24-in $550/LF, 30-in $590, 36-in $640. These include pavement removal and replacement, manholes, inlets, groundwater control, traffic control and mobilization, plus 20% engineering and contingency (about $460/LF construction only). Pipe-only bids: WisDOT RCP Class III 12-in $79-$105, 18-in $83-$112, 24-in $100-$147 (FY23-25); TxDOT RCP 18-in $82 and 24-in $118; WSDOT NWR RCP 12-in $100-$183 and 18-in $100-$134; Puyallup 2025 12-in DI $89-$160 and PVC $70-$144 (trench included, paving separate); Leominster MA 2025 12-in RCP $150-$250 and 24-in $175-$350 (paving separate). The Seattle figure is *derived*: pipe with trench $150-$300, structures $30-$60, restoration $60-$140, traffic control $20-$60, testing and TESC $15-$40, plus 7-10% mobilization. That gives $300-$670/LF, which rises toward $900 on arterials or where SDOT requires concrete panel restoration. |
| **water-main-street** (6-12 in in a street) | 250-600 | 450-1,000 | Phoenix 2024, DI with pavement: 6-in $350, 8-in $410, 10-in $450, 12-in $490/LF (without pavement $210-$350). Mercer Island engineer's estimates: 2024 AC replacement, 5,100 LF DI 4-12 in with 9 hydrants, 98 services and 5 connections, $3.01-$3.85M = $590-$754/LF. 2024 Water System Improvements, about 6,335 LF DI plus a PRV station, 15 hydrants, 102 services and 490 LF of storm, $3.7-$4.3M = $540-$630/LF. 2025 AC replacement, about 9,000 LF, $3.7-$4.3M = $411-$478/LF. Short runs (about 300 LF) sit at the high end. Leominster MA 2025 DI 8-12 in $100-$275/LF excluding paving. Neenah WI 2024 8-in PVC C900 $83-$92/LF (street rebuild, no restoration). |
| **water-service-yard** (house service line in a yard) | 50-150 | 75-250 | HomeAdvisor (June 2026): $50-$150/LF, up to $250/LF in high-cost urban areas; trenched $50-$250/LF; average job $1,702, typical $647-$2,833. Neenah WI 2024 service in ROW by trench $51-$66/LF. A new Seattle service also pays SPU's tap and system development charges (see components). |

## 3. Verdict on "$300,000 for 300 LF of sewer in the street" ($1,000/LF)

**The owner's figure is right for a Seattle-area city street.** Three independent checks agree:
1. **Renton WA (King County), awarded August 2024.** A comparable small, multi-site 8-in main replacement with a manhole and full street, curb and sidewalk restoration came in at **$1,041/LF**. That is essentially the owner's number.
2. **US EPA CWNS national cost curve.** A 300-ft sewer replacement project is about **$1,120/ft** in 2022 dollars. The national curve is steep at short lengths because the fixed costs (mobilization, traffic control, bypass, manholes, restoration, testing) are spread over few feet.
3. **Component build-up from Western Washington bid prices** (section 5): **$750 to $2,300/LF**, with about $1,100-$1,300/LF in the middle.

**Why the AI came out low.** It priced the job as house plumbing, where a side sewer runs $60-$350/LF. A public main in a street adds cost that residential work never carries:
- a deeper trench (8-15 ft) with shoring;
- imported backfill or CDF;
- manholes at $5k-$15k each;
- reconnecting every side sewer at $2k-$7.5k each;
- bypass pumping for live sewage;
- weeks of flaggers at $60-$110/hr each;
- saw-cut, removal and trench restoration to city standard at $70-$200/SY, sometimes followed by grind-and-overlay or concrete panel replacement;
- CCTV and air/mandrel testing;
- 5-10% mobilization;
- prevailing wages, bonding and street-use permits.

**When $1,000/LF holds:**
- a public 8-12 in main;
- 6-14 ft deep;
- a paved residential or collector street in King or Snohomish County;
- a short job (roughly 150-600 LF);
- 1-2 manholes and several service reconnections;
- bypass pumping;
- ordinary traffic control and trench restoration to city or SDOT standard.

**When it is too high:**
- A long run of 2,000 LF or more, where cost falls toward $500-$800/LF.
- A greenfield subdivision main with no pavement or live flow: $150-$350/LF (Neenah, Forney, Phoenix without pavement).
- A trenchless method: CIPP lining costs $42-$50/LF in the Midwest and $125-$160/LF with service seals on Mercer Island (engineer's estimate). Pipe bursting with manholes and laterals costs $620-$755/LF.

**When it is too low (expect $1,500-$3,200/LF):**
- depth over 15 ft;
- groundwater that needs wellpoints;
- an arterial with night work or police traffic control;
- SDOT concrete panel replacement;
- contaminated soil, or dense utility conflicts;
- 15-in pipe or larger, or a combined sewer/drainage job (SPU's E Pike/Dakota/NE 107th budget works out to about $3,200/LF).

## 4. Component unit prices

| Item | Unit | National range | Seattle-area range | Source (year) |
|---|---|---|---|---|
| Trench excavation + backfill, 0-5 ft | LF | $15-$40 | $40-$85 | *Derived.* 3-ft-wide trench = 0.44 CY/LF. National: excavation $10.50-$16/CY (Neenah WI 2024), $13/CY (TxDOT 3-yr avg), native backfill. Seattle: structure excavation Class B including haul, median $31.50/CY (WSDOT NWR 2023-26, n=11); roadway excavation $55-$169/CY (Federal Way 2026); imported gravel borrow including haul, median $34.75/ton; select borrow median $67/ton (WSDOT NWR). |
| Trench excavation + backfill, 5-10 ft | LF | $25-$60 | $95-$185 | *Derived* the same way (3.5 ft wide, about 1.0 CY/LF). Depth premium cross-check: Leominster MA 2025 bids for 8-in sewer are $125-$200/ft at 0-4 ft, $150-$250 at 5-8 ft, and $200-$275 at 8+ ft. |
| Trench excavation + backfill, 10-15 ft | LF | $45-$110 | $180-$350 | *Derived* (4 ft wide, about 1.85 CY/LF), same sources. |
| Shoring / trench safety | LF | $2-$15 | $10-$50 | TxDOT trench excavation protection $5.70/LF (3-yr statewide average, 2026). Forney TX 2024 $1.50-$5/LF. Kennewick WA 2025/26 $1.50-$2/LF. WSDOT NWR shoring or extra excavation Class B $1-$5/SF (median $2, 2023-26), which is $10-$50/LF for two walls 5-10 ft high. |
| CDF (controlled density fill) | CY | $165-$300 | $165-$400 (small quantities up to $750+) | WisDOT "Backfill Controlled Low Strength" $164 (FY23), $203 (FY24), $300 (FY25). Kennewick WA 2025/26 CDF Class B $165-$240 (engineer's estimate $200). WSDOT NWR 2023-26 $150-$1,250 (median $758, n=4, small quantities). |
| PVC sewer pipe 6 in, supplied and laid | LF | $55-$125 | $90-$225 | WSDOT 4-in and 6-in PVC sanitary: SCR 2024 $56; MR 2025 $89 and $122; NWR 1/2025 $90.35 (2nd bid $120, 3rd $225). |
| PVC sewer pipe 8 in, supplied and laid | LF | $70-$150 | $92-$225 | Forney TX 2024 $69-$70 (open cut with embedment). Neenah WI 2024 $78-$91 (trench included). WSDOT NWR 1/2025 bids $92.50, $144, $225. |
| Sewer pipe 12 in (PVC/DI), supplied and laid | LF | $100-$200 | $140-$275 | Leominster MA 2025 12-in $125-$275/ft by depth (trench included). WSDOT NWR 2025 DI sewer 10-in $142.70. The Seattle upper bound is derived. |
| DI water main 8-12 in, supplied and laid | LF | $85-$280 | $170-$410 | Neenah WI 2024 8-in PVC C900 $83-$92. WSDOT 2023-25 DI water main: 8-in $278 (statewide), 10-in $410 (NWR), 12-in $172 (NWR). Leominster MA 2025 DI 8-12 in $100-$275 (trench included). |
| Storm pipe 12 in (RCP/PVC/DI), supplied and laid | LF | $60-$150 | $70-$185 | WisDOT RCP III 12-in $79-$105 (FY23-25). Neenah WI 2024 $52-$63. WSDOT NWR RCP 12-in $100-$183; Schedule A 12-in $40-$120. Puyallup 11/2025 DI $89-$160, PVC $70-$144. |
| Storm pipe 24 in RCP, supplied and laid | LF | $100-$220 | $150-$300 | TxDOT $118 (3-yr average). WisDOT $100-$147. WSDOT Olympic Region 2023 $205. The Seattle figure is derived; there was no NWR 24-in bid in 2023-26. |
| 48 in precast manhole, 0-10 ft | EA | $3,400-$13,000 | $4,650-$15,000 | WisDOT "Manholes 4-FT diameter" $3,382-$4,245 (FY23-25). Forney TX 2024 4-ft MH $9,910-$13,000. Leominster MA 2025 precast MH 5-8 ft $11,000-$20,000. WSDOT NWR MH 48 in Type 1/3 $4,650 and $4,776; catch basin Type 2 48 in $3,600-$5,616 (median $4,998). |
| Manhole extra depth | VF | $100-$400 | $100-$400 | WSDOT NWR "Manhole additional height 48 in" $101.20/VF. Neenah WI 2024 full manhole priced per VF $530-$726, used as a ceiling. Low confidence. |
| Sewer cleanout | EA | $900-$2,500 | $900-$4,560 | Puyallup 11/2025 $900-$1,620. WSDOT 2023-25: OR $1,610, MR $3,556, SCR $4,560 (statewide average $2,489). The national column uses Washington data as a proxy. |
| Service (side sewer) reconnection to new main | EA | $450-$7,500 | $1,500-$7,500 | Neenah WI 2024 reconnect lateral to main $211-$1,160. Leominster MA 2025 house service tie-in $3,000-$7,500. WSDOT NWR connection to drainage structure $1,316-$5,565 (median $2,453). |
| New connection to existing main or manhole | EA | $3,000-$13,500 | $2,500-$10,250 | Forney TX 2024: connect to existing MH $3,000-$3,500; new MH over existing sewer with connection $11,615-$13,500. WSDOT NWR drop manhole connection $10,250. |
| Utility connection fees (new service) | EA | n/a | Water: $14,300-$15,675 (3/4 in) or $21,125-$22,500 (1 in). Sewer: King County capacity charge about $14,000. | SPU DSO Charge Menu v13.1 (1/1/2026), 3/4 in: tap installation $4,800 (non-arterial) or $6,175 (arterial), water SDC $6,900, sewer SDC $2,600. 1 in: installation $4,975 or $6,350, water SDC $11,730, sewer SDC $4,420. King County capacity charge 2026: $77.99 per RCE per month for 15 years. |
| Saw-cut asphalt | LF | $1.50-$3 | $4-$6.50 | Neenah WI 2024 $1.55-$2.76. Federal Way 1/2026 $4.00-$6.52. |
| Remove asphalt pavement | SY | $3-$5 | $20-$96 | WisDOT removing asphaltic surface $3.31-$4.94 (FY23-25). WSDOT NWR removing asphalt concrete pavement $20-$96 (median $62.50, n=4). Kennewick 2025/26 saw-cut, removal and patch combined $24-$80/SY. |
| Permanent HMA trench patch (full depth) | SY | $40-$150 | $70-$200 | Leominster MA 2025 permanent trench patch $70-$150/SY (temporary $40-$75). Federal Way 1/2026 HMA for pavement repair $168-$255/ton (about $55-$85/SY at 6 in, plus base). WSDOT NWR HMA for pavement repair $195-$590/ton (median $320, about $65-$195/SY at 6 in). Kennewick 2025/26 $24-$80/SY including saw-cut and removal. |
| Grind and overlay (plane + 2 in HMA) | SY | $10-$25 | $16-$45 | WisDOT milling $1.50-$1.99/SY plus HMA $75-$94/ton (FY23-25). Federal Way 1/2026 planing $4.20-$8.00/SY and HMA Cl 1/2 $104-$124/ton. WSDOT NWR planing median $8.50/SY and HMA Cl 1/2 median $175/ton. Small utility patches price toward the top. |
| Flaggers | HR | $45-$80 (estimate, no source found) | $60-$110 | Federal Way 1/2026 $60-$75/hr. WSDOT NWR 2023-26 $74-$110/hr (median $86). Other traffic control labor $60-$144/hr. Uniformed police officer $146-$250/hr (WSDOT NWR). |
| Traffic control, typical lane closure (2 flaggers + devices + supervisor) | DAY | $1,000-$2,000 | $1,400-$2,900 | *Derived*: 2 flaggers x 9 hr x flagger rate, plus $250-$900/day for devices and traffic control supervisor (Federal Way 2026 TCS LS $14k-$20k; PCMS $5.75-$15/hr). |
| Bypass pumping (4-12 in) | DAY | $500-$15,000 | $1,000-$8,000 (derived) | Forney TX 2024 $500-$600/day for an 8-in line. Leominster MA 2025 $6,000-$8,000/day with a 4-6 in pump and $10,500-$15,000/day with a 12-in pump. Puyallup 11/2025 temporary sanitary bypass LS $5,000-$20,000 (small job). |
| Dewatering (sump pumps to wellpoints) | DAY | $300-$2,500 (estimate) | $500-$3,500 (estimate) | No per-day bid item found. Puyallup 11/2025 dewatering LS ranged $2,500-$175,377 across 4 bidders, which shows how site-specific it is. Low confidence. |
| CCTV inspection (post-construction) | LF | $1-$3 | $2-$6 (derived) | Neenah WI 2024 clean and televise LS $5,050-$6,330 over 4,465 LF = $1.13-$1.42/LF. |
| Air/mandrel testing incl. TV (WSDOT "testing sewer pipe") | LF | $5-$17 | $14-$17 | WSDOT NWR 1/2025 $14 and MR 4/2025 $16.67. Testing storm sewer pipe median $5 (n=22). Leominster MA 2025 pressure test $2,500-$6,500 per test. |
| Mobilization | % of job | 5-10 | 5-10 | Forney TX 2024 (spec max 5%). Federal Way 2026 about 5-8%. Puyallup 2025 5.5-8.2%. Kennewick 2025/26 about 5-10%. |
| ROW / street-use permit | per permit | $100-$500 | $1,768-$5,000 | HomeAdvisor 2026: permits $100-$500, inspection $150-$500. SPU DSO 2026 example for a tap on an arterial, SDOT fees: permit $774 + arterial $260 + inspection $367 + traffic control plan $367 = $1,768. Multi-week main jobs run higher; the $5,000 upper bound is unverified. |
| Side sewer permit | per permit | $100-$500 | $500-$1,200 | On Pattison Seattle 2026 (secondary source). SPU has issued side sewer permits since 10/1/2025, and core taps have been on the permit invoice since 4/13/2026. |
| CIPP lining 8 in (trenchless alternative) | LF | $42-$60 | $125-$160 incl. service seals | Hastings MN 4/2025 8-in $42.25-$50.30/LF, lateral CIPP connection $4,600-$7,900 each. Mercer Island 2023 engineer's estimate, 12,000 LF of 8-12 in with about 100 service seals, $1.5-$1.9M. |
| Gate valve 6-12 in | EA | $2,600-$11,000 | $4,000-$5,250 | Neenah WI 2024 8-in valve and box $2,610-$3,111. Leominster MA 2025 6-12 in $3,500-$11,000. WSDOT 2023-25: 6-in $4,000, 8-in $5,001, 10-in $5,250 (NWR), 12-in $5,135 (NWR). |
| Fire hydrant assembly | EA | $7,450-$16,000 | $8,150+ | Neenah WI 2024 hydrant, lead and valve $7,450-$9,500. Leominster MA 2025 $8,000-$16,000. WSDOT NWR hydrant assembly $8,150 (single bid). |

## 5. Build-up check: 300 LF of 8-in sewer main, Seattle-area street, 8-12 ft deep

All figures use the Seattle columns above, at contractor bid prices.

| Line | Low | High |
|---|---|---|
| Traffic control, about 20 working days x $1,650-$2,800/day | $33k | $56k |
| Saw-cut (600 LF) + remove AC (about 220 SY) | $7k | $17k |
| Excavation and haul (about 440 CY) + imported backfill (about 845 tons) | $44k | $86k |
| Shoring (about 6,000 SF of wall) | $6k | $30k |
| Pipe, 8-in PVC, supplied and laid | $28k | $68k |
| 2 manholes (48 in) + connection to existing | $19k | $50k |
| About 10 side sewer reconnections | $30k | $75k |
| Bypass pumping | $10k | $40k |
| Dewatering (if groundwater) | $0 | $50k |
| Testing and CCTV | $4k | $5k |
| Trench restoration (HMA) + overlay or SDOT concrete panels | $16k | $120k |
| TESC, SPCC, survey, potholing | $10k | $25k |
| **Subtotal** | **~$207k** | **~$622k** |
| Mobilization 8-10% | **$223k (~$745/LF)** | **$685k (~$2,280/LF)** |

A typical job lands around $330k-$400k, or $1,100-$1,330/LF. **$300,000 is a normal price for this job.**

## 6. What is uncertain

- **Dewatering per day** has no bid-item source; it is an estimate.
- **Bypass pumping per day** varies about 20-fold between sources (Texas vs Massachusetts). There is no Seattle per-day bid, only lump sums.
- **National flagger rate** has no source; it is an estimate.
- **"side-sewer-to-street"** is derived from components, not from a published all-in number. The Seattle marketing article's "+$1,500-$6,000 for ROW" looks too low for a real street cut with SDOT restoration.
- **SDOT restoration.** Concrete panel replacement and grind-and-overlay requirements depend on the street. The largest swing in any street estimate is the restoration scope (roughly $16k to $120k on 300 LF).
- **The SPU E Pike/Dakota/NE 107th figure (~$3,200/LF)** comes from a search-engine snippet of a superseded SPU PDF and could not be re-verified.
- **Mercer Island figures** are engineer's estimates, not awards. The award amounts were not published on the pages fetched.
- **WSDOT sanitary sewer data is thin.** WSDOT is a highway agency, and there were only 12 sanitary sewer records in 2023-26. Several WSDOT NWR items have n=1 to 4.
- **Phoenix unit costs** are for long, programmatic runs in desert soil with no side sewer reconnections. Treat them as a national floor for street work, not the typical case.

## 7. JSON

```json
{
  "meta": {
    "compiled": "2026-09-18",
    "currency": "USD",
    "priceBasis": "Installed unit prices. 'bid' = contractor unit bid price (includes contractor overhead and profit, excludes owner engineering and contingency, WA sales tax may be extra). 'consumer' = retail cost-guide price (includes contractor markup). 'study' = agency unit-cost study (Phoenix: includes OH&P, general conditions and sales tax; Houston: also includes 20% engineering and contingency). 'derived' = built from the component prices in this file. 'fee' = agency charge. 'estimate' = no source found, engineering judgment.",
    "seattleMethod": "Western Washington bid data (WSDOT Northwest Region 2023-2026, Renton 2024 award, Federal Way 2026, Puyallup 2025, Mercer Island 2023-2024 engineer's estimates, Kennewick 2025/26) plus SPU/SDOT/King County fees; component build-up where no local bid item exists. No RSMeans location factor applied."
  },
  "allIn": {
    "side-sewer-yard": {"national": [60, 250], "seattle": [120, 350], "unit": "linear ft", "basis": "consumer+bid"},
    "side-sewer-to-street": {"national": [150, 450], "seattle": [350, 900], "unit": "linear ft", "basis": "derived", "note": "Blended over a 60-80 LF run with 20-40 LF in the street. The street segment alone is national 150-600 and Seattle 500-1,400 $/LF; the street part costs about $20k-$60k total in Seattle."},
    "sewer-main-street": {"national": [350, 1100], "seattle": [800, 1600], "unit": "linear ft", "basis": "bid+study", "note": "Renton WA 2024 award $1,041/LF; EPA CWNS curve $1,120/ft at 300 LF; deep, arterial or groundwater jobs run 2,000-3,200."},
    "storm-street": {"national": [200, 600], "seattle": [350, 900], "unit": "linear ft", "basis": "study+derived"},
    "water-main-street": {"national": [250, 600], "seattle": [450, 1000], "unit": "linear ft", "basis": "study+bid", "note": "Short runs (~300 LF) sit at the high end."},
    "water-service-yard": {"national": [50, 150], "seattle": [75, 250], "unit": "linear ft", "basis": "consumer+bid"}
  },
  "components": [
    {"item": "Trench excavation + backfill, 0-5 ft deep", "unit": "linear ft", "national": [15, 40], "seattle": [40, 85], "basis": "derived"},
    {"item": "Trench excavation + backfill, 5-10 ft deep", "unit": "linear ft", "national": [25, 60], "seattle": [95, 185], "basis": "derived"},
    {"item": "Trench excavation + backfill, 10-15 ft deep", "unit": "linear ft", "national": [45, 110], "seattle": [180, 350], "basis": "derived"},
    {"item": "Shoring / trench safety system", "unit": "linear ft", "national": [2, 15], "seattle": [10, 50], "basis": "bid"},
    {"item": "CDF (controlled density fill) backfill", "unit": "cubic yard", "national": [165, 300], "seattle": [165, 400], "basis": "bid"},
    {"item": "PVC sewer pipe 6 in, supplied and laid (bedding incl.)", "unit": "linear ft", "national": [55, 125], "seattle": [90, 225], "basis": "bid"},
    {"item": "PVC sewer pipe 8 in, supplied and laid (bedding incl.)", "unit": "linear ft", "national": [70, 150], "seattle": [92, 225], "basis": "bid"},
    {"item": "Sewer pipe 12 in (PVC/DI), supplied and laid", "unit": "linear ft", "national": [100, 200], "seattle": [140, 275], "basis": "bid+derived"},
    {"item": "DI water main 8-12 in, supplied and laid", "unit": "linear ft", "national": [85, 280], "seattle": [170, 410], "basis": "bid"},
    {"item": "Storm pipe 12 in (RCP/PVC/DI), supplied and laid", "unit": "linear ft", "national": [60, 150], "seattle": [70, 185], "basis": "bid"},
    {"item": "Storm pipe 24 in RCP, supplied and laid", "unit": "linear ft", "national": [100, 220], "seattle": [150, 300], "basis": "bid+derived"},
    {"item": "Precast manhole 48 in, 0-10 ft", "unit": "each", "national": [3400, 13000], "seattle": [4650, 15000], "basis": "bid"},
    {"item": "Manhole extra depth beyond base height", "unit": "vertical ft", "national": [100, 400], "seattle": [100, 400], "basis": "bid (low confidence)"},
    {"item": "Sewer cleanout", "unit": "each", "national": [900, 2500], "seattle": [900, 4560], "basis": "bid"},
    {"item": "Side sewer / service reconnection to new main", "unit": "each", "national": [450, 7500], "seattle": [1500, 7500], "basis": "bid"},
    {"item": "New connection to existing main or manhole", "unit": "each", "national": [3000, 13500], "seattle": [2500, 10250], "basis": "bid"},
    {"item": "Seattle SPU new water service, 3/4 in (tap install + water and sewer SDCs)", "unit": "each", "national": null, "seattle": [14300, 15675], "basis": "fee"},
    {"item": "King County sewage capacity charge, new connection (15-yr total)", "unit": "each", "national": null, "seattle": [14038, 14038], "basis": "fee"},
    {"item": "Saw-cut asphalt", "unit": "linear ft", "national": [1.5, 3], "seattle": [4, 6.5], "basis": "bid"},
    {"item": "Remove asphalt pavement", "unit": "square yard", "national": [3, 5], "seattle": [20, 96], "basis": "bid"},
    {"item": "Permanent HMA trench patch (full depth)", "unit": "square yard", "national": [40, 150], "seattle": [70, 200], "basis": "bid"},
    {"item": "Grind and overlay (plane + 2 in HMA)", "unit": "square yard", "national": [10, 25], "seattle": [16, 45], "basis": "bid+derived"},
    {"item": "Flaggers", "unit": "hour", "national": [45, 80], "seattle": [60, 110], "basis": "bid (national = estimate)"},
    {"item": "Traffic control, lane closure (2 flaggers + devices + supervisor)", "unit": "day", "national": [1000, 2000], "seattle": [1400, 2900], "basis": "derived"},
    {"item": "Bypass pumping, 4-12 in", "unit": "day", "national": [500, 15000], "seattle": [1000, 8000], "basis": "bid (Seattle derived)"},
    {"item": "Dewatering, sump to wellpoint", "unit": "day", "national": [300, 2500], "seattle": [500, 3500], "basis": "estimate"},
    {"item": "CCTV inspection, post-construction", "unit": "linear ft", "national": [1, 3], "seattle": [2, 6], "basis": "bid (Seattle derived)"},
    {"item": "Air/mandrel testing incl. TV", "unit": "linear ft", "national": [5, 17], "seattle": [14, 17], "basis": "bid"},
    {"item": "Mobilization", "unit": "percent of job", "national": [5, 10], "seattle": [5, 10], "basis": "bid"},
    {"item": "ROW / street-use permit", "unit": "per permit", "national": [100, 500], "seattle": [1768, 5000], "basis": "fee (Seattle upper bound unverified)"},
    {"item": "Side sewer permit", "unit": "per permit", "national": [100, 500], "seattle": [500, 1200], "basis": "consumer"},
    {"item": "CIPP lining 8 in (trenchless alternative)", "unit": "linear ft", "national": [42, 60], "seattle": [125, 160], "basis": "bid (Seattle = engineer's estimate incl. service seals)"},
    {"item": "Gate valve 6-12 in", "unit": "each", "national": [2600, 11000], "seattle": [4000, 5250], "basis": "bid"},
    {"item": "Fire hydrant assembly", "unit": "each", "national": [7450, 16000], "seattle": [8150, 12000], "basis": "bid (Seattle upper bound estimate)"}
  ]
}
```

## 8. Source list (URLs)

- WSDOT Unit Bid Analysis (live query 2026-09-18): https://wsdot.wa.gov/Biz/CONTAA/UBA/
- Renton Sanitary Sewer Replacement Phases 1 and 2 (awards 8/5/2024 and 6/2/2025): https://www.rentonwa.gov/Projects-Development/Public-Works-Projects/Current-Projects-and-Programs/Renton-Sanitary-Sewer-Replacement-Project-Phases-1-and-2
- Federal Way 2026 Asphalt Overlay bid tab: https://www.federalwaywa.gov/sites/default/files/2026-01/2026%20ASPHALT%20OVERLAY%2012526%20-%20BID%20TAB.pdf
- Puyallup 7th Ave SE bid tab (Nov 2025): https://www.puyallupwa.gov/DocumentCenter/View/24899/Bid_Tab_7th_Ave_SE_EX
- Mercer Island bids 23-02, 23-03, 24-17 and 24-22: https://www.mercerisland.gov/publicworks/page/23-03-bid-basin-61-sewer-pipe-upsizing-project , https://www.mercerisland.gov/publicworks/page/23-02-bid-basin40-cipp-sewer-lining-project , https://www.mercerisland.gov/publicworks/page/24-17-bid-2024-asbestos-cement-ac-water-main-replacement-project , https://www.mercerisland.gov/publicworks/page/24-22-bid-2024-water-system-improvements
- Kennewick Zone 1 Transmission Improvements Ph 1 bid tab: https://www.go2kennewick.com/DocumentCenter/View/17479/Contract-Bid-Tabulation---P2512-26-Zone-1-Transmission-Improvements-PH-1
- SPU DSO Charge Menu v13.1 (1/1/2026): https://www.seattle.gov/documents/Departments/SPU/construction-resources/development-services-office/DSO-Charge-Menu.pdf
- SPU Strategic Business Plan 2021-26, side sewer priority: https://www.seattle.gov/documents/departments/spu/aboutus/sbp_2021-2026_strategic_priority_side_sewer.pdf
- SPU 2026-2031 Water CIP: https://www.seattle.gov/documents/Departments/FinanceDepartment/2631poposedcip/SPU_Water_cip.pdf
- King County capacity charge: https://kingcounty.gov/en/dept/dnrp/waste-services/wastewater-treatment/sewer-system-services/capacity-charge/about
- City of Phoenix Water and Wastewater Unit Cost Study (Aug 2024): https://www.phoenix.gov/content/dam/phoenix/pddsite/documents/impact-fees/2025-if-update/Water%20and%20Wastewater%20Unit%20Cost%20Study_08142024_v2.pdf
- US EPA 2022 CWNS Cost Estimation Tool Methods (May 2024): https://www.epa.gov/system/files/documents/2024-05/2022-cwns-cost-estimation-tool-methods.pdf
- Houston Storm Sewer Unit Cost Rates (1/6/2023): https://houstontx.gov/citysec/HPW/stormunitcost.pdf
- WisDOT Average Unit Price List (10/21/2025): https://wisconsindot.gov/hccidocs/contracting-info/average-unit-price.pdf
- TxDOT statewide averages via Caliche (2026): https://caliche.io/ground-truth/txdot-unit-prices-texas
- Leominster MA Sewer, Drainage, Water Construction Services 2025 re-bid: https://leominster-ma.gov/DocumentCenter/View/3802/Sewer-Drainage-Water-Construction-Services-2025-Re-Bid?bidId=
- Neenah WI Contract 1-24 bid tab (2024): https://www.ci.neenah.wi.us/wp-content/uploads/2024/02/Bid-Tab-without-Engineer-Estimate.pdf
- Forney TX bid tab (2/27/2024): https://www.forneytx.gov/AgendaCenter/ViewFile/Item/10228?fileID=18334
- Hastings MN 2025 sewer lining bid tab: https://www.hastingsmn.gov/media/3ain21j0/2025-sanitary-sewer-lining-bid-tab.pdf
- HomeAdvisor main water line cost (updated June 2026): https://www.homeadvisor.com/cost/plumbing/install-a-water-main/
- Angi Seattle sewer line replacement: https://www.angi.com/articles/how-much-does-sewer-line-replacement-or-repair-cost/wa/seattle
- On Pattison, Seattle sewer line installation cost 2026 (Apr 13 2026): https://onpattison.com/news/2026/apr/13/sewer-line-installation-cost-seattle-2026/

## Appendix A: raw WSDOT Unit Bid Analysis low bids, 2023 to 8/2026 (verified live 2026-09-18)

Regions: NWR = Northwest (Seattle area), OR = Olympic, SWR = Southwest, SCR = South Central, NCR = North Central, ER = Eastern, MR = Marine. Prices are low-bid unit prices.

| Item | Unit | NWR low bids | Other regions / statewide |
|---|---|---|---|
| PVC sanitary sewer pipe 4 in | LF | - | SCR 2024 $56; MR 2025 $88.91 |
| PVC sanitary sewer pipe 6 in | LF | $90.35 (2nd $120, 3rd $225), contract XE3594, 1/27/2025 | MR 2025 $122.25 |
| PVC sanitary sewer pipe 8 in | LF | $92.50 (2nd $144, 3rd $225), XE3594, 1/27/2025 | - |
| Ductile iron sewer pipe 10 in | LF | $142.70, XE3596, 2/3/2025 | - |
| Testing sewer pipe | LF | $14.00 (2025) | MR 2025 $16.67 |
| Testing storm sewer pipe | LF | $2-$17 (median $5) | statewide median $5 (n=22) |
| Sewer cleanout | EA | - | $1,610 / $3,556 / $4,560 |
| Manhole 48 in Type 1 / Type 3 | EA | $4,650 / $4,776 | - |
| Manhole additional height 48 in | VF | $101.20 | - |
| Catch basin Type 2 48 in | EA | $3,600-$5,616 (median $4,998) | statewide median $5,440 (n=12) |
| Catch basin Type 1 | EA | $1,950-$6,413 | statewide median $2,613 (n=22) |
| Drop manhole connection | EA | $10,250 | - |
| Connection to drainage structure | EA | $1,316-$5,565 (median $2,453) | - |
| RCP storm 12 in (Cl III/IV/V) | LF | $100-$183 | OR $80-$232 |
| RCP storm 18 in | LF | $100-$134 | OR $105-$155 |
| RCP storm 24 in Cl V | LF | - | OR 2023 $205 |
| Schedule A storm pipe 12 / 18 / 24 in | LF | 12 in $40-$120; 18 in $80 | statewide median $78 / $97 / $109 |
| DI water main 8 / 10 / 12 in | LF | 10 in $410; 12 in $172 | 8 in $277.83 |
| Gate valve 6 / 8 / 10 / 12 in | EA | 10 in $5,250; 12 in $5,135 | 6 in $4,000; 8 in $5,001 |
| Hydrant assembly | EA | $8,150 | - |
| Water service connection 1 in / 2 in | EA | - | $4,600 / $8,891-$11,500 |
| Structure excavation Class B incl. haul | CY | $15-$100 (median $31.50, n=11) | - |
| Shoring or extra excavation Class B | SF | $1-$5 (median $2, n=9) | - |
| Controlled density fill | CY | $150-$1,250 (median $758, n=4) | - |
| Gravel borrow incl. haul | TON | $15-$75 (median $34.75, n=6) | - |
| Select borrow incl. haul | TON | $14-$176 (median $67, n=7) | - |
| Removing asphalt concrete pavement | SY | $20-$96 (median $62.50, n=4) | - |
| Pavement repair excavation incl. haul | SY | $6-$265 (median $60, n=10) | - |
| HMA for pavement repair Cl 1/2 in | TON | $195-$590 (median $320, n=10) | - |
| HMA Cl 1/2 in | TON | $103-$750 (median $175, n=21) | - |
| Planing bituminous pavement | SY | median $8.50 (n=27) | - |
| Crushed surfacing base course | TON | median $75 (n=26) | - |
| Flaggers | HR | $74-$110 (median $86, n=4) | - |
| Other traffic control labor | HR | $71-$355 (median $98, n=11) | - |
| Contractor-provided uniformed police officer | HR | $146-$250 | - |
| Force account potholing utilities | EST | $4,800-$35,000 (median $7,500) | - |
