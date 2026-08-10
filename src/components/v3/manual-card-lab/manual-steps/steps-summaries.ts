// STEPS — the collapsed row's content, derived. No React, no styling.
//
// WHY THIS IS A SEPARATE, PURE MODULE
// In this variant nine of the ten cards are shut at any moment, so for 90% of
// the page the ONLY thing a section says about itself is the string this file
// returns. That makes these strings the primary content of the design, not a
// convenience — and the risk the variant has to beat is HUNTING: a summary that
// says "Scope" tells you nothing you did not already know from the title, and
// sends you opening cards one by one. So every face below prints REAL VALUES
// ("Tear off, Architectural shingle +2", "Deposit 30% · Start 30% · Completion
// 40%"), never a count of fields or a restatement of the card's own name.
//
// THE THREE SLOTS, AND WHY THERE ARE ONLY THREE
//   summary — what is in the card, at muted ink. Always present.
//   figure  — the card's ONE headline number, right-aligned and tabular. Only
//             four cards have one. The grand total is deliberately NOT among
//             them: it has exactly one loud home, the sticky bar, and printing
//             it here as well is the "same number in three places" failure.
//   mark    — a status word, and only where it changes what the user does next
//             (unnamed lines, an empty Terms box, a schedule that does not add
//             up). A "done" tick on all ten rows is decoration; there is none.
//
// Truncation is left to CSS (`text-overflow: ellipsis` on one line) except
// where a hard cap keeps a prose summary from crowding the figure out of the
// row — hence the explicit lengths passed to `firstLine`.

import type { ClientRecord, Draft, ProjectRecord, Totals } from "../manual-focus/manual-focus-types";
import {
  coverState,
  coveredAmount,
  fileSize,
  firstLine,
  isNamed,
  money,
  moneyShort,
  pct,
  pct1,
} from "../manual-focus/manual-focus-math";

/** A status word on the right of a collapsed row. Three tones, no more. */
export type StepMark = { text: string; tone: "ok" | "warn" | "err" };

/** Everything a collapsed row prints besides its number and its title. */
export type StepFace = { summary: string; figure?: string; mark?: StepMark };

/** The ten sections, in the order the printed document puts them. Titles are
 *  the short nouns from the brief — they sit in a fixed-width column so all ten
 *  align, which is what makes the shut stack scan like a contents page. */
export const STEPS: { id: StepId; num: string; title: string }[] = [
  { id: "job", num: "01", title: "The job" },
  { id: "client", num: "02", title: "Client" },
  { id: "lines", num: "03", title: "Line items" },
  { id: "markup", num: "04", title: "Markup" },
  { id: "scope", num: "05", title: "Scope" },
  { id: "prints", num: "06", title: "What prints" },
  { id: "terms", num: "07", title: "Terms" },
  { id: "payments", num: "08", title: "Payments" },
  { id: "files", num: "09", title: "Files" },
  { id: "copy", num: "10", title: "Their copy" },
];

export type StepId =
  | "job"
  | "client"
  | "lines"
  | "markup"
  | "scope"
  | "prints"
  | "terms"
  | "payments"
  | "files"
  | "copy";

const EMPTY: StepMark = { text: "Empty", tone: "warn" };

/** Join a handful of item names into one readable phrase without letting a long
 *  list run under the figure. Two names then a count — three names is already
 *  wider than the row can spare. */
function nameList(names: string[], each = 26): string {
  const shown = names.slice(0, 2).map((n) => (n.length > each ? `${n.slice(0, each - 1).trimEnd()}…` : n));
  const rest = names.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} +${rest} more` : shown.join(", ");
}

// The choice is pulled into a local before it is narrowed: a discriminated
// union stops narrowing the moment the reference is read inside a callback,
// which `clients.find(...)` is.
function clientName(draft: Draft, clients: ClientRecord[]): string {
  const choice = draft.client;
  if (choice.mode === "freeText") return choice.name.trim();
  if (choice.mode === "record") return clients.find((c) => c.id === choice.id)?.name ?? "";
  return "";
}

export function stepFaces(
  draft: Draft,
  totals: Totals,
  clients: ClientRecord[],
  projects: ProjectRecord[],
): Record<StepId, StepFace> {
  /* 01 — the title IS the summary. The project is one line down inside the
     card and adding it here would push the title into an ellipsis. */
  const title = draft.title.trim();
  const project = projects.find((p) => p.id === draft.projectId);
  const job: StepFace = title
    ? { summary: project ? `${title} · ${firstLine(project.name, 28)}` : title }
    : { summary: "Untitled", mark: EMPTY };

  /* 02 — a name with no way to reach them is the state that changes what you
     do next, so that is the only thing marked. */
  const name = clientName(draft, clients);
  const choice = draft.client;
  const record = choice.mode === "record" ? clients.find((c) => c.id === choice.id) : undefined;
  let client: StepFace;
  if (!name) {
    client = { summary: "Nobody chosen", mark: EMPTY };
  } else if (choice.mode === "freeText") {
    client = { summary: name, mark: { text: "Not on file", tone: "warn" } };
  } else {
    const reach = record?.email || record?.phone || "";
    client = reach
      ? { summary: `${name} · ${reach}` }
      : { summary: name, mark: { text: "No contact", tone: "warn" } };
  }

  /* 03 — named lines by name, plus the rate, plus the one figure this card
     owns. Unnamed rows are excluded from every total, so they are marked. */
  const named = draft.lines.filter(isNamed);
  const lines: StepFace = named.length
    ? {
        summary: `${nameList(named.map((l) => l.name.trim()))} · tax ${pct(draft.taxPct)}`,
        figure: moneyShort(totals.preTax),
        mark: totals.unnamedCount ? { text: `${totals.unnamedCount} unnamed`, tone: "warn" } : undefined,
      }
    : { summary: "Nothing priced yet", mark: EMPTY };

  /* 04 — only the rates that are actually doing something are listed. Four
     "0%"s is noise pretending to be information. */
  const rates: string[] = [];
  if (draft.materialMarkupPct) rates.push(`${pct(draft.materialMarkupPct)} materials`);
  if (draft.laborMarkupPct) rates.push(`${pct(draft.laborMarkupPct)} labor`);
  if (draft.overheadPct) rates.push(`${pct(draft.overheadPct)} overhead`);
  if (draft.profitPct) rates.push(`${pct(draft.profitPct)} profit`);
  const markup: StepFace = {
    summary: rates.length ? rates.join(" · ") : "No markup applied",
    figure: totals.preTax > 0 ? `${pct1(totals.margin)} margin` : undefined,
    mark: rates.length ? undefined : { text: "At cost", tone: "warn" },
  };

  /* 05 — the first line of the prose, which is the only part anyone would
     recognise the block by. */
  const scopeText = draft.scopeOfWork.trim();
  const notesText = draft.notes.trim();
  let scope: StepFace;
  if (scopeText && notesText) scope = { summary: firstLine(scopeText, 52), figure: "+ notes" };
  else if (scopeText) scope = { summary: firstLine(scopeText, 64) };
  else if (notesText) scope = { summary: `Notes only — ${firstLine(notesText, 40)}` };
  else scope = { summary: "Nothing written", mark: EMPTY };

  /* 06 — list what is ON. A "2 of 4" badge is the count of a thing nobody
     counts; the words are shorter to read than the badge is to decode. */
  const on: string[] = [draft.options.laborOnly ? "Summary quote" : "Full quote"];
  if (!draft.options.hideBreakdown) on.push("cost breakdown");
  if (draft.options.showSignature) on.push("signature");
  if (draft.options.showScope) on.push("scope");
  const prints: StepFace = { summary: on.join(" · ") };

  /* 07 — starts empty by design, and empty terms is the one thing on this page
     a contractor genuinely forgets. */
  const termsText = draft.terms.trim();
  const terms: StepFace = termsText
    ? { summary: firstLine(termsText, 64) }
    : { summary: "Nothing entered", mark: EMPTY };

  /* 08 — the schedule in full (it is three short parts), and the reconciliation
     as the mark, because a schedule that does not add up is a real defect. */
  const state = coverState(draft.installments, totals.total);
  const covered = coveredAmount(draft.installments, totals.total);
  let payMark: StepMark | undefined;
  if (state === "exact") payMark = { text: "Balanced", tone: "ok" };
  else if (state === "under") payMark = { text: `Short ${moneyShort(totals.total - covered)}`, tone: "warn" };
  else if (state === "over") payMark = { text: `Over ${moneyShort(covered - totals.total)}`, tone: "err" };
  const payments: StepFace = draft.installments.length
    ? {
        summary: draft.installments
          .map((i) => `${firstLine(i.label.split("—")[0] ?? "", 20) || "Untitled"} ${i.isPercent ? pct(i.amount) : money(i.amount)}`)
          .join(" · "),
        mark: payMark,
      }
    : { summary: "No schedule", mark: EMPTY };

  /* 09 — the first filename, because "3 files" is exactly the summary that
     makes someone open the card to find out which three. */
  const bytes = draft.files.reduce((sum, f) => sum + f.size, 0);
  const files: StepFace = draft.files.length
    ? {
        summary: nameList(draft.files.map((f) => f.name), 30),
        figure: fileSize(bytes),
      }
    : { summary: "Nothing attached" };

  /* 10 — describes the sheet, and prints no money at all. The total belongs to
     the sticky bar and to the bottom of this card, and nowhere else. */
  const copy: StepFace = {
    summary: totals.printed.length
      ? `${totals.printed.length} priced lines · tax ${pct(draft.taxPct)}${draft.options.showSignature ? " · signature block" : ""}`
      : "Nothing to print yet",
  };

  return { job, client, lines, markup, scope, prints, terms, payments, files, copy };
}
