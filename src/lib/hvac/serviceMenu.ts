// The service menu — what a residential HVAC visit is asked to do, priced by
// the task. Every row is a job a US shop quotes every week: the labor is a
// typical 2026 shop price for the task and the part a typical shop cost, both
// written on the line as "typical — edit", never as a fact about this shop.
// The shop's own tasks (saved from the page) ride on the rate card and join
// the list. Pure data + one filter, no imports beyond the model types.

import type { BuildingModel, ExistingKind } from "./types";
import { locationIndex } from "@/lib/estimate/location-index";

export type ServiceGroup = "tune-up" | "refrigerant" | "electrical" | "furnace" | "airflow" | "refrigeration" | "controls" | "iaq" | "zoning" | "ductless" | "water-heater" | "boiler" | "custom";

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
  /** The labor is the shop's own number (a menu override) — never indexed or adjusted. */
  ownLabor?: true;
  /** The part cost is the shop's own number. */
  ownPart?: true;
}

/**
 * The shop's own numbers on a built-in task (2026-09-23, owner: "make those
 * services editable"). Saved on the rate card by task id; a field left out
 * keeps the typical. `hidden` takes the task off the shop's menu — an old
 * estimate that already picked it still prices.
 */
export interface ServiceOverride {
  laborUsd?: number;
  partCostUsd?: number;
  partName?: string;
  brands?: string[];
  includes?: string;
  hidden?: boolean;
}
export type ServiceOverrides = Record<string, ServiceOverride>;

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
  { group: "iaq", title: "Air quality" },
  { group: "zoning", title: "Zoning and dampers" },
  { group: "ductless", title: "Ductless" },
  { group: "water-heater", title: "Water heater" },
  { group: "boiler", title: "Boiler / hydronic" },
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

  // ── 2026-09-22: the rows a Housecall Pro book carries that this one did not ──
  // line set, relocation
  { id: "lineset-repair", group: "refrigerant", title: "Line set repair", includes: "Braze or replace the damaged section, new filter drier, pressure test, evacuate and weigh in (refrigerant by the pound)", laborUsd: 450, part: { name: "Line set section and fittings", costUsd: 60 }, appliesTo: OUTDOOR },
  { id: "lineset-flush", group: "refrigerant", title: "Line set flush", includes: "Flush after a compressor burnout, suction-line drier, evacuate to 500 microns", laborUsd: 350, part: { name: "Flush kit and suction drier", costUsd: 90 }, appliesTo: OUTDOOR },
  { id: "lineset-replace", group: "refrigerant", title: "Line set replacement (to 50 ft)", includes: "New insulated copper run, brazed, pressure tested and evacuated; longer runs by the foot", laborUsd: 750, part: { name: "Line set, 3/8 × 3/4, 50 ft insulated", costUsd: 220 }, appliesTo: OUTDOOR },
  { id: "relocate-outdoor", group: "refrigerant", title: "Relocate the outdoor unit", includes: "New pad, line set extension brazed and insulated, disconnect and whip moved, evacuate and recharge", laborUsd: 950, part: { name: "Pad, line set extension and whip", costUsd: 260 }, appliesTo: OUTDOOR },

  // electrical
  { id: "blower-ecm-module", group: "electrical", title: "ECM blower module", includes: "Control module on a variable-speed blower, programmed to the furnace or air handler, airflow verified", laborUsd: 175, part: { name: "ECM motor control module", costUsd: 320, brands: ["Genteq", "Broad-Ocean"] }, appliesTo: DUCTED },
  { id: "fan-blade", group: "electrical", title: "Condenser fan blade", includes: "Blade matched to the motor, balanced, amps checked", laborUsd: 120, part: { name: "Condenser fan blade", costUsd: 60 }, appliesTo: OUTDOOR },
  { id: "surge", group: "electrical", title: "Surge protector, outdoor unit", includes: "Surge protector at the disconnect — the board and the compressor ride out the lightning season", laborUsd: 120, part: { name: "HVAC surge protector", costUsd: 110, brands: ["Intermatic", "DiversiTech"] }, appliesTo: OUTDOOR },
  { id: "crankcase-heater", group: "electrical", title: "Crankcase heater", includes: "Belly-band or insert heater on the compressor, wired to the contactor", laborUsd: 130, part: { name: "Crankcase heater", costUsd: 45 }, appliesTo: OUTDOOR },
  { id: "heat-strip", group: "electrical", title: "Electric heat kit / strip", includes: "Heat kit or element in the air handler, sequencer and limit checked, amps verified", laborUsd: 225, part: { name: "Electric heat kit", costUsd: 260 }, appliesTo: ["split-heat-pump", "package-unit"] },
  { id: "sequencer", group: "electrical", title: "Heat sequencer / relay", includes: "Sequencer or heat relay on the strip heat, staging verified", laborUsd: 120, part: { name: "Sequencer", costUsd: 40 }, appliesTo: ["split-heat-pump", "package-unit"] },
  { id: "wiring-repair", group: "electrical", title: "Low-voltage wiring repair", includes: "Find the short or the break, repair or rerun the thermostat wire, fuse replaced", laborUsd: 175, part: { name: "Thermostat wire and fuse", costUsd: 15 } },

  // gas furnace
  { id: "hx-replace", group: "furnace", title: "Heat exchanger replacement", includes: "Furnace pulled apart, new exchanger, burners and collector box reset, combustion and CO verified", laborUsd: 950, part: { name: "Heat exchanger (often under the parts warranty)", costUsd: 900 }, appliesTo: GAS_FURNACE, fuel: ["gas", "propane"], note: "A cracked heat exchanger is usually under the 20-year or lifetime parts warranty — then this is labor only. Out of warranty on an older furnace, quote the furnace first." },
  { id: "door-switch", group: "furnace", title: "Blower door safety switch", includes: "Door interlock switch, wired and tested", laborUsd: 85, part: { name: "Blower door switch", costUsd: 20 }, appliesTo: GAS_FURNACE, fuel: ["gas", "propane"] },
  { id: "furnace-trap", group: "furnace", title: "Condensate trap and drain (90%+ furnace)", includes: "Trap and tubing on a condensing furnace, pressure-switch hoses checked, drain run to a proper outlet", laborUsd: 150, part: { name: "Condensate trap and tubing", costUsd: 30 }, appliesTo: GAS_FURNACE, fuel: ["gas", "propane"] },

  // coils, drains and airflow
  { id: "evap-coil-replace", group: "airflow", title: "Evaporator coil replacement", includes: "Matched cased coil, brazed in, new drier, evacuated and weighed in (refrigerant by the pound)", laborUsd: 850, part: { name: "Evaporator coil, cased", costUsd: 750, brands: ["ADP", "Aspen"] }, appliesTo: ["split-ac-furnace", "split-heat-pump"], note: "Past 12 years, the matching outdoor unit is usually the better money than a coil alone." },
  { id: "cond-coil-replace", group: "airflow", title: "Condenser coil replacement", includes: "Coil on an outdoor unit under warranty, brazed in, evacuated and recharged", laborUsd: 750, part: { name: "Condenser coil", costUsd: 650 }, appliesTo: ["split-ac-furnace", "split-heat-pump", "package-unit"], note: "Out of warranty, the whole outdoor unit is replaced instead of its coil." },
  { id: "drain-pan", group: "airflow", title: "Evaporator drain pan replacement", includes: "Primary or secondary pan, float switch reset, drain flushed", laborUsd: 300, part: { name: "Drain pan", costUsd: 90 }, appliesTo: DUCTED },
  { id: "fan-belt", group: "airflow", title: "Blower belt", includes: "Belt on a belt-drive blower, tensioned, pulleys aligned", laborUsd: 95, part: { name: "Blower belt", costUsd: 25 }, appliesTo: DUCTED },
  { id: "blower-bearing", group: "airflow", title: "Blower pulley or bearing", includes: "Pulley or shaft bearing on a belt-drive blower, aligned and greased", laborUsd: 175, part: { name: "Blower pulley / bearing", costUsd: 60 }, appliesTo: DUCTED },
  { id: "duct-seal", group: "airflow", title: "Duct sealing, accessible runs", includes: "Mastic and tape at every reachable joint and boot, plenums sealed, static pressure before and after", laborUsd: 450, part: { name: "Mastic, tape and straps", costUsd: 60 }, appliesTo: DUCTED },
  { id: "return-upgrade", group: "airflow", title: "Return air upgrade", includes: "A second return or a larger grille and drop, to bring the static pressure into range", laborUsd: 600, part: { name: "Return grille, boot and duct", costUsd: 180 }, appliesTo: DUCTED },
  { id: "duct-clean", group: "airflow", title: "Duct cleaning", includes: "Negative-air machine on every run, registers and returns, blower compartment vacuumed", laborUsd: 450, appliesTo: DUCTED },

  // thermostats and controls
  { id: "relocate-tstat", group: "controls", title: "Relocate the thermostat", includes: "Thermostat moved off the sun or the hallway draft, wire fished, old spot patched", laborUsd: 150, part: { name: "Thermostat wire and plate", costUsd: 20 } },

  // air quality
  { id: "media-cabinet", group: "iaq", title: "Media filter cabinet (4-5 in.)", includes: "Cabinet cut into the return, 4-5 in. pleated media, filter door sealed", laborUsd: 300, part: { name: "Media filter cabinet with 4-5 in. filter", costUsd: 220, brands: ["Aprilaire", "Honeywell"] }, appliesTo: DUCTED },
  { id: "uv-lamp", group: "iaq", title: "UV lamp at the coil", includes: "UV-C lamp over the evaporator coil, wired to the air handler, mold and slime kept off the coil and pan", laborUsd: 175, part: { name: "UV coil lamp", costUsd: 220, brands: ["Fresh-Aire UV", "Honeywell"] }, appliesTo: DUCTED, note: "The bulb is a yearly change — a plan-visit item." },
  { id: "humidifier", group: "iaq", title: "Whole-home humidifier", includes: "Bypass or fan humidifier on the supply, water line and drain, humidistat set", laborUsd: 450, part: { name: "Bypass or fan humidifier", costUsd: 320, brands: ["Aprilaire", "Honeywell"] }, appliesTo: DUCTED },
  { id: "dehumidifier", group: "iaq", title: "Whole-home dehumidifier", includes: "Ducted dehumidifier tied into the return, condensate to a drain, dehumidistat set", laborUsd: 900, part: { name: "Ducted dehumidifier", costUsd: 1600, brands: ["Aprilaire", "Santa Fe"] }, appliesTo: DUCTED },
  { id: "erv", group: "iaq", title: "ERV / HRV fresh-air unit", includes: "Energy- or heat-recovery ventilator with its ducting, balanced, controls set", laborUsd: 1200, part: { name: "ERV/HRV with ducting kit", costUsd: 1500, brands: ["Broan", "Panasonic", "RenewAire"] }, appliesTo: DUCTED },
  { id: "eac-cell", group: "iaq", title: "Electronic air cleaner cell / service", includes: "Cells and pre-filters washed or replaced, power supply tested", laborUsd: 150, part: { name: "Air cleaner cell / pre-filter set", costUsd: 120 }, appliesTo: DUCTED },

  // zoning and dampers
  { id: "zone-board", group: "zoning", title: "Zone control board", includes: "Zone panel, thermostats and dampers wired to it, staging and bypass set", laborUsd: 300, part: { name: "Zone control panel", costUsd: 280, brands: ["Honeywell", "EWC"] }, appliesTo: DUCTED },
  { id: "damper", group: "zoning", title: "Motorized zone damper", includes: "Damper in the trunk or branch, wired to the panel, travel checked", laborUsd: 250, part: { name: "Motorized damper", costUsd: 140 }, appliesTo: DUCTED },
  { id: "damper-actuator", group: "zoning", title: "Damper actuator", includes: "Actuator on an existing damper, end switches set", laborUsd: 150, part: { name: "Damper actuator", costUsd: 85 }, appliesTo: DUCTED },
  { id: "bypass-damper", group: "zoning", title: "Bypass damper", includes: "Barometric bypass between supply and return, weight set for the static", laborUsd: 250, part: { name: "Barometric bypass damper", costUsd: 120 }, appliesTo: DUCTED },
  { id: "zone-tstat", group: "zoning", title: "Zone thermostat / sensor", includes: "Thermostat or remote sensor for one zone, wired and addressed", laborUsd: 120, part: { name: "Zone thermostat", costUsd: 90 }, appliesTo: DUCTED },

  // ductless
  { id: "ductless-blower", group: "ductless", title: "Ductless blower motor", includes: "Indoor fan motor in the head, wheel rebalanced, error code cleared", laborUsd: 250, part: { name: "Ductless indoor fan motor", costUsd: 180 }, appliesTo: ["ductless"] },
  { id: "ductless-flare", group: "ductless", title: "Ductless flare / leak repair and recharge", includes: "Flares remade or fittings replaced, pressure test, evacuate and weigh in (refrigerant by the pound)", laborUsd: 450, part: { name: "Flare nuts and drier", costUsd: 40 }, appliesTo: ["ductless"] },

  // water heater
  { id: "wh-gas-valve", group: "water-heater", title: "Water heater gas control valve", includes: "Gas control / thermostat on a gas tank, pilot relit, burner and draft checked", laborUsd: 200, part: { name: "Gas control valve / thermostat", costUsd: 180 }, fuel: ["gas", "propane"] },
  { id: "wh-expansion", group: "water-heater", title: "Expansion tank", includes: "Thermal expansion tank on the cold side, pre-charged to house pressure", laborUsd: 180, part: { name: "Thermal expansion tank", costUsd: 60 } },

  // boiler / hydronic — where the house burns gas or propane
  { id: "boiler-tuneup", group: "boiler", title: "Boiler tune-up", includes: "Burners cleaned, combustion analysis, relief valve exercised, expansion tank checked, air bled from the loops", laborUsd: 260, fuel: ["gas", "propane"], includesDiagnostic: true },
  { id: "zone-valve", group: "boiler", title: "Zone valve", includes: "Zone valve head or body, wired to the relay, loop purged", laborUsd: 220, part: { name: "Zone valve", costUsd: 110, brands: ["Taco", "Honeywell"] }, fuel: ["gas", "propane"] },
  { id: "circulator", group: "boiler", title: "Circulator pump", includes: "Circulator on the loop, flanges and gaskets, air bled", laborUsd: 300, part: { name: "Circulator pump", costUsd: 220, brands: ["Taco", "Grundfos"] }, fuel: ["gas", "propane"] },
  { id: "boiler-expansion", group: "boiler", title: "Boiler expansion tank", includes: "Expansion tank and fill valve, system pressure set", laborUsd: 200, part: { name: "Boiler expansion tank", costUsd: 70 }, fuel: ["gas", "propane"] },
  { id: "aquastat", group: "boiler", title: "Aquastat / boiler control", includes: "Aquastat relay or control, limits set, burner cycle verified", laborUsd: 220, part: { name: "Aquastat relay", costUsd: 180 }, fuel: ["gas", "propane"] },
  { id: "boiler-relief", group: "boiler", title: "Boiler relief valve", includes: "30 psi relief valve and discharge line", laborUsd: 150, part: { name: "30 psi relief valve", costUsd: 40 }, fuel: ["gas", "propane"] },
  { id: "purge-fill", group: "boiler", title: "Purge and fill, air bled", includes: "Loops purged of air, system refilled and pressurized, every radiator or loop hot", laborUsd: 220, fuel: ["gas", "propane"] },
  { id: "boiler-ignition", group: "boiler", title: "Boiler pilot / igniter", includes: "Igniter, thermocouple or pilot assembly, flame proven", laborUsd: 180, part: { name: "Igniter or thermocouple", costUsd: 45 }, fuel: ["gas", "propane"] },
];

/** A built-in task with the shop's own numbers on it, when it has any. */
export function applyOverride(t: ServiceTask, o?: ServiceOverride): ServiceTask {
  if (!o) return t;
  const out: ServiceTask = { ...t };
  if (typeof o.laborUsd === "number") { out.laborUsd = o.laborUsd; out.ownLabor = true; }
  if (typeof o.includes === "string" && o.includes.trim()) out.includes = o.includes;
  if (t.part && (typeof o.partCostUsd === "number" || o.partName || o.brands)) {
    out.part = { ...t.part };
    if (typeof o.partCostUsd === "number") { out.part.costUsd = o.partCostUsd; out.ownPart = true; }
    if (o.partName) out.part.name = o.partName;
    if (o.brands?.length) out.part.brands = o.brands;
  }
  return out;
}

/** The built-in menu as this shop prices it: overrides applied, hidden tasks left out. */
export function withShopPrices(tasks: readonly ServiceTask[], overrides: ServiceOverrides = {}): ServiceTask[] {
  return tasks.filter((t) => !overrides[t.id]?.hidden).map((t) => applyOverride(t, overrides[t.id]));
}

const TITLES: Record<ExistingKind, string> = { "split-ac-furnace": "AC + furnace", "split-heat-pump": "heat pump", "furnace-only": "furnace", "package-unit": "package unit", ductless: "ductless", boiler: "boiler", none: "system" };

/** The menu for this house: the tasks that apply to what is there, grouped,
 *  with the shop's own tasks folded in, and the words the visit should open
 *  with (R-22, an old system, no cooling to service). */
export function serviceMenuFor(m: BuildingModel, custom: ServiceTask[] = [], overrides: ServiceOverrides = {}): { groups: Array<{ group: ServiceGroup; title: string; tasks: ServiceTask[] }>; recommended: string[]; notes: string[] } {
  const kind = m.existing.kind;
  const fuel = m.existing.fuel;
  const burns = fuel === "gas" || fuel === "propane" || (fuel === undefined && m.gas.available !== false && (kind === "split-ac-furnace" || kind === "furnace-only" || kind === "package-unit"));
  const fits = (t: ServiceTask) => (!t.appliesTo || t.appliesTo.includes(kind)) && (!t.fuel || burns);
  const all = [...withShopPrices(SERVICE_MENU, overrides), ...custom.map((c) => ({ ...c, custom: true as const, group: c.group ?? "custom" }))];
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

/** One row by id, from the built-in list (with the shop's numbers on it) or the shop's own. A hidden task still resolves: an estimate that picked it keeps pricing. */
export function serviceTask(id: string, custom: ServiceTask[] = [], overrides: ServiceOverrides = {}): ServiceTask | undefined {
  const t = SERVICE_MENU.find((x) => x.id === id);
  return t ? applyOverride(t, overrides[id]) : custom.find((x) => x.id === id);
}

/**
 * The menu's labor is a US-typical shop price; the job's own market moves
 * it (lib/estimate/location-index — a listed city, else the state, else the
 * country). Parts are not indexed, and a shop's own saved tasks are the
 * shop's number as typed.
 */
export function serviceLaborIndex(m: BuildingModel): { factor: number; place: string } {
  const idx = locationIndex(m.address || m.state);
  return { factor: idx.factor, place: idx.place };
}
/** A built-in task's labor in this market, to the nearest $5 — moved by the
 *  shop's own adjustment (+10 = ten percent above typical) when it set one.
 *  The shop's own numbers (a saved task, a menu override) are never moved. */
export function indexedLabor(t: ServiceTask, factor: number, adjustPct = 0): number {
  if (t.custom || t.ownLabor) return t.laborUsd;
  return Math.round((t.laborUsd * factor * (1 + adjustPct / 100)) / 5) * 5;
}

/** The repairs that are the heart of the system: on an old unit they are money into a replacement. */
export const MAJOR_REPAIRS = new Set(["compressor", "hx-replace", "evap-coil-replace", "cond-coil-replace", "reversing-valve", "lineset-replace"]);

export interface RepairAdvice {
  verdict: "repair" | "consider" | "replace";
  /** The reasons, in the contractor's words. */
  why: string[];
  /** One line for the estimate and the customer. */
  line: string;
  age?: number;
}

/**
 * Repair or replace — the rule every shop uses, written down: the age, the
 * "$5,000 rule" (age × repair cost), a major part on an old system, R-22, and
 * the repair against a replacement quote when one is known.
 */
export function repairAdvice(input: { model: BuildingModel; taskIds: string[]; repairSubtotal: number; replaceSubtotal?: number | null }): RepairAdvice {
  const { model: m, taskIds, repairSubtotal, replaceSubtotal } = input;
  const age = m.existing.yearMade ? new Date().getFullYear() - m.existing.yearMade : undefined;
  const heatPump = m.existing.kind === "split-heat-pump" || m.existing.kind === "ductless";
  const oldAt = heatPump ? 12 : 15;
  const major = taskIds.filter((id) => MAJOR_REPAIRS.has(id));
  const refrigerantWork = taskIds.some((id) => SERVICE_MENU.find((t) => t.id === id)?.group === "refrigerant") || major.length > 0;
  const r22 = m.existing.refrigerant === "R-22" && refrigerantWork;
  const why: string[] = [];
  let score = 0;
  const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  if (age !== undefined && age >= oldAt && repairSubtotal >= 600) { why.push(`the system is ${age} years old`); score += 2; }
  else if (age !== undefined && age >= oldAt - 3 && repairSubtotal >= 400) { why.push(`the system is ${age} years old`); score += 1; }
  if (age !== undefined && age >= 10 && age * repairSubtotal >= 5000 && repairSubtotal >= 400) { why.push(`the $5,000 rule: ${age} years × ${usd(repairSubtotal)} = ${usd(age * repairSubtotal)}`); score += 1; }
  if (major.length && age !== undefined && age >= 10) { why.push(`${major.map((id) => SERVICE_MENU.find((t) => t.id === id)?.title.toLowerCase() ?? id).join(" and ")} on the ${age}-year-old system`); score += 2; }
  else if (major.length) { why.push(`${major.map((id) => SERVICE_MENU.find((t) => t.id === id)?.title.toLowerCase() ?? id).join(" and ")} is a major repair`); score += 1; }
  if (r22) { why.push(major.length || repairSubtotal >= 800 ? "R-22: refrigerant work on a discontinued system" : "R-22 refrigerant is reclaimed stock at today's price"); score += major.length || repairSubtotal >= 800 ? 2 : 1; }
  if (replaceSubtotal && replaceSubtotal > 0 && repairSubtotal > 0) {
    const share = repairSubtotal / replaceSubtotal;
    if (share >= 0.6) { why.push(`the repair is ${Math.round(share * 100)}% of a replacement (${usd(replaceSubtotal)})`); score += 2; }
    else if (share >= 0.4) { why.push(`the repair is ${Math.round(share * 100)}% of a replacement (${usd(replaceSubtotal)})`); score += 1; }
  }
  const verdict: RepairAdvice["verdict"] = score >= 3 ? "replace" : score >= 1 ? "consider" : "repair";
  const line =
    verdict === "replace"
      ? `Repair or replace: ${why.join("; ")} — the replacement is the better money. Quote both and let the customer choose.`
      : verdict === "consider"
        ? `Repair or replace: ${why.join("; ")} — worth putting the replacement quote next to this one.`
        : "";
  return { verdict, why, line, age };
}
