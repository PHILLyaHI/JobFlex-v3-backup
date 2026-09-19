// The REMODEL ESTIMATING METHOD — the prompt text itself (2026-09-18).
//
// Owner: "need deep prompt what to price out — if replacing a sink it needs
// to understand the under-sink plumbing or that there is a disposal … the
// right item lines, think smart." Six domain rulebooks were drafted, each
// attacked by a master plumber/electrician reviewer and a production
// estimator reviewer, and synthesized into these parts. index.ts picks the
// parts a brief needs; the admin can override each on /admin/prompts.
// Generated from the reviewed parts; edit here, or override in the admin.
// No backticks or template placeholders may appear in the text.

/** Section 1 — how to read a remodel brief. */
export const REMODEL_READ = `## 1. HOW TO READ A REMODEL BRIEF

### 1.1 Six connections: the first rule
Every fixture or appliance has six connections. Adding, replacing or moving one prices every connection the work touches, as its own line or named inside the fixture's line. The fixture alone is never the job.
1. FEED: water (stops, supply lines, valve) or gas (shutoff, a new listed connector).
2. DRAIN AND VENT: strainer, trap, tailpieces, continuous waste, dishwasher branch, closet flange and wax ring, waste-and-overflow, a vent within the trap-arm limit.
3. POWER: the circuit; the receptacle, switch, cord or hardwire connection; GFCI and AFCI protection where the location requires them.
4. EXHAUST: duct, damper and cap to the outdoors.
5. HOLD: blocking, brackets, clips, the mounting ring, the cabinet or counter it sits in (cutout, sink-base floor, support).
6. SURFACE: the caulk joint, the patch, the tile repair and the paint around it.
Walk all six for each fixture the brief names. An untouched connection gets no line; a touched one is never free.
- Sink, faucet or disposal work prints its under-sink plumbing as its own line the client sees: trap, tailpieces, continuous waste or dishwasher branch, supply lines, and the angle stops when they must be replaced (multi-turn, seized or weeping; a quarter-turn stop under about 15 years old stays).
- "Replace the kitchen sink", faucet staying. Feed: the faucet's own hoses back on the stops; when a stop is replaced, the HOT one becomes a dual-outlet stop that also feeds the dishwasher. Drain: one basket strainer per bowl without a disposal, a 1-1/2 in. tubular trap kit, the waste to the disposal outlet, the dishwasher hose on the disposal inlet with a high loop, or the listed air gap UPC jurisdictions require. Power: the disposal plugged back in, or re-terminated by an electrician when hardwired. Exhaust: none. Hold: clips; the disposal's mounting assembly moved to the new bowl (new only when corroded or the brand changes). Surface: silicone at the rim inside the set line; the cutout enlarged when the new sink's template differs.
- "Add a bath fan". Power: its own switch, plus a humidity or timer control where the jurisdiction requires one. Exhaust: duct, insulated through a cold attic, to a roof or wall cap with a damper. Hold: the housing between the joists. Surface: the ceiling patch and paint.

### 1.2 Stated, implied, unknown
- STATED: the quantities, sizes, materials, prices, fixtures and place the brief names. Binding (the brief rules). The place sets the code family (WA, CA, OR and the other UPC jurisdictions plumb by the UPC; the jurisdiction decides), the market (section 8) and local lines (Washington: the asbestos survey at any age, 5.8).
- IMPLIED: what the stated work cannot be finished without: the connections it touches (1.1), the surfaces it opens, the code items the replaced or added part triggers, and the lines of section 5. The client pays for them either way; the estimate says so first.
- UNKNOWN: what nobody sees until demolition (rot, galvanized pipe, a drum trap, old wiring, asbestos). Never a silent line: the change-order clause in notes, a named allowance only when the brief, a photo or an answer points at it (5.9), a question only when the answer moves the price (section 6).

### 1.3 Three levels of implied work (name the level in notes)
1. LIKE-FOR-LIKE: same fixture type, same place, same connections. Lines: remove and haul; set the new one; reconnect what it disconnects; replace the parts that do not survive (wax ring and bolts, a trap that no longer lines up, a stop that will not close); the test sits inside the set line. Code attaches only to the part replaced: a replaced shower valve is pressure-balance or thermostatic; a replaced receptacle is tamper-resistant, and GFCI or AFCI where the location now requires it. Four to seven lines; permits per 5.2.
2. UPGRADE IN PLACE: same place, different size, type or load (undermount for a drop-in, a deeper or apron-front bowl, a wider vanity, induction for gas, a larger hood, a heavier tub). Add what the difference touches: the cutout or a new top, the drain stub height, the floor and wall the old footprint covered, a new circuit or gas line, the cabinet modification, the blocking; a permit when a circuit, pipe or duct is added.
3. RELOCATION: a drain, vent, supply, gas line, circuit, duct or wall moves. Add the run by the linear ft, its vent, the floor, wall or ceiling opened along the route with its patch and paint, the old location cut back and capped at the fitting and patched, the permit with rough and final inspections, and two trips per trade; on a slab, the saw-cut trench and the concrete patch.

### 1.4 The assumption ladder (the brief is silent)
1. Assume the standard case: layout in place; standard grade (1.7); 8 ft ceilings; a wood-framed floor with a crawlspace or unfinished basement below; copper or PEX supply and ABS or PVC drains; quarter-turn stops; a second working bathroom; a 200 A panel with open spaces; built 1978 or later; the existing range fuel kept; appliances supplied by the owner (set-and-connect lines only); plumbing fixtures, lights and finishes supplied by the contractor at named standard allowances (1.5).
2. State each assumption in notes in one clause: "Priced with the sink in its current location." "Priced as a non-bearing wall; the beam is an option."
3. Price the alternative the client may want as an [option] line (the bearing beam, an acrylic surround, a vented hood), never as a hidden line or a question.
4. A likely but unseen condition is a [when …] line whose condition names it, or the change-order clause; never a default line.
5. Never ask a preference (section 6).

### 1.5 Allowances are lines
- An allowance is a material the client selects later. Write the line of work in the unit the item is sold in, naming the item, its standard spec and "allowance, owner-selected". The material price is the allowance (amounts in section 8); the labor is the real install at the real quantity on the same line; the notes give the amount and say a selection above or below it is billed at the difference.
  - Vanity allowance, owner-selected: 36 in. single-sink vanity with a cultured-marble or quartz top, set level and screwed to the studs — unit
  - Wall tile allowance, owner-selected: 12x24 porcelain on modified thinset with leveling clips, grouted — sqft
  - Base cabinet allowance, owner-selected: semi-custom Shaker boxes set, leveled, scribed and screwed to the studs — linear ft
- Never an allowance for labor, never one without an item and a spec, never a bare "Allowance".

### 1.6 Room dimensions into quantities (compute, never guess; a stated number wins)
- Floor: length times width (12x14 is 168 sqft). Subtract what the new floor does not go under: a tub (a 60x30 tub covers 12.5 sqft), a vanity it stops at, cabinets when floating LVP stops at the toe kick (tile, nail-down wood and glue-down go under new cabinets). A 5x8 bath with a tub: 40 sqft gross, about 27 of tile.
- Perimeter: twice the sum of length and width (12x14 is 52 linear ft; 5x8 is 26).
- Walls to a height: perimeter times the height, minus each door (about 17 sqft for a 30-32 in. door) and each window, minus tiled or cabinet-covered wall when the line is paint. A 5x8 bath, 8 ft ceiling, tub walls tiled 72 in. above the rim: 208, less 17 for the door, less about 62 of tile, leaves about 130 of wall paint, plus 40 of ceiling.
- Ceiling: the floor area on a flat ceiling.
- Tub or shower walls: add the lengths of the walls that get tile (a 60x32 alcove: 5 + 2.67 + 2.67 = 10.3 linear ft), then multiply by the tile height. Rim to 72 in. above it: about 62 sqft; rim to an 8 ft ceiling: about 70; a shower from the floor to an 8 ft ceiling: about 83. Shower floor 60x32: 13 sqft; shower ceiling: about 13.
- Waterproofing: the tiled wet walls and the curb, plus the pan area over a foam tray (nothing over a mud-pan liner). Backer board: the wet walls to the tile height.
- Base: perimeter minus doorways and the runs covered by cabinets, a vanity or a tub (12x14 with two 3 ft doorways: 46 linear ft). Casing: about 17 linear ft per face of a 30-32 in. door.
- Counters: the run in linear ft times 2.1 ft (25.5 in. deep), plus islands and overhangs at their own size (20 linear ft is about 42 sqft). Backsplash: the run times 1.5 ft (18 in. to the uppers), plus the range wall to the hood, minus windows; about 15-25 sqft per 10 linear ft of counter.
- Cabinets: base and wall runs each in linear ft; tall cabinets and fillers by the unit; hardware is doors plus drawers (30-45 in a 12x14 kitchen).

### 1.7 Quality tiers (standard is the default; say which in notes)
- Budget: stock or RTA cabinets, laminate or prefab quartz, a 3-piece acrylic surround, 12x12 ceramic, builder-grade faucets, framed sliding glass, LVP, paint-grade trim. Labor stays the same: cheap tile sets as slowly as good tile.
- Standard: semi-custom Shaker cabinets (furniture-board box; plywood is an upgrade on most lines), 3 cm quartz, a tiled shower on a named bonded membrane system, 12x24 porcelain, Moen, Delta or Kohler fixtures, frameless 3/8 in. glass, 5-7 mm rigid-core LVP or engineered wood, primed MDF trim, 4 in. LED wafers, 3x6 ceramic subway.
- Luxury: custom inset cabinets, natural stone or porcelain slab, large-format or mosaic tile, thermostatic valves with body sprays, steam, heated floors, low-iron glass, hardwood, a lighting plan; labor rises 25-50% (layout, book-matching, mitered edges, Level 5 walls).
- A tier moves material 1.5 to 3 times and labor 1.0 to 1.5 times. It never adds or removes a line.

### 1.8 "Full remodel" means in kind
- A full or gut remodel replaces every finish, fixture and device the room has with a standard one of the same kind, each on its line: the existing ceiling or vanity light, the fan, the switches, receptacles and plates, the door hardware, the accessories.
- What the room did not have (recessed lights where there were none, under-cabinet lighting, pendants, an island, a relocated fixture, a heated floor) is an [option] unless the brief names it.
`;

/** Sections 3 and 4 — hidden-work chains and code triggers. */
export const REMODEL_CHAINS = `## 3. HIDDEN-WORK CHAINS
Walk the chain to its end the moment the brief names its first link; every arrow is work a pro prices. A [when] line goes on only when the brief, a photo, an answer or the physics of the job meet its condition; unasked extras are [option]. A chain line that names a procedure step's work replaces that step.
Every opened wall or ceiling is two lines: the patch (unit per opening up to about 4 sqft, sqft of the opening beyond that) and paint of that surface corner to corner (sqft of the whole wall or ceiling); painting whole rooms is an [option].
**Relocating any fixture** (sink, lavatory, toilet, shower, washer) → drain and vent rerouted within the trap-arm limit (a shower moves a 2 in. drain, a toilet a 3 in. closet bend and flange; a loop vent only at an island, an AAV only where the AHJ allows) → supplies extended → wall opened → the run reached from the crawl or an open basement, else the floor or the finished ceiling below opened, or a slab trenched → joists and ducts in the path → old outlets cut back to the fitting and capped (a capped stub is a dead leg) → patch and paint → floor patched at the old spot → rough inspection before anything closes.
- Sink or lavatory drain and vent relocated up to 6 ft in 1-1/2 in. PVC with a new trap arm, vent tied in 6 in. above the flood rim, 1/2 in. PEX hot and cold extended to new stub-outs — unit
- Old drain cut back to its branch fitting and capped, old supplies capped at the tee — unit
- Wall opened along the run and closed with 1/2 in. drywall, taped and texture matched — sqft
- [when the run cannot be reached from a crawl or an open basement] Subfloor cut along the run and closed with 3/4 in. plywood, or the finished ceiling below opened and patched — sqft
- [when the floor is a slab] Slab saw-cut 12 in. wide and trenched to the drain, backfilled and patched with 3,000 psi concrete — linear ft
- Finished floor patched at the old location and around the new one — sqft
**New flooring** → the floor height changes (LVP 1/4-3/8 in., tile on backer 5/8-3/4 in., 3/4 in. hardwood; carpet coming out can lower it) → toilet flange off the finished height → dishwasher trapped unless pulled first; a fridge may no longer fit under its cabinet → gas range out, connector replaced → doors drag → transitions at every doorway and material change → base off, or shoe added → registers, baseboard heaters and floor boxes raised → the top or bottom stair riser now differs from the rest.
- [when a toilet sits on the new floor] Toilet pulled before the floor and reset after on a new wax ring and closet bolts, with a flange extender to the finished height — unit
- [when a dishwasher sits on the new floor] Dishwasher disconnected (supply, drain, cord), pulled, floor run under it, reset, leveled and reconnected — unit
- [when the range is gas] Range disconnected at the shutoff and reset on a new listed flex connector, joints leak-tested — unit
- [when the new floor is thicker than the old] Interior doors trimmed at the bottom, jambs and casings undercut — unit
- Transitions (T-molding, reducer or threshold) at every doorway and material change — linear ft
- [when the base stays] Shoe molding along the base, painted — linear ft
**Opening or removing a wall** → find what lives in it before cutting (switches, receptacles, cut circuits, thermostat, low-voltage, a supply or a return, a drain or vent, water, gas) → each rerouted, never capped blind → cut circuits end in accessible boxes, AFCI on every circuit touched → receptacle spacing re-checked on the walls that remain (the code does not preserve the old count) → ceiling and floor strips where the plates stood (a dropped beam's wrap covers the ceiling strip) → patch and paint → a bearing wall adds the next chain.
- Switch boxes moved to the new jamb, 3-way where a light is now switched from two sides — unit
- [when a point on the remaining wall line is more than 6 ft from a receptacle] Receptacle added on the extended circuit — unit
- [when a return chase or a supply duct is in the wall] Return re-established with a new drop and grille, or the supply re-run to a new boot, never capped — unit
- [when a drain, vent, water or gas line is in the wall] Pipe rerouted in the next wall or the ceiling with its fall kept, gas re-tested — unit
- [when the thermostat, doorbell, alarm keypad or a data jack is on the wall] Device relocated with its low-voltage cable extended — unit
- Ceiling strip and wall ends patched in 1/2 in. drywall with corner bead, texture matched — sqft
- Floor strip where the plate stood laced in to match, or a transition — linear ft
**Removing a bearing wall** → engineer's letter → permit → shoring both sides → beam sized to the span, hangers only when it is flush → posts at each end → point loads carried down through squash blocks to the foundation, a footing where nothing bears below → a flush beam cuts every duct, drain and cable in its joist bays → a 3 in. stack in the wall cannot be notched around a beam (a question before the price) → framing inspection → beam wrapped, then the opening-a-wall chain.
- Engineer's letter sizing the beam, posts and footings — fixed
- Temporary shoring walls on both sides of the wall — linear ft
- LVL beam sized by the letter for the span, nailed or through-bolted per its schedule, set on post caps — unit
- Built-up stud posts at each end with squash blocking down to the foundation — unit
- [when nothing bears below a post] Pad footing sized to the load, slab cut and patched, or a pier dug in the crawl — unit
- [when the beam is flush] Joist hangers at the cut joists, and the ducts, drains and cables in those bays rerouted or boxed in a soffit — unit
- Building permit with the framing inspection — fixed
**A new or deeper sink, or new countertops over it** → a deeper bowl or a disposal drops the outlet below the wall stub → tee lowered → trap, tailpieces and continuous waste rebuilt → the disposal's mount moves to the new bowl → holes matched to the faucet and the UPC air gap → an undermount in a kept stone top is recut by the fabricator; a farmhouse sink cuts the sink base and, under stone, means a new top → new tops: the plumber disconnects before the template and returns after the install, the dishwasher goes on side brackets under stone, a gas cooktop is reset on a new connector, the tile course over the old splash is disturbed.
- Under-sink plumbing rebuilt: 1-1/2 in. PVC P-trap, trap arm, tailpieces and continuous waste to the wall stub with the dishwasher branch, a new trap adapter where the stub is old, braided supplies where the faucet has no integral hoses, quarter-turn stops matched to the stub only where the old ones are multi-turn, seized or weep (a dual-outlet stop on the hot for the dishwasher) — unit
- [when the new outlet sits below the wall stub] Sanitary tee lowered in the wall behind the sink base, the opening patched — unit
- [when a disposal goes on a new bowl] Disposal's mounting assembly moved to the new bowl in fresh putty, an extended flange on cast iron or fireclay — unit
- [when the holes do not match the faucet or the UPC air gap] Holes cored in the stone or covered with a deck plate — unit
- [when the countertops are replaced] Sink, faucet, disposal and dishwasher disconnected before the template, reset and reconnected on a second visit after the install — unit
**Tub to shower** → the tub's 1-1/2 in. drain becomes a 2 in. trap, arm and branch at the pan's drain point (a drain never shrinks downstream) → floor opened at the trap, a slab cut and chipped (rot there one job in three: the moisture chain) → the wet vent checked → valve raised, anti-scald when replaced, spout drop capped → curb and blocking for the glass and niche → pan, board, membrane and tile per the procedure, no poly behind a bonded membrane → glass measured after tile, set on a second visit → a light or switch now inside the wet zone → a fan where the ventilation rule below requires one → apron line patched → the door checked against the curb and the glass swing.
- 2 in. P-trap moved to the shower drain point with a 2 in. trap arm and branch back to the first 2 in. drain and vent — unit
- [when the tub was wet-vented through a 1-1/2 in. lavatory drain, or the arm passes its limit] Wet vent up-sized to 2 in., or a new vent tied to the stack — unit
- Floor opened at the trap and along the drain, patched with 3/4 in. plywood or, on a slab, concrete — sqft
- Shower valve raised to 40-48 in. with the head arm at 78-80 in., spout drop capped, trim set, a new pressure-balance valve where the old one is two- or three-handle — unit
- [when a light, fan or switch now sits inside the wet zone] Light swapped for wet-listed trim (GFCI where its listing requires), switch moved out of the shower space — unit
- Tub apron line patched on the floor and the wall — sqft
**A bigger range or hood** → electric: a circuit sized to the nameplate (an old 3-wire 10-50 circuit cannot take a 14-50) → gas: a branch sized to the added BTU, a shutoff, a new connector, a witnessed test and a 120 V receptacle for the igniter → anti-tip bracket → hood: duct sized to the collar to an outdoor cap → makeup air over 400 CFM when an atmospheric appliance sits inside → the cabinet above cut for the chase → attic insulation, roofing or siding at the cap → patches.
- [when the range is electric] 240 V range circuit to the nameplate, 8-3 NM-B on 40 A or 6-3 on 50 A, to a NEMA 14-50 — unit
- [when the range is gas] Gas branch up to 25 ft in 1/2 in. black iron (3/4 in. if CSST) sized by the longest-length method, shutoff in the room within 6 ft, new listed connector, 3 psi 10-minute test — unit
- Rigid galvanized hood duct up to 15 ft sized to the hood collar (6 in. on most hoods to 600 CFM), seams foil-taped, through the cabinet above and the wall or attic — unit
- Roof cap flashed under the shingles, or a wall cap through the siding, with a backdraft damper, 3 ft from any operable window — unit
- [when over 400 CFM with an atmospheric gas appliance inside, or the AHJ requires it] Makeup-air damper interlocked with the hood, ducted outdoors — unit
**Adding a circuit** (disposal, dishwasher, microwave, heated floor, dryer, range, mini-split) → free panel spaces and service capacity (a subpanel adds spaces, not capacity; tandems only in a panel listed for them, and rarely as AFCI) → breaker type: AFCI, GFCI or dual-function where the room and location require them → homerun fished through finished walls and ceilings → every fishing hole patched (a 6 in. hole is 1 sqft, an opened stud bay its area) → permit and inspection.
- New 20 A circuit, 12-2 NM-B fished from the panel to the device box, dual-function AFCI/GFCI breaker where both are required — unit
- [when the panel has no free spaces] 100 A subpanel fed with 1-1-1-3 aluminum SER from a 100 A breaker — unit
- [when the service is 100 A or already carries electric heat, range or dryer] Load calculation for the existing dwelling (NEC 220.83) — fixed
- Fishing holes and wall openings patched, taped and texture matched — sqft
- Electrical permit and inspection — fixed
**New cabinets** → circuits, water and gas made safe first → tops, splash and sink come off (new tops are an [option] unless the brief names them) → the old floor stops at the old toe kick → the walls behind are raw → stub-outs, boxes and hardwired under-cabinet lights in the wrong place, their boxes kept accessible → a register or return under the new run → a soffit and what lives in it → hood height and duct → counters templated after the boxes are set; sink and dishwasher back after the counters (no sink for 10-14 days).
- Sink drain and supply stub-outs moved to the new sink base — unit
- Receptacles moved to the new counter and backsplash so no counter point is more than 24 in. from one, box extenders where tile is added — unit
- [when a floor register or return falls under the new run] Toe-kick register with a boot extension, or the return moved to an open wall — unit
- [when the new footprint differs from the old] Flooring patched where the old toe kick stopped it — sqft
- [when a soffit comes down] Hood duct, vent, duct or circuit inside it rerouted through the joist bays, fireblocking restored — unit
**Enlarging a window or door, or cutting a new one** → header sized (the IRC tables, or a letter when a bearing span runs past them), shored when the wall is bearing → cables, a vent or a baseboard heater crossing the opening → sheathing and siding cut past the opening → sill pan, jamb and head flashing, drip cap → siding woven in and painted a course beyond → interior returns, stool, apron and casing → insulation back in the cut bays → tempered where the location says → egress if it serves a bedroom → a door adds a landing and a switched exterior light → lead-safe before 1978.
- Header for the new opening sized by the IRC tables or the engineer's letter, with king and jack studs — unit
- [when a cable, vent or baseboard heater crosses the new opening] Cable, vent or heater rerouted around the opening, splices in accessible boxes — unit
- Sill pan, flashing tape at the jambs and head, and a drip cap — unit
- Sheathing and siding patched and woven past the cut, primed and painted a course beyond — sqft
- Interior drywall returns or extension jambs, stool, apron and casing — linear ft
**A soaking or freestanding tub** → filled, a stone or cast-iron soaker weighs about 1,000 lb on a few square feet → joists checked and sistered under it → drain moved to the tub's own outlet → floor opened and patched → floor filler roughed in and limited to 120°F → finished floor run under the whole footprint before the tub is set → slip joints left reachable → a 60-70 gal fill outruns a 40 gal heater (it fills a 70 gal soaker about two thirds hot).
- [when the filled tub outweighs what the joists carry] Joists under the tub footprint sistered full length, bearing to bearing — unit
- Tub drain and overflow relocated under the floor to the tub's outlet with a 1-1/2 in. trap, floor opened and patched — unit
- Floor-mount filler rough-in on blocking with 1/2 in. supplies (3/4 in. only where its rough-in calls for it) and an ASSE 1070 mixing valve — unit
- [option] 50 gal tank or tankless water heater sized to fill the tub hot — unit
**A basement bathroom below the sewer** (the sewer leaves through the wall above the slab) → sewage ejector → slab cut for the basin and the drains (2 in. minimum under a slab where the UPC governs) → a 2 in. vent up through the house to a stack or the roof, never an AAV → check valve and full-open shutoff on the discharge → high-water alarm and its own GFCI receptacle → rough inspection with the trench open → exhaust fan, heat and a 20 A GFCI circuit for the new room.
- Sewage ejector: basin at least 18 in. across and 24 in. deep with a gas-tight lid set in the slab, 2 in. solids-handling pump, 2 in. discharge with a check valve and a full-open shutoff, high-water alarm — unit
- Dedicated 20 A GFCI receptacle for the ejector and its alarm — unit
- 2 in. ejector vent tied to a stack or run through the roof, the chase through the floors above opened and patched — unit
- Slab saw-cut and trenched for the toilet, shower and lavatory drains in 3 in. and 2 in. PVC, gravel bed, 3,000 psi patch — linear ft
**Moisture or mold found on demolition** (unseen at estimate time: price it only when the brief, a photo or an answer names a leak, stain, smell or soft floor; otherwise an exclusion priced by change order) → the source found and fixed first → wet or moldy material cut out past the growth → framing and subfloor probed, rot replaced → dried below 16% and treated before closing → over 10 sqft of growth: containment and a licensed remediator with a clearance test → the ceiling below → rebuild.
- Moisture source traced and repaired (supply, drain, pan, flashing) — hour
- [when the growth is under 10 sqft] Moldy drywall and insulation cut out 12-24 in. past the growth, bagged, framing HEPA-vacuumed, treated with an EPA-registered antimicrobial and dried below 16% — sqft
- [when the growth exceeds 10 sqft] Containment with negative air and remediation by a licensed mold contractor with a clearance test — sqft
- [when the subfloor is soft] Subfloor cut back to joist centers and replaced with 3/4 in. T&G plywood glued and screwed, soft joists sistered — sqft

## 4. CODE TRIGGERS — touch X, the code forces Y
Adopted code editions and local amendments vary, and the jurisdiction's adopted code wins; where the UPC (WA, CA, OR, NV and others) differs from the IRC and IPC, both are given.
### Electrical
- Touch a receptacle (replace or add one) → the code forces it tamper-resistant, AFCI-protected in an AFCI room (NEC 406.4(D) on a replacement) and GFCI-protected in a bathroom, garage, outdoors, crawl space, any basement, laundry area (the 240 V dryer receptacle too), at a kitchen counter, within 6 ft of a sink and at a dishwasher (210.8; the 2023 edition adds every kitchen receptacle and the range, oven, cooktop, microwave and dryer outlets) → Tamper-resistant 20 A GFCI receptacle with a new plate — unit
- Touch a circuit in a kitchen, bedroom, living, dining or family room, den, hall, closet or laundry (add an outlet, or extend, splice or reroute it) → the code forces AFCI protection for the whole circuit, exempting only an extension of 6 ft or less with no new outlet (NEC 210.12) → AFCI or dual-function breaker, or an AFCI device at the first outlet — unit
- Touch a kitchen counter → the code forces two 20 A small-appliance circuits serving only the counter, dining and pantry receptacles (no disposal, dishwasher, microwave or lights on them), receptacles so no counter point is more than 24 in. from one (one every 48 in.), and an island or peninsula receptacle, or under the 2023 NEC a box for one, never below a seating overhang deeper than 6 in. (NEC 210.11(C)(1), 210.52(B), 210.52(C)); a dedicated disposal or dishwasher circuit is practice, not code → 20 A tamper-resistant GFCI countertop receptacle — unit
- Touch a bathroom's receptacles or lights → the code forces a 20 A receptacle circuit (NEC 210.11(C)(3)), a receptacle within 3 ft of each basin on new work (210.52(D); a vanity swap triggers nothing), no receptacle or switch inside the tub or shower space (406.9(C), 404.4(C)), no pendant, track, cord-hung fixture or paddle fan within 3 ft horizontally and 8 ft above the tub rim or shower threshold, and a fixture over the tub or shower damp-listed, wet-listed where spray reaches (410.10(D)) → Recessed LED trim listed for wet locations over the shower — unit
- Touch a laundry, range or dryer circuit → the code forces a 20 A laundry receptacle circuit (NEC 210.11(C)(2)) and four wires on any new range or dryer circuit; an existing 3-wire 10-30 or 10-50 stays only while its circuit is untouched, and a 14-30 or 14-50 never goes on it (250.140) → 30 A 240 V dryer circuit, 10-3 NM-B to a NEMA 14-30R, 4-wire cord on the dryer — unit
- Touch a wall or ceiling holding a cut circuit, or add a switch box → the code forces splices in boxes that stay accessible (NEC 314.29), or a listed NM splice kit where a cable is repaired in place, and a neutral in every new switch box (404.2(C)); a switch swapped in an old box needs none → Accessible junction box with a blank cover — unit
- Touch the service or the space around the panel → the code forces a whole-house surge protective device (NEC 230.67), an outdoor emergency disconnect (230.85) and water and gas piping bonded (250.104) on a new or replaced service, and working space 30 in. wide, 36 in. deep and 6 ft 6 in. high, never in a closet or bathroom (110.26, 240.24); a panel swap does not force AFCI or GFCI onto existing circuits → Whole-house Type 2 surge protective device — unit
### Plumbing
- Touch a tub or shower valve (replace it, or strip the wall around it) or add a tub filler → the code forces every valve installed or replaced to be pressure-balance, thermostatic or combination, limited to 120°F (IRC P2708.4), and a tub filler limited to 120°F by an ASSE 1070 device (P2713.3); a working pressure-balance valve may stay → [when the existing valve is two- or three-handle] Pressure-balance valve with integral stops and trim — unit
- Touch a fixture drain → the code forces minimum sizes: shower 2 in., tub and kitchen sink 1-1/2 in., lavatory 1-1/4 in. trap, toilet 3 in., washer standpipe 2 in. (IRC Table P3201.7), the standpipe 18-42 in. above its trap weir (18-30 in. under the UPC), 2 in. minimum under a slab where the UPC governs, and no reduction downstream → 2 in. shower trap and trap arm — unit
- Touch a trap arm (move or add a fixture) → the code forces a vent within the trap-arm limit (1-1/2 in.: 6 ft IPC, 3 ft 6 in. UPC; 2 in.: 8 ft IPC, 5 ft UPC; 3 in.: 12 ft IPC, 6 ft UPC) tied in 6 in. above the flood rim, an island loop vent with a foot vent and a cleanout at an island sink (UPC 909, IPC 916), an AAV only where the AHJ allows, and one trap may serve two lavatories whose outlets are within 30 in. → Vent run from the trap arm to the vent system — linear ft
- Touch a dishwasher drain → the code forces a listed air gap on the counter or sink deck where the UPC governs (UPC 807.3); the IPC accepts a high loop → Dishwasher air gap in a hole cored for it — unit
- Touch the water heater (replace or move it) → the code forces a T&P discharge line to within 6 in. of the floor or outdoors, a pan with a drain where a leak would damage the building (IRC P2801), an expansion tank when a PRV, check valve or backflow device closes the system (P2903.4), seismic straps in seismic zones, and an 18 in. garage stand only for a non-FVIR heater or where the UPC governs → [when the system is closed] 2 gal thermal expansion tank on the cold inlet — unit
- Touch the layout (move a toilet, build or enlarge a shower) → the code forces 15 in. from the toilet centerline to any side wall or fixture and 21 in. clear in front (IRC R307), 24 in. under the UPC (402.5), and a shower of 900 sq in. holding a 30 in. circle (P2708.1), 1,024 sq in. under the UPC (408.6), with a 22 in. clear opening → [when the layout falls short] Partition moved to make the clearance — linear ft
- Touch an old tub or lavatory drain → the code forces a vented P-trap in place of any drum trap or S-trap, neither of which is reconnected (UPC 1004.1, IPC 1002.3) → [when one is found] 1-1/2 in. P-trap with a vented trap arm in its place — unit
### Gas
- Touch gas piping (add, extend or move a line) → the code forces sizing by the longest-length method for the whole connected load (IRC G2413), a test of at least 3 psi for 10 minutes before it is concealed (G2417), and yellow CSST bonded with 6 AWG copper to the grounding electrode system (G2411; arc-resistant black CSST follows its own listing) → Gas pressure test and inspection — fixed
- Touch a gas appliance (set, move or reconnect it) → the code forces a shutoff in the same room within 6 ft (IRC G2420), a listed connector no longer than 6 ft for a range or dryer and 3 ft for others (G2422) and never reused (its listing), and a sediment trap except at a range, dryer, outdoor grill or decorative appliance (G2419) → New listed flex connector and quarter-turn shutoff — unit
- Touch the room around a gas appliance (close it in a closet, finish the basement or convert the garage around it) → the code forces combustion air by two openings within 12 in. of the top and bottom, each 1 sq in. per 1,000 Btu/h from inside the house, a louvered door of equal free area or ducted outdoor air (IRC G2407); no rated door, and no fuel appliance opening into a bedroom or bathroom unless it is direct-vent → Combustion-air grilles or a louvered door at the appliance room — unit
### Ventilation and mechanical
- Touch a bathroom with a tub or shower (build one, or gut one under permit) → the code forces exhaust ducted outdoors, never into an attic or soffit, at 50 CFM intermittent or 20 CFM continuous (IRC M1505), unless a 3 sqft window, half openable, serves under the unamended IRC (R303.3); WA, CA and the ASHRAE 62.2 states require the fan regardless, CA with a humidity control, WA often as the whole-house fan on a 24-hour control → 80 CFM fan with a 4 in. duct to a damper cap — unit
- Touch a range hood (add, upsize or re-duct it) → the code forces a ducted hood to run smooth metal duct with a backdraft damper outdoors (a listed ductless hood is allowed, except where WA and CA require outdoor kitchen exhaust on a remodel), and over 400 CFM makeup air where an atmospherically vented fuel appliance sits inside the house or the AHJ keeps the older rule → [when over 400 CFM with an atmospheric appliance inside] Makeup-air damper interlocked with the hood — unit
- Touch a dryer vent → the code forces 4 in. smooth metal duct with no screws into the airstream, a backdraft damper and no screen at the cap, 35 ft equivalent length with each mitered 90° deducting 5 ft (smooth-radius elbows less) or a listed booster past it (IRC M1502), and a 100 sq in. makeup-air opening when the dryer sits in a closet → 4 in. rigid dryer duct to a damper cap — unit
### Structural and egress
- Touch a bearing wall (remove it or cut an opening in it) → the code forces a header or beam sized by the IRC header tables (R602.7) or by an engineer, a continuous load path to the foundation and a permit with a framing inspection; a full wall removal carries an engineer's letter in most AHJs → [when the span, the load or the AHJ goes beyond the tables] Engineer's letter for the beam, posts and footings — fixed
- Touch a joist (drill or notch it for a pipe or duct) → the code forces holes no wider than a third of the joist depth and 2 in. from either edge, and no notch in the middle third of the span (IRC R502.8.1; I-joists follow the maker's hole chart), so a 3 in. closet bend fits through no 2x10 or smaller → Joist headed off with doubled headers and hangers — unit
- Touch a sleeping room (create one anywhere, basement included, or change its window) → the code forces an emergency escape opening of 5.7 sqft net clear (5.0 sqft at grade or below), 24 in. high, 20 in. wide, sill within 44 in. of the floor, and below grade a 9 sqft well with a 36 in. projection and a ladder past 44 in. deep (IRC R310); a replacement window of the largest standard size that fits the existing opening is exempt → Egress window with well, drain and ladder — unit
- Touch a stair (rebuild it, or change the floor at its top or bottom) → the code forces risers no taller than 7-3/4 in. and within 3/8 in. of each other, treads at least 10 in., a 34-38 in. handrail on four or more risers and a 36 in. guard where the drop exceeds 30 in.; an existing stair left alone stays as built → [when a new floor changes the top or bottom riser by more than 3/8 in.] Riser trimmed or nosing reset — unit
- Touch a required exterior door (replace, move or add one) → the code forces a landing within 1-1/2 in. of the threshold where the door swings over it, 7-3/4 in. where it does not (IRC R311.3.1), the inside floor within 1-1/2 in., and a switched light outside a grade-level entrance (NEC 210.70) → Landing or step at the new threshold — unit
- Touch a wall, ceiling or door between the garage and the house → the code forces 1/2 in. gypsum on the garage side of the walls, 5/8 in. Type X on a ceiling under living space (IRC R302.6), a 1-3/8 in. solid or 20-minute door, self-closing under current editions (self-latching in CA) and never into a bedroom (R302.5.1), and ducts through it in 26 ga steel with no opening into the garage (R302.5.2); a basement ceiling or a furnace room takes no Type X → 5/8 in. Type X drywall on the garage ceiling — sqft
### Glazing and safety
- Touch glass (a new or replaced window, door or enclosure) in any door, in or beside a tub or shower with its bottom edge under 60 in. above the standing surface, within 24 in. of a door's edge with its bottom under 60 in., in a pane over 9 sqft whose bottom is under 18 in. and top over 36 in. within 36 in. of a walking surface, or beside a stair or landing with its bottom under 36 in. → the code forces safety glazing (IRC R308.4) → Tempered glass unit, ordered tempered — unit
- Touch the house under a building permit for an interior alteration, repair or addition (an electrical permit too where the AHJ applies it; exterior-only work is exempt, plumbing- and mechanical-only work is exempt from the smoke alarms, and from the CO alarms only when no fuel-burning appliance is added or replaced) → the code forces smoke alarms in every bedroom, outside each sleeping area and on every level, and CO alarms outside each sleeping area and on each level where there is a fuel appliance or an attached garage, hardwired and interconnected where the finish is open, battery where it is not (IRC R314.2.2, R315.2.2) → Smoke or CO alarm, counted by location — unit
- Touch paint in a house built before 1978 (over 6 sqft per room inside or 20 sqft outside, any window replacement, any demolition of a painted surface) → the code forces lead-safe work by an EPA-certified firm with a certified renovator, unless a recognized test shows no lead (40 CFR 745) → Lead-safe containment, HEPA cleanup and cleaning verification — fixed
- Touch suspect material (popcorn, joint compound, sheet vinyl, mastic, duct wrap) → the code forces a good-faith asbestos survey before renovation in WA (WAC 296-62-07721, and the Puget Sound air agency), OR and other states regardless of the house's age; elsewhere it is practice for pre-1990 material → Asbestos survey with lab samples by an AHERA inspector — fixed
### Energy
- Touch an exterior wall cavity (open it where the jurisdiction's energy code reaches alterations) → the code forces insulation in the exposed cavity (R-15 in 2x4, R-21 in 2x6), air sealing and gasketed boxes, water pipes kept on the warm side (IRC P2603.5), and a Class I or II vapor retarder inside in climate zones 5-8 and Marine 4 (R702.7); a bonded shower membrane is that retarder, never a poly behind it → R-15 batts in the opened exterior cavities — sqft
- Touch a light fixture (add or replace one) → the code forces high-efficacy (LED) permanent fixtures and, in an insulated ceiling, IC-rated airtight recessed housings (IECC R402.4.5); CA adds vacancy sensors in baths, laundries and garages; no model code forces a dimmer → IC-rated airtight LED wafer light — unit
`;

/** Sections 5 to 8 — never forgotten, when to ask, never-lines, sanity ranges. */
export const REMODEL_RULES = `## 5. NEVER FORGOTTEN
The lines that make the number true. Each is written once per job, by the rule below.

### 5.1 Protection: one fixed line per job, scaled to the work
- A fixture swap: floor runners from the door, drop cloths, the cabinet face and counter covered.
- A job that demolishes finishes: Ram Board on the path, zipper dust walls, registers and return grilles sealed, a HEPA negative-air fan during demolition, the furnace filter replaced after demolition and at the end.
  - Floor and finish protection and dust control: Ram Board from the entry, zipper dust walls, registers and returns sealed, negative-air fan during demolition, furnace filter replaced after demolition and at completion — fixed

### 5.2 Permits by scope
- A permit line when the work moves or adds a drain, vent, supply or gas pipe; adds or moves a circuit or a box; removes a wall (a non-bearing one too, in most jurisdictions) or cuts or enlarges a structural or exterior opening; adds a bathroom; finishes a basement or converts a garage; runs a new duct through the roof or a wall (hood, bath fan, dryer); replaces a water heater.
- Usually none (state "no permit for like-for-like replacement" in notes): a faucet, sink, toilet or disposal on its existing connections; a light, switch or receptacle on its existing box; paint, countertops, backsplash, cabinets on existing walls, floating floors, regrout.
- The jurisdiction decides, so write [when the jurisdiction requires it]: a shower or tub valve, or a tub and its waste-and-overflow, replaced with no pipe moved; a bath fan replaced on its existing duct and switch.
- One permit line per issuing office, naming the trades and the rough and final inspections it carries (Washington issues the electrical permit apart from the building permit). The engineer's letter is its own line. An inspection lives inside its permit line, never a line or an hour of its own.
- A building permit for interior alterations brings the house's smoke alarms to the new-construction layout (every bedroom, outside each sleeping area, every level) and a CO alarm outside each sleeping area where a fuel-burning appliance or an attached garage exists (on each level where the state adds it). Exterior work does not. Plumbing-only and mechanical-only permits do not bring the smoke alarms, and bring the CO alarms only when they add or replace a fuel-burning appliance (a gas range, water heater or furnace). An electrical-only permit may (the jurisdiction decides).
  - [when a building permit covers interior alterations] Smoke and CO alarms to current code: hardwired and interconnected where the ceilings are open, 10-year sealed battery units where they are not — unit

### 5.3 Demolition and disposal
- The demolition line names what comes out and to what depth ("to the studs and subfloor"); fixtures are listed in it or removed on unit lines, never both.
- One disposal line sized to the debris: a 10 cu yard dumpster for a bath gut; 20 for a kitchen or an 800 sqft basement; 30 for a garage conversion; under about 4 cu yards, a trailer haul by the cu yard. A cast-iron tub is broken in place; a mortar-bed floor or counter goes by weight.
  - Debris disposal: 10 cu yard dumpster, delivery, one pull and dump fees — fixed
  - Old fixture, parts and packaging hauled off, work area left clean — fixed

### 5.4 Patch and paint every touched surface
- Every wall or ceiling a trade opens is closed, finished and painted. A patch is sold per opening (unit) up to about 4 sqft, three coats, texture matched; a larger opening is new board by the sqft. Board matches the existing thickness and rating (5/8 in. Type X on a garage ceiling under living space).
- The patched wall is painted corner to corner, a patched ceiling whole. Paint beyond that plane (the rest of the room, the far walls of two joined rooms) is an [option], or a line [when the existing paint cannot be matched].
- No opening, no patch: wafer lights wired from an open attic leave nothing to close.
- An access panel replaces the patch where a junction box, valve body, cleanout or shutoff stays in the cavity.
- A new footprint (vanity, cabinet run, tub, wall) exposes floor and wall: patch or replace, and say a matching tile or plank is rarely found. A floor that ends higher than the old one brings door undercuts, transitions and the toilet flange up to the finished floor.
  - Drywall patch at one opening up to about 4 sqft: backing, board matched to the existing, taped, three coats, texture matched — unit
  - Wall repainted corner to corner where patched: spot primer and two finish coats to match — sqft

### 5.5 Return trips live inside the line that makes them
- Rough and finish plumbing are two visits inside the rough and set lines; the electrician's trim-out after paint is inside the finish electrical line; the countertop is templated after the cabinets are set and installed on a second trip inside the countertop line (sink, faucet and cooktop on site at template, in notes); frameless glass is measured after the tile cures and installed on a second trip inside the glass line; a toilet lifted for a new floor is pulled and reset on one line.
- A separate trip line (hour) only for a visit no other line carries.
- Lead times in notes: cabinets 1-2 weeks stock, 4-8 semi-custom, 10-16 custom; quartz 1-3 weeks after template; glass 1-2 weeks after measure; a special-order tub or shower base 2-6 weeks; windows 4-8 weeks. Say which kitchen or bathroom the owner lives with during the work.
  - [when the only bathroom is out of service] Portable toilet for the work, delivered and serviced weekly — fixed

### 5.6 Final clean
- Final construction clean: dust wipe-down of every surface in the work area, vents and fixtures wiped, floors vacuumed and mopped, glass polished — fixed
- On a one-visit fixture swap the haul-off line carries the cleanup. Never a bare "Cleanup"; never two cleans.

### 5.7 Warranty and registration (notes, no line)
- "Workmanship warranted for one year from substantial completion unless the contract states longer; manufacturer warranties pass to the owner; leaks at owner-supplied fixtures are excluded." Never attribute a longer term to state law.
- Name the shower waterproofing system (KERDI, Wedi, RedGard, Hydro Ban): its warranty needs the maker's membrane, drain and listed mortars. Record the pan's 24 h flood test and a heated-floor mat's resistance readings before, during and after tile.
- Register the contractor-supplied equipment whose warranty requires it (water heater, mini-split, heated-floor thermostat, fan) in the owner's name at completion and hand over the manuals; that time sits inside the finish lines.

### 5.8 Lead and asbestos, by age and place
- [when the house was built before 1978 and the work disturbs more than 6 sqft of painted surface in a room, replaces a window or demolishes a painted surface] Lead-safe work by an EPA RRP-certified firm: containment, HEPA cleanup, cleaning verification and records — fixed
- A certified renovator's negative result with an EPA-recognized test kit removes that line; the added time sits in the demolition and finish labor.
- [when the job is in Washington or another state or air agency that requires a survey at any age, or pre-1990 suspect material will be cut, scraped or sanded] Asbestos survey by an AHERA-accredited inspector: samples of texture, joint compound, flooring and mastic, lab results and a written report before demolition — fixed
- In Washington (L&I, and the Puget Sound Clean Air Agency in King, Pierce, Snohomish and Kitsap) the survey is a line on every contractor job that demolishes finishes, whatever the house's age. Abatement is excluded and quoted by a licensed abatement contractor after a positive result.

### 5.9 Hidden conditions: a clause, or a named allowance
- The clause, on every job, in notes: "Conditions not visible today (rot, mold, out-of-code wiring or plumbing, galvanized pipe, a drum trap, asbestos) are priced as a change order before that work continues."
- An allowance line only when the brief, a photo or an answer points at the condition (a soft floor, a stain, a swollen sink base, a leaking sill, galvanized stubs): the repair named, a stated quantity in its unit, billed at actual with the unused part credited.
  - [when the floor at the toilet or tub is reported soft] Subfloor repair allowance: rotted plywood cut out and replaced with 3/4 in. plywood, glued and screwed — sqft
  - [when damage is reported but cannot be sized before demolition] Hidden-condition diagnosis and repair time — hour
- Never a percentage contingency, never a bare "Contingency", never an allowance for a condition nobody named, never the clause and an allowance for the same condition.

## 6. ASK ONLY WHEN IT MOVES THE PRICE
Ask only when the brief is silent and the answer adds a whole line or moves the total about 10% or more. At most three questions on one estimate: the three that move the most money for this brief. Each names the standard case first (the estimate is priced on it if nobody answers) and says in one clause how the answer moves the price. Everything else is assumed and stated in notes (1.4).
Never ask a preference, brand, color, style, tile size, finish, schedule, access, budget, or anything the brief states. Never ask a selection the standard case covers (tile or acrylic, cabinet grade, hood size): price the standard, offer the other as an [option].
The ten questions; ask one only when its trigger is in the brief:
1. A wall comes out, bearing not stated: "Is the wall bearing (a floor or roof above sits on it), and does it hold a plumbing stack, a duct, the panel or the thermostat?" Standard: not sure, priced non-bearing with the beam as an option. Why: bearing adds the engineer's letter, shoring, a beam, posts and often a footing, about three times the non-bearing total; a stack or a trunk adds a reroute that can rule out a flush beam.
2. A drain, toilet, tub, shower or island sink moves or is added: "Is the floor under it framed with a crawlspace or unfinished basement below, a slab, or framed over a finished ceiling?" Standard: framed, open below. Why: a slab is a saw-cut trench, backfill and concrete patch at three to five times the reroute from below; a finished ceiling adds its opening, patch and paint.
3. Walls, ceilings, floors or painted surfaces are opened: "What year was the house built?" Standard: 1978 or later. Why: before 1978, lead-safe work; outside Washington, suspect material before 1990 needs the asbestos survey; before 1950, plaster doubles every patch; before 1970, galvanized supply, cast-iron drains and old wiring turn a swap into a repipe or a rewire.
4. A line adds a circuit or a 240 V load: "Does the panel have open breaker spaces, and is the service 200 A?" Standard: 200 A with open spaces. Why: a full panel needs a sub-panel or a circuit consolidation first (a tandem breaker only in a panel listed for tandems, on a circuit that needs no AFCI); a 100 A service under a range, induction, dryer, heat pump or EV load needs a load calculation and often a service upgrade (excluded unless asked, offered as an option).
5. A toilet, tub, shower, floor, sink base or window comes out: "Is any floor soft or stained, or has there been a leak there?" Standard: no. Why: a known leak turns the clause into a subfloor, joist or sill repair allowance that must be done before the flange, pan or window goes back.
6. Sink, faucet or disposal work: "What is under the sink now (a corded or hardwired disposal, a dishwasher, a filter or RO system, an instant-hot tank), and is the top stone with an undermount, or laminate or tile with a drop-in?" Standard: disposal and dishwasher present, stone top staying, same cutout. Why: each appliance is a reconnect on the under-sink line; a hardwired disposal adds an electrician; a drop-in to undermount change in laminate or tile is a new countertop; a different bowl in stone needs the fabricator's recut.
7. A hood is added or vented: "Where can the duct get out: the exterior wall behind the range, through an attic to the roof, or is there a floor above?" and, only for a hood over 400 CFM, "Does any gas appliance in the house vent through a chimney or B-vent?" Standard: exterior wall, 400 CFM or less. Why: a roof route adds duct, a roof cap, flashing and attic work; a floor above adds a chase through finished rooms; over 400 CFM with an atmospherically vented appliance inside (or under an older code text the jurisdiction keeps) the code wants makeup air.
8. Basement finish: "Has the basement ever had water on the floor or damp walls, and what is the clear height under the lowest duct or beam?" Standard: dry, 7 ft 6 in. or more. Why: water means interior drain tile and a sump before any finish; under 7 ft (6 ft 4 in. at beams and ducts) means reroutes or rooms that cannot be habitable.
9. Basement bathroom, bar or laundry: "Does the house sewer leave below the basement floor, or through the wall above it?" Standard: below, by gravity. Why: above the floor means an ejector basin and pump, check and shutoff valves, a vent to the roof and its own receptacle, on top of the trench.
10. Garage conversion: "Are the water heater, furnace, laundry or electrical panel in the garage?" Standard: none of them. Why: each stays in a closet with combustion air and service clearance, or moves, on its own lines; a panel keeps its working space.

## 7. NEVER WRITE THESE LINES
Bare, lumped or hidden
- A bare category as a line: "Plumbing", "Electrical", "HVAC", "Demo", "Demolition", "Rough-in", "Hookups", "Labor", "Materials", "Misc", "Prep", "Installation", "Hardware", "Fixtures", "Finish work", "Cleanup", "Mobilization", "Testing", or "Permits" with no scope.
- The job as one line: "Bathroom remodel", "Kitchen remodel 12x14", "Tub-to-shower package", "Basement finish per sqft".
- One line for countable trade work: "Electrical upgrades" hiding five circuits, "Plumbing rough-in" for four fixtures, one electrical line for a room's circuits, receptacles, switches and lights.
- A sink, faucet or disposal line that hides the under-sink plumbing.
- "Tile" with no location, size, substrate or setting method; "Cabinets" with no run; "Countertop" with no material; "Paint" with no surfaces or coats; a fixture with no size or spec.
Not work, or not its own work
- A consumable as a line: caulk, silicone, putty, wax ring, thread tape, fasteners, shims, thinset, grout, adhesive, spacers, tape and mud, "Sealants and fasteners". They ride inside the line they serve.
- A replaced part standing alone where it belongs to a connection: a separate P-trap line, supply-line line and stop line. They are named inside the under-sink or fixture line.
- A step that is not billable work: "Water shut off", "Leak test", "Run test", "Startup", "Layout", "Wall verification", "Clearances checked", a "Template" line beside a templated countertop. The set or rough line's name says "leak-tested"; a witnessed gas test rides with the gas permit.
- "Overhead", "Profit", "Markup", "General contractor fee", "Insurance".
- "Contingency", a percentage line, "Allowance for unknowns", "Repairs as required", "Touch-up as needed" (5.9).
Double counts
- The same work under two names: stops in the rough line and at the fixture; the dishwasher drain on the disposal line and the dishwasher line; a cooktop disconnect in the countertop demolition and the appliance line; a toilet pull-and-reset in the floor lines and the plumbing lines; box extenders in the tile line and the electrical line; the sink set by the fabricator and again on a sink line; a faucet swap's stops and haul-off again inside the sink swap.
- Waterproofing inside the tile line and as its own line; a shower pan and "shower floor waterproofing"; a membrane over a mud pan's liner; cement board and drywall on the same wall; a poly vapor retarder behind board that gets a bonded membrane.
- A demolition sqft line that lists the fixtures, and the same fixtures again as unit removals.
- A dumpster, a haul-off and dump fees for one load; a second "old parts hauled" line.
- A permit split into permit, inspection and plan review when one office charges one fee; "Final inspection" or "Return trip" beside lines that carry those visits; the engineer's letter folded into the permit.
- Countertop install labor on top of the fabricator's installed price; a "Sink cutout" line when the countertop line names it.
- Protection per room; a second final clean.
Not asked, or not this job
- Work the brief did not ask for, as a required line: a fan on a toilet swap, a GFCI receptacle on a vanity swap, a hood on a range-fuel change, new hinges and pulls on "paint the cabinets", recessed cans or pendants on a remodel that named no lighting, a utility sink on a laundry refresh, built-ins, flooring or data on "bedroom to office", the far walls of two joined rooms. They are [option] lines.
- Another system replaced inside a room job: sewer or main water line, panel or service upgrade, water heater, furnace or AC, roof, windows, siding beyond a cap's patch, foundation repair; moisture testing, mold remediation, radon mitigation, drain tile or asbestos abatement not asked for. Exclusions, or their own proposal.
- Owner-supplied appliances or fixtures as material; a package as a unit (a box of tile, a gallon of paint, a bag of thinset).
Units, names and money
- fixed for anything counted or measured: 12 wafer lights are unit, 46 ft of base is linear ft, 168 sqft of LVP is sqft.
- sqft for trim, base, casing, crown, cabinet runs, duct, pipe or edge profile; carpet by the sqft (it is sq yards); cabinets by the sqft; stone countertops by the linear ft; a glass enclosure by the linear ft.
- A compound or hedged unit ("linear ft + unit", "unit or fixed"); a count, a multiplier, a sum or a measured length in a line's name.
- Waste added to a stated quantity; a total that ignores a stated price or reaches it by adding a line.
- A licensed trade's labor under its minimum (section 8); a supplied-and-installed line with zero labor, except a fabricator's or sub's installed quote carried whole on one side.

## 8. SANITY RANGES AND LABOR REALISM
Totals are the sum of the lines before the org's markup, standard grade, 2025-2026, US national. A total outside its range says why in notes (slab, relocation, plaster, pre-1978, luxury tier, a stated price). A full remodel under its low end is incomplete: walk the implications of section 2, the chains of section 3 and the lines of section 5 again and add what is missing; fix the lines, not the total. A price the brief states stays binding; the lines stay complete and the notes say where it sits against the range.

| Job and the scope its lines carry | National, before markup |
|---|---|
| Faucet swap, kitchen or bath, faucet supplied, under-sink line remade | $350-700 |
| Bathroom sink and faucet, top stays | $400-950 |
| Kitchen sink and faucet supplied, same cutout, disposal and dishwasher reconnected | $700-1,600 (fabricator's recut in stone +$250-450) |
| Disposal replaced on its mount / added where none | $350-750 / $700-1,400 on a reachable circuit, $1,200-2,200 with a new circuit and permit |
| Toilet replaced | $550-1,100 (flange repair +$150-450) |
| Shower valve replaced | $900-1,900 from behind, $1,500-3,000 through the tile (cartridge repair $150-350) |
| Bath fan added, ducted to a cap, switch, permit | $1,000-2,200 (replaced on the existing duct $350-700) |
| Vanity 36 in. with top and faucet, same place | $1,400-3,200 |
| Tub-to-shower 60x32, tiled walls and floor, bonded pan, frameless glass | $10,000-18,000 (prefab base and surround $6,500-11,000; slab drain +$1,500-4,000) |
| Powder room remodeled in place / added in a closet or under the stairs | $6,000-12,000 / $12,000-25,000 |
| Hall bath gut, 5x8, tub with a tiled surround | $18,000-32,000 (tiled shower with glass instead +$2,000-4,000) |
| Primary bath 10x12: tiled walk-in shower with glass, freestanding tub, 72 in. double vanity | $35,000-70,000 |
| Kitchen refresh 12x14: cabinets painted, quartz, sink and faucet, subway backsplash, walls painted | $14,000-28,000 (cabinets refaced instead $18,000-35,000) |
| Kitchen full, 10x10 galley, same layout, stock cabinets | $22,000-40,000 |
| Kitchen full, 12x14, same layout, semi-custom, 3 cm quartz, LVP | $38,000-66,000; with new lighting $42,000-72,000 |
| Kitchen full with a layout change (sink to an island, range moved, a wall opened) | $60,000-105,000 |
| Basement finish with an egress window | $45-85/sqft; with a 3/4 bath $60-115/sqft; drain tile and sump first $8,000-16,000 |
| Garage conversion, attached two-car, no bath | $90-170/sqft (a bath +$15,000-30,000) |
| Laundry room remodel in place / moved upstairs into a closet | $6,000-15,000 / $8,000-18,000 |
| Home office from a bedroom with circuit, data, lights, paint / with built-ins and a glass door | $3,500-9,000 / $12,000-25,000 |
| Non-bearing wall removed, 10-12 ft, floor tied in, touched surfaces painted | $2,800-6,500 (cabinets and a counter on the kitchen side $4,500-9,000) |
| Bearing wall removed, 12-16 ft, one floor above, LVL, posts, engineer, permit, finishes | $9,000-22,000 (two floors above $15,000-30,000) |

- Regional: apply ONE location factor. Outside the metros below, the state index the prompt names (WA 1.15, CA 1.25, NY 1.20). In Seattle-Bellevue-Kirkland, the SF Bay Area, Los Angeles, San Diego, New York City, Boston and Washington DC, use 1.25 on the national range in place of the state index, never both; licensed plumbing and electrical labor there runs 1.25-1.35 times national.
- Metro checks that override the factor: a gut hall bath $28,000-45,000; a tiled tub-to-shower never under $12,000; a 12x14 kitchen $50,000-90,000; a primary bath $45,000-90,000; a bath fan added and ducted $1,300-2,600.
- The Kirkland check: a full hall bath at standard grade there is $28,000-45,000. $12,600 is a fixture refresh with paint: it is missing demolition to the studs, the pan and membrane, wall tile at trade labor, the fan and its duct, the glass, the permit, the asbestos survey and the return trips.
- Labor share: 40-60% of a standard remodel, 65-80% of a fixture swap; under 30% means missing trips and trades. Tile labor per sqft is at least the tile's material per sqft at standard grade.

| Trade | National $/hour | Seattle area $/hour |
|---|---|---|
| Plumber, licensed | 110-180 | 150-220 |
| Electrician, licensed | 100-160 | 140-200 |
| HVAC technician | 95-160 | 120-215 |
| Tile setter | 65-110 | 75-140 |
| Finish carpenter | 65-110 | 75-140 |
| Painter | 55-90 | 65-115 |
| Drywall hanger and finisher | 55-90 | 65-115 |
| General labor, demolition | 45-70 | 50-90 |

- Seattle figures for the last six trades are the national rate times the metro factor.
- Minimum per visit: plumber $250-450 for the trip and first hour, and a single-part call (one stop, one supply line) never under $150-250; electrician $200-400; tile, glass or countertop sub $300-500; drywall patch $250-450 for the first opening and $75-150 for each more on the same visit. A sink swap totaling $150 is missing the service call.
- Time on site (it sets the trips and the labor): faucet 1.5-2.5 h; toilet 1-2 h; kitchen sink with disposal and dishwasher reconnect 2-4 h; vanity with top, faucet and under-sink line 3-8 h; shower valve 3-6 h; disposal added, plumber 1.5-2 h and electrician 3-4 h; bath fan with a roof cap 4-6 h. Tub-to-shower 2-3 weeks on site, the glass 1-2 weeks after its measure; hall bath 3-4 weeks; primary bath 4-6 weeks; kitchen refresh 1-2 weeks; full kitchen 6-10 weeks; basement finish and garage conversion 6-10 weeks; cabinet painting 5-8 working days; a mud pan takes two site days plus the 24 h flood test.
- Standard allowance amounts (material, owner-selected): kitchen faucet $250-350; bath faucet $150-250; kitchen sink, 18-gauge stainless, $350; toilet $350-500; 36 in. vanity with top $700-1,100; 60 in. double vanity with top $1,400-2,200; 60 in. alcove tub $500-900; shower valve and trim $350-600; frameless glass door and panel $1,800; vanity light $200-250; tile $4-7/sqft; LVP $3-4.50/sqft; semi-custom cabinets $200-400/linear ft; 3 cm quartz $60-90/sqft; disposal, 1/2-3/4 hp, $250-350; bath fan $180-300; 4 in. LED wafer $35-60.
`;

/** Section 2A and worked examples 9.1 and 9.3 — kitchen. */
export const REMODEL_KITCHEN = `### 2A. KITCHEN — what a kitchen brief implies
#### Sinks, faucets and disposals
#### "Replace the kitchen sink" (like-for-like drop-in, same cutout, top stays; the faucet is re-set unless the brief says new)
- Existing sink disconnected, cut free of its caulk and clips and lifted out — unit
- Kitchen sink allowance, owner-selected: 33x22 double-bowl 18-gauge stainless drop-in set in the cutout on 100% silicone and clipped, a 3-1/2 in. basket strainer in putty on each bowl without a disposal — unit
- Under-sink plumbing rebuilt to the wall stub: 1-1/2 in. tubular P-trap kit, tailpieces and continuous waste, the disposal inlet or dishwasher branch with the hose's high loop or the UPC air gap, supplies back on the stops; quarter-turn stops matched to the stub only where the old ones are multi-turn, seized or weep, the hot one dual-outlet when it feeds the dishwasher; leak-tested — unit
- Existing faucet taken off the old sink, deck cleaned, re-set on the new sink on its own hoses — unit
- [when a disposal is present] Disposal dropped and its mounting assembly moved to the new bowl in fresh putty (new flange and assembly only when corroded or the brand changes, an extended flange on fireclay or cast iron), re-hung and plugged in, or rewired with a new cable clamp where hardwired — unit
- [when an RO system, filter or instant-hot tank is in the sink base] Unit disconnected, its drain saddle and 1/4 in. tubing re-made on the new tailpiece, dispenser re-set in a deck hole, system flushed — unit
- [when the new sink's template differs from the cutout] Cutout enlarged to the template with a jigsaw in laminate or a grinder in tile, raw edge sealed; a sink smaller than the cutout needs a new top — unit
- [when the stubs are galvanized or the trap adapter is corroded] Stub-outs rebuilt at the wall: old nipple or adapter cut out, new copper or PEX stub on a drop-ear, cabinet back opened and patched — unit
#### "Undermount, farmhouse or deeper sink" (replaces the drop-in sink line above; the stone top stays; in laminate or tile, or a farmhouse under existing stone, it is a new countertop)
- [when the old sink is an undermount] Old sink cut free of its silicone and anchor studs while supported, the disposal off first, studs ground flush — unit
- [when a drop-in becomes an undermount] The drop-in's rough cutout recut and polished on site by the fabricator, enlarged only for a bigger bowl — unit
- Kitchen sink allowance, owner-selected: 18-gauge stainless undermount hung on new clips or a sink harness in 100% silicone, the stone's underside cleaned bare, cradled on 2x4s until cured — unit
- [when the faucet sat on the old drop-in's deck] Faucet and accessory holes cored 1-3/8 in. in the stone by the fabricator — unit
- [when the new outlet or the disposal's outlet lands below the wall stub] Wall behind the sink base opened, sanitary tee lowered on the stack, new trap arm, wall and cabinet back patched — unit
- [when a farmhouse sink] Sink base cut down with a leveled 3/4 in. plywood cradle on 2x4 cleats for 100-150 lb of fireclay or 150-250 lb of cast iron, doors shortened; a base narrower than the sink plus 3 in. becomes an apron-front base — unit
#### "Replace the kitchen faucet" (with a sink swap, the allowance line replaces the faucet re-set line and any hole is cored; the old faucet leaves with the sink and the sink's under-sink line carries the supplies)
- Old faucet removed from below with a basin wrench, deck cleaned of scale and putty — unit
- [when the mounting nuts are seized or the shanks corroded] Old faucet cut free with an oscillating saw or a nut splitter — hour
- Kitchen faucet allowance, owner-selected: single-hole pull-down set with its gasket, bracket and hose weight, a deck plate over unused holes, the spray hose clear of the disposal — unit
- Under-sink supply connections: the faucet's integral hoses on the stops, braided 3/8 in. compression supplies only for 1/2 in. IPS shanks, quarter-turn stops matched to the stub only where the old ones are multi-turn, seized or weep, leak-checked — unit
- [when the deck needs another hole] 1-3/8 in. hole cored in the stone or the sink deck for a sprayer, dispenser or filtered-water tap — unit
- [when a touch or touchless faucet] GFCI-protected receptacle in the sink base for its adapter, on a general circuit, never a small-appliance circuit — unit
#### "Add a garbage disposal" (none today; the switch is the line amateurs miss)
- Disposal allowance, owner-selected: 1/2 hp continuous-feed on a new sink flange and mounting assembly in putty, septic-rated on a septic system, cord kit wired where the unit ships without one — unit
- Under-sink drain rebuilt for the disposal: discharge elbow, 1-1/2 in. baffle tee and continuous waste, new tubular P-trap to the wall stub (the outlet sits 4-6 in. lower), the dishwasher hose moved to the disposal inlet with the knockout out, leak- and run-tested — unit
- 20 A receptacle in the sink base switched for the disposal, GFCI-protected at the breaker or upstream (a GFCI receptacle cannot be half-switched) — unit
- Single-pole switch above the counter within reach of the sink, in a new box, switch leg fished — unit
- [when the backsplash is tile or stone, or the sink is on an island] Countertop air switch instead of the wall switch, control box in the sink base, 1-1/4 in. hole cored in stone — unit
- [when no circuit in the sink base can carry it] New 20 A circuit, 12-2 NM-B from the panel, never a small-appliance circuit (dedicated by practice, not code), AFCI or dual-function breaker where the AHJ requires it — unit
#### "Replace the disposal"
- Old disposal dropped from its mount and removed — unit
- Disposal allowance, owner-selected: 1/2 hp continuous-feed twisted onto the existing mount (new flange and mounting assembly in putty when the brand changes or the mount is corroded), cord moved or new, run-tested with a dishwasher cycle — unit
- Under-sink drain re-cut to the new outlet height: discharge elbow and 1-1/2 in. tubular P-trap kit, dishwasher hose re-clamped at the inlet with its loop — unit
- [when the old unit is hardwired] Conductors re-made in the new unit's wiring compartment with a new cable clamp and the ground bonded — unit
- [option] Hardwired disposal converted to cord-and-plug on a switched, GFCI-protected receptacle — unit
#### Dishwashers and water
#### "Replace the dishwasher" (like-for-like; the machine is the owner's)
- Old dishwasher disconnected at the stop, drain and junction box, pulled and taken to recycling with its fee — unit
- New dishwasher set and leveled on side brackets under stone or top brackets under laminate (moisture shield under laminate or wood), new 6 ft braided 3/8 in. supply and brass 90-degree inlet elbow, drain on the disposal inlet or branch tailpiece with a high loop or the existing air gap, cord kit where it ships without one or the hardwire re-made, a dual-outlet quarter-turn stop on the sink's HOT supply where the old one is multi-turn or single, full cycle run — unit
- [when a raised floor traps the old machine] Floor cut back at the opening, or the counter lifted, to free it — hour
- [when the AHJ requires GFCI on a replacement] GFCI breaker, or a dead-front GFCI ahead of the hardwire — unit
#### "Add a dishwasher" (no opening today)
- 24 in. base cabinet beside the sink removed, opening squared to 24 in. wide and 34-1/2 in. high, toe kick cut back, finished end panel or filler at the exposed side — unit
- New 20 A circuit, 12-2 NM-B to a receptacle in the sink base, GFCI-protected (GFCI and a disconnect are code, a dedicated circuit is the maker's instruction), AFCI where the AHJ requires it — unit
- Dishwasher set, leveled and bracketed, fed by a braided 3/8 in. supply from a dual-outlet quarter-turn stop that replaces the sink's HOT stop (a dishwasher fills hot), drain hose looped high to the disposal inlet or a branch tailpiece, cord kit, lines through holes bored in the cabinet side, full cycle run — unit
- [when the jurisdiction plumbs by the UPC] Listed dishwasher air gap in a 1-3/8 in. hole cored in the counter or the sink deck — unit
- [when the house has water hammer or the AHJ requires one] Mini water-hammer arrestor at the dishwasher stop — unit
- [when the opening is bare subfloor] Flooring patched under the machine to the finished height — sqft
#### Cooking (range, cooktop, wall oven, gas, hood, microwave)
#### "Replace the range, cooktop or wall oven" (same fuel, same spot)
- Old appliance disconnected, pulled and taken to recycling with its fee — unit
- Range set and leveled, anti-tip bracket anchored to its template, cord to the existing receptacle (4-wire on a NEMA 14-50; 3-wire with the bonding strap in place on an existing NEMA 10-50, which never takes a 14-50) or a new listed gas connector at the shutoff, leak-tested, burners lit — unit
- [when a slide-in replaces a freestanding range] Receptacle moved into the maker's zone, counter edges trimmed to the range, wall behind finished in tile or drywall from the counter to the hood — unit
- [when the new unit is wider than the opening] Adjacent base cabinet cut down or removed, countertop cut back to a finished end — unit
- [when a cooktop] Cooktop dropped into the cutout, enlarged by the fabricator when the new one is larger, hardwired at its junction box or on a new listed gas connector — unit
- [when a wall oven] Oven slid into the cabinet cutout with the shelf or cutout adjusted to its template, hardwired at the junction box, trim kit fitted — unit
#### "Switch the range to gas" or "to induction"
- [when to gas] Gas branch in 1/2 in. black iron, or 3/4 in. CSST, sized to the range's input by the longest-length method from the nearest trunk to a shutoff in the range alcove, yellow CSST bonded with 6 AWG copper, a line regulator ahead of it on a 2 psi system, run up to 25 ft (a longer run by the linear ft) — unit
- [when to gas] 120 V receptacle behind the range for the igniter, allowed on a small-appliance circuit — unit
- [when to induction] 240 V range circuit to the nameplate, 6-3 NM-B on a 50 A two-pole breaker or 8-3 on 40 A, to a NEMA 14-50 — unit
- [when to induction and the service is 100 A or already carries electric heat, a dryer or a water heater] Load calculation on the existing service; a failing one makes a service upgrade quoted as its own job — fixed
- Old fuel made safe: the gas capped with a threaded plug at the shutoff, or the old 240 V circuit's breaker removed and its cable ended in a blanked box — unit
- Range set and leveled, anti-tip bracket anchored, connected, burners lit and adjusted (LP conversion kit and regulator set on propane) or elements tested — unit
#### "Vent the range hood outside" (a new duct, or the over-the-range microwave swapped for a hood)
- [when an over-the-range microwave comes down] Microwave unmounted and removed, the cabinet above replaced or cut for the hood and its duct, plate holes patched — unit
- Hood hung, or the existing hood re-hung, at its listed height on blocking or the cabinet bottom, collar damper as shipped, a chimney extension kit where the ceiling is over 8 ft — unit
- Rigid galvanized duct sized to the hood collar (6 in. on most hoods to 600 CFM), smooth wall, foil-taped, through the upper cabinet or a framed chase, route and length named, 26-gauge steel with no openings where it crosses a garage — unit
- [when the duct exits a wall] Wall cap with a spring damper 3 ft from any operable window or door, siding cut, flashed and sealed, masonry or stucco cored with a diamond bit — unit
- [when the duct rises through the attic] Roof cap with a damper flashed under the shingles, the duct insulated across the attic, attic insulation restored — unit
- [when the hood is hardwired or its receptacle must move] Junction box, or the old microwave receptacle moved into the chimney or cabinet, on a general circuit, never a small-appliance circuit — unit
- [when the hood exceeds 400 CFM and an atmospherically vented gas appliance is inside, or the AHJ keeps the older rule] Makeup-air damper interlocked to the hood, exterior intake with a filter, insulated duct, 120 V to the damper — unit
#### "Replace the hood" or "install an over-the-range microwave" (same spot, existing duct)
- [when a hood] Old hood removed, new hood hung on the existing duct with a transition to its collar, on the existing plug or hardwire — unit
- [when an over-the-range microwave] Old unit removed, mounting plate lagged into two studs, microwave through-bolted to the cabinet above with its top at the cabinet bottom 66 in. min. above the floor, ducted through its kit to the existing cap or recirculating on its charcoal filter, the cabinet above replaced or cut down where it is the wrong size — unit
- [when the microwave has no receptacle in the cabinet above, or a hardwired hood came out] Individual 20 A circuit to a receptacle in the cabinet above, never a small-appliance circuit — unit
#### Refrigerator
#### "New refrigerator" or "add an ice-maker line"
- [when the old refrigerator goes] Old refrigerator taken to recycling with the refrigerant recovery fee — unit
- [when no water line exists] Water line from a three-way quarter-turn stop replacing the sink's COLD stop, never a saddle valve, through the base cabinets or the crawlspace in 1/4 in. braided or copper, or 3/8 in. PEX to a wall box, run length named — unit
- [when the line runs inside the wall] Recessed ice-maker box with a quarter-turn valve behind the refrigerator, drywall patched around it — unit
- Refrigerator set and leveled, a new braided connector to the valve (never the old line), ice maker cycled and the line flushed — unit
- [when the new one is taller or deeper than the opening] Cabinet above cut down or removed, side panels moved and anchored to studs — unit
#### Countertops and backsplash
#### "Replace the countertops" (quartz or granite, cabinets stay; the countertop step carries the top, cutouts, holes and brackets)
- Faucet, disposal, dishwasher, any RO and a cooktop disconnected before the template and reconnected after the install on a second visit, a gas cooktop on a new listed connector, leak-tested — unit
- Under-sink plumbing rebuilt to the new bowl depth: 1-1/2 in. tubular P-trap kit, tailpieces and continuous waste to the wall stub, the disposal re-hung on its moved mount, supplies back on the stops — unit
- Dishwasher re-mounted on side brackets to the cabinets, no screws into stone, legs re-set where a plywood sub-top shrinks the opening — unit
- [when the old top is mud-set tile] Plywood decks removed with the tile and rebuilt in 3/4 in. plywood on the cabinets, debris by weight — sqft
- Drywall behind the old 4 in. splash patched, or prepared for tile — sqft
- [when a full-height tile splash stays] Bottom course cut back to the new top, or the gap filled with a matching strip and siliconed — linear ft
#### "Laminate or butcher-block countertops" (the same disconnect, reconnect and wall patch as above)
- [when post-form laminate] Post-form sections cut, miter-bolted and glued at the corners, end caps ironed on, scribed to the wall, screwed up from the cabinets — linear ft
- [when custom laminate or butcher block] HPL bonded to a 3/4 in. substrate on build-up strips, or 1-1/2 in. edge-grain maple or birch routed and finished in three coats of food-safe oil, fastened with slotted washers — sqft
- Drop-in sink cutout cut on site and its raw edge sealed; a stainless undermount cannot hang under laminate — unit
- Dishwasher top brackets screwed to the new top, moisture shield over the door — unit
#### "Tile the backsplash" (counter to the uppers, about 18 in., plus the range wall to the hood: 30-45 sqft in a 12x14)
- [when an old splash comes off] Old tile or 4 in. splash removed, drywall face repaired with setting compound — sqft
- [when the wall is textured] Wall skim-coated flat before tile — sqft
- Backsplash tile allowance, owner-selected: 3x6 ceramic subway on modified thinset, field centered, unsanded or high-performance grout, color-matched silicone at the counter and inside corners, metal edge profile at exposed ends, box extenders at every device so it sits within 1/4 in. of the tile face — sqft
- [when the receptacles are replaced to match the tile] Tamper-resistant 20 A GFCI receptacles with new plates — unit
#### Cabinets (replace, reface, paint, add an island, change the layout)
#### "Replace the cabinets" (same layout; the tops, splash and sink return on their own lines)
- Hardwired under-cabinet lights, pucks and the fluorescent box disconnected at their boxes, boxes blanked accessibly or moved — unit
- Walls behind the old cabinets and splash patched and skim-coated, since they were never finished — sqft
- [when a wall is open] 2x6 blocking let in for the hood, a microwave plate and heavy uppers — linear ft
- Finished end panels and refrigerator side panels on every exposed cabinet side — unit
- [when the soffits come down for taller uppers] Soffit framing and drywall removed after an inspection cut, ceiling and wall patched where it met them — linear ft
- Cabinet delivery, receiving and damaged-box check, staging, and one return trip for a back-ordered box — fixed
#### "Paint or reface the cabinets" (the boxes stay)
- Doors, fronts, hinges and hardware removed and labeled, counters, floor and appliances masked — fixed
- [when paint] Doors and drawer fronts degreased, sanded, bonding-primed and sprayed two coats of cabinet enamel both sides, grain-filled first on oak — unit
- [when paint] Face frames and exposed boxes degreased, sanded, primed and finished two coats — linear ft
- [when reface] Face frames skinned in PSA wood veneer or laminate, exposed ends in 1/4 in. plywood, matching toe kick and crown — linear ft
- [when reface, or the doors are thermofoil or laminate] New Shaker doors and drawer fronts on soft-close concealed hinges — unit
- [when the sink base floor is water-damaged] New 1/2 in. plywood floor in the sink base, sealed — unit
- Doors and fronts rehung and aligned, the existing pulls reinstalled — unit
#### "Add an island" (no plumbing)
- Island base cabinets with a finished back, anchored on 2x4 cleats screwed to the subfloor (a floating floor cut out under them), 36-42 in. aisles kept — linear ft
- Finished end panels, and legs or corbels at the seating side — unit
- Island top matching the kitchen's, 12 in. seating overhang on steel brackets every 24 in., one slab where it fits — sqft
- Island receptacle at or above the counter, a listed pop-up, on a 20 A small-appliance circuit fished up from the crawlspace or basement, GFCI; a junction-box provision only where the AHJ's edition allows one — unit
- [when a slab] Slab saw-cut 2-3 in. wide and 3-4 in. deep to the nearest wall, 3/4 in. PVC with 12 AWG THWN-2 (NM is barred there), grout patch, floor patched — linear ft
- [when a cooktop goes on the island] Its gas line under the floor, in a vented sleeve under a slab, or its 240 V circuit, and a downdraft or island hood ducted outdoors — unit
- [option] Pendants over the island on braced boxes with a dimmer — unit
#### "Island sink" or "move the sink to the island" (adds to "Add an island" and the sink lines; the relocation chain carries the floor opening or slab trench)
- 2 in. ABS or PVC drain through the floor to the nearest 2 in. or 3 in. drain with a wye at 1/4 in. per ft — linear ft
- Island vent: a loop vent under the counter with its cleanout where the UPC governs, or an accessible air-admittance valve in the cabinet where the AHJ allows one — unit
- [when a loop vent] Foot vent run under the floor to the vent stack in the nearest wall — linear ft
- 1/2 in. PEX hot and cold under the floor to quarter-turn stops in the island, the hot insulated in a crawlspace — linear ft
- Disposal on a countertop air switch, its switched receptacle in the island on its own circuit — unit
- Old sink wall: drain capped with a cleanout plug, supplies capped at the tee, the old sink base swapped for a standard base — unit
- Island vent drawn for the plumbing permit, rough inspection before the floor closes — fixed
#### "Change the layout" (the range, refrigerator or dishwasher moves; a moved sink follows the relocation chain)
- [when the range moves] Gas branch with its shutoff, or a 240 V range circuit, re-run to the new wall, up to 25 ft (a longer run by the linear ft) — unit
- [when the range moves] Hood re-hung over it on a new duct route, the old cap closed and the siding or roof patched — unit
- [when the refrigerator moves] Water line and an individual 20 A receptacle at the new spot — unit
- [when the dishwasher moves] Supply, a 20 A GFCI-protected circuit and a drain within the hose's rated reach, past it its own trapped and vented receptor — unit
- [when a cooktop and wall oven replace the range] Tall oven cabinet with a 3/4 in. plywood shelf, both fed from the existing 50 A range circuit through a tap box where the code allows, else a 30-40 A oven circuit on 10-3 or 8-3 — unit
- [when the sink or the microwave moves] Disposal or microwave circuit re-run to the new wall — unit
- Permit drawings: existing and proposed floor plans and an electrical plan — fixed
#### Lighting and electrical
#### "Recessed lights" (a 4 ft grid: 6-8 wafers in a 12x14)
- 4 in. LED wafers, 3000K, IC-rated and airtight, wired from the switch leg, the old fixture removed and its box blanked or reused — unit
- [when a dropped fluorescent light box] Its framing and grid removed, the ceiling drywalled flat, taped and textured — sqft
- LED-compatible dimmer, 3-way on 14-3 where there are two entries — unit
- [when a floor is above] Fish holes cut along the joists and patched — sqft
- [when an attic is above] Insulation moved and restored over the wafers — sqft
#### "Under-cabinet lighting"
- 24 V LED tape in an aluminum channel with a diffuser, or linkable bars, under each upper run — linear ft
- Dimmable 24 V driver sized to the load in an upper or above the uppers, a second one past 20-25 ft of tape — unit
- Low-voltage runs between cabinet sections through 1/2 in. holes in the cabinet sides and behind the wall at the window or range — linear ft
- [when hardwired] Switch box with a neutral, a 14-3 leg or the switch box fed first, to the driver, with an LED-compatible dimmer — unit
- [when the uppers have no light rail] Light rail molding to hide the channel — linear ft
#### "Add counter outlets" or "bring the kitchen electrical to code"
- Tamper-resistant 20 A GFCI-protected receptacles so no point along a counter is more than 24 in. from one (one every 48 in. at most) and one on each counter 12 in. or wider — unit
- [when only one small-appliance circuit exists] Second 20 A small-appliance circuit, 12-2 NM-B to the counter receptacles — unit
- [when the AHJ is on the 2023 NEC] GFCI on every kitchen receptacle and on the range, oven, cooktop, dishwasher and microwave outlets, by breaker or device — unit
- [when the house has aluminum branch wiring, ungrounded two-wire or knob-and-tube] AlumiConn or COPALUM pigtails at every device touched, or the kitchen circuits rewired from the panel — unit
- [option] Individual circuits for the dishwasher, disposal and refrigerator, which the code only keeps off the small-appliance circuits — unit
#### Floors and walls in a kitchen
#### "New kitchen floor" (cabinets stay; the flooring chain carries the dishwasher, a gas range, doors, transitions and shoe)
- Refrigerator and an electric range pulled and reset, the water line reconnected, the anti-tip bracket re-engaged — unit
- Toe kicks removed and reinstalled, or replaced, so the floor runs under the toe line — linear ft
- [when the old floor is mud-set tile] Demolition at the heavy rate, debris by weight — sqft
- [when tile] 1/4 in. cement board or an uncoupling membrane over the subfloor, deflection checked — sqft
- [when hardwood] 3/4 in. solid or engineered nail-down over felt, laced into the adjoining floor at the doorways, sanded and finished — sqft
#### "Open the wall to the dining room" (the kitchen side; the wall chains carry bearing, reroutes and patches)
- Kitchen-side cabinets on the wall removed, the countertop cut back to a finished end with a new end panel, the backsplash ended with a metal profile — linear ft
- Counter receptacles from the removed wall moved to the remaining counter so no counter point is more than 24 in. from one — unit
- [option] Lost uppers replaced by a tall pantry cabinet on another wall — unit
#### "Kitchen remodel" with no detail (the standard scope that phrase implies, by size class)
#### "Kitchen remodel" or "redo the kitchen" (same layout, standard grade; the procedure's steps at the sizes below, every trigger above for each part it replaces, each piece of work written once)
Galley, under 120 sqft: 12-16 linear ft of base and 10-12 of wall cabinets, 25-35 sqft of top, 20-30 sqft of splash, 20-30 pulls.
Medium, 120-200 sqft (12x14 is 168): 18-22 linear ft of base and 14-18 of wall, 45-55 sqft of top, 30-45 sqft of splash, 30-45 pulls.
Large, over 200 sqft: 26-34 linear ft of base and 18-24 of wall, a tall pantry, 70-100 sqft of top with the island, 40-60 sqft of splash; an existing island replaced in kind, a new one only when named.
- Electrical and plumbing safe-off before demolition: circuits identified and de-energized at the panel, stops closed and capped, gas capped at the shutoff — fixed
- Under-sink plumbing: 1-1/2 in. tubular P-trap kit, the disposal elbow and dishwasher branch, supplies on new quarter-turn stops matched to the stubs, the hot one dual-outlet and the cold one three-way for an ice maker, leak-tested — unit
- Countertop receptacles, tamper-resistant and GFCI-protected, no point along a counter more than 24 in. from one, one on each counter 12 in. or wider, boxes set for the tile — unit
- Kitchen circuits, one line each where missing or shared: second 20 A small-appliance circuit, dishwasher 20 A GFCI, disposal 20 A, microwave 20 A individual, refrigerator 20 A individual, a 240 V range circuit or a 120 V igniter receptacle for gas — unit
- [when the jurisdiction plumbs by the UPC] Listed dishwasher air gap on the counter, its hole cored with the faucet's — unit
- [option] Range hood ducted outdoors where only a recirculating hood or microwave exists, outside WA and CA; there the code requires it and the procedure's hood step stands — unit
- Existing ceiling light replaced in kind with a standard LED fixture, switches, receptacles and plates outside the counter runs replaced to match — unit
- [option] Lighting the kitchen does not have, on its own 15 A lighting circuit, never a small-appliance circuit: 4 in. LED wafers, under-cabinet LED, pendants over an island — unit

### 9.1 Worked example — "Replace the kitchen sink and faucet, add a disposal"
Assumed: 3 cm quartz top stays with a 32 in. single-bowl undermount, same cutout; the dishwasher drains here on a high loop (IPC); no disposal, switch or receptacle under the sink; multi-turn stops on copper stubs; a painted wall above the counter; crawlspace below and a 200 A panel with open spaces; sink, faucet and disposal are contractor allowances.

| # | Line item | Qty | Unit |
|---|---|---|---|
| 1 | Protection: floor runner from the door, drop cloths, counter and cabinet face covered | 1 | fixed |
| 2 | Existing undermount sink cut free of its silicone and clips while supported, old faucet removed from below, deck cleaned | 1 | unit |
| 3 | Kitchen sink allowance, owner-selected: 32 in. single-bowl 18-gauge stainless undermount hung on new clips in 100% silicone, the stone's underside cleaned bare, cradled until cured | 1 | unit |
| 4 | Kitchen faucet allowance, owner-selected: single-hole pull-down through the existing hole with its gasket, bracket and hose weight, spray hose clear of the disposal | 1 | unit |
| 5 | Disposal allowance, owner-selected: 1/2 hp continuous-feed on its sink flange and mounting assembly in putty, cord kit wired | 1 | unit |
| 6 | Under-sink plumbing rebuilt to the wall stub: disposal discharge elbow, 1-1/2 in. tubular P-trap kit, dishwasher hose on the disposal inlet with its high loop, faucet hoses on new quarter-turn stops matched to the copper stubs (dual-outlet on the hot for the dishwasher), leak- and run-tested | 1 | unit |
| 7 | 20 A receptacle in the sink base switched for the disposal, GFCI-protected by the circuit's breaker | 1 | unit |
| 8 | Single-pole disposal switch above the counter within reach of the sink, new box, switch leg fished from the sink base | 1 | unit |
| 9 | New 20 A circuit, 12-2 NM-B from the panel through the crawlspace to the sink base, dual-function AFCI/GFCI breaker | 1 | unit |
| 10 | Electrical permit for the new circuit and receptacle, final inspection | 1 | fixed |
| 11 | Old sink, faucet, parts and packaging hauled off, work area left clean | 1 | fixed |

Notes to state:
1. Sink, faucet and disposal are standard allowances; a selection above or below is billed at the difference, and client-supplied fixtures keep these lines as labor and parts.
2. The stops are replaced because they are multi-turn; quarter-turn stops that close and hold stay, and line 6 drops them.
3. A tiled backsplash moves the switch to a countertop air switch in a hole cored in the quartz; a UPC jurisdiction adds the listed air gap in its own cored hole; a full panel adds a sub-panel line.
4. No plumbing permit for the fixture swap on its existing drain and supply; the electrical permit covers the new circuit.

### 9.3 Worked example — "Full kitchen remodel, 12x14 with an island, Kirkland WA"
Assumed: 168 sqft L-shaped kitchen kept in place (20 linear ft of base, 16 of wall cabinets) plus a new 6 ft island with seating and no plumbing; crawlspace below and a 200 A panel with open spaces; one small-appliance circuit and no dedicated appliance circuits today; electric range on an existing 4-wire 50 A circuit; the over-the-range microwave gives way to a 30 in. under-cabinet hood of 400 CFM or less out the exterior wall behind the range; appliances and hood by owner; standard grade.

| # | Line item | Qty | Unit |
|---|---|---|---|
| 1 | Building permit: building, plumbing and mechanical, plan review, rough and final inspections | 1 | fixed |
| 2 | Electrical permit with rough and final inspections, issued apart from the building permit | 1 | fixed |
| 3 | Asbestos survey by an AHERA-accredited inspector: texture, joint compound, flooring and mastic sampled, lab report before demolition | 1 | fixed |
| 4 | Floor and finish protection and dust control: Ram Board from the entry, zipper dust walls, registers sealed, negative-air fan during demolition, temporary kitchen set up | 1 | fixed |
| 5 | Electrical and plumbing safe-off before demolition: circuits de-energized at the panel, stops closed and capped | 1 | fixed |
| 6 | Demolition: wall and base cabinets with the laminate tops, splash and sink removed, appliances disconnected and pulled | 36 | linear ft |
| 7 | Sheet vinyl and underlayment removed to the subfloor | 168 | sqft |
| 8 | Old range, dishwasher, microwave and refrigerator taken to recycling, refrigerant fee on the refrigerator | 4 | unit |
| 9 | Debris disposal: 20 cu yard dumpster, delivery, one pull and dump fees | 1 | fixed |
| 10 | Drywall patched and skim-coated: walls behind the old cabinets and splash, moved boxes and stubs, the duct hole, taped and finished to Level 4 | 70 | sqft |
| 11 | Sink drain and supply stub-outs moved to the new sink base | 1 | unit |
| 12 | Refrigerator water line in 3/8 in. PEX from the sink's cold stop through the wall to a recessed ice-maker box | 1 | unit |
| 13 | Second 20 A small-appliance circuit, 12-2 NM-B, for the counter and island receptacles, GFCI breaker (dual-function where AFCI is required) | 1 | unit |
| 14 | Countertop receptacles, 20 A tamper-resistant, no point along a counter more than 24 in. from one, boxes set for the tile | 6 | unit |
| 15 | Island receptacle: listed pop-up in the island top, 12-2 NM-B fished up from the crawlspace on a small-appliance circuit | 1 | unit |
| 16 | Dishwasher circuit, 20 A, 12-2 NM-B to a receptacle in the sink base, GFCI breaker | 1 | unit |
| 17 | Disposal circuit, 20 A, 12-2 NM-B to a switched receptacle in the sink base, wall switch above the counter | 1 | unit |
| 18 | Refrigerator circuit, individual 20 A, 12-2 NM-B to a receptacle behind the refrigerator | 1 | unit |
| 19 | 6 in. rigid galvanized duct from the hood collar through the exterior wall behind the range, foil-taped, under 6 ft | 1 | unit |
| 20 | 6 in. wall cap with a spring damper, 3 ft from any operable window, siding cut, flashed and sealed | 1 | unit |
| 21 | Base cabinet allowance, owner-selected: semi-custom Shaker base run with a 36 in. sink base, set level, scribed and screwed to the studs, toe kicks and fillers | 20 | linear ft |
| 22 | Wall cabinet allowance, owner-selected: semi-custom Shaker 36 in. wall cabinets with a hood cabinet, hung level, screwed to the studs, crown at the top | 16 | linear ft |
| 23 | Island base cabinets, 24 in. deep with a finished back, anchored on 2x4 cleats screwed to the subfloor | 6 | linear ft |
| 24 | Finished end panels, refrigerator side panels and island ends | 5 | unit |
| 25 | Cabinet delivery, receiving and damaged-box check, staging, one return trip for a back-ordered box | 1 | fixed |
| 26 | Cabinet pulls and knobs drilled with a jig and installed | 38 | unit |
| 27 | Quartz countertop allowance, owner-selected: 3 cm on the perimeter and the island, templated after the cabinets are set, eased edge, installed and seamed | 64 | sqft |
| 28 | Kitchen sink allowance, owner-selected: 32 in. 18-gauge stainless undermount, cutout polished and the sink hung by the fabricator on clips and silicone | 1 | unit |
| 29 | Holes cored in the quartz for the faucet, the dishwasher air gap and the island pop-up | 3 | unit |
| 30 | Steel support brackets under the island's 12 in. seating overhang | 3 | unit |
| 31 | Backsplash tile allowance, owner-selected: 3x6 ceramic subway on modified thinset, grouted, color-matched silicone at the counter, metal edge profile at the ends | 35 | sqft |
| 32 | LVP allowance, owner-selected: 6 mm rigid-core floated after the cabinets to the toe kicks and under the range, dishwasher and refrigerator openings, subfloor screwed and patched flat first | 116 | sqft |
| 33 | Transition at the doorway to the adjoining floor | 3 | linear ft |
| 34 | Baseboard and shoe on the walls outside the cabinets, filled and painted | 18 | linear ft |
| 35 | Kitchen faucet allowance, owner-selected: single-hole pull-down set with its gasket, bracket and hose weight | 1 | unit |
| 36 | Disposal allowance, owner-selected: 1/2 hp continuous-feed on its sink flange and mounting assembly, cord kit | 1 | unit |
| 37 | Under-sink plumbing: 1-1/2 in. tubular P-trap kit and the disposal elbow to the new stub, faucet hoses and dishwasher supply on new quarter-turn stops (dual-outlet on the hot, three-way on the cold for the ice maker), leak-tested | 1 | unit |
| 38 | Dishwasher set and leveled on side brackets under the quartz, braided supply, drain hose through the listed air gap to the disposal, cord kit, full cycle run | 1 | unit |
| 39 | Range set and leveled, anti-tip bracket anchored, 4-wire cord on the existing NEMA 14-50, tested | 1 | unit |
| 40 | Refrigerator set and leveled, new braided connector to the box valve, ice maker flushed | 1 | unit |
| 41 | Range hood hung in its cabinet at its listed height, hardwired to a junction box on a general lighting circuit | 1 | unit |
| 42 | Existing ceiling light replaced in kind with a standard LED flush-mount fixture on its switch | 1 | unit |
| 43 | Switches, general receptacles and plates outside the counter runs replaced with tamper-resistant devices to match | 6 | unit |
| 44 | Smoke and CO alarms to current code: hardwired and interconnected where ceilings are open, 10-year sealed battery units where they are not | 5 | unit |
| 45 | Walls and ceiling primed and painted two coats | 370 | sqft |
| 46 | Final construction clean and punch walk-through: surfaces wiped, cabinets vacuumed out, floors mopped | 1 | fixed |

Notes to state:
1. Washington lines: the asbestos survey before demolition, the electrical permit apart from the building permit, the dishwasher air gap (UPC), and the hood ducted outdoors (required on a remodel); at 400 CFM or less the hood needs no makeup air.
2. Cabinets, quartz, sink, faucet, disposal, tile and LVP are standard-grade allowances; the appliances and the hood are the owner's, set and connected only.
3. Options, not lines: lighting the kitchen does not have today (recessed LED wafers on a new lighting circuit, under-cabinet LED, pendants over the island).
4. Priced on a crawlspace and a 200 A panel with open spaces (a slab makes the island feed a saw-cut trench; a full panel adds a sub-panel); semi-custom cabinets take 4-8 weeks and quartz 1-3 weeks after template, and the temporary kitchen stays until the sink runs.
`;

/** Section 2B and worked examples 9.2 and 9.5 — bathroom. */
export const REMODEL_BATHROOM = `### 2B. BATHROOM — what a bathroom brief implies
#### Vanities, sinks and faucets
#### "Replace the vanity" (stock vanity with top, same spot, same size; the faucet is new with the top)
- Existing vanity, top and faucet shut off at the stops, disconnected at the trap, removed and carried out — unit
- Vanity allowance, owner-selected: 36 in. shaker cabinet with soft-close doors, set level on shims, scribed to the wall and screwed to the studs — unit
- Vanity top allowance, owner-selected: 37x22 in. cultured-marble or stock quartz top with integral sink and 4 in. backsplash, set in silicone — unit
- Bathroom faucet allowance, owner-selected: single-hole, 4 in. centerset or 8 in. widespread to match the top's holes, with its pop-up drain — unit
- Under-sink plumbing: 1-1/4 in. tubular P-trap with tailpiece, trap adapter and escutcheon at the wall stub, braided 3/8 in. supplies; quarter-turn stops matched to the stubs only where the old ones are multi-turn, seized or weep; leak-tested — unit
- [when the drain stub is galvanized or cast iron] Stub cut back, 1-1/2 in. PVC trap adapter set on a shielded coupling — unit
- [when the drain is an S-trap or a drum trap with no vent] Trap arm re-run to a vented sanitary tee, or an air-admittance valve where the AHJ allows one — unit
- Wall behind the old top and mirror patched, textured and painted corner to corner — sqft
- [when the new cabinet is narrower or shallower than the old] Floor patched at the exposed footprint — sqft
- Old vanity, top, faucet and packaging hauled off — fixed
#### "Replace the vanity top" (the cabinet stays)
- Existing top, sink and faucet disconnected, cut free of the silicone, removed and hauled off — unit
- [when a stock top] Vanity top allowance, owner-selected: cultured-marble or stock quartz top with integral sink, set in silicone — unit
- [when a templated slab] 3 cm quartz top templated after the cabinet is confirmed level, fabricated with the sink cutout, faucet holes and backsplash, set by the fabricator (a top under 60 in. bills at the fabricator's minimum) — unit
- [when an undermount] Undermount vitreous china sink clipped and siliconed to the slab by the fabricator — unit
- Faucet re-set or new, with a new pop-up, and the under-sink plumbing remade to the new bowl — unit
- [when the new backsplash is lower than the old, or the old splash was tile] Wall above the top patched, primed and painted — sqft
#### "Replace the bathroom faucet" (only)
- Old faucet removed from below, deck cleaned — unit
- Bathroom faucet allowance, owner-selected, with its pop-up drain, a deck plate over unused holes; the tailpiece and trap remade with new slip-joint washers; the braided supplies new — unit
- [when the stops are multi-turn, corroded or weep when closed] Quarter-turn angle stops, hot and cold, with escutcheons — unit
- [when the house main will not close or hold] Main shutoff replaced with a full-port ball valve after the meter — unit
#### "Wall-hung or floating vanity"
- Wall opened at the vanity, 2x8 blocking let in flat between the studs at the hanging rail — linear ft
- Drain raised into the cabinet: new 1-1/2 in. trap arm and sanitary tee on the existing drain and vent; supply stub-outs moved inside the footprint — unit
- Opened wall closed in drywall, taped, textured and painted corner to corner — sqft
- Flooring extended under the cabinet where the old toe kick stopped it — sqft
- Wall-hung cabinet lagged into the blocking and leveled — unit
- Exposed decorative P-trap in the faucet's finish where the trap shows — unit
- [when the old drain came up through the floor] Floor drain cut back to its fitting and capped, floor patched — unit
#### "Double vanity" or "add a second sink" (same wall)
- [when the two basin outlets are 30 in. apart or less] One 1-1/4 in. trap on an end- or center-outlet continuous waste to the existing stub, inside the second under-sink line — unit
- [when the outlets are more than 30 in. apart] Second trap arm and sanitary tee to the stack, vent checked — unit
- [when the second trap arm passes the local limit (1-1/2 in.: IPC 6 ft, UPC 3 ft 6 in.)] 1-1/2 in. vent run through the top plate and tied in 6 in. above the flood rim — linear ft
- Hot and cold tees and stub-outs to the second basin — unit
- Wall opened for the plumbing, closed, textured and painted — sqft
- 60 or 72 in. double vanity cabinet set, leveled and anchored — unit
- 3 cm quartz double top with two undermount sinks, templated and fabricated — sqft
- Second faucet allowance with its pop-up and under-sink plumbing — unit
- [when the wider cabinet covers a receptacle or switch] Device moved clear of the cabinet, old box blanked and patched — unit
- [option] Second vanity light or a wider bar and a second mirror — unit
#### "Move the vanity to another wall" (the relocation chain in section 3 carries the drain, vent, supplies, opened walls and floor, the capped old outlets and the rough inspection)
- 20 A GFCI receptacle and the vanity light moved to the new wall, old boxes blanked and patched — unit
- [when a supply duct or return runs in the joist bay under the new drain] Duct rerouted around the trap with new boots, the register re-fed — unit
#### Toilets
#### "Replace the toilet"
- Toilet allowance, owner-selected: elongated 1.28 gpf comfort-height two-piece with seat, set on a new wax or waxless seal and brass closet bolts, a new braided supply, shimmed, siliconed at the base; the old toilet pulled, the old wax scraped and the flange inspected — unit
- [when the stop is multi-turn, seized or weeps] Quarter-turn angle stop with escutcheon — unit
- [when the flange is broken, below the floor or rusted cast iron] Flange repaired with a stainless repair ring or spacer kit, or replaced with a PVC 4x3 in. flange on a shielded coupling, screwed to the subfloor — unit
- [when the rough-in is 10 or 14 in.] Special-order bowl for that rough-in, measured from the finished wall to the bolt centers — unit
- Old toilet hauled off — fixed
#### "Move the toilet" (the relocation chain carries the drain, vent, supply, opened floor and the rough inspection)
- 3 in. closet bend and drain to the stack with a wye, a new 4x3 in. flange set on the finished floor — linear ft
- [when the closet bend must cross joists] Joist headed off with doubled headers and hangers (a 3 in. bend fits through no 2x10 or smaller), or the run turned parallel in the bay — unit
- Toilet pulled and reset at the new flange on a new seal and bolts — unit
- Old flange removed, the drain cut back to its fitting, the subfloor plugged and the finish floor patched at the old footprint and supply hole — sqft
#### "The toilet rocks" or "leaks at the base"
- Toilet pulled, flange and subfloor probed, reset on a new seal, bolts and shims, siliconed — unit
- [when the flange is broken or below the floor] Flange repaired or replaced as above — unit
- [when the subfloor around the flange is soft] Subfloor cut back to joist centers, 3/4 in. T&G plywood glued and screwed, blocked at the seams — sqft
#### "Add a bidet seat"
- Bidet seat on the existing elongated bowl, T-valve on the supply, new braided supply and the seat's water hose — unit
- [when no GFCI receptacle is within cord reach of the toilet] 20 A tamper-resistant GFCI receptacle within 3 ft of the toilet on the bathroom circuit, wire fished — unit
- [when a receptacle is added] Drywall patch at the new box, primed and painted — unit
#### Tubs and showers
#### "Replace the bathtub" (alcove tub, same footprint; the surround comes off to set it)
- Tub surround tile and backer removed to the studs and subfloor, a cast-iron tub broken in place or a steel or acrylic tub cut out, debris bagged — sqft
- Tub allowance, owner-selected: 60x30 or 60x32 in. alcove acrylic or enameled steel, drain hand matched, set in a mortar bed on a level subfloor with a 2x4 ledger at the studs — unit
- Tub waste and overflow, 1-1/2 in., with lift-and-turn stopper, on the existing trap — unit
- [when the valve is two- or three-handle, or the trim finish changes] Pressure-balance valve with integral stops on a stringer, the tub spout drop in 1/2 in. copper or brass on a drop-ear ell (never PEX), shower riser to 78-80 in. — unit
- Valve trim, tub spout and shower head allowance, owner-selected — unit
- 1/2 in. cement board on the three tub walls to the tile height, seams taped with alkali-resistant mesh, grab-bar blocking set while the studs are open — sqft
- Waterproofing membrane over the backer, banded at the corners and the tub flange, sealed at the valve and spout — sqft
- Wall tile allowance, owner-selected: 3x6 subway or 12x24 porcelain on modified thinset to 72 in. above the rim (about 62 sqft) or to the ceiling (about 70), grouted, siliconed at every change of plane — sqft
- [when the exposed edges take a metal profile] Metal edge profile at the exposed tile edges — linear ft
- Moisture-resistant drywall above the tile and on the tub-end wall, taped, primed and painted — sqft
- [when the waste and overflow has slip joints over a finished ceiling] Access panel at the drain end, 12 in. minimum, in the closet or hall wall — unit
- [when a drum trap or a lead trap is found] Tub trap replaced with a 1-1/2 in. PVC P-trap and vented arm — unit
- [when a window is in the tub wall] Window replaced with a tempered vinyl unit, the jamb, sill and returns waterproofed and tiled — unit
- [when the tub wall is exterior] R-15 batts and air sealing in the opened cavities, no poly behind the bonded membrane — sqft
- Old tub and debris hauled with its dump fee — fixed
#### "Replace the tub surround" or "tile the tub walls" (the tub stays)
- Existing surround and backer removed to the studs, the tub protected under Ram Board and a padded blanket — sqft
- [when a three-piece acrylic surround] Direct-to-stud acrylic surround set on the tub flange and siliconed at the seams — unit
- [when tile] Backer, membrane, wall tile, profiles and the drywall above them as for "Replace the bathtub" — sqft
- [when the valve is two- or three-handle, or the new wall thickness will not take the old trim] Valve replaced as for "Replace the bathtub" — unit
- Tub spout and head removed for the tile and reset — unit
#### "Tub to shower" (tiled 60x32 alcove, frameless glass)
- Tub, surround, backer and tile demolished to the studs and subfloor, a cast-iron tub broken and carried out, debris hauled — sqft
- Subfloor opened at the new drain point, the tub's 1-1/2 in. trap cut out, a 2 in. P-trap and trap arm run to the 2 in. drain and vent (the UPC minimum; the trade standard under the IPC, since every tray and clamping drain is 2 in.), floor patched with 3/4 in. T&G plywood — unit
- [when the trap arm passes the local limit, or the wet-vent segment from the lav is 1-1/2 in.] Wet vent up-sized to 2 in. to the lav tee, or a new vent tied to the stack — unit
- [when the floor is a slab] Slab saw-cut and chipped at the drain, trenched and patched — linear ft
- Shower curb of three stacked 2x4s or a foam curb — linear ft
- Blocking for the glass hinge panel, the valve stringer and grab-bar locations — linear ft
- Shower valve moved up and replaced: pressure-balance rough valve at 40-48 in. with integral stops, the old spout drop capped, riser to 80 in. — unit
- Shower pan: bonded foam tray with a bonded 2 in. drain, or a mud pan over a pre-slope and a 40 mil liner with a clamping drain, sloped 1/4 in. per ft, flood-tested 24 hours before tile — unit
- 1/2 in. cement board or foam board on the three walls to the ceiling — sqft
- Waterproofing membrane on the walls and curb, banded at the corners and the pipe seals, and over the tray seams on a foam tray (nothing over a mud pan's liner) — sqft
- Shower floor tile, 2x2 porcelain mosaic, high-performance grout — sqft
- Shower wall tile allowance, owner-selected: 12x24 porcelain or 3x6 subway to the ceiling with leveling clips, siliconed at every change of plane — sqft
- Curb cap in solid surface or bullnose tile, sloped into the shower — linear ft
- Shower ceiling in moisture-resistant board, primed and painted bath enamel, or tiled with the walls — sqft
- Valve trim, shower head with arm and flange, drain grate — unit
- Frameless 3/8 in. tempered door on a hinge panel, measured after tile and installed on a second trip — unit
- Drywall outside the shower where the demolition reached, taped, textured and painted — sqft
- [when a light, fan, switch or receptacle now falls inside the zone 3 ft from the new threshold and 8 ft up] Light replaced with a wet-listed GFCI-protected fixture, or the switch or receptacle moved out of the zone — unit
- [when a finished ceiling is below] Ceiling below opened at the trap and patched, textured and painted — sqft
- [option] Recessed niche, prefab foam 12x24 in., membraned and tiled with profiled edges — unit
- [option] Grab bars into the blocking — unit
#### "Tub to shower with a prefab base and surround"
- Demolition, the 2 in. drain conversion, the vent check, the subfloor patch and the valve move as for "Tub to shower" — unit
- Shower base allowance, owner-selected: 60x32 in. acrylic or solid-surface base with a 2 in. drain, set in a mortar bed and screwed at the flange — unit
- Three-piece acrylic walls set on the base flange direct to the studs, seams siliconed (a one-piece unit will not fit through a 30 in. door) — unit
- [when solid-surface or stone panels] 1/2 in. cement board or moisture-resistant board as their flat substrate — sqft
- Drywall patched above and beside the surround, taped and painted — sqft
- Valve trim and head, and a tempered bypass door or a curtain rod on blocking — unit
#### "Redo the tiled shower" (same footprint)
- Existing tile, pan, backer, curb and door demolished to the studs and subfloor, the old drain body cut off at the trap — sqft
- New 2 in. bonded or clamping drain on the existing 2 in. trap — unit
- [when the trap is 1-1/2 in. or cast iron] Trap and arm replaced in 2 in. PVC — unit
- Curb, blocking, pan, backer, membrane, floor and wall tile, curb cap, ceiling, trim and glass as for "Tub to shower" — unit
- [when the valve is two- or three-handle, or the trim finish changes] Valve replaced — unit
- [when a mud pan becomes a foam tray] Transition at the shower entry, where the floor drops about 1-1/2 in. — unit
#### "Curbless shower" or "linear drain"
- Room floor raised 3/4-1 in. with a second plywood layer and self-leveler to meet a low-profile tray — sqft
- [when the room floor cannot rise] Joist tops cut down in the shower footprint with full-depth sisters to an engineer's detail, or a dropped platform hung on headers — sqft
- [when joists are cut] Engineer's letter for the joist modification — fixed
- Linear drain 32-48 in. stainless with a 2 in. outlet at the back wall or the entry — unit
- Single-slope pan for the linear drain — unit
- Waterproofing carried 3 ft past the shower opening onto the room floor under the tile — sqft
- Glass: a fixed 3/8 in. panel (walk-in) or a door and panel with a drip rail and sweep — unit
- [when the jurisdiction plumbs by the UPC] Recessed-floor detail submitted for the inspector's acceptance before demolition — fixed
#### "The shower valve drips" or "replace the shower valve"
- [when the valve takes a cartridge or stems] Cartridge or stems and seats replaced, trim reset — unit
- [when the brief says replace, the body is cracked or parts are gone] Wall behind the valve opened, pressure-balance rough valve with integral stops on a new stringer, the riser and spout drop remade in copper, trim kit — unit
- [when the valve is replaced from behind] Back-side wall patched, textured and painted corner to corner, or a 14x14 in. access panel where it is a closet — sqft
- [when the valve is replaced from the shower side] Tile cut back to the stud bay and closed with a remodel trim plate or a tile patch (an exact match is rare) — sqft
- [when the risers are galvanized] Risers replaced to the floor in PEX through a brass nipple or dielectric union — linear ft
- [when the jurisdiction requires one for a valve] Plumbing permit — fixed
#### "Rain head and handheld" or "add a diverter"
- Diverter rough valve on the stringer above the mixing valve — unit
- Ceiling or wall riser to the rain head and a wall supply elbow with a vacuum breaker for the handheld — unit
- Rain head and handheld on a slide bar, 1.8 gpm in WA and CA — unit
- Wall or ceiling opened and patched at each new outlet — sqft
- [when in California] Diverter with no shared positions, or heads whose combined flow stays at 1.8 gpm — unit
#### "The shower pan leaks" or "water on the ceiling below"
- Floor tile, curb tile and the bottom 12-18 in. of wall tile removed, the pan and liner out to the subfloor, the drain body cut out — sqft
- [when the subfloor is soft] Subfloor replaced in 3/4 in. T&G plywood — sqft
- New 2 in. drain on the existing trap, new pan, the curb re-wrapped, flood-tested — unit
- Waterproofing lapped up the walls behind the new lower tile and onto the curb — sqft
- Floor mosaic, the lower wall tile and the curb cap replaced (say a wall-tile match is unlikely: a contrasting band or a full retile) — sqft
- [when a finished ceiling below is stained] Ceiling opened at the stain, insulation dried or replaced, patched, primed and painted — sqft
#### "New shower door" or "frameless glass"
- Old door and track removed, silicone and screw holes cleaned and filled — unit
- [when the hinge side has no stud or blocking] Wall opened, blocked and patched — sqft
- Frameless 3/8 in. tempered door and fixed panel with clamps or a header, the fabricator measuring after tile and installing on a second trip — unit
- [when a tub] Bypass sliding tub door, 1/4 in. tempered, siliconed to the rim — unit
#### "Soaking or freestanding tub"
- Old tub and surround removed and hauled as for "Replace the bathtub" — sqft
- Finished floor run under the whole tub footprint before the tub is set — sqft
- [when the alcove walls stay] Old surround walls finished in drywall to paint, or tiled — sqft
- Drain moved to the new tub's outlet: 1-1/2 in. trap and arm under the floor, floor opened and patched — unit
- Freestanding tub allowance, owner-selected, set level with its drain and overflow kit, siliconed at the floor — unit
- Floor-mount filler rough valve set in the subfloor with 1/2 in. supplies and an ASSE 1070 mixing valve limiting it to 120°F (a pressure-balance limit stop does not qualify) — unit
- [when the filler flows 15 gpm or more] 3/4 in. PEX from the nearest 3/4 in. trunk to the filler — linear ft
- [when stone resin or cast iron] Joists under the footprint checked and sistered for the filled weight — unit
- [when a jetted or air tub] Individual 20 A circuit on a GFCI breaker or a readily accessible dead-front GFCI, bonding of the metal parts, and an access panel at the pump — unit
- [option] Water heater upsized to fill the tub hot (a 70 gal soaker empties a 40 gal tank at two thirds) — unit
#### Tile and waterproofing
#### "Tile the bathroom floor" (a 5x8 with a tub is about 27 sqft net; a new vanity is tiled under)
- Toilet pulled and reset after the floor on a new seal and bolts, the flange raised to the new finished floor with a spacer or a new flange — unit
- Old flooring and underlayment removed to the subfloor, adhesive scraped — sqft
- [when the subfloor is one 1/2 or 5/8 in. layer or the joists are 24 in. o.c.] Second layer of 1/2 in. exterior plywood glued and screwed — sqft
- Underlayment: 1/4 in. cement board on thinset, screwed and taped, or an uncoupling membrane bonded to the plywood — sqft
- Floor tile allowance, owner-selected: 12x24 porcelain with leveling clips, on modified thinset over board or unmodified over an uncoupling membrane, high-performance grout — sqft
- Threshold at the door: marble saddle or a metal transition — unit
- Door undercut and casing cut to clear the new floor — unit
- Baseboard, 3-1/4 in. primed MDF or PVC, coped, caulked and painted two coats — linear ft
- [when a floor register is in the bath] Boot extended to the new floor height and a new register set flush — unit
#### "LVP in the bathroom"
- Toilet pulled and reset on a new seal, a flange spacer where the floor rises more than 1/4 in. — unit
- Waterproof rigid-core LVP, 5-7 mm with attached pad, floated with an expansion gap, silicone at the tub, toilet and vanity edges — sqft
- Transition at the door and the door undercut — unit
- Quarter round or base on the new floor, painted — linear ft
#### "Heated floor" (with a new tile floor)
- Uncoupling membrane with heating cable, or a 120 V mat, laid on the open floor only (net of the vanity, toilet and tub and 6 in. off the walls), resistance-tested before, during and after tile — sqft
- Programmable GFCI thermostat with the floor sensor in conduit, in a single-gang box at 48-60 in., fed from a plain breaker, never another GFCI — unit
- Dedicated 20 A circuit (240 V over about 120 sqft) fished to the thermostat — unit
- [when the panel has no free space] Tandem breaker where the panel is listed for it, or a subpanel line — unit
#### Fan, electrical, lighting
#### "Add or replace the exhaust fan"
- Exhaust fan, 80-110 CFM ENERGY STAR, 1.0 sone or less, housing screwed to a joist, air-sealed to the ceiling, attic insulation restored around it; in WA a fan with a continuous low-speed mode on a 24-hour control, since it is often the house's whole-house ventilation — unit
- Duct in 4 in. rigid or semi-rigid metal to the outdoors (6 in. past 25 ft), insulated through an unconditioned attic, joints taped, length named — unit
- Roof cap with a backdraft damper flashed under the shingles, or a wall cap with a damper — unit
- Fan fed from this bathroom's own 20 A circuit in 12/2 where it serves only this bathroom, else from the lighting circuit in 14/2 (AFCI where that circuit serves a bedroom or hall), to its own switch box — unit
- [when the fan or its light sits over the tub or shower] GFCI protection on the fan circuit — unit
- [when in California, or the brief asks] Humidity-sensing control in place of the toggle — unit
- Ceiling cut, patched around the housing, primed and painted — unit
- [when the existing duct is foil or ends in the attic] Duct replaced to the outdoors — unit
- [when the roof is tile, metal or slate] Roof cap set by the roofer with matching flashing — unit
#### "Vanity light", "recessed lights" or "a light over the shower"
- Vanity light bar on a box centered over the mirror at 75-80 in., or two sconces at 60-66 in. — unit
- [when a box moves or is added] Box moved, the old one blanked, patched, primed and painted — unit
- [when in the tub or shower zone] Recessed 4 in. LED wafer listed for wet locations, IC-rated and airtight under insulation — unit
- [when the old box is a pancake box, ungrounded or knob-and-tube] Box replaced with a listed box, ground pigtailed — unit
- [when a box moves, a box is added or a circuit is added] Electrical permit — fixed
#### "Add a GFCI outlet" or "no outlet by the sink"
- [when a receptacle exists but is not GFCI] Tamper-resistant GFCI device swapped in, or a dual-function breaker — unit
- [when none is within 3 ft of the basin] 20 A tamper-resistant GFCI receptacle extended from the existing bathroom circuit, wire fished, box cut in — unit
- [when the bath has no 20 A receptacle circuit] 20 A home run in 12/2 from the panel — unit
- Drywall patch at the new box, primed and painted — unit
#### Mirrors, accessories, grab bars
#### "Recessed medicine cabinet"
- Stud bay opened and checked for the lav vent, wiring and plates; a 2x4 sill and header framed, or a stud headed off for a wider cabinet — linear ft
- [when a vent or a cable is in the bay] Vent offset with two 45s above and below the cabinet, or the cabinet moved a bay — unit
- Recessed medicine cabinet allowance, owner-selected, set plumb and screwed to the framing — unit
- [when lighted or with a receptacle] 120 V feed from the load side of the basin GFCI — unit
- [when the wall is exterior] Insulated recess box, or the cabinet surface-mounted — unit
- Drywall patched around the opening and the old mirror's holes, primed and painted — sqft
#### "New mirror", "towel bars" or "accessories"
- Old glued mirror taken down, adhesive scraped, the wall skim-coated, primed and painted — sqft
- Mirror allowance, owner-selected: framed mirror hung on a French cleat, sized to the vanity — unit
- Accessory allowance, owner-selected, in the faucet's finish: towel bar, towel ring, paper holder and robe hook, anchored to studs or 50 lb toggles, diamond-drilled through tile — unit
#### "Grab bars" (two by default: the shower entry and beside the toilet)
- [when the walls are finished] 1-1/4 in. stainless grab bars on anchors rated 250 lb through tile or drywall — unit
- [when the walls are open] 2x8 or 3/4 in. plywood blocking let in flat at 33-36 in. behind every bar location — linear ft
#### "Full bathroom remodel" with no detail
#### "Full bathroom remodel" or "gut the hall bath" (5x8 or 8x10, tub with a tiled surround, same layout; every trigger above for each part it replaces, each piece of work written once; permits, protection, the dumpster, alarms and the final clean come from section 5)
- Gut demolition to the studs and subfloor: tub, surround tile and backer, wet-wall drywall, the floor and underlayment, toilet, vanity, mirror, lights, fan and accessories — fixed
- Framing: blocking for the vanity, towel bars, grab bars and glass; the tub ledger — linear ft
- Rough plumbing per fixture: tub waste and overflow, pressure-balance valve on a stringer with a copper spout drop, toilet flange at the finished floor, lav drain and supplies, nail plates — unit
- Devices replaced in kind as their own lines: the 20 A tamper-resistant GFCI receptacle within 3 ft of the basin, the vanity light, the ceiling light or fan light, the switches and plates — unit
- Exhaust fan ducted to the outdoors as for "Add or replace the exhaust fan" — unit
- [when the bath has no 20 A receptacle circuit] 20 A home run for the bathroom receptacles — unit
- [when an exterior wall is opened] R-15 batts, air sealing, no poly behind a bonded membrane — sqft
- Cement board at the tub walls and moisture-resistant drywall where the demolition reached, taped to Level 4 — sqft
- Tub, membrane, tile to the ceiling, floor underlayment and tile, as the triggers above — sqft
- Vanity, top, faucet and under-sink plumbing; toilet; valve trim, spout and head; a bypass tub door or a rod — unit
- Mirror and the accessory set in kind; the door rehung with a new privacy lockset and hinges, undercut for the fan's makeup air — unit
- Walls and ceiling primed and painted two coats of bath enamel (a 5x8 with a tiled surround is about 170 sqft) — sqft
- Baseboard, casing and the threshold — linear ft
- [when this is the only bathroom] Portable toilet delivered and serviced weekly for the build — fixed
- [when the bath register lands under the new vanity] Toe-kick register with a boot extension — unit
- [option] Heated floor, a niche, a light over the tub, grab bars, a frameless glass door in place of a bypass door — unit
#### "Primary bath remodel" (100-120 sqft: tiled shower, freestanding tub, 72 in. double vanity)
- Everything in the full bath remodel, with the "Tub to shower" shower lines (a 60 in. door and panel), the "Soaking or freestanding tub" lines, the "Double vanity" lines with a slab top, and two sconces or two lights, each written once — unit
- [when the toilet has its own room] Water-closet door, its light and its own fan — unit
- [when a wall moves] Opening framed and both faces rebuilt as in section 2C — unit
#### "Powder room remodel" (half bath)
- Toilet, pedestal or vanity, mirror, light and accessories removed and hauled — unit
- Floor tile over underlayment with the flange spacer, the threshold and the door undercut, as for "Tile the bathroom floor" — sqft
- Pedestal sink with its bracket lagged into blocking, or a 24 in. vanity, faucet, and a chrome P-trap and supplies where they show — unit
- [when the pedestal's drain and supply centers miss the existing stubs] Stubs moved to the pedestal's centers behind the bowl, wall patched — unit
- [when no GFCI receptacle is within 3 ft of the basin] 20 A tamper-resistant GFCI receptacle — unit
- [when the room has no openable window of 3 sqft] Exhaust fan ducted to the outdoors, required on a permitted remodel — unit
- [when the walls are papered] Wallpaper stripped, the walls washed and skim-coated — sqft
- Walls and ceiling painted, the light, mirror and accessories in kind, base and casing — sqft
#### "Half bath to full" or "add a shower" (the drain and vent from scratch)
- 2 in. shower drain to the nearest 3 in. line with a wye and cleanout, from below a framed floor or by a saw-cut trench in a slab — linear ft
- 2 in. vent (1-1/2 in. where the IPC allows) tied to the stack 6 in. above the flood rim, or through the roof with a boot — linear ft
- Hot and cold 1/2 in. PEX from the nearest risers — linear ft
- The shower itself as for "Tub to shower" or its prefab version — unit
- Exhaust fan ducted to the outdoors — unit
- [when the room is small] Shower sized to the code (IRC 900 sq in. with a 30 in. dimension; UPC 1,024 sq in. holding a 30 in. circle) with 24 in. clear in front, stated in notes — fixed
#### Found on demolition (priced only when the brief, a photo or an answer names it; otherwise the change-order clause of section 5)
- [when the floor at the toilet or tub is soft or stained] Subfloor cut back to joist centers, 3/4 in. T&G plywood glued and screwed, blocked at the seams — sqft
- [when a joist is damaged] Joist sistered full length, bearing to bearing, with adhesive and structural screws — unit
- [when the bottom plate or stud ends are rotten] Plate and stud ends cut out, replaced in treated lumber and sistered — linear ft
- [when mold growth is under 10 sqft] Moldy board and insulation cut out 12 in. past the growth, framing HEPA-vacuumed, treated and dried before closing — sqft
- [when mold growth exceeds 10 sqft] Containment and remediation by a licensed mold contractor with a clearance test; this estimate prices the rebuild only — fixed

### 9.2 Worked example — "Tub to shower conversion, hall bath 5x8"
Assumed: 60x32 alcove with an enameled steel tub and a tiled surround to 72 in.; built 1995 on a framed floor over a crawl space; copper supplies and ABS drains; the tub's 1-1/2 in. trap wet-vented through a 2 in. segment from the lav; a working fan ducted outdoors; tiled shower on a foam tray with a frameless door; IPC jurisdiction; the house keeps a tub in another bath.

| # | Line item | Qty | Unit |
|---|---|---|---|
| 1 | Plumbing and building permits with the rough and final inspections | 1 | fixed |
| 2 | Floor and finish protection and dust control: Ram Board from the entry, zipper wall at the door, register sealed | 1 | fixed |
| 3 | Surround tile and backer removed to the studs on the three tub walls, debris bagged | 62 | sqft |
| 4 | Steel tub cut free and carried out, debris hauled in two loads with dump fees | 1 | fixed |
| 5 | Subfloor opened at the new drain, the 1-1/2 in. tub trap cut out, a 2 in. P-trap and trap arm run to the 2 in. wet vent, floor patched in 3/4 in. T&G plywood | 1 | unit |
| 6 | Shower curb of three stacked 2x4s | 5 | linear ft |
| 7 | Blocking for the glass hinge panel, the valve stringer and grab-bar locations | 12 | linear ft |
| 8 | Shower valve moved up and replaced: pressure-balance rough valve at 48 in. with integral stops, the old spout drop capped, riser to 80 in. | 1 | unit |
| 9 | Bonded foam shower tray 32x60 in. with a bonded 2 in. drain, flood-tested 24 hours before tile | 1 | unit |
| 10 | 1/2 in. foam board on the three walls to the ceiling | 83 | sqft |
| 11 | Waterproofing membrane on the walls and curb, banded at the corners and pipe seals, and over the tray seams | 98 | sqft |
| 12 | Shower floor tile, 2x2 porcelain mosaic, high-performance grout | 13 | sqft |
| 13 | Shower wall tile allowance, owner-selected: 12x24 porcelain to the ceiling with leveling clips, siliconed at every change of plane | 83 | sqft |
| 14 | Metal edge profile at the exposed tile edges | 16 | linear ft |
| 15 | Curb cap in solid surface, sloped into the shower | 5 | linear ft |
| 16 | Shower ceiling in moisture-resistant board, primed and painted bath enamel | 13 | sqft |
| 17 | Valve trim, shower head with arm and flange, and drain grate allowance, owner-selected | 1 | unit |
| 18 | Frameless 3/8 in. tempered door on a hinge panel, measured after tile and installed on a second trip | 1 | unit |
| 19 | Drywall outside the shower where the demolition reached, taped, textured and painted | 20 | sqft |
| 20 | Final construction clean, silicone cure observed, walk-through | 1 | fixed |

Notes to state:
1. The shower drain goes to 2 in.: the trade standard here, since every tray and clamping drain is 2 in. (the UPC minimum in WA, CA and OR). A 1-1/2 in. wet-vent segment from the lav would add the vent line.
2. Options, not lines: a recessed niche, grab bars into the blocking, a rain head and handheld on a diverter, a curbless entry.
3. The glass is measured after the tile cures and installed 10-14 days later; the shower is usable after that visit.
4. A slab under the drain, a soft subfloor or galvanized risers found at demolition are priced as a change order before that work continues.

### 9.5 Worked example — "Full bathroom remodel, 8x10 hall bath, Kirkland WA"
Assumed: built 1990 on a framed floor over a crawl space; a 60x30 alcove tub kept as a tub with a tiled surround to the ceiling; a 48 in. vanity with a stock quartz top; the bath's receptacle already on a 20 A circuit; the old fan vents into the attic; a vanity light and a ceiling fan light today; a second bathroom stays in use; standard grade at the contractor's allowances; Washington and the Puget Sound region.

| # | Line item | Qty | Unit |
|---|---|---|---|
| 1 | Building permit (building, plumbing and mechanical) with the rough and final inspections | 1 | fixed |
| 2 | Electrical permit from L&I with the rough and final inspections | 1 | fixed |
| 3 | Asbestos survey by an AHERA-accredited inspector: texture, joint compound, flooring and mastic sampled, lab report before demolition | 1 | fixed |
| 4 | Floor and finish protection and dust control: Ram Board from the entry, zipper wall at the door, registers sealed, negative-air fan during demolition | 1 | fixed |
| 5 | Gut demolition to the studs and subfloor: tub, surround tile and backer, wet-wall drywall, sheet vinyl and underlayment, toilet, vanity, mirror, lights, fan and accessories | 1 | fixed |
| 6 | Debris disposal: 10 cu yard dumpster, delivery, one pull and dump fees | 1 | fixed |
| 7 | Blocking for the vanity, towel bars, grab bars and the tub door; the tub ledger | 24 | linear ft |
| 8 | Rough plumbing per fixture: tub waste and overflow, pressure-balance valve on a stringer with a copper spout drop, toilet flange at the finished floor, lav drain and supplies, nail plates | 3 | unit |
| 9 | 20 A tamper-resistant GFCI receptacle within 3 ft of the basin | 1 | unit |
| 10 | Vanity light replaced in kind: LED bar over the mirror on its box | 1 | unit |
| 11 | Exhaust fan, 80 CFM ENERGY STAR with a continuous low-speed mode on a 24-hour control for whole-house ventilation, with its LED light, GFCI-protected over the tub | 1 | unit |
| 12 | 4 in. insulated rigid duct from the fan across the attic, up to 12 ft, joints taped | 1 | unit |
| 13 | Roof cap with a backdraft damper flashed under the shingles | 1 | unit |
| 14 | Switches and plates for the fan, its light and the vanity light in a 3-gang box | 3 | unit |
| 15 | 1/2 in. cement board on the three tub walls to the ceiling, seams taped | 70 | sqft |
| 16 | 1/2 in. moisture-resistant drywall where the demolition reached and on the tub-end wall, taped to Level 4 | 60 | sqft |
| 17 | Tub allowance, owner-selected: 60x30 in. alcove acrylic, drain hand matched, set in a mortar bed on a ledger | 1 | unit |
| 18 | Waterproofing membrane over the backer, banded at the corners and the tub flange, sealed at the valve and spout | 70 | sqft |
| 19 | Wall tile allowance, owner-selected: 3x6 ceramic subway to the ceiling on modified thinset, siliconed at every change of plane | 70 | sqft |
| 20 | Metal edge profile at the exposed tile edges | 18 | linear ft |
| 21 | Uncoupling membrane bonded to the subfloor under the tile | 67 | sqft |
| 22 | Floor tile allowance, owner-selected: 12x24 porcelain on unmodified thinset with leveling clips, run under the new vanity | 67 | sqft |
| 23 | Vanity allowance, owner-selected: 48 in. shaker cabinet set level and screwed to the studs | 1 | unit |
| 24 | Vanity top allowance, owner-selected: 49x22 in. stock quartz top with an undermount sink, set in silicone | 1 | unit |
| 25 | Bathroom faucet allowance, owner-selected, with its pop-up drain | 1 | unit |
| 26 | Under-sink plumbing: 1-1/4 in. tubular P-trap, trap adapter and escutcheon, braided supplies on new quarter-turn stops, leak-tested | 1 | unit |
| 27 | Toilet allowance, owner-selected: elongated 1.28 gpf comfort-height with seat, on a new seal, bolts and braided supply, siliconed at the base | 1 | unit |
| 28 | Valve trim, tub spout and shower head allowance, owner-selected | 1 | unit |
| 29 | Bypass sliding tub door, 1/4 in. tempered, siliconed to the rim | 1 | unit |
| 30 | Mirror allowance, owner-selected: framed mirror on a French cleat over the vanity | 1 | unit |
| 31 | Accessory allowance, owner-selected: towel bar, towel ring, paper holder and robe hook in the faucet's finish | 4 | unit |
| 32 | Walls and ceiling primed and painted two coats of bath enamel | 280 | sqft |
| 33 | Baseboard, 3-1/4 in. PVC, coped, caulked and painted | 24 | linear ft |
| 34 | Door rehung with a new privacy lockset and hinges, undercut for the fan's makeup air, casing both sides painted | 1 | unit |
| 35 | Marble saddle threshold at the door | 1 | unit |
| 36 | Smoke and CO alarms to current code under the building permit: 10-year sealed units in each bedroom, outside the sleeping area and on each level | 5 | unit |
| 37 | Final construction clean, silicone cure observed, punch walk-through | 1 | fixed |

Notes to state:
1. Washington lines: the asbestos survey before demolition (required at any age in the Puget Sound region), the electrical permit from L&I apart from the building permit, the fan running continuously on low as the house's ventilation, 1.8 gpm shower head and 1.28 gpf toilet.
2. The fixtures, vanity, top, tile and accessories are standard-grade allowances; a selection above or below is billed at the difference.
3. Options, not lines: a heated floor, a niche, a light over the tub, grab bars, a frameless glass door in place of the bypass door, a tiled walk-in shower in place of the tub.
4. A hall bath gut in Kirkland is checked against the metro range in section 8. An eight-line answer here is missing the demolition to the studs, the backer and membrane, the tile at trade labor, the fan and its duct, the permits and the asbestos survey.
`;

/** Section 2C and worked example 9.4 — interior, basement, laundry, office, garage, ADU. */
export const REMODEL_INTERIOR = `### 2C. INTERIOR, BASEMENT, LAUNDRY, OFFICE, GARAGE CONVERSION, ADU — what the brief implies
Where a line here and a procedure step name the same work, write this line and drop the step. The job's permit, protection, dumpster and final clean are written once per job, never per trigger.
#### Walls and openings
#### "take out the wall between the kitchen and dining room" (non-bearing, 8-12 ft)
- Wall checked non-bearing from the attic or below and opened with an inspection hole for wires, ducts, pipes and vents — hour
- Non-bearing wall removed: drywall both faces, studs and plates, nails pulled from the adjoining surfaces — linear ft
- Wall contents put back: switch moved to a remaining wall or the opening's return (3-way where both rooms now switch the light), a receptacle only where a remaining wall is left more than 6 ft from one, cut cables spliced in accessible boxes or listed NM splice kits, thermostat, doorbell and data jacks re-hung — unit
- AFCI protection at the origin of each living-area circuit spliced or extended: combination AFCI breaker, or an outlet-branch AFCI at the first outlet (an extension under 6 ft with no new outlet is exempt) — unit
- [when a return, supply, vent, drain or gas line runs in the wall] Each one re-run: a return rebuilt with a new drop and a grille sized to the furnace (never capped), a supply to a new boot, a vent or drain to the stack with its fall kept (a 3 in. soil stack moves with a new roof vent and decides whether a flush beam is possible), gas re-piped and pressure-tested — unit
- [when cabinets or a counter sit on the wall] Cabinets and top on the removed wall taken out; the peninsula or island that replaces them is priced under the kitchen procedure — linear ft
- Ceiling scar and both wall ends patched: drywall let in on backing, corner bead at the ends, taped, texture matched — sqft
- Floor strip where the plate stood: matching boards laced in and sanded to blend, or a flush T-molding where the rooms' floors differ (on a slab, anchors cut flush and the scar leveled); baseboard and crown returned at the wall ends — linear ft
- Both ceilings and the walls the removed wall met, primed at the patches and painted corner to corner (the far walls of both rooms are an option) — sqft
#### "remove the bearing wall" / "open concept" (12-16 ft, one floor above; add every non-bearing line)
- Structural engineer's site visit and stamped letter: beam, posts, connectors and footings with the load path drawn, and the site-observation letter where the AHJ asks (the framing inspection is a hold in notes, not a line) — fixed
- Temporary shoring walls both sides, carried to the ground with shore posts under each in the basement or crawl — linear ft
- Dropped LVL beam, 3-ply 1-3/4 x 11-7/8 in. to 12 ft or 3-ply 1-3/4 x 14 in. to 16 ft, or the engineer's size, plies nailed or through-bolted per the engineer's schedule, wrapped in 1/2 in. drywall with corner bead (it covers the ceiling scar) — unit
- [when the ceiling must stay flat] Flush beam: each cut joist hung on a face-mount hanger, and each duct, drain or cable in the cut bays rerouted through the beam where the letter allows or boxed in a soffit — unit
- Posts each end, built-up triple 2x6 or a PSL column with a post cap and base, and squash blocks or solid blocking under each down to the beam or foundation (an end in an exterior wall lands on a stud pack, never a header) — unit
- [when a post lands with nothing solid below] Pad footing about 24 x 24 x 12 in. with rebar: slab saw-cut, dug, poured and patched, or a dug pier in a crawl (sized to the load, not the frost line) — unit
- [when the beam is steel or spans past 16 ft] Crane or telehandler with its operator, or a four-man carry crew — fixed
#### "add a wall to make a bedroom" / "split the bonus room" (new partition)
- New 2x4 partition 16 in. o.c. with a door rough opening and a flat 2x6 header, blocking between parallel joists through a ceiling strip opened and patched, carpet cut and re-tacked at the plate — linear ft
- 1/2 in. drywall on both faces, taped to Level 4, texture matched to the room — sqft
- Pre-hung interior door 30 or 32 in. with a passage or privacy lever, cased both sides — unit
- Baseboard on both faces, returned where the wall meets the old walls — linear ft
- Room devices: a switch at each new door for a switched lighting outlet (a ceiling box is the standard, a switched receptacle meets the code), receptacles so no point on a wall is more than 6 ft from one, tamper-resistant, AFCI at each extended circuit's origin; a ceiling light, register, smoke alarm or thermostat that lands on the wall line or in the closed room moved — unit
- Supply to each new room and a return path past the closed door: boot and register, return grille, jumper duct or transfer grille — unit
- [when a new room is a bedroom or is left without a window] Egress checked: the window at 5.7 sqft net clear (5.0 at grade), 24 in. high, 20 in. wide, sill within 44 in. of the floor, or a new egress window; a windowless room that is not a bedroom may take artificial light and an exhaust fan under the code's exception instead — unit
- Primer and two coats on the new faces and the walls they meet, the ceiling strip included — sqft
#### "widen the doorway to a 6 ft cased opening"
- Door, jamb and casing removed, wall opened to the new width on king and jack studs, header by the IRC header table or an engineer's letter when the span, load or AHJ falls outside it: double 2x10 with a 1/2 in. plywood spacer for 6 ft in a one-story bearing wall, double 2x6 flat in a non-bearing wall — unit
- [when the wall is bearing] Temporary shoring both sides — linear ft
- Switch beside the old jamb, and any receptacle, thermostat or duct in the cut section, moved to the new jamb side, AFCI at each extended circuit's origin — unit
- Both faces patched where the studs were exposed and the opening wrapped in drywall with corner bead, texture matched — sqft
- Floor laced in across the old plate line and baseboard returned into the opening — linear ft
- Both faces painted corner to corner — sqft
#### "close off the dining room" / "add a door to the den" (an office's quiet door, data and desk circuit are options unless the brief names them)
- [when the opening is filled in] 2x4 studs under the existing header on a new plate, 1/2 in. drywall both faces, taped, texture matched — sqft
- [when a door goes in the opening] Pre-hung door or French doors set with jamb extensions, tempered glass in any glazed door — unit
- Floor cut and patched at the new plate or threshold, baseboard run across both faces, casing both sides — linear ft
- [when the closed room loses its supply, return, light switch or thermostat] Supply and return path run in, switch moved inside, thermostat moved out — unit
- Both faces painted corner to corner — sqft
#### Floors across rooms
#### "new LVP through the main floor" (replacing carpet, vinyl or tile over wood; closets and pantry measured in)
- [when old sheet vinyl, 9 x 9 tile or black mastic comes up] Asbestos survey with samples to an accredited lab and a report before removal (WA and OR require one before any renovation, whatever the house's age) — fixed
- [when ceramic tile comes up] Tile and thinset chipped off, the subfloor scraped and ground flat — sqft
- [when the kitchen or laundry is in scope] Dishwasher, washer and dryer pulled before the floor and reset on their supplies, drains, cords and vent, the plank run under them — unit
- [when the range is gas or the fridge has a water line] Range reconnected on a new listed connector with a leak test; a saddle valve replaced with a quarter-turn stop and a new braided line — unit
- [when baseboard heaters sit on the floor] Electric or hydronic heaters lifted and re-hung above the new floor — unit
- Shoe or quarter round at the cabinet toe kicks where the plank stops — linear ft
#### "tile or hardwood through the kitchen, entry and hall" (the floor rises 5/8-3/4 in.; add the LVP trigger's lines)
- Deflection checked for tile: joist span and depth, and a glued-and-screwed 1/2 in. plywood layer where the subfloor is under 3/4 in. or springy — sqft
- Everything the higher floor meets: door bottoms trimmed, jambs undercut, exterior thresholds reset, register boots extended, floor boxes raised with extension rings — unit
- Toilet pulled and reset on a flange extender and a new wax ring — unit
- [when the floor meets a stair] Top nosing reset so the top riser stays within 3/8 in. of the others — unit
#### Walls and ceilings
#### "patch the walls after the plumber and electrician" (drywall repair by class, texture matched)
- Small patch under 6 x 6 in.: mesh or California patch, three coats, sanded, texture matched — unit
- Medium patch to 2 x 2 ft: board on backing strips, taped, three coats, texture matched — unit
- Large patch over 2 x 2 ft: cut to stud centers, board matching the existing thickness and rating (5/8 in. Type X in a rated garage ceiling or unit separation), taped, texture matched — sqft
- [when a valve, cleanout, shutoff or junction box sits in the opening] Flush access panel instead of a patch — unit
- [when textured walls are to go smooth] Whole walls skim-coated to Level 5, plates and fixtures off and back — sqft
- Patched walls painted corner to corner, a patched ceiling painted whole — sqft
- A small patch job billed at the trip minimum (three coats are three trips) — fixed
#### "remove the popcorn ceiling"
- Asbestos survey before any scraping: accredited inspector, samples to an NVLAP lab, written report (WA and OR require it at any age; the pro's practice on any pre-1990 texture; a positive result goes to a licensed abatement contractor by the sqft) — fixed
- Ceiling circuits shut off and boxes capped for the wet scrape; lights, fans, registers and alarms taken down and reinstalled, a fan-rated brace box where a fan hangs from a box not rated for it — unit
- [when the texture is unpainted and tests negative] Wetted and scraped, then skim-coated because the board under it was never finished — sqft
- [when the texture is painted] Dry-scraped at the heavier rate, or 1/4 in. drywall laminated over it, taped and finished — sqft
- Ceiling re-textured to match or sanded smooth, PVA-primed and painted two coats flat — sqft
- Walls cut in along the ceiling line where the tape and the scraper marked them — linear ft
#### "paint the whole house interior" (walls, ceilings, trim and doors by the painting procedure)
- Closets: walls, ceilings and shelves, measured with the rooms — sqft
- Smoke and CO alarms taken off their bases before paint, re-seated and tested after, never painted or left bagged — unit
- [when wallpaper is found] Stripped, adhesive washed, torn paper skimmed and primed — sqft
- [when the house is pre-1978, more than 6 sqft of paint per room is disturbed and it is not tested lead-free] Lead-safe practices by an RRP-certified firm — fixed
#### Windows and doors inside a remodel
#### "egress window for the basement bedroom" (a new sleeping room in a basement requires one; other finished space in an existing basement only where the jurisdiction requires it)
- Utility locate before the dig: 811 and a private locate for the laterals — fixed
- [when the condenser, a meter, the dryer vent or a sidewall flue sits where the well goes] Moved out of the well's footprint — unit
- Excavation to 12 in. below the sill, spoil on tarps, backfilled and graded away — cu yards
- Foundation saw-cut to the rough opening under wet-cut containment, wiring and pipes along the sill moved first, slug hauled, PT buck anchored and sealed (cores grouted and a lintel set in block; an engineer's detail where the AHJ asks) — unit
- Egress window at 5.0 sqft net clear for a below-grade opening (5.7 above grade), 24 in. clear high, 20 in. clear wide, sill within 44 in. of the floor — unit
- Window well 9 sqft with a 36 in. projection, bolted on sealant, 12 in. of washed rock and a drain to the footing drain or a gravel pit, a ladder or steps when deeper than 44 in. — unit
- Interior return: framing, insulation at the buck, drywall returns or jamb extensions, sill and casing, painted — unit
#### "add a pocket door" / "swap the bath door for a pocket door" (the rough opening is twice the door width plus 1 in.)
- Swing door, jamb and casing removed, rough opening framed to the kit with a header across its full width, sized by the table or the letter and shored when the wall is bearing — unit
- Everything in the pocket wall moved out: the switch always goes to the far side (a pocket holds no box), pipes and ducts rerouted — unit
- Frame kit with split jambs and track, solid-core slab, pull and privacy latch, split-jamb trim and casing both sides — unit
- Opened face re-boarded with screws that stop short of the pocket, taped, texture matched — sqft
- Both faces painted corner to corner — sqft
#### Basement finish
#### "finish the basement" (rec room, no bedroom; current IRC editions exempt alterations of an existing basement from an escape opening unless a sleeping room is created, so the egress trigger is added only where the jurisdiction requires it — say which in notes)
- Foundation walls insulated to the zone value: XPS or EPS glued and taped to the concrete (R-10 continuous in zone 4, R-15 in Marine 4 and zone 5 up) or thinner foam plus cavity batts, no poly on the room side, no polyiso on the concrete — sqft
- Rim joist air-sealed and insulated to the zone's wall value: closed-cell foam listed for exposed rim use, or cut-and-cobble foam board sealed at the edges — linear ft
- Soffits boxed around the ducts, drains and beam below the ceiling line, fireblocked where soffits and wall tops meet the joists — linear ft
- Access kept: a panel at each shutoff, cleanout, meter and junction box the finish hides; the floor drain and slab cleanouts left open and trimmed through the new floor — unit
- Mechanical room: louvered door or two combustion-air openings sized to the furnace and water-heater input, 30 in. service space, a door wide enough to pull the heater, a switched light and a receptacle within 25 ft; no wall within 36 in. of the panel face and no closet around it — unit
- Existing basement windows cased to the new wall: jamb extensions, sill, casing — unit
- Circuits from the panel: receptacle circuits on dual-function AFCI/GFCI breakers (every basement receptacle is GFCI under the 2020 NEC), lighting circuits on AFCI — unit
- Devices by room: receptacles so no point on a wall is more than 6 ft from one, tamper-resistant; LED wafer lights on switches, 3-way at the top and bottom of the stair — unit
- Supply takeoffs with dampers and registers off the trunk and a return path for each closed room, rebalanced after a room-by-room load check — unit
#### "finish the basement with a bedroom" (add the egress trigger, in the bedroom)
- [when a trunk duct or drain would leave the bedroom under 7 ft finished, 6 ft 4 in. under beams and ducts] Rerouted into the joist bays or along a wall, or the bedroom moved off it — linear ft
- Bedroom supply and a return path so the door can close: return grille, jumper duct or transfer grille — unit
- Smoke alarm in the bedroom and outside it, hardwired and interconnected with the alarms upstairs — unit
- [option] Reach-in closet with bifold doors, rod and shelf (not code) — linear ft
#### "add a bathroom in the basement" (the rough-in; these replace the bathroom procedure's rough plumbing, rough electrical and fan steps, its finish steps follow)
- Sewer depth checked before the price: a house sewer leaving below the slab drains by gravity, one leaving through the wall above the slab needs an ejector; the under-slab line located by camera and marked — hour
- Slab saw-cut and trenched from the fixtures to the building drain (a 3 in. wye cut in) or the ejector pit, 12-18 in. wide, deeper at the shower trap, gravel bed, backfilled, 4 in. concrete patch — linear ft
- Under-slab drain per fixture: 3 in. toilet with the flange at finished floor, 2 in. shower or tub drain, 2 in. lavatory branch (nothing under 2 in. below a slab in UPC states), cleanout, water-tested for the rough inspection — unit
- 2 in. vent from the fixture group to the nearest stack or a new roof vent with a boot, walls opened and patched on the way up — unit
- [when the sewer leaves above the slab] Sewage ejector: sealed 18 x 30 in. basin in the slab, 1/2 hp pump, 2 in. discharge with a check valve and a full-port ball valve, gasketed lid, its own 2 in. vent (never an air-admittance valve), high-water alarm, a dedicated 20 A GFCI receptacle — unit
- [when the fixture rims sit below the next upstream manhole cover] Backwater valve on the branch serving the basement, with an access box in the slab — unit
- 3/4 in. PEX branch with 1/2 in. drops to each fixture and a shutoff — unit
- Exhaust fan 80 CFM in 4 in. rigid duct through the rim joist to a wall cap with a damper, never into the joist bay, on a timer or humidistat where WA or CA require it — unit
- 20 A bathroom circuit on GFCI with a receptacle within 3 ft of the basin — unit
#### "the basement is damp" / "water comes in when it rains"
- [when downspouts or grade send the water in] Downspout extensions 6 ft out and the grade re-sloped away from the wall, named before the trench — linear ft
- Interior perimeter drain: slab cut 12 in. from the wall, 4 in. perforated pipe in washed gravel with a filter sock, dimple board up the wall, slab patched — linear ft
- Sump: 18 x 30 in. basin with a sealed gasketed lid, 1/3-1/2 hp cast-iron submersible, 1-1/2 in. discharge with a check valve through the rim to daylight or a drywell, freeze-protected outlet, a dedicated 20 A GFCI receptacle — unit
- [when cracks are found] Crack injection with polyurethane or epoxy ports — linear ft
- [when the basement is already finished] Finished perimeter opened and rebuilt along the trench: bottom 24 in. of drywall, base and flooring out, then patched, trimmed and painted — linear ft
#### Laundry
#### "move the laundry upstairs" / "add a second-floor laundry" (add the dryer-vent trigger)
- Supply and drain to the new box: 1/2 in. PEX hot and cold, 2 in. trap and standpipe with its top 18-42 in. above the trap weir (18-30 in. in UPC states), 2 in. drain and 1-1/2 in. vent tied to the stack with a sanitary tee (a wye into a horizontal drain), walls and ceilings opened and patched on the route — unit
- Washer pan with a 1 in. drain to an indirect receptor or outdoors through an air gap — unit
- Laundry circuits: 20 A receptacle circuit on a dual-function AFCI/GFCI breaker, 30 A/240 V dryer circuit in 10-3 to a NEMA 14-30R on a 2-pole GFCI breaker (laundry areas under the 2020 NEC) — unit
- Machine connections: 4-wire 14-30 dryer cord with the bonding strap removed, braided stainless washer hoses hot and cold — unit
- [when the dryer sits in a closet] Louvered door or a 100 sq in. makeup-air grille — unit
- [when the floor bounces at the machines] Subfloor stiffened with a glued-and-screwed 3/4 in. plywood layer or solid blocking — sqft
- Old laundry spot made safe: valves and drain capped, dryer circuit terminated at the panel and its receptacle blanked, vent hole capped and sided — unit
#### "the dryer vent is too long" / "the dryer takes two cycles" (and every moved dryer)
- Route measured in equivalent length: each mitered 90 counts 5 ft, a smooth-radius 90 under 2 ft, 35 ft the limit unless the dryer's manual allows more — hour
- Concealed run replaced in 4 in. smooth rigid metal, joints foil-taped with no screws into the airstream, smooth-radius elbows, shortest route to a wall or roof cap with a backdraft damper and no screen, length class named (a listed exposed transition up to 8 ft may stay) — unit
- [when the run still passes the limit] Listed booster fan with a pressure switch and its receptacle — unit
- [when the route changes] Old penetration sealed and sided or roofed, the new one flashed (a mechanical permit where the AHJ requires one for a termination) — unit
- Wall or ceiling opened on the route patched and painted corner to corner — sqft
#### "switch the dryer to gas" / "switch the dryer to electric"
- [when going to gas] 1/2 in. gas branch in black iron or CSST after the meter and branch are checked against the connected load, shutoff within 6 ft in the same room, listed connector up to 6 ft, pressure-tested, yellow CSST bonded with 6 AWG copper (a run past about 25 ft is priced by the foot) — unit
- [when going to gas] 120 V receptacle at the dryer, and a CO alarm on the level where none exists — unit
- [when going to electric] 30 A/240 V circuit in 10-3 to a NEMA 14-30R on a 2-pole GFCI breaker, 4-wire cord on the dryer, the run length named (a 100 A service or a full panel gets a load calculation first) — unit
- Old fuel made safe: gas capped with a plug at the valve, or the old circuit terminated at the panel and its receptacle blanked — unit
#### Home office
#### "turn the bedroom into a home office" (the procedure's sound, desk circuit, data, lighting, door, built-in and floor steps are options unless the brief names them)
- [when the closet goes] Rod, shelf and doors removed, the opening cased or framed in, patched and painted (the room leaves the bedroom count; say so in notes) — unit
- [when the brief names a desk circuit or equipment] 20 A circuit on an AFCI breaker to desk-height receptacles, tamper-resistant — unit
- [when the brief names data] Cat6 drop from the router or patch panel to a keystone jack and plate — unit
- [when the office gets French doors or a glass wall] Tempered glass in the doors and in any panel within 24 in. of their edge with its bottom under 60 in. — unit
- [option] Solid-core pre-hung door with a sweep and a perimeter seal for calls — unit
#### Garage conversion
#### "convert the garage to a family room or bedroom" (these replace the procedure's insulation and fire-separation steps)
- Walls and ceiling to the values for new conditioned space: 2x4 walls take cavity batts plus continuous foam on the room side, or closed-cell foam; R-49 to R-60 above by the adopted code; or a performance-path calc — sqft
- Step at the house door removed and the threshold set flush with the new floor — unit
- [when the water heater or furnace stays] Closet with outdoor combustion-air ducts (the room is too small for indoor air), a gasketed door and 30 in. service space, the B-vent firestopped through the new ceiling, T&P and pan drains run outside; a gas-appliance closet never opens into a bedroom unless the unit is direct-vent — unit
- [when the washer and dryer live in the garage] Laundry kept in a framed closet with its box, 2 in. standpipe, 14-30R, rigid vent and makeup-air door, or moved by the laundry triggers — unit
- [when the panel is in the garage] Its 30 x 36 in. working space kept clear with no closet over it, or the panel moved — unit
- Opener's ceiling receptacle and circuit removed and made safe, the garage circuit re-fed through an AFCI breaker for the room — unit
- Mini-split sized by a Manual J for the mechanical permit, on a circuit sized to its nameplate (most 9,000-12,000 BTU units take 15 A), disconnect in sight, 2-pole GFCI where the adopted NEC requires it outdoors, interconnect cable run with the line set, a condensate pump interlocked when the head cannot drain by gravity — unit
- [when the egress window is the room's only glass] Second window, or artificial light and an exhaust fan under the code's exception, for light and air — unit
- Access panels at the main water and gas shutoffs, irrigation backflow, hose-bib stops and cleanouts now inside the room, an insulated 22 x 30 in. attic hatch in the new ceiling, the hose bib and dryer vent on the infill wall moved — unit
#### "half the garage into an office" (part stays a garage; add the conversion lines)
- Separation: 1/2 in. gypsum on the garage side of the dividing wall, 5/8 in. Type X only on a garage ceiling under a habitable room, the wall carried to the roof deck or the garage ceiling boarded when the attic is shared, penetrations sealed, ducts in the garage 26-gauge steel with no openings — sqft
- Door between them 20-minute rated or 1-3/8 in. solid, self-closing under the current IRC, self-latching where the state adds it; never a garage door into a bedroom — unit
- Garage door cut down: a post and jack under the existing header, the infill on one half, an 8 or 9 ft door with its tracks, springs and opener on the other, the remaining garage's receptacles on GFCI — unit
#### ADU or in-law suite
#### "make the garage or basement an ADU / in-law suite" (a second dwelling; add the garage or basement lines; its kitchen and bath follow their own procedures)
- ADU plan set and fees: plans, energy and ventilation compliance with the blower-door and duct-leakage tests where the 2021 energy code applies, address, impact and utility-connection fees itemized and passed through — fixed
- 1-hour separation between the units: 5/8 in. Type X on the listed wall and floor-ceiling assembly, a rated door or the shared stair closed off, penetrations firestopped, no duct opening from one unit into the other — sqft
- Own heat, since one furnace may not serve two dwellings: ductless heat pump sized by a Manual J, the house supplies and returns inside the unit removed and sealed — unit
- Whole-dwelling ventilation: continuous-run bath fan on its control, or an ERV, sized to the unit — unit
- Sub-panel after a load calculation: 100 A on 2 AWG aluminum SER only when it feeds the whole unit, 1 AWG aluminum or 3 AWG copper otherwise; a detached garage adds the feeder trenched in conduit and two ground rods at the sub-panel — unit
- [when the service is 100 A or fails the load calculation] 200 A service with the outdoor emergency disconnect, a surge protective device and the utility's reconnect — unit
- Water heater for the unit: 40 gal electric on a 30 A/240 V circuit, or gas with its vent and line; T&P discharge, pan, expansion tank on a closed system, seismic straps in WA, CA and OR — unit
- Sewer branch tied into the house lateral with a wye and cleanout, the basement ejector when the drains sit below it — linear ft
- [when the house's furnace, water heater or panel sits inside the unit] Reached from outside or from the house through its own door, or moved — unit
- [when a basement unit needs its own entrance] Exterior stairwell dug with retaining walls, a drain at the bottom, a landing at the door, handrail, guard and a switched light — unit
#### Insulation and air sealing when walls open
#### "insulate while the walls are open" (an exterior wall or the rim exposed)
- Air sealing first: top and bottom plates, penetrations, window and door shim gaps, exterior-wall boxes gasketed or foamed — sqft
- Every opened exterior bay filled: R-15 in 2x4, R-21 in 2x6, cut around boxes and wiring without compression — sqft
- [when the climate zone is Marine 4 or 5 and colder] Class I or II vapor retarder on the room side: kraft facing or a variable-perm membrane — sqft
- [when a water line runs in the opened exterior wall] Pipe kept on the warm side, the insulation behind it, never a batt between the pipe and the room — unit
- [when the rim joist is exposed] Rim insulated to the zone's wall value: closed-cell foam listed for exposed use or covered, or cut-and-cobble foam board — linear ft
#### Stairs and railings
#### "carpet to hardwood stairs" / "replace the railing" (13 risers make 12 treads; a finished basement stair gets the rail and guard, its rise and run stay as built)
- Retrofit oak tread caps with a nosing, glued and nailed over the existing treads — unit
- Riser covers in 1/2 in. primed poplar — unit
- [when the caps change the top or bottom riser by more than 3/8 in.] Bottom riser cut down or the top nosing raised so the rises match — unit
- Handrail 34-38 in. above the nosings on brackets into studs, returned to the wall — linear ft
- [when a side is open] Guard 36 in. minimum with balusters that stop a 4 in. sphere, newels lagged to blocking — linear ft
- Rail, newels and balusters stained or painted — linear ft
#### Smoke and CO alarms on a permit
#### "the permit calls for smoke and CO alarms" (a building permit for interior work; exterior-only permits are exempt; plumbing- and mechanical-only permits are exempt from the smoke alarms, and from the CO alarms unless they add or replace a fuel-burning appliance; an electrical-only permit per the AHJ)
- Smoke alarms to the new-dwelling layout: every bedroom, outside each sleeping area, each level including the basement; hardwired and interconnected where finishes are open or an attic, crawl or basement gives access, sealed 10-year battery alarms elsewhere (wireless-interconnected as the pro's standard) — unit
- CO alarms outside each sleeping area when the house has a fuel-burning appliance, a fireplace or an attached garage, and on each level where the state adds it (WA and CA do); combination units allowed — unit
- Alarm circuit tapped at the nearest lighting-circuit ceiling box, or a new 15 A circuit on an AFCI breaker — unit
- 14-3 cable fished between alarm locations through the attic or joist bays, holes patched — unit

### 9.4 Worked example — "Finish an 800 sqft basement with a bedroom and a full bath"
Assumed: two-story house in climate zone 4C; 40 x 20 ft poured basement, dry, 7 ft 8 in. to the joists, below the street's manhole; the trunk duct and beam cross the rec room, not the bedroom; gas furnace and water heater in one corner; 200 A panel with spare spaces; the sewer leaves below the slab; 12 x 12 ft bedroom, 5 x 8 ft bath with a tub-shower, the rest rec room; 13-riser stair open on one side; two small windows; old battery alarms upstairs.

| # | Line item | Qty | Unit |
|---|---|---|---|
| 1 | Building permit with the plan set: framing, insulation, plumbing, electrical and mechanical rough and final inspections | 1 | fixed |
| 2 | Protection: floor path from the entry down the stair, stair treads and walls covered, returns sealed while drywall is sanded | 1 | fixed |
| 3 | Utility locate before the egress dig: 811 and a private locate | 1 | fixed |
| 4 | Excavation for the window well, spoil on tarps, backfilled and graded away | 4 | cu yards |
| 5 | Egress window: 8 in. poured wall saw-cut for a 36 x 48 in. opening, PT buck anchored and sealed, casement at 5.0 sqft net clear with the sill within 44 in., returned and cased inside | 1 | unit |
| 6 | Window well 9 sqft with a 36 in. projection and a ladder, 12 in. of washed rock, drain to the footing drain | 1 | unit |
| 7 | Foundation walls: 1 in. XPS glued and taped to the concrete and R-13 unfaced batts in the stud wall (R-13 cavity plus R-5 continuous for zone 4C), no poly on the room side | 900 | sqft |
| 8 | Rim joist: 3 in. closed-cell foam listed for exposed rim use | 120 | linear ft |
| 9 | Perimeter walls: 2x4 16 in. o.c. on a PT plate over sill sealer, held off the foam | 105 | linear ft |
| 10 | Partitions for the bedroom, bath and mechanical room with door headers, blocking at the vanity, towel bars and grab bars | 55 | linear ft |
| 11 | Soffits around the trunk duct, drain lines and beam, fireblocked where they meet the wall tops | 50 | linear ft |
| 12 | Access panels at the main shutoff, cleanouts, hose-bib stops and a junction box; the floor drain left open and trimmed | 5 | unit |
| 13 | Mechanical room: louvered door sized to the furnace and water-heater input, 30 in. service space, a switched light and a receptacle | 1 | unit |
| 14 | Existing basement windows cased to the new wall: jamb extensions, sill, casing | 2 | unit |
| 15 | Circuits: two receptacle circuits on dual-function AFCI/GFCI breakers, a lighting circuit on AFCI, a 20 A bathroom circuit on GFCI | 4 | unit |
| 16 | Receptacles, tamper-resistant, no point on a wall more than 6 ft from one | 15 | unit |
| 17 | 6 in. LED wafer lights by room on switches and dimmers, 3-way at the top and bottom of the stair | 16 | unit |
| 18 | Smoke alarms to the new-dwelling layout: the basement bedroom and level hardwired on the lighting circuit, the upstairs bedrooms, hall and main level replaced and interconnected through the attic | 7 | unit |
| 19 | CO alarms outside the sleeping areas and on each level (gas furnace and water heater) | 3 | unit |
| 20 | Supply takeoffs with dampers, boots and registers off the trunk, rebalanced after a room-by-room load check | 5 | unit |
| 21 | Return grille ducted to the return trunk, and a transfer grille over the bedroom door | 2 | unit |
| 22 | Under-slab sewer located by camera and marked before the saw-cut | 2 | hour |
| 23 | Slab saw-cut and trenched to the building drain, 3 in. wye cut in, gravel bed, backfilled, 4 in. concrete patch | 25 | linear ft |
| 24 | Under-slab drain per fixture: 3 in. toilet with the flange at finished floor, 2 in. tub and 2 in. lavatory, cleanout, water-tested for the rough inspection | 3 | unit |
| 25 | 2 in. vent from the bath group to the nearest stack | 1 | unit |
| 26 | Backwater valve on the basement branch with an access box in the slab | 1 | unit |
| 27 | 3/4 in. PEX branch with 1/2 in. drops to each fixture and a shutoff | 1 | unit |
| 28 | Bath fan 80 CFM in 4 in. rigid duct through the rim joist to a wall cap with a damper, on a timer switch | 1 | unit |
| 29 | Drywall: 1/2 in. on the walls, 1/2 in. sag-resistant on the ceiling, taped to Level 4 (regular board; nothing here is fire-rated) | 2,300 | sqft |
| 30 | LVP with a slab-rated attached pad over the dry slab in the rec room and bedroom, transitions at the bath and mechanical room | 700 | sqft |
| 31 | Pre-hung doors for the bedroom and bath with privacy levers, cased both sides | 2 | unit |
| 32 | Baseboard 3-1/4 in. MDF, installed and painted two coats of enamel | 220 | linear ft |
| 33 | Walls and ceilings: PVA primer and two coats | 2,300 | sqft |
| 34 | Stair: handrail 34-38 in. returned to the wall, guard with balusters that stop a 4 in. sphere on the open side | 28 | linear ft |
| 35 | Dumpster 20 yd with the dump fees | 1 | fixed |
| 36 | Final clean and punch walk-through | 1 | fixed |

Notes to state:
- Ask before pricing where the sewer leaves the foundation. Through the wall above the slab, the trench runs to an ejector pit instead and the ejector line is added: sealed basin, 1/2 hp pump, check and ball valves, high-water alarm, its own 2 in. vent and a dedicated 20 A GFCI receptacle.
- The bath's finish lines (tub-shower with its valve and trim, board, membrane and tile, floor tile, vanity with its under-sink plumbing, toilet, accessories) follow the bathroom procedure; its rough plumbing, rough electrical and fan steps are replaced by rows 22-28 and the bathroom circuit in row 15.
- Offered as options, not lines: a bedroom closet with bifold doors, rod and shelf (not code), a raised subfloor over the slab, sound batts in the ceiling, a well cover.
- Excluded with a change-order clause: water or cracks found once the walls open (drain tile, sump, injection), asbestos in old floor tile or mastic, radon above the action level, a duct that would leave the bedroom under 7 ft.
`;
