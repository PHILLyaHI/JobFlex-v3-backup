"use client";

// HVAC INVENTORY · HANDHELD — /mobile-hvac-inventory-v1
//
// The phone build of the HVAC board (/dashboard/hvac-estimator/board): what
// the shop keeps on the shelf, what to order, what the sold jobs will take,
// who it is bought from and what moved. A standalone preview URL; the live
// board and its shared handheld layout (roofing-inventory-mobile.tsx) are
// untouched.
//
// ONE MODEL, NOT A FORK. Every figure, every filter and every write comes from
// useRoofingInventory — the hook the desk board and the current phone layout
// both run — so the three cannot disagree about what is short, what to order
// or what a save did. What lives in this file is presentation only: which
// sheet is up and what it shows while it slides away, and where the list is
// scrolled when a section changes.
//
// THE SHAPE. The page answers one question first — does anything need
// ordering? — in the status card under the title, with the one button that
// goes and deals with it. Under that, the five sections sit in a framed strip
// that sticks under the top bar, so a section is one tap away from anywhere in
// a long list. An item row is a single tap target; everything you do to an
// item (receive, count, edit) happens in one bottom sheet with its figures on
// top and the action button under the thumb.
//
// STYLES: ./mobile-hvac-inventory.css — a plain stylesheet under one root
// class, never a CSS module (see its header for why that matters here).

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileText,
  Globe,
  ListChecks,
  Mail,
  Package,
  Phone,
  Plus,
  Search,
  Send,
  ShoppingCart,
  Store,
  TriangleAlert,
  Truck,
  X,
  type LucideIcon,
} from "lucide-react";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import {
  ago,
  dayOf,
  materialsOf,
  moveLabel,
  perJobStatus,
  qty,
  statusLabel,
  stockStatus,
  usd,
  useRoofingInventory,
  type InventoryRow,
  type InventoryTab,
  type InventoryWorkspace,
  type RoofingInventoryProps,
} from "@/components/v3/roofing-inventory/roofing-inventory-model";
import { isStocked, type StockRow } from "@/lib/inventory";
import { lockScroll } from "@/lib/scrollLock";
import { MhiSheet } from "./mhi-sheet";
import { MhiStockChecklist } from "./mhi-checklist";
import { ItemFacts, ItemFigures, ItemHeadline, ItemSettingsForm, ModeSwitch, QuantityForm, SupplierForm, type ItemMode } from "./mhi-forms";
import "./mobile-hvac-inventory.css";

/* ---------- constants & small helpers ------------------------------------ */

const TABS: Array<{ id: InventoryTab; label: string; icon: LucideIcon }> = [
  { id: "stock", label: "Stock", icon: Package },
  { id: "orders", label: "Orders", icon: Truck },
  { id: "proposals", label: "Jobs", icon: FileText },
  { id: "suppliers", label: "Suppliers", icon: Store },
  { id: "activity", label: "Activity", icon: Clock3 },
];

/** What the sheet is showing. Kept apart from the model's open flags so the
 *  content stays put while the sheet slides away after a save closes it. */
type SheetDesc =
  | { kind: "item"; itemId: string; mode: ItemMode }
  | { kind: "view"; itemId: string }
  | { kind: "add" }
  | { kind: "supplier" };

type OpenFn = (event: ReactMouseEvent<HTMLElement>) => void;
type OpenItemFn = (event: ReactMouseEvent<HTMLElement>, itemId: string) => void;
type SelectTabFn = (tab: InventoryTab, anchor?: string) => void;

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const lines = (n: number) => `${n} ${n === 1 ? "line" : "lines"}`;
const items = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;

/** Where a tap on an item lands first: a stocked item that has never been
 *  counted opens on Count (step 2 of the setup), everything else on Receive. */
function firstMode(r: StockRow | undefined, w: InventoryWorkspace): ItemMode {
  if (!r || !isStocked(r)) return "receive";
  const counted = r.onHand !== 0 || Boolean(w.facts.items[r.id]?.lastMoveAt);
  return counted ? "receive" : "count";
}

/** A website link only when it is one — never a javascript: or mailto: URL. */
function supplierWebsite(value: string | null): string | null {
  if (!value || (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^https?:/i.test(value))) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mhi-empty">
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

/* ---------- the page ------------------------------------------------------ */

export function MobileHvacInventory(props: RoofingInventoryProps) {
  const w = useRoofingInventory(props);
  const [desc, setDesc] = useState<SheetDesc | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  /** Bumped on every open: remounts the forms, so a sheet never opens holding
   *  what was typed the last time. */
  const [seq, setSeq] = useState(0);
  const scrollRef = useRef<HTMLElement | null>(null);
  const markRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // The page owns the viewport while it is mounted, like every handheld page:
  // the real visible height is published as --app-h (a phone's URL bar and
  // keyboard change it mid-use), and the body under the fixed root is locked.
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => root.style.setProperty("--app-h", `${window.visualViewport?.height ?? window.innerHeight}px`);
    apply();
    window.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("resize", apply);
    const release = lockScroll();
    return () => {
      window.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("resize", apply);
      root.style.removeProperty("--app-h");
      release();
    };
  }, []);

  /* ---- sections --------------------------------------------------------- */

  /** Switch section and keep the strip where the eye is: a list scrolled past
   *  the strip is brought back so the new section starts right under it, and
   *  an anchor (the "Review orders" jump) is scrolled to directly. */
  const selectTab: SelectTabFn = (tab, anchor) => {
    w.setTab(tab);
    requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      const mark = markRef.current;
      if (!scroller || !mark) return;
      const target = anchor ? document.getElementById(anchor) : null;
      if (target) {
        target.scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" });
        return;
      }
      if (scroller.scrollTop > mark.offsetTop) scroller.scrollTop = mark.offsetTop;
    });
  };

  const onTabKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const at = TABS.findIndex((t) => t.id === w.tab);
    let next = -1;
    if (event.key === "ArrowRight") next = (at + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (at - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    event.preventDefault();
    selectTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  const openChecklist = () => {
    w.dismissFeedback();
    w.setSetupOpen(true);
    selectTab("stock");
  };

  /* ---- the sheet -------------------------------------------------------- */

  const remember = (event: ReactMouseEvent<HTMLElement>) => {
    triggerRef.current = event.currentTarget;
  };

  const openItem: OpenItemFn = (event, itemId) => {
    remember(event);
    w.dismissFeedback();
    if (w.canWrite) {
      const mode = firstMode(
        w.data.rows.find((r) => r.id === itemId),
        w,
      );
      w.setSupplierOpen(false);
      w.setItemPanel({ mode, itemId });
      setDesc({ kind: "item", itemId, mode });
    } else {
      setDesc({ kind: "view", itemId });
      setViewOpen(true);
    }
    setSeq((n) => n + 1);
  };

  const switchMode = (mode: ItemMode) => {
    if (desc?.kind !== "item") return;
    w.dismissFeedback();
    w.setItemPanel({ mode, itemId: desc.itemId });
    setDesc({ kind: "item", itemId: desc.itemId, mode });
  };

  const openAdd: OpenFn = (event) => {
    remember(event);
    w.dismissFeedback();
    w.setSupplierOpen(false);
    w.setItemPanel({ mode: "add" });
    setDesc({ kind: "add" });
    setSeq((n) => n + 1);
  };

  const openSupplier: OpenFn = (event) => {
    remember(event);
    w.dismissFeedback();
    w.setItemPanel(null);
    w.setSupplierOpen(true);
    setDesc({ kind: "supplier" });
    setSeq((n) => n + 1);
  };

  const closeSheet = () => {
    if (w.pending) return;
    w.setItemPanel(null);
    w.setSupplierOpen(false);
    setViewOpen(false);
  };

  // Open is read from the MODEL (a successful save closes it there); what the
  // sheet shows is read from `desc`, which only a tap here changes.
  const sheetOpen =
    desc?.kind === "item"
      ? w.canWrite && Boolean(w.itemPanel) && w.itemPanel?.mode !== "add"
      : desc?.kind === "add"
        ? w.canWrite && w.itemPanel?.mode === "add"
        : desc?.kind === "supplier"
          ? w.canWrite && w.supplierOpen
          : desc?.kind === "view"
            ? viewOpen
            : false;
  const sheetItem = desc && (desc.kind === "item" || desc.kind === "view") ? w.data.rows.find((r) => r.id === desc.itemId) : undefined;
  const formId = `mhi-form-${seq}`;

  let sheetKicker = "";
  let sheetTitle = "";
  let sheetBody: ReactNode = null;
  let sheetFoot: ReactNode = null;
  const cancel = (
    <button type="button" className="mhi-btn mhi-btn-secondary" disabled={w.pending} onClick={closeSheet}>
      Cancel
    </button>
  );
  const submit = (label: string) => (
    <button type="submit" form={formId} className="mhi-btn mhi-btn-primary" disabled={w.pending}>
      {w.pending ? "Saving…" : label}
    </button>
  );
  const sheetError = w.error ? (
    <p className="mhi-alert" role="alert">
      <TriangleAlert size={18} aria-hidden="true" />
      <span>{w.error}</span>
    </p>
  ) : null;

  if (desc?.kind === "item" || desc?.kind === "view") {
    sheetKicker = `${w.tradeLabel} stock item${sheetItem ? ` · in ${sheetItem.unit}` : ""}`;
    sheetTitle = sheetItem?.name ?? "Stock item";
    if (sheetItem) {
      const mode = desc.kind === "item" ? desc.mode : null;
      sheetBody = (
        <>
          <ItemHeadline r={sheetItem} />
          <ItemFigures r={sheetItem} />
          {mode && <ModeSwitch mode={mode} pending={w.pending} onMode={switchMode} />}
          {sheetError}
          {mode === "receive" || mode === "count" ? (
            <QuantityForm key={`${formId}-${mode}`} w={w} r={sheetItem} mode={mode} formId={`${formId}-${mode}`} />
          ) : mode === "edit" ? (
            <ItemSettingsForm key={`${formId}-edit`} w={w} item={sheetItem} formId={`${formId}-edit`} />
          ) : null}
          <div className="mhi-sheet-sec">
            <h3 className="mhi-sheet-sectitle">Item details</h3>
            <ItemFacts w={w} r={sheetItem} />
          </div>
        </>
      );
      if (mode) {
        sheetFoot = (
          <>
            {cancel}
            <button type="submit" form={`${formId}-${mode}`} className="mhi-btn mhi-btn-primary" disabled={w.pending}>
              {w.pending ? "Saving…" : mode === "receive" ? "Receive stock" : mode === "count" ? "Set count" : "Save changes"}
            </button>
          </>
        );
      } else {
        sheetFoot = (
          <button type="button" className="mhi-btn mhi-btn-secondary mhi-btn-wide" onClick={closeSheet}>
            Close
          </button>
        );
      }
    }
  } else if (desc?.kind === "add") {
    sheetKicker = `${w.tradeLabel} stock list`;
    sheetTitle = "Add stock item";
    sheetBody = (
      <>
        {sheetError}
        <ItemSettingsForm key={formId} w={w} formId={formId} />
      </>
    );
    sheetFoot = (
      <>
        {cancel}
        {submit("Add item")}
      </>
    );
  } else if (desc?.kind === "supplier") {
    sheetKicker = "Where you buy";
    sheetTitle = "Add supplier";
    sheetBody = (
      <>
        {sheetError}
        <SupplierForm key={formId} w={w} formId={formId} />
      </>
    );
    sheetFoot = (
      <>
        {cancel}
        {submit("Add supplier")}
      </>
    );
  }

  /* ---- render ----------------------------------------------------------- */

  const orderDots = w.data.orders.length + w.orderBadge;
  const showFeedback = Boolean(w.error || w.note) && !sheetOpen;

  return (
    <div className="jf-mobile-hvac-inventory" aria-busy={w.pending || undefined}>
      {/* Shared handheld chrome: the ink top bar, the drawer and the sprite. */}
      <MobileNav />

      <main className="mhi-scroll" ref={scrollRef}>
        <div className="mhi-content">
          <header className="mhi-head">
            <Link className="mhi-back" href={w.estimatorHref}>
              <ArrowLeft size={16} aria-hidden="true" />
              {w.tradeLabel} estimator
            </Link>
            <h1 className="mhi-title">{w.tradeLabel} inventory</h1>
            {!w.canWrite && <p className="mhi-readonly">View only · stock changes are managed by your office.</p>}
          </header>

          <StatusCard w={w} selectTab={selectTab} />

          <div className="mhi-mark" ref={markRef} aria-hidden="true" />
          <div className="mhi-dock">
            <div className="mhi-tabs" role="tablist" aria-label="Inventory sections" onKeyDown={onTabKey}>
              {TABS.map(({ id, label, icon: Icon }, i) => {
                const on = w.tab === id;
                return (
                  <button
                    key={id}
                    ref={(node) => {
                      tabRefs.current[i] = node;
                    }}
                    type="button"
                    role="tab"
                    id={`mhi-tab-${id}`}
                    aria-selected={on}
                    aria-controls="mhi-panel"
                    tabIndex={on ? 0 : -1}
                    className="mhi-tab"
                    onClick={() => selectTab(id)}
                  >
                    <span className="mhi-tab-ic">
                      <Icon size={20} aria-hidden="true" />
                      {id === "orders" && orderDots > 0 && (
                        <i className="mhi-tab-badge" aria-hidden="true">
                          {orderDots > 99 ? "99+" : orderDots}
                        </i>
                      )}
                    </span>
                    <span className="mhi-tab-lbl">{label}</span>
                    {id === "orders" && orderDots > 0 && <span className="mhi-sr">, {orderDots} to look at</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mhi-panel" id="mhi-panel" role="tabpanel" aria-labelledby={`mhi-tab-${w.tab}`}>
            {w.tab === "stock" && <StockSection w={w} onOpenItem={openItem} onAdd={openAdd} openChecklist={openChecklist} selectTab={selectTab} />}
            {w.tab === "orders" && <OrdersSection w={w} onAddSupplier={openSupplier} selectTab={selectTab} />}
            {w.tab === "proposals" && <JobsSection w={w} />}
            {w.tab === "suppliers" && <SuppliersSection w={w} onAddSupplier={openSupplier} />}
            {w.tab === "activity" && <ActivitySection w={w} />}
          </div>
        </div>
      </main>

      {/* The receipt of the last write, or why it failed — a row of the page
          grid under the scroller, so it is in view wherever the list is
          scrolled (an emailed purchase order must never look unsent) and it
          covers nothing: the scroller gives up the height instead. */}
      {showFeedback && (
        <div className="mhi-feedback" data-tone={w.error ? "error" : "ok"} role={w.error ? "alert" : "status"}>
          {w.error ? <TriangleAlert size={20} aria-hidden="true" /> : <Check size={20} strokeWidth={3} aria-hidden="true" />}
          <span>{w.error || w.note}</span>
          <button type="button" className="mhi-iconbtn" aria-label="Dismiss message" onClick={w.dismissFeedback}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
      )}

      <MhiSheet open={sheetOpen} busy={w.pending} kicker={sheetKicker} title={sheetTitle} onClose={closeSheet} returnFocus={triggerRef} foot={sheetFoot}>
        {sheetBody}
      </MhiSheet>
    </div>
  );
}

export default MobileHvacInventory;

/* ---------- the answer: does anything need ordering? --------------------- */

function StatusCard({ w, selectTab }: { w: InventoryWorkspace; selectTab: SelectTabFn }) {
  if (w.data.rows.length === 0) return null;
  const onWay = w.data.orders.length;
  if (w.needs.length > 0) {
    const tone = w.soldShort ? "danger" : "warning";
    return (
      <section className="mhi-status" data-tone={tone} aria-labelledby="mhi-status-h">
        <div className="mhi-status-top">
          <span className="mhi-status-plate" aria-hidden="true">
            <TriangleAlert size={20} />
          </span>
          <div className="mhi-status-txt">
            <h2 className="mhi-status-title" id="mhi-status-h">
              {w.needs.length} {w.needs.length === 1 ? "item needs" : "items need"} ordering
            </h2>
            <p className="mhi-status-sub">
              {w.soldShort ? `${w.soldShort} short for sold jobs` : "Below the reorder level or needed for open proposals"}
              {w.orderCost > 0 ? ` · about ${usd(w.orderCost)} at last cost` : ""}
              {onWay ? ` · ${onWay} ${onWay === 1 ? "order" : "orders"} on the way` : ""}
            </p>
          </div>
        </div>
        <button type="button" className="mhi-btn mhi-btn-primary mhi-btn-wide" onClick={() => selectTab("orders", "mhi-restock")}>
          Review orders
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </section>
    );
  }
  const settled = w.buyLines === 0 && w.uncounted === 0;
  return (
    <section className="mhi-status" data-tone={settled ? "success" : "neutral"} aria-labelledby="mhi-status-h">
      <div className="mhi-status-top">
        <span className="mhi-status-plate" aria-hidden="true">
          {settled ? <Check size={20} strokeWidth={3} /> : <ListChecks size={20} />}
        </span>
        <div className="mhi-status-txt">
          <h2 className="mhi-status-title" id="mhi-status-h">
            Nothing to restock
          </h2>
          <p className="mhi-status-sub">
            {w.buyLines
              ? `${lines(w.buyLines)} to buy for sold jobs — bought per job, not shelf stock.`
              : "Stocked items cover the work and the reorder levels."}
            {w.uncounted ? ` ${items(w.uncounted)} still ${w.uncounted === 1 ? "shows" : "show"} 0 on hand — count the shelf.` : ""}
          </p>
        </div>
      </div>
      {(w.buyLines > 0 || onWay > 0) && (
        <button type="button" className="mhi-textbtn" onClick={() => selectTab("orders", w.buyLines ? "mhi-buy" : "mhi-onway")}>
          {w.buyLines ? "Open the shopping list" : `${onWay} ${onWay === 1 ? "order" : "orders"} on the way`}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}

/* ---------- STOCK ------------------------------------------------------- */

function ItemRow({ item, onOpen }: { item: InventoryRow; onOpen: OpenItemFn }) {
  const { r, st } = item;
  const status = stockStatus(r, st);
  const loud = status.tone === "danger" || status.tone === "warning";
  const perJob = st === "perjob";
  // A per-job item's figure is what sold jobs need of it; its status line
  // then says only what the figure cannot (a forecast, or nothing yet).
  const stateText = perJob ? (r.reserved > 0 ? "Bought per job" : perJobStatus(r)) : status.text;
  return (
    <li>
      <button type="button" className="mhi-item" data-state={st} aria-haspopup="dialog" onClick={(event) => onOpen(event, r.id)}>
        <span className="mhi-item-main">
          <span className="mhi-item-name">{r.name}</span>
          {loud ? (
            <span className="mhi-stamp" data-tone={status.tone}>
              {status.text}
            </span>
          ) : (
            <span className="mhi-item-state">{stateText}</span>
          )}
          <span className="mhi-item-sub">
            <b>{qty(r.onHand)}</b> on hand · <b>{qty(r.reserved)}</b> reserved
            {r.forecast > 0 && (
              <>
                {" "}
                · <b>{qty(r.forecast)}</b> forecast
              </>
            )}
          </span>
        </span>
        <span className="mhi-item-fig" data-short={(!perJob && r.available < 0) || undefined}>
          <b>{qty(perJob ? r.reserved : r.available)}</b>
          <small>{r.unit}</small>
          <em>{perJob ? "Sold jobs need" : "Available"}</em>
        </span>
        <ChevronRight className="mhi-item-go" size={18} aria-hidden="true" />
      </button>
    </li>
  );
}

function StockSection({
  w,
  onOpenItem,
  onAdd,
  openChecklist,
  selectTab,
}: {
  w: InventoryWorkspace;
  onOpenItem: OpenItemFn;
  onAdd: OpenFn;
  openChecklist: () => void;
  selectTab: SelectTabFn;
}) {
  // The checklist replaces the list on request, and for a company whose list
  // is still empty — the model's own rule, as on the desk.
  const editing = w.canWrite && (w.setupOpen || (w.data.rows.length === 0 && w.data.catalog.length > 0));
  if (editing) return <MhiStockChecklist key="checklist" w={w} />;

  const decided = w.data.policy.decided;
  const counted = w.rows.length > 0 && w.uncounted === 0;
  const connected = w.connected > 0;
  const emptyChip = w.chips.find((c) => c.id === "EMPTY");

  return (
    <section className="mhi-sec" aria-labelledby="mhi-stock-h">
      <div className="mhi-sechead">
        <div className="mhi-sechead-txt">
          <h2 className="mhi-sectitle" id="mhi-stock-h">
            Stock
          </h2>
          <p className="mhi-secmeta">
            {w.rows.length} kept in stock{w.perJobRows.length ? ` · ${w.perJobRows.length} bought per job` : ""}
          </p>
        </div>
        {w.canWrite && (
          <button type="button" className="mhi-btn mhi-btn-primary" aria-haspopup="dialog" disabled={w.pending} onClick={onAdd}>
            <Plus size={18} aria-hidden="true" />
            Add item
          </button>
        )}
      </div>

      {w.canWrite &&
        (decided && counted && connected ? (
          <div className="mhi-card mhi-policyline">
            <p>
              <b>What we stock</b>
              <span>
                {w.data.policy.stocked} kept in stock · {w.data.policy.perJob} bought per job
              </span>
            </p>
            <button type="button" className="mhi-btn mhi-btn-secondary" onClick={openChecklist}>
              <ListChecks size={16} aria-hidden="true" />
              Change
            </button>
          </div>
        ) : (
          <ol className="mhi-card mhi-guide" aria-label="Setting up the inventory">
            <li data-done={decided || undefined}>
              <b aria-hidden="true">{decided ? <Check size={16} strokeWidth={3} /> : 1}</b>
              <div>
                <strong>What you stock</strong>
                <span>{decided ? `${w.data.policy.stocked} kept in stock · ${w.data.policy.perJob} bought per job` : "Tick what you keep on the shelf; the rest is bought per job."}</span>
                <button type="button" className="mhi-btn mhi-btn-secondary mhi-btn-sm" onClick={openChecklist}>
                  <ListChecks size={16} aria-hidden="true" />
                  {decided ? "Change what we stock" : "Set up"}
                </button>
              </div>
            </li>
            <li data-done={counted || undefined}>
              <b aria-hidden="true">{counted ? <Check size={16} strokeWidth={3} /> : 2}</b>
              <div>
                <strong>Count the shelf</strong>
                <span>
                  {w.rows.length === 0
                    ? "Once the list is saved, enter what you have on hand."
                    : w.uncounted
                      ? `${w.uncounted} stocked ${w.uncounted === 1 ? "item still shows" : "items still show"} 0 on hand — tap one, then Count.`
                      : "Every stocked item has a count."}
                </span>
                {w.uncounted > 0 && emptyChip && emptyChip.n > 0 && w.filter !== "EMPTY" && (
                  <button type="button" className="mhi-textbtn" onClick={() => w.setFilter("EMPTY")}>
                    Show items with nothing on hand ({emptyChip.n})
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
            <li data-done={connected || undefined}>
              <b aria-hidden="true">{connected ? <Check size={16} strokeWidth={3} /> : 3}</b>
              <div>
                <strong>Proposals draw on it</strong>
                <span>
                  {connected
                    ? `${w.connected} connected · sold jobs reserve stock, open ones forecast it.`
                    : "New estimates connect by default: sold jobs reserve stock, open ones forecast it."}
                </span>
                <button type="button" className="mhi-textbtn" onClick={() => selectTab("proposals")}>
                  Jobs &amp; proposals
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
            </li>
          </ol>
        ))}

      {w.data.rows.length > 0 && (
        <div className="mhi-tools">
          <label className="mhi-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={w.q}
              onChange={(e) => w.setQ(e.target.value)}
              placeholder="Find an item, supplier or SKU"
              aria-label={`Search ${w.tradeLabel} stock`}
              enterKeyHint="search"
            />
            {w.q && (
              <button type="button" className="mhi-search-x" aria-label="Clear search" onClick={() => w.setQ("")}>
                <X size={18} aria-hidden="true" />
              </button>
            )}
          </label>
          <label className="mhi-field">
            <span className="mhi-label">Show</span>
            <span className="mhi-selectwrap">
              <select className="mhi-select" value={w.filter} onChange={(e) => w.setFilter(e.target.value as InventoryWorkspace["filter"])}>
                {w.chips.map((chip) => (
                  <option key={chip.id} value={chip.id}>
                    {chip.label} ({chip.n})
                  </option>
                ))}
              </select>
            </span>
          </label>
          <div className="mhi-sort">
            <span className="mhi-label" id="mhi-sort-lbl">
              Sort
            </span>
            <div className="mhi-seg2" role="group" aria-labelledby="mhi-sort-lbl">
              <button type="button" aria-pressed={w.view === "urgency"} onClick={() => w.setView("urgency")}>
                Most urgent
              </button>
              <button type="button" aria-pressed={w.view === "category"} onClick={() => w.setView("category")}>
                By category
              </button>
            </div>
          </div>
          {w.filter === "IDLE" && (
            <p className="mhi-note">
              No use or demand in the last {w.facts.windowDays} days{w.idleValue > 0 ? ` · ${usd(w.idleValue)} at last cost` : ""}.
            </p>
          )}
          {w.filter === "PERJOB" && (
            <p className="mhi-note">
              Bought for each job, not kept on the shelf: never low, never on a restock order. When a job sells, these go on its shopping list under Orders.
            </p>
          )}
        </div>
      )}

      {w.data.rows.length === 0 ? (
        <Empty title={`No ${w.tradeLabel} stock list yet`}>Your office sets up what the company keeps in stock and what it buys per job.</Empty>
      ) : (
        <>
          {w.shown.length > 0 && (
            <div className="mhi-card mhi-list">
              {w.sections.map((section) => (
                <div key={section.label ?? "all"} className="mhi-group">
                  {section.label && (
                    <h3 className="mhi-cat">
                      {section.label}
                      <span>
                        {section.items.length}
                        {section.needs ? ` · ${section.needs} to order` : ""}
                      </span>
                    </h3>
                  )}
                  <ul className="mhi-items">
                    {section.items.map((item) => (
                      <ItemRow key={item.r.id} item={item} onOpen={onOpenItem} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {w.folded.length > 0 && (
            <div className="mhi-card mhi-fold" data-per-job>
              <button type="button" className="mhi-fold-btn" aria-expanded={w.showPerJob} aria-controls="mhi-perjob" onClick={() => w.setShowPerJob(!w.showPerJob)}>
                <ShoppingCart size={18} aria-hidden="true" />
                <span className="mhi-fold-txt">
                  <b>
                    {items(w.folded.length)} bought per job
                  </b>
                  <small>Not shelf stock — never on a restock order</small>
                </span>
                <ChevronDown className="mhi-chev" size={20} aria-hidden="true" />
              </button>
              {w.showPerJob && (
                <ul className="mhi-items" id="mhi-perjob">
                  {w.folded.map((item) => (
                    <ItemRow key={item.r.id} item={item} onOpen={onOpenItem} />
                  ))}
                </ul>
              )}
            </div>
          )}
          {w.shown.length === 0 && w.folded.length === 0 && (
            <Empty
              title="No matching items"
              action={
                <button
                  type="button"
                  className="mhi-btn mhi-btn-secondary"
                  onClick={() => {
                    w.setQ("");
                    w.setFilter("ALL");
                  }}
                >
                  Show all items
                </button>
              }
            >
              {w.q.trim() ? `No results for “${w.q.trim()}”. Try a material name, supplier or SKU.` : "There are no items in this filter."}
            </Empty>
          )}
          <details className="mhi-legend">
            <summary>
              What the numbers mean
              <ChevronDown className="mhi-chev" size={18} aria-hidden="true" />
            </summary>
            <dl>
              <div>
                <dt>Available</dt>
                <dd>On hand, less what sold jobs have reserved.</dd>
              </div>
              <div>
                <dt>Reserved</dt>
                <dd>Held for sold jobs that have not loaded yet.</dd>
              </div>
              <div>
                <dt>Forecast</dt>
                <dd>What open proposals would take if they sell.</dd>
              </div>
              <div>
                <dt>Bought per job</dt>
                <dd>Not shelf stock — it goes on the job&apos;s shopping list under Orders.</dd>
              </div>
            </dl>
          </details>
        </>
      )}

      {w.canWrite && (w.data.presets.missing > 0 || w.data.untracked.length > 0) && (
        <details className="mhi-card mhi-more">
          <summary>
            <span className="mhi-more-txt">
              <b>Complete your stock list</b>
              <small>
                {[w.data.presets.missing ? `${w.data.presets.missing} standard items not on it` : "", w.data.untracked.length ? `${w.data.untracked.length} proposal lines not tracked` : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </span>
            <ChevronDown className="mhi-chev" size={20} aria-hidden="true" />
          </summary>
          {w.data.presets.missing > 0 && (
            <div className="mhi-more-block">
              <p>
                {w.data.presets.missing} of {w.data.presets.total} standard {w.tradeLabel} materials are not on your list. Open the checklist to add them — as kept in stock or bought per job.
              </p>
              <button type="button" className="mhi-btn mhi-btn-secondary" disabled={w.pending} onClick={openChecklist}>
                <ListChecks size={16} aria-hidden="true" />
                What we stock
              </button>
            </div>
          )}
          {w.data.untracked.length > 0 && (
            <div className="mhi-more-block">
              <h3>Used in proposals, not tracked</h3>
              <p>Add each item, then count or receive what you have on hand.</p>
              <button type="button" className="mhi-btn mhi-btn-secondary" disabled={w.pending} onClick={w.trackAllItems}>
                Track all {w.data.untracked.length}
              </button>
              <ul className="mhi-untracked">
                {w.data.untracked.map((line) => (
                  <li key={line.name}>
                    <span>
                      {line.name}
                      <small>{line.unit || "each"}</small>
                    </span>
                    <button type="button" className="mhi-iconbtn mhi-iconbtn-framed" disabled={w.pending} aria-label={`Track ${line.name}`} onClick={() => w.trackItem(line)}>
                      <Plus size={18} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </details>
      )}
    </section>
  );
}

/* ---------- ORDERS ------------------------------------------------------ */

function OrdersSection({ w, onAddSupplier, selectTab }: { w: InventoryWorkspace; onAddSupplier: OpenFn; selectTab: SelectTabFn }) {
  const total = w.orderCost + w.buyCost;
  return (
    <section className="mhi-sec" aria-labelledby="mhi-orders-h">
      <div className="mhi-sechead">
        <div className="mhi-sechead-txt">
          <h2 className="mhi-sectitle" id="mhi-orders-h">
            Orders
          </h2>
          <p className="mhi-secmeta">{total > 0 ? `About ${usd(total)} to buy at last cost` : "Deliveries, per-job buying and restocking"}</p>
        </div>
      </div>

      {/* 1 · On the way — the desk's first block: what to receive. */}
      <div className="mhi-block mhi-anchor" id="mhi-onway">
        <h3 className="mhi-blocktitle">
          On the way <span className="mhi-count">{w.data.orders.length}</span>
        </h3>
        {w.data.orders.length === 0 ? (
          <p className="mhi-quiet">No purchase orders are awaiting delivery.</p>
        ) : (
          <>
            <p className="mhi-note">Mark an order received when the full delivery arrives.</p>
            {w.data.orders.map((order) => (
              <article className="mhi-card" key={order.id}>
                <div className="mhi-cardhead">
                  <h4 className="mhi-cardtitle">{order.supplier}</h4>
                  <p className="mhi-cardmeta">
                    Sent {ago(order.sentAt)} · {order.lines.length} material {order.lines.length === 1 ? "line" : "lines"}
                  </p>
                </div>
                <ul className="mhi-lines">
                  {order.lines.map((line, index) => (
                    <li key={`${line.name}-${index}`}>
                      <span className="mhi-line-name">{line.name}</span>
                      <span className="mhi-line-qty">
                        {qty(line.quantity)} <small>{w.data.rows.find((row) => row.name === line.name)?.unit}</small>
                      </span>
                    </li>
                  ))}
                </ul>
                {w.canWrite && (
                  <div className="mhi-cardfoot">
                    <button type="button" className="mhi-btn mhi-btn-primary mhi-btn-wide" disabled={w.pending} onClick={() => w.receiveOrder(order.id)}>
                      <ArrowDownToLine size={18} aria-hidden="true" />
                      Receive full order
                    </button>
                  </div>
                )}
              </article>
            ))}
          </>
        )}
      </div>

      {/* 2 · Buy for upcoming jobs — the per-job shopping list. */}
      <div className="mhi-block mhi-anchor" id="mhi-buy">
        <h3 className="mhi-blocktitle">
          Buy for upcoming jobs <span className="mhi-count">{w.buy.length}</span>
        </h3>
        {w.buy.length === 0 ? (
          <p className="mhi-quiet">
            {w.perJobRows.length ? "Nothing to buy for a job right now." : "Mark items as bought per job in What we stock, and each sold job's shopping list appears here."}
          </p>
        ) : (
          <>
            <p className="mhi-note">
              Per-job materials for the sold jobs still to load, soonest first. One email per supplier.
              {w.buyCost > 0 ? ` About ${usd(w.buyCost)} still to buy at last cost.` : ""}
            </p>
            {w.buy.map((j) => (
              <article className="mhi-card" key={j.job.id} data-buy-job>
                <div className="mhi-cardhead">
                  <div className="mhi-cardhead-row">
                    <h4 className="mhi-cardtitle">{j.job.title}</h4>
                    <span className="mhi-date">{j.job.startsAt ? dayOf(j.job.startsAt) : "Unscheduled"}</span>
                  </div>
                  <p className="mhi-cardmeta">
                    {j.job.client ?? "No client"} · {j.toBuy ? `${lines(j.toBuy)} to buy${j.cost > 0 ? ` · about ${usd(j.cost)}` : ""}` : "everything arrived or is on the way"}
                  </p>
                </div>
                {j.bySupplier.map((g) => (
                  <div key={g.supplierId ?? "none"} className="mhi-buygroup">
                    <div className="mhi-buygroup-head">
                      <p className="mhi-buygroup-name">{g.supplier?.name ?? "No supplier yet"}</p>
                      {g.supplier ? (
                        g.supplier.email ? (
                          <p className="mhi-buygroup-sub">{g.supplier.email}</p>
                        ) : (
                          <>
                            <p className="mhi-warn">No email for purchase orders.</p>
                            <button type="button" className="mhi-textbtn" onClick={() => selectTab("suppliers")}>
                              Open suppliers
                              <ArrowRight size={16} aria-hidden="true" />
                            </button>
                          </>
                        )
                      ) : (
                        <p className="mhi-buygroup-sub">Assign a supplier on each item (tap it on the Stock list → Edit) to email this order.</p>
                      )}
                    </div>
                    <ul className="mhi-lines">
                      {g.lines.map((l) => (
                        <li key={l.itemId}>
                          <span className="mhi-line-name">
                            {l.name}
                            {l.supplierSku && <small className="mhi-sku">{l.supplierSku}</small>}
                            <span className="mhi-stamp mhi-stamp-sm" data-tone={l.toBuy === 0 ? "success" : l.onTheWay ? "neutral" : "warning"}>
                              {l.toBuy === 0 ? "Arrived" : l.onTheWay ? "On the way" : l.have > 0 ? `${qty(l.toBuy)} to buy · ${qty(l.have)} arrived` : "To buy"}
                            </span>
                          </span>
                          <span className="mhi-line-qty">
                            {qty(l.quantity)} <small>{l.unit}</small>
                          </span>
                        </li>
                      ))}
                    </ul>
                    {w.canWrite && g.supplier && (
                      <button
                        type="button"
                        className="mhi-btn mhi-btn-primary mhi-btn-wide"
                        disabled={w.pending || !g.supplier.email || g.toBuy === 0}
                        onClick={() => w.sendJobOrder(j, g.supplierId!, g.lines)}
                      >
                        <Send size={17} aria-hidden="true" />
                        Email order · {lines(g.toBuy)}
                      </button>
                    )}
                  </div>
                ))}
                {j.job.jobId && (
                  <div className="mhi-cardfoot mhi-cardfoot-quiet">
                    <Link className="mhi-textbtn" href={`/dashboard/jobs/${j.job.jobId}` as Route}>
                      Open job
                      <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  </div>
                )}
              </article>
            ))}
          </>
        )}
      </div>

      {/* 3 · Restock the shelf — what the attention card counts. */}
      <div className="mhi-block mhi-anchor" id="mhi-restock">
        <h3 className="mhi-blocktitle">
          Restock the shelf <span className="mhi-count">{w.needs.length}</span>
        </h3>
        {w.needs.length === 0 ? (
          <Empty
            title={w.data.rows.length ? "Nothing to restock" : "Add materials to see what to order"}
            action={
              w.data.rows.length === 0 ? (
                <button type="button" className="mhi-btn mhi-btn-secondary" onClick={() => selectTab("stock")}>
                  Open the stock list
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              ) : undefined
            }
          >
            {w.data.rows.length
              ? `Stocked items cover the work and the reorder levels.${w.data.untracked.length ? ` ${w.data.untracked.length} proposal material lines are not tracked yet.` : ""}`
              : "Your stock list is empty. Set up what you stock and count it to calculate shortages."}
          </Empty>
        ) : (
          <>
            <p className="mhi-note">
              Items kept in stock that are low or short. Quantities cover sold jobs, open proposals and the reorder level.
              {w.orderCost > 0 ? ` Estimated ${usd(w.orderCost)} at last cost.` : ""}
            </p>
            {[...w.bySupplier.entries()].map(([supplierId, list]) => {
              const supplier = w.data.suppliers.find((s) => s.id === supplierId);
              return (
                <article className="mhi-card" key={supplierId}>
                  <div className="mhi-cardhead">
                    <div className="mhi-cardhead-row">
                      <h4 className="mhi-cardtitle">{supplier?.name ?? "Supplier"}</h4>
                      <span className="mhi-date">{items(list.length)}</span>
                    </div>
                    {supplier?.email ? (
                      <p className="mhi-cardmeta">{supplier.email}</p>
                    ) : (
                      <>
                        <p className="mhi-warn">No email for purchase orders.</p>
                        <button type="button" className="mhi-textbtn" onClick={() => selectTab("suppliers")}>
                          Open suppliers
                          <ArrowRight size={16} aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                  <ul className="mhi-lines">
                    {list.map((r) => (
                      <li key={r.id}>
                        <span className="mhi-line-name">
                          {r.name}
                          {r.supplierSku && <small className="mhi-sku">{r.supplierSku}</small>}
                        </span>
                        <span className="mhi-line-qty">
                          {qty(r.suggestedOrder)} <small>{r.unit}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {w.canWrite && (
                    <div className="mhi-cardfoot">
                      <button type="button" className="mhi-btn mhi-btn-primary mhi-btn-wide" disabled={w.pending || !supplier?.email} onClick={() => w.sendOrder(supplierId, list)}>
                        <Send size={17} aria-hidden="true" />
                        Email purchase order · {lines(list.length)}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
            {w.unassigned.length > 0 && (
              <article className="mhi-card">
                <div className="mhi-cardhead">
                  <div className="mhi-cardhead-row">
                    <h4 className="mhi-cardtitle">Choose a supplier</h4>
                    <span className="mhi-date">{items(w.unassigned.length)}</span>
                  </div>
                  <p className="mhi-cardmeta">Assign each material to include it in a supplier&apos;s order.</p>
                </div>
                <ul className="mhi-assign">
                  {w.unassigned.map((r) => (
                    <li key={r.id}>
                      <div className="mhi-assign-top">
                        <span className="mhi-line-name">{r.name}</span>
                        <span className="mhi-line-qty">
                          {qty(r.suggestedOrder)} <small>{r.unit}</small>
                        </span>
                      </div>
                      {w.canWrite && w.data.suppliers.length > 0 ? (
                        <span className="mhi-selectwrap">
                          <select
                            className="mhi-select"
                            aria-label={`Supplier for ${r.name}`}
                            value=""
                            disabled={w.pending}
                            onChange={(e) => {
                              if (e.target.value) w.assignSupplier(r, e.target.value);
                            }}
                          >
                            <option value="">Choose supplier</option>
                            {w.data.suppliers.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </span>
                      ) : (
                        <p className="mhi-cardmeta">No supplier assigned</p>
                      )}
                    </li>
                  ))}
                </ul>
                {w.canWrite && (
                  <div className="mhi-cardfoot">
                    {w.data.suppliers.length === 0 && <p className="mhi-cardmeta">Add a supplier with an email address to send purchase orders.</p>}
                    <button type="button" className="mhi-btn mhi-btn-secondary mhi-btn-wide" aria-haspopup="dialog" onClick={onAddSupplier}>
                      <Plus size={18} aria-hidden="true" />
                      Add supplier
                    </button>
                  </div>
                )}
              </article>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* ---------- JOBS -------------------------------------------------------- */

function JobsSection({ w }: { w: InventoryWorkspace }) {
  const next = w.next;
  return (
    <section className="mhi-sec" aria-labelledby="mhi-jobs-h">
      <div className="mhi-sechead">
        <div className="mhi-sechead-txt">
          <h2 className="mhi-sectitle" id="mhi-jobs-h">
            Jobs &amp; proposals
          </h2>
          <p className="mhi-secmeta">Sold work reserves stock. Open proposals forecast it.</p>
        </div>
        <Link className="mhi-btn mhi-btn-secondary" href={w.estimatorHref}>
          Estimator
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>

      {next && (
        <article className="mhi-card mhi-next">
          <div className="mhi-cardhead">
            <p className="mhi-kick">
              <Truck size={16} aria-hidden="true" />
              Next to load{next.startsAt ? ` · ${dayOf(next.startsAt)}` : " · unscheduled"}
            </p>
            <h3 className="mhi-cardtitle">{next.title}</h3>
            <p className="mhi-next-state" data-tone={w.nextShort ? "danger" : "neutral"}>
              {w.nextShort
                ? `${w.nextShort} material ${w.nextShort === 1 ? "line is" : "lines are"} short on the shelf${w.nextBuy ? ` · ${w.nextBuy} to buy for the job` : ""}`
                : w.nextBuy
                  ? `${lines(w.nextBuy)} to buy for the job`
                  : w.nextPick.some((line) => !line.itemId)
                    ? `${w.nextPick.filter((line) => !line.itemId).length} untracked material lines`
                    : w.nextPick.length
                      ? "Stocked materials are on hand"
                      : "No material lines yet"}
            </p>
          </div>
          <div className="mhi-cardfoot mhi-cardfoot-quiet">
            <Link className="mhi-textbtn" href={`/dashboard/jobs/${next.jobId}` as Route}>
              Open pick list
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </article>
      )}

      {w.proposals.length > 0 && (
        <label className="mhi-field">
          <span className="mhi-label">Show</span>
          <span className="mhi-selectwrap">
            <select className="mhi-select" value={w.ptab} onChange={(e) => w.setPtab(e.target.value as InventoryWorkspace["ptab"])}>
              {w.ptabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.label} ({tab.n})
                </option>
              ))}
            </select>
          </span>
        </label>
      )}

      {w.proposals.length === 0 ? (
        <Empty
          title={`No ${w.tradeLabel} proposals yet`}
          action={
            <Link className="mhi-btn mhi-btn-primary" href={w.estimatorHref}>
              Open {w.tradeLabel} estimator
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          }
        >
          Create an estimate to see its material needs here.
        </Empty>
      ) : w.listedProposals.length === 0 ? (
        <Empty title="No proposals in this view">Choose another proposal status to see your work.</Empty>
      ) : (
        <ul className="mhi-card mhi-rows">
          {w.listedProposals.map((proposal) => {
            const material = materialsOf(proposal, w.data.rows);
            const pick = proposal.linked && proposal.jobId && (proposal.status === "ACCEPTED" || proposal.status === "COMPLETED");
            return (
              <li key={proposal.id} className="mhi-prop">
                <div className="mhi-prop-top">
                  <span className="mhi-stamp" data-tone={proposal.status === "ACCEPTED" ? "info" : "neutral"}>
                    {statusLabel(proposal.status)}
                  </span>
                  <b className="mhi-money-lg">{usd(proposal.total)}</b>
                </div>
                <Link className="mhi-prop-title" href={`/dashboard/manual-blueprint?proposal=${proposal.id}` as Route}>
                  <span>{proposal.title}</span>
                  <ChevronRight size={18} aria-hidden="true" />
                </Link>
                <p className="mhi-prop-meta">
                  {proposal.client || "No client"} · {dayOf(proposal.createdAt)} · {proposal.lines.length} material {proposal.lines.length === 1 ? "line" : "lines"}
                </p>
                <p className="mhi-material" data-tone={material.tone}>
                  <ClipboardList size={17} aria-hidden="true" />
                  <span>{material.text}</span>
                </p>
                {proposal.linked && proposal.status === "ACCEPTED" && <p className="mhi-prop-meta">{proposal.loaded ? "Loaded" : "Reserved in stock"}</p>}
                {proposal.inferred && <p className="mhi-prop-meta">Matched by its {w.tradeLabel} materials</p>}
                {(pick || w.canWrite) && (
                  <div className="mhi-prop-acts">
                    {pick && (
                      <Link className="mhi-textbtn" href={`/dashboard/jobs/${proposal.jobId}` as Route}>
                        Pick list{proposal.jobStartsAt ? ` · ${dayOf(proposal.jobStartsAt)}` : ""}
                        <ArrowRight size={16} aria-hidden="true" />
                      </Link>
                    )}
                    {w.canWrite && (
                      <button type="button" className="mhi-btn mhi-btn-secondary mhi-btn-sm" disabled={w.pending} onClick={() => w.linkProposal(proposal, !proposal.linked)}>
                        {proposal.linked ? "Disconnect inventory" : "Connect inventory"}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ---------- SUPPLIERS --------------------------------------------------- */

function SuppliersSection({ w, onAddSupplier }: { w: InventoryWorkspace; onAddSupplier: OpenFn }) {
  return (
    <section className="mhi-sec" aria-labelledby="mhi-sup-h">
      <div className="mhi-sechead">
        <div className="mhi-sechead-txt">
          <h2 className="mhi-sectitle" id="mhi-sup-h">
            Suppliers
          </h2>
          <p className="mhi-secmeta">
            {w.data.suppliers.length ? `${w.data.suppliers.length} · where purchase orders are emailed` : "Where purchase orders are emailed"}
          </p>
        </div>
        {w.canWrite && w.data.suppliers.length > 0 && (
          <button type="button" className="mhi-btn mhi-btn-primary" aria-haspopup="dialog" disabled={w.pending} onClick={onAddSupplier}>
            <Plus size={18} aria-hidden="true" />
            Add supplier
          </button>
        )}
      </div>
      {w.data.suppliers.length === 0 ? (
        <Empty
          title="Where do you buy materials?"
          action={
            w.canWrite ? (
              <button type="button" className="mhi-btn mhi-btn-primary" aria-haspopup="dialog" onClick={onAddSupplier}>
                <Plus size={18} aria-hidden="true" />
                Add supplier
              </button>
            ) : undefined
          }
        >
          Add a supplier and their order email to send purchase orders from your stock list.
        </Empty>
      ) : (
        <ul className="mhi-card mhi-rows">
          {w.data.suppliers.map((supplier) => {
            const site = supplierWebsite(supplier.website);
            return (
              <li key={supplier.id} className="mhi-supplier">
                <div className="mhi-cardhead-row">
                  <h3 className="mhi-cardtitle">{supplier.name}</h3>
                  <span className="mhi-date">{items(supplier.itemCount)}</span>
                </div>
                {supplier.email ? (
                  <a className="mhi-contact" href={`mailto:${supplier.email}`}>
                    <Mail size={18} aria-hidden="true" />
                    <span>{supplier.email}</span>
                  </a>
                ) : (
                  <p className="mhi-warn">No order email — purchase orders cannot be sent.</p>
                )}
                {supplier.phone && (
                  <a className="mhi-contact" href={`tel:${supplier.phone}`}>
                    <Phone size={18} aria-hidden="true" />
                    <span>{supplier.phone}</span>
                  </a>
                )}
                {site && (
                  <a className="mhi-contact" href={site} target="_blank" rel="noreferrer">
                    <Globe size={18} aria-hidden="true" />
                    <span>Order online</span>
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ---------- ACTIVITY ---------------------------------------------------- */

function ActivitySection({ w }: { w: InventoryWorkspace }) {
  return (
    <section className="mhi-sec" aria-labelledby="mhi-act-h">
      <div className="mhi-sechead">
        <div className="mhi-sechead-txt">
          <h2 className="mhi-sectitle" id="mhi-act-h">
            Stock activity
          </h2>
          <p className="mhi-secmeta">Movements from the last {w.facts.windowDays} days</p>
        </div>
      </div>
      <dl className="mhi-card mhi-value">
        <div className="mhi-value-main">
          <dt>Stock value</dt>
          <dd>{usd(w.facts.value)}</dd>
          <dd className="mhi-value-sub">
            {w.facts.valued} of {w.facts.itemCount} items have a cost
          </dd>
        </div>
        {w.idleValue > 0 && (
          <div className="mhi-value-row">
            <dt>Sitting idle</dt>
            <dd>{usd(w.idleValue)}</dd>
          </div>
        )}
      </dl>
      {w.facts.recent.length === 0 ? (
        <Empty title="No stock movements yet">Deliveries, stock counts, and materials loaded for jobs will appear here.</Empty>
      ) : (
        <ol className="mhi-card mhi-rows">
          {w.facts.recent.map((move) => (
            <li key={move.id} className="mhi-move">
              <div className="mhi-move-top">
                <span className="mhi-stamp mhi-stamp-sm" data-tone={move.quantity > 0 ? "success" : "neutral"}>
                  {moveLabel(move)}
                </span>
                <time dateTime={move.at}>{ago(move.at)}</time>
              </div>
              <div className="mhi-move-main">
                <h3>{move.itemName}</h3>
                <b data-positive={move.quantity > 0 || undefined}>
                  {move.quantity > 0 ? "+" : move.quantity < 0 ? "−" : ""}
                  {qty(Math.abs(move.quantity))}
                  <small>{move.unit}</small>
                </b>
              </div>
              {(move.actor || (move.note && move.note !== "Counted")) && (
                <p className="mhi-move-meta">{[move.actor, move.note && move.note !== "Counted" ? move.note : null].filter(Boolean).join(" · ")}</p>
              )}
              {move.jobId && move.jobTitle && (
                <Link className="mhi-textbtn" href={`/dashboard/jobs/${move.jobId}` as Route}>
                  {move.jobTitle}
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
