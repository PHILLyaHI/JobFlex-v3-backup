"use client";
import { useState } from "react";
import { COMPARE_COMPETITORS, COMPARE_ROWS, allAppsInclude, type CompetitorId } from "./landing-compare";
import { CompareAnswer, CompareBrand } from "./compare-elements";
import "./compare-pass.css";

/* The phone comparison, kept short (owner, 2026-09-26: "minimal, not take up
   too much space"): one line per feature, a tick or a cross, and only the
   first rows until the reader asks for the rest. */
const FIRST = 6;

export default function MobileComparison() {
  const [selected, setSelected] = useState<CompetitorId>("jobber");
  const [all, setAll] = useState(false);
  const rows = all ? COMPARE_ROWS : COMPARE_ROWS.slice(0, FIRST);
  return <div className="lp-compare-mobile">
    <p className="lp-compare-picker-label" id="compare-picker-label">Compare JobFlex with</p>
    <div className="lp-compare-picker" role="group" aria-labelledby="compare-picker-label">
      {COMPARE_COMPETITORS.map((brand) => <button key={brand.id} type="button" aria-pressed={selected === brand.id} onClick={() => setSelected(brand.id)}>{brand.name}</button>)}
    </div>
    <div className="lp-compare-plate">
      <table className="lp-compare-table lp-compare-table-mobile" id="compare-mobile-table">
        <caption className="sr-only">JobFlex feature comparison with {COMPARE_COMPETITORS.find((brand) => brand.id === selected)!.name}</caption>
        <thead><tr><th scope="col">Features</th><th scope="col" className="lp-compare-us"><CompareBrand id="jobflex" /></th><th scope="col"><CompareBrand id={selected} /></th></tr></thead>
        <tbody>{rows.map((row, index) => <tr key={row.id} className={index > 0 && allAppsInclude(rows[index - 1]) && !allAppsInclude(row) ? "lp-compare-divider" : undefined}>
          <th scope="row"><span>{row.label}</span>{row.detail && <small>{row.detail}</small>}</th>
          <td className="lp-compare-us"><CompareAnswer /></td>
          <td><CompareAnswer cell={row.them[selected]} /></td>
        </tr>)}</tbody>
      </table>
      {COMPARE_ROWS.length > FIRST && (
        <button type="button" className="lp-compare-more" aria-expanded={all} aria-controls="compare-mobile-table" onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${COMPARE_ROWS.length} features`}
        </button>
      )}
    </div>
  </div>;
}
