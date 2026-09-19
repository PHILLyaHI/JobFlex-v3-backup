// Smart Proposal prompt overrides — what the platform admin changed on
// /admin/prompts, read by the estimate pipeline on every generate.
//
// The code holds the defaults (master prompt, system message, procedure
// rules, every specialty's preamble and procedure). A PromptOverride row
// replaces one of them by key. `loadPromptOverrides` is one findMany in
// try/catch: an environment whose database has no table yet (the deploy's
// `prisma db push` creates it) prices on the defaults, and a row whose
// procedure text no longer parses is skipped with a console warning rather
// than breaking the estimate. Server module (imports the db) — no
// "use server": actions call it.

import { db } from "@/lib/db";
import { procedureFromText, type SpecialtyProcedure } from "./procedures";
import { REMODEL_PART_KEYS, type RemodelOverrides, type RemodelPartKey } from "./remodel-method";

import { OVERRIDE_KEYS } from "./promptKeys";

export { OVERRIDE_KEYS };

export type PromptOverrides = {
  master?: string;
  system?: string;
  procedureRules?: string;
  /** Per specialty id: an edited preamble and/or an edited procedure (already parsed). */
  specialties: Record<string, { preamble?: string; procedure?: SpecialtyProcedure; procedureText?: string }>;
  /** The remodel method's parts as edited. */
  remodel: RemodelOverrides;
  /** Every key found, with when it was last saved — for the admin page's chips. */
  savedAt: Record<string, string>;
};

export const NO_OVERRIDES: PromptOverrides = { specialties: {}, remodel: {}, savedAt: {} };

const KEY_RE = /^specialty:([a-z0-9-]+):(preamble|procedure)$/;
const REMODEL_RE = /^remodel:([a-z]+)$/;

export function parseOverrideRows(rows: { key: string; body: string; updatedAt: Date }[]): PromptOverrides {
  const out: PromptOverrides = { specialties: {}, remodel: {}, savedAt: {} };
  for (const row of rows) {
    const body = row.body;
    if (!body.trim()) continue;
    out.savedAt[row.key] = row.updatedAt.toISOString();
    if (row.key === OVERRIDE_KEYS.master) out.master = body;
    else if (row.key === OVERRIDE_KEYS.system) out.system = body;
    else if (row.key === OVERRIDE_KEYS.procedureRules) out.procedureRules = body;
    else if (REMODEL_RE.test(row.key)) {
      const part = row.key.match(REMODEL_RE)![1] as RemodelPartKey;
      if (REMODEL_PART_KEYS.includes(part)) out.remodel[part] = body;
      else delete out.savedAt[row.key];
    } else {
      const m = row.key.match(KEY_RE);
      if (!m) continue;
      if (m[2] === "preamble") {
        (out.specialties[m[1]] ??= {}).preamble = body;
        continue;
      }
      const parsed = procedureFromText(body);
      if (parsed.issues.length) {
        console.warn(`[promptOverrides] ${row.key} does not parse (${parsed.issues[0].path}: ${parsed.issues[0].message}) — default kept`);
        delete out.savedAt[row.key];
        continue;
      }
      const slot = (out.specialties[m[1]] ??= {});
      slot.procedure = parsed.procedure;
      slot.procedureText = body;
    }
  }
  return out;
}

/** Every override, or none when the table is missing or unreadable. */
export async function loadPromptOverrides(): Promise<PromptOverrides> {
  try {
    const rows = await db.promptOverride.findMany({ select: { key: true, body: true, updatedAt: true } });
    return parseOverrideRows(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/does not exist|no such table|relation .* PromptOverride|promptOverride/i.test(msg)) {
      console.warn(`[promptOverrides] read failed: ${msg.slice(0, 160)}`);
    }
    return NO_OVERRIDES;
  }
}
