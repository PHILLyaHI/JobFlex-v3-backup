"use client";
import { useState } from "react";
import { COMPARE_COMPETITORS, COMPARE_ROWS, noteNumber } from "./landing-compare";
import { CompareAnswer, CompareBrand, CompareNotes } from "./compare-elements";

/* The phone comparison (owner, 2026-10-02): every column, like the desk's,
   in a plate that scrolls sideways on its own — the page never does. The
   feature column and JobFlex's stay pinned at the left while the four others
   pass under them, so every answer is read against ours. Still short
   (owner, 2026-09-26): one line per feature, a tick or a cross, and only the
   first rows until the reader asks for the rest. */
const FIRST = 6;

export default function MobileComparison() {
  const [all, setAll] = useState(false);
  const rows = all ? COMPARE_ROWS : COMPARE_ROWS.slice(0, FIRST);
  return <div className="lp-compare-mobile">
    <div className="lp-compare-plate">
      <div className="lp-compare-scroll" role="region" aria-label="Feature comparison, scrolls sideways" tabIndex={0}>
        <table className="lp-compare-table lp-compare-table-mobile" id="compare-mobile-table">
          <caption className="sr-only">JobFlex compared with {COMPARE_COMPETITORS.map((brand) => brand.name).join(", ")}</caption>
          <thead><tr>
            <th scope="col">Features</th>
            <th scope="col" className="lp-compare-us"><CompareBrand id="jobflex" /></th>
            {COMPARE_COMPETITORS.map((brand) => <th scope="col" key={brand.id}><CompareBrand id={brand.id} /></th>)}
          </tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}>
            <th scope="row"><span>{row.label}</span>{row.detail && <small>{row.detail}</small>}</th>
            <td className="lp-compare-us"><CompareAnswer /></td>
            {COMPARE_COMPETITORS.map((brand) => <td key={brand.id}><CompareAnswer cell={row.them[brand.id]} n={noteNumber(row.id, brand.id)} /></td>)}
          </tr>)}</tbody>
        </table>
      </div>
      {COMPARE_ROWS.length > FIRST && (
        <button type="button" className="lp-compare-more" aria-expanded={all} aria-controls="compare-mobile-table" onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${COMPARE_ROWS.length} features`}
        </button>
      )}
    </div>
    <CompareNotes rowIds={rows.map((row) => row.id)} />
  </div>;
}
