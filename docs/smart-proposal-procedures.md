# Smart Proposal — the procedure behind every specialty (2026-09-18)

Owner's ask, looking at a sewer estimate that came back as six thin lines
(*Mobilization 1 fixed · Excavation 300 linear ft · Sewer pipe 300 lf ·
Backfill 300 lf · Pressure test 1 fixed · Final cleanup 1 fixed*): *"it's
not have procedures at all. go each one and set most important procedures
belongs to each and update it, make smart go deep into it. need pro
estimates that item lines to do are important to show. make it pro wow and
no crap item lines, use right measures … also add to admin smart proposal
prompt, sidebar page prompts and i can modify and see current."*

## Why the lines were thin

The prompt is the old quote-draft prompt: the master prompt, the detected
specialty's one-paragraph preamble, its material profile and price book,
tax guidance, the template and JSON rules. Twenty trades also carry a deep
`TradeProfile` (phases, checklist, price anchors) — but only on gpt-4o-class
models, and sanitary sewer is not one of the twenty. Its preamble said
"cover pipe installation, grading, testing, and infiltration prevention";
nothing told the model which lines a sewer contractor itemizes or what
each is measured in, so it wrote six.

## What holds now

**`lib/estimate/procedures/`** — one procedure per AI specialty, all
229 of them (the 229 plus nothing else: the general-contracting
fallback is one of the 229), in fourteen files by group, 3,614 steps in
all (1,131 conditional). A procedure is:

- `basis` — how the trade measures and sells the work;
- `steps[]` in build order — each `item` written as the estimate prints it
  (what is done, how, with what material or equipment, the size or spec —
  for the client, no math), its `unit` from the estimator's own vocabulary
  (`sqft`, `linear ft`, `sq boards`, `cu yards`, `sq yards`, `unit`,
  `hour`, `fixed`), and `when` on a conditional step (the bare condition:
  "groundwater is present");
- `avoid[]` — the lines a pro never writes for that trade;
- `notes[]` — the assumptions the estimate states.

`validateProcedure` is the one bar (step count, item length, legal unit,
no bare category words, no duplicates, at least four core steps, the
condition without a leading "when"), held by the QA script, the merge and
the admin's Save alike.

**The prompt.** `buildLegacyEstimatePrompt` puts `formatProcedureBlock`
in the old prompt's "extra admin" slot for every model — after the price
book and the tax guidance, before the output rules, ahead of the trade
profile block when that is sent too. The block: the specialty, the basis,
the numbered steps tagged `[core]` or `[when …]` with the unit after a
dash, the lines never to write, the notes to state, then
`PROCEDURE_RULES`: the line items ARE the procedure, walked in order and
sized to the job; every core step its own line; conditional steps only when
the brief or site calls for them; what / how / with what / size on every
line and never a bare word; real quantities in the step's unit; both cost
halves on every line; no padding, no duplicates; extras go to upsells; a
trade profile's phases group the steps and its anchors govern the numbers.

**The admin page** `/admin/prompts` (sidebar → Operate → Prompts). Every
box shows the CURRENT text — the saved change when there is one, the code
default otherwise — with a Default / Customized chip and the save time:
the system message, the master prompt, the line-item rules, and the picked
specialty's preamble and procedure (a filter and a grouped select over all
229; "· edited" marks the customized ones). Save stores an override; an
empty box or the default text clears it; Discard drops unsaved typing;
Reset deletes the row; Show default reveals the code text under a
customized box. The procedure is edited as text — one step per line,
`item | unit | condition`, then `basis:` / `avoid:` / `note:` lines — and
Save runs the same checks as the code defaults (a bad unit is refused with
its line named). "As the prompt carries it" shows the block exactly as
sent. The preview composes the exact prompt for a typed brief with every
override applied, names the specialty the detector picked (or takes a
chosen one), says whether the procedure and trade blocks are in, and
copies the text.

**The pipeline** (`actions/advancedEstimator` → `loadPromptOverrides`)
reads the table once per generate: the master prompt, the system message,
the procedure rules, a specialty's preamble or procedure. A missing table
(before the deploy's `prisma db push`) or a row that no longer parses
falls back to the code default with a console warning; the estimate never
breaks on an override.

## Data-layer changes

- New Prisma model `PromptOverride` (`key @id`, `body`, `updatedBy`,
  timestamps) — additive; created by the deploy's `prisma db push`; read
  in try/catch.
- New actions `actions/adminPrompts.ts` (platform-admin gated):
  `getSpecialtyPromptDetail`, `savePromptOverride`, `resetPromptOverride`,
  `composePromptPreview`.
- `buildLegacyEstimatePrompt` takes `overrides` and `specialtyId` options
  and returns `procedure: boolean`; `generateAdvancedEstimate` loads the
  overrides and sends the overridden system message.

## Proof

`scripts/qa/procedures.check.ts` (33 checks): every specialty covered,
no orphan keys, every procedure past the shared bar, every unit legal,
real quantities dominate, no cloned procedures and siblings sharing at
most three steps, the sewer case (locate, permits, trench, bedding, pipe by
linear ft, cleanouts each, tap, backfill by cu yards, camera / pressure
test, restoration; pavement cut, dewatering and traffic control
conditional), the block's shape, the text form round-tripping every
procedure, the parser's aliases and refusals, overrides landing in the
composed prompt, the admin's save checks. On the stand
(`adshoot/prompts-admin.js`, 47 checks): the sidebar entry, every box
with its chip, save / discard / reset with the row in the table, the
refused unit naming its line, the block as sent and the composed prompt
following an edit, the specialty picker and filter, the preview detecting
epoxy and taking a chosen roofing, copy, the phone layout with nothing
past the screen.

Not exercised: a live OpenAI run (no key on the stand) — the prompt is
verified as composed; the owner sees the lines on jobflex.app.
