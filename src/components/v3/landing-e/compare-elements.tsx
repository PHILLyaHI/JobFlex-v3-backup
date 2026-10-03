import Image from "next/image";
import { Check, X, ListChecks } from "lucide-react";
import { LogoMark } from "./logo";
import { COMPARE_COMPETITORS, type CompareCell, type CompetitorId } from "./landing-compare";
export function CompareBrand({ id }: { id: CompetitorId | "jobflex" }) {
  const name = id === "jobflex" ? "JobFlex" : COMPARE_COMPETITORS.find((brand) => brand.id === id)!.name;
  return <span className="lp-compare-brand">
    {id === "jobflex" ? <LogoMark /> : <Image src={'/brands/' + id + '.png'} alt="" width={32} height={32} />}
    <span>{name}</span>
  </span>;
}
export function FeatureHeading() {
  return <span className="lp-compare-brand"><ListChecks size={28} aria-hidden="true" /><span>Features</span></span>;
}
export function CompareAnswer({ cell }: { cell?: CompareCell }) {
  const status = cell?.status ?? "yes";
  if (status === "yes" || status === "no") {
    const Icon = status === "yes" ? Check : X;
    const answer = <span className={'lp-compare-answer is-' + status}><Icon size={18} strokeWidth={2.5} aria-hidden="true" />{status === "yes" ? "Yes" : "No"}</span>;
    // The catch on a yes ("single user", "in preview"), in our own words.
    return cell?.label ? <span className="lp-compare-caveated">{answer}<small>{cell.label}</small></span> : answer;
  }
  return <span className="lp-compare-qualified">{status === "soon" ? "Coming soon" : "Paid"}{cell?.label && <small>{cell.label}</small>}</span>;
}
