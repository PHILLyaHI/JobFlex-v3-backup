# Estimator Hub + Manual Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a blueprint-styled estimator picker hub at `/dashboard/estimators` and a manual line-item estimate builder at `/dashboard/estimators/manual`, desktop first, then handheld twins that serve the same two URLs at ≤768px.

**Architecture:** Two new surfaces in the existing v3 blueprint fleet. Each renders only the `.content` children — sidebar, topbar and sprite come from the shared shell in `src/app/dashboard/layout.tsx`. Unlike the 22 existing pages these are not HTML-donor ports, so they are written as idiomatic React with `useState` rather than a `*-behavior.ts` DOM script; everything else about the fleet contract (literal class names, `.bp :global(.content …)` module scoping, `PAGE_STYLES` activation, the `.rv` reveal cascade, tokens declared on `.content`) is preserved exactly.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.6, CSS Modules (Lightning CSS), NextAuth v5 `auth()` guards. No new dependencies.

## Global Constraints

- **Both routes share one CSS module.** `pageKey()` in `src/components/v3/blueprint-shell/blueprint-shell.tsx:85-89` returns the first path segment after `/dashboard`, so `/dashboard/estimators` and `/dashboard/estimators/manual` both key to `"estimators"`. There is exactly ONE `estimators.module.css` and ONE `PAGE_STYLES` entry covering both pages.
- **Class-name convention.** TSX uses **literal** class names (`className="page-head"`). The CSS module writes every content rule as `.bp :global(.content SEL) { … }`. Do not import the module into the TSX and do not use `styles.foo` — the shell applies `.bp` via `PAGE_STYLES`.
- **Tokens land on `.content`,** never on the module root: `.bp :global(.content) { --paper: …; }`. Copy the token block verbatim from `src/components/v3/clients-blueprint/clients.module.css` (lines 31 onward) so the two pages share the fleet's exact values.
- **No `@keyframes` inside a CSS module** — Lightning CSS rejects them. Reuse the keyframes already declared in `src/components/v3/dashboard-blueprint/blueprint-global.css`; if a genuinely new one is needed, add it there.
- **Top-level blocks must be direct children of `.content`** — the reveal cascade selects `content.children`.
- **Design tokens only.** No hardcoded color literals in new rules outside the token block. Values: `--paper: #f2f0eb`, `--ink: #0a0a0a`, `--blueprint: #1854a0`, `--sky: #4a9eff`, radii `2px`, shadows `3px 3px 0` / `4px 4px 0`, `--ease-out: cubic-bezier(0.22, 0.61, 0.36, 1)`.
- **Type:** Inter 800–900 caps for headings, JetBrains Mono (`var(--font-mono)`) for the annotation layer, tabular numerals (`font-variant-numeric: tabular-nums`) on every money and quantity figure.
- **Color distribution ~80 / 15 / 5** neutral / blueprint / sky+status. Status color is for status only, never decoration.
- **Light mode only.** No `.dark` variants.
- **Touch targets ≥44px** on both surfaces.
- **`prefers-reduced-motion: reduce` fully honored** — reveal cascade and the total-changed highlight both become instant.
- **No data layer.** Fixtures only: no Prisma, no server actions, no API routes, no persistence. `CONVERT TO PROPOSAL` routes without saving and the file header says so.
- **No tests.** No framework is installed and adding one requires the owner's approval (CLAUDE.md). Verification is `npm run typecheck`, scoped `npm run lint`, and viewport review.
- **No Radix.** Overlays are hand-rolled in the house `.mdl` vocabulary — see `src/components/calendar/InboxSheet.tsx` and the `.mdl` rules in `blueprint-global.css:77-85`.
- **Commits only when the owner asks.** No task ends in a `git commit`. Stage nothing automatically.
- **Do not touch** the Roof, Fence or Smart Proposal estimators.

## File Structure

**Created — desktop:**

| File | Responsibility |
| --- | --- |
| `src/components/v3/estimators-blueprint/estimators.module.css` | ALL styling for both routes: token block, reveal rules, hub grid, builder three-zone workspace |
| `src/components/v3/estimators-blueprint/use-reveal.ts` | The fleet's mount + reveal cascade contract for React-authored pages |
| `src/components/v3/estimators-blueprint/estimators-data.ts` | `ENGINES[]` fixture for the hub |
| `src/components/v3/estimators-blueprint/estimators-content.tsx` | Hub markup |
| `src/components/v3/estimators-blueprint/manual-builder-types.ts` | Shared `Row` / `Section` / `Rates` / price-book types |
| `src/components/v3/estimators-blueprint/manual-builder-totals.ts` | Pure calc — no React |
| `src/components/v3/estimators-blueprint/manual-builder-data.ts` | Seed sheet, `PRICE_BOOK[]`, `TEMPLATES[]` |
| `src/components/v3/estimators-blueprint/manual-builder-content.tsx` | Three-zone workspace |
| `src/app/dashboard/estimators/page.tsx` | Hub route shell + auth guard |
| `src/app/dashboard/estimators/manual/page.tsx` | Builder route shell + auth guard |

**Created — handheld (Phase B):**

| File | Responsibility |
| --- | --- |
| `src/app/(mobile)/mobile-estimators-v2/page.tsx` + `mobile-estimators.tsx` + `mobile-estimators.module.css` | Handheld hub |
| `src/app/(mobile)/mobile-manual-builder-v2/page.tsx` + `mobile-manual-builder.tsx` + `mobile-manual-builder.module.css` | Handheld builder |

**Modified:**

| File | Change |
| --- | --- |
| `src/components/v3/proposals-blueprint/sprite.tsx` | Add the `i-ruler` symbol |
| `src/components/v3/blueprint-shell/nav-map.ts` | One nav item + two `SURFACE_ALIASES` entries |
| `src/components/v3/blueprint-shell/blueprint-shell.tsx` | One import + one `PAGE_STYLES` entry |
| `src/components/v3/responsive-shell/responsive-dashboard-shell.tsx` | Two lazy imports + two `HANDHELD_SURFACES` entries |

---

## PHASE A — DESKTOP

### Task 1: Route scaffolding, nav entry, and the reveal contract

Deliverable: both URLs resolve, render inside the blueprint shell with the correct tokens and graph-paper ground, the sidebar lights "Estimators" on both, and top-level blocks reveal on mount.

**Files:**
- Create: `src/components/v3/estimators-blueprint/estimators.module.css`
- Create: `src/components/v3/estimators-blueprint/use-reveal.ts`
- Create: `src/app/dashboard/estimators/page.tsx`
- Create: `src/app/dashboard/estimators/manual/page.tsx`
- Modify: `src/components/v3/proposals-blueprint/sprite.tsx`
- Modify: `src/components/v3/blueprint-shell/nav-map.ts:46-60` (Automation section) and `nav-map.ts:69-92` (`SURFACE_ALIASES`)
- Modify: `src/components/v3/blueprint-shell/blueprint-shell.tsx:40-48` (imports) and `:57-78` (`PAGE_STYLES`)

**Interfaces:**
- Produces: `useReveal(): void` — call once at the top of a content component. `estimators.module.css` exporting a `.bp` root class. Route `/dashboard/estimators` and `/dashboard/estimators/manual`.
- Consumes: `useBlueprintContent(init)` from `@/components/v3/blueprint-shell/use-blueprint-content`.

- [ ] **Step 1: Add the `i-ruler` sprite symbol**

In `src/components/v3/proposals-blueprint/sprite.tsx`, add this symbol alongside the others (they are all 24×24, `fill: none`, `stroke: currentColor`, `stroke-width: 2`, so it inherits styling from the existing `.ic` rules — do not add attributes the siblings do not carry):

```tsx
<symbol id="i-ruler" viewBox="0 0 24 24">
  <rect x="2" y="8" width="20" height="8" rx="1" />
  <path d="M6 8v3M10 8v4M14 8v3M18 8v4" />
</symbol>
```

- [ ] **Step 2: Add the nav item**

In `src/components/v3/blueprint-shell/nav-map.ts`, make it the FIRST item of the Automation section:

```ts
  {
    label: "Automation",
    items: [
      { label: "Estimators", icon: "i-ruler", href: "/dashboard/estimators" },
      { label: "Smart Proposal", icon: "i-bulb", href: "/dashboard/advanced-ai" },
      // …the rest unchanged
```

Then add two entries to `SURFACE_ALIASES` (used by the handheld twins in Phase B; harmless until then):

```ts
  "/mobile-estimators-v2": "/dashboard/estimators",
  "/mobile-manual-builder-v2": "/dashboard/estimators",
```

Both alias to the hub deliberately: `activeHref` does longest-prefix matching, and `/dashboard/estimators` is the nav item that owns the child route.

- [ ] **Step 3: Create the CSS module with tokens, reveal rules and the page-head vocabulary**

Create `src/components/v3/estimators-blueprint/estimators.module.css`. Open with a header comment explaining that this ONE module dresses BOTH routes because they share a `pageKey`, and that the page is React-authored rather than donor-ported.

Copy the token block verbatim from `src/components/v3/clients-blueprint/clients.module.css` (the `.bp :global(.content) { --paper: … }` block) so the values match the fleet exactly. Then add:

```css
/* Reveal cascade — same timings as the ported pages. */
.bp :global(.content .rv) {
  opacity: 0;
  transform: translateY(14px);
  transition: opacity 0.42s cubic-bezier(0.22, 0.61, 0.36, 1),
              transform 0.42s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.bp :global(.content .rv-in) { opacity: 1; transform: none; }

@media (prefers-reduced-motion: reduce) {
  .bp :global(.content .rv) { opacity: 1; transform: none; transition: none; }
}

/* Page head — matches the fleet's masthead vocabulary. */
.bp :global(.content .page-head) {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}
.bp :global(.content .kicker) {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted-light);
}
.bp :global(.content .page-title) {
  margin: 4px 0 0;
  font-family: var(--font-display), sans-serif;
  font-size: 30px;
  font-weight: 900;
  letter-spacing: -0.02em;
  text-transform: uppercase;
  color: var(--ink);
}
```

- [ ] **Step 4: Register the module in `PAGE_STYLES`**

In `blueprint-shell.tsx`, add the import beside its alphabetical neighbours and one map entry:

```tsx
import estimatorsStyles from "@/components/v3/estimators-blueprint/estimators.module.css";
```
```tsx
  estimators: estimatorsStyles.bp,
```

- [ ] **Step 5: Write the reveal hook**

Create `src/components/v3/estimators-blueprint/use-reveal.ts`:

```ts
"use client";

// The fleet's mount contract for the two React-authored estimator pages.
//
// The 22 ported pages get their reveal from a `*-behavior.ts` DOM script. These
// two have no donor, so the cascade lives here: same classes (.rv / .rv-in),
// same 70ms stagger, same layout-effect timing via useBlueprintContent — so the
// first paint is already primed and navigation does not double-take.

import { useCallback } from "react";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";

export function useReveal() {
  // Stable identity: useBlueprintContent re-runs (and replays the cascade) on
  // every identity change of `init`.
  const init = useCallback((content: HTMLElement) => {
    const blocks = Array.from(content.children) as HTMLElement[];

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      blocks.forEach((b) => b.classList.add("rv", "rv-in"));
      return () => blocks.forEach((b) => b.classList.remove("rv", "rv-in"));
    }

    blocks.forEach((b) => b.classList.add("rv"));
    const timers = blocks.map((b, i) =>
      window.setTimeout(() => b.classList.add("rv-in"), 60 + i * 70),
    );
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      blocks.forEach((b) => b.classList.remove("rv", "rv-in"));
    };
  }, []);

  useBlueprintContent(init);
}
```

- [ ] **Step 6: Create both route shells with placeholder content**

`src/app/dashboard/estimators/page.tsx` — mirror the fleet's shape exactly (see `src/app/dashboard/fence-estimator/page.tsx`):

```tsx
// Estimator hub (route: /dashboard/estimators) — the picker for every
// estimating engine in the app. Not a donor port: authored in React, dressed by
// estimators-blueprint/estimators.module.css, which the shell activates through
// PAGE_STYLES under the shared page key "estimators".
//
// Fixture data by design — the data layer is out of scope until the layout is
// signed off. No Prisma, no server action, no network call.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { EstimatorsContent } from "@/components/v3/estimators-blueprint/estimators-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Estimators",
  description:
    "Every estimating engine on one sheet — pick the one that matches the job and start measuring.",
};

export default async function EstimatorsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Festimators");
  }

  return <EstimatorsContent />;
}
```

`src/app/dashboard/estimators/manual/page.tsx` — same shape, importing `ManualBuilderContent`, `title: "JobFlex · Manual Builder"`, description `"Build an estimate by hand — line items, price book, live totals."`, redirect target `"/auth/login?next=%2Fdashboard%2Festimators%2Fmanual"`.

- [ ] **Step 7: Create both content components as minimal stubs**

`estimators-content.tsx` and `manual-builder-content.tsx`, both `"use client"`, both calling `useReveal()`, each returning a fragment whose first child is a `.page-head` block. Stub bodies are replaced in Tasks 2–6; this step exists so the routes compile and can be looked at.

```tsx
"use client";

import { useReveal } from "./use-reveal";

export function EstimatorsContent() {
  useReveal();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Automation</div>
          <h1 className="page-title">Estimators</h1>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 8: Verify**

Run: `npm run typecheck`
Expected: clean.

Run: `npm run lint -- --file src/components/v3/estimators-blueprint/estimators-content.tsx --file src/components/v3/estimators-blueprint/manual-builder-content.tsx --file src/components/v3/estimators-blueprint/use-reveal.ts`
Expected: clean. (Full-repo lint fails on pre-existing legacy errors — always scope it.)

With `npm run dev` running, load `/dashboard/estimators` and `/dashboard/estimators/manual` in the browser. Expected: paper background with the graph-paper ground, the masthead reading ESTIMATORS, the sidebar's "Estimators" item lit on **both** routes, and the block fading up on mount. A 307 to `/auth/login` means the route compiled and the auth guard fired — that is a pass for compilation, and the page must then be checked while signed in.

---

### Task 2: Estimator hub — data and spec-card grid

Deliverable: `/dashboard/estimators` renders four active engine cards and three queued stubs; clicking an active card navigates to that estimator.

**Files:**
- Create: `src/components/v3/estimators-blueprint/estimators-data.ts`
- Modify: `src/components/v3/estimators-blueprint/estimators-content.tsx`
- Modify: `src/components/v3/estimators-blueprint/estimators.module.css`

**Interfaces:**
- Consumes: `useReveal()` from Task 1.
- Produces: `ENGINES: Engine[]`, `type Engine`.

- [ ] **Step 1: Write the engine fixture**

Create `estimators-data.ts`:

```ts
// The engine roster the hub draws. Fixture, not a query: which estimators exist
// is a product fact, not org data, and the queued rows are honest placeholders
// for trades that have no engine yet — they render disabled, never clickable.

export type EngineDiagram = "roof" | "fence" | "sheet" | "prose";

export type Engine = {
  id: string;
  title: string;
  /** Lowercase method line under the title — how you feed this engine. */
  method: string;
  diagram: EngineDiagram;
  spec: { input: string; output: string; time: string };
} & (
  | { status: "active"; href: string }
  | { status: "queued"; href?: never }
);

export const ENGINES: Engine[] = [
  {
    id: "roof",
    title: "Roof",
    method: "satellite trace",
    diagram: "roof",
    status: "active",
    href: "/dashboard/roof-estimator",
    spec: { input: "aerial imagery", output: "squares · facets", time: "~4 min" },
  },
  {
    id: "fence",
    title: "Fence",
    method: "map trace",
    diagram: "fence",
    status: "active",
    href: "/dashboard/fence-estimator",
    spec: { input: "drawn polyline", output: "linear ft · gates", time: "~3 min" },
  },
  {
    id: "manual",
    title: "Manual",
    method: "line items",
    diagram: "sheet",
    status: "active",
    href: "/dashboard/estimators/manual",
    spec: { input: "typed rows", output: "cost sheet", time: "~9 min" },
  },
  {
    id: "smart",
    title: "Smart Proposal",
    method: "describe it",
    diagram: "prose",
    status: "active",
    href: "/dashboard/advanced-ai",
    spec: { input: "plain prose", output: "cost sheet", time: "~2 min" },
  },
  { id: "deck", title: "Deck", method: "queued", diagram: "sheet", status: "queued",
    spec: { input: "—", output: "—", time: "—" } },
  { id: "concrete", title: "Concrete", method: "queued", diagram: "sheet", status: "queued",
    spec: { input: "—", output: "—", time: "—" } },
  { id: "paint", title: "Paint", method: "queued", diagram: "sheet", status: "queued",
    spec: { input: "—", output: "—", time: "—" } },
];

export const ACTIVE_COUNT = ENGINES.filter((e) => e.status === "active").length;
export const QUEUED_COUNT = ENGINES.filter((e) => e.status === "queued").length;
```

- [ ] **Step 2: Write the four diagrams**

Add to `estimators-content.tsx` a `Diagram` component. These are the 5% sky/blueprint accent — line art on the card's graph-paper ground, `stroke-width: 2`, `currentColor` so the CSS controls the colour:

```tsx
function Diagram({ kind }: { kind: EngineDiagram }) {
  return (
    <svg className="eng-dia" viewBox="0 0 120 56" aria-hidden="true">
      {kind === "roof" && (
        <>
          <path d="M10 44 L40 16 L70 44 Z" />
          <path d="M70 44 L92 24 L110 44 Z" />
          <path d="M40 16 L92 24" strokeDasharray="3 3" />
        </>
      )}
      {kind === "fence" && (
        <>
          <path d="M12 40 L108 40" />
          <path d="M20 40 V22 M44 40 V22 M68 40 V22 M92 40 V22" />
          <path d="M12 30 L108 30" strokeDasharray="3 3" />
        </>
      )}
      {kind === "sheet" && (
        <>
          <rect x="20" y="10" width="80" height="38" rx="1" />
          <path d="M20 22 L100 22 M20 30 L100 30 M20 38 L100 38" strokeDasharray="3 3" />
          <path d="M72 10 V48" />
        </>
      )}
      {kind === "prose" && (
        <>
          <path d="M14 16 L54 16 M14 24 L48 24 M14 32 L54 32 M14 40 L40 40" />
          <path d="M62 28 L76 28" strokeDasharray="3 3" />
          <rect x="82" y="14" width="26" height="28" rx="1" />
          <path d="M82 24 L108 24 M82 32 L108 32" strokeDasharray="2 3" />
        </>
      )}
    </svg>
  );
}
```

- [ ] **Step 3: Write the hub body**

Replace the stub return in `estimators-content.tsx`. Note the grid and the head counter block are direct children of the fragment, so they each get a reveal step:

```tsx
"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useReveal } from "./use-reveal";
import { ENGINES, ACTIVE_COUNT, QUEUED_COUNT, type EngineDiagram } from "./estimators-data";

export function EstimatorsContent() {
  useReveal();
  const router = useRouter();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Automation</div>
          <h1 className="page-title">Estimators</h1>
        </div>
        <div className="eng-count">
          {ACTIVE_COUNT} active · {QUEUED_COUNT} queued
        </div>
      </div>

      <div className="eng-grid">
        {ENGINES.map((engine) =>
          engine.status === "active" ? (
            <button
              key={engine.id}
              type="button"
              className="eng-card"
              onClick={() => router.push(engine.href as Route)}
            >
              <span className="eng-dia-wrap">
                <Diagram kind={engine.diagram} />
              </span>
              <span className="eng-title">{engine.title}</span>
              <span className="eng-method">{engine.method}</span>
              <dl className="eng-spec">
                <div><dt>Input</dt><dd>{engine.spec.input}</dd></div>
                <div><dt>Output</dt><dd>{engine.spec.output}</dd></div>
                <div><dt>Typ. time</dt><dd>{engine.spec.time}</dd></div>
              </dl>
              <span className="eng-start">
                Start
                <svg className="ic"><use href="#i-arrow" /></svg>
              </span>
            </button>
          ) : (
            <div key={engine.id} className="eng-card eng-card--queued" aria-disabled="true">
              <span className="eng-title">{engine.title}</span>
              <span className="eng-tag">Queued</span>
            </div>
          ),
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Style the grid**

Append to `estimators.module.css`. The whole card is a `<button>`, so reset its native chrome first:

```css
.bp :global(.content .eng-count) {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
  color: var(--muted-light);
}

.bp :global(.content .eng-grid) {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.bp :global(.content .eng-card) {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  margin: 0;
  padding: 16px;
  font: inherit;
  text-align: left;
  background: var(--paper);
  border: 2px solid var(--ink);
  border-radius: 2px;
  box-shadow: 3px 3px 0 rgba(10, 10, 10, 0.06);
  cursor: pointer;
  transition: box-shadow 0.18s var(--ease-out), transform 0.18s var(--ease-out);
}
.bp :global(.content .eng-card:hover),
.bp :global(.content .eng-card:focus-visible) {
  box-shadow: 4px 4px 0 rgba(10, 10, 10, 0.1);
  transform: translateY(-1px);
}
.bp :global(.content .eng-card:focus-visible) { outline: 2px solid var(--blueprint); outline-offset: 2px; }

/* Graph-paper ground behind the diagram — the drawing surface, 15% blueprint. */
.bp :global(.content .eng-dia-wrap) {
  display: block;
  padding: 10px 0;
  background-image:
    linear-gradient(rgba(24, 84, 160, 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(24, 84, 160, 0.07) 1px, transparent 1px);
  background-size: 8px 8px;
  border: 1px solid var(--hair);
  border-radius: 2px;
}
.bp :global(.content .eng-dia) {
  display: block;
  width: 100%;
  height: 56px;
  fill: none;
  stroke: var(--blueprint);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.bp :global(.content .eng-title) {
  font-family: var(--font-display), sans-serif;
  font-size: 17px;
  font-weight: 900;
  letter-spacing: -0.01em;
  text-transform: uppercase;
  color: var(--ink);
}
.bp :global(.content .eng-method) {
  margin-top: -6px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.bp :global(.content .eng-spec) { margin: 0; display: grid; gap: 3px; }
.bp :global(.content .eng-spec > div) {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 3px 0;
  border-bottom: 1px dashed var(--hair);
}
.bp :global(.content .eng-spec dt) {
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted-light);
}
.bp :global(.content .eng-spec dd) {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--ink-soft);
}

.bp :global(.content .eng-start) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  margin-top: auto;
  padding: 0 12px;
  font-family: var(--font-display), sans-serif;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #fff;
  background: var(--blueprint);
  border-radius: 2px;
}
.bp :global(.content .eng-start .ic) {
  width: 16px; height: 16px;
  fill: none; stroke: currentColor; stroke-width: 2;
  stroke-linecap: round; stroke-linejoin: round;
}

/* Queued: an honest placeholder — dashed, faint, not focusable. */
.bp :global(.content .eng-card--queued) {
  gap: 8px;
  min-height: 120px;
  justify-content: center;
  background: transparent;
  border: 2px dashed var(--muted-faint);
  box-shadow: none;
  cursor: default;
}
.bp :global(.content .eng-card--queued:hover) { box-shadow: none; transform: none; }
.bp :global(.content .eng-card--queued .eng-title) { color: var(--muted-light); }
.bp :global(.content .eng-tag) {
  align-self: flex-start;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted-faint);
}

@media (prefers-reduced-motion: reduce) {
  .bp :global(.content .eng-card) { transition: none; }
  .bp :global(.content .eng-card:hover) { transform: none; }
}
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck` — expected clean.
Run: `npm run lint -- --file src/components/v3/estimators-blueprint/estimators-content.tsx --file src/components/v3/estimators-blueprint/estimators-data.ts` — expected clean.

In the browser at ≥1280px: three cards per row, four active + three ghosted. Tab through — every active card takes focus with a visible blueprint outline, queued cards are skipped. Click Manual → lands on `/dashboard/estimators/manual`. Click Roof → `/dashboard/roof-estimator` renders unchanged.

---

### Task 3: Builder types, totals math, and fixtures

Deliverable: the pure core of the builder, importable and readable on its own. No UI.

**Files:**
- Create: `src/components/v3/estimators-blueprint/manual-builder-types.ts`
- Create: `src/components/v3/estimators-blueprint/manual-builder-totals.ts`
- Create: `src/components/v3/estimators-blueprint/manual-builder-data.ts`

**Interfaces:**
- Produces — every later task and the handheld builder depend on these exact names:
  - `type Row = { id: string; desc: string; qty: number; unit: string; cost: number }`
  - `type Section = { id: string; name: string; rows: Row[] }`
  - `type Rates = { markupPct: number; taxPct: number; contingencyPct: number }`
  - `type EstimateHeader = { client: string; project: string; address: string; number: string; date: string; trade: string; validDays: number }`
  - `type BookItem = { id: string; name: string; unit: string; cost: number }`
  - `type BookGroup = { id: string; name: string; items: BookItem[] }`
  - `type Template = { id: string; name: string; section: Section }`
  - `type Totals = { perSection: { id: string; name: string; subtotal: number }[]; subtotal: number; markup: number; contingency: number; tax: number; grand: number }`
  - `rowTotal(row: Row): number`
  - `computeTotals(sections: Section[], rates: Rates): Totals`
  - `money(n: number): string`
  - `newId(prefix: string): string`
  - `SEED_HEADER: EstimateHeader`, `SEED_SECTIONS: Section[]`, `SEED_RATES: Rates`, `PRICE_BOOK: BookGroup[]`, `TEMPLATES: Template[]`

- [ ] **Step 1: Write the types**

Create `manual-builder-types.ts` with exactly the type declarations listed in the Interfaces block above, each with a one-line comment. Keep it types-only — no values, no React — so both the desktop and handheld builders can import it without pulling in a component tree.

- [ ] **Step 2: Write the totals module**

Create `manual-builder-totals.ts`:

```ts
// Estimate arithmetic, kept pure and away from the component so the order of
// operations is auditable in one screen — and so the handheld builder computes
// the identical number from the identical code.
//
// Order matters and is the contractor-standard one:
//   subtotal -> + markup -> + contingency -> tax applied to that running total.
// Tax on top of markup, not under it: markup is revenue and is taxable.

import type { Row, Section, Rates, Totals } from "./manual-builder-types";

/** Two-decimal round that does not drift on .005 the way toFixed does. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function rowTotal(row: Row): number {
  const qty = Number.isFinite(row.qty) ? row.qty : 0;
  const cost = Number.isFinite(row.cost) ? row.cost : 0;
  return round2(qty * cost);
}

export function computeTotals(sections: Section[], rates: Rates): Totals {
  const perSection = sections.map((s) => ({
    id: s.id,
    name: s.name,
    subtotal: round2(s.rows.reduce((sum, r) => sum + rowTotal(r), 0)),
  }));

  const subtotal = round2(perSection.reduce((sum, s) => sum + s.subtotal, 0));
  const markup = round2(subtotal * (rates.markupPct / 100));
  const contingency = round2(subtotal * (rates.contingencyPct / 100));
  const taxable = round2(subtotal + markup + contingency);
  const tax = round2(taxable * (rates.taxPct / 100));
  const grand = round2(taxable + tax);

  return { perSection, subtotal, markup, contingency, tax, grand };
}

/** US-format money for display. Pairs with `font-variant-numeric: tabular-nums`. */
export function money(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Row keys must be stable across reorders and survive a drag, so they cannot be
// array indices. A module-scoped counter is enough: ids never leave the client.
let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}
```

- [ ] **Step 3: Write the fixtures**

Create `manual-builder-data.ts` with a header comment stating the data layer is out of scope. Provide:

- `SEED_HEADER` — `{ client: "Marlow Residence", project: "Rear deck rebuild", address: "418 Cedar Ln, Ashford", number: "EST-1042", date: "2026-07-30", trade: "Carpentry", validDays: 30 }`
- `SEED_SECTIONS` — four sections `Materials`, `Labor`, `Equipment`, `Other`, with ids `sec-materials`…`sec-other`. Materials gets three rows (`2x4 stud · pressure treated`, 140, `ea`, 4.2 / `Deck screws #9 3in`, 12, `bx`, 18 / `Joist hanger 2x8`, 48, `ea`, 2.35). Labor gets two (`Framing crew`, 32, `hr`, 65 / `Demo + haul off`, 1, `ls`, 850). Equipment gets one (`Mini excavator · day rate`, 1, `day`, 320). Other starts empty so the empty-state styling is exercised on first load.
- `SEED_RATES` — `{ markupPct: 18, taxPct: 8.25, contingencyPct: 5 }`
- `PRICE_BOOK` — four groups (`Framing`, `Roofing`, `Concrete`, `Sitework`) with 4–6 items each, every item `{ id, name, unit, cost }`.
- `TEMPLATES` — three, each `{ id, name, section }`: `Reroof · 30yr arch`, `Deck rebuild · 200sf`, `Driveway pour · 600sf`. Each `section` is a full `Section` with 3–4 rows, so inserting one adds a whole priced block.

- [ ] **Step 4: Verify**

Run: `npm run typecheck` — expected clean.
Run: `npm run lint -- --file src/components/v3/estimators-blueprint/manual-builder-totals.ts --file src/components/v3/estimators-blueprint/manual-builder-data.ts --file src/components/v3/estimators-blueprint/manual-builder-types.ts` — expected clean.

Hand-check the arithmetic against the seed: Materials 588.00 + 216.00 + 112.80 = 916.80; Labor 2,080.00 + 850.00 = 2,930.00; Equipment 320.00; Other 0.00 → subtotal 4,166.80; markup 18% = 750.02; contingency 5% = 208.34; taxable 5,125.16; tax 8.25% = 422.83; grand **5,547.99**. If the UI later shows a different grand total on an untouched seed, the bug is in the component, not here.

---

### Task 4: Builder — three-zone frame, header block, and the sheet

Deliverable: `/dashboard/estimators/manual` renders the workspace with a working, editable line-item sheet. Price book and totals rail are present but static shells.

**Files:**
- Modify: `src/components/v3/estimators-blueprint/manual-builder-content.tsx`
- Modify: `src/components/v3/estimators-blueprint/estimators.module.css`

**Interfaces:**
- Consumes: everything from Task 3, plus `useReveal()`.
- Produces: `ManualBuilderContent` holding `sections` state and the mutators `addRow(sectionId)`, `updateRow(sectionId, rowId, patch)`, `deleteRow(sectionId, rowId)`, `moveRow(sectionId, rowId, dir)`, `addSection()` — Tasks 5 and 6 call `addRow`-adjacent helpers, so keep these names.

- [ ] **Step 1: Build the state and mutators**

In `manual-builder-content.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useReveal } from "./use-reveal";
import type { Row, Section, Rates } from "./manual-builder-types";
import { SEED_HEADER, SEED_SECTIONS, SEED_RATES } from "./manual-builder-data";
import { computeTotals, rowTotal, money, newId } from "./manual-builder-totals";

export function ManualBuilderContent() {
  useReveal();
  const [header] = useState(SEED_HEADER);
  const [sections, setSections] = useState<Section[]>(SEED_SECTIONS);
  const [rates, setRates] = useState<Rates>(SEED_RATES);

  const totals = useMemo(() => computeTotals(sections, rates), [sections, rates]);

  function addRow(sectionId: string) {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, rows: [...s.rows, { id: newId("row"), desc: "", qty: 1, unit: "ea", cost: 0 }] }
          : s,
      ),
    );
  }

  function updateRow(sectionId: string, rowId: string, patch: Partial<Row>) {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, rows: s.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)) }
          : s,
      ),
    );
  }

  function deleteRow(sectionId: string, rowId: string) {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, rows: s.rows.filter((r) => r.id !== rowId) } : s)),
    );
  }

  /** Reorder by one step. Buttons, not HTML5 drag: they work from the keyboard
   *  and on touch, and the sheet has to be operable both ways. */
  function moveRow(sectionId: string, rowId: string, dir: -1 | 1) {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const i = s.rows.findIndex((r) => r.id === rowId);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= s.rows.length) return s;
        const rows = [...s.rows];
        [rows[i], rows[j]] = [rows[j], rows[i]];
        return { ...s, rows };
      }),
    );
  }

  function addSection() {
    setSections((prev) => [...prev, { id: newId("sec"), name: "New section", rows: [] }]);
  }
  // …render below
}
```

Note the design said "drag-to-reorder"; this implements reorder as up/down buttons instead. HTML5 drag-and-drop is mouse-only and unusable on the handheld twin, and the constraint list requires keyboard operability. Same capability, one that survives both surfaces.

- [ ] **Step 2: Render the frame, title block and sheet**

```tsx
  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Estimators</div>
          <h1 className="page-title">Manual builder</h1>
        </div>
      </div>

      <div className="mb-work">
        <aside className="mb-book" />{/* Task 5 */}

        <section className="mb-sheet">
          <div className="mb-title-block">
            <div className="tb-cell"><span className="tb-label">Client</span><span className="tb-value">{header.client}</span></div>
            <div className="tb-cell"><span className="tb-label">Project</span><span className="tb-value">{header.project}</span></div>
            <div className="tb-cell"><span className="tb-label">Address</span><span className="tb-value">{header.address}</span></div>
            <div className="tb-cell"><span className="tb-label">Estimate</span><span className="tb-value">{header.number}</span></div>
            <div className="tb-cell"><span className="tb-label">Date</span><span className="tb-value">{header.date}</span></div>
            <div className="tb-cell"><span className="tb-label">Trade</span><span className="tb-value">{header.trade}</span></div>
            <div className="tb-cell"><span className="tb-label">Valid</span><span className="tb-value">{header.validDays} days</span></div>
          </div>

          {sections.map((section) => (
            <div className="mb-section" key={section.id}>
              <div className="mb-section-head">
                <h2 className="mb-section-name">{section.name}</h2>
                <span className="mb-section-sub">
                  {money(totals.perSection.find((s) => s.id === section.id)?.subtotal ?? 0)}
                </span>
              </div>

              {section.rows.length === 0 ? (
                <p className="mb-empty">No lines yet — add one, or pull an item from the price book.</p>
              ) : (
                <div className="mb-rows" role="table">
                  <div className="mb-row mb-row--head" role="row">
                    <span role="columnheader">Description</span>
                    <span role="columnheader" className="num">Qty</span>
                    <span role="columnheader">Unit</span>
                    <span role="columnheader" className="num">Unit cost</span>
                    <span role="columnheader" className="num">Total</span>
                    <span role="columnheader"><span className="sr-only">Actions</span></span>
                  </div>

                  {section.rows.map((row, i) => (
                    <div className="mb-row" role="row" key={row.id}>
                      <input
                        className="mb-in"
                        value={row.desc}
                        placeholder="Description"
                        aria-label="Description"
                        onChange={(e) => updateRow(section.id, row.id, { desc: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && i === section.rows.length - 1) addRow(section.id);
                        }}
                      />
                      <input
                        className="mb-in num"
                        type="number" inputMode="decimal" min={0} step="any"
                        value={row.qty}
                        aria-label="Quantity"
                        onChange={(e) => updateRow(section.id, row.id, { qty: Number(e.target.value) })}
                      />
                      <input
                        className="mb-in mb-in--unit"
                        value={row.unit}
                        aria-label="Unit"
                        onChange={(e) => updateRow(section.id, row.id, { unit: e.target.value })}
                      />
                      <input
                        className="mb-in num"
                        type="number" inputMode="decimal" min={0} step="any"
                        value={row.cost}
                        aria-label="Unit cost"
                        onChange={(e) => updateRow(section.id, row.id, { cost: Number(e.target.value) })}
                      />
                      <span className="mb-line-total num">{money(rowTotal(row))}</span>
                      <span className="mb-row-acts">
                        <button type="button" className="mb-icon-btn" aria-label="Move up"
                          onClick={() => moveRow(section.id, row.id, -1)} disabled={i === 0}>
                          <svg className="ic"><use href="#i-chev" /></svg>
                        </button>
                        <button type="button" className="mb-icon-btn mb-icon-btn--down" aria-label="Move down"
                          onClick={() => moveRow(section.id, row.id, 1)} disabled={i === section.rows.length - 1}>
                          <svg className="ic"><use href="#i-chev" /></svg>
                        </button>
                        <button type="button" className="mb-icon-btn" aria-label="Delete line"
                          onClick={() => deleteRow(section.id, row.id)}>
                          <svg className="ic"><use href="#i-trash" /></svg>
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <button type="button" className="mb-add" onClick={() => addRow(section.id)}>
                <svg className="ic"><use href="#i-plus" /></svg> Add row
              </button>
            </div>
          ))}

          <button type="button" className="mb-add mb-add--section" onClick={addSection}>
            <svg className="ic"><use href="#i-plus" /></svg> Add section
          </button>
        </section>

        <aside className="mb-rail" />{/* Task 6 */}
      </div>
    </>
  );
```

- [ ] **Step 3: Style the frame and sheet**

Append to `estimators.module.css`. The key moves: a three-column grid, both asides sticky, and inputs that read as **ruled paper** — bottom rule only, blueprint underline on focus — rather than boxed form fields.

```css
.bp :global(.content .mb-work) {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 300px;
  gap: 16px;
  align-items: start;
}

.bp :global(.content .mb-sheet) {
  padding: 18px;
  background: var(--paper);
  border: 2px solid var(--ink);
  border-radius: 2px;
  box-shadow: 3px 3px 0 rgba(10, 10, 10, 0.06);
}

/* Drawing title block — the annotation layer, ruled like a real one. */
.bp :global(.content .mb-title-block) {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  border: 1px solid var(--ink);
  border-radius: 2px;
  margin-bottom: 20px;
}
.bp :global(.content .tb-cell) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-right: 1px solid var(--hair);
  border-bottom: 1px solid var(--hair);
}
.bp :global(.content .tb-label) {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted-light);
}
.bp :global(.content .tb-value) {
  font-family: var(--font-sans), sans-serif;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}

.bp :global(.content .mb-section) { margin-bottom: 22px; }
.bp :global(.content .mb-section-head) {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 6px;
  border-bottom: 2px solid var(--ink);
}
.bp :global(.content .mb-section-name) {
  margin: 0;
  font-family: var(--font-display), sans-serif;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink);
}
.bp :global(.content .mb-section-sub) {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--ink-soft);
}

.bp :global(.content .mb-row) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 78px 64px 96px 104px 96px;
  gap: 8px;
  align-items: center;
  min-height: 44px;
  border-bottom: 1px dashed var(--hair);
}
.bp :global(.content .mb-row--head) {
  min-height: 30px;
  border-bottom: 1px solid var(--hair);
}
.bp :global(.content .mb-row--head span) {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted-light);
}
.bp :global(.content .mb-row .num) { text-align: right; }

/* Ruled paper, not a form field. */
.bp :global(.content .mb-in) {
  width: 100%;
  min-height: 36px;
  padding: 4px 2px;
  font-family: var(--font-sans), sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  border-radius: 0;
}
.bp :global(.content .mb-in:hover) { border-bottom-color: var(--hair); }
.bp :global(.content .mb-in:focus) {
  outline: none;
  border-bottom: 2px solid var(--blueprint);
  background: rgba(24, 84, 160, 0.04);
}
.bp :global(.content .mb-in.num) {
  text-align: right;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.bp :global(.content .mb-in--unit) {
  font-family: var(--font-mono);
  font-size: 11.5px;
  text-transform: lowercase;
}
/* Spinners fight the tabular alignment. */
.bp :global(.content .mb-in[type="number"]) { appearance: textfield; -moz-appearance: textfield; }
.bp :global(.content .mb-in[type="number"]::-webkit-outer-spin-button),
.bp :global(.content .mb-in[type="number"]::-webkit-inner-spin-button) { appearance: none; margin: 0; }

.bp :global(.content .mb-line-total) {
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}

.bp :global(.content .mb-row-acts) { display: flex; gap: 2px; justify-content: flex-end; }
.bp :global(.content .mb-icon-btn) {
  display: grid;
  place-items: center;
  width: 30px; height: 44px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--muted-light);
  cursor: pointer;
  border-radius: 2px;
}
.bp :global(.content .mb-icon-btn:hover:not(:disabled)) { color: var(--ink); background: var(--paper-deep); }
.bp :global(.content .mb-icon-btn:disabled) { opacity: 0.3; cursor: default; }
.bp :global(.content .mb-icon-btn .ic) {
  width: 15px; height: 15px;
  fill: none; stroke: currentColor; stroke-width: 2;
  stroke-linecap: round; stroke-linejoin: round;
}
.bp :global(.content .mb-icon-btn--down .ic) { transform: rotate(180deg); }

.bp :global(.content .mb-empty) {
  margin: 0;
  padding: 16px 0;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--muted-light);
  border-bottom: 1px dashed var(--hair);
}

.bp :global(.content .mb-add) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  margin-top: 8px;
  padding: 0 12px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink);
  background: transparent;
  border: 1px dashed var(--muted-faint);
  border-radius: 2px;
  cursor: pointer;
}
.bp :global(.content .mb-add:hover) { border-color: var(--ink); border-style: solid; }
.bp :global(.content .mb-add .ic) {
  width: 14px; height: 14px;
  fill: none; stroke: currentColor; stroke-width: 2;
  stroke-linecap: round; stroke-linejoin: round;
}
.bp :global(.content .mb-add--section) { margin-top: 4px; }

.bp :global(.content .sr-only) {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck` and the scoped lint — expected clean.

In the browser: type in a description, change a qty — the line total and the section subtotal update on the keystroke. Press Enter in the last row's description — a new row appends and the sheet does not submit anything. Up/down buttons reorder and correctly disable at the ends. Delete removes the row. The Other section shows its empty-state line. Confirm Materials reads `$916.80` against the Task 3 hand-check.

---

### Task 5: Builder — price book drawer

Deliverable: the left zone searches the price book, adds an item to a chosen section, inserts a template as a whole section, and collapses to a rail with the state remembered.

**Files:**
- Modify: `src/components/v3/estimators-blueprint/manual-builder-content.tsx`
- Modify: `src/components/v3/estimators-blueprint/estimators.module.css`

**Interfaces:**
- Consumes: `addRow`, `setSections` from Task 4; `PRICE_BOOK`, `TEMPLATES`, `newId` from Task 3.
- Produces: `addFromBook(item: BookItem, sectionId: string): void`, `insertTemplate(template: Template): void`.

- [ ] **Step 1: Add drawer state and the two insert paths**

```tsx
  const [bookOpen, setBookOpen] = useState(true);
  const [bookTab, setBookTab] = useState<"book" | "templates">("book");
  const [query, setQuery] = useState("");
  const [targetSection, setTargetSection] = useState(sections[0]?.id ?? "");

  // Collapse state outlives the visit — a contractor who works from typed rows
  // should not re-collapse the drawer on every estimate.
  useEffect(() => {
    const saved = window.localStorage.getItem("jf.mb.bookOpen");
    if (saved !== null) setBookOpen(saved === "1");
  }, []);
  useEffect(() => {
    window.localStorage.setItem("jf.mb.bookOpen", bookOpen ? "1" : "0");
  }, [bookOpen]);

  const bookResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PRICE_BOOK;
    return PRICE_BOOK
      .map((g) => ({ ...g, items: g.items.filter((i) => i.name.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [query]);

  function addFromBook(item: BookItem, sectionId: string) {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, rows: [...s.rows, { id: newId("row"), desc: item.name, qty: 1, unit: item.unit, cost: item.cost }] }
          : s,
      ),
    );
  }

  function insertTemplate(template: Template) {
    // Fresh ids: a template can be inserted twice and the two copies must not
    // share row keys.
    setSections((prev) => [
      ...prev,
      {
        id: newId("sec"),
        name: template.section.name,
        rows: template.section.rows.map((r) => ({ ...r, id: newId("row") })),
      },
    ]);
  }
```

Add `useEffect` to the React import. Import `PRICE_BOOK`, `TEMPLATES` from `./manual-builder-data` and `BookItem`, `Template` from `./manual-builder-types`.

- [ ] **Step 2: Render the drawer**

Replace `<aside className="mb-book" />`:

```tsx
        <aside className={bookOpen ? "mb-book" : "mb-book mb-book--closed"}>
          <div className="mb-book-head">
            {bookOpen && <span className="mb-book-title">Price book</span>}
            <button type="button" className="mb-icon-btn" onClick={() => setBookOpen((v) => !v)}
              aria-expanded={bookOpen} aria-label={bookOpen ? "Collapse price book" : "Expand price book"}>
              <svg className="ic"><use href="#i-chev" /></svg>
            </button>
          </div>

          {bookOpen && (
            <>
              <div className="mb-book-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={bookTab === "book"}
                  className={bookTab === "book" ? "mb-tab is-on" : "mb-tab"}
                  onClick={() => setBookTab("book")}>Items</button>
                <button type="button" role="tab" aria-selected={bookTab === "templates"}
                  className={bookTab === "templates" ? "mb-tab is-on" : "mb-tab"}
                  onClick={() => setBookTab("templates")}>Templates</button>
              </div>

              {bookTab === "book" ? (
                <>
                  <input className="mb-book-search" type="search" value={query} placeholder="Search items"
                    aria-label="Search the price book" onChange={(e) => setQuery(e.target.value)} />

                  <label className="mb-book-target">
                    <span className="tb-label">Add to</span>
                    <select value={targetSection} onChange={(e) => setTargetSection(e.target.value)}>
                      {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>

                  {bookResults.length === 0 ? (
                    <p className="mb-empty">Nothing matches “{query}”.</p>
                  ) : (
                    bookResults.map((group) => (
                      <div className="mb-book-group" key={group.id}>
                        <h3 className="mb-book-group-name">{group.name}</h3>
                        {group.items.map((item) => (
                          <div className="mb-book-item" key={item.id}>
                            <span className="mb-book-item-name">{item.name}</span>
                            <span className="mb-book-item-cost">{money(item.cost)}/{item.unit}</span>
                            <button type="button" className="mb-icon-btn"
                              aria-label={`Add ${item.name}`}
                              onClick={() => addFromBook(item, targetSection)}>
                              <svg className="ic"><use href="#i-plus" /></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </>
              ) : (
                TEMPLATES.map((t) => (
                  <button type="button" className="mb-tpl" key={t.id} onClick={() => insertTemplate(t)}>
                    <span className="mb-tpl-name">{t.name}</span>
                    <span className="mb-tpl-meta">{t.section.rows.length} lines</span>
                  </button>
                ))
              )}
            </>
          )}
        </aside>
```

- [ ] **Step 3: Style the drawer**

Add rules for `.mb-book` (sticky at `top: 16px`, `max-height: calc(100vh - 140px)`, `overflow-y: auto`, 2px ink border, 2px radius, `3px 3px 0` shadow, `padding: 12px`), `.mb-book--closed` (`width: 44px`, contents hidden but the toggle still 44px tall), `.mb-book-head` (flex, space-between, bottom hairline), `.mb-book-title` (mono, 10px, 0.14em, uppercase, muted), `.mb-book-tabs` / `.mb-tab` (mono caps, 44px min-height, `is-on` gets a 2px `--blueprint` bottom border and ink text), `.mb-book-search` (full width, 40px, 1px `--hair` border, blueprint border on focus), `.mb-book-target select` (reuse the `.bp-sel` vocabulary already in `blueprint-global.css`), `.mb-book-group-name` (mono caps, hairline under), `.mb-book-item` (grid `minmax(0,1fr) auto 32px`, min-height 44px, hover `--paper-deep`), `.mb-book-item-cost` (mono, tabular-nums, muted), `.mb-tpl` (full-width button, dashed border, min-height 52px, hover solid ink).

Also add the closed-state grid change:

```css
.bp :global(.content .mb-work:has(.mb-book--closed)) {
  grid-template-columns: 44px minmax(0, 1fr) 300px;
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck` and the scoped lint — expected clean.

In the browser: type "stud" in the search — groups filter and empty groups disappear. Pick a target section, click `+` — the row lands in that section with the book's unit and cost, and the totals move. Switch to Templates, insert one — a whole new section appears; insert it twice and confirm both copies behave independently (edit one, the other does not change). Collapse the drawer, reload the page, confirm it is still collapsed.

---

### Task 6: Builder — totals rail, save-as-template, convert-to-proposal

Deliverable: the right zone shows live totals with editable rates, the changed grand total flashes once, and both terminal actions work.

**Files:**
- Modify: `src/components/v3/estimators-blueprint/manual-builder-content.tsx`
- Modify: `src/components/v3/estimators-blueprint/estimators.module.css`
- Modify: `src/components/v3/dashboard-blueprint/blueprint-global.css` (one keyframe)

**Interfaces:**
- Consumes: `totals`, `rates`, `setRates`, `sections` from Tasks 3–5.
- Produces: nothing later tasks depend on. Phase B reimplements this zone as a bottom bar using the same `computeTotals`.

- [ ] **Step 1: Add the total-changed flash keyframe**

CSS modules reject `@keyframes` under Lightning CSS, so it goes in `blueprint-global.css` beside the existing ones:

```css
@keyframes mbTotalFlash {
  from { background: rgba(24, 84, 160, 0.16); }
  to   { background: transparent; }
}
```

- [ ] **Step 2: Wire the flash**

```tsx
  const [flash, setFlash] = useState(false);
  const prevGrand = useRef(totals.grand);
  useEffect(() => {
    if (prevGrand.current === totals.grand) return;
    prevGrand.current = totals.grand;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 180);
    return () => window.clearTimeout(t);
  }, [totals.grand]);
```

Add `useRef` to the React import.

- [ ] **Step 3: Render the rail**

Replace `<aside className="mb-rail" />`:

```tsx
        <aside className="mb-rail">
          <h2 className="mb-rail-title">Totals</h2>

          <dl className="mb-rail-lines">
            {totals.perSection.map((s) => (
              <div key={s.id}><dt>{s.name}</dt><dd>{money(s.subtotal)}</dd></div>
            ))}
            <div className="mb-rail-sub"><dt>Subtotal</dt><dd>{money(totals.subtotal)}</dd></div>
          </dl>

          <div className="mb-rates">
            <label className="mb-rate">
              <span className="tb-label">Markup %</span>
              <input type="number" inputMode="decimal" min={0} step="any" value={rates.markupPct}
                onChange={(e) => setRates((r) => ({ ...r, markupPct: Number(e.target.value) }))} />
              <span className="mb-rate-amt">{money(totals.markup)}</span>
            </label>
            <label className="mb-rate">
              <span className="tb-label">Contingency %</span>
              <input type="number" inputMode="decimal" min={0} step="any" value={rates.contingencyPct}
                onChange={(e) => setRates((r) => ({ ...r, contingencyPct: Number(e.target.value) }))} />
              <span className="mb-rate-amt">{money(totals.contingency)}</span>
            </label>
            <label className="mb-rate">
              <span className="tb-label">Tax %</span>
              <input type="number" inputMode="decimal" min={0} step="any" value={rates.taxPct}
                onChange={(e) => setRates((r) => ({ ...r, taxPct: Number(e.target.value) }))} />
              <span className="mb-rate-amt">{money(totals.tax)}</span>
            </label>
          </div>

          <div className={flash ? "mb-grand is-flash" : "mb-grand"}>
            <span className="mb-grand-label">Total</span>
            <span className="mb-grand-value">{money(totals.grand)}</span>
          </div>

          <button type="button" className="mb-act mb-act--ghost" onClick={() => setSaveOpen(true)}>
            Save as template
          </button>
          <button type="button" className="mb-act mb-act--primary" onClick={() => setConvertOpen(true)}>
            Convert to proposal
            <svg className="ic"><use href="#i-arrow" /></svg>
          </button>
        </aside>
```

- [ ] **Step 4: Build the two overlays in the house `.mdl` vocabulary**

Hand-rolled, per the no-Radix rule. Both take `role="dialog"` + `aria-modal="true"`, close on Escape and on backdrop click, and return focus to the trigger. Add state `saveOpen`, `convertOpen`, `templateName`, and refs for the two trigger buttons.

Save-as-template: a name field (defaulted to `` `${header.trade} · ${header.project}` ``), a section `<select>` choosing which section to save, and Cancel / Save. Save appends to a local `savedTemplates` state array that the Templates tab renders after `TEMPLATES`, then closes. Nothing persists past a reload — say so in the comment above the handler.

Convert-to-proposal: a review list of what carries over — one line per section with its subtotal, then Subtotal / Markup / Contingency / Tax / Total, then the header fields — with the honest footnote `Nothing is saved yet — this opens the proposal builder with the sheet in hand.` Confirm calls `router.push("/dashboard/proposals" as Route)`.

Shared Escape handling:

```tsx
  useEffect(() => {
    if (!saveOpen && !convertOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (convertOpen) { setConvertOpen(false); convertBtnRef.current?.focus(); }
      else { setSaveOpen(false); saveBtnRef.current?.focus(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveOpen, convertOpen]);
```

- [ ] **Step 5: Style the rail and overlays**

`.mb-rail` — sticky `top: 16px`, 2px ink border, 2px radius, `3px 3px 0` shadow, `padding: 14px`. `.mb-rail-title` — Inter 900, 12px, 0.1em, uppercase, 2px ink underline. `.mb-rail-lines > div` — flex space-between, dashed hairline, `dt` mono 10px muted caps, `dd` mono 12px tabular-nums. `.mb-rail-sub` — solid ink top border, ink text, 700. `.mb-rate` — grid `1fr 64px`, `.tb-label` reused for the label, input right-aligned mono tabular-nums with a bottom rule that turns blueprint on focus, `.mb-rate-amt` spanning both columns, right-aligned, mono, muted. `.mb-grand` — 2px ink top border, `padding: 10px 6px`, label mono caps muted, value Inter 900 at 26px tabular-nums. `.mb-grand.is-flash { animation: mbTotalFlash 180ms linear; }` — and inside `@media (prefers-reduced-motion: reduce)`, `animation: none`.

`.mb-act` — full width, `min-height: 44px`, mono caps 11px, 2px radius, `margin-top: 8px`. `--primary` is `--blueprint` on white text; `--ghost` is transparent with a 2px ink border.

Overlays reuse the shell's `.mdl` / `.mdl-bg` / `.mdl-box` classes so they inherit the animations already in `blueprint-global.css:77-85`; add only `.mb-mdl-list` for the review rows.

- [ ] **Step 6: Verify**

Run: `npm run typecheck` and the scoped lint — expected clean.

In the browser on an untouched seed: the rail reads Subtotal `$4,166.80`, Markup `$750.02`, Contingency `$208.34`, Tax `$422.83`, Total `$5,547.99` — matching Task 3. Change markup to 20 and confirm every dependent figure moves and the total flashes once. Open both overlays; check Escape closes them, focus returns to the button that opened them, backdrop click closes, and Convert lands on `/dashboard/proposals`. Turn on "Reduce motion" in DevTools rendering and confirm no flash and no reveal animation.

---

### Task 7: Desktop review gate

- [ ] **Step 1: Full verification sweep**

Run: `npm run typecheck` — expected clean.
Run: `npm run lint` scoped to every file created or modified in Tasks 1–6 — expected clean.

- [ ] **Step 2: Review both pages at 1280px and 1600px**

Check against the design system: 2px borders, 2px radii, hard offset shadows with no blur, Inter 900 caps headings, mono annotation layer, tabular numerals on every figure, blueprint blue confined to the START buttons, focus rings, diagram strokes and the primary action.

- [ ] **Step 3: Stop and hand to the owner for sign-off**

Phase B does not start until desktop is approved. This is the batch gate from CLAUDE.md.

---

## PHASE B — HANDHELD

Do not start until Task 7 is signed off.

### Task 8: Handheld estimator hub

Deliverable: `/dashboard/estimators` serves a handheld build at ≤768px.

**Files:**
- Create: `src/app/(mobile)/mobile-estimators-v2/page.tsx`, `mobile-estimators.tsx`, `mobile-estimators.module.css`
- Modify: `src/components/v3/responsive-shell/responsive-dashboard-shell.tsx`

**Interfaces:**
- Consumes: `ENGINES`, `ACTIVE_COUNT`, `QUEUED_COUNT` from `estimators-data.ts` — imported, never copied, so the two surfaces cannot drift.
- Produces: `MobileEstimators` (named export).

- [ ] **Step 1: Write the page shell**

Copy the shape of `src/app/(mobile)/mobile-fence-estimator-v2/page.tsx` exactly, including the header comment naming both skills, the `viewport` export (`width: "device-width"`, `initialScale: 1`, `maximumScale: 1`, `viewportFit: "cover"`, `themeColor: "#0a0a0a"`), `dynamic = "force-dynamic"`, and the auth redirect to `/auth/login?next=%2Fmobile-estimators-v2`.

- [ ] **Step 2: Write the handheld hub**

One card per row inside the shared mobile shell (`MobileNav` etc. — follow whatever `mobile-fence-estimator.tsx` mounts). Same content per card: diagram, title, method, three spec rows, full-width START. Diagram height drops to 44px; the spec rows stay. Queued cards keep the dashed treatment. Type scales through `components/v3/fluid-scale.tsx`.

- [ ] **Step 3: Register the surface**

In `responsive-dashboard-shell.tsx`, add beside the other Automation entries:

```tsx
const MobileEstimators = dynamic(
  () => import("@/app/(mobile)/mobile-estimators-v2/mobile-estimators").then((m) => m.MobileEstimators),
  { ssr: false, loading: MobileHold },
);
```
```tsx
  "/dashboard/estimators": MobileEstimators,
```

- [ ] **Step 4: Verify**

`npm run typecheck` + scoped lint clean. In the device toolbar at 320 / 375 / 414 / 768px: one card per row, nothing clipped, no horizontal scroll, every START ≥44px. Drag the viewport across 768px and confirm the surface swaps live with no reload. Confirm the drawer's "Estimators" item is lit.

---

### Task 9: Handheld manual builder — sheet and sticky totals bar

Deliverable: `/dashboard/estimators/manual` serves a handheld build; rows are editable and totals are always visible.

**Files:**
- Create: `src/app/(mobile)/mobile-manual-builder-v2/page.tsx`, `mobile-manual-builder.tsx`, `mobile-manual-builder.module.css`
- Modify: `src/components/v3/responsive-shell/responsive-dashboard-shell.tsx`

**Interfaces:**
- Consumes: `computeTotals`, `rowTotal`, `money`, `newId`, all types, `SEED_*`, `PRICE_BOOK`, `TEMPLATES` — imported from the desktop modules, never duplicated.
- Produces: `MobileManualBuilder` (named export).

- [ ] **Step 1: Page shell** — same pattern as Task 8, `next=%2Fmobile-manual-builder-v2`.

- [ ] **Step 2: Stacked row cards**

The 6-column desktop grid does not survive 320px. Each row becomes a card: description on its own full-width line, then a 2-column grid of `Qty` / `Unit` and `Unit cost` / `Total`, then a right-aligned action row. Every input `min-height: 44px` with `inputMode="decimal"` on the numeric ones. Reorder and delete stay as buttons.

- [ ] **Step 3: Sticky totals bar**

`position: sticky; bottom: 0`, paying out `env(safe-area-inset-bottom)`, sitting above the mobile nav. Collapsed it shows `SUBTOTAL` and `TOTAL`; tapping expands the full rail — sections, the three rate fields, grand total — as a bottom sheet in the house sheet vocabulary. Escape and backdrop tap close it.

- [ ] **Step 4: Register and verify**

Add the lazy import and `"/dashboard/estimators/manual": MobileManualBuilder`.

`npm run typecheck` + scoped lint clean. At 320 / 375 / 414 / 768px: no horizontal scroll, no clipped figures, totals bar never covers the last row (bottom padding on the scroll container ≥ bar height), grand total matches the desktop number on the same seed (`$5,547.99`).

---

### Task 10: Handheld price book sheet, convert flow, and final sweep

**Files:**
- Modify: `src/app/(mobile)/mobile-manual-builder-v2/mobile-manual-builder.tsx` and its module CSS

- [ ] **Step 1: Price book as a bottom sheet**

A `+ From book` action opens the book as a bottom sheet: search field, group accordions, target-section selector, tap-to-add. Adding keeps the sheet open — a contractor adds several items in a row — and a compact toast-free confirmation is the row appearing behind the sheet. Templates are a tab inside the same sheet.

- [ ] **Step 2: Save-as-template and convert-to-proposal as bottom sheets**

Same content and same honest footnote as Task 6, in the handheld sheet vocabulary. Both close on Escape, backdrop tap, and a drag-down on the grabber if the shared sheet component already supports it.

- [ ] **Step 3: Final sweep across both phases**

Run: `npm run typecheck` — expected clean.
Run: `npm run lint` scoped to every file touched across Tasks 1–10 — expected clean.

Check, on both surfaces: reduced-motion kills the reveal and the flash; keyboard reaches every control and Escape closes every overlay with focus restored; no `.dark` rules were added; no color literals outside the token block; every touch target ≥44px; the four fixture modules are the only data source and no server action, API route or Prisma call was introduced.

- [ ] **Step 4: Report and hand off**

Report what was built, what was verified and how, and anything left out. Do not commit — the owner asks for commits explicitly.

---

## Self-Review

**Spec coverage.** Hub picker → Task 2. Manual builder rows + price book → Tasks 4–5. Estimate header → Task 4 (title block). Totals rail with markup/tax/contingency → Task 6. Save as template → Task 6 Step 4. Convert to proposal → Task 6 Step 4. Routes + nav → Task 1. Handheld twins → Tasks 8–10. Guardrails (reduced motion, ≥44px, AA, keyboard, light-only, tokens) → constraints plus the Task 6 and Task 10 verification steps. No spec section is unimplemented.

**Deviations from the spec, both deliberate and noted at the point of use:**
1. One CSS module instead of two — forced by `pageKey()` sharing the `estimators` key across both routes.
2. Reorder is up/down buttons, not HTML5 drag — drag is mouse-only and the same code has to serve the handheld build.

**Type consistency.** `Row`/`Section`/`Rates`/`Totals`/`BookItem`/`BookGroup`/`Template`/`EstimateHeader` are declared once in `manual-builder-types.ts` (Task 3) and imported everywhere else. `computeTotals`, `rowTotal`, `money`, `newId` keep the same signatures in Tasks 4, 5, 6, 9 and 10. `addRow` / `updateRow` / `deleteRow` / `moveRow` / `addSection` are named in Task 4 and referenced under those names in Task 5.

**Placeholder scan.** No TBDs. Every code step carries real code; the CSS-heavy steps in Tasks 5 and 6 specify each selector with its concrete values rather than saying "style appropriately".
