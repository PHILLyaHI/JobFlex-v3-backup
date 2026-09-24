---
name: jobflex-page-styler
description: Design and restyle JobFlex pages using the single current Blueprint specification in root DESIGN.md, with desktop and mobile verification.
---

# JobFlex Page Styler

Read [DESIGN.md](../../../DESIGN.md) from the repository root before designing.
It is the sole visual authority. Read root AGENTS.md or CLAUDE.md for project
constraints. Generic design skills and historical examples do not select
another font, theme, shell or animation system for this project.

## Workflow

1. Identify the existing route, renderer, state/data source and actions. Preserve
   functionality, permissions and validation while changing the presentation.
2. Read the current component examples linked in DESIGN.md that match the task:
   Meta for a connection/action card, roofing inventory for working lists and
   its dedicated mobile composition. Inspect the actual shared tokens.
3. Use the live shell and navigation map. Build the content around the user's
   primary task; do not copy a standalone HTML dashboard or fabricate metrics.
4. For interactive changes read [implementation notes](../../../docs/design/implementation.md).
   For handheld changes read [mobile notes](../../../docs/design/mobile.md).
   These paths are relative to this skill directory in either project skill tree.
5. Make the authorized change directly. Check desktop and 390×844, overflow,
   focus, state transitions and preserved actions; run relevant existing checks.
   State what was actually verified and whether changes are local or deployed.

Do not recreate prototype zoom, opacity-zero scroll reveals, list-hiding
stagger observers or duplicate theme tokens. Reuse current shared modules.
Use the established ≤768px mobile switch with a real mobile layout.
Keep specification changes in root DESIGN.md; this skill is a workflow,
not another copy of the visual rules.
