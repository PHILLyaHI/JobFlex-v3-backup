// Blueprint shell — SVG icon sprite.
//
// The proposals donor's sprite is a strict superset of the dashboard donor's
// (42 symbols vs 33 — same line style, 24×24 / stroke 2 / currentColor), so
// the shell renders that one and both pages draw from it. Re-exported rather
// than copied so there is a single set of paths to maintain.

export { Sprite } from "@/components/v3/proposals-blueprint/sprite";
