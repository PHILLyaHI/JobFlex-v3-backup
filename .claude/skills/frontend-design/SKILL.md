---
name: frontend-design
license: Complete terms in LICENSE.txt
description: Build polished JobFlex frontend components using the current Blueprint specification, clear hierarchy, working interactions and a dedicated mobile layout.
---

# JobFlex Frontend Design

Read root [DESIGN.md](../../../DESIGN.md) and the applicable AGENTS.md/CLAUDE.md.
The visual direction is already chosen: current JobFlex Blueprint. Do not
choose a new aesthetic, replace Inter, vary light/dark themes or apply generic
decorative design advice.

Identify the user's task, most important information and primary action.
Compose a clear hierarchy using the shared tokens and current examples in
DESIGN.md. Reuse existing components and behavior; preserve data, permissions,
validation and loading/error states. Use project-local jobflex-page-styler
for the implementation workflow.

Make deliberate choices about spacing, alignment, contrast and density within
that system. Keep the essential information visible and secondary copy short.
Provide a real mobile composition through the existing ≤768px switch.

Review the actual surface at desktop width and 390×844, including long content,
keyboard focus, touch targets and all changed states. Run relevant existing
checks. Do not equate a compile or redirect with visual confirmation.

## Source notice

This project adaptation originated from the frontend-design skill, whose source
declared "Complete terms in LICENSE.txt". Preserve applicable source licensing;
this project-specific guidance grants no additional redistribution rights.
