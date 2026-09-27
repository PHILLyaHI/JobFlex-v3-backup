import { CompareSection } from "./compare-section";
export function Intro() {
  return (
    <section id="compare" className="lp-cmpx lp-compare-section">
      <div className="relative z-[1] mx-auto lp-wrap">
        <header className="lp-compare-heading">
          <p className="lp-eyebrow">Compare contractor software</p>
          <h2>JobFlex vs. other contractor apps.</h2>
          <p className="lp-compare-intro">Compare the tools for quoting, estimating and running your business, side by side.</p>
        </header>
        <CompareSection />
      </div>
    </section>
  );
}
