# The fence in 3D, built from its parts (2026-09-28)

Owner: "in the 3D you can't see the actual fence when you zoom in — no
posts, no idea how it's built. Make sure the 3D builds exactly what it's
going to be built from; let me zoom in more or walk through; check the topo
— a gradual slope with no up and down is one line following the slope, up
and down is stepped." And: "when I move in the 3D the cursor is stuck, I
can't disconnect it."

## What is built

`src/lib/fence/build.ts` — `fenceBuildFor(type, heightFt, spacing)` reads
the catalog type's own stock into a plain, JSON-shaped **FenceBuild**: post
spacing, line and terminal post width (4×4 = 3.5", 4×6 at corners; 1⅝" and
2⅜" pipe on chain link), round or square, the cap the system ships
(pyramid, gothic, flat, loop, none) and how proud the post stands, the
rails per section at that height (a 6 ft cedar privacy fence carries
three), each rail's cross-section (a 2×4 on edge, a 2×6 pocket rail, a 1"
channel, a 1⅜" pipe, a split rail, a 1×6 ranch board), and the infill:
butted boards, spaced pickets, a shadowbox's two interleaved faces,
board-on-board's two layers, horizontal boards stacked up the face, ¾"
bars, 2" diamond mesh, or nothing on a rail fence. `rackMaxDeg` says how
steep the build can follow the grade (stick-built 20°, chain link and
ornamental panels 25°, a prefab privacy panel 4°).

`fenceGeometry.computeFenceLayout(points, gates, { build })` places posts at
the build's spacing, marks run ends and corners as terminal posts, lays the
boards on the right face of the rails (clear of the posts — a board that
would run through a post is left out and the post shows), and
`railRowsFor(build, height)` gives the horizontal members of every bay.
Without a build the old studio's privacy run comes out as before.

`FenceModel3D` scales unit members per instance to those dimensions (posts,
caps, boards, rails are four InstancedMeshes), so a close look shows the
fence as the crew will build it. The build is passed by the estimator
(`modelProps().build`) and stored in the proposal's scene (`scene.build`,
zod-checked on convert, read back defensively), so the client's 3D stands
the same fence; older plans get the look's default build.

## Looking closer

- The orbit zooms **toward the cursor** and gets down to 1.5 ft (it used to
  stop at a quarter of the lot's span — on a big lot, fifty feet from the
  fence). Double-click re-aims the orbit at what was clicked.
- **Walk through** is a button on the scene, never a bare click: a click
  used to lock the pointer, and with no cursor and no visible way out the
  owner was stuck. Walking starts at eye height where the orbit stood, at a
  walking pace (8 ft/s; Shift runs), W A S D / arrows, Q/E down·up; **a
  click or Esc steps out**. If the browser refuses the lock the hint says
  so. Phones keep orbit-and-pinch only.

## The ground

`fenceTerrain.terrainFromProfile(segs, elevFt, { sectionFt, rackMaxDeg })`
now reads each segment's **shape**, not only its net grade: the profile is
compared with the straight line between the segment's ends, and if it
leaves that line by more than a foot, or travels back against its own
grade by more than a foot, the ground **rolls** and the segment steps
(`rolling`, `offLineFt` on the report). A gradual, straight grade racks
(one line following the slope) up to the build's `rackMaxDeg`; steeper
steps. Steps are one per bay at the type's post spacing, and a stepped bay
dropping more than a code step (1 ft) is split into shorter bays with extra
posts — in the 3D as in the takeoff. The page keeps the raw profile and
re-reads it under the current type's rules when the type, height or
spacing changes (`classifiedTerrain`), with no second Elevation call.

## Proof

`scripts/qa/fence-build.check.ts` (builds off the catalog, layouts from
them, stepped subdivision, the shape rules) and
`scripts/qa/fence-scene.check.ts` (the build in the stored scene and the
convert schema). On the stand: `$SP/fence3d/color3d.js` — the fence line's
colour on the photo, the Walk button, a close look at a post.
