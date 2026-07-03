"use client";
// The contractor's editable rate card AND custom catalog. Every number the estimate
// is built from — each material's price per linear foot, each gate/door's price per
// unit, demolition — edits LIVE as you type (no Enter needed) and persists with the
// studio. You can also create your own materials (name + colour + $/ft) and gates /
// doors (name + width + $/ea); new entries show up here and in the pickers.
import * as React from "react";
import { ChevronDown, RotateCcw, SlidersHorizontal, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFenceStudioStore } from "@/stores/useFenceStudioStore";
import {
  FENCE_MATERIALS,
  MATERIAL_LABEL,
  MATERIAL_SWATCH,
  GATE_VARIANTS,
  DOOR_VARIANTS,
  VARIANT_LABEL,
  type OpeningKind,
} from "./fenceTypes";

export function FencePriceSheet() {
  const [open, setOpen] = React.useState(false);
  const [nonce, setNonce] = React.useState(0); // bump to remount inputs on reset
  const pricing = useFenceStudioStore((s) => s.pricing);
  const customMaterials = useFenceStudioStore((s) => s.customMaterials);
  const customOpenings = useFenceStudioStore((s) => s.customOpenings);
  const setMaterialPrice = useFenceStudioStore((s) => s.setMaterialPrice);
  const setOpeningPrice = useFenceStudioStore((s) => s.setOpeningPrice);
  const setDemolitionPrice = useFenceStudioStore((s) => s.setDemolitionPrice);
  const resetPricing = useFenceStudioStore((s) => s.resetPricing);
  const addMaterial = useFenceStudioStore((s) => s.addMaterial);
  const removeMaterial = useFenceStudioStore((s) => s.removeMaterial);
  const addOpeningType = useFenceStudioStore((s) => s.addOpeningType);
  const removeOpeningType = useFenceStudioStore((s) => s.removeOpeningType);

  const gateCustom = customOpenings.filter((o) => o.kind === "gate");
  const doorCustom = customOpenings.filter((o) => o.kind === "door");

  return (
    <div className="rounded-[var(--r-lg)] bg-[color:var(--paper)] hairline shadow-[var(--shadow-sm)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <SlidersHorizontal className="h-4 w-4 text-[color:var(--ink-muted)]" />
        <span className="flex-1">
          <span className="block text-[13px] font-medium text-[color:var(--ink)]">Your pricing</span>
          <span className="block text-[11px] text-[color:var(--ink-muted)]">
            Live rates &amp; your own materials, gates, doors
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-[color:var(--ink-muted)] transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-[color:var(--ink-line)] px-4 py-3 space-y-5">
          {/* Materials */}
          <Group label="Material · per linear foot">
            {FENCE_MATERIALS.map((m) => (
              <Row key={m} swatch={MATERIAL_SWATCH[m]} label={MATERIAL_LABEL[m]}>
                <PriceInput key={`${m}-${nonce}`} value={pricing.materialPerFt[m] ?? 0} suffix="/ft" onCommit={(v) => setMaterialPrice(m, v)} />
              </Row>
            ))}
            {customMaterials.map((m) => (
              <Row key={m.id} swatch={m.color} label={m.name} onRemove={() => removeMaterial(m.id)}>
                <PriceInput key={`${m.id}-${nonce}`} value={pricing.materialPerFt[m.id] ?? 0} suffix="/ft" onCommit={(v) => setMaterialPrice(m.id, v)} />
              </Row>
            ))}
            <NewMaterial onAdd={addMaterial} />
          </Group>

          {/* Gates */}
          <Group label="Gates · per unit">
            {GATE_VARIANTS.map((v) => (
              <Row key={v} label={`${VARIANT_LABEL[v]} gate`}>
                <PriceInput key={`gate-${v}-${nonce}`} value={pricing.openingPrice.gate?.[v] ?? 0} suffix="/ea" onCommit={(n) => setOpeningPrice("gate", v, n)} />
              </Row>
            ))}
            {gateCustom.map((o) => (
              <Row key={o.id} label={`${o.name} · ${o.widthFt} ft`} onRemove={() => removeOpeningType(o.id)}>
                <PriceInput key={`gate-${o.id}-${nonce}`} value={pricing.openingPrice.gate?.[o.id] ?? 0} suffix="/ea" onCommit={(n) => setOpeningPrice("gate", o.id, n)} />
              </Row>
            ))}
            <NewOpening kind="gate" onAdd={addOpeningType} />
          </Group>

          {/* Doors */}
          <Group label="Doors · per unit">
            {DOOR_VARIANTS.map((v) => (
              <Row key={v} label={`${VARIANT_LABEL[v]} door`}>
                <PriceInput key={`door-${v}-${nonce}`} value={pricing.openingPrice.door?.[v] ?? 0} suffix="/ea" onCommit={(n) => setOpeningPrice("door", v, n)} />
              </Row>
            ))}
            {doorCustom.map((o) => (
              <Row key={o.id} label={`${o.name} · ${o.widthFt} ft`} onRemove={() => removeOpeningType(o.id)}>
                <PriceInput key={`door-${o.id}-${nonce}`} value={pricing.openingPrice.door?.[o.id] ?? 0} suffix="/ea" onCommit={(n) => setOpeningPrice("door", o.id, n)} />
              </Row>
            ))}
            <NewOpening kind="door" onAdd={addOpeningType} />
          </Group>

          {/* Site */}
          <Group label="Site">
            <Row label="Demolition &amp; haul">
              <PriceInput key={`demo-${nonce}`} value={pricing.demolitionPerFt} suffix="/ft" onCommit={setDemolitionPrice} />
            </Row>
          </Group>

          <button
            type="button"
            onClick={() => {
              resetPricing();
              setNonce((n) => n + 1);
            }}
            className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset built-in rates
          </button>
        </div>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="quiet-caps text-[color:var(--ink-faint)]">{label}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  swatch,
  onRemove,
  children,
}: {
  label: string;
  swatch?: string;
  onRemove?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      {swatch && <span className="h-4 w-4 shrink-0 rounded-[3px] hairline" style={{ background: swatch }} />}
      <span className="flex-1 truncate text-[13px] text-[color:var(--ink-soft)]">{label}</span>
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[color:var(--ink-faint)] hover:bg-black/[0.05] hover:text-[color:var(--rose)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// Live numeric field: pushes to the store on every keystroke (no Enter). Local
// buffer so a partially-typed / cleared value doesn't fight the store; `key` from
// the parent remounts it to show the new value after "Reset built-in rates".
function PriceInput({
  value,
  suffix,
  onCommit,
}: {
  value: number;
  suffix?: string;
  onCommit: (v: number) => void;
}) {
  const [buf, setBuf] = React.useState(String(value));
  return (
    <span className="inline-flex h-8 w-[92px] shrink-0 items-center gap-1 rounded-[var(--r-sm)] bg-white/60 px-2 hairline focus-within:shadow-[0_0_0_3px_rgba(31,122,82,0.18)]">
      <span className="text-[12px] text-[color:var(--ink-faint)]">$</span>
      <input
        value={buf}
        inputMode="decimal"
        onChange={(e) => {
          const raw = e.target.value;
          setBuf(raw);
          const n = parseFloat(raw);
          if (Number.isFinite(n)) onCommit(n);
        }}
        className="min-w-0 flex-1 bg-transparent text-[13px] tabular-nums text-[color:var(--ink)] outline-none"
      />
      {suffix && <span className="text-[11px] text-[color:var(--ink-faint)]">{suffix}</span>}
    </span>
  );
}

function fieldClass() {
  return "h-8 min-w-0 rounded-[var(--r-sm)] bg-white/60 px-2 text-[13px] text-[color:var(--ink)] outline-none hairline focus:shadow-[0_0_0_3px_rgba(31,122,82,0.18)]";
}

function NewMaterial({ onAdd }: { onAdd: (name: string, color: string, perFt: number) => void }) {
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState("#9c7a4d");
  const [price, setPrice] = React.useState("35");
  const add = () => {
    if (!name.trim()) return;
    const p = parseFloat(price);
    onAdd(name, color, Number.isFinite(p) ? p : 0);
    setName("");
    setPrice("35");
  };
  return (
    <div className="flex items-center gap-1.5 pt-1">
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        aria-label="Material colour"
        className="h-8 w-8 shrink-0 cursor-pointer rounded-[var(--r-sm)] hairline bg-transparent p-0.5"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New material"
        className={cn(fieldClass(), "flex-1")}
      />
      <span className="inline-flex h-8 w-[76px] shrink-0 items-center gap-1 rounded-[var(--r-sm)] bg-white/60 px-2 hairline">
        <span className="text-[12px] text-[color:var(--ink-faint)]">$</span>
        <input
          value={price}
          inputMode="decimal"
          onChange={(e) => setPrice(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[13px] tabular-nums outline-none"
        />
      </span>
      <AddButton onClick={add} />
    </div>
  );
}

function NewOpening({
  kind,
  onAdd,
}: {
  kind: OpeningKind;
  onAdd: (kind: OpeningKind, name: string, widthFt: number, price: number) => void;
}) {
  const [name, setName] = React.useState("");
  const [width, setWidth] = React.useState(kind === "gate" ? "4" : "3");
  const [price, setPrice] = React.useState(kind === "gate" ? "400" : "300");
  const add = () => {
    if (!name.trim()) return;
    const w = parseFloat(width);
    const p = parseFloat(price);
    onAdd(kind, name, Number.isFinite(w) ? w : 3, Number.isFinite(p) ? p : 0);
    setName("");
  };
  return (
    <div className="flex items-center gap-1.5 pt-1">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={`New ${kind}`}
        className={cn(fieldClass(), "flex-1")}
      />
      <span className="inline-flex h-8 w-[58px] shrink-0 items-center gap-1 rounded-[var(--r-sm)] bg-white/60 px-2 hairline">
        <input
          value={width}
          inputMode="decimal"
          onChange={(e) => setWidth(e.target.value)}
          aria-label="Width in feet"
          className="min-w-0 flex-1 bg-transparent text-[13px] tabular-nums outline-none"
        />
        <span className="text-[11px] text-[color:var(--ink-faint)]">ft</span>
      </span>
      <span className="inline-flex h-8 w-[68px] shrink-0 items-center gap-1 rounded-[var(--r-sm)] bg-white/60 px-2 hairline">
        <span className="text-[12px] text-[color:var(--ink-faint)]">$</span>
        <input
          value={price}
          inputMode="decimal"
          onChange={(e) => setPrice(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[13px] tabular-nums outline-none"
        />
      </span>
      <AddButton onClick={add} />
    </div>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add"
      className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] bg-[color:var(--accent)] text-white transition-colors hover:bg-[color:var(--accent-ink)]"
    >
      <Plus className="h-4 w-4" />
    </button>
  );
}
