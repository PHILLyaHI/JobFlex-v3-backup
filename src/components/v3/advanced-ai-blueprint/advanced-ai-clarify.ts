// Smart Proposal — the intake gate's clarifying-questions dialog, markup layer.
//
// WHAT THIS REPLACES
//
// The old estimator opened `components/estimator/ClarifyingQuestions.tsx` — a
// framer-motion overlay in the retired sage design system — whenever
// `analyzeEstimatePrompt` judged the brief too thin to price. The LOGIC of that
// component is reproduced here exactly; none of its visual design is. It is not
// mounted as a React island because it carries no geometry or state worth
// keeping: it is a list of form controls whose every className is a sage token
// (`paper-card`, `--accent-soft`, `shadow-pop`, `rounded-full`, hard-coded
// `rgba(31,122,82,…)` glows), it brings its own scrim / focus trap / body-scroll
// lock that would fight the blueprint `.mdl` contract, and its dismissal would
// have no `.mdl--closing` exit. Re-skinning it would have meant rewriting every
// line of its JSX for none of the benefit an island exists to provide.
//
// THE LOGIC THAT IS PRESERVED, one-for-one:
//   - a question is `{id, question, kind: select|number|text, options?, unit?,
//     placeholder?}` — the server's `clarifyQuestionSchema`, unchanged;
//   - `select` offers its options PLUS a custom-answer escape hatch, so the
//     options can never trap the contractor (the old "Something else" path);
//   - a question with no answer is simply omitted from the payload;
//   - answers leave as `"<question> → <answer>"` strings, question order kept,
//     which is the exact shape `runGenerate({extraDetail})` appends to the brief.
//
// This module is pure: HTML in, strings out. Opening, closing, focus and every
// listener belong to advanced-ai-behavior, which owns the page's events.

import type { ClarifyQuestion } from "@/lib/estimatorSchema";

/**
 * Sentinel `<option>` value for the custom-answer path. Namespaced so it can
 * never collide with a real option the model authored.
 */
export const CQ_OTHER = "__cq_other__";

/**
 * Escape model-authored text before it reaches `innerHTML`.
 *
 * The rest of this page interpolates a hand-written fixture and only escapes
 * quotes; these strings come back from an LLM, so they get the full treatment.
 */
function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * An option-less `select` is unanswerable. The server already downgrades those
 * to `text` (advancedEstimator.analyzeEstimatePrompt), but the client repeats
 * the check so a hand-built payload or a future caller cannot render a dead row.
 */
function effectiveKind(q: ClarifyQuestion): "select" | "number" | "text" {
  if (q.kind === "select" && q.options && q.options.length > 0) return "select";
  return q.kind === "number" ? "number" : "text";
}

/** The custom / free-text answer field. Shared by `text` and the "other" path. */
function areaHtml(q: ClarifyQuestion, hidden: boolean): string {
  return (
    '<textarea class="cq-area" rows="2" data-cq-in="1"' +
    (hidden ? ' hidden aria-hidden="true"' : "") +
    ' placeholder="' + esc(q.placeholder ?? "Type your answer…") + '"></textarea>'
  );
}

/** One question row: the console's ruled numeral, the ask, then its control. */
function questionHtml(q: ClarifyQuestion, i: number): string {
  const kind = effectiveKind(q);
  let control = "";

  if (kind === "select") {
    // The shared blueprint select — `.bp-sel` wrapper draws the caret because a
    // <select> cannot carry a pseudo-element (blueprint-global.css). Never
    // re-derive `appearance: none` + a chevron here.
    control =
      '<span class="bp-sel cq-sel">' +
      '<select class="bp-sel-in" data-cq-sel="1" data-empty="1" aria-label="' + esc(q.question) + '">' +
      '<option value="">Choose…</option>' +
      (q.options ?? []).map((o) => '<option value="' + esc(o) + '">' + esc(o) + "</option>").join("") +
      '<option value="' + CQ_OTHER + '">Something else…</option>' +
      "</select></span>" +
      areaHtml(q, true);
  } else if (kind === "number") {
    control =
      '<div class="cq-num">' +
      '<input class="est-in cq-in" type="number" inputmode="decimal" min="0" data-cq-in="1"' +
      ' aria-label="' + esc(q.question) + '"' +
      ' placeholder="' + esc(q.placeholder ?? "0") + '">' +
      (q.unit ? '<span class="cq-unit">' + esc(q.unit) + "</span>" : "") +
      "</div>";
  } else {
    control = areaHtml(q, false);
  }

  return (
    '<div class="cq-q" data-cq="' + esc(q.id) + '">' +
    '<span class="est-n cq-n">' + (i + 1) + "</span>" +
    '<div class="cq-main">' +
    '<div class="cq-ask">' + esc(q.question) + "</div>" +
    control +
    "</div></div>"
  );
}

/** The whole dialog body — one row per question, in the order the model sent. */
export function clarifyBodyHtml(questions: ClarifyQuestion[]): string {
  return questions.map(questionHtml).join("");
}

/**
 * This row's current answer, read straight from its controls — the DOM is the
 * single source of truth, so there is no parallel answer map to drift from it.
 * A `select` still showing "Choose…" is unanswered; one on "Something else…"
 * defers to its textarea.
 */
export function readAnswer(row: HTMLElement): string {
  const sel = row.querySelector<HTMLSelectElement>("[data-cq-sel]");
  if (sel) {
    if (!sel.value) return "";
    if (sel.value !== CQ_OTHER) return sel.value.trim();
  }
  const field = row.querySelector<HTMLInputElement | HTMLTextAreaElement>("[data-cq-in]");
  return (field?.value ?? "").trim();
}

/**
 * Answered questions as `"<question> → <answer>"`, question order preserved.
 * Byte-for-byte the payload the old dialog handed `onSubmit`, so the brief the
 * estimator receives is unchanged by the port.
 */
export function collectClarifications(
  host: HTMLElement,
  questions: ClarifyQuestion[],
): string[] {
  const out: string[] = [];
  for (const q of questions) {
    const row = host.querySelector<HTMLElement>('[data-cq="' + CSS.escape(q.id) + '"]');
    if (!row) continue;
    const answer = readAnswer(row);
    if (answer) out.push(q.question + " → " + answer);
  }
  return out;
}
