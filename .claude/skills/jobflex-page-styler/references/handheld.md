# Handheld pages — the `(mobile)` fleet

Read this **only** when the work is a page under `src/app/(mobile)/mobile-*-v2/`.

## This is not the same thing as SKILL.md's "Responsiveness" section

Those are two different surfaces and confusing them wastes a build:

- **SKILL.md → Responsiveness** describes a *desktop* blueprint page collapsing
  at `<= 860px` — the FLUID SCALE module, the `zoom` variable, `eff-1280`
  classes, the sidebar becoming a drawer. One page, two layouts.
- **This file** describes the *handheld fleet*: ~22 separate pages under
  `src/app/(mobile)/`, each with its own `.module.css`, its own `.app` root and
  its own token block. They are not the desktop pages shrunk; they are their own
  compositions, and they never carry the zoom module.

Both can be live at the same URL. `/dashboard` serves the desktop shell above
768px and the handheld build at or below it, switched by a media query in
`src/components/v3/responsive-shell/responsive-dashboard-shell.tsx`. Exactly one
tree mounts — the handheld shell is `position: fixed; inset: 0` and sets
`body { overflow: hidden }`, so rendering both would strand the desktop scroll
and leave the sidebar's links in the tab order underneath an opaque overlay.

> Supersedes SKILL.md's line about mobile using a cooler `--paper: #f6f5f1`.
> Since 2026-07-29 handheld paper is `#f2f0eb` — the same drafting cream as
> desktop and `globals.css`. Mobile and desktop are one paper again.

## 1. The `:where()` reset trap — the expensive one

Every handheld module opens with a scoped reset. It must be written with
`:where()`:

```css
:where(.app) button { font-family: inherit; border: none; background: none; … }
:where(.app) a      { text-decoration: none; color: inherit; }
```

Written the obvious way, `.app button` scores **(0,1,1)** — one class plus one
type selector. Every single-class rule in the same file scores **(0,1,0)**. So
the reset *outranks the entire page* and silently deletes the `border` and
`background` off every button rule you write, regardless of source order.

`:where()` contributes zero specificity, so the same reset lands at **(0,0,1)**
and loses to everything, which is what a reset is supposed to do.

**How it actually presented**, so you recognise it rather than re-derive it: on
`mobile-v2` it killed **eight** rules at once. The visible ones were `.tbarBtn`
(the topbar's white square frames never drew at all) and `.leadCard` (Lead Flow
cards lost their ink outline). The rest — `.segBtn`, `.sheetOpt`, `.sheetCancel`,
`.sbFootIc`, `.sbFootAcc`, `.bannerClose` — were invisible because their lost
`background` was `var(--paper)` sitting on a parent that was also `var(--paper)`,
so falling back to transparent looked identical. That is what makes this trap
expensive: it half-hides. Two sibling pages disagreed for days purely on this
one selector.

The same applies to the `a` reset: at (0,1,1) it forces `color: inherit` onto
every link class, which is why an accent link can render ink while the
`border-bottom` on its inner `<span>` renders blueprint. Mismatched link colour
and underline is the tell.

## 2. The 320px topbar budget

The dark topbar has to fit **burger + mark + wordmark + search + bell** inside
320px. It is the tightest row in the system and it does not forgive guessing —
when it overflows, `CONTRACTOR OS` wraps and the two-line masthead becomes
three, which breaks the whole bar.

```
inner   = 320 - 2 × --pad-x            (--pad-x = clamp(12px, 3.8vw, 22px) → 12.16)
used    = 44 (burger)
        + mark box width
        + 94 (search 44 + 6 + bell 44)
        + --tbar-gap × 2               (burger→mark, wordmark→controls)
        + --lockup-gap                 (mark→wordmark)
wordmark ≈ 11.46 × --tbar-sub font-size   ("CONTRACTOR OS" at 0.24em tracking)
```

Only three values are slack, and they are the only knobs to reach for:

| token | value | why it can move |
|---|---|---|
| `--tbar-gap` | `clamp(6px, 1.8vw, 11px)` | spacing between the bar's separate controls |
| `--lockup-gap` | `clamp(2px, 0.7vw, 5px)` | mark→wordmark; always tighter, they are one object |
| `.tbarSub` | `clamp(7.8px, 2.4vw, 9px)` | `2.4vw` hits 9px at 375px, so only the 320px floor gives ground |

**Compute it before changing the mark size, don't estimate.** Every enlargement
so far has had to be paid for from that table, and one was paid for by finding
dead space instead — see the geometry comments on `.tbarMarkBox` /
`.tbarMarkImg` in `mobile-nav.module.css`, which record the measured ink
dimensions and how the crop window is derived. Those comments are the source of
truth for the logo; do not re-derive the numbers, read them.

Guards that stay regardless: `.tbarTxt { min-width: 0; overflow: hidden }` and
`nowrap` + `text-overflow: ellipsis` on both text rows. They are the failsafe,
not the plan — a substituted wider font then clips instead of wrapping.

## 3. Tokens are declared per page, so "one token" is a 22-file edit

Each handheld module declares its own `.app` token block. There is no shared
mobile `:root`. `--topbar-h` alone is declared in **22** files, so changing the
bar height is 22 edits, not one. Budget for that, script it, and verify the
result is uniform afterwards rather than trusting the sweep.

The shared nav module (`mobile-nav.module.css`) *reads* these tokens from
whatever page root it is mounted inside — custom properties inherit, so a page
declaring them on its own `.app` is enough. Its token contract is listed at the
top of that file. Two exceptions are declared locally in the nav itself
(`--lockup-gap` and the mark geometry) precisely because 21 page modules would
otherwise each need to know about them.

**Token pairs must keep their relationship, not just their values.** `--paper`
and `--paper-deep` are the live example: `#f2f0eb` / `#ebe8e1`, where deep is a
shade *recessed* from the sheet. Zoned strips — masthead annotations, pressed
states — depend on that direction. Swapping paper without moving deep once left
deep *lighter* than the sheet, which silently inverted every zoned strip on the
page from recessed to raised. When you change one, state what the other must do.

## 4. The shared shell

- `src/components/v3/mobile-shell/mobile-nav.tsx` — `<MobileNav />` is the dark
  topbar plus the slide-out drawer with the full nav map. A new page gets the
  chrome by rendering it as the first child of its own `.app` grid. The page
  still owns its `.app` grid, `.scroll` and `.content`, because those carry
  page-specific padding, the graph-paper parallax and the reveal cascade — and
  `.content > *` is what the cascade measures, so it has to stay in the page's
  own tree.
- `src/components/v3/mobile-shell/use-sheet-drag.ts` — swipe-down-to-dismiss for
  bottom sheets. Opt in rather than re-implementing; a hand-rolled version that
  does not check whether the sheet body is scrolled to the top will fight the
  body's own scrolling and feel broken.
- `src/components/v3/blueprint-shell/nav-map.ts` — `NAV_SECTIONS` and
  `activeHref()`, shared with the desktop sidebar. **One nav map, both shells.**
  A second href-less copy once lived in `mobile-v2/mobile-data.ts`, which is
  exactly why every drawer link was a dead `href="#"` and the drawer could not
  change pages.

**`mobile-v2` (Overview) is the holdout.** It still carries a private copy of
the topbar and drawer instead of mounting `MobileNav`. Anything nav-related has
to be done twice and kept in step; its CSS carries KEEP IN STEP comments saying
so. If you are touching the nav and have room, migrating it is worth proposing.

## 5. Verification reality

Handheld routes self-guard auth and `dev.db` has no seed account, so you cannot
render them over HTTP locally. A **307 is a compile signal, not a failure** —
it means the module graph built and the page redirected to login. There is no
browser tooling in the repo, so "it compiles" is the honest ceiling; say so
rather than implying a visual check happened. `npm run build` also EPERMs while
`npm run dev` holds the Prisma engine DLL — use `npx next build` instead.
