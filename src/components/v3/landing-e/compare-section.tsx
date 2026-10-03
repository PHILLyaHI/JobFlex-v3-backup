"use client";
import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { COMPARE_COMPETITORS, COMPARE_ROWS } from "./landing-compare";
import { CompareAnswer, CompareBrand, FeatureHeading } from "./compare-elements";
import "./compare-pass.css";
const MobileComparison = dynamic(() => import("./compare-mobile"));
const query = "(max-width: 768px)";
const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
const getSnapshot = () => window.matchMedia(query).matches;
const getServerSnapshot = () => false;
export function CompareSection() {
  const mobile = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return <div className="lp-cmp-body">
    {mobile ? <MobileComparison /> : <div className="lp-compare-plate">
      <table className="lp-compare-table">
        <caption className="sr-only">JobFlex compared with Jobber, Housecall Pro, Joist and ServiceTitan. Shared features first, followed by priority features.</caption>
        <thead><tr>
          <th scope="col"><FeatureHeading /></th>
          <th scope="col" className="lp-compare-us"><CompareBrand id="jobflex" /></th>
          {COMPARE_COMPETITORS.map((brand) => <th scope="col" key={brand.id}><CompareBrand id={brand.id} /></th>)}
        </tr></thead>
        <tbody>{COMPARE_ROWS.map((row) => <tr key={row.id}>
          <th scope="row"><span>{row.label}</span>{row.detail && <small>{row.detail}</small>}</th>
          <td className="lp-compare-us"><CompareAnswer /></td>
          {COMPARE_COMPETITORS.map((brand) => <td key={brand.id}><CompareAnswer cell={row.them[brand.id]} /></td>)}
        </tr>)}</tbody>
      </table>
    </div>}
  </div>;
}
