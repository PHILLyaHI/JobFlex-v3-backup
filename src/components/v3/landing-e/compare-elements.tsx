import Image from "next/image";
import { Check, Contrast, X, ListChecks } from "lucide-react";
import { LogoMark } from "./logo";
import { CAVEAT_LABEL, COMPARE_COMPETITORS, type CompareCell, type CompetitorId } from "./landing-compare";
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
    return <span className={'lp-compare-answer is-' + status}><Icon size={18} strokeWidth={2.5} aria-hidden="true" />{status === "yes" ? "Yes" : "No"}</span>;
  }
  // A yes with a catch (owner, 2026-10-02): its own state — a half-filled
  // mark, never a tick or a cross — and the caveat's name.
  if (status === "partial" && cell?.caveat) {
    return <span className="lp-compare-partial">
      <Contrast size={16} strokeWidth={2.25} aria-hidden="true" />
      <span>{CAVEAT_LABEL[cell.caveat]}</span>
    </span>;
  }
  return <span className="lp-compare-qualified">{status === "soon" ? "Coming soon" : "Paid"}{cell?.label && <small>{cell.label}</small>}</span>;
}

