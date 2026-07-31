"use client";

// MOBILE MANUAL BUILDER — the handheld rebuild of the desktop manual builder
// (src/components/v3/estimators-blueprint/manual-builder-content.tsx).
//
// Built with the jobflex-page-styler skill (tokens, palette, type scale, Motion
// System "Balanced", fluid scale) and the mobile-app-ui-design skill (thumb
// zone, ≥44px targets, bottom sheets over modals). Where the two disagree the
// house system wins: hard 3px offset shadows, 2px radii and Inter 900 caps stay
// rather than the mobile skill's soft-shadow / rounded-3xl defaults.
//
// SHARED LOGIC, NOT A SECOND COPY. The types, the fixtures and — critically —
// computeTotals are imported from the desktop modules. The arithmetic on a
// phone must be the same arithmetic, not a re-derivation that drifts by a
// rounding step; the only thing rebuilt here is the layout.
//
// The desk build's three zones do not survive 320px, so each becomes its own
// thing:
//   price book  -> a bottom sheet off "From book"
//   totals rail -> a sticky bar (subtotal + total), tapping expands the rail
//   sheet rows  -> stacked cards, since a 6-column grid at 320px would put
//                  three numeric fields under 40px wide
//
// Content is the demo fixture by design: the data layer is out of scope until
// the layout is signed off. No Prisma, no server action, no network call.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import styles from "./mobile-manual-builder.module.css";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import { lockScroll } from "@/lib/scrollLock";
import type {
  BookItem,
  Row,
  Section,
  Rates,
  Template,
} from "@/components/v3/estimators-blueprint/manual-builder-types";
import {
  PRICE_BOOK,
  SEED_HEADER,
  SEED_RATES,
  SEED_SECTIONS,
  TEMPLATES,
} from "@/components/v3/estimators-blueprint/manual-builder-data";
import {
  computeTotals,
  money,
  newId,
  rowTotal,
} from "@/components/v3/estimators-blueprint/manual-builder-totals";

type Sheet = "none" | "totals" | "book" | "convert";

export function MobileManualBuilder() {
  const router = useRouter();

  const [header] = useState(SEED_HEADER);
  const [sections, setSections] = useState<Section[]>(SEED_SECTIONS);
  const [rates, setRates] = useState<Rates>(SEED_RATES);

  const [sheet, setSheet] = useState<Sheet>("none");
  const [bookTab, setBookTab] = useState<"book" | "templates">("book");
  const [query, setQuery] = useState("");
  const [targetSection, setTargetSection] = useState(SEED_SECTIONS[0].id);

  const totals = useMemo(() => computeTotals(sections, rates), [sections, rates]);

  const close = () => setSheet("none");
  const totalsDrag = useSheetDrag(sheet === "totals", close);
  const bookDrag = useSheetDrag(sheet === "book", close);
  const convertDrag = useSheetDrag(sheet === "convert", close);

  // The handheld shell mount contract, same as every sibling surface: pin the
  // app to the VISUAL viewport (100dvh still counts the URL bar on iOS, so the
  // sticky totals bar would sit under it) and lock the document scroll for as
  // long as this fixed shell owns the screen.
  useEffect(() => {
    const apply = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-h", `${h}px`);
    };
    apply();
    window.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("resize", apply);
    const releaseScroll = lockScroll();
    return () => {
      window.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("resize", apply);
      document.documentElement.style.removeProperty("--app-h");
      releaseScroll();
    };
  }, []);

  useEffect(() => {
    if (sheet === "none") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

  // ── Sheet mutators — same names and semantics as the desktop build ──
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

  const bookResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PRICE_BOOK;
    return PRICE_BOOK.map((g) => ({
      ...g,
      items: g.items.filter((i) => i.name.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  // Adding does NOT close the sheet: you add several items in a row, and the
  // confirmation is the total moving in the bar behind it.
  function addFromBook(item: BookItem) {
    setSections((prev) =>
      prev.map((s) =>
        s.id === targetSection
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
    // Fresh ids: a template can be inserted twice and the copies must not share
    // row keys, or editing one would edit the other.
    setSections((prev) => [
      ...prev,
      {
        id: newId("sec"),
        name: template.section.name,
        rows: template.section.rows.map((r) => ({ ...r, id: newId("row") })),
      },
    ]);
    close();
  }

  const barRef = useRef<HTMLButtonElement>(null);

  return (
    <div className={styles.app}>
      <MobileNav />

      <main className={styles.scroll}>
        <div className={styles.content}>
          <header>
            <div className={styles.kicker}>Estimators · manual</div>
            <h1 className={styles.h1}>Cost sheet</h1>
          </header>

          <div className={styles.titleBlock}>
            <div className={`${styles.tbCell} ${styles.tbWide}`}>
              <span className={styles.tbLabel}>Client</span>
              <span className={styles.tbValue}>{header.client}</span>
            </div>
            <div className={`${styles.tbCell} ${styles.tbWide}`}>
              <span className={styles.tbLabel}>Project</span>
              <span className={styles.tbValue}>{header.project}</span>
            </div>
            <div className={styles.tbCell}>
              <span className={styles.tbLabel}>Estimate</span>
              <span className={styles.tbValue}>{header.number}</span>
            </div>
            <div className={styles.tbCell}>
              <span className={styles.tbLabel}>Date</span>
              <span className={styles.tbValue}>{header.date}</span>
            </div>
            <div className={styles.tbCell}>
              <span className={styles.tbLabel}>Trade</span>
              <span className={styles.tbValue}>{header.trade}</span>
            </div>
            <div className={styles.tbCell}>
              <span className={styles.tbLabel}>Valid</span>
              <span className={styles.tbValue}>{header.validDays} days</span>
            </div>
          </div>

          {sections.map((section) => (
            <section className={styles.section} key={section.id}>
              <div className={styles.secHead}>
                <input
                  className={styles.secName}
                  value={section.name}
                  aria-label="Section name"
                  onChange={(e) => renameSection(section.id, e.target.value)}
                />
                <span className={styles.secSub}>
                  {money(totals.perSection.find((s) => s.id === section.id)?.subtotal ?? 0)}
                </span>
              </div>

              {section.rows.length === 0 ? (
                <p className={styles.empty}>No lines yet — add one, or pull from the price book.</p>
              ) : (
                section.rows.map((row, i) => (
                  <div className={styles.row} key={row.id}>
                    <input
                      className={styles.rowDesc}
                      value={row.desc}
                      placeholder="Description"
                      aria-label="Description"
                      onChange={(e) => updateRow(section.id, row.id, { desc: e.target.value })}
                    />
                    <div className={styles.rowGrid}>
                      <label className={styles.fld}>
                        <span className={styles.fldLbl}>Qty</span>
                        <input
                          className={styles.numIn}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          value={row.qty}
                          onChange={(e) =>
                            updateRow(section.id, row.id, { qty: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label className={styles.fld}>
                        <span className={styles.fldLbl}>Unit</span>
                        <input
                          className={styles.unitIn}
                          value={row.unit}
                          onChange={(e) =>
                            updateRow(section.id, row.id, { unit: e.target.value })
                          }
                        />
                      </label>
                      <label className={styles.fld}>
                        <span className={styles.fldLbl}>Unit cost</span>
                        <input
                          className={styles.numIn}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          value={row.cost}
                          onChange={(e) =>
                            updateRow(section.id, row.id, { cost: Number(e.target.value) })
                          }
                        />
                      </label>
                      <div className={styles.fld}>
                        <span className={styles.fldLbl}>Line total</span>
                        <span className={styles.rowTotal}>{money(rowTotal(row))}</span>
                      </div>
                    </div>

                    <div className={styles.rowFoot}>
                      <span className={styles.fldLbl}>
                        Line {i + 1} of {section.rows.length}
                      </span>
                      <div className={styles.rowActs}>
                        <button
                          type="button"
                          className={`${styles.iconBtn} ${styles.iconUp}`}
                          aria-label="Move line up"
                          disabled={i === 0}
                          onClick={() => moveRow(section.id, row.id, -1)}
                        >
                          <svg className={styles.ic}>
                            <use href="#i-chev" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          aria-label="Move line down"
                          disabled={i === section.rows.length - 1}
                          onClick={() => moveRow(section.id, row.id, 1)}
                        >
                          <svg className={styles.ic}>
                            <use href="#i-chev" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          aria-label="Delete line"
                          onClick={() => deleteRow(section.id, row.id)}
                        >
                          <svg className={styles.ic}>
                            <use href="#i-trash" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}

              <div className={styles.addRow}>
                <button type="button" className={styles.addBtn} onClick={() => addRow(section.id)}>
                  <svg className={styles.ic}>
                    <use href="#i-plus" />
                  </svg>
                  Add row
                </button>
                <button
                  type="button"
                  className={styles.addBtn}
                  onClick={() => {
                    setTargetSection(section.id);
                    setBookTab("book");
                    setSheet("book");
                  }}
                >
                  <svg className={styles.ic}>
                    <use href="#i-search" />
                  </svg>
                  From book
                </button>
              </div>
            </section>
          ))}

          <button type="button" className={styles.addBtn} onClick={addSection}>
            <svg className={styles.ic}>
              <use href="#i-plus" />
            </svg>
            Add section
          </button>
        </div>
      </main>

      {/* ── Sticky totals bar ─────────────────────────────────────── */}
      <button
        type="button"
        className={styles.bar}
        ref={barRef}
        onClick={() => setSheet("totals")}
        aria-label="Open totals"
      >
        <span className={styles.barFig}>
          <span className={styles.barLbl}>Subtotal</span>
          <span className={styles.barSub}>{money(totals.subtotal)}</span>
        </span>
        <span className={`${styles.barFig} ${styles.barGrand}`}>
          <span className={styles.barLbl}>Total</span>
          <span className={styles.barTotal}>{money(totals.grand)}</span>
        </span>
        <span className={styles.barExpand} aria-hidden="true">
          <svg className={styles.ic}>
            <use href="#i-chev" />
          </svg>
        </span>
      </button>

      {/* One scrim for all three sheets — it dismisses whichever is up. */}
      <div className={`${styles.scrim} ${sheet !== "none" ? styles.on : ""}`} onClick={close} />

      {/* ── Totals sheet ──────────────────────────────────────────── */}
      <div
        className={`${styles.sheet} ${sheet === "totals" ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Totals"
        aria-hidden={sheet !== "totals"}
        {...totalsDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...totalsDrag.handleProps} />
        <div className={styles.sheetHead} {...totalsDrag.handleProps}>
          <div className={styles.sheetKicker}>{header.number}</div>
          <div className={styles.sheetTitle}>Totals</div>
        </div>
        <div className={styles.sheetBody}>
          <dl>
            {totals.perSection.map((s) => (
              <div className={styles.tLine} key={s.id}>
                <dt>{s.name}</dt>
                <dd>{money(s.subtotal)}</dd>
              </div>
            ))}
            <div className={`${styles.tLine} ${styles.tRule}`}>
              <dt>Subtotal</dt>
              <dd>{money(totals.subtotal)}</dd>
            </div>
          </dl>

          <label className={styles.rate}>
            <span className={styles.fldLbl}>Markup %</span>
            <input
              className={styles.numIn}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={rates.markupPct}
              onChange={(e) => setRates((r) => ({ ...r, markupPct: Number(e.target.value) }))}
            />
            <span className={styles.rateAmt}>{money(totals.markup)}</span>
          </label>
          <label className={styles.rate}>
            <span className={styles.fldLbl}>Contingency %</span>
            <input
              className={styles.numIn}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={rates.contingencyPct}
              onChange={(e) => setRates((r) => ({ ...r, contingencyPct: Number(e.target.value) }))}
            />
            <span className={styles.rateAmt}>{money(totals.contingency)}</span>
          </label>
          <label className={styles.rate}>
            <span className={styles.fldLbl}>Tax %</span>
            <input
              className={styles.numIn}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={rates.taxPct}
              onChange={(e) => setRates((r) => ({ ...r, taxPct: Number(e.target.value) }))}
            />
            <span className={styles.rateAmt}>{money(totals.tax)}</span>
          </label>

          <div className={styles.grand}>
            <span className={styles.fldLbl}>Total</span>
            <span className={styles.grandVal}>{money(totals.grand)}</span>
          </div>

          <button
            type="button"
            className={`${styles.act} ${styles.actPrimary}`}
            onClick={() => setSheet("convert")}
          >
            Convert to proposal
            <svg className={styles.ic}>
              <use href="#i-arrow" />
            </svg>
          </button>
          <button type="button" className={`${styles.act} ${styles.actGhost}`} onClick={close}>
            Close
          </button>
        </div>
      </div>

      {/* ── Price book sheet ──────────────────────────────────────── */}
      <div
        className={`${styles.sheet} ${sheet === "book" ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Price book"
        aria-hidden={sheet !== "book"}
        {...bookDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...bookDrag.handleProps} />
        <div className={styles.sheetHead} {...bookDrag.handleProps}>
          <div className={styles.sheetKicker}>Adding to {
            sections.find((s) => s.id === targetSection)?.name ?? "sheet"
          }</div>
          <div className={styles.sheetTitle}>Price book</div>
        </div>
        <div className={styles.sheetBody}>
          <div className={styles.tabs} role="tablist" aria-label="Price book">
            <button
              type="button"
              role="tab"
              aria-selected={bookTab === "book"}
              className={`${styles.tab} ${bookTab === "book" ? styles.tabOn : ""}`}
              onClick={() => setBookTab("book")}
            >
              Items
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={bookTab === "templates"}
              className={`${styles.tab} ${bookTab === "templates" ? styles.tabOn : ""}`}
              onClick={() => setBookTab("templates")}
            >
              Templates
            </button>
          </div>

          {bookTab === "book" ? (
            <>
              <input
                className={styles.bookSearch}
                type="search"
                value={query}
                placeholder="Search items"
                aria-label="Search the price book"
                onChange={(e) => setQuery(e.target.value)}
              />
              <label className={styles.bookTarget}>
                <span className={styles.fldLbl}>Add to</span>
                <select value={targetSection} onChange={(e) => setTargetSection(e.target.value)}>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              {bookResults.length === 0 ? (
                <p className={styles.empty}>Nothing matches “{query}”.</p>
              ) : (
                bookResults.map((group) => (
                  <div className={styles.bookGroup} key={group.id}>
                    <h3 className={styles.bookGroupName}>{group.name}</h3>
                    {group.items.map((item) => (
                      <div className={styles.bookItem} key={item.id}>
                        <span className={styles.bookItemName}>{item.name}</span>
                        <span className={styles.bookItemCost}>
                          {money(item.cost)}/{item.unit}
                        </span>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          aria-label={`Add ${item.name}`}
                          onClick={() => addFromBook(item)}
                        >
                          <svg className={styles.ic}>
                            <use href="#i-plus" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ))
              )}

              <button type="button" className={`${styles.act} ${styles.actGhost}`} onClick={close}>
                Done
              </button>
            </>
          ) : (
            <>
              {TEMPLATES.map((t) => (
                <button
                  type="button"
                  className={styles.tpl}
                  key={t.id}
                  onClick={() => insertTemplate(t)}
                >
                  <span className={styles.tplName}>{t.name}</span>
                  <span className={styles.tplMeta}>{t.section.rows.length} lines</span>
                </button>
              ))}
              <p className={styles.note}>
                A template adds a whole section, priced. Inserting one twice gives you two
                independent copies.
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Convert sheet ─────────────────────────────────────────── */}
      <div
        className={`${styles.sheet} ${sheet === "convert" ? styles.on : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Convert to proposal"
        aria-hidden={sheet !== "convert"}
        {...convertDrag.sheetProps}
      >
        <div className={styles.sheetGrab} {...convertDrag.handleProps} />
        <div className={styles.sheetHead} {...convertDrag.handleProps}>
          <div className={styles.sheetKicker}>{header.number}</div>
          <div className={styles.sheetTitle}>Convert to proposal</div>
        </div>
        <div className={styles.sheetBody}>
          <dl>
            {totals.perSection.map((s) => (
              <div className={styles.tLine} key={s.id}>
                <dt>{s.name}</dt>
                <dd>{money(s.subtotal)}</dd>
              </div>
            ))}
            <div className={`${styles.tLine} ${styles.tRule}`}>
              <dt>Subtotal</dt>
              <dd>{money(totals.subtotal)}</dd>
            </div>
            <div className={styles.tLine}>
              <dt>Markup {rates.markupPct}%</dt>
              <dd>{money(totals.markup)}</dd>
            </div>
            <div className={styles.tLine}>
              <dt>Contingency {rates.contingencyPct}%</dt>
              <dd>{money(totals.contingency)}</dd>
            </div>
            <div className={styles.tLine}>
              <dt>Tax {rates.taxPct}%</dt>
              <dd>{money(totals.tax)}</dd>
            </div>
          </dl>

          <div className={styles.grand}>
            <span className={styles.fldLbl}>Total</span>
            <span className={styles.grandVal}>{money(totals.grand)}</span>
          </div>

          <p className={`${styles.note} ${styles.noteWarn}`}>
            Nothing is saved yet — this opens the proposal builder with the sheet in hand.
          </p>

          <button
            type="button"
            className={`${styles.act} ${styles.actPrimary}`}
            onClick={() => router.push("/dashboard/proposals" as Route)}
          >
            Open proposal builder
            <svg className={styles.ic}>
              <use href="#i-arrow" />
            </svg>
          </button>
          <button type="button" className={`${styles.act} ${styles.actGhost}`} onClick={close}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
