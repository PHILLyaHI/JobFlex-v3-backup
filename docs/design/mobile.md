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
- **Frames and sheets (2026-10-04).** A fixed frame is pinned by its edges and
  sized `width: 100%; height: 100%` — never `vh`, `dvh` or `var(--app-h,
  100dvh)`: a viewport-unit height outranks `bottom: 0`, and iOS Safari
  settles those units only after its toolbar stops moving, so the frame stood
  taller than the screen and cut its own bottom row off. A sheet hangs from a
  box that states its size — `position: absolute` inside the page's `.app`,
  or a fixed layer with `width/height: 100%` — and its ceiling is a
  percentage of that box. Its numbers come from the `--msheet-*` table in
  `globals.css` (ceiling, grab, head and foot padding, scrim, z-index, safe
  area); a page does not restate them. The body is the sheet's one scroller
  (`min-height: 0`); the grab, head and foot keep their height, and the foot
  pays `env(safe-area-inset-bottom)` once, so its buttons are always on screen.
- **Bottom bars.** A fixed bar over a scrolling page reserves its own height
  plus the safe area at the end of that page's scroll, so the last row is never
  under it.
- **Resets stop at nested components.** A page root's universal reset
  (`.bp *`, `.bp :global(.content *)`, any `:global(*)`) skips a component that
  lives in its tree through `:not(:where([data-mnav], [data-mnav] *,
  [data-nest], [data-nest] *))` — nothing added to its specificity. A shared
  component rendered inside another page's tree carries `data-nest` on its
  root. In the production build CSS chunks arrive in another order than in
  `next dev`; an equal-specificity reset that comes later wins there only.
- **Zoom.** The desk shell's fluid scale (and READABLE_SCALE) stops at 860px:
  at phone width every root is zoom 1.
- `scripts/qa/mobile-sweep.check.ts` (in run-all --checks) guards all of the
  above on a production build; `.cache/mobile-sweep/run.sh` is the full sweep.
- Check at 390×844 with real long data and expanded controls. Verify no
  unintended horizontal overflow and no hidden actions or list content.
  Authentication, compilation and browser availability must be checked now,
  not inferred from historical reports.
