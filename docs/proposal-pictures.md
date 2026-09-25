# The pictures a proposal carries to the client (2026-09-23)

Owner: "the client doesn't receive the 3D for the fence or any kind of a
fence layout — make sure it shows on mobile and regular. Same for roofing:
the client should receive a picture of the roof."

## What the client's page shows

Both portal builds (`/portal/q/[publicId]` desk and phone) read one server
helper, `lib/proposalPictures`, and draw each picture as a framed figure
with a caption and a facts line:

- **fence-3d** — the estimator's 3D snapshot, when one was stored
  (`Proposal.beforePhotos`, a Blob URL under `fence-preview/`).
- **fence-plan** — the traced layout, drawn on request by
  `/api/public-quote/[publicId]/fence-plan` from `lib/fence/planSvg`: the
  runs with their lengths, the gates where they sit with their swing, the
  house, the lot line, north, a scale, and a strip saying the type, height,
  footage and gate count. "Layout as traced · not a survey."
- **roof-photo** — the aerial: EagleView's clear ortho when the measurement
  carried imagery and the credentials are on the server, else Google's
  satellite tile at the pin when that key is; the measured outline is drawn
  over it as an SVG overlay (`lib/roofPictures` projects both frames the same
  way — ortho by its bbox, satellite by Web Mercator at zoom 20). If the
  aerial cannot be fetched at request time, the route answers with the same
  frame drawn as an outline, so the picture is never broken.
- **roof-plan** — when there is no aerial at all: the outline as a plan with
  edge lengths, from the measurement's own rings. No key, no fetch.

The facts line under a roof picture: area, squares, pitch, facets, measured
on. Under the fence plan: type, height, footage, gates.

## Where the fence layout comes from

`convertFenceEstimateToProposal` takes an optional `plan` (points in local
feet about the address pin, gates on their segments, houses, lots, origin,
height, type, footage, address) and keeps it as an `ActivityEvent` of kind
`FENCE_PLAN` on the proposal — no schema change. The blueprint fence page
sends it whenever the runs were traced on the map (typed runs have no
geometry). The 3D snapshot is now taken even when the 3D view was never
opened: the page shows the 3D panel for a moment, mounts the scene, gives it
time to draw, reads the canvas and puts the map back
(`captureModelForProposal`). A failure there costs the picture, never the
proposal.

## Checks

- `scripts/qa/proposal-pictures.check.ts` — the plan drawing, the schema, the
  frames, the projections, the overlay, the facts line, the plan and
  stand-in drawings (pure).
- Stand walk (scratchpad `inv/pictures.js`): a fence proposal with a stored
  plan and a roof proposal linked to a measurement with an outline, on the
  desk and on a phone.
