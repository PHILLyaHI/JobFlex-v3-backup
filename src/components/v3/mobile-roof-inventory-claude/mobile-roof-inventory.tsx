"use client";

// ROOFING INVENTORY · HANDHELD — "Parts list" (2026-09-22).
//
// THESIS: the inventory reads like the parts list in a drawing's title block —
// one verdict, one list, everything else subordinate. WORLD: the house
// blueprint system unchanged — paper ground, white sheets, 2px ink frames,
// 2px radii, hard offset shadows; blueprint is the only accent (primary
// buttons, selected states, free stock); success / warning / danger mark
// state and nothing else. Inter 800–900 caps for headings, Inter 900 tabular
// numerals, JetBrains Mono only for annotations. SIGNATURE: the stock bar as
// a drawn track — reserved in ink hatch, free in blueprint (amber under the
// line), deficit in danger hatch past the shelf, forecast dashed, the reorder
// line an ink tick — explained once by a legend above the list. EMPHASIS:
// verdict → Available numerals and plates → item names → annotations.
// Every figure comes from the shared model (inventory-model.ts); every write
// is the live board's server action, called the way trade-board.tsx calls it.

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { lockScroll } from "@/lib/scrollLock";
import { countStock, deleteInventoryItem, receivePurchaseOrder, receiveStock, seedTradeItems, sendPurchaseOrder, upsertInventoryItem, upsertSupplier } from "@/actions/inventory";
import { setProposalInventoryLink } from "@/actions/inventoryLink";
import type { BoardProposal, TradeBoardData } from "@/lib/inventoryBoard";
import type { StockFacts } from "@/lib/inventoryDashboard";
import {
  ago,
  dayOf,
  filterCount,
  inProposalTab,
  ledgerRows,
  materialsOf,
  moveKind,
  plateOf,
  plural,
  PROPOSAL_TABS,
  qty,
  readBoard,
  STATUS_LABEL,
  STOCK_FILTERS,
  stockBar,
  usd,
  type Highlight,
  type LedgerRow,
  type LedgerView,
  type ProposalTab,
  type StockFilter,
  type Tone,
} from "@/components/v3/roof-inventory-claude/inventory-model";
import { Flash, Icon, Legend, Plate, Select, Sheet, StockTrack } from "./mri-parts";
import { ItemSheetBody } from "./mri-item-sheet";
import { AddItemForm, AddSupplierForm } from "./mri-forms";
import "./mobile-roof-inventory.css";

export type MobileRoofInventoryProps = { data: TradeBoardData; facts: StockFacts; canWrite: boolean };

type Res = { ok: boolean; error?: string } & Record<string, unknown>;
type SheetKind = "item" | "add" | "sup";

/** A proposal's status as a plate. Sent / Viewed are the blueprint pair the
 *  desktop proposals page uses; Sold and after are success; Declined danger. */
const STATUS_TONE: Record<string, Tone> = { DRAFT: "none", SENT: "blue", VIEWED: "blue", ACCEPTED: "ok", COMPLETED: "ok", PAID: "ok", DECLINED: "bad" };

/** How long a success receipt stays on screen before it clears itself. */
const NOTE_MS = 8000;
/** The sheet's travel; a form resets only once it is off screen. */
const SHEET_EXIT_MS = 340;
/** Highlight copy longer than this gets the tap-to-read-all toggle. */
const LONG_TEXT = 88;

const signed = (n: number) => (n < 0 ? `−${qty(-n)}` : qty(n));
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A thrown action (network, a redeploy) is not the user's fault; say what to do. */
function actionError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  const low = msg.toLowerCase();
  if (!msg || low.includes("fetch failed")) return "Not saved — check your connection and try again.";
  if (low.includes("unexpected response")) return "Not saved — the app was updated. Reload the page and try again.";
  return msg;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MobileRoofInventory({ data, facts, canWrite }: MobileRoofInventoryProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [filter, setFilter] = useState<StockFilter>("ALL");
  const [view, setView] = useState<LedgerView>("urgency");
  const [ptab, setPtab] = useState<ProposalTab>("ALL");
  const [q, setQ] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);
  const [openHl, setOpenHl] = useState<string | null>(null);

  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  /** Bumped on every open so the item sheet's local state starts fresh. */
  const [seq, setSeq] = useState(0);
  /** Bumped once an add sheet is off screen, which resets its form. */
  const [formSeq, setFormSeq] = useState(0);
  const openerRef = useRef<HTMLElement | null>(null);

  const scrollRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const board = useMemo(() => readBoard(data, facts, canWrite), [data, facts, canWrite]);
  const ledger = useMemo(() => ledgerRows(board, { filter, query: q, view, showEmpty }), [board, filter, q, view, showEmpty]);
  const trade = board.trade;

  /* ---------- writes: the live board's actions, one transition each ---------- */

  const run = useCallback(
    (work: () => Promise<Res>, done?: (r: Res) => string, after?: (ok: boolean) => void) =>
      start(async () => {
        setError(null);
        setNote(null);
        let r: Res;
        try {
          r = await work();
        } catch (err) {
          r = { ok: false, error: actionError(err) };
        }
        if (!r.ok) {
          setError(r.error ?? "Could not save");
          after?.(false);
          return;
        }
        setNote(done ? done(r) : null);
        after?.(true);
        router.refresh();
      }),
    [router],
  );

  // A receipt clears itself; an error stays until it is dismissed.
  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), NOTE_MS);
    return () => window.clearTimeout(t);
  }, [note]);

  const dismiss = useCallback(() => {
    setError(null);
    setNote(null);
  }, []);

  /* ---------- sheets ---------- */

  const openSheet = useCallback((kind: SheetKind, id?: string) => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // A sheet opens clean: a refusal from an earlier write belongs to that write.
    setError(null);
    setNote(null);
    if (id) setItemId(id);
    setSeq((n) => n + 1);
    setSheet(kind);
  }, []);

  const closeSheet = useCallback(() => {
    setSheet(null);
    const el = openerRef.current;
    openerRef.current = null;
    if (el && el.isConnected) el.focus({ preventScroll: true });
  }, []);

  // The item sheet reads its row from the board, so a refresh after a write
  // repaints the figures in place. A row that no longer exists closes it.
  const sheetRow = itemId ? board.rows.find((x) => x.r.id === itemId) : undefined;
  const active: SheetKind | null = sheet === "item" ? (sheetRow ? "item" : null) : sheet;

  useEffect(() => {
    if (!active) return;
    const release = lockScroll();
    const root = document.getElementById(`mri-sheet-${active}`);
    // Into the sheet once it is on screen: a form's first field, else Close.
    const t = window.setTimeout(() => {
      const target = root?.querySelector<HTMLElement>("[data-autofocus]") ?? root?.querySelector<HTMLElement>("[data-sheet-close]");
      target?.focus({ preventScroll: true });
    }, 80);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSheet();
        return;
      }
      if (e.key !== "Tab" || !root) return;
      const els = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      release();
    };
  }, [active, closeSheet]);

  /** Close an add sheet after a landed write, and blank its form once it is gone. */
  const closeAndReset = useCallback(() => {
    closeSheet();
    window.setTimeout(() => setFormSeq((n) => n + 1), SHEET_EXIT_MS);
  }, [closeSheet]);

  /* ---------- navigation inside the page ---------- */

  const scrollToId = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  }, []);

  const onHighlight = (h: Highlight) => {
    const a = h.action;
    if (!a) return;
    if (a.kind === "scroll-order") scrollToId(board.needs.length ? "mri-order" : "mri-stock");
    else if (a.kind === "receive-order") run(() => receivePurchaseOrder(a.orderId), (r) => `${plural(Number(r.received), "line")} received onto the shelf.`);
    else if (a.kind === "show-idle") {
      setFilter("IDLE");
      scrollToId("mri-stock");
    } else if (a.kind === "track-untracked")
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
  };

  const seed = () => run(() => seedTradeItems(data.trade), (r) => `${String(r.added)} standard ${trade.noun} items added — receive what is on the shelf.`);
  const link = (p: BoardProposal, linked: boolean) =>
    run(
      () => setProposalInventoryLink({ proposalId: p.id, linked, trade: data.trade }),
      () => (linked ? `${p.title} is connected to the inventory again.` : `${p.title} is an estimate only now — nothing reserved for it.`),
    );

  /* ---------- motion: reveal once at mount, parallax, press ---------- */
  // Applied ONCE, to the blocks that exist at mount. Never a MutationObserver:
  // a filter, a keystroke or an opened sheet must never replay an entrance.
  useEffect(() => {
    if (reducedMotion()) return;
    const content = contentRef.current;
    if (!content) return;
    const blocks = Array.from(content.children) as HTMLElement[];
    blocks.forEach((el, i) => {
      el.classList.add("mri-rv");
      el.style.transitionDelay = `${Math.min(i, 6) * 60}ms`;
    });
    const raf = requestAnimationFrame(() => blocks.forEach((el) => el.classList.add("mri-rv-in")));
    const done = window.setTimeout(() => {
      blocks.forEach((el) => {
        el.style.transitionDelay = "";
        el.classList.remove("mri-rv", "mri-rv-in");
      });
    }, 60 * 6 + 520);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
    };
  }, []);

  useEffect(() => {
    if (reducedMotion()) return;
    const host = scrollRef.current;
    if (!host) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        host.style.setProperty("--gy", `${(-(host.scrollTop * 0.06)).toFixed(1)}px`);
        ticking = false;
      });
    };
    host.addEventListener("scroll", onScroll, { passive: true });
    return () => host.removeEventListener("scroll", onScroll);
  }, []);

  /* ---------- derived copy ---------- */

  const v = board.verdict;
  const annotation = `${plural(board.counts.all, "item")} · ${board.value.valued > 0 ? `${usd(board.value.amount)} at last cost` : "no costs on file"}`;
  const needsN = board.needs.length;
  const orderNote = [
    board.counts.soldShort ? `${plural(board.counts.soldShort, "item is", "items are")} short for jobs already sold.` : "",
    board.counts.low ? `${plural(board.counts.low, "item is", "items are")} under the reorder line.` : "",
    board.counts.short ? `${board.counts.short} would run short if the open proposals sell.` : "",
  ].filter(Boolean);
  const listedProposals = board.proposals.filter((p) => inProposalTab(p, ptab));
  const showPresets = canWrite && data.presets.missing > 0 && data.rows.length > 0;

  /* ---------- one stock row ---------- */

  const renderRow = (x: LedgerRow) => {
    const bar = stockBar(x.r, x.st);
    const plate = plateOf(x.r, x.st);
    const tone = x.r.available < 0 ? "bad" : bar.freeWarn ? "warn" : x.st === "empty" ? "mute" : "none";
    return (
      <li key={x.r.id} className="mri-li">
        <button type="button" className={`mri-row st-${x.st}`} aria-haspopup="dialog" onClick={() => openSheet("item", x.r.id)}>
          <span className="mri-row-name" title={x.r.name}>
            {x.r.name}
          </span>
          <span className={`mri-row-num t-${tone}`}>
            <b>{signed(x.r.available)}</b>
            <small>{x.r.unit}</small>
          </span>
          <span className="mri-row-plate">
            <Plate tone={plate.tone}>{plate.text}</Plate>
          </span>
          <span className="mri-row-bar">
            <StockTrack bar={bar} />
          </span>
          <span className="mri-row-cap">
            {qty(x.r.onHand)} on hand · {qty(x.r.reserved)} reserved · {qty(x.r.forecast)} forecast
            {x.r.threshold > 0 ? ` · line ${qty(x.r.threshold)}` : ""}
          </span>
          <Icon id="i-chevr" className="mri-row-chev" />
        </button>
      </li>
    );
  };

  /* ---------- render ---------- */

  return (
    <div className={`jf-mrinv${canWrite ? " has-foot" : ""}`}>
      <MobileNav />

      <main className="mri-scroll" ref={scrollRef} aria-label={`${trade.label} inventory`}>
        <div className="mri-content" ref={contentRef}>
          {/* ============ TITLE BLOCK ============ */}
          <header className="mri-head">
            <h1 className="mri-title">{trade.label} inventory</h1>
            <p className="mri-annot">
              <span>{annotation}</span>
              {!canWrite && <Plate tone="none">View only</Plate>}
            </p>
          </header>

          <Flash error={error} note={note} pending={pending} onDismiss={dismiss} />

          {/* ============ THE VERDICT ============ */}
          <section className={`mri-verdict t-${v.tone}`} aria-labelledby="mri-h-verdict">
            <h2 className="mri-verdict-t" id="mri-h-verdict">
              <i className="mri-verdict-mark" aria-hidden="true" />
              {v.title}
            </h2>
            <p className="mri-verdict-x">{v.text}</p>
            {/* A read-only role cannot place the order it would scroll to. */}
            {canWrite && needsN > 0 && (v.tone === "bad" || v.tone === "warn") ? (
              <button type="button" className="mri-btn mri-btn-p mri-btn-block" onClick={() => scrollToId("mri-order")}>
                Review the order
                <span className="mri-btn-n">{plural(needsN, "item")}</span>
              </button>
            ) : data.rows.length === 0 && canWrite && data.presets.missing > 0 ? (
              <button type="button" className="mri-btn mri-btn-p mri-btn-block" disabled={pending} onClick={seed}>
                <Icon id="i-plus" />
                Add the {data.presets.missing} standard items
              </button>
            ) : null}
            {data.rows.length === 0 && canWrite && data.presets.missing > 0 ? (
              <p className="mri-verdict-n">Every material the {trade.label} estimator prices goes on the list at zero, so proposals match by name. Then receive what you have.</p>
            ) : null}
          </section>

          {/* ============ THE FOUR FIGURES ============ */}
          <section className="mri-card mri-figs" aria-label="The four numbers">
            {board.kpis.map((k) => (
              <div key={k.id} className="mri-fig">
                <span className="mri-lbl">{k.label}</span>
                <b className={`mri-fig-v t-${k.tone}`}>{k.value}</b>
                <span className={`mri-fig-s${k.tone === "bad" ? " t-bad" : ""}`} title={k.sub}>
                  {k.sub}
                </span>
              </div>
            ))}
          </section>

          {/* ============ DO NOW ============ */}
          <section className="mri-sec" aria-labelledby="mri-h-do">
            <div className="mri-sec-h">
              <h2 className="mri-h2" id="mri-h-do">
                Do now
              </h2>
              {board.highlights.length > 0 && <span className="mri-ann">{plural(board.highlights.length, "thing")}</span>}
            </div>
            {board.highlights.length === 0 ? (
              <div className="mri-quiet">
                <Icon id="i-check" />
                <span>
                  <b>Nothing to do right now.</b> The shelf covers the sold work, nothing is on order and nothing is waiting to load.
                </span>
              </div>
            ) : (
              <ul className="mri-card mri-do-list">
                {board.highlights.map((h) => {
                  const long = h.text.length > LONG_TEXT;
                  const isOpen = openHl === h.id;
                  return (
                    <li key={h.id} className={`mri-do t-${h.tone}`}>
                      <span className="mri-do-mark" aria-hidden="true">
                        <Icon id={h.icon} />
                      </span>
                      <div className="mri-do-body">
                        <b className="mri-do-t">{h.title}</b>
                        {long ? (
                          <button type="button" className={`mri-do-x is-long${isOpen ? " is-open" : ""}`} aria-expanded={isOpen} onClick={() => setOpenHl(isOpen ? null : h.id)}>
                            {h.text}
                          </button>
                        ) : (
                          <p className="mri-do-x">{h.text}</p>
                        )}
                        {(h.action || h.link) && (
                          <div className="mri-do-acts">
                            {h.action && (
                              <button type="button" className={`mri-btn ${h.action.primary ? "mri-btn-p" : "mri-btn-s"}`} disabled={pending} onClick={() => onHighlight(h)}>
                                {h.action.label}
                              </button>
                            )}
                            {h.link && (
                              <Link className="mri-link" href={h.link.href}>
                                {h.link.label} →
                              </Link>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ============ ORDER NOW ============ */}
          {needsN > 0 && (
            <section className="mri-sec" id="mri-order" aria-labelledby="mri-h-order">
              <div className="mri-sec-h">
                <h2 className="mri-h2" id="mri-h-order">
                  Order now
                </h2>
                <span className="mri-ann">
                  {plural(needsN, "item")} · {board.orderCost > 0 ? `about ${usd(board.orderCost)}` : "no costs on file yet"}
                </span>
              </div>
              <p className="mri-lede">
                {orderNote.length ? <b>{orderNote.join(" ")} </b> : null}
                Quantities cover the sold and open work and keep the reorder line on the shelf.
              </p>
              <div className="mri-stack">
                {board.bySupplier.map((g) => (
                  <article key={g.supplierId} className="mri-card mri-po">
                    <header className="mri-po-h">
                      <b className="mri-po-name">{g.supplier?.name ?? "Supplier"}</b>
                      {g.supplier?.email ? <span className="mri-mono">{g.supplier.email}</span> : <span className="mri-mono t-warn">no email on file — add one under Suppliers</span>}
                    </header>
                    <ul className="mri-parts" aria-label={`Lines for ${g.supplier?.name ?? "this supplier"}`}>
                      {g.lines.map((r) => (
                        <li key={r.id} className="mri-part">
                          <span className="mri-part-q">
                            <b>{r.suggestedOrder}</b>
                            <small>{r.unit}</small>
                          </span>
                          <span className="mri-part-n">
                            {r.name}
                            {r.supplierSku ? <small>{r.supplierSku}</small> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <footer className="mri-po-f">
                      <span className="mri-mono">{g.cost > 0 ? `About ${usd(g.cost)} at last cost` : "No cost on file"}</span>
                      {canWrite && (
                        <button
                          type="button"
                          className="mri-btn mri-btn-p mri-btn-block"
                          disabled={pending || !g.supplier?.email}
                          onClick={() =>
                            run(
                              () => sendPurchaseOrder({ trade: data.trade, supplierId: g.supplierId, lines: g.lines.map((r) => ({ itemId: r.id, quantity: r.suggestedOrder })) }),
                              (r) => `Purchase order emailed to ${String(r.to)} — ${plural(Number(r.count), "line")}.`,
                            )
                          }
                        >
                          <Icon id="i-send" />
                          Email order · {plural(g.lines.length, "line")}
                        </button>
                      )}
                    </footer>
                  </article>
                ))}

                {board.unassigned.length > 0 && (
                  <article className="mri-card mri-po is-loose">
                    <header className="mri-po-h">
                      <b className="mri-po-name">No supplier yet</b>
                      <span className="mri-po-x">{plural(board.unassigned.length, "item")} to order and no one to send it to. Pick a supplier and the item joins that order.</span>
                    </header>
                    <ul className="mri-parts">
                      {board.unassigned.map((r) => (
                        <li key={r.id} className="mri-part has-pick">
                          <span className="mri-part-q">
                            <b>{r.suggestedOrder}</b>
                            <small>{r.unit}</small>
                          </span>
                          <span className="mri-part-n">{r.name}</span>
                          {canWrite && data.suppliers.length > 0 && (
                            <span className="mri-part-pick">
                              <Select
                                aria-label={`Supplier for ${r.name}`}
                                defaultValue=""
                                disabled={pending}
                                onChange={(e) => {
                                  const id = e.target.value;
                                  if (!id) return;
                                  run(
                                    () => upsertInventoryItem({ trade: data.trade, name: r.name, unit: r.unit, reorderPoint: r.reorderPoint, supplierId: id, supplierSku: r.supplierSku ?? null, lastCost: facts.items[r.id]?.lastCost ?? null }),
                                    () => `${r.name} now comes from ${board.supName(id)}.`,
                                  );
                                }}
                              >
                                <option value="">Pick a supplier…</option>
                                {data.suppliers.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </Select>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {data.suppliers.length === 0 && (
                      <footer className="mri-po-f">
                        <span className="mri-mono">Add a supplier first.</span>
                        {canWrite && (
                          <button type="button" className="mri-btn mri-btn-s mri-btn-block" onClick={() => openSheet("sup")}>
                            <Icon id="i-plus" />
                            Add supplier
                          </button>
                        )}
                      </footer>
                    )}
                  </article>
                )}
              </div>
            </section>
          )}

          {/* ============ ON THE WAY ============ */}
          {board.orders.length > 0 && (
            <section className="mri-sec" id="mri-way" aria-labelledby="mri-h-way">
              <div className="mri-sec-h">
                <h2 className="mri-h2" id="mri-h-way">
                  On the way
                </h2>
                <span className="mri-ann">{plural(board.orderLines, "line")}</span>
              </div>
              <p className="mri-lede">Purchase orders emailed and not yet received. One tap when the delivery lands puts every line on the shelf.</p>
              <ul className="mri-card mri-rows">
                {board.orders.map((o) => (
                  <li key={o.id} className="mri-way">
                    <div className="mri-way-main">
                      <b>{o.supplier}</b>
                      <span className="mri-mono">sent {ago(o.sentAt)}</span>
                      <span className="mri-way-lines">{o.lines.map((l) => `${l.quantity} × ${l.name}`).join(" · ")}</span>
                    </div>
                    {canWrite && (
                      <button type="button" className="mri-btn mri-btn-s" disabled={pending} onClick={() => run(() => receivePurchaseOrder(o.id), (r) => `${plural(Number(r.received), "line")} received onto the shelf.`)}>
                        <Icon id="i-check" />
                        Received
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ============ STOCK — the parts list ============ */}
          <section className="mri-sec" id="mri-stock" aria-labelledby="mri-h-stock">
            <div className="mri-sec-h">
              <h2 className="mri-h2" id="mri-h-stock">
                Stock
              </h2>
              <div className="mri-seg" role="group" aria-label="Order the list">
                <button type="button" className={`mri-seg-b${view === "urgency" ? " is-on" : ""}`} aria-pressed={view === "urgency"} onClick={() => setView("urgency")}>
                  By urgency
                </button>
                <button type="button" className={`mri-seg-b${view === "category" ? " is-on" : ""}`} aria-pressed={view === "category"} onClick={() => setView("category")}>
                  By shelf
                </button>
              </div>
            </div>

            {showPresets && (
              <div className="mri-note">
                <p>
                  <b>
                    {data.presets.missing} of the estimator&apos;s {data.presets.total} standard items
                  </b>{" "}
                  are not on the list yet.
                </p>
                <button type="button" className="mri-btn mri-btn-s mri-btn-block" disabled={pending} onClick={seed}>
                  <Icon id="i-plus" />
                  Add the {data.presets.missing} standard items
                </button>
              </div>
            )}

            {data.rows.length > 0 && (
              <>
                <div className="mri-search">
                  <Icon id="i-search" />
                  <input
                    className="mri-search-in"
                    type="search"
                    enterKeyHint="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Find an item or supplier"
                    aria-label="Find an item or supplier"
                    autoComplete="off"
                  />
                  {q && (
                    <button type="button" className="mri-search-x" aria-label="Clear the search" onClick={() => setQ("")}>
                      <Icon id="i-x" />
                    </button>
                  )}
                </div>
                <div className="mri-rail" role="group" aria-label="Filter the stock">
                  {STOCK_FILTERS.map((f) => (
                    <button key={f.id} type="button" className={`mri-chip${filter === f.id ? " is-on" : ""}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                      {f.label}
                      <b>{filterCount(board, f.id)}</b>
                    </button>
                  ))}
                </div>
                <Legend />
              </>
            )}

            {data.rows.length === 0 ? (
              <div className="mri-empty">
                <b>No {trade.noun} items yet.</b>
                <span>Add the estimator&apos;s standard items, add one by hand, or pick from the lines your proposals already use.</span>
              </div>
            ) : (
              <div className="mri-card mri-list-card">
                <div className="mri-list-h" aria-hidden="true">
                  <span>Item</span>
                  <span>Available</span>
                </div>
                <ul className="mri-list" aria-label={`${trade.label} stock`}>
                  {ledger.sections.map((sec) => (
                    <Fragment key={sec.label ?? "all"}>
                      {sec.label && (
                        <li className="mri-grp">
                          <b>{sec.label}</b>
                          <span>
                            {plural(sec.items.length, "item")}
                            {sec.needs ? ` · ${sec.needs} to order` : ""}
                          </span>
                        </li>
                      )}
                      {sec.items.map(renderRow)}
                    </Fragment>
                  ))}
                  {ledger.folded.length > 0 && (
                    <li className="mri-li">
                      <button type="button" className="mri-fold" onClick={() => setShowEmpty(true)}>
                        <span>
                          <b>{ledger.folded.length}</b> more {ledger.folded.length === 1 ? "item" : "items"} not stocked yet — nothing on hand, nothing against them
                        </span>
                        <span className="mri-fold-a">Show</span>
                      </button>
                    </li>
                  )}
                  {ledger.canHideEmpty && (
                    <li className="mri-li">
                      <button type="button" className="mri-fold" onClick={() => setShowEmpty(false)}>
                        <span>
                          Hide the {board.counts.empty} {board.counts.empty === 1 ? "item" : "items"} not stocked yet
                        </span>
                        <span className="mri-fold-a">Hide</span>
                      </button>
                    </li>
                  )}
                  {ledger.shown.length === 0 && ledger.folded.length === 0 && (
                    <li className="mri-none">
                      Nothing here
                      {ledger.needle ? (
                        <>
                          {" "}
                          for <q>{q.trim()}</q>
                        </>
                      ) : null}
                      .
                    </li>
                  )}
                </ul>
              </div>
            )}

            {canWrite && data.untracked.length > 0 && (
              <div className="mri-untracked">
                <p>
                  <b>Your proposals use these and the warehouse does not track them yet.</b> One tap adds the item at zero.
                </p>
                <div className="mri-chips">
                  {data.untracked.slice(0, 20).map((l) => (
                    <button
                      key={l.name}
                      type="button"
                      className="mri-chip is-add"
                      disabled={pending}
                      onClick={() => run(() => upsertInventoryItem({ trade: data.trade, name: l.name, unit: l.unit ?? "each" }), () => `${l.name} is now tracked. Receive what is on the shelf.`)}
                    >
                      <Icon id="i-plus" />
                      <span>{l.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ============ THE TRADE'S PROPOSALS ============ */}
          <section className="mri-sec" id="mri-props" aria-labelledby="mri-h-props">
            <div className="mri-sec-h">
              <h2 className="mri-h2" id="mri-h-props">
                {trade.label} proposals
              </h2>
              <span className="mri-ann">{plural(board.proposals.length, "proposal")}</span>
            </div>
            <p className="mri-lede">
              Every {trade.noun} proposal from the {trade.label} estimator — open, sold and done. The Proposals page lists them all together.
            </p>
            {board.proposals.length > 0 && (
              <div className="mri-rail" role="group" aria-label="Filter the proposals">
                {PROPOSAL_TABS.map((t) => (
                  <button key={t.id} type="button" className={`mri-chip${ptab === t.id ? " is-on" : ""}`} aria-pressed={ptab === t.id} onClick={() => setPtab(t.id)}>
                    {t.label}
                    <b>{board.proposalCounts[t.id]}</b>
                  </button>
                ))}
              </div>
            )}
            {board.proposals.length === 0 ? (
              <div className="mri-empty">
                <b>No {trade.noun} proposals yet.</b>
                <span>Make one with the {trade.label} estimator.</span>
              </div>
            ) : listedProposals.length === 0 ? (
              <div className="mri-empty">
                <b>Nothing here.</b>
              </div>
            ) : (
              <ul className="mri-card mri-rows">
                {listedProposals.map((p) => {
                  const m = materialsOf(p, data.rows);
                  const sold = p.linked && p.status === "ACCEPTED";
                  const hasPick = Boolean(p.linked && p.jobId && (p.status === "ACCEPTED" || p.status === "COMPLETED"));
                  return (
                    <li key={p.id} className="mri-prop">
                      <div className="mri-prop-top">
                        <Link className="mri-prop-t" href={`/dashboard/manual-blueprint?proposal=${p.id}` as Route} title={p.title}>
                          <span>{p.title}</span>
                        </Link>
                        <b className="mri-prop-tot">{usd(p.total)}</b>
                      </div>
                      <div className="mri-prop-meta">
                        <span title={p.client ?? undefined}>{p.client ?? "No client"}</span> · {dayOf(p.createdAt)} · {plural(p.lines.length, "material line")}
                      </div>
                      {p.inferred || !p.linked ? (
                        <div className="mri-tags">
                          {p.inferred ? <span className="mri-tag">by its materials</span> : null}
                          {!p.linked ? <span className="mri-tag">not connected</span> : null}
                        </div>
                      ) : null}
                      <div className="mri-prop-st">
                        <Plate tone={STATUS_TONE[p.status] ?? "none"}>{STATUS_LABEL[p.status] ?? p.status}</Plate>
                        {sold ? <Plate tone={p.loaded ? "ok" : "blue"}>{p.loaded ? "Loaded" : "Reserved in stock"}</Plate> : null}
                        {canWrite && (
                          <button type="button" className="mri-ghost is-sm" disabled={pending} onClick={() => link(p, !p.linked)}>
                            {p.linked ? "Disconnect" : "Connect"}
                          </button>
                        )}
                      </div>
                      {/* "—" is the live board's empty cell; on a phone no line says it better. */}
                      {m.text !== "—" || hasPick ? (
                      <div className={`mri-mat t-${m.tone}`}>
                        {m.text !== "—" ? <span>{m.text}</span> : null}
                        {hasPick ? (
                          <span className="mri-mat-sub">
                            {p.jobStartsAt ? <span className="mri-mono">starts {dayOf(p.jobStartsAt)}</span> : null}
                            <Link className="mri-link" href={`/dashboard/jobs/${p.jobId}` as Route}>
                              Pick list →
                            </Link>
                          </span>
                        ) : null}
                      </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ============ WHAT HAPPENED ============ */}
          <section className="mri-sec" aria-labelledby="mri-h-feed">
            <div className="mri-sec-h">
              <h2 className="mri-h2" id="mri-h-feed">
                What happened
              </h2>
              <span className="mri-ann">the last {facts.windowDays} days</span>
            </div>
            {facts.recent.length === 0 ? (
              <div className="mri-empty">
                <b>Nothing has moved yet.</b>
                <span>Receiving a delivery, counting the shelf and loading a truck all land here.</span>
              </div>
            ) : (
              <ul className="mri-card mri-rows">
                {facts.recent.map((m) => {
                  const k = moveKind(m);
                  const who = [m.actor, m.note && m.note !== "Counted" ? m.note : null].filter(Boolean).join(" · ");
                  return (
                    <li key={m.id} className="mri-move">
                      <div className="mri-move-top">
                        <Plate tone={k.tone}>{k.label}</Plate>
                        <span className="mri-mono">{ago(m.at)}</span>
                      </div>
                      <b className="mri-move-t">
                        <span className="mri-move-q">
                          {k.sign}
                          {qty(Math.abs(m.quantity))} {m.unit}
                        </span>{" "}
                        {m.itemName}
                      </b>
                      {who ? <span className="mri-move-x">{who}</span> : null}
                      {m.jobId && m.jobTitle ? (
                        <Link className="mri-link is-job" href={`/dashboard/jobs/${m.jobId}` as Route}>
                          {m.jobTitle}
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ============ SUPPLIERS ============ */}
          <section className="mri-sec" id="mri-sups" aria-labelledby="mri-h-sups">
            <div className="mri-sec-h">
              <h2 className="mri-h2" id="mri-h-sups">
                Suppliers
              </h2>
              {canWrite ? (
                <button type="button" className="mri-ghost is-sm" onClick={() => openSheet("sup")}>
                  <Icon id="i-plus" />
                  Add supplier
                </button>
              ) : (
                <span className="mri-ann">{plural(data.suppliers.length, "supplier")}</span>
              )}
            </div>
            {data.suppliers.length === 0 ? (
              <div className="mri-empty">
                <b>No suppliers yet.</b>
                <span>A supplier with an email is where a purchase order goes.</span>
              </div>
            ) : (
              <ul className="mri-card mri-rows">
                {data.suppliers.map((s) => (
                  <li key={s.id} className="mri-sup">
                    <div className="mri-sup-top">
                      <b className="mri-sup-n">{s.name}</b>
                      <span className="mri-mono">{plural(s.itemCount, "item")}</span>
                    </div>
                    {s.email ? <span className="mri-sup-mail">{s.email}</span> : <span className="mri-sup-mail t-warn">no email — purchase orders cannot go out</span>}
                    {s.phone || s.website ? (
                      <div className="mri-sup-acts">
                        {s.phone ? (
                          <a className="mri-link" href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}>
                            <Icon id="i-phone" />
                            {s.phone}
                          </a>
                        ) : null}
                        {s.website ? (
                          <a className="mri-link" href={s.website.startsWith("http") ? s.website : `https://${s.website}`} target="_blank" rel="noreferrer">
                            Order online
                            <Icon id="i-arrow" />
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      {/* ============ THUMB-ZONE ACTION BAR ============
          A grid row of the shell, not a floating layer: it reserves its own
          height, so the last row of the page is never under it. */}
      {canWrite && (
        <div className="mri-foot">
          <button type="button" className="mri-btn mri-btn-s" onClick={() => openSheet("sup")}>
            Add supplier
          </button>
          <button type="button" className="mri-btn mri-btn-p" onClick={() => openSheet("add")}>
            <Icon id="i-plus" />
            Add item
          </button>
        </div>
      )}

      {/* ============ SHEETS ============ one scrim, three hand-rolled sheets */}
      <div className={`mri-scrim${active ? " on" : ""}`} aria-hidden="true" onClick={closeSheet} />

      <Sheet
        id="mri-sheet-item"
        open={active === "item"}
        onClose={closeSheet}
        title={sheetRow?.r.name ?? ""}
        sub={
          sheetRow ? (
            <div className="mri-sheet-sub">
              <Plate tone={plateOf(sheetRow.r, sheetRow.st).tone}>{plateOf(sheetRow.r, sheetRow.st).text}</Plate>
              <span className="mri-mono">per {sheetRow.r.unit}</span>
            </div>
          ) : null
        }
      >
        {active === "item" && <Flash error={error} note={note} pending={pending} onDismiss={dismiss} inSheet />}
        {sheetRow && (
          <ItemSheetBody
            key={`${sheetRow.r.id}-${seq}`}
            x={sheetRow}
            suppliers={data.suppliers}
            windowDays={facts.windowDays}
            canWrite={canWrite}
            pending={pending}
            onReceive={(n) => run(() => receiveStock(sheetRow.r.id, n), () => `${qty(n)} ${sheetRow.r.unit} of ${sheetRow.r.name} received.`)}
            onCount={(n) => run(() => countStock(sheetRow.r.id, n), () => `${sheetRow.r.name} set to ${qty(n)} ${sheetRow.r.unit}.`)}
            onSave={(p, after) => run(() => upsertInventoryItem({ trade: data.trade, name: sheetRow.r.name, ...p }), () => `${sheetRow.r.name} saved.`, after)}
            onDelete={() =>
              run(
                () => deleteInventoryItem(sheetRow.r.id),
                () => `${sheetRow.r.name} removed.`,
                (ok) => {
                  if (ok) closeSheet();
                },
              )
            }
          />
        )}
      </Sheet>

      {canWrite && (
        <>
          <Sheet id="mri-sheet-add" open={active === "add"} onClose={closeSheet} title="Add item" sub={<span className="mri-mono">{trade.label} stock</span>}>
            {active === "add" && <Flash error={error} note={null} pending={pending} onDismiss={dismiss} inSheet />}
            <AddItemForm
              key={`add-${formSeq}`}
              suppliers={data.suppliers}
              pending={pending}
              onSubmit={(v) =>
                run(
                  () => upsertInventoryItem({ trade: data.trade, ...v }),
                  () => `${v.name} added.`,
                  (ok) => {
                    if (ok) closeAndReset();
                  },
                )
              }
            />
          </Sheet>
          <Sheet id="mri-sheet-sup" open={active === "sup"} onClose={closeSheet} title="Add supplier" sub={<span className="mri-mono">{plural(data.suppliers.length, "supplier")} on file</span>}>
            {active === "sup" && <Flash error={error} note={null} pending={pending} onDismiss={dismiss} inSheet />}
            <AddSupplierForm
              key={`sup-${formSeq}`}
              pending={pending}
              onSubmit={(v) =>
                run(
                  () => upsertSupplier({ name: v.name, email: v.email, phone: v.phone, website: v.website }),
                  () => `${v.name} added.`,
                  (ok) => {
                    if (ok) closeAndReset();
                  },
                )
              }
            />
          </Sheet>
        </>
      )}
    </div>
  );
}
