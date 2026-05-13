---
name: JobFlex
description: A small-shop editorial design system for contractor software. The well-kept shop, applied to a workbook.
colors:
  paper: "#f6f5f2"
  paper-deep: "#ecebe6"
  ink: "#111113"
  ink-soft: "#2a2a2e"
  ink-muted: "#6b6a64"
  ink-faint: "#a6a49d"
  ink-line: "#d8d6cd"
  pressroom-indigo: "#4f46e5"
  pressroom-indigo-soft: "#eef0ff"
  pressroom-indigo-ink: "#1e1b4b"
  emerald: "#059669"
  rose: "#e11d48"
  amber: "#c89450"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "1.1"
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.25"
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.4"
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: "1.65"
    letterSpacing: "normal"
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: "1.4"
    letterSpacing: "0.14em"
rounded:
  xs: "4px"
  sm: "6px"
  md: "10px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.ink-soft}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    height: "40px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    height: "40px"
  button-danger:
    backgroundColor: "{colors.rose}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    height: "40px"
  paper-card:
    backgroundColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "16px"
  input:
    backgroundColor: "rgba(255, 255, 255, 0.6)"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  badge-neutral:
    backgroundColor: "rgba(17, 17, 19, 0.05)"
    textColor: "{colors.ink-soft}"
    rounded: "9999px"
    padding: "2px 10px"
  badge-accent:
    backgroundColor: "{colors.pressroom-indigo-soft}"
    textColor: "{colors.pressroom-indigo-ink}"
    rounded: "9999px"
    padding: "2px 10px"
---

# Design System: JobFlex

## 1. Overview

**Creative North Star: "The Well-Kept Shop"**

JobFlex's interface is a workshop that has been kept. Organized, a little beautiful, ready for the next job. Type and whitespace carry the weight; color is a tool, not a uniform. The aesthetic family is small-shop editorial: Cabin, Sutro, Mast, the early Stripe blog era. Magazine-quarterly composure applied to a contractor's workbook.

This is a deliberate counter-positioning against the four traps that "contractor software" snaps to: hi-vis construction-cliché, generic SaaS-cream, AI-startup purple-gradient, and consumer-cute. Every visual choice should read as "a team of contractors-turned-builders made this for themselves," not "an agency themed a CRM in October."

The system serves three scenes simultaneously: a contractor in direct sunlight on a jobsite, a contractor at a desk at 9pm finishing invoices, and a contractor standing next to a homeowner presenting an estimate. No choice is allowed that only works in one scene.

**Key Characteristics:**
- Warm paper background, dense black ink, restrained accent.
- Hairline borders (0.5px) where most products use 1px. Lines whisper.
- Geist as the single typeface; weight + size do all the hierarchy work.
- Flat at rest. Elevation is a state, not a default.
- The accent (Pressroom Indigo) is rare. Used ≤10% of any screen.

## 2. Colors

A tinted-neutral palette plus one editorial accent. Every neutral leans warm; the accent is a single saturated indigo that earns its rarity.

### Primary
- **Pressroom Indigo** (`#4f46e5`): The single accent. Used for focus rings, primary links, active nav, and small badges. Rare on purpose. Has two siblings: `#eef0ff` (Pressroom Indigo Soft, used for badge / chip / avatar background) and `#1e1b4b` (Pressroom Indigo Ink, used for legible text on the soft variant).

### Neutral
- **Paper** (`#f6f5f2`): The default surface. Warm, tinted toward the brand hue. Used for app background, sheet body, drawer body.
- **Paper Deep** (`#ecebe6`): A half-step darker neutral for inset surfaces and subtle contrast against Paper.
- **Ink** (`#111113`): Near-black with a hint of blue. Display text, primary button background, primary type. Never `#000`.
- **Ink Soft** (`#2a2a2e`): Body prose color. Reduces eye strain at length without losing authority.
- **Ink Muted** (`#6b6a64`): Captions, secondary labels, supporting metadata. The voice of supporting copy.
- **Ink Faint** (`#a6a49d`): Disabled / decorative weight. Drag handles, placeholders, separators that read as silence.
- **Ink Line** (`#d8d6cd`): The hairline. Used for borders, dividers, the entire structural grid. Lighter than ink-faint on purpose so 0.5px reads.

### Supporting (status only, never decoration)
- **Emerald** (`#059669`): Success and confirmed state. Crew-confirmed dots, accepted assignments, "paid" badges.
- **Rose** (`#e11d48`): Destructive intent and error state. Sign-out, remove, validation errors.
- **Amber** (`#c89450`): Warning, pending, and "needs attention." Deliberately muted — closer to ochre than safety-vest yellow, so it cannot be mistaken for construction-cliché.

### Named Rules

**The One Accent Rule.** Pressroom Indigo appears on ≤10% of any given screen. Its rarity is the point. If two indigo elements compete on the same screen, one of them is wrong.

**The Warm-Tinted Neutral Rule.** Every neutral is tinted warm. `#000` and `#fff` are prohibited as surface or text colors. The closest legal equivalents are Ink (`#111113`) and pure white only inside `.paper-card` (because the card sits against the warm Paper background and needs the contrast).

**The Status-Is-Not-Decoration Rule.** Emerald, Rose, and Amber appear only when they encode state. They never decorate. A green dot means *confirmed*. An amber pill means *pending*. A rose button means *destructive*. Otherwise: don't.

## 3. Typography

**Display Font:** Geist (with `ui-sans-serif, system-ui, sans-serif` fallback)
**Body Font:** Geist
**Label/Mono Font:** `ui-monospace, SFMono-Regular, monospace` (data only, never UI chrome)

**Character:** Single-typeface system. Geist carries every register from large display down to micro-labels; the work is done by scale, weight, letter-spacing, and tabular numerals — not font pairing. The result reads composed without becoming precious. Tabular numerals (`font-variant-numeric: tabular-nums`) are explicit policy for stats and money.

### Hierarchy
- **Display** (600, 1.5rem / clamp at larger sizes, 1.1, `-0.015em`): Page titles, hero headlines, sheet titles. Always `font-display`. Tight negative letter-spacing is the editorial signal.
- **Headline** (600, 1.125rem, 1.25, `-0.01em`): Section headers inside dense screens, card titles.
- **Title** (500, 0.875rem, 1.4, `-0.005em`): List-item titles, primary inline labels.
- **Body** (400, 0.8125rem, 1.65, normal): Paragraph prose, secondary content. Capped at **65–75ch** for any block long enough to wrap.
- **Label** (500, 0.6875rem, 1.4, `+0.14em`, UPPERCASE): The `quiet-caps` utility. Used for section captions, group headers, form labels. The wide tracking is the rhythm.

### Named Rules

**The Single-Typeface Rule.** Geist does the entire hierarchy. Don't introduce a serif "for editorial feel," a script "for warmth," or a second sans "for contrast." Hierarchy comes from scale, weight, and letter-spacing within the one family.

**The Tabular Numeric Rule.** Money, counts, dates, durations, percentages — anything that lines up vertically — uses `font-variant-numeric: tabular-nums` (the `.tabular` utility). Mixed proportional and tabular numbers in the same column is forbidden.

**The Quiet-Caps Rule.** The `quiet-caps` style (11px, 500, `+0.14em`, uppercase, `--ink-soft`) is the system's section caption. Use it for category labels, group headings, form labels. Do not bump its size to "make it more important." If it needs to be louder, use a different style.

## 4. Elevation

The system is **flat at rest** with state-driven elevation. Surfaces stack via tonal layering (Paper → Paper Deep → white inside `.paper-card`) and 0.5px hairline borders. Shadows appear only when something temporarily lifts off the page: a popover, a modal, a bottom sheet, a hovering FAB.

### Shadow Vocabulary

- **Hairline** (`inset 0 0 0 0.5px rgba(17, 17, 19, 0.10)`): The default boundary. Used for outline buttons, input chrome, any element that needs to be present but not framed. Half-pixel matters: on 2× displays it's a true 1-device-pixel line, the editorial weight the rest of the system depends on.
- **Card** (`0 1px 0 rgba(17,17,19,0.04), 0 4px 16px -8px rgba(17,17,19,0.08)`): The `.paper-card` shadow. So subtle it reads as paper resting on paper, not a floating widget. One pixel of contact, then a soft halo.
- **Pop** (`0 20px 48px -24px rgba(17,17,19,0.25)`): Used for popovers and floating menus. The lift moment.
- **Glow** (`0 0 0 6px rgba(79, 70, 229, 0.08)`): The focus ring on hover for primary actions. Never combined with `pop`.
- **Sheet Lift** (`0 -16px 48px -12px rgba(17, 17, 19, 0.18)`): The custom shadow above the `BottomSheet` primitive. Faces upward because the sheet sits at the bottom.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat unless they are temporarily floating. A static list item, a static card, a static input: no shadow. The shadow vocabulary above is exhaustive — anything not in it is invented and wrong.

**The Hairline-Beats-Border Rule.** Default to 0.5px hairlines (`--ink-line`, the `hairline` utility). Use full 1px borders only when the element must remain legible on top of a colored surface (e.g. a button outline on a colored chip). 2px+ borders are prohibited as decorative accents.

## 5. Components

Hairline-and-tactile. Every component reads as a single deliberate object; nothing is wrapped in extra chrome. State changes happen through subtle color shifts and the focus ring, not through scale tricks or shadow pops.

### Buttons
- **Shape:** Rounded medium (`10px` / `--r-md`) for default size; rounded small (`6px` / `--r-sm`) for the `size="sm"` variant.
- **Primary:** `--ink` background, `--paper` text. 40px tall (`size="md"`). On hover: shifts to `--ink-soft`. On active: `translateY(1px)` for tactile press.
- **Ghost:** Transparent background, `--ink` text. On hover: `bg-black/[0.04]`.
- **Outline:** Transparent with the `hairline` utility (inset 0.5px). On hover: `bg-black/[0.025]`.
- **Danger:** `--rose` background, white text. Hover: `brightness(1.10)`.
- **Serif-link:** Inline italic display-font link with underline-offset `5px`; decoration shifts from `--ink-faint` to `--accent` on hover. Editorial signature, used sparingly inside prose surfaces.
- **Focus:** All variants use the `focus-ring` utility (3px Pressroom Indigo at 55% opacity, 1px Paper inset for the gap).

### Inputs
- **Style:** 40px tall, `--r-md` corners, semi-transparent white background (`rgba(255, 255, 255, 0.6)`) over the Paper surface. Hairline boundary, not a full border. Inline `prefix` / `suffix` slots for icons and units.
- **Focus:** `box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.18)` (the Glow shadow at 18% — a softer indigo halo than the button focus ring).
- **Error:** Same shadow shape, but rose-tinted (`rgba(225, 29, 72, 0.22)`). The error message appears below at 11px in `--rose`.
- **Label:** Above the input in `quiet-caps` style. Always.

### Badges / Chips
- **Shape:** Fully rounded (`9999px`), 11px text, `+0.01em` letter-spacing, 2px / 10px padding.
- **Tones:** Six tones, each pairing a tinted background with a darkened text role. `accent` uses `--accent-soft` + `--accent-ink`. `success` / `warn` / `danger` use the tailwind 50/800 pairs. `neutral` uses `bg-black/[0.05]` + `--ink-soft`. Never invent a seventh tone.
- **Dot variant:** Optional 6px leading dot at 70% opacity of the current text color.

### Paper Card (signature surface)
- **Corner Style:** `--r-lg` (16px).
- **Background:** Pure white (`#ffffff`) over the warm Paper surface — the one place pure white is legal.
- **Border:** `0.5px solid rgba(17, 17, 19, 0.10)`. The hairline.
- **Shadow:** The Card shadow from Elevation. Whisper, not lift.
- **Internal Padding:** 16px default. Internal hairline dividers (`divide-[color:var(--ink-line)]`) when stacking rows.

### Sheet / Dialog (modals)
- **Backdrop:** `bg-[color:var(--ink)]/35 backdrop-blur-[1px]`. Just enough blur to soften the receding content, not enough to glassmorphism.
- **Surface:** Paper background, hairline border on the meeting edge.
- **Header:** `font-display` title (18–22px), `--ink-muted` close button (X icon), border-bottom hairline.
- **Body:** 20–24px horizontal padding, generous vertical breathing room.

### BottomSheet (mobile signature)
- **Anchor:** Bottom edge, `pb-safe` for iOS home-indicator inset.
- **Corners:** `--r-xl` (24px) top corners only.
- **Drag handle:** 40px × 4px pill in `--ink-faint` at the top.
- **Motion:** Spring (stiffness 320, damping 36, mass 0.9) on open. Drag-down past 30% of sheet height dismisses; under 30% snaps back via `dragConstraints`. Reduced-motion replaces the spring with an instant transition.
- **Elevation:** Sheet Lift shadow facing upward.

### MobileDrawer (mobile signature)
- **Anchor:** Left or right edge. Required prop; no default — every consumer chooses deliberately.
- **Width:** Default `min(85vw, 400px)`.
- **Motion:** 280ms slide using the project's `editorialEase` curve (`cubic-bezier(0.22, 1, 0.36, 1)`). No bounce, no elastic. Reduced-motion replaces with instant.
- **Edge:** Hairline border on the inner edge facing content. Edge-direction-aware elevation shadow (`16px 0 …` for left-anchored, `-16px 0 …` for right) so the shadow always faces into content.
- **Safe area:** `pl-safe` on left-anchored, `pr-safe` on right.

### Navigation
- **Desktop sidebar:** Grouped lists under `quiet-caps` section labels. Items are 13px, hover applies `bg-black/[0.04]`, active uses `bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]`.
- **Mobile (Phase 1):** Bottom tab bar (Dashboard · Proposals · Schedule · Jobs · More) with a context-aware FAB. Not yet built; design contract lives in CLAUDE.md.

### Named Rules

**The No-Decorative-Card Rule.** Cards are not the default container. Use `.paper-card` only when the contained content is logically a discrete object that benefits from being lifted off the background. A list of nav items inside a drawer is not a card. A pricing tier is.

**The Hairline-Is-The-Boundary Rule.** The 0.5px hairline (`--ink-line`) is how the system signals structure. Full borders, ruled lines, and shadow-only separators are all wrong unless explicitly called for by a Component spec above.

## 6. Do's and Don'ts

Forceful guardrails. PRODUCT.md's four anti-references show up here verbatim so the visual spec carries the strategic line through.

### Do:
- **Do** use Pressroom Indigo (`#4f46e5`) sparingly — focus rings, primary links, active nav, ≤10% of any screen.
- **Do** prefer hairline 0.5px borders (`--ink-line`) over full 1px borders. The system's structure depends on this weight.
- **Do** use `quiet-caps` (11px, 500, `+0.14em` tracking, uppercase, `--ink-soft`) for every section caption, group label, and form label.
- **Do** use tabular numerals (`.tabular`) for money, dates, durations, counts, percentages. Mixed proportional + tabular in the same column is forbidden.
- **Do** treat shadow as a state, not a style. Static elements are flat; elevation appears only when something temporarily lifts.
- **Do** tint every neutral toward warm. `--paper` and `--paper-deep` are not pure gray for a reason.
- **Do** keep body line length to 65–75ch.
- **Do** respect `prefers-reduced-motion` everywhere — spring transitions collapse to instant.
- **Do** ensure all mobile touch targets are ≥44px and contrast meets WCAG 2.2 AA, with sun-readability as an additional informal constraint.

### Don't:
- **Don't** use construction-cliché visuals: no hi-vis safety yellow, no hardhat icons, no hammer mascots, no blueprint backgrounds, no jobsite-photo heroes, no orange CTAs. *(PRODUCT.md anti-reference #1 — the most important to refuse.)*
- **Don't** drift toward generic SaaS-cream: no HubSpot blue, no identical card grids of icon+heading+text, no hero-metric template tiles (big number + small label + gradient accent), no marketing-template chrome bolted onto product UI. *(PRODUCT.md anti-reference #2.)*
- **Don't** use AI-startup purple-gradients, sparkle icons on every AI feature, glassmorphism as default, or Linear-clone dark. *(PRODUCT.md anti-reference #3.)*
- **Don't** use mascot illustrations, playful pastels, gamified streaks, or oversized emoji icons. *(PRODUCT.md anti-reference #4.)*
- **Don't** use `#000` or `#fff` as surface or text colors. Use `--ink` and (only inside `.paper-card`) pure white.
- **Don't** introduce a second typeface. Geist is the entire system.
- **Don't** use side-stripe borders (`border-left` > 1px as a colored accent). Use full borders, background tints, leading icons, or nothing.
- **Don't** use gradient text (`background-clip: text` with a gradient). Solid color, weight, size — that's the toolkit.
- **Don't** reach for a modal as the first thought. Exhaust inline disclosure, progressive reveal, and sheet alternatives first.
- **Don't** invent a new accent color. Pressroom Indigo is the only accent. Emerald, Rose, Amber exist only as state.
- **Don't** add `md:` / `lg:` / `xl:` Tailwind responsive variants in new mobile work. Mobile-only viewport.
- **Don't** add dark-mode (`.dark`) variants in new work. Light theme only for this milestone.
- **Don't** introduce a token that doesn't already exist in `globals.css` or `tailwind.config.ts`. If you need one that isn't there, stop and ask.

---

*Generated by `/impeccable document` on 2026-05-12 in scan mode. Sources: `src/app/globals.css`, `tailwind.config.ts`, `src/lib/theme/motion.ts`, `src/components/ui/{Button, Badge, Input, Avatar, Sheet, Dialog, BottomSheet, MobileDrawer}.tsx`, and user-confirmed naming (Well-Kept Shop North Star, Pressroom Indigo accent). Sidecar at `.impeccable/design.json`.*
