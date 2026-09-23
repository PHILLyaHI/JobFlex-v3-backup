// EQUIPMENT ON FILE AND THE VISIT REPORT — THE PLAIN RULES (2026-09-23).
// Pure. What a home's system is, how old, what the tech measures on a
// tune-up, and what the report says. The database side is lib/visitBook.

export type EquipmentKind = "split-ac-furnace" | "split-heat-pump" | "furnace-only" | "package-unit" | "ductless" | "water-heater" | "boiler" | "other";

export const EQUIPMENT_KINDS: Array<{ kind: EquipmentKind; label: string }> = [
  { kind: "split-ac-furnace", label: "AC + gas furnace" },
  { kind: "split-heat-pump", label: "Heat pump + air handler" },
  { kind: "furnace-only", label: "Furnace only" },
  { kind: "package-unit", label: "Package unit (rooftop / pad)" },
  { kind: "ductless", label: "Ductless mini split" },
  { kind: "water-heater", label: "Water heater" },
  { kind: "boiler", label: "Boiler" },
  { kind: "other", label: "Other" },
];
export const equipmentLabel = (kind: string) => EQUIPMENT_KINDS.find((k) => k.kind === kind)?.label ?? kind;

/** A nameplate read (lib/hvac/intake NameplateRead) becomes a row's fields. */
export function equipmentFromNameplate(read: { kind: string; brand?: string; model?: string; serial?: string; tons?: number; refrigerant?: string; yearMade?: number; notes?: string }): { kind: EquipmentKind; brand?: string; model?: string; serial?: string; tons?: number; refrigerant?: string; yearMade?: number; notes?: string } {
  const kind: EquipmentKind =
    read.kind === "furnace" ? "furnace-only" : read.kind === "package" ? "package-unit" : read.kind === "water-heater" ? "water-heater" : read.kind === "outdoor" || read.kind === "air-handler" ? "split-ac-furnace" : "other";
  return { kind, brand: read.brand, model: read.model, serial: read.serial, tons: read.tons, refrigerant: read.refrigerant, yearMade: read.yearMade, notes: read.notes };
}

/** Age in years, from the year made or the install date. */
export function equipmentAge(e: { yearMade?: number | null; installedAt?: Date | null }, now = new Date()): number | null {
  if (e.yearMade) return Math.max(0, now.getUTCFullYear() - e.yearMade);
  if (e.installedAt) return Math.max(0, Math.floor((now.getTime() - e.installedAt.getTime()) / (365.25 * 86400000)));
  return null;
}

/** The one-line read on a unit: "AC + gas furnace · Carrier 24ACC636 · 3 ton · R-410A · 2014 (12 years)". */
export function equipmentLine(e: { kind: string; brand?: string | null; model?: string | null; tons?: number | null; refrigerant?: string | null; yearMade?: number | null; installedAt?: Date | null }, now = new Date()): string {
  const age = equipmentAge(e, now);
  return [
    equipmentLabel(e.kind),
    [e.brand, e.model].filter(Boolean).join(" ") || null,
    e.tons ? `${e.tons} ton` : null,
    e.refrigerant || null,
    e.yearMade ? `${e.yearMade}${age !== null ? ` (${age} year${age === 1 ? "" : "s"})` : ""}` : age !== null ? `${age} years old` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** What the age says, in the office's words, for the client page and the report. */
export function equipmentAdvice(e: { kind: string; refrigerant?: string | null; yearMade?: number | null; installedAt?: Date | null }, now = new Date()): string | null {
  const age = equipmentAge(e, now);
  const heatPump = e.kind === "split-heat-pump" || e.kind === "ductless";
  const r22 = /R-?22/i.test(e.refrigerant ?? "");
  if (r22) return "R-22 system: refrigerant is reclaimed stock at a high price and parts are scarce — the next big repair should be weighed against a replacement.";
  if (age === null) return null;
  if (age >= (heatPump ? 15 : 18)) return `${age} years old: past the usual life — plan the replacement before it fails in season.`;
  if (age >= (heatPump ? 12 : 15)) return `${age} years old: a major repair is money into a unit near the end of its life — quote the replacement next to any big repair.`;
  if (age >= 10) return `${age} years old: keep it on tune-ups; a compressor or coil failure from here on is a replacement conversation.`;
  return null;
}

// ── the visit report ────────────────────────────────────────────────────────

export type VisitKind = "cooling" | "heating" | "both" | "other";

export interface ReadingField {
  key: string;
  label: string;
  unit?: string;
  /** The normal range the office reads against, when there is one. */
  ok?: [number, number];
  side: "cooling" | "heating" | "any";
  hint?: string;
}

/** The readings a tune-up writes down, cooling side and heating side. */
export const READING_FIELDS: ReadingField[] = [
  { key: "filterSize", label: "Filter size / replaced", side: "any", hint: "e.g. 16×25×1, replaced" },
  { key: "tstatSetpoint", label: "Thermostat setpoint", unit: "°F", side: "any" },
  { key: "staticPressure", label: "Total static pressure", unit: "in wc", ok: [0.3, 0.8], side: "any", hint: "over 0.8 is a duct or filter problem" },
  { key: "deltaT", label: "Temperature split across the coil", unit: "°F", ok: [16, 22], side: "cooling" },
  { key: "suctionPsi", label: "Suction pressure", unit: "psi", side: "cooling" },
  { key: "headPsi", label: "Head pressure", unit: "psi", side: "cooling" },
  { key: "superheat", label: "Superheat", unit: "°F", ok: [8, 15], side: "cooling", hint: "fixed orifice" },
  { key: "subcool", label: "Subcooling", unit: "°F", ok: [8, 14], side: "cooling", hint: "TXV" },
  { key: "capacitorUf", label: "Run capacitor measured", unit: "µF", side: "cooling", hint: "vs. the rating on the can; replace under 90%" },
  { key: "capacitorRatedUf", label: "Run capacitor rated", unit: "µF", side: "cooling" },
  { key: "compressorAmps", label: "Compressor amps", unit: "A", side: "cooling" },
  { key: "condFanAmps", label: "Condenser fan amps", unit: "A", side: "cooling" },
  { key: "drainClear", label: "Condensate drain", side: "cooling", hint: "cleared / float switch tested" },
  { key: "gasPressure", label: "Manifold gas pressure", unit: "in wc", ok: [3.2, 3.8], side: "heating", hint: "natural gas 3.5; propane 10" },
  { key: "flameSensorUa", label: "Flame sensor", unit: "µA", ok: [1, 10], side: "heating", hint: "under 1 µA: clean or replace" },
  { key: "coFlue", label: "CO in the flue", unit: "ppm", ok: [0, 100], side: "heating" },
  { key: "coRegister", label: "CO at the register", unit: "ppm", ok: [0, 0], side: "heating", hint: "anything above zero is a heat exchanger question" },
  { key: "heatRise", label: "Temperature rise", unit: "°F", side: "heating", hint: "inside the plate's range" },
  { key: "blowerAmps", label: "Blower amps", unit: "A", side: "any" },
  { key: "hxInspection", label: "Heat exchanger", side: "heating", hint: "inspected — no cracks / see findings" },
  { key: "defrostCycle", label: "Defrost cycle and reversing valve", side: "heating", hint: "heat pump only" },
];

export function readingFieldsFor(kind: VisitKind): ReadingField[] {
  if (kind === "other") return READING_FIELDS.filter((f) => f.side === "any");
  return READING_FIELDS.filter((f) => f.side === "any" || kind === "both" || f.side === kind);
}

/** "cooling" for a spring tune-up, "heating" for a fall one, "both" when the title says neither. */
export function visitKindFromTitle(title: string | null | undefined): VisitKind {
  const t = (title ?? "").toLowerCase();
  const cooling = /cool|spring|\bac\b|air condition/.test(t);
  const heating = /heat|fall|furnace|winter/.test(t);
  if (cooling && !heating) return "cooling";
  if (heating && !cooling) return "heating";
  if (cooling && heating) return "both";
  return /tune/.test(t) ? "both" : "other";
}

export interface Finding {
  text: string;
  severity: "info" | "watch" | "fix" | "urgent";
}

/** The findings the readings themselves raise, before the tech adds a word. */
export function readingFindings(readings: Record<string, string | number | undefined>, kind: VisitKind): Finding[] {
  const out: Finding[] = [];
  const num = (k: string) => {
    const v = readings[k];
    const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  const sp = num("staticPressure");
  if (sp !== null && sp > 0.8) out.push({ text: `Static pressure ${sp} in wc is high — restricted filter, undersized return or dirty coil; airflow is choking the system.`, severity: "fix" });
  const dt = num("deltaT");
  if ((kind === "cooling" || kind === "both") && dt !== null && (dt < 14 || dt > 24)) out.push({ text: `Temperature split of ${dt}°F is outside 16–22°F — charge or airflow is off.`, severity: "watch" });
  const cap = num("capacitorUf");
  const rated = num("capacitorRatedUf");
  if (cap !== null && rated !== null && rated > 0 && cap < rated * 0.9) out.push({ text: `Run capacitor reads ${cap} µF against ${rated} µF rated (${Math.round((cap / rated) * 100)}%) — replace before it takes the compressor with it.`, severity: "fix" });
  const sh = num("superheat");
  if (sh !== null && (sh < 5 || sh > 20)) out.push({ text: `Superheat ${sh}°F is outside the normal range — refrigerant charge or metering to check.`, severity: "watch" });
  const sc = num("subcool");
  if (sc !== null && (sc < 5 || sc > 18)) out.push({ text: `Subcooling ${sc}°F is outside the normal range — refrigerant charge to check.`, severity: "watch" });
  const fs = num("flameSensorUa");
  if ((kind === "heating" || kind === "both") && fs !== null && fs < 1) out.push({ text: `Flame sensor at ${fs} µA — cleaned or replaced, or the furnace will start locking out.`, severity: "fix" });
  const coR = num("coRegister");
  if (coR !== null && coR > 0) out.push({ text: `Carbon monoxide at the register: ${coR} ppm. The heat exchanger must be checked before the furnace runs again.`, severity: "urgent" });
  const coF = num("coFlue");
  if (coF !== null && coF > 100) out.push({ text: `CO in the flue ${coF} ppm — combustion is off; burners and draft to check.`, severity: "fix" });
  const gp = num("gasPressure");
  if ((kind === "heating" || kind === "both") && gp !== null && (gp < 3.0 || gp > 4.0) && gp < 8) out.push({ text: `Manifold gas pressure ${gp} in wc is off the 3.5 target — regulator adjustment.`, severity: "watch" });
  return out;
}

const SEVERITY_ORDER: Record<Finding["severity"], number> = { urgent: 0, fix: 1, watch: 2, info: 3 };
export const sortFindings = (f: Finding[]) => [...f].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

/** The client-facing paragraph when the tech did not write one. */
export function reportSummary(input: { kind: VisitKind; findings: Finding[]; equipmentLine?: string | null; advice?: string | null }): string {
  const sorted = sortFindings(input.findings);
  const what = input.kind === "cooling" ? "cooling tune-up" : input.kind === "heating" ? "heating tune-up" : input.kind === "both" ? "tune-up" : "service visit";
  const head = `We completed your ${what}${input.equipmentLine ? ` on the ${input.equipmentLine}` : ""}.`;
  const urgent = sorted.filter((f) => f.severity === "urgent");
  const fix = sorted.filter((f) => f.severity === "fix");
  const watch = sorted.filter((f) => f.severity === "watch");
  const body = urgent.length
    ? ` One item needs attention now: ${urgent[0].text}`
    : fix.length
      ? ` We recommend ${fix.length === 1 ? "one repair" : `${fix.length} repairs`} soon: ${fix.map((f) => f.text.split(" — ")[0]).join("; ")}.`
      : watch.length
        ? ` The system is running; ${watch.length === 1 ? "one reading" : `${watch.length} readings`} we will keep an eye on next visit.`
        : " Everything measured inside the normal range — nothing to do until the next visit.";
  return `${head}${body}${input.advice ? ` ${input.advice}` : ""}`;
}
