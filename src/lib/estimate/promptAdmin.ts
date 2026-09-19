// Smart Proposal prompts — what the admin page shows and saves.
//
// The page (/admin/prompts) and its actions (actions/adminPrompts) share
// these builders: a specialty's effective preamble, procedure and the block
// as the prompt carries it; the exact prompt a brief composes; the save
// rules for an override. Server module (reads the db through the loader).

import { ESTIMATOR_MASTER_PROMPT } from "./master-prompt";
import { buildLegacyEstimatePrompt, LEGACY_SYSTEM_MESSAGE } from "./legacy-estimate";
import { AI_SPECIALTY_GROUPS, getAiSpecialtiesSync, getAiSpecialtyByIdSync } from "./legacy/specialties";
import {
  formatProcedureBlock,
  PROCEDURE_RULES,
  PROCEDURE_UNITS,
  procedureFor,
  procedureFromText,
  procedureToText,
} from "./procedures";
import { OVERRIDE_KEYS, type PromptOverrides } from "./promptOverrides";
import { REMODEL_PART_KEYS, REMODEL_PARTS, type BriefScope, type RemodelDomain, type RemodelPartKey } from "./remodel-method";
import type { RemodelRange } from "./remodel-sanity";
import { OPENAI_MODEL } from "@/lib/sdk/openai";

/** The model the estimate runs on decides whether the trade block rides along
 *  (actions/advancedEstimator: gpt-5-class models get the old prompt alone). */
export const isReasoningModel = (model: string = OPENAI_MODEL) => /^(gpt-5|o[1-9])/.test(model);

export type PromptTextState = {
  /** The code default. */
  def: string;
  /** What the prompt carries now — the override, else the default. */
  value: string;
  /** ISO time the override was saved, or null when the default applies. */
  savedAt: string | null;
};

export type SpecialtyRow = { id: string; name: string; group: string; customized: boolean };

export type SpecialtyPromptDetail = {
  id: string;
  name: string;
  group: string;
  description: string;
  keyQuestions: string[];
  preamble: PromptTextState;
  /** The procedure in the text form the admin edits; `def` empty when none is written. */
  procedure: PromptTextState;
  /** The block exactly as the prompt carries it (effective text), or null. */
  block: string | null;
  units: readonly string[];
};

export type PromptPreview = {
  specialtyId: string;
  specialtyName: string;
  detected: boolean;
  system: string;
  prompt: string;
  procedure: boolean;
  tradeRules: boolean;
  model: string;
  /** "partial" when the brief names a piece of a room the specialty remodels whole. */
  scope: BriefScope;
  /** The remodel method's room parts the brief carries (empty = no method). */
  remodelDomains: RemodelDomain[];
  /** A whole remodel of a known kind: its range here. */
  range: RemodelRange | null;
};

/** One part of the remodel method as the admin sees it. */
export type RemodelPartState = { key: RemodelPartKey; label: string; covers: string } & PromptTextState;

const groupLabel = new Map(AI_SPECIALTY_GROUPS.map((g) => [g.id, g.label]));
const groupOf = new Map<string, string>();
for (const g of AI_SPECIALTY_GROUPS) for (const id of g.specialtyIds) if (!groupOf.has(id)) groupOf.set(id, g.id);

function state(def: string, override: string | undefined, savedAt: string | undefined): PromptTextState {
  return { def, value: override?.trim() ? override : def, savedAt: override?.trim() ? (savedAt ?? null) : null };
}

export function masterState(o: PromptOverrides): PromptTextState {
  return state(ESTIMATOR_MASTER_PROMPT, o.master, o.savedAt[OVERRIDE_KEYS.master]);
}
export function systemState(o: PromptOverrides): PromptTextState {
  return state(LEGACY_SYSTEM_MESSAGE, o.system, o.savedAt[OVERRIDE_KEYS.system]);
}
export function rulesState(o: PromptOverrides): PromptTextState {
  return state(PROCEDURE_RULES, o.procedureRules, o.savedAt[OVERRIDE_KEYS.procedureRules]);
}

/** Every part of the remodel method, current text and state. */
export function remodelStates(o: PromptOverrides): RemodelPartState[] {
  return REMODEL_PARTS.map((p) => ({
    key: p.key,
    label: p.label,
    covers: p.covers,
    ...state(p.text, o.remodel[p.key], o.savedAt[OVERRIDE_KEYS.remodel(p.key)]),
  }));
}

/** Every AI specialty with its group and whether an override touches it. */
export function specialtyRows(o: PromptOverrides): { groups: { id: string; label: string }[]; rows: SpecialtyRow[] } {
  const rows = getAiSpecialtiesSync().map((s) => ({
    id: s.id,
    name: s.name,
    group: groupOf.get(s.id) ?? "general-professional",
    customized: !!(o.specialties[s.id]?.preamble || o.specialties[s.id]?.procedure),
  }));
  return { groups: AI_SPECIALTY_GROUPS.map((g) => ({ id: g.id, label: g.label })), rows };
}

export function specialtyDetail(id: string, o: PromptOverrides): SpecialtyPromptDetail | null {
  const s = getAiSpecialtyByIdSync(id);
  if (!s) return null;
  const own = o.specialties[id] ?? {};
  const def = procedureFor(id);
  const preamble = state(s.promptPreamble, own.preamble, o.savedAt[OVERRIDE_KEYS.preamble(id)]);
  const procedure = state(def ? procedureToText(def) : "", own.procedureText, o.savedAt[OVERRIDE_KEYS.procedure(id)]);
  const effective = own.procedure ?? def;
  return {
    id: s.id,
    name: s.name,
    group: groupLabel.get(groupOf.get(id) ?? "") ?? "",
    description: s.description,
    keyQuestions: s.keyQuestions,
    preamble,
    procedure,
    block: effective ? formatProcedureBlock(s.name, effective, o.procedureRules ?? PROCEDURE_RULES) : null,
    units: PROCEDURE_UNITS,
  };
}

/** The exact prompt a brief composes, with every override applied. */
export function composePreview(
  input: { description: string; location?: string | null; specialtyId?: string | null; companyName?: string | null },
  o: PromptOverrides,
): PromptPreview {
  const reasoning = isReasoningModel();
  const built = buildLegacyEstimatePrompt(
    { description: input.description, location: input.location ?? null, companyName: input.companyName ?? null },
    { withTradeRules: !reasoning, overrides: o, specialtyId: input.specialtyId ?? null },
  );
  return {
    specialtyId: built.specialty.id,
    specialtyName: built.specialty.name,
    detected: !input.specialtyId,
    system: o.system?.trim() || LEGACY_SYSTEM_MESSAGE,
    prompt: built.prompt,
    procedure: built.procedure,
    tradeRules: !reasoning,
    model: OPENAI_MODEL,
    scope: built.scope,
    remodelDomains: built.remodelDomains,
    range: built.range,
  };
}

const KEY_RE = /^specialty:([a-z0-9-]+):(preamble|procedure)$/;
const REMODEL_RE = /^remodel:([a-z]+)$/;
const MAX_BODY = 160_000;

/**
 * Check an override before it is stored. Returns the body to store, or an
 * error; `clear` when the text is empty or restates the default (the row is
 * deleted so the default rules again).
 */
export function checkOverride(key: string, body: string): { ok: true; body: string; clear: boolean } | { ok: false; error: string } {
  const text = body.replace(/\r\n/g, "\n").trim();
  if (text.length > MAX_BODY) return { ok: false, error: `Too long — ${text.length.toLocaleString()} characters, the limit is ${MAX_BODY.toLocaleString()}.` };
  let def: string;
  if (key === OVERRIDE_KEYS.master) def = ESTIMATOR_MASTER_PROMPT;
  else if (key === OVERRIDE_KEYS.system) def = LEGACY_SYSTEM_MESSAGE;
  else if (key === OVERRIDE_KEYS.procedureRules) def = PROCEDURE_RULES;
  else if (REMODEL_RE.test(key)) {
    const part = key.match(REMODEL_RE)![1] as RemodelPartKey;
    if (!REMODEL_PART_KEYS.includes(part)) return { ok: false, error: `No remodel method part "${part}".` };
    def = REMODEL_PARTS.find((p) => p.key === part)!.text;
  } else {
    const m = key.match(KEY_RE);
    if (!m) return { ok: false, error: "Unknown prompt key." };
    const s = getAiSpecialtyByIdSync(m[1]);
    if (!s) return { ok: false, error: `No specialty "${m[1]}".` };
    if (m[2] === "preamble") {
      def = s.promptPreamble;
      if (text.length > 4000) return { ok: false, error: "A preamble is at most 4,000 characters." };
    } else {
      const d = procedureFor(m[1]);
      def = d ? procedureToText(d) : "";
      if (text) {
        const parsed = procedureFromText(text);
        if (parsed.issues.length) {
          const first = parsed.issues[0];
          return { ok: false, error: `${first.path ? first.path + ": " : ""}${first.message}` };
        }
      }
    }
  }
  if (!text || text === def.trim()) return { ok: true, body: "", clear: true };
  return { ok: true, body: text, clear: false };
}
