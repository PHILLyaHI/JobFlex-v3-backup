# Blueprint mobile implementation

Follow [DESIGN.md](../../DESIGN.md). Mobile uses the same visual language and
the existing ≤768px responsive switch, not a second design theme.

- Reuse `responsive-shell/responsive-dashboard-shell.tsx` and the target
  page's mobile composition. Mount exactly one layout tree at a time; two
  shells can conflict over scroll locks and leave hidden links in tab order.
- Use low-specificity resets such as `:where(.app) button`. A broad
  `.app button` reset can override every single-class button treatment,
  silently removing frames, fills and link colors.
- Inspect local token scopes before changing colors. Older mobile components
  may override `--paper-deep`; shared white surfaces should use the existing
  `--sheet` token where provided. Reuse global tokens for new work rather
  than duplicating a palette in every page.
- Reuse `mobile-shell/mobile-nav.tsx`, the shared `blueprint-shell/nav-map.ts`
  and `mobile-shell/use-sheet-drag.ts` where the target uses these modules.
  For a page with private navigation, inspect and preserve its contract before
  migrating it; do not copy that private navigation into a new page.
- The topbar must fit its actual icon, logo and text widths. Inspect the logo
  geometry notes in `mobile-nav.module.css`; keep controls at least 44px and
  allow the wordmark container to shrink. Check 320px when changing navigation.
- Bottom sheets must retain body scrolling, keyboard access, focus recovery
  and dismissal. Swipe dismissal must not fight a scrolled sheet body.
- Check at 390×844 with real long data and expanded controls. Verify no
  unintended horizontal overflow and no hidden actions or list content.
  Authentication, compilation and browser availability must be checked now,
  not inferred from historical reports.
