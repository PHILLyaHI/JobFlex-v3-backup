import { CompareSection } from "./compare-section";
export function Intro() {
  return (
    <section id="compare" className="lp-cmpx lp-compare-section">
      <div className="relative z-[1] mx-auto lp-wrap">
        <header className="lp-compare-heading">
          <h2>JobFlex vs. other contractor apps.</h2>
        </header>
        <CompareSection />
      </div>
    </section>
  );
}
