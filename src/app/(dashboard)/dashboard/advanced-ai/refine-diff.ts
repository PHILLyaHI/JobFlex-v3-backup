// Pure diff between the on-screen estimate and an AI refine result, powering
// the "Review changes" gate: nothing the model returns is applied until the
// contractor sees exactly what changed and confirms. Lines match by `id`
// (identity survives the model round-trip) with normalized-name fallback for
// models that drop ids; each current line is consumed at most once.
import type { EstimateLine } from "@/components/estimator/EstimatorBreakdown";
import type { GeneratedEstimate } from "@/lib/estimatorSchema";
import { money } from "@/lib/format";

export type FieldChange = { label: "Name" | "Qty" | "Unit $" | "Unit"; from: string; to: string };

export type LineDelta =
  | { kind: "added"; group: "materials" | "labor"; index: number; name: string }
  | { kind: "removed"; group: "materials" | "labor"; name: string }
  | {
      kind: "changed";
      group: "materials" | "labor";
      index: number;
      name: string;
      fields: FieldChange[];
    };

export type RefineDiff = {
  deltas: LineDelta[];
  /**
   * `${group}:${index}` of every added/changed line in the NEXT arrays.
   * The studio uses these to badge rows at apply time, once real row ids exist.
   */
  changedKeys: Set<string>;
  isEmpty: boolean;
};

type NextLine = GeneratedEstimate["materials"][number];

const norm = (s: string) => s.trim().toLowerCase();

function diffGroup(
  group: "materials" | "labor",
  before: EstimateLine[],
  after: NextLine[],
  out: LineDelta[],
  changedKeys: Set<string>,
) {
  const unconsumed = new Set(before.map((_, i) => i));
  const byId = new Map<string, number>();
  const byName = new Map<string, number>();
  before.forEach((l, i) => {
    byId.set(l.id, i);
    // First occurrence wins; duplicate names fall through to "added".
    if (!byName.has(norm(l.name))) byName.set(norm(l.name), i);
  });

  after.forEach((next, index) => {
    let beforeIdx: number | undefined =
      next.id != null && byId.has(next.id) ? byId.get(next.id) : undefined;
    if (beforeIdx === undefined || !unconsumed.has(beforeIdx)) {
      const nameIdx = byName.get(norm(next.name));
      beforeIdx = nameIdx !== undefined && unconsumed.has(nameIdx) ? nameIdx : undefined;
    }
    if (beforeIdx === undefined) {
      out.push({ kind: "added", group, index, name: next.name });
      changedKeys.add(`${group}:${index}`);
      return;
    }
    unconsumed.delete(beforeIdx);
    const prev = before[beforeIdx];
    const fields: FieldChange[] = [];
    if (norm(prev.name) !== norm(next.name))
      fields.push({ label: "Name", from: prev.name, to: next.name });
    if (prev.quantity !== next.quantity)
      fields.push({ label: "Qty", from: String(prev.quantity), to: String(next.quantity) });
    if (prev.unitPrice !== next.unitPrice)
      fields.push({ label: "Unit $", from: money(prev.unitPrice), to: money(next.unitPrice) });
    if ((prev.unit?.trim() ?? "") !== (next.unit?.trim() ?? ""))
      fields.push({ label: "Unit", from: prev.unit?.trim() || "—", to: next.unit?.trim() || "—" });
    if (fields.length > 0) {
      out.push({ kind: "changed", group, index, name: next.name, fields });
      changedKeys.add(`${group}:${index}`);
    }
  });

  for (const i of unconsumed) {
    out.push({ kind: "removed", group, name: before[i].name });
  }
}

export function diffEstimate(
  current: { materials: EstimateLine[]; labor: EstimateLine[] },
  next: GeneratedEstimate,
): RefineDiff {
  const deltas: LineDelta[] = [];
  const changedKeys = new Set<string>();
  diffGroup("materials", current.materials, next.materials, deltas, changedKeys);
  diffGroup("labor", current.labor, next.labor, deltas, changedKeys);
  return { deltas, changedKeys, isEmpty: deltas.length === 0 };
}
