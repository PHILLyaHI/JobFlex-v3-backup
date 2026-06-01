---
name: JobFlex
description: A small-shop editorial design system for contractor software. The well-kept shop, in cool paper and pressed sage.
colors:
  cool-paper: "#f7f8fa"
  cool-paper-deep: "#eef1f4"
  cool-ink: "#14181f"
  cool-ink-soft: "#3a4150"
  cool-ink-muted: "#5a6473"
  cool-ink-faint: "#8a93a1"
  cool-ink-line: "#e4e8ee"
  pressed-sage: "#1f7a52"
  pressed-sage-soft: "#e0f0e8"
  pressed-sage-ink: "#155637"
  emerald: "#059669"
  rose: "#e11d48"
  amber: "#c89450"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 600
    lineHeight: "1.05"
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: "1.25"
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.4"
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.55"
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
  md: "8px"
  lg: "14px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.pressed-sage}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.pressed-sage-ink}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.cool-ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.cool-ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-danger:
    backgroundColor: "{colors.rose}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  paper-card:
    backgroundColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "24px"
  input:
    backgroundColor: "rgba(255, 255, 255, 0.6)"
    textColor: "{colors.cool-ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  badge-neutral:
    backgroundColor: "rgba(20, 24, 31, 0.05)"
    textColor: "{colors.cool-ink-soft}"
    rounded: "9999px"
    padding: "2px 10px"
  badge-accent:
    backgroundColor: "{colors.pressed-sage-soft}"
    textColor: "{colors.pressed-sage-ink}"
    rounded: "9999px"
    padding: "2px 10px"
---

# Design System: JobFlex

## 1. Overview: The Well-Kept Shop

**Creative North Star: "The Well-Kept Shop"**

JobFlex's interface is a workshop that has been kept. Organized, a little beautiful, ready for the next job. Type and whitespace carry the weight; the green appears like a marked-up margin note. The system serves three scenes at once: a contractor in direct sunlight on a jobsite, a contractor at a desk at 9pm finishing invoices, and a contractor standing next to a homeowner presenting an estimate. No choice is allowed that only works in one scene.

The voice is composed, accurate, trustworthy. Editorial restraint over template-cream. Numeric-honest: money, dates, durations line up in tabular columns. Single-typeface: Geist does the entire hierarchy. The accent (Pressed Sage) is the system's confidence signal — used decisively on primary actions, active nav, accepted state, and key numerals, not sprinkled as decoration.

This is a deliberate counter-positioning against the four traps that "contractor software" snaps to: hi-vis construction cliché, generic SaaS-cream, AI-startup purple-gradient, and consumer-cute. Every visual choice should read as "a team of contractors-turned-builders made this for themselves," not "an agency themed a CRM in October."

**Key Characteristics:**
- Cool-paper background, cool near-black ink, **Pressed Sage** as the single accent.
- Layered depth: grounded low-chroma shadows + surface tonal layering. Hairlines are a quiet secondary tool.
- Geist as the single typeface; weight, scale, and letter-spacing carry hierarchy.
- Editorial table treatment: hairline dividers, whisper-zebra, comfortable row height, tabular numerals on money/views/dates.
- Status pills get subtle tonal fills per state; never gray-on-gray.

## 2. Colors: The Cool-Paper Palette

A cool-neutral palette plus one confident editorial accent. Every neutral leans subtly cool toward the brand hue; the accent is a single deep green that carries the system's identity.

### Primary
- **Pressed Sage** (`#1f7a52`): The single accent. Used decisively on primary buttons, active nav items, "Accepted" / "Paid" states, key numerals, focus rings, primary links. Has two siblings: `#e0f0e8` (Pressed Sage Soft, used for badge / chip / accent-soft fills) and `#155637` (Pressed Sage Ink, used for legible text on soft fills and for the primary button's hover state).

### Neutral
- **Cool Paper** (`#f7f8fa`): The default surface. Barely-cool off-white, tinted toward the brand hue. Used for app background, sheet body, drawer body.
- **Cool Paper Deep** (`#eef1f4`): A half-step darker neutral for inset surfaces, hover washes, zebra rows, and subtle contrast against Paper.
- **Cool Ink** (`#14181f`): Cool near-black. Display text, primary type, the dark anchor of the value range. Never `#000`.
- **Cool Ink Soft** (`#3a4150`): Body prose color and secondary headings. Reduces eye strain at length without losing authority.
- **Cool Ink Muted** (`#5a6473`): Captions, secondary labels, supporting metadata, table secondary text.
- **Cool Ink Faint** (`#8a93a1`): Disabled / decorative weight. Drag handles, placeholders, separators that read as silence.
- **Cool Ink Line** (`#e4e8ee`): The hairline. Borders, dividers, structural grid. Lighter than ink-faint on purpose so 0.5px reads.

### Supporting (status only, never decoration)
- **Emerald** (`#059669`): Reserved success states distinct from the accent. Crew-confirmed dots, "confirmed" assignments. Use only when the green needs to read as state, not brand.
- **Rose** (`#e11d48`): Destructive intent and error state. Sign-out, remove, validation errors.
- **Amber** (`#c89450`): Warning, pending, "needs attention." Deliberately muted — closer to ochre than safety-vest yellow, so it cannot be mistaken for construction cliché.

### Named Rules

**The One Accent Rule.** Pressed Sage is the only accent. It is the system's signal that something is primary, accepted, or moves money. Used confidently on primary CTAs and key states; never sprinkled decoratively. Calibrated at **≤10% of any screen** — its rarity preserves the signal. If two unrelated elements compete for accent on the same screen, one of them is wrong.

**The Tinted-Neutral Rule.** Every neutral is tinted toward the brand hue — subtly cool, never pure gray. `#000` and `#fff` are prohibited as surface or text colors. The closest legal equivalents are Cool Ink (`#14181f`) and pure white only inside `.paper-card` (because the card sits against the tinted Paper background and needs the contrast).

**The Status-Is-Not-Decoration Rule.** Emerald, Rose, and Amber appear only when they encode state. They never decorate. A green dot means *confirmed*. An amber pill means *pending*. A rose button means *destructive*. Pressed Sage is brand; the supporting trio is state.

**The Tonal-Pill Rule.** Status pills carry per-state tonal pairs — Accepted / Paid use `--accent-soft` + `--accent-ink`; Sent uses cool slate; Viewed uses warm tan; Declined uses muted rose; Expired uses neutral gray. Never gray-on-gray for differentiated states.

## 3. Typography: A Single Typeface

**Display Font:** Geist (with `ui-sans-serif, system-ui, sans-serif` fallback)
**Body Font:** Geist
**Label/Mono Font:** `ui-monospace, SFMono-Regular, monospace` (data tables only, never UI chrome)

**Character:** Single-typeface system. Geist carries every register from large display down to micro-labels; the work is done by scale, weight, letter-spacing, and tabular numerals — not font pairing. The result reads composed without becoming precious. Tabular numerals are explicit policy on money, views, counts, dates, durations.

### Hierarchy

- **Display** (600, 34px / `2.125rem`, 1.05, `-0.02em`): Page titles, hero headlines, sheet titles. Always `font-display`. Tight negative letter-spacing is the editorial signal.
- **Headline** (600, 17px / `1.0625rem`, 1.25, `-0.015em`): Card titles, section headers inside dense screens.
- **Title** (500, 14px / `0.875rem`, 1.4, `-0.005em`): List-item titles, primary inline labels, table primary cells.
- **Body** (400, 14px / `0.875rem`, 1.55, normal): Paragraph prose, secondary content. Capped at **65–75ch** for any block long enough to wrap.
- **Label** (500, 11px / `0.6875rem`, 1.4, `+0.14em`, UPPERCASE): The `quiet-caps` utility. Used for section captions, group headers, form labels, table column headers, stat tile labels. Wide tracking is the rhythm.

### Named Rules

**The Single-Typeface Rule.** Geist does the entire hierarchy. Do not introduce a serif "for editorial feel," a script "for warmth," or a second sans "for contrast." Hierarchy comes from scale, weight, and letter-spacing within the one family.

**The Tabular Numeric Rule.** Money, counts, dates, durations, percentages — anything that lines up vertically — uses `font-variant-numeric: tabular-nums` (the `.tabular` utility or `.stat-numeric` for display sizes). Mixed proportional and tabular numbers in the same column are forbidden.

**The Quiet-Caps Rule.** The `quiet-caps` utility (11px, 500, `+0.14em`, uppercase, `--ink-soft`) is the system's section caption. Used for category labels, group headings, form labels, table column heads, stat-tile labels. Do not bump its size to "make it more important." If it needs to be louder, use Headline.

## 4. Elevation: Layered, Not Lifted

Depth comes primarily from **grounded low-chroma shadows + surface tonal layering**, not from 1px borders or aggressive lifts. Cards rest on the page rather than float above it. Hairlines remain in the system as a quiet secondary tool, used where surfaces meet without needing fill contrast.

Surfaces stack tonally: `--paper` (#f7f8fa) → `--paper-deep` (#eef1f4) for inset / zebra / hover wash → pure white (`#ffffff`) inside `.paper-card` for the lifted-but-grounded signature surface. The shadow vocabulary below describes states where additional lift is warranted: a popover, a focus glow, a sheet rising from below.

### Shadow Vocabulary

- **Hairline** (`inset 0 0 0 0.5px rgba(20, 24, 31, 0.10)`): The boundary where two surfaces meet but neither needs to dominate. Used for outline buttons, input chrome, table dividers. Half-pixel matters: on 2× displays it's a true 1-device-pixel line.
- **Card** (`0 1px 2px rgba(20,24,31,0.05), 0 1px 3px rgba(20,24,31,0.05)`): The default `.paper-card` shadow and the `--shadow-sm` token. Grounded — reads as paper resting on paper, not a floating widget.
- **Pop** (`0 2px 6px rgba(20,24,31,0.05), 0 8px 24px rgba(20,24,31,0.08)`): The `--shadow-md` token. Used for popovers, dropdowns, the active stat tile, larger surfaces that benefit from definition.
- **Glow** (`0 0 0 6px rgba(31, 122, 82, 0.08)`): The focus ring on hover for primary actions. Pressed Sage at 8% opacity. Never combined with `pop`.
- **Sheet Lift** (`0 -16px 48px -12px rgba(20, 24, 31, 0.18)`): The shadow above the `BottomSheet` primitive. Faces upward because the sheet sits at the bottom.
- **Focus Ring** (`0 0 0 1px var(--cool-paper), 0 0 0 3px rgba(31, 122, 82, 0.55)`): The keyboard-focus halo. Pressed Sage at 55% with a 1px paper gap to read off any tinted surface.

### Named Rules

**The Layered-Depth Rule.** Static surfaces get depth from tonal layering and the Card shadow at rest. Pop and Sheet Lift are reserved for elements that temporarily float (menus, sheets, dialogs). Surfaces do not borrow Pop just because the page feels sleepy.

**The Hairline-Beats-Border Rule.** Default to 0.5px hairlines (`--cool-ink-line`, the `hairline` utility). Use full 1px borders only when an element must remain legible on top of a colored surface (e.g. a button outline on a tinted chip). 2px+ borders as decorative accents are prohibited.

## 5. Components: Editorial Primitives

Hairline-and-tactile. Every component reads as a single deliberate object; nothing is wrapped in extra chrome. State changes happen through subtle color shifts and the focus ring, not through scale tricks or shadow pops.

### Buttons

- **Shape:** Rounded medium (`8px` / `--r-md`) for default size. Rounded small (`6px` / `--r-sm`) for `size="sm"`. Same `--r-md` for `size="lg"`.
- **Primary:** `--accent` (Pressed Sage) background, white text. 40px tall (`size="md"`). On hover: shifts to `--accent-ink`. On active: `translateY(1px)` for tactile press. Inset highlight: `inset 0 1px 0 rgba(255,255,255,0.08)` adds a faint surface gleam.
- **Ghost:** Transparent background, `--ink` text. On hover: `bg-black/[0.04]`.
- **Outline:** Transparent with the `hairline` utility (inset 0.5px). On hover: `bg-black/[0.025]`.
- **Danger:** `--rose` background, white text. Hover: `brightness(1.10)`.
- **Serif-link:** Inline italic display-font link with underline-offset `5px`; decoration shifts from `--ink-faint` to `--accent` on hover. Editorial signature, used sparingly inside prose surfaces.
- **Focus:** All variants use the `focus-ring` utility (3px Pressed Sage at 55%, 1px Paper inset for the gap).

### Inputs

- **Style:** 40px tall, `--r-md` corners (8px), semi-transparent white background (`rgba(255, 255, 255, 0.6)`) over the Paper surface. Hairline boundary, not a full border. Inline `prefix` / `suffix` slots for icons and units.
- **Focus:** `box-shadow: 0 0 0 3px rgba(31, 122, 82, 0.18)` — the Pressed Sage halo at 18%, softer than the button focus ring.
- **Error:** Same shadow shape, rose-tinted (`rgba(225, 29, 72, 0.22)`). Error message appears below at 11px in `--rose`.
- **Label:** Above the input in `quiet-caps` style. Always.

### Badges / Chips

- **Shape:** Fully rounded (`9999px`), 11px text, `+0.01em` letter-spacing, ~2px / 10px padding.
- **Tones:** Six tones, each pairing a tinted background with a darkened text role. `accent` uses `--accent-soft` + `--accent-ink`. `success` / `warn` / `danger` use the tailwind 50/800 pairs. `neutral` uses `bg-black/[0.05]` + `--ink-soft`. `info` uses sky-50 + sky-800. Never invent a seventh tone.
- **Dot variant:** Optional 6px leading dot at 70% opacity of the current text color.

### Filter Chips (signature)

For status filters and tab strips on editorial table pages.

- **Shape:** Pill (`9999px`), 30px tall, 12px horizontal padding, 13px font, 500 weight.
- **Default:** `--bg-surface` background, `1px solid --border`, `--text-secondary` color. Hover: border tightens to `--border-strong`, text to `--text-primary`.
- **Active:** `--ink` background, `--ink` border, white text. Count badge inside switches to a 14%-opacity white wash.
- **Count badge:** 22×16px pill, 11.5px tabular numerals, sits at the trailing edge of each chip.

### Paper Card (signature surface)

- **Corner Style:** `--r-lg` (14px).
- **Background:** Pure white (`#ffffff`) over the cool Paper surface — the one place pure white is legal.
- **Border:** `0.5px solid rgba(17, 17, 19, 0.10)`. The hairline.
- **Shadow:** The Card shadow at rest. Grounded, not floating.
- **Internal Padding:** 24px default. Internal hairline dividers (`divide-[color:var(--ink-line)]`) when stacking rows.

### Editorial Table (signature)

For list pages: proposals, jobs, clients, leads, invoices.

- **Container:** `.paper-card`-style surface with overflow-hidden and the Card shadow.
- **Header:** `quiet-caps` cells in `--text-tertiary`, 12×18px padding, `--paper` background, hairline bottom.
- **Body row:** 14×18px padding, hairline top divider, `transition: background 120ms`. Hover wash: `--paper-deep`. Whisper zebra on odd rows: `rgba(238, 241, 244, 0.32)`.
- **Cells:** Primary text 14px 500 in `--ink`; secondary 12px in `--text-secondary` directly below, separated by 2px. Numeric cells right-aligned and tabular. Money cells use `font-weight: 600`.
- **Status:** Tonal pill column (see Badges / Filter Chips).
- **Action column:** 26×26px `⋯` menu trigger; hover bg `--paper-deep`.

### Stat Grid (signature)

For dashboard tiles.

- **Grid:** 4-column with `gap: 1px` and `background: var(--cool-ink-line)` on the container, producing hairline dividers without explicit borders.
- **Cell:** White-card background (`--bg-surface`), 18×20px padding, vertical flex with 10px gap.
- **Label:** `quiet-caps` in `--text-tertiary`.
- **Value:** 26px (or 40px for primary `.stat-numeric`), 600, tabular, `-0.02em` tracking. `--ink` by default; opt into `--accent` via the `accent` prop on the "primary" tile (e.g., "Open proposals / accepted").
- **Meta line:** 12px in `--text-secondary` with an optional `ArrowUpRight` delta in `--accent` (positive) or `--rose` (negative).

### Sheet / Dialog (modals)

- **Backdrop:** `bg-[color:var(--ink)]/35 backdrop-blur-[1px]`. Just enough blur to soften the receding content; not enough to glassmorphism.
- **Surface:** Paper background, hairline border on the meeting edge.
- **Header:** `font-display` title (17–22px), `--ink-muted` close button, hairline bottom.
- **Body:** 20–24px horizontal padding, generous vertical breathing room.

### BottomSheet (mobile signature)

- **Anchor:** Bottom edge, `pb-safe` for iOS home-indicator inset.
- **Corners:** `--r-xl` (24px) top corners only.
- **Drag handle:** 40×4px pill in `--ink-faint` at the top.
- **Motion:** Spring (stiffness 320, damping 36, mass 0.9) on open. Drag-down past 30% of sheet height dismisses; under 30% snaps back via `dragConstraints`. Reduced-motion replaces the spring with an instant transition.
- **Elevation:** Sheet Lift shadow facing upward.

### MobileDrawer (mobile signature)

- **Anchor:** Left or right edge. Required prop; no default — every consumer chooses deliberately.
- **Width:** Default `min(85vw, 400px)`.
- **Motion:** 280ms slide using the project's `editorialEase` curve (`cubic-bezier(0.22, 1, 0.36, 1)`). No bounce, no elastic. Reduced-motion replaces with instant.
- **Edge:** Hairline border on the inner edge facing content. Edge-direction-aware elevation shadow (`16px 0 …` for left-anchored, `-16px 0 …` for right) so the shadow always faces into content.
- **Safe area:** `pl-safe` on left-anchored, `pr-safe` on right.

### Navigation

- **Desktop sidebar:** Grouped lists under `quiet-caps` section labels (Work, Delivery, Money, Automation). Items are 13px in `--ink-soft`. Hover applies `bg-black/[0.04]`. **Active item:** `bg-[color:var(--accent-soft)] text-[color:var(--accent)]` with a 2.5px Pressed Sage rail on the inside-left edge, a 4px Pressed Sage dot on the inside-right, and `font-weight: 500`.
- **Mobile (Phase 1):** Bottom tab bar (Dashboard · Proposals · Schedule · Jobs · More) with a context-aware FAB. Design contract lives in CLAUDE.md.

### Page Header (signature block)

For every dashboard-section page.

- **Layout:** Flex, items end-aligned, wrap, 16px gap, 32px bottom padding before content.
- **Eyebrow:** Optional `quiet-caps` line above the title (e.g., "JobFlex · Sales").
- **Title:** Display tier — 34px Geist 600, `-0.02em` tracking, 1.05 line-height, `--ink`.
- **Description:** 14px in `--ink-muted`, 8px below the title, max-width `~56ch`.
- **Actions:** Right-aligned cluster of buttons with 8px gap. Primary CTA uses Pressed Sage.

### Named Rules

**The No-Decorative-Card Rule.** Cards are not the default container. Use `.paper-card` only when the contained content is logically a discrete object that benefits from being lifted off the background. A list of nav items inside a drawer is not a card. A pricing tier is.

**The Hairline-Is-The-Boundary Rule.** The 0.5px hairline (`--cool-ink-line`) is how the system signals structure where shadows don't carry the load. Full borders, ruled lines, and shadow-only separators are all wrong unless explicitly called for by a component spec above.

**The Confident-Accent Rule.** Primary buttons, active sidebar items, "Accepted"/"Paid" pills, and key stat numerals all bind to `--accent`. The accent is the system's identity signal — not a sparkle, not a decoration, never just a focus ring. If a button is a primary action, it goes green. If a nav item is the current page, it goes accent-soft + accent rail. This is the variant-2v-neutral lesson.

## 6. Do's and Don'ts

Forceful guardrails. PRODUCT.md's four anti-references show up here verbatim so the visual spec carries the strategic line through.

### Do:

- **Do** use Pressed Sage (`#1f7a52`) confidently on primary CTAs, active nav, Accepted/Paid pills, key numerals, and focus rings. The accent is a signal, not a sprinkle.
- **Do** prefer hairline 0.5px borders (`--cool-ink-line`) over full 1px borders for static dividers. The system's structure depends on this weight.
- **Do** use `quiet-caps` (11px, 500, `+0.14em` tracking, uppercase, `--ink-soft`) for every section caption, group label, form label, and table column header.
- **Do** use tabular numerals (`.tabular` for body, `.stat-numeric` for display) on money, dates, durations, counts, percentages. Mixed proportional + tabular in the same column is forbidden.
- **Do** treat depth as layered: grounded shadows for cards at rest, tonal surface stacking for static layering, Pop only when something temporarily floats.
- **Do** tint every neutral toward cool. `--cool-paper` and `--cool-paper-deep` are not pure gray for a reason.
- **Do** keep body line length to 65–75ch.
- **Do** apply per-state tonal fills to status pills — Accepted/Paid green, Sent cool-slate, Viewed warm-tan, Declined muted-rose, Expired neutral-gray. Never gray-on-gray for differentiated states.
- **Do** respect `prefers-reduced-motion` everywhere — spring transitions collapse to instant.
- **Do** ensure all mobile touch targets are ≥44px and contrast meets WCAG 2.2 AA, with sun-readability as an additional informal constraint.

### Don't:

- **Don't** use construction-cliché visuals: no hi-vis safety yellow, no hardhat icons, no hammer mascots, no blueprint backgrounds, no jobsite-photo heroes, no orange CTAs. *(PRODUCT.md anti-reference #1 — the most important to refuse.)*
- **Don't** drift toward generic SaaS-cream: no HubSpot blue, no identical card grids of icon+heading+text, no hero-metric template tiles (big number + small label + gradient accent), no marketing-template chrome bolted onto product UI. *(PRODUCT.md anti-reference #2.)*
- **Don't** use AI-startup purple-gradients, sparkle icons on every AI feature, glassmorphism as default, or Linear-clone dark. *(PRODUCT.md anti-reference #3.)*
- **Don't** use mascot illustrations, playful pastels, gamified streaks, or oversized emoji icons. *(PRODUCT.md anti-reference #4.)*
- **Don't** use `#000` or `#fff` as surface or text colors. Use `--cool-ink` and (only inside `.paper-card`) pure white.
- **Don't** introduce a second typeface. Geist is the entire system.
- **Don't** use side-stripe borders (`border-left` greater than 1px as a colored accent on cards or list items). Use full borders, background tints, leading icons, or nothing. The Sidebar active rail is the one calibrated exception (2.5px Pressed Sage as the *active-page* signal).
- **Don't** use gradient text (`background-clip: text` with a gradient). Solid color, weight, size — that's the toolkit.
- **Don't** reach for a modal as the first thought. Exhaust inline disclosure, progressive reveal, and sheet alternatives first.
- **Don't** invent a new accent color. Pressed Sage is the only accent. Emerald, Rose, Amber exist only as state.
- **Don't** sprinkle the accent decoratively. If a green pixel doesn't earn its meaning (primary action, active state, accepted/paid status, key numeral), it should be ink or neutral.
- **Don't** add `md:` / `lg:` / `xl:` Tailwind responsive variants in new mobile work. Mobile-only viewport.
- **Don't** add dark-mode (`.dark`) variants in new work. Light theme only for this milestone. (The `.dark` block in globals.css is reserved for a future milestone.)
- **Don't** introduce a token that doesn't already exist in `globals.css` or `tailwind.config.ts`. If you need one that isn't there, stop and ask.

---

*Generated by `/impeccable document` on 2026-06-01 in scan mode after the cool-neutral / Pressed Sage rebase landed in `main` (commit `39a5202`). Sources: `src/app/globals.css`, `tailwind.config.ts`, `src/components/ui/{Button, StatCard, Input, Badge, PageHeader, Card}.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/v3/{proposals-c, calendar-a, workers-new}/*`, and user-confirmed naming (Well-Kept Shop North Star, Pressed Sage accent, layered elevation). Sidecar at `.impeccable/design.json`.*
