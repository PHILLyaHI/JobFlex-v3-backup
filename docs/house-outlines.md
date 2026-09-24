# House outlines on the fence map (2026-09-24)

Owner: "when detecting the house perimeter it's not accurate — make it
better and fix it."

## What was wrong

The outlines came from OpenStreetMap (Regrid when keyed), traced off a
different aerial than the one on the map. Measured 2026-09-20: 2–5 ft off
the roof, a different direction at every address, and simplified shapes.
The only remedy was the Align drag.

## What holds now

- **Google's aerial building mask is the source when it covers the
  address.** `lib/solarHouses` asks the Solar data layers (0.1 m pixels,
  every building in a 40 m tile, from Google's own survey — the roof
  estimator already pays for and caches the same call), turns every
  structure over 100 sq ft into an outline through
  `roofRecon/footprint.buildStructureFootprints` (`keepAll`, with the
  traced staircase as a fallback when regularisation fails), and brings the
  corners back from the raster's UTM grid to lat/lng through `lib/utm` —
  grid north sits up to ~3° off true north, which an equirectangular guess
  about the tile centre would have turned into a few feet at the tile edge.
- **OpenStreetMap stays** as the fallback where Google has no coverage, and
  lends its building heights to the aerial outlines (the OSM ring under the
  outline's centroid, else the nearest within 10 m, else one storey).
- **The page asks both at once** (`fetchHouseFootprints` beside
  `fetchPropertyBoundary`). Whichever answers first shows; when the aerial
  outlines land they replace the OSM ones, and the automatic house too
  unless the contractor has already moved or redrawn it. The Buildings panel
  says where the outline came from and the imagery month. The Align drag
  remains, remembered per source.
- **Remembered per address and radius** in SyncState (`solar:houses:…`),
  including a real "no coverage here". One Google call per address; 30 per
  organisation per hour.

## Proof

`scripts/qa/solar-houses.check.ts`: the UTM round trip on four points,
a drawn mask (a house under the pin, a garage 15 m east, a shed turned
30°, a speck under the floor) recovered where and how big it was drawn,
and the heights merge. The live path needs the production key with the
Solar API enabled; the stand has none.

## Switched off, later the same day

Owner: "let's not use this feature for outlining the house — when we
request an address for a fence, don't outline the house; we'll draw it by
hand." `DETECT_OUTLINES = false` in the fence page's behaviour: on an
address, no outline is adopted, no detected footprint is drawn as context,
and the aerial call is never made (no Solar cost). The House layer opens on
the Buildings panel with Trace outline, and the hint says to draw the
house. The Align button is gone — there is nothing to align. The lookups
and `lib/solarHouses` stay in the code, one constant away, for the day the
decision changes; the street centrelines from the same OSM answer still
decide which side of the lot faces the street.
