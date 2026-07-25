// Blueprint dashboard — SVG icon sprite.
//
// The symbols themselves live in ../proposals-blueprint/sprite.tsx: the
// proposals donor's sprite is a strict superset of this one (42 symbols vs
// 33, same line style — 24×24 / stroke 2 / currentColor), so there is a
// single set of paths to maintain. This module stays as the dashboard-side
// entry point / re-export seam. (It previously served the mobile-v1 and
// mobile-v3 experiments; both were deleted 2026-07-24. /mobile-v2 carries its
// own trimmed sprite — it needs 21 symbols, not 42.)
//
// Desktop blueprint pages don't import this directly — the shared shell
// renders the sprite once for the whole surface.

export { Sprite } from "@/components/v3/proposals-blueprint/sprite";
