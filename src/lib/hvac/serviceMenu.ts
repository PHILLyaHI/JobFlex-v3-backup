// The service menu — what a residential HVAC visit is asked to do, priced by
// the task. Every row is a job a US shop quotes every week: the labor is a
// typical 2026 shop price for the task and the part a typical shop cost, both
// written on the line as "typical — edit", never as a fact about this shop.
// The shop's own tasks (saved from the page) ride on the rate card and join
// the list. Pure data + one filter, no imports beyond the model types.

import type { BuildingModel, ExistingKind } from "./types";

export type ServiceGroup = "tune-up" | "refrigerant" | "electrical" | "furnace" | "airflow" | "refrigeration" | "controls" | "ductless" | "water-heater" | "custom";

export interface ServiceTask {
  id: string;
  group: ServiceGroup;
  title: string;
  /** What the price covers, in one line the customer can read. */
  includes: string;
  /** Typical labor for the task, US shop, 2026 — edit on the line. */
  laborUsd: number;
  /** The part that goes in, when one does, at a typical shop cost. */
  part?: { name: string; costUsd: number; brands?: string[] };
  /** "lb" tasks take a quantity (refrigerant); the rest are one each. */
  unit?: "each" | "lb";
  /** The systems it applies to; left out = any. */
  appliesTo?: ExistingKind[];
  /** Gas-side work: only where the fuel burns. */
  fuel?: Array<"gas" | "propane">;
  /** Covers the inspection, so the diagnostic visit is not billed on top. */
  includesDiagnostic?: boolean;
  /** A line for the customer when the task is picked. */
  note?: string;
  /** Saved by the shop, not from the built-in list. */
  custom?: true;
}

const OUTDOOR: ExistingKind[] = ["split-ac-furnace", "split-heat-pump", "package-unit", "ductless"];
const DUCTED: ExistingKind[] = ["split-ac-furnace", "split-heat-pump", "package-unit", "furnace-only"];
const GAS_FURNACE: ExistingKind[] = ["split-ac-furnace", "furnace-only", "package-unit"];
const HEAT_PUMP: ExistingKind[] = ["split-heat-pump", "package-unit", "ductless"];

export const SERVICE_GROUPS: Array<{ group: ServiceGroup; title: string }> = [
  { group: "tune-up", title: "Tune-ups" },
  { group: "refrigerant", title: "Refrigerant" },
  { group: "electrical", title: "Electrical parts" },
  { group: "furnace", title: "Gas furnace" },
  { group: "airflow", title: "Coils, drains and airflow" },
  { group: "refrigeration", title: "Refrigeration parts" },
  { group: "controls", title: "Thermostats and controls" },
  { group: "ductless", title: "Ductless" },
  { group: "water-heater", title: "Water heater" },
  { group: "custom", title: "Your own tasks" },
];

export const SERVICE_MENU: ServiceTask[] = [
  // ── tune-ups ────────────────────────────────────────────────────────────
  { id: "ac-tuneup", group: "tune-up", title: "AC tune-up", includes: "Condenser coil rinse, charge and superheat/subcool check, capacitor and contactor test, amps, drain treated, filter", laborUsd: 149, includesDiagnostic: true, appliesTo: ["split-ac-furnace", "package-unit"] },
  { id: "hp-tuneup", group: "tune-up", title: "Heat pump tune-up", includes: "Both modes run, defrost cycle and reversing valve checked, strips tested, charge, capacitor and contactor, drain", laborUsd: 169, includesDiagnostic: true, appliesTo: ["split-heat-pump", "package-unit"] },
  { id: "furnace-tuneup", group: "tune-up", title: "Furnace tune-up", includes: "Burners and igniter cleaned, flame sensor, heat exchanger inspected, CO at the register, gas pressure, temperature rise", laborUsd: 139, includesDiagnostic: true, appliesTo: GAS_FURNACE, fuel: ["gas", "propane"] },
  { id: "ductless-clean", group: "tune-up", title: "Ductless head deep clean", includes: "Head pulled apart and washed (blower wheel, coil, drain pan), outdoor coil rinsed, per head", laborUsd: 179, includesDiagnostic: true, appliesTo: ["ductless"] },

  // ── refrigerant ─────────────────────────────────────────────────────────
  { id: "recharge", group: "refrigerant", title: "Refrigerant recharge", includes: "Leak check, recover and weigh in — priced by the pound at the refrigerant the system holds", laborUsd: 0, unit: "lb", appliesTo: OUTDOOR, note: "A recharge without a leak repair is a stop-gap; the customer should know it will need doing again." },
  { id: "leak-search", group: "refrigerant", title: "Leak search", includes: "Electronic detector and dye, indoor and outdoor coils, line set and fittings, findings in writing", laborUsd: 225, appliesTo: OUTDOOR },
  { id: "leak-repair", group: "refrigerant", title: "Leak repair, evacuate and recharge", includes: "Braze the leak, new filter drier, pull to 500 microns, weigh in the charge (refrigerant billed by the pound)", laborUsd: 650, part: { name: "Filter drier", costUsd: 35, brands: ["Sporlan", "Emerson"] }, appliesTo: OUTDOOR },
  { id: "evac-recharge", group: "refrigerant", title: "Evacuate and weigh-in charge", includes: "Recover, pull to 500 microns, weigh the factory charge back in (refrigerant billed by the pound)", laborUsd: 350, appliesTo: OUTDOOR },

  // ── electrical parts ────────────────────────────────────────────────────
  { id: "capacitor", group: "electrical", title: "Run capacitor", includes: "Dual run capacitor matched to the plate, wired and tested under load", laborUsd: 95, part: { name: "Dual run capacitor", costUsd: 28, brands: ["Mars", "Titan Pro", "Packard"] }, appliesTo: OUTDOOR },
  { id: "contactor", group: "electrical", title: "Contactor", includes: "Two-pole contactor, coil voltage checked, lugs torqued", laborUsd: 95, part: { name: "Contactor, 2-pole", costUsd: 32, brands: ["Mars", "Packard", "Honeywell"] }, appliesTo: OUTDOOR },
  { id: "hard-start", group: "electrical", title: "Hard-start kit", includes: "Start capacitor and relay for a compressor that hums or trips", laborUsd: 95, part: { name: "Hard-start kit", costUsd: 55, brands: ["Supco", "Mars"] }, appliesTo: OUTDOOR },
  { id: "fan-motor", group: "electrical", title: "Condenser fan motor", includes: "Motor and blade matched to the unit, capacitor checked, amps verified", laborUsd: 225, part: { name: "Condenser fan motor + blade", costUsd: 210, brands: ["Genteq", "Fasco", "Mars", "US Motors"] }, appliesTo: OUTDOOR },
  { id: "blower-psc", group: "electrical", title: "Blower motor, PSC", includes: "Motor and capacitor, wheel cleaned and balanced, airflow checked", laborUsd: 275, part: { name: "Blower motor, PSC", costUsd: 220, brands: ["Genteq", "Fasco", "Mars"] }, appliesTo: DUCTED },
  { id: "blower-ecm", group: "electrical", title: "Blower motor, ECM", includes: "ECM motor and module programmed to the furnace, airflow verified", laborUsd: 325, part: { name: "ECM blower motor + module", costUsd: 620, brands: ["Genteq Evergreen", "Fasco", "OEM"] }, appliesTo: DUCTED },
  { id: "control-board", group: "electrical", title: "Control board", includes: "Integrated furnace or air-handler board, wiring transferred, sequence tested", laborUsd: 225, part: { name: "Control board", costUsd: 260, brands: ["OEM", "White-Rodgers", "ICM"] }, appliesTo: DUCTED },
  { id: "transformer", group: "electrical", title: "24 V transformer", includes: "Class 2 transformer and fuse, low-voltage circuit checked for the short that took it out", laborUsd: 95, part: { name: "Transformer, 24 V 40 VA", costUsd: 40, brands: ["Mars", "Packard"] }, appliesTo: DUCTED },
  { id: "disconnect", group: "electrical", title: "Outdoor disconnect", includes: "Non-fused pull-out disconnect and whip at the condenser", laborUsd: 140, part: { name: "Disconnect + whip", costUsd: 45, brands: ["Eaton", "Square D", "Siemens"] }, appliesTo: OUTDOOR },

  // ── gas furnace ─────────────────────────────────────────────────────────
  { id: "igniter", group: "furnace", title: "Hot-surface igniter", includes: "Igniter matched to the furnace, burners inspected, ignition sequence timed", laborUsd: 120, part: { name: "Hot-surface igniter", costUsd: 48, brands: ["White-Rodgers", "Honeywell", "OEM"] }, appliesTo: GAS_FURNACE, fuel: ["gas", "propane"] },
  { id: "flame-sensor", group: "furnace", title: "Flame sensor", includes: "Sensor cleaned or replaced, microamps read and logged", laborUsd: 95, part: { name: "Flame sensor", costUsd: 22, brands: ["OEM", "White-Rodgers"] }, appliesTo: GAS_FURNACE, fuel: ["gas", "propane"] },
  { id: "pressure-switch", group: "furnace", title: "Pressure switch", includes: "Switch matched to the furnace, tubing and inducer port cleared, draft verified", laborUsd: 140, part: { name: "Pressure switch", costUsd: 55, brands: ["Honeywell", "Tridelta", "OEM"] }, appliesTo: GAS_FURNACE, fuel: ["gas", "propane"] },
  { id: "inducer", group: "furnace", title: "Inducer motor", includes: "Draft inducer assembly, gasket, pressure switch retested", laborUsd: 275, part: { name: "Inducer motor assembly", costUsd: 340, brands: ["Fasco", "Jakel", "OEM"] }, appliesTo: GAS_FURNACE, fuel: ["gas", "propane"] },
  { id: "gas-valve", group: "furnace", title: "Gas valve", includes: "Valve matched to the furnace, manifold pressure set, leak test at the fittings", laborUsd: 250, part: { name: "Gas valve", costUsd: 260, brands: ["Honeywell", "White-Rodgers"] }, appliesTo: GAS_FURNACE, fuel: ["gas", "propane"] },
  { id: "limit-switch", group: "furnace", title: "Limit or rollout switch", includes: "Switch replaced and the reason it tripped found (airflow, filter, cracked exchanger)", laborUsd: 120, part: { name: "Limit / rollout switch", costUsd: 35, brands: ["OEM", "Emerson"] }, appliesTo: GAS_FURNACE, fuel: ["gas", "propane"] },
  { id: "thermocouple", group: "furnace", title: "Thermocouple / pilot assembly", includes: "For a standing-pilot furnace: thermocouple, pilot cleaned and lit", laborUsd: 110, part: { name: "Thermocouple", costUsd: 25, brands: ["Honeywell", "White-Rodgers"] }, appliesTo: GAS_FURNACE, fuel: ["gas", "propane"] },
  { id: "hx-inspect", group: "furnace", title: "Heat exchanger inspection", includes: "Camera inspection of the cells and CO at the supply — the written result that decides repair or replace", laborUsd: 149, appliesTo: GAS_FURNACE, fuel: ["gas", "propane"] },

  // ── coils, drains and airflow ───────────────────────────────────────────
  { id: "evap-clean", group: "airflow", title: "Evaporator coil cleaning", includes: "Coil cleaned in place with foaming cleaner, pan and drain flushed, temperature split checked", laborUsd: 325, part: { name: "Coil cleaner", costUsd: 20, brands: ["Nu-Calgon", "RectorSeal"] }, appliesTo: DUCTED },
  { id: "cond-clean", group: "airflow", title: "Condenser coil cleaning", includes: "Fins washed from the inside out with coil cleaner, guard and top reset", laborUsd: 149, part: { name: "Coil cleaner", costUsd: 15, brands: ["Nu-Calgon"] }, appliesTo: OUTDOOR },
  { id: "drain-clear", group: "airflow", title: "Condensate drain clear", includes: "Line cleared with nitrogen or vacuum, trap flushed, pan treated", laborUsd: 129, part: { name: "Pan tablets", costUsd: 8, brands: ["Nu-Calgon", "DiversiTech"] }, appliesTo: DUCTED },
  { id: "cond-pump", group: "airflow", title: "Condensate pump", includes: "Pump with safety switch wired to shut the system down when it fails", laborUsd: 140, part: { name: "Condensate pump", costUsd: 65, brands: ["Little Giant", "DiversiTech"] }, appliesTo: DUCTED },
  { id: "float-switch", group: "airflow", title: "Float / overflow switch", includes: "Safety switch in the drain or the pan, wired to the low-voltage circuit", laborUsd: 110, part: { name: "Float switch", costUsd: 28, brands: ["RectorSeal", "DiversiTech"] }, appliesTo: DUCTED },
  { id: "blower-wheel", group: "airflow", title: "Blower wheel cleaning", includes: "Wheel pulled and washed, housing cleaned, static checked after", laborUsd: 250, appliesTo: DUCTED },
  { id: "filter", group: "airflow", title: "Filter replacement", includes: "Pleated filter in the return, size noted for the customer", laborUsd: 25, part: { name: "Pleated filter", costUsd: 18, brands: ["Filtrete", "Honeywell"] }, appliesTo: DUCTED },

  // ── refrigeration parts ────────────────────────────────────────────────
  { id: "txv", group: "refrigeration", title: "Expansion valve (TXV)", includes: "Valve and drier, recover, braze, evacuate and recharge (refrigerant by the pound)", laborUsd: 450, part: { name: "TXV + filter drier", costUsd: 120, brands: ["Sporlan", "Danfoss", "Emerson"] }, appliesTo: OUTDOOR },
  { id: "drier", group: "refrigeration", title: "Filter drier", includes: "Liquid-line drier, brazed, evacuated and recharged (refrigerant by the pound)", laborUsd: 175, part: { name: "Filter drier", costUsd: 35, brands: ["Sporlan", "Emerson"] }, appliesTo: OUTDOOR },
  { id: "reversing-valve", group: "refrigeration", title: "Reversing valve", includes: "Valve and solenoid, drier, recover, braze, evacuate and recharge (refrigerant by the pound)", laborUsd: 850, part: { name: "Reversing valve + solenoid", costUsd: 380, brands: ["OEM", "Ranco"] }, appliesTo: HEAT_PUMP },
  { id: "defrost-board", group: "refrigeration", title: "Defrost control board", includes: "Board and sensor, defrost cycle forced and timed", laborUsd: 225, part: { name: "Defrost board + sensor", costUsd: 180, brands: ["OEM", "ICM"] }, appliesTo: HEAT_PUMP },
  { id: "compressor", group: "refrigeration", title: "Compressor", includes: "Compressor swap: recover, braze, drier, evacuate, weigh in (refrigerant by the pound). Part often under warranty — labor is the cost", laborUsd: 1400, part: { name: "Compressor (OEM)", costUsd: 900, brands: ["Copeland", "LG", "Danfoss"] }, appliesTo: OUTDOOR, note: "On a unit past 12 years a compressor is money into an old system — price the replacement alongside." },

  // ── thermostats and controls ───────────────────────────────────────────
  { id: "tstat-basic", group: "controls", title: "Programmable thermostat", includes: "Thermostat installed, wired, programmed and shown to the customer", laborUsd: 110, part: { name: "Programmable thermostat", costUsd: 60, brands: ["Honeywell Home", "Emerson"] } },
  { id: "tstat-smart", group: "controls", title: "Smart thermostat", includes: "Wi-Fi thermostat installed, C-wire confirmed, app set up with the customer", laborUsd: 140, part: { name: "Smart thermostat", costUsd: 190, brands: ["Ecobee", "Google Nest", "Honeywell Home"] } },
  { id: "tstat-wire", group: "controls", title: "Thermostat wire / C-wire", includes: "New 18/5 run from the air handler to the stat where the old wire is short a conductor", laborUsd: 150, part: { name: "Thermostat wire", costUsd: 25 } },

  // ── ductless ───────────────────────────────────────────────────────────
  { id: "ductless-pump", group: "ductless", title: "Ductless condensate pump", includes: "Mini pump in the head or line-hide, wired to the head's interlock", laborUsd: 175, part: { name: "Mini-split condensate pump", costUsd: 95, brands: ["Aspen", "Sauermann"] }, appliesTo: ["ductless"] },
  { id: "ductless-board", group: "ductless", title: "Ductless control board", includes: "Indoor or outdoor board, error code cleared, communication tested", laborUsd: 225, part: { name: "Control board (OEM)", costUsd: 240, brands: ["OEM"] }, appliesTo: ["ductless"] },

  // ── water heater ───────────────────────────────────────────────────────
  { id: "wh-thermocouple", group: "water-heater", title: "Water heater thermocouple / pilot", includes: "Thermocouple or pilot assembly, pilot lit, burner checked", laborUsd: 120, part: { name: "Thermocouple / pilot assembly", costUsd: 25, brands: ["Honeywell", "Rheem", "A.O. Smith"] } },
  { id: "wh-tp", group: "water-heater", title: "T&P relief valve", includes: "Relief valve and discharge line to an approved drain", laborUsd: 120, part: { name: "T&P valve", costUsd: 30, brands: ["Watts", "Cash Acme"] } },
  { id: "wh-anode", group: "water-heater", title: "Anode rod", includes: "Anode pulled and replaced, tank checked for rust — the cheapest years a tank can buy", laborUsd: 140, part: { name: "Anode rod", costUsd: 45, brands: ["Rheem", "A.O. Smith", "Corro-Protec"] } },
  { id: "wh-element", group: "water-heater", title: "Electric element + thermostat", includes: "Element and thermostat on an electric tank, tank drained and refilled, checked at 240 V", laborUsd: 160, part: { name: "Element + thermostat", costUsd: 45, brands: ["Camco", "Rheem", "A.O. Smith"] } },
  { id: "wh-flush", group: "water-heater", title: "Tank flush and descale", includes: "Tank drained and flushed, tankless descaled with a pump kit, T&P exercised", laborUsd: 129 },
];

const TITLES: Record<ExistingKind, string> = { "split-ac-furnace": "AC + furnace", "split-heat-pump": "heat pump", "furnace-only": "furnace", "package-unit": "package unit", ductless: "ductless", boiler: "boiler", none: "system" };

/** The menu for this house: the tasks that apply to what is there, grouped,
 *  with the shop's own tasks folded in, and the words the visit should open
 *  with (R-22, an old system, no cooling to service). */
export function serviceMenuFor(m: BuildingModel, custom: ServiceTask[] = []): { groups: Array<{ group: ServiceGroup; title: string; tasks: ServiceTask[] }>; recommended: string[]; notes: string[] } {
  const kind = m.existing.kind;
  const fuel = m.existing.fuel;
  const burns = fuel === "gas" || fuel === "propane" || (fuel === undefined && m.gas.available !== false && (kind === "split-ac-furnace" || kind === "furnace-only" || kind === "package-unit"));
  const fits = (t: ServiceTask) => (!t.appliesTo || t.appliesTo.includes(kind)) && (!t.fuel || burns);
  const all = [...SERVICE_MENU, ...custom.map((c) => ({ ...c, custom: true as const, group: c.group ?? "custom" }))];
  const groups = SERVICE_GROUPS.map((g) => ({ ...g, tasks: all.filter((t) => t.group === g.group && fits(t)) })).filter((g) => g.tasks.length);
  const recommended: string[] = [];
  const notes: string[] = [];
  const tune = kind === "split-heat-pump" ? "hp-tuneup" : kind === "ductless" ? "ductless-clean" : kind === "furnace-only" ? "furnace-tuneup" : "ac-tuneup";
  if (all.some((t) => t.id === tune && fits(t))) recommended.push(tune);
  if (m.existing.refrigerant === "R-22") notes.push("R-22 system: a recharge is reclaimed refrigerant at today's price, and no part on it is worth much — quote the replacement alongside any repair over a capacitor.");
  const age = m.existing.yearMade ? new Date().getFullYear() - m.existing.yearMade : undefined;
  if (age !== undefined && age >= 15) notes.push(`The ${TITLES[kind]} is ${age} years old: past a capacitor or a contactor, a repair is money into a unit near the end of its life — offer the replacement estimate with the repair.`);
  if (kind === "none") notes.push("No system on record for this house: pick the tasks you know, or set the existing system above so the menu fits it.");
  return { groups, recommended, notes };
}

/** One row by id, from the built-in list or the shop's own. */
export function serviceTask(id: string, custom: ServiceTask[] = []): ServiceTask | undefined {
  return SERVICE_MENU.find((t) => t.id === id) ?? custom.find((t) => t.id === id);
}
