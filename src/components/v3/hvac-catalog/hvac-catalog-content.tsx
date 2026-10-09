"use client";

// THE HVAC EQUIPMENT CATALOG (2026-10-09) — /dashboard/hvac-estimator/catalog.
//
// Owner: "make a better catalog that can already be used in the USA, per state
// code; editable, their own brands and models; by category lists; make smart."
//   · eight categories, each by brand and product line with its size ladder;
//   · the shop's state: every row says whether the state's code lets it be
//     installed (the DOE regional floor, New York's R-410A ban, the California
//     and Washington GWP caps, the ultra-low-NOx districts), and "Set up for
//     Texas" turns off everything the state rules out in one click;
//   · a switch on every row, line and brand — off the pick list, still here;
//   · a cost on every row (priced by tier until then), edit any row, add a
//     unit of the shop's own brand or model, remove one;
//   · the US list, a CSV in or out, as before.
// Reads lib/hvac/catalogView; every write is a server action (actions/hvacCatalog)
// and the estimator reads the same rows, so the pick list follows.

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { addHvacCatalogItem, addMissingUsRows, deleteHvacCatalogItem, getHvacCatalogPage, patchHvacCatalogItem, setHvacCatalogAllOn, setHvacCatalogOff, setHvacCatalogState, setupHvacCatalogForState, type CatalogPage } from "@/actions/hvacCatalog";
import { clearHvacCatalog, importHvacCatalogCsv, loadUsCatalog } from "@/actions/hvacEstimator";
import { CATEGORIES, TIER_LABEL, US_STATES, catalogSummary, categoryOf, groupCatalog, offForState, ratingLine, sizeOf, stateFit, stateName, type FitLevel } from "@/lib/hvac/catalogView";
import { CATALOG_CSV_COLUMNS } from "@/lib/hvac/ledger";
import { useUrlParam } from "@/components/v3/inventory-blueprint/inventory-shared";
import type { CatalogItem, EquipmentKind } from "@/lib/hvac/types";
import styles from "./hvac-catalog.module.css";

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).map((n) => styles[n as string] ?? n).join(" ");
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
type View = "all" | "on" | "off" | "nocost" | "mine";
const VIEWS: Array<[View, string]> = [["all", "All"], ["on", "On the list"], ["off", "Off"], ["nocost", "No cost yet"], ["mine", "Added by you"]];
const COOLING = new Set<EquipmentKind>(["air-conditioner", "heat-pump", "ductless", "package"]);

/** A money field that saves on blur or Enter, only when the number changed; empty clears the cost. */
function CostInput({ value, onSave, label, disabled, id }: { value: number | undefined; onSave: (n: number) => void; label: string; disabled?: boolean; id?: string }) {
  const [text, setText] = useState(value ? String(Math.round(value)) : "");
  const [was, setWas] = useState(value);
  if (was !== value) { setWas(value); setText(value ? String(Math.round(value)) : ""); }
  const commit = () => {
    const raw = text.replace(/[^0-9.]/g, "");
    const n = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(n) || n < 0) { setText(value ? String(Math.round(value)) : ""); return; }
    if (Math.round(n) !== Math.round(value ?? 0)) onSave(Math.round(n));
  };
  return (
    <span className={cx("money")}>
      <span className={cx("money-sign")}>$</span>
      <input id={id} className={cx("in", "in-money")} inputMode="decimal" placeholder="by tier" value={text} aria-label={label} disabled={disabled} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
    </span>
  );
}

function Switch({ on, onChange, label, disabled, small }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; small?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={on ? "On the pick list — click to turn off" : "Off the pick list — click to turn on"} className={cx("switch", on && "switch-on", small && "switch-sm")} disabled={disabled} onClick={() => onChange(!on)}>
      <span className={cx("switch-knob")} />
    </button>
  );
}

function FitBadge({ item, state }: { item: CatalogItem; state: string }) {
  if (!state) return null;
  const f = stateFit(item, state);
  const word: Record<FitLevel, string> = { ok: `OK in ${state}`, confirm: "Confirm", no: `Not in ${state}` };
  return <span className={cx("fit", `fit-${f.level}`)} title={f.text} data-fit={f.level}>{word[f.level]}</span>;
}

// ── the add / edit form ──────────────────────────────────────────────────────
type Draft = Record<string, string>;
const NUM = (v: string | undefined): number | undefined => { const s = (v ?? "").trim(); if (!s) return undefined; const n = Number(s.replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : undefined; };
const LIST = (v: string | undefined): string[] | undefined => { const out = (v ?? "").split(/[|,;/\s]+/).map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x)); return out.length ? out : undefined; };
function draftOf(i?: CatalogItem, kind?: EquipmentKind): Draft {
  const d: Draft = { kind: i?.kind ?? kind ?? "air-conditioner", brand: i?.brand ?? "", model: i?.model ?? "", family: i?.family ?? "", tier: i?.tier ?? "mid", cost: i?.cost ? String(i.cost) : "", shopNote: i?.shopNote ?? "" };
  const n = (k: keyof CatalogItem) => (i && typeof i[k] === "number" ? String(i[k]) : "");
  Object.assign(d, { tons: n("tons"), seer2: n("seer2"), eer2: n("eer2"), hspf2: n("hspf2"), kbtu: i?.btuInput ? String(Math.round(i.btuInput / 1000)) : "", afue: i?.afue ? String(Math.round(i.afue * 1000) / 10) : "", maxTons: n("maxTons"), mcaAmps: n("mcaAmps"), gallons: n("gallons"), uef: n("uef"), firstHourGal: n("firstHourGal"),
    refrigerant: i?.refrigerant ?? "", staging: i?.staging ?? "", coldClimate: i?.coldClimate ? "1" : "", nox: i?.noxNgJ !== undefined ? (i.noxNgJ <= 14 ? "14" : "40") : "40", heatKind: i?.heatKind ?? "gas", whType: i?.whType ?? "tank", fuel: i?.fuel ?? "gas", vent: i?.vent ?? "", states: i?.states?.join("|") ?? "", notStates: i?.notStates?.join("|") ?? "" });
  return d;
}
/** The row the form describes (ids and source are the server's). */
function itemOf(d: Draft): Omit<CatalogItem, "id" | "source"> {
  const kind = d.kind as EquipmentKind;
  const tons = NUM(d.tons), kbtu = NUM(d.kbtu), afue = NUM(d.afue);
  const cooling = COOLING.has(kind);
  const gas = kind === "furnace" || (kind === "package" && d.heatKind === "gas");
  return {
    kind, brand: d.brand.trim(), model: d.model.trim(), family: d.family.trim() || undefined, tier: (d.tier || "mid") as CatalogItem["tier"], cost: NUM(d.cost), shopNote: d.shopNote.trim() || undefined,
    tons: kind === "furnace" || kind === "water-heater" ? undefined : tons,
    coolingBtuh: cooling && tons ? Math.round(tons * 12000) : undefined,
    btuInput: (kind === "furnace" || gas || kind === "water-heater") && kbtu ? Math.round(kbtu * 1000) : undefined,
    afue: (kind === "furnace" || gas) && afue ? (afue > 1 ? afue / 100 : afue) : undefined,
    seer2: cooling ? NUM(d.seer2) : undefined, eer2: cooling ? NUM(d.eer2) : undefined, hspf2: kind === "heat-pump" || kind === "ductless" || (kind === "package" && d.heatKind === "heat-pump") ? NUM(d.hspf2) : undefined,
    refrigerant: cooling || kind === "coil" ? ((d.refrigerant || undefined) as CatalogItem["refrigerant"]) : undefined,
    staging: cooling || kind === "furnace" ? ((d.staging || undefined) as CatalogItem["staging"]) : undefined,
    coldClimate: kind === "heat-pump" || kind === "ductless" ? d.coldClimate === "1" || undefined : undefined,
    mcaAmps: cooling ? NUM(d.mcaAmps) : undefined,
    maxTons: kind === "furnace" || kind === "air-handler" ? NUM(d.maxTons) : undefined,
    noxNgJ: gas ? (d.nox === "14" ? 14 : 40) : undefined,
    heatKind: kind === "package" ? ((d.heatKind || "gas") as CatalogItem["heatKind"]) : undefined,
    gallons: kind === "water-heater" && d.whType !== "tankless" ? NUM(d.gallons) : undefined,
    whType: kind === "water-heater" ? ((d.whType || "tank") as CatalogItem["whType"]) : undefined,
    fuel: kind === "water-heater" ? ((d.fuel || "gas") as CatalogItem["fuel"]) : undefined,
    uef: kind === "water-heater" ? NUM(d.uef) : undefined, firstHourGal: kind === "water-heater" ? NUM(d.firstHourGal) : undefined,
    vent: kind === "water-heater" ? ((d.vent || undefined) as CatalogItem["vent"]) : undefined,
    states: LIST(d.states), notStates: LIST(d.notStates),
  };
}

function F({ id, label, children, wide }: { id: string; label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={cx("fld", wide && "wide")} htmlFor={id}><span className={cx("lbl")}>{label}</span>{children}</label>;
}

function ItemForm({ initial, kind, brands, pending, onCancel, onSave, isNew }: { initial?: CatalogItem; kind: EquipmentKind; brands: string[]; pending: boolean; onCancel: () => void; onSave: (item: Omit<CatalogItem, "id" | "source">) => void; isNew?: boolean }) {
  const [d, setD] = useState<Draft>(() => draftOf(initial, kind));
  const k = d.kind as EquipmentKind;
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD((p) => ({ ...p, [key]: e.target.value }));
  const cooling = COOLING.has(k);
  const gas = k === "furnace" || (k === "package" && d.heatKind === "gas");
  const canSave = d.brand.trim() && d.model.trim();
  return (
    <form className={cx("frm", "frm-edit")} data-catalog-form={isNew ? "new" : initial?.id} onSubmit={(e) => { e.preventDefault(); if (canSave) onSave(itemOf(d)); }}>
      {isNew && <F id="cf-kind" label="Category"><select id="cf-kind" className={cx("sel")} value={d.kind} onChange={set("kind")}>{CATEGORIES.map((c) => <option key={c.kind} value={c.kind}>{c.label}</option>)}</select></F>}
      <F id="cf-brand" label="Brand"><input id="cf-brand" className={cx("in")} list="cf-brands" value={d.brand} onChange={set("brand")} placeholder="Goodman, Carrier — or your own" required /><datalist id="cf-brands">{brands.map((b) => <option key={b} value={b} />)}</datalist></F>
      <F id="cf-model" label="Model"><input id="cf-model" className={cx("in")} value={d.model} onChange={set("model")} placeholder={k === "furnace" ? "GR9S960803BN" : "GLXS4BA3610"} required /></F>
      <F id="cf-family" label="Product line (optional)"><input id="cf-family" className={cx("in")} value={d.family} onChange={set("family")} placeholder="XR14, GLXS4B — groups the sizes" /></F>
      <F id="cf-tier" label="Tier on the pick list"><select id="cf-tier" className={cx("sel")} value={d.tier} onChange={set("tier")}><option value="value">Good</option><option value="mid">Better</option><option value="premium">Best</option></select></F>
      {cooling && <F id="cf-tons" label="Tons"><input id="cf-tons" className={cx("in")} inputMode="decimal" value={d.tons} onChange={set("tons")} placeholder="3" /></F>}
      {(k === "air-handler" || k === "coil") && <F id="cf-tons2" label="Coil tons"><input id="cf-tons2" className={cx("in")} inputMode="decimal" value={d.tons} onChange={set("tons")} placeholder="3" /></F>}
      {k === "air-handler" && <F id="cf-max" label="Largest coil the blower carries (tons)"><input id="cf-max" className={cx("in")} inputMode="decimal" value={d.maxTons} onChange={set("maxTons")} placeholder="4" /></F>}
      {cooling && <F id="cf-seer2" label="SEER2"><input id="cf-seer2" className={cx("in")} inputMode="decimal" value={d.seer2} onChange={set("seer2")} placeholder="15.2" /></F>}
      {cooling && <F id="cf-eer2" label="EER2 (the Southwest reads it)"><input id="cf-eer2" className={cx("in")} inputMode="decimal" value={d.eer2} onChange={set("eer2")} placeholder="12" /></F>}
      {(k === "heat-pump" || k === "ductless" || (k === "package" && d.heatKind === "heat-pump")) && <F id="cf-hspf2" label="HSPF2"><input id="cf-hspf2" className={cx("in")} inputMode="decimal" value={d.hspf2} onChange={set("hspf2")} placeholder="7.8" /></F>}
      {(cooling || k === "coil") && <F id="cf-refr" label="Refrigerant"><select id="cf-refr" className={cx("sel")} value={d.refrigerant} onChange={set("refrigerant")}><option value="">—</option><option>R-454B</option><option>R-32</option><option>R-410A</option><option>R-22</option><option value="other">other</option></select></F>}
      {(cooling || k === "furnace") && <F id="cf-stag" label="Staging"><select id="cf-stag" className={cx("sel")} value={d.staging} onChange={set("staging")}><option value="">—</option><option value="single">single</option><option value="two-stage">two-stage</option><option value="variable">variable</option></select></F>}
      {(k === "heat-pump" || k === "ductless") && <label className={cx("chk", "fld")} htmlFor="cf-cold"><input id="cf-cold" type="checkbox" checked={d.coldClimate === "1"} onChange={(e) => setD((p) => ({ ...p, coldClimate: e.target.checked ? "1" : "" }))} /><span>Cold-climate rated</span></label>}
      {k === "package" && <F id="cf-heat" label="Heat"><select id="cf-heat" className={cx("sel")} value={d.heatKind} onChange={set("heatKind")}><option value="gas">gas</option><option value="electric">electric</option><option value="heat-pump">heat pump</option></select></F>}
      {(k === "furnace" || gas) && <F id="cf-kbtu" label="Gas input (kBTU)"><input id="cf-kbtu" className={cx("in")} inputMode="decimal" value={d.kbtu} onChange={set("kbtu")} placeholder="80" /></F>}
      {(k === "furnace" || gas) && <F id="cf-afue" label="AFUE %"><input id="cf-afue" className={cx("in")} inputMode="decimal" value={d.afue} onChange={set("afue")} placeholder="96" /></F>}
      {(k === "furnace" || gas) && <F id="cf-nox" label="NOx class (California reads it)"><select id="cf-nox" className={cx("sel")} value={d.nox} onChange={set("nox")}><option value="40">40 ng/J — standard</option><option value="14">14 ng/J — ultra-low NOx</option></select></F>}
      {k === "furnace" && <F id="cf-max2" label="Largest coil the blower carries (tons)"><input id="cf-max2" className={cx("in")} inputMode="decimal" value={d.maxTons} onChange={set("maxTons")} placeholder="auto from the input" /></F>}
      {k === "water-heater" && <F id="cf-wh" label="Type"><select id="cf-wh" className={cx("sel")} value={d.whType} onChange={set("whType")}><option value="tank">tank</option><option value="heat-pump">heat-pump tank</option><option value="tankless">tankless</option></select></F>}
      {k === "water-heater" && <F id="cf-fuel" label="Fuel"><select id="cf-fuel" className={cx("sel")} value={d.fuel} onChange={set("fuel")}><option value="gas">gas</option><option value="electric">electric</option><option value="propane">propane</option></select></F>}
      {k === "water-heater" && d.whType !== "tankless" && <F id="cf-gal" label="Gallons"><input id="cf-gal" className={cx("in")} inputMode="decimal" value={d.gallons} onChange={set("gallons")} placeholder="50" /></F>}
      {k === "water-heater" && <F id="cf-uef" label="UEF"><input id="cf-uef" className={cx("in")} inputMode="decimal" value={d.uef} onChange={set("uef")} placeholder="0.93" /></F>}
      {k === "water-heater" && <F id="cf-fhr" label="First-hour gallons"><input id="cf-fhr" className={cx("in")} inputMode="decimal" value={d.firstHourGal} onChange={set("firstHourGal")} /></F>}
      {k === "water-heater" && <F id="cf-vent" label="Vent"><select id="cf-vent" className={cx("sel")} value={d.vent} onChange={set("vent")}><option value="">—</option><option value="atmospheric">atmospheric</option><option value="power">power</option><option value="direct">direct</option><option value="none">none</option></select></F>}
      {k === "water-heater" && d.fuel !== "electric" && <F id="cf-whin" label="Gas input (kBTU)"><input id="cf-whin" className={cx("in")} inputMode="decimal" value={d.kbtu} onChange={set("kbtu")} placeholder="40" /></F>}
      {cooling && <F id="cf-mca" label="MCA (amps, optional)"><input id="cf-mca" className={cx("in")} inputMode="decimal" value={d.mcaAmps} onChange={set("mcaAmps")} /></F>}
      <F id="cf-cost" label="Your cost ($)"><input id="cf-cost" className={cx("in")} inputMode="decimal" value={d.cost} onChange={set("cost")} placeholder="priced by tier until you type it" /></F>
      <F id="cf-states" label="Sold only in (states, optional)"><input id="cf-states" className={cx("in")} value={d.states} onChange={set("states")} placeholder="CA|NV" /></F>
      <F id="cf-not" label="Not sold in (states, optional)"><input id="cf-not" className={cx("in")} value={d.notStates} onChange={set("notStates")} placeholder="NY" /></F>
      <F id="cf-note" label="Your note" wide><input id="cf-note" className={cx("in")} value={d.shopNote} onChange={set("shopNote")} placeholder="our volume box · ask Johnstone for the exact suffix" /></F>
      <div className={cx("wide", "acts")}>
        <button type="submit" className={cx("btn", "btn-primary", "btn--sm")} disabled={pending || !canSave}>{pending ? "Saving…" : isNew ? "Add to the catalog" : "Save"}</button>
        <button type="button" className={cx("btn", "btn-ghost", "btn--sm")} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ── the page ─────────────────────────────────────────────────────────────────
export function HvacCatalogContent({ initial }: { initial: CatalogPage }) {
  const [data, setData] = useState<CatalogPage>(initial);
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [urlKind, setUrlKind] = useUrlParam("kind");
  const kind: EquipmentKind = CATEGORIES.some((c) => c.kind === urlKind) ? (urlKind as EquipmentKind) : "air-conditioner";
  const [view, setView] = useState<View>("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [sure, setSure] = useState<string | null>(null);
  const [replaceCat, setReplaceCat] = useState(true);
  const [stateDraft, setStateDraft] = useState(initial.state);
  const fileRef = useRef<HTMLInputElement>(null);
  const items = data.items;
  const state = data.state;

  const summary = useMemo(() => catalogSummary(items), [items]);
  const fit = useMemo(() => {
    if (!state) return null;
    let no = 0, confirm = 0;
    for (const i of items) { if (i.offList) continue; const l = stateFit(i, state).level; if (l === "no") no++; else if (l === "confirm") confirm++; }
    return { no, confirm, toTurnOff: offForState(items, state).length };
  }, [items, state]);
  const brandNames = useMemo(() => Array.from(new Set(items.map((i) => i.brand.trim()))).sort(), [items]);
  const needle = q.trim().toLowerCase();
  const listed = (i: CatalogItem) => {
    if (needle && !`${i.brand} ${i.model} ${i.family ?? ""} ${i.shopNote ?? ""}`.toLowerCase().includes(needle)) return false;
    if (view === "on") return !i.offList;
    if (view === "off") return !!i.offList;
    if (view === "nocost") return !i.cost && !i.offList;
    if (view === "mine") return i.source === "shop";
    return true;
  };
  const groups = useMemo(() => groupCatalog(items.filter(listed), kind), [items, kind, needle, view]); // eslint-disable-line react-hooks/exhaustive-deps
  const cat = categoryOf(kind);
  const inKind = summary.byKind[kind];

  // ── writes ──
  const fail = (text: string) => setNote({ tone: "err", text });
  const okNote = (text: string) => setNote({ tone: "ok", text });
  const withItems = (items: CatalogItem[], own = true) => setData((d) => ({ ...d, items, own, source: own ? "shop" : d.source, missingUs: 0 }));
  const refresh = async () => setData(await getHvacCatalogPage());
  const materializedNote = (m: boolean) => (m ? " The US list is now your own catalog — every row is yours to edit." : "");

  const toggle = (ids: string[], off: boolean, what: string) => {
    // Shown at once; the server's list replaces it.
    setData((d) => ({ ...d, items: d.items.map((i) => (ids.includes(i.id) ? (off ? { ...i, offList: true } : { ...i, offList: undefined }) : i)) }));
    start(async () => {
      const r = await setHvacCatalogOff({ itemIds: ids, off });
      if (!r.ok) { fail(r.error); await refresh(); return; }
      withItems(r.items);
      okNote(`${what} ${off ? "off the pick list" : "back on the pick list"}${r.changed === 1 ? "" : ` · ${r.changed} rows`}.`);
    });
  };
  const saveCost = (item: CatalogItem, cost: number) => start(async () => {
    const r = await patchHvacCatalogItem({ itemId: item.id, patch: { cost } });
    if (!r.ok) { fail(r.error); return; }
    setData((d) => ({ ...d, own: true, source: "shop", items: d.items.map((i) => (i.id === item.id ? r.item : i)) }));
    okNote(cost ? `${item.brand} ${item.model}: your cost is ${usd(cost)} — the estimate prices from it now.${materializedNote(r.materialized)}` : `${item.brand} ${item.model}: cost cleared — priced by tier again.`);
  });
  const saveEdit = (item: CatalogItem, patch: Omit<CatalogItem, "id" | "source">) => start(async () => {
    const r = await patchHvacCatalogItem({ itemId: item.id, patch });
    if (!r.ok) { fail(r.error); return; }
    setData((d) => ({ ...d, own: true, source: "shop", items: d.items.map((i) => (i.id === item.id ? r.item : i)) }));
    setEditing(null);
    okNote(`${r.item.brand} ${r.item.model} saved.${materializedNote(r.materialized)}`);
  });
  const add = (draft: Omit<CatalogItem, "id" | "source">) => start(async () => {
    const r = await addHvacCatalogItem(draft);
    if (!r.ok) { fail(r.error); return; }
    setData((d) => ({ ...d, own: true, source: "shop", items: [...d.items.filter((i) => i.id !== r.item.id), r.item] }));
    setAdding(false);
    setUrlKind(r.item.kind);
    okNote(`${r.item.brand} ${r.item.model} is in the catalog — on the pick list for ${categoryOf(r.item.kind).label.toLowerCase()}.${materializedNote(r.materialized)}`);
  });
  const remove = (item: CatalogItem) => start(async () => {
    const r = await deleteHvacCatalogItem({ itemId: item.id });
    if (!r.ok) { fail(r.error); return; }
    setData((d) => ({ ...d, own: true, source: "shop", items: d.items.filter((i) => i.id !== item.id) }));
    setSure(null);
    okNote(`${item.brand} ${item.model} removed.${materializedNote(r.materialized)}`);
  });
  const pickState = (st: string) => { setStateDraft(st); start(async () => { const r = await setHvacCatalogState({ state: st }); if (!r.ok) { fail(r.error); return; } setData((d) => ({ ...d, state: r.state })); }); };
  const setup = () => start(async () => {
    const r = await setupHvacCatalogForState({ state: stateDraft });
    if (!r.ok) { fail(r.error); return; }
    setData((d) => ({ ...d, items: r.items, own: true, source: "shop", state: r.state, missingUs: 0 }));
    okNote(r.turnedOff ? `Set up for ${stateName(r.state)}: ${r.turnedOff} row${r.turnedOff === 1 ? "" : "s"} the state's code rules out ${r.turnedOff === 1 ? "is" : "are"} off the pick list — ${r.examples.join(", ")}${r.turnedOff > r.examples.length ? "…" : ""}. The rows to confirm stay on; the badge says why.` : `Set up for ${stateName(r.state)}: nothing on the list is ruled out there.`);
  });
  const allOn = () => start(async () => { const r = await setHvacCatalogAllOn(); if (!r.ok) { fail(r.error); return; } withItems(r.items); okNote(`${r.changed} row${r.changed === 1 ? "" : "s"} back on the pick list.`); });
  const loadUs = () => start(async () => {
    const r = await loadUsCatalog({ replace: replaceCat });
    if (!r.ok) { fail(r.error); return; }
    await refresh();
    okNote(`${r.imported} rows of the US list loaded (ratings as published ${r.verifiedOn}). Add your costs to price from them.`);
  });
  const updateUs = () => start(async () => { const r = await addMissingUsRows(); if (!r.ok) { fail(r.error); return; } withItems(r.items); okNote(`${r.added} row${r.added === 1 ? "" : "s"} added from the current US list — your rows, costs and switches untouched.`); });
  const importCsv = (f: File | undefined) => { if (!f) return; start(async () => {
    const csv = await f.text();
    const r = await importHvacCatalogCsv({ csv, replace: replaceCat });
    if (!r.ok) { fail(r.error); return; }
    await refresh();
    okNote(`${r.imported} rows imported${r.note ? ` · ${r.note}` : ""}${r.errors.length ? ` · ${r.errors.length} rows skipped: ${r.errors[0]}` : ""}.`);
    if (fileRef.current) fileRef.current.value = "";
  }); };
  const clear = () => start(async () => { const r = await clearHvacCatalog(); if (!r.ok) { fail(r.error); return; } setSure(null); await refresh(); okNote("Your catalog is cleared — the estimator is back on the built-in US list."); });
  const download = () => {
    const esc = (v: unknown) => { const s = v === undefined || v === null ? "" : Array.isArray(v) ? v.join("|") : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = items.map((c) => CATALOG_CSV_COLUMNS.map((k) => esc(k === "afue" && c.afue ? Math.round(c.afue * 1000) / 10 : (c as unknown as Record<string, unknown>)[k])).join(","));
    const blob = new Blob([[CATALOG_CSV_COLUMNS.join(","), ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `hvac-catalog-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  const nothing = groups.length === 0;
  return (
    <>
      <div className={cx("page-head")}>
        <div>
          <div className={cx("kicker")}>Automation · HVAC estimator</div>
          <h1 className={cx("page-title")}>Equipment catalog</h1>
        </div>
        <div className={cx("page-actions")}>
          <Link className={cx("btn", "btn-primary")} href={"/dashboard/hvac-estimator" as Route}>Price a system</Link>
          <Link className={cx("btn", "btn-ghost")} href={"/dashboard/hvac-services" as Route}>Service menu</Link>
        </div>
      </div>

      <div className={cx("kpis")} data-catalog-kpis>
        <div className={cx("kpi")}><div className={cx("kpi-lbl")}>On the pick list</div><div className={cx("kpi-val")} data-kpi="on">{summary.on}</div><div className={cx("kpi-sub")}>of {summary.total} rows · {summary.off} off</div></div>
        <div className={cx("kpi")}><div className={cx("kpi-lbl")}>With your cost</div><div className={cx("kpi-val")} data-kpi="costed">{summary.costed}</div><div className={cx("kpi-sub")}>{summary.costed ? "the rest priced by tier" : "all priced by tier — type a cost on any row"}</div></div>
        <div className={cx("kpi")}><div className={cx("kpi-lbl")}>Brands</div><div className={cx("kpi-val")} data-kpi="brands">{summary.brands}</div><div className={cx("kpi-sub")}>{summary.own ? `${summary.own} row${summary.own === 1 ? "" : "s"} added by you` : data.own ? "your copy of the US list" : `the built-in US list · ratings as of ${data.verifiedOn}`}</div></div>
        <div className={cx("kpi")}><div className={cx("kpi-lbl")}>Code check</div><div className={cx("kpi-val", "kpi-val--sm")} data-kpi="state">{state ? stateName(state) : "—"}</div><div className={cx("kpi-sub")}>{fit ? `${fit.no} ruled out still on · ${fit.confirm} to confirm` : "pick your state below"}</div></div>
      </div>

      <div className={cx("stack")}>
        <section className={cx("card", "tools")} data-catalog-tools>
          <div className={cx("statebar")}>
            <label className={cx("fld", "fld-state")} htmlFor="cat-state">
              <span className={cx("lbl")}>Your state</span>
              <select id="cat-state" className={cx("sel")} value={stateDraft} onChange={(e) => pickState(e.target.value)} disabled={pending}>
                <option value="">Pick a state</option>
                {US_STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select>
            </label>
            <div className={cx("statebar-txt")}>
              {state ? (
                fit && fit.toTurnOff
                  ? <>In {stateName(state)} the code rules out <b>{fit.toTurnOff}</b> row{fit.toTurnOff === 1 ? "" : "s"} still on the list — the DOE regional floor, the refrigerant rules, a row&rsquo;s own sold-in states. One click turns them off; nothing else moves.</>
                  : <>Every row on the list can be installed in {stateName(state)}{fit?.confirm ? <> — <b>{fit.confirm}</b> carry a question to settle on the job (the badge says what)</> : null}.</>
              ) : <>Pick your state and every row says whether its code lets the unit be installed there — then set the whole list up in one click.</>}
            </div>
            <button type="button" className={cx("btn", "btn-primary", "btn--sm")} data-setup onClick={setup} disabled={pending || !stateDraft || !fit?.toTurnOff}>{stateDraft ? `Set up for ${stateDraft}` : "Set up for your state"}</button>
            {summary.off > 0 && <button type="button" className={cx("link")} onClick={allOn} disabled={pending}>Everything back on</button>}
          </div>
          <div className={cx("tools-row")}>
            <label className="search">
              <svg className="ic" aria-hidden="true"><use href="#i-search" /></svg>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a brand, model or line" aria-label="Find a unit" />
            </label>
            <div className={cx("views")} role="group" aria-label="Show" data-catalog-views>
              {VIEWS.map(([id, label]) => {
                const n = id === "all" ? inKind.total : id === "on" ? inKind.on : id === "off" ? inKind.total - inKind.on : id === "nocost" ? items.filter((i) => i.kind === kind && !i.cost && !i.offList).length : items.filter((i) => i.kind === kind && i.source === "shop").length;
                return <button key={id} type="button" className={cx("view", view === id && "on")} aria-pressed={view === id} onClick={() => setView(id)}>{label}<span className={cx("view-n")}>{n}</span></button>;
              })}
            </div>
          </div>
          <div className={cx("acts", "acts-cat")}>
            <button type="button" className={cx("btn", "btn-primary", "btn--sm")} data-add onClick={() => { setAdding(true); setEditing(null); }} disabled={pending}>Add a unit</button>
            {!data.own && <button type="button" className={cx("btn", "btn-ghost", "btn--sm")} onClick={loadUs} disabled={pending}>Make the US list mine</button>}
            {data.own && data.missingUs > 0 && <button type="button" className={cx("btn", "btn-ghost", "btn--sm")} onClick={updateUs} disabled={pending}>Add {data.missingUs} new US rows</button>}
            <label className={cx("btn", "btn-ghost", "btn--sm")} htmlFor="cat-csv">Import CSV<input id="cat-csv" ref={fileRef} type="file" accept=".csv,text/csv" className={cx("file-in")} onChange={(e) => importCsv(e.target.files?.[0])} /></label>
            <label className={cx("chk")} htmlFor="cat-replace"><input id="cat-replace" type="checkbox" checked={replaceCat} onChange={(e) => setReplaceCat(e.target.checked)} /><span>Replace on import</span></label>
            <button type="button" className={cx("btn", "btn-ghost", "btn--sm")} onClick={download}>Download CSV</button>
            {data.own && (sure === "clear"
              ? <span className={cx("sure")}>Clear every row and go back to the US list? <button type="button" className={cx("link", "link-danger")} onClick={clear} disabled={pending}>Yes, clear</button> <button type="button" className={cx("link")} onClick={() => setSure(null)}>No</button></span>
              : <button type="button" className={cx("link", "link-danger")} onClick={() => setSure("clear")} disabled={pending}>Clear the catalog</button>)}
          </div>
          {note && (
            <div className={cx("note", note.tone === "err" ? "note-err" : "note-ok")} role={note.tone === "err" ? "alert" : "status"} data-catalog-note>
              {note.text}
              <button type="button" className={cx("note-x")} aria-label="Dismiss" onClick={() => setNote(null)}>×</button>
            </div>
          )}
        </section>

        <nav className={cx("cats")} aria-label="Categories" data-catalog-cats>
          {CATEGORIES.map((c) => {
            const k = summary.byKind[c.kind];
            return <button key={c.kind} type="button" className={cx("cat", kind === c.kind && "on")} aria-pressed={kind === c.kind} data-cat={c.kind} onClick={() => { setUrlKind(c.kind); setEditing(null); setAdding(false); }}>{c.label}<span className={cx("cat-n")}>{k.on}{k.on !== k.total ? `/${k.total}` : ""}</span></button>;
          })}
        </nav>

        {adding && (
          <section className={cx("card")} data-catalog-add>
            <div className={cx("card-h")}><div className={cx("card-t")}>Add a unit you sell</div><div className={cx("card-s")}>your brand or model · goes on the pick list at once</div></div>
            <ItemForm isNew kind={kind} brands={brandNames} pending={pending} onCancel={() => setAdding(false)} onSave={add} />
          </section>
        )}

        <p className={cx("hint")}><b>{cat.label}</b> — {cat.blurb} {inKind.on} of {inKind.total} on the pick list{inKind.costed ? ` · ${inKind.costed} with your cost` : ""}. A row with no cost is priced from the rate card at its tier.</p>

        {nothing && (
          <section className={cx("card")} data-catalog-none>
            <div className={cx("none")}>
              <span>{needle ? `No ${cat.label.toLowerCase()} match "${q.trim()}"` : view === "mine" ? `No ${cat.label.toLowerCase()} added by you yet` : view === "off" ? `Nothing turned off among the ${cat.label.toLowerCase()}` : view === "nocost" ? `Every ${cat.one} on the list has your cost` : `No ${cat.label.toLowerCase()} in the catalog`}</span>
              <span className={cx("acts")}>
                <button type="button" className={cx("btn", "btn-ghost", "btn--sm")} onClick={() => { setQ(""); setView("all"); }}>Show all</button>
                <button type="button" className={cx("btn", "btn-primary", "btn--sm")} onClick={() => setAdding(true)}>Add a {cat.one}</button>
              </span>
            </div>
          </section>
        )}

        {groups.map((b) => {
          const ids = b.families.flatMap((f) => f.rows.map((r) => r.id));
          const brandOn = b.on > 0;
          return (
            <section key={b.brand} className={cx("card", "brand")} data-catalog-brand={b.brand}>
              <div className={cx("card-h", "brand-h")}>
                <div>
                  <div className={cx("card-t")}>{b.brand}</div>
                  <div className={cx("card-s")}>{b.families.length} line{b.families.length === 1 ? "" : "s"} · {b.on} of {b.total} on the list{b.costed ? ` · ${b.costed} with your cost` : ""}</div>
                </div>
                <label className={cx("brand-sw")}><span className={cx("lbl")}>We sell {b.brand}</span><Switch on={brandOn} label={`${b.brand}: ${brandOn ? "on" : "off"} the pick list`} disabled={pending} onChange={(on) => toggle(ids, !on, `${b.brand} ${cat.label.toLowerCase()}`)} /></label>
              </div>
              <div className={cx("tbl-wrap")}>
                <table className={cx("tbl", "tbl-edit")}>
                  <thead><tr><th>Model</th><th>Size</th><th>Code</th><th>Your cost</th><th>On list</th><th aria-label="Actions"></th></tr></thead>
                  <tbody>
                    {b.families.map((f) => {
                      const first = f.rows[0];
                      const famFit = state ? stateFit(first, state) : null;
                      const famOn = f.on > 0;
                      return [
                        <tr key={`fam-${f.key}`} className={cx("fam")} data-catalog-family={f.key}>
                          <td data-l="" colSpan={3}>
                            <span className={cx("fam-name")}>{f.name}</span>
                            {f.tier && <span className={cx("plate", f.tier === "premium" ? "plate--sent" : f.tier === "value" ? "plate--expired" : "plate--active", "tag")}>{TIER_LABEL[f.tier]}</span>}
                            <span className={cx("sub")}>{ratingLine(first)}{famFit && famFit.level !== "ok" ? <> · <span className={cx(`fit-txt-${famFit.level}`)}>{famFit.text}</span></> : null}</span>
                          </td>
                          <td data-l="" className={cx("fam-n")}><span className={cx("mono")}>{f.rows.length} size{f.rows.length === 1 ? "" : "s"}{f.costed ? ` · ${f.costed} costed` : ""}</span></td>
                          <td data-l=""><Switch small on={famOn} label={`${f.name}: ${famOn ? "on" : "off"}`} disabled={pending} onChange={(on) => toggle(f.rows.map((r) => r.id), !on, `${b.brand} ${f.name}`)} /></td>
                          <td data-l="" className={cx("row-acts")}></td>
                        </tr>,
                        ...f.rows.flatMap((r) => {
                          const rows = [
                            <tr key={r.id} data-catalog-row={r.id} data-off={r.offList ? "true" : "false"} className={cx(r.offList && "row-off")}>
                              <td data-l="Model">
                                <span className={cx("who")}>{r.model}{r.source === "shop" && <span className={cx("plate", "plate--sent", "tag")}>yours</span>}</span>
                                {r.shopNote && <span className={cx("sub")}>{r.shopNote}</span>}
                                {r.availabilityNote && <span className={cx("sub")}>{r.availabilityNote}</span>}
                              </td>
                              <td data-l="Size"><span className={cx("mono")}>{sizeOf(r).label}</span></td>
                              <td data-l="Code"><FitBadge item={r} state={state} /></td>
                              <td data-l="Your cost"><CostInput id={`cost-${r.id}`} value={r.cost} label={`Your cost for ${r.brand} ${r.model}`} disabled={pending} onSave={(n) => saveCost(r, n)} /></td>
                              <td data-l="On list"><Switch small on={!r.offList} label={`${r.brand} ${r.model}: ${r.offList ? "off" : "on"} the pick list`} disabled={pending} onChange={(on) => toggle([r.id], !on, `${r.brand} ${r.model}`)} /></td>
                              <td data-l="" className={cx("row-acts")}>
                                {sure === r.id
                                  ? <span className={cx("sure")}>Remove? <button type="button" className={cx("link", "link-danger")} onClick={() => remove(r)} disabled={pending}>Yes</button> <button type="button" className={cx("link")} onClick={() => setSure(null)}>No</button></span>
                                  : <><button type="button" className={cx("link")} onClick={() => { setEditing(editing === r.id ? null : r.id); setAdding(false); }} disabled={pending}>{editing === r.id ? "Close" : "Edit"}</button><button type="button" className={cx("link", "link-danger")} onClick={() => setSure(r.id)} disabled={pending}>Remove</button></>}
                              </td>
                            </tr>,
                          ];
                          if (editing === r.id) rows.push(<tr key={`${r.id}-edit`} className={cx("edit-row")}><td colSpan={6} data-l=""><ItemForm initial={r} kind={r.kind} brands={brandNames} pending={pending} onCancel={() => setEditing(null)} onSave={(p) => saveEdit(r, p)} /></td></tr>);
                          return rows;
                        }),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
