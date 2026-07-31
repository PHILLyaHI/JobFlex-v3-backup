"use client";

// Manual builder — page CONTENT only. Three zones: the price book on the left,
// the sheet in the middle, the totals rail on the right. A desk-scene tool, so
// it uses the width: you can see what you are pulling from, what you have
// built, and what it costs, without switching views.
//
// Blocks are DIRECT children of `.content` — the reveal cascade in use-reveal.ts
// walks `content.children`.
//
// State is component-local and nothing persists: the data layer is out of scope
// until the layout is signed off. "Convert to proposal" opens the proposal
// builder WITHOUT writing anything, and the dialog says so rather than implying
// a pipeline that is not there. Saved templates live until reload, for the same
// reason.
//
// Reorder is up/down buttons rather than HTML5 drag: drag is mouse-only, and
// this component's logic is the same logic the handheld build runs, where the
// only pointer is a thumb.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useReveal } from "./use-reveal";
import type { BookItem, Row, Section, Rates, Template } from "./manual-builder-types";
import {
  PRICE_BOOK,
  SEED_HEADER,
  SEED_RATES,
  SEED_SECTIONS,
  TEMPLATES,
} from "./manual-builder-data";
import { computeTotals, money, newId, rowTotal } from "./manual-builder-totals";

const BOOK_OPEN_KEY = "jf.mb.bookOpen";

// The drawer's collapse state lives in localStorage, which is an EXTERNAL store
// — so it is read through useSyncExternalStore rather than pulled into state by
// an effect. Reading it in an effect would mean a setState on every mount
// (cascading render, and the lint rule that forbids exactly this); reading it in
// a useState initializer would mean the server rendering "open" and the client
// rendering "collapsed" in the same commit, which is a hydration mismatch.
// useSyncExternalStore is built for precisely this split, and the shell's own
// responsive switch uses the same pattern.
const bookStore = {
  listeners: new Set<() => void>(),
  subscribe(cb: () => void) {
    bookStore.listeners.add(cb);
    // Keep two tabs of the same estimate in agreement.
    window.addEventListener("storage", cb);
    return () => {
      bookStore.listeners.delete(cb);
      window.removeEventListener("storage", cb);
    };
  },
  /** Open unless explicitly collapsed — first-time users get the book. */
  get(): boolean {
    return window.localStorage.getItem(BOOK_OPEN_KEY) !== "0";
  },
  set(open: boolean) {
    window.localStorage.setItem(BOOK_OPEN_KEY, open ? "1" : "0");
    bookStore.listeners.forEach((l) => l());
  },
};
// The server cannot read localStorage, so it renders the drawer open and the
// client corrects during hydration.
const bookServerSnapshot = () => true;

export function ManualBuilderContent() {
  useReveal();
  const router = useRouter();

  const [header] = useState(SEED_HEADER);
  const [sections, setSections] = useState<Section[]>(SEED_SECTIONS);
  const [rates, setRates] = useState<Rates>(SEED_RATES);

  // Price book
  const bookOpen = useSyncExternalStore(bookStore.subscribe, bookStore.get, bookServerSnapshot);
  const [bookTab, setBookTab] = useState<"book" | "templates">("book");
  const [query, setQuery] = useState("");
  const [targetSection, setTargetSection] = useState(SEED_SECTIONS[0].id);
  const [savedTemplates, setSavedTemplates] = useState<Template[]>([]);

  // Terminal actions
  const [saveOpen, setSaveOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateSection, setTemplateSection] = useState(SEED_SECTIONS[0].id);
  const saveBtnRef = useRef<HTMLButtonElement>(null);
  const convertBtnRef = useRef<HTMLButtonElement>(null);

  const totals = useMemo(() => computeTotals(sections, rates), [sections, rates]);

  // ── Sheet mutators ──────────────────────────────────────────────────
  function addRow(sectionId: string) {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, rows: [...s.rows, { id: newId("row"), desc: "", qty: 1, unit: "ea", cost: 0 }] }
          : s,
      ),
    );
  }

  function updateRow(sectionId: string, rowId: string, patch: Partial<Row>) {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, rows: s.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)) }
          : s,
      ),
    );
  }

  function deleteRow(sectionId: string, rowId: string) {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, rows: s.rows.filter((r) => r.id !== rowId) } : s,
      ),
    );
  }

  /** Reorder by one step, clamped at both ends. */
  function moveRow(sectionId: string, rowId: string, dir: -1 | 1) {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const i = s.rows.findIndex((r) => r.id === rowId);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= s.rows.length) return s;
        const rows = [...s.rows];
        [rows[i], rows[j]] = [rows[j], rows[i]];
        return { ...s, rows };
      }),
    );
  }

  function addSection() {
    setSections((prev) => [...prev, { id: newId("sec"), name: "New section", rows: [] }]);
  }

  function renameSection(sectionId: string, name: string) {
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, name } : s)));
  }

  // ── Price book ──────────────────────────────────────────────────────
  const bookResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PRICE_BOOK;
    return PRICE_BOOK.map((g) => ({
      ...g,
      items: g.items.filter((i) => i.name.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  function addFromBook(item: BookItem, sectionId: string) {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              rows: [
                ...s.rows,
                { id: newId("row"), desc: item.name, qty: 1, unit: item.unit, cost: item.cost },
              ],
            }
          : s,
      ),
    );
  }

  function insertTemplate(template: Template) {
    // Fresh ids: a template can be inserted twice and the two copies must not
    // share row keys, or editing one would edit the other.
    setSections((prev) => [
      ...prev,
      {
        id: newId("sec"),
        name: template.section.name,
        rows: template.section.rows.map((r) => ({ ...r, id: newId("row") })),
      },
    ]);
  }

  function saveTemplate() {
    const source = sections.find((s) => s.id === templateSection);
    if (!source) return;
    setSavedTemplates((prev) => [
      ...prev,
      {
        id: newId("tpl"),
        name: templateName.trim() || source.name,
        section: { ...source, rows: source.rows.map((r) => ({ ...r })) },
      },
    ]);
    setSaveOpen(false);
    setBookTab("templates");
    saveBtnRef.current?.focus();
  }

  // ── Total-changed flash ─────────────────────────────────────────────
  // Driven straight at the DOM rather than through state: the highlight is a
  // one-shot animation on an element, not a fact about the estimate, and
  // toggling a class is exactly the "synchronise with an external system" job
  // an effect exists for. It also restarts cleanly when the total changes again
  // mid-animation, which a boolean in state does not.
  const grandRef = useRef<HTMLDivElement>(null);
  const prevGrand = useRef(totals.grand);
  useEffect(() => {
    if (prevGrand.current === totals.grand) return;
    prevGrand.current = totals.grand;
    const el = grandRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.classList.remove("is-flash");
    void el.offsetWidth; // reflow, so the animation replays rather than continuing
    el.classList.add("is-flash");
  }, [totals.grand]);

  // ── Overlay dismissal ───────────────────────────────────────────────
  useEffect(() => {
    if (!saveOpen && !convertOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (convertOpen) {
        setConvertOpen(false);
        convertBtnRef.current?.focus();
      } else {
        setSaveOpen(false);
        saveBtnRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveOpen, convertOpen]);

  function openSave() {
    setTemplateName(`${header.trade} · ${header.project}`);
    setSaveOpen(true);
  }

  const allTemplates = [...TEMPLATES, ...savedTemplates];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Estimators</div>
          <h1 className="page-title">Manual builder</h1>
        </div>
      </div>

      <div className={bookOpen ? "mb-work" : "mb-work mb-work--narrow"}>
        {/* ── PRICE BOOK ─────────────────────────────────────────── */}
        <aside className={bookOpen ? "mb-book" : "mb-book mb-book--closed"}>
          <div className="mb-book-head">
            {bookOpen && <span className="mb-book-title">Price book</span>}
            <button
              type="button"
              className={bookOpen ? "mb-icon-btn" : "mb-icon-btn mb-icon-btn--down"}
              onClick={() => bookStore.set(!bookOpen)}
              aria-expanded={bookOpen}
              aria-label={bookOpen ? "Collapse price book" : "Expand price book"}
            >
              <svg className="ic">
                <use href="#i-chev" />
              </svg>
            </button>
          </div>

          {bookOpen && (
            <>
              <div className="mb-book-tabs" role="tablist" aria-label="Price book">
                <button
                  type="button"
                  role="tab"
                  aria-selected={bookTab === "book"}
                  className={bookTab === "book" ? "mb-tab is-on" : "mb-tab"}
                  onClick={() => setBookTab("book")}
                >
                  Items
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={bookTab === "templates"}
                  className={bookTab === "templates" ? "mb-tab is-on" : "mb-tab"}
                  onClick={() => setBookTab("templates")}
                >
                  Templates
                </button>
              </div>

              {bookTab === "book" ? (
                <>
                  <input
                    className="mb-book-search"
                    type="search"
                    value={query}
                    placeholder="Search items"
                    aria-label="Search the price book"
                    onChange={(e) => setQuery(e.target.value)}
                  />

                  <label className="mb-book-target">
                    <span className="tb-label">Add to</span>
                    <select
                      value={targetSection}
                      onChange={(e) => setTargetSection(e.target.value)}
                    >
                      {sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {bookResults.length === 0 ? (
                    <p className="mb-empty">Nothing matches “{query}”.</p>
                  ) : (
                    bookResults.map((group) => (
                      <div className="mb-book-group" key={group.id}>
                        <h3 className="mb-book-group-name">{group.name}</h3>
                        {group.items.map((item) => (
                          <div className="mb-book-item" key={item.id}>
                            <span className="mb-book-item-name">{item.name}</span>
                            <span className="mb-book-item-cost">
                              {money(item.cost)}/{item.unit}
                            </span>
                            <button
                              type="button"
                              className="mb-icon-btn"
                              aria-label={`Add ${item.name}`}
                              onClick={() => addFromBook(item, targetSection)}
                            >
                              <svg className="ic">
                                <use href="#i-plus" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </>
              ) : (
                allTemplates.map((t) => (
                  <button
                    type="button"
                    className="mb-tpl"
                    key={t.id}
                    onClick={() => insertTemplate(t)}
                  >
                    <span className="mb-tpl-name">{t.name}</span>
                    <span className="mb-tpl-meta">{t.section.rows.length} lines</span>
                  </button>
                ))
              )}
            </>
          )}
        </aside>

        {/* ── SHEET ──────────────────────────────────────────────── */}
        <section className="mb-sheet">
          <div className="mb-title-block">
            <div className="tb-cell">
              <span className="tb-label">Client</span>
              <span className="tb-value">{header.client}</span>
            </div>
            <div className="tb-cell">
              <span className="tb-label">Project</span>
              <span className="tb-value">{header.project}</span>
            </div>
            <div className="tb-cell">
              <span className="tb-label">Address</span>
              <span className="tb-value">{header.address}</span>
            </div>
            <div className="tb-cell">
              <span className="tb-label">Estimate</span>
              <span className="tb-value">{header.number}</span>
            </div>
            <div className="tb-cell">
              <span className="tb-label">Date</span>
              <span className="tb-value">{header.date}</span>
            </div>
            <div className="tb-cell">
              <span className="tb-label">Trade</span>
              <span className="tb-value">{header.trade}</span>
            </div>
            <div className="tb-cell">
              <span className="tb-label">Valid</span>
              <span className="tb-value">{header.validDays} days</span>
            </div>
          </div>

          {sections.map((section) => (
            <div className="mb-section" key={section.id}>
              <div className="mb-section-head">
                <input
                  className="mb-section-name"
                  value={section.name}
                  aria-label="Section name"
                  onChange={(e) => renameSection(section.id, e.target.value)}
                />
                <span className="mb-section-sub">
                  {money(totals.perSection.find((s) => s.id === section.id)?.subtotal ?? 0)}
                </span>
              </div>

              {section.rows.length === 0 ? (
                <p className="mb-empty">
                  No lines yet — add one, or pull an item from the price book.
                </p>
              ) : (
                <div className="mb-rows">
                  <div className="mb-row mb-row--head">
                    <span>Description</span>
                    <span className="num">Qty</span>
                    <span>Unit</span>
                    <span className="num">Unit cost</span>
                    <span className="num">Total</span>
                    <span className="sr-only">Actions</span>
                  </div>

                  {section.rows.map((row, i) => (
                    <div className="mb-row" key={row.id}>
                      <input
                        className="mb-in"
                        value={row.desc}
                        placeholder="Description"
                        aria-label="Description"
                        onChange={(e) => updateRow(section.id, row.id, { desc: e.target.value })}
                        onKeyDown={(e) => {
                          // Enter on the last row keeps the hands on the keyboard
                          // through a whole section.
                          if (e.key === "Enter" && i === section.rows.length - 1) {
                            e.preventDefault();
                            addRow(section.id);
                          }
                        }}
                      />
                      <input
                        className="mb-in num"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={row.qty}
                        aria-label="Quantity"
                        onChange={(e) =>
                          updateRow(section.id, row.id, { qty: Number(e.target.value) })
                        }
                      />
                      <input
                        className="mb-in mb-in--unit"
                        value={row.unit}
                        aria-label="Unit"
                        onChange={(e) => updateRow(section.id, row.id, { unit: e.target.value })}
                      />
                      <input
                        className="mb-in num"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={row.cost}
                        aria-label="Unit cost"
                        onChange={(e) =>
                          updateRow(section.id, row.id, { cost: Number(e.target.value) })
                        }
                      />
                      <span className="mb-line-total num">{money(rowTotal(row))}</span>
                      <span className="mb-row-acts">
                        <button
                          type="button"
                          className="mb-icon-btn mb-icon-btn--up"
                          aria-label="Move line up"
                          onClick={() => moveRow(section.id, row.id, -1)}
                          disabled={i === 0}
                        >
                          <svg className="ic">
                            <use href="#i-chev" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="mb-icon-btn"
                          aria-label="Move line down"
                          onClick={() => moveRow(section.id, row.id, 1)}
                          disabled={i === section.rows.length - 1}
                        >
                          <svg className="ic">
                            <use href="#i-chev" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="mb-icon-btn"
                          aria-label="Delete line"
                          onClick={() => deleteRow(section.id, row.id)}
                        >
                          <svg className="ic">
                            <use href="#i-trash" />
                          </svg>
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <button type="button" className="mb-add" onClick={() => addRow(section.id)}>
                <svg className="ic">
                  <use href="#i-plus" />
                </svg>
                Add row
              </button>
            </div>
          ))}

          <button type="button" className="mb-add mb-add--section" onClick={addSection}>
            <svg className="ic">
              <use href="#i-plus" />
            </svg>
            Add section
          </button>
        </section>

        {/* ── TOTALS RAIL ────────────────────────────────────────── */}
        <aside className="mb-rail">
          <h2 className="mb-rail-title">Totals</h2>

          <dl className="mb-rail-lines">
            {totals.perSection.map((s) => (
              <div key={s.id}>
                <dt>{s.name}</dt>
                <dd>{money(s.subtotal)}</dd>
              </div>
            ))}
            <div className="mb-rail-sub">
              <dt>Subtotal</dt>
              <dd>{money(totals.subtotal)}</dd>
            </div>
          </dl>

          <div className="mb-rates">
            <label className="mb-rate">
              <span className="tb-label">Markup %</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={rates.markupPct}
                onChange={(e) => setRates((r) => ({ ...r, markupPct: Number(e.target.value) }))}
              />
              <span className="mb-rate-amt">{money(totals.markup)}</span>
            </label>
            <label className="mb-rate">
              <span className="tb-label">Contingency %</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={rates.contingencyPct}
                onChange={(e) =>
                  setRates((r) => ({ ...r, contingencyPct: Number(e.target.value) }))
                }
              />
              <span className="mb-rate-amt">{money(totals.contingency)}</span>
            </label>
            <label className="mb-rate">
              <span className="tb-label">Tax %</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={rates.taxPct}
                onChange={(e) => setRates((r) => ({ ...r, taxPct: Number(e.target.value) }))}
              />
              <span className="mb-rate-amt">{money(totals.tax)}</span>
            </label>
          </div>

          <div className="mb-grand" ref={grandRef}>
            <span className="mb-grand-label">Total</span>
            <span className="mb-grand-value">{money(totals.grand)}</span>
          </div>

          <button type="button" className="mb-act mb-act--ghost" ref={saveBtnRef} onClick={openSave}>
            Save as template
          </button>
          <button
            type="button"
            className="mb-act mb-act--primary"
            ref={convertBtnRef}
            onClick={() => setConvertOpen(true)}
          >
            Convert to proposal
            <svg className="ic">
              <use href="#i-arrow" />
            </svg>
          </button>
        </aside>
      </div>

      {/* ── SAVE AS TEMPLATE ───────────────────────────────────────
          Hand-rolled in the shared `.mdl` vocabulary — this project's
          dialogs are in-house, not Radix. The enter animation comes from
          blueprint-global.css; closing unmounts rather than playing an exit,
          which is the one thing this dialog does more plainly than the
          ported pages. */}
      {saveOpen && (
        <div className="mdl open" role="dialog" aria-modal="true" aria-labelledby="mbSaveTitle">
          <div
            className="mdl-bg"
            onClick={() => {
              setSaveOpen(false);
              saveBtnRef.current?.focus();
            }}
          />
          <div className="mdl-box">
            <div className="mdl-head">
              <div>
                <span className="mdl-kick">Price book</span>
                <div className="mdl-title" id="mbSaveTitle">
                  Save as template
                </div>
              </div>
              <button
                className="mdl-x"
                type="button"
                aria-label="Close"
                onClick={() => {
                  setSaveOpen(false);
                  saveBtnRef.current?.focus();
                }}
              >
                <svg className="ic">
                  <use href="#i-x" />
                </svg>
              </button>
            </div>

            <div className="mdl-body">
              <label className="mb-field">
                <span className="tb-label">Template name</span>
                <input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Name this template"
                />
              </label>
              <label className="mb-field">
                <span className="tb-label">Section to save</span>
                <select
                  value={templateSection}
                  onChange={(e) => setTemplateSection(e.target.value)}
                >
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.rows.length} lines
                    </option>
                  ))}
                </select>
              </label>
              <p className="mb-note">
                Saved to the Templates tab for this session. Nothing is written to the price book
                yet.
              </p>
            </div>

            <div className="mdl-foot">
              <button
                type="button"
                className="mb-act mb-act--ghost"
                onClick={() => {
                  setSaveOpen(false);
                  saveBtnRef.current?.focus();
                }}
              >
                Cancel
              </button>
              <button type="button" className="mb-act mb-act--primary" onClick={saveTemplate}>
                Save template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONVERT TO PROPOSAL ────────────────────────────────── */}
      {convertOpen && (
        <div className="mdl open" role="dialog" aria-modal="true" aria-labelledby="mbConvertTitle">
          <div
            className="mdl-bg"
            onClick={() => {
              setConvertOpen(false);
              convertBtnRef.current?.focus();
            }}
          />
          <div className="mdl-box">
            <div className="mdl-head">
              <div>
                <span className="mdl-kick">{header.number}</span>
                <div className="mdl-title" id="mbConvertTitle">
                  Convert to proposal
                </div>
              </div>
              <button
                className="mdl-x"
                type="button"
                aria-label="Close"
                onClick={() => {
                  setConvertOpen(false);
                  convertBtnRef.current?.focus();
                }}
              >
                <svg className="ic">
                  <use href="#i-x" />
                </svg>
              </button>
            </div>

            <div className="mdl-body">
              <span className="tb-label">Carries over</span>
              <dl className="mb-mdl-list">
                {totals.perSection.map((s) => (
                  <div key={s.id}>
                    <dt>{s.name}</dt>
                    <dd>{money(s.subtotal)}</dd>
                  </div>
                ))}
                <div className="mb-mdl-rule">
                  <dt>Subtotal</dt>
                  <dd>{money(totals.subtotal)}</dd>
                </div>
                <div>
                  <dt>Markup {rates.markupPct}%</dt>
                  <dd>{money(totals.markup)}</dd>
                </div>
                <div>
                  <dt>Contingency {rates.contingencyPct}%</dt>
                  <dd>{money(totals.contingency)}</dd>
                </div>
                <div>
                  <dt>Tax {rates.taxPct}%</dt>
                  <dd>{money(totals.tax)}</dd>
                </div>
                <div className="mb-mdl-grand">
                  <dt>Total</dt>
                  <dd>{money(totals.grand)}</dd>
                </div>
              </dl>

              <span className="tb-label">Header</span>
              <p className="mb-note">
                {header.client} · {header.project} · {header.address} · valid {header.validDays}{" "}
                days
              </p>

              <p className="mb-note mb-note--warn">
                Nothing is saved yet — this opens the proposal builder with the sheet in hand.
              </p>
            </div>

            <div className="mdl-foot">
              <button
                type="button"
                className="mb-act mb-act--ghost"
                onClick={() => {
                  setConvertOpen(false);
                  convertBtnRef.current?.focus();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="mb-act mb-act--primary"
                onClick={() => router.push("/dashboard/proposals" as Route)}
              >
                Open proposal builder
                <svg className="ic">
                  <use href="#i-arrow" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
