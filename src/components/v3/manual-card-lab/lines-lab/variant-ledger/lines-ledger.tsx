"use client";

// LINE ITEMS — VARIANT C, "LEDGER".
//
// Card 03 of the manual proposal builder, competing against "everything on one
// row" and "hide it behind a dropdown". Its claim is the third position: keep
// EVERYTHING visible and make it quiet.
//
// The bet: what made the block this replaces messy was never the density, it
// was the CHROME. That build drew a 36px outlined control around every value —
// four in a cluster, plus the name, plus two more behind a disclosure — and the
// sum of twenty visible outlines per screen is what reads as a wall. Delete the
// outlines and the same information becomes a printed estimate sheet: values
// typed in aligned columns, one hairline per row, and nothing else.
//
// So a field here is not a box. It is a value sitting on a 1.5px rule, and it
// borrows an edge only when you touch it. The full reasoning for why that stays
// discoverable — the three tiers, and why the annotation register is allowed to
// have no resting rule — is in the stylesheet's header. The short version:
//   · every editable value in the entry register wears a permanent rule, and a
//     computed figure never does, so "on a line = typed" is learnable at rest;
//   · hovering ANYWHERE in a row wakes that row's whole editable set at once;
//   · the focused field takes a full ink frame on a white well.
//
// TWO REGISTERS, NOT TWO ROWS. Every row carries a second line: the description
// under the name, the material/labor mix under the rate, and — only when the row
// is unnamed — EXCLUDED under the amount. It is bound to the entry above it by
// 4px against 25.5px of separation from the next row, and separated from it by
// size, weight, colour and the absence of a resting rule. The design being
// replaced put its second line 10px away in full-weight 36px controls, and it
// read as a second row. This one cannot.
//
// THE MIX IS AN ANNOTATION, NOT A CONTROL. There is no disclosure to hide it in
// and no slider to bolt on. It prints in the ledger's own drawing register — a
// 2px split rule, the material share as a typed value, and the sentence that
// reads it back — right-aligned under the rate, because the rate is the figure
// it decomposes. Alignment is the entire label. `applyMaterialShare` moves the
// mix at a fixed unit price and `applyUnitPrice` moves the price at a fixed mix,
// so neither control can ever drift the other (see lines-contract.ts).

import { useId, useState } from "react";
import type { Line, LineItemsProps, Unit } from "../lines-contract";
import { splitLabel } from "../lines-contract";
import {
  UNITS,
  applyMaterialShare,
  applyUnitPrice,
  isNamed,
  materialShare,
  money,
  round2,
  unitCost,
} from "../../manual-focus/manual-focus-math";
import { stateDisplayName } from "../../manual-focus/manual-focus-data";
import s from "./lines-ledger.module.css";

/** Local class joiner. Deliberately NOT `@/lib/cn` — twMerge has opinions about
 *  Tailwind utilities and no business near a hashed CSS-module name. */
function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** One symbol from the shell's sprite. `.ic` is the shell's global icon class;
 *  size overrides in the module are written with three classes so they beat
 *  `.bp :global(svg.ic)` on count. Drawn locally rather than imported from
 *  bp-ui so this variant carries no dependency on a sibling's stylesheet. */
function Ic({ name }: { name: string }) {
  return (
    <svg className="ic" aria-hidden="true" focusable="false">
      <use href={`#i-${name}`} />
    </svg>
  );
}

/**
 * A borderless numeric entry.
 *
 * The local string buffer is the whole reason this is a component: committing
 * `Number(e.target.value)` straight to state re-renders "0." as "0" and makes it
 * literally impossible to type "0.62". The buffer lets a controlled input behave
 * like an uncontrolled one for the length of a keystroke run and is dropped on
 * blur, so the stored value wins again the moment focus leaves.
 */
function NumCell({
  id,
  className,
  value,
  onCommit,
  ariaLabel,
  max,
  onKeyDown,
}: {
  id?: string;
  className: string;
  value: number;
  onCommit: (n: number) => void;
  ariaLabel: string;
  max?: number;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const [buf, setBuf] = useState<string | null>(null);

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      className={className}
      value={buf ?? String(value)}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      onChange={(e) => {
        const raw = e.target.value;
        setBuf(raw);
        if (raw.trim() === "") {
          onCommit(0);
          return;
        }
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0) onCommit(max != null ? Math.min(n, max) : n);
      }}
      onBlur={() => setBuf(null)}
    />
  );
}

/**
 * The material / labor mix, in the annotation register.
 *
 * The `<label>` is the accessibility answer to a 32px-wide field: the rule and
 * the readback are inside the click target, so the effective hit area is roughly
 * 250 x 24 rather than 32 x 24. The readback is aria-hidden because the input's
 * own name already carries `splitLabel`, and announcing the sentence twice is
 * worse than not drawing it at all.
 *
 * Arrow keys nudge the share by 1, or by 10 with Shift — a percentage a
 * contractor moves in whole points should not require a full retype.
 */
function MixAnnotation({
  line,
  onPatch,
}: {
  line: Line;
  onPatch: (patch: Partial<Line>) => void;
}) {
  const id = useId();
  const [buf, setBuf] = useState<string | null>(null);
  const mat = Math.round(materialShare(line));

  function nudge(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const next = Math.min(100, Math.max(0, mat + (e.key === "ArrowUp" ? step : -step)));
    setBuf(null);
    onPatch(applyMaterialShare(line, next));
  }

  return (
    <label className={s.mix} htmlFor={id}>
      <span className={s.mixBar} aria-hidden="true">
        <span className={s.mixMat} style={{ width: `${mat}%` }} />
      </span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        className={s.mixNum}
        value={buf ?? String(mat)}
        aria-label={`Material share, percent. ${splitLabel(mat)}`}
        onKeyDown={nudge}
        onChange={(e) => {
          const raw = e.target.value;
          setBuf(raw);
          if (raw.trim() === "") return;
          const n = Number(raw);
          if (Number.isFinite(n) && n >= 0 && n <= 100) onPatch(applyMaterialShare(line, n));
        }}
        onBlur={() => setBuf(null)}
      />
      <span className={s.mixText} aria-hidden="true">
        % material · {100 - mat}% labor
      </span>
    </label>
  );
}

function LedgerRow({
  line,
  first,
  onPatch,
  onRemove,
}: {
  line: Line;
  first: boolean;
  onPatch: (patch: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const cost = unitCost(line);
  const named = isNamed(line);
  // Quantity x the raw unit price. Markup is card 04's job and the marked-up
  // figures print in card 10 — three cards, three registers, no figure
  // computed two ways.
  const total = round2(line.quantity * cost);

  return (
    <div
      className={cx(s.row, first && s.rowFirst)}
      role="group"
      aria-label={named ? line.name : "Unnamed line"}
    >
      <input
        type="text"
        className={cx(s.f, s.cName)}
        value={line.name}
        placeholder="Describe the work"
        aria-label="Line name"
        onChange={(e) => onPatch({ name: e.target.value })}
      />

      <NumCell
        className={cx(s.f, s.fNum, s.cQty)}
        value={line.quantity}
        onCommit={(n) => onPatch({ quantity: n })}
        ariaLabel="Quantity"
      />

      <span className={cx(s.selWrap, s.cUnit)}>
        <select
          className={cx(s.f, s.fSel)}
          value={line.unit}
          aria-label="Unit"
          onChange={(e) => onPatch({ unit: e.target.value as Unit })}
        >
          {UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </span>

      <NumCell
        className={cx(s.f, s.fNum, s.cRate)}
        value={cost}
        onCommit={(n) => onPatch(applyUnitPrice(line, n))}
        ariaLabel="Unit price"
      />

      <span className={cx(s.amt, s.cAmt, !named && s.amtOff)}>{money(total)}</span>

      <button
        type="button"
        className={cx(s.kill, s.cKill)}
        aria-label="Remove line"
        onClick={onRemove}
      >
        <Ic name="trash" />
      </button>

      <input
        type="text"
        className={cx(s.fSub, s.cDesc)}
        value={line.description}
        placeholder="Prints under the name"
        aria-label="Line description"
        onChange={(e) => onPatch({ description: e.target.value })}
      />

      <div className={s.cMix}>
        <MixAnnotation line={line} onPatch={onPatch} />
      </div>

      {/* Priced, kept, and disqualified — directly under the amount it voids.
          The sentence is said once, in the foot; the row says the one word. */}
      {!named ? <span className={cx(s.flag, s.cFlag)}>Excluded</span> : null}
    </div>
  );
}

export function LinesLedger(props: LineItemsProps) {
  // `openIds` / `onToggle` are deliberately not destructured: this variant has
  // no disclosure to model, and the contract says a variant may ignore them.
  const {
    lines,
    onPatch,
    onAdd,
    onRemove,
    baseTotal,
    namedCount,
    unnamedCount,
    taxPct,
    taxAuto,
    taxState,
    onTaxPct,
  } = props;
  const taxId = useId();

  return (
    <div className={s.ledger}>
      {/* One header row for the whole block instead of a label on every field
          in every row. `$ / UNIT` is where the currency mark is declared, which
          is why the rate cells hold bare digits — an affix floating 90px from
          its own right-aligned number is chrome pretending to be information.
          aria-hidden: every control below carries its own label. */}
      <div className={s.head} aria-hidden="true">
        <span className={s.colHead}>Item</span>
        <span className={cx(s.colHead, s.colHeadEnd)}>Qty</span>
        <span className={s.colHead}>Unit</span>
        <span className={cx(s.colHead, s.colHeadEnd)}>$ / unit</span>
        <span className={cx(s.colHead, s.colHeadEnd)}>Line total</span>
        <span />
      </div>

      {lines.map((l, i) => (
        <LedgerRow
          key={l.id}
          line={l}
          first={i === 0}
          onPatch={(patch) => onPatch(l.id, patch)}
          onRemove={() => onRemove(l.id)}
        />
      ))}

      {/* The next ruled line, not a button parked under the table. */}
      <button type="button" className={s.add} onClick={onAdd}>
        <Ic name="plus" />
        Add a line
      </button>

      <div className={s.foot}>
        <span className={s.footNote}>
          {namedCount} counted
          {unnamedCount > 0 ? ` · ${unnamedCount} unnamed, excluded` : ""}
        </span>
        <span className={s.footAmt}>{money(baseTotal)}</span>
      </div>

      <div className={s.taxLine}>
        <label className={s.taxLabel} htmlFor={taxId}>
          Tax rate
        </label>
        <span className={s.taxWrap}>
          <NumCell
            id={taxId}
            className={cx(s.f, s.fNum)}
            value={taxPct}
            onCommit={onTaxPct}
            max={100}
            ariaLabel="Tax rate, percent"
          />
          <span className={s.taxSuffix} aria-hidden="true">
            %
          </span>
        </span>
        <span className={s.taxHint}>
          {taxAuto && taxState ? `Estimated from ${stateDisplayName(taxState)}` : "Set by hand"}
        </span>
      </div>
    </div>
  );
}
