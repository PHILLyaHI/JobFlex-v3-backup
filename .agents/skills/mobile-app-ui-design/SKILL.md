---
name: mobile-app-ui-design
description: Design and refine JobFlex handheld pages in the current Blueprint style, using the existing responsive shell and preserving all functionality.
---

# JobFlex Mobile UI

Read root [DESIGN.md](../../../DESIGN.md), the applicable AGENTS.md/CLAUDE.md,
and [mobile implementation notes](../../../docs/design/mobile.md).
These are the project requirements; this skill does not define another palette
or visual style.

Start with the user's task and most important action. Group related data,
keep working content visible, use concise labels and adapt the structure for
one-handed use. Reuse existing sheets, navigation and data behavior.

Use the established ≤768px viewport switch and dedicated mobile component.
Keep the same Blueprint type, ink frames, white surfaces and blue actions as
desktop. No soft shadow theme, decorative glow, emoji, oversized blank space,
alternate fonts, monetary monospace or celebration effects.

Preserve all controls and states. Use ≥44px touch targets, semantic labels,
visible focus, readable contrast, stable loading layouts and reduced motion.
Keep long text within its container without hiding essential information.

Verify in a real browser at 390×844; check 320px when changing the shared topbar.
Test expanded sections, sheets, keyboard access and long data. Describe any
verification limitations accurately. Do not add frameworks or test scaffolding.
