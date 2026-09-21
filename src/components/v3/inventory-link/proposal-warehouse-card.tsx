"use client";

// THE PROPOSAL'S WAREHOUSE CARD (2026-09-20) — in the builder's options sheet.
// Owner: "the proposals that are connected to the inventory show the list of
// materials to pick up … any time I can connect it and disconnect it."
// One switch — Connected / Estimate only — that writes straight away, and,
// when connected, the materials to pick up against the shelf. Read through
// proposalPickList; a proposal that is not saved yet has nothing to show.

import { useCallback, useEffect, useState } from "react";
import { proposalPickList, setProposalInventoryLink, type PickLine } from "@/actions/inventoryLink";
import s from "./inventory-link-choice.module.css";

type State = { linked: boolean; trade: string | null; explicit: boolean | null; rows: PickLine[] };
const LABEL: Record<string, string> = { roof: "Roofing", fence: "Fence", hvac: "HVAC" };

export function ProposalWarehouseCard({ proposalId }: { proposalId: string | null }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () =>
      proposalId
        ? proposalPickList(proposalId).then((r) => {
            if (r.ok) setState({ linked: r.linked, trade: r.trade, explicit: r.explicit, rows: r.rows });
            else setError(r.error);
          })
        : Promise.resolve(),
    [proposalId],
  );
  useEffect(() => {
    let live = true;
    if (proposalId)
      proposalPickList(proposalId).then((r) => {
        if (!live) return;
        if (r.ok) setState({ linked: r.linked, trade: r.trade, explicit: r.explicit, rows: r.rows });
        else setError(r.error);
      });
    return () => {
      live = false;
    };
  }, [proposalId]);
  if (!proposalId) return null;

  const set = async (linked: boolean) => {
    setBusy(true);
    setError(null);
    const r = await setProposalInventoryLink({ proposalId, linked });
    if (!r.ok) setError(r.error);
    else await load();
    setBusy(false);
  };
  const on = state?.linked ?? false;
  const short = state?.rows.filter((r) => r.tracked && !r.enough).length ?? 0;
  const untracked = state?.rows.filter((r) => !r.tracked).length ?? 0;
  return (
    <div className={s.w} data-warehouse-card>
      <div className={s.head}>
        Warehouse
        {state ? <span className={s.hint}>{on ? `connected · ${LABEL[state.trade ?? ""] ?? "trade"} inventory` : state.trade || state.explicit === false ? "estimate only" : "no trade recognized — connect to pick a board"}</span> : null}
      </div>
      {state && (
        <div className={s.opts} role="radiogroup" aria-label="Warehouse">
          <button type="button" role="radio" aria-checked={on} className={`${s.opt}${on ? ` ${s.on}` : ""}`} disabled={busy} onClick={() => set(true)}>
            <span className={s.dot} />
            <span className={s.body}>
              <b>Connected to inventory</b>
              <span>Materials reserved when it sells, forecast while open, on the crew&apos;s pick-up list.</span>
            </span>
          </button>
          <button type="button" role="radio" aria-checked={!on} className={`${s.opt}${!on ? ` ${s.on}` : ""}`} disabled={busy} onClick={() => set(false)}>
            <span className={s.dot} />
            <span className={s.body}>
              <b>Estimate only</b>
              <span>Nothing is reserved; you order everything yourself.</span>
            </span>
          </button>
        </div>
      )}
      {error && <p className={s.err}>{error}</p>}
      {state && on && state.rows.length > 0 && (
        <div className={s.pick} data-pick-up>
          <div className={s.pickHead}>
            Materials to pick up · {state.rows.length}
            {short ? <em className={s.bad}> · {short} short on the shelf</em> : null}
            {untracked ? <em> · {untracked} not stocked</em> : null}
          </div>
          <ul className={s.pickList}>
            {state.rows.map((r) => (
              <li key={r.name} className={s.pickRow}>
                <b>
                  {r.quantity} {r.unit}
                </b>
                <span>{r.name}</span>
                <i className={r.tracked ? (r.enough ? s.ok : s.bad) : undefined}>{r.tracked ? (r.enough ? "on the shelf" : `short · ${r.onHand ?? 0} there`) : "not stocked"}</i>
              </li>
            ))}
          </ul>
        </div>
      )}
      {state && on && state.rows.length === 0 && <p className={s.quiet}>No material lines yet — add lines with a material cost and they will show here.</p>}
    </div>
  );
}
