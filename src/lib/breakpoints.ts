// Infrastructure constants (NOT design tokens). Values match Tailwind's
// default `md` (768) and `lg` (1024) so JS-side and CSS-side breakpoints stay
// in lock-step. Used by useIsMobile and any future viewport-aware hooks.
export const BREAKPOINTS = {
  mobile: 767,
  tablet: 1023,
  desktop: 1024,
} as const;

export const MEDIA_QUERIES = {
  mobile: "(max-width: 767px)",
  tablet: "(min-width: 768px) and (max-width: 1023px)",
  desktop: "(min-width: 1024px)",
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;
