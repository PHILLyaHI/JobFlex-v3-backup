"use client";

// DIRECTION — "Parts list" (roof inventory redesign, desktop, 2026-09-22).
// THESIS: the inventory reads like the parts list in a drawing's title block —
// one verdict, one ledger, everything else subordinate.
// WORLD: the house blueprint system unchanged — paper ground, white sheets,
// 2px ink frames, 2px radius. Blueprint is the only accent (primary buttons,
// selected states, free stock); success / warning / danger mark state only.
// Inter 900 caps for headings and numerals; JetBrains Mono only for the
// annotation layer — units, SKUs, dates, counts, captions.
// FIRST VIEWPORT: title block (H1 + one annotation line, actions right) → the
// verdict band, the loudest thing on the page, fused with the four figures →
// "Do now" as a ruled list → the ledger begins.
// SIGNATURE: the stock bar as a drawn track — reserved ink hatch, free
// blueprint (amber when low), deficit danger hatch past the shelf, forecast
// dashed, reorder line an ink tick.
// RISK: ledger density — six columns at most.
//
// Every figure and sentence comes from inventory-model.ts (the live board's
// rules, read once); every write is the live board's own server action, run
// in one transition and followed by router.refresh().

import "./roof-inventory.css";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { receivePurchaseOrder, seedTradeItems, upsertInventoryItem } from "@/actions/inventory";
import type { TradeBoardData } from "@/lib/inventoryBoard";
import type { StockFacts } from "@/lib/inventoryDashboard";
import { plural, readBoard, usd, type HighlightAction, type StockFilter } from "./inventory-model";
import { Ic, type ActionResult, type Run } from "./ri-parts";
import { RiOrder, RiWay } from "./ri-order";
import { RiLedger } from "./ri-ledger";
import { RiFeed, RiProposals, RiSuppliers } from "./ri-lower";

export type RoofInventoryProps = { data: TradeBoardData; facts: StockFacts; canWrite: boolean };

/** Scroll the page's own scroller (.main) to a section, honouring reduced motion. */
function go(id: string, block: ScrollLogicalPosition = "start") {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block });
}

export function RoofInventory({ data, facts, canWrite }: RoofInventoryProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<StockFilter>("ALL");
  const [addOpen, setAddOpen] = useState(false);
  const [supOpen, setSupOpen] = useState(false);
  // The one authored moment: the stock bars draw in on first paint. The flag
  // comes off afterwards, so a filter, a search or a refresh never replays it.
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setIntro(false), 1700);
    return () => window.clearTimeout(t);
  }, []);

  const board = useMemo(() => readBoard(data, facts, canWrite), [data, facts, canWrite]);
  const t = board.trade;

  const run: Run = useCallback(
    (work, done) =>
      start(async () => {
        setError(null);
        let r: ActionResult;
        try {
          r = await work();
        } catch {
          r = { ok: false, error: "Could not save — check the connection and try again." };
        }
        if (!r.ok) setError(r.error ?? "Could not save");
        else {
          setNote(done ? done(r) : null);
          router.refresh();
        }
      }),
    [router, start],
  );

  const addAllUntracked = () =>
    run(
      async () => {
        let added = 0;
        for (const l of data.untracked) {
          const r = await upsertInventoryItem({ trade: data.trade, name: l.name, unit: l.unit ?? "each" });
          if (!r.ok) return r;
          added++;
        }
        return { ok: true, added };
      },
      (r) => `${plural(Number(r.added), "item")} now tracked at zero — receive what is on the shelf.`,
    );

  const act = (a: HighlightAction) => {
    if (a.kind === "scroll-order") go("ri-order");
    else if (a.kind === "receive-order") run(() => receivePurchaseOrder(a.orderId), (r) => `${plural(Number(r.received), "line")} received onto the shelf.`);
    else if (a.kind === "show-idle") {
      setFilter("IDLE");
      go("ri-ledger");
    } else addAllUntracked();
  };

  const openAdd = () => {
    const next = !addOpen;
    setAddOpen(next);
    if (next) requestAnimationFrame(() => go("ri-add", "center"));
  };
  const openSuppliers = () => {
    setSupOpen(true);
    requestAnimationFrame(() => go("ri-suppliers", "center"));
  };

  const v = board.verdict;
  // The one blue button up top — only for a role that can place the order it scrolls to.
  const orderable = canWrite && board.needs.length > 0 && (v.tone === "bad" || v.tone === "warn");
  const empty = data.rows.length === 0;
  const annotation = [plural(board.counts.all, "item"), board.value.valued > 0 ? `${usd(board.value.amount)} at last cost` : "no costs on file", plural(data.suppliers.length, "supplier")].join(" · ");

  return (
    <div className="jf-rinv" data-intro={intro ? "" : undefined} aria-busy={pending || undefined}>
      {/* TITLE BLOCK */}
      <header className="ri-title">
        <div className="ri-title-main">
          <h1 className="ri-h1">{t.label} inventory</h1>
          <p className="ri-anno">{annotation}</p>
        </div>
        <div className="ri-title-acts">
          {canWrite ? (
            <>
              <button className="ri-btn" type="button" onClick={openSuppliers}>
                Add supplier
              </button>
              <button className="ri-btn ri-btn--primary" type="button" aria-expanded={addOpen} onClick={openAdd}>
                <Ic id="i-plus" />
                Add item
              </button>
            </>
          ) : (
            <span className="ri-viewonly">
              <Ic id="i-eye" />
              View only
            </span>
          )}
        </div>
      </header>

      {/* WHAT JUST HAPPENED, AND THE STANDARD-ITEMS OFFER */}
      {(error || note) && (
        <div className="ri-strip" data-tone={error ? "bad" : "ok"} role={error ? "alert" : "status"}>
          <Ic id={error ? "i-ban" : "i-check"} className="ri-strip-ic" />
          <p className="ri-strip-text">{error ?? note}</p>
          <button className="ri-strip-x" type="button" aria-label="Dismiss" onClick={() => (error ? setError(null) : setNote(null))}>
            <Ic id="i-x" />
          </button>
        </div>
      )}
      {canWrite && data.presets.missing > 0 && (
        <div className="ri-note" data-presets>
          <p className="ri-note-text">
            {empty ? (
              <>
                <b>Start with the {t.label} estimator’s own materials.</b> Every material it prices — {data.presets.total} items — goes on the list at zero, so proposals match by name. Then receive what you have.
              </>
            ) : (
              <>
                <b>
                  {data.presets.missing} of the estimator’s {data.presets.total} standard items
                </b>{" "}
                are not on the list yet.
              </>
            )}
          </p>
          <button
            className={empty ? "ri-btn ri-btn--primary" : "ri-btn"}
            type="button"
            disabled={pending}
            onClick={() => run(() => seedTradeItems(data.trade), (r) => `${String(r.added)} standard ${t.noun} items added — receive what is on the shelf.`)}
          >
            Add the {data.presets.missing} standard items
          </button>
        </div>
      )}

      {/* THE VERDICT, FUSED WITH THE FOUR FIGURES */}
      <section className="ri-verdict" data-tone={v.tone} aria-labelledby="ri-verdict-t" data-mast>
        <div className="ri-verdict-top">
          <div className="ri-verdict-copy">
            <h2 className="ri-verdict-title" id="ri-verdict-t">
              {v.title}
            </h2>
            <p className="ri-verdict-text" suppressHydrationWarning>
              {v.text}
            </p>
          </div>
          {orderable && (
            <button className="ri-btn ri-btn--primary ri-btn--lg" type="button" onClick={() => go("ri-order")}>
              Order now
              <Ic id="i-chev" />
            </button>
          )}
        </div>
        <dl className="ri-figs">
          {board.kpis.map((k) => (
            <div key={k.id} className="ri-fig" data-tone={k.tone} data-kpi={k.id}>
              <dt className="ri-fig-lbl">{k.label}</dt>
              <dd className="ri-fig-val">{k.value}</dd>
              <dd className="ri-fig-sub" title={k.sub} suppressHydrationWarning>
                {k.sub}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* DO NOW */}
      <section className="ri-sec" aria-labelledby="ri-do-h" data-highlights>
        <div className="ri-sec-head">
          <h2 className="ri-h2" id="ri-do-h">
            Do now
          </h2>
        </div>
        {board.highlights.length === 0 ? (
          <p className="ri-clear">
            <Ic id="i-check" />
            <span>
              <b>All clear.</b> Nothing to do right now — the shelf covers the sold work, nothing is on order and nothing is waiting to load.
            </span>
          </p>
        ) : (
          <ul className="ri-card ri-do">
            {board.highlights.map((h) => (
              <li key={h.id} className="ri-do-row" data-tone={h.tone} data-kind={h.id}>
                <span className="ri-do-mark" title={h.label}>
                  <Ic id={h.icon} />
                </span>
                <div className="ri-do-copy">
                  <p className="ri-do-title" title={h.title}>
                    {h.title}
                  </p>
                  <p className="ri-do-text" title={h.text} suppressHydrationWarning>
                    {h.text}
                  </p>
                </div>
                {/* No action and no link (a read-only role) → no slot at all; the copy takes the width. */}
                {(h.action || h.link) && (
                  <div className="ri-do-acts">
                    {h.action && (
                      <button className="ri-btn" type="button" disabled={pending && h.action.kind !== "scroll-order" && h.action.kind !== "show-idle"} onClick={() => h.action && act(h.action)}>
                        {h.action.label}
                      </button>
                    )}
                    {h.link && (
                      <Link className="ri-link" href={h.link.href}>
                        {h.link.label}
                        <Ic id="i-arrow" />
                      </Link>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <RiOrder board={board} data={data} facts={facts} canWrite={canWrite} pending={pending} run={run} />
      <RiWay board={board} canWrite={canWrite} pending={pending} run={run} />

      <RiLedger board={board} data={data} facts={facts} canWrite={canWrite} pending={pending} run={run} filter={filter} setFilter={setFilter} addOpen={addOpen} closeAdd={() => setAddOpen(false)} />

      <div className="ri-two">
        <RiFeed facts={facts} />
        <RiSuppliers data={data} canWrite={canWrite} pending={pending} run={run} open={supOpen} setOpen={setSupOpen} />
      </div>

      <RiProposals board={board} data={data} canWrite={canWrite} pending={pending} run={run} />
    </div>
  );
}
