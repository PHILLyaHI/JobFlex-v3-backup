// THE LANDING'S SECTIONS, in page order (2026-10-02) — shared by the
// landing's section tracker (which fires `landing_section` as each is
// reached) and the admin's analyst (which reads how far visitors get). No
// imports on purpose: the tracker ships in the landing's JavaScript.
//
// Each section is found by the first selector that matches: the block's own
// id, or its content-visibility wrapper (`.lp-cv--…` in landing-e-page.tsx)
// which has a laid-out box even before the block is rendered. `shown` says
// which pages carry it: some sections are trade-specific.

export interface LandingSection {
  key: string;
  label: string;
  selector: readonly string[];
  /** "all", or a note on which landings show it (the analyst says "where shown"). */
  shown: "all" | "some";
}

export const LANDING_SECTIONS: readonly LandingSection[] = [
  { key: "hero", label: "Hero", selector: ["#hero"], shown: "all" },
  { key: "compare", label: "JobFlex vs other apps", selector: ["#compare"], shown: "all" },
  { key: "showcase", label: "Estimators", selector: [".lp-cv--showcase", "#showcase"], shown: "all" },
  { key: "hvac", label: "HVAC service book", selector: [".lp-cv--hvac", "#service"], shown: "some" },
  { key: "montage", label: "Real work photos", selector: [".lp-cv--montage"], shown: "some" },
  { key: "proposals", label: "Proposals", selector: [".lp-cv--proposals", "#proposals"], shown: "all" },
  { key: "portal", label: "Client portal", selector: [".lp-cv--portal", "#portal"], shown: "all" },
  { key: "crew", label: "Crew & cash flow", selector: [".lp-cv--crew", "#crew"], shown: "all" },
  { key: "integrations", label: "Integrations", selector: [".lp-cv--integrations", "#integrations"], shown: "all" },
  { key: "stats", label: "Proof & numbers", selector: [".lp-cv--stats", "#stats"], shown: "all" },
  { key: "built", label: "Everything contractors need", selector: [".lp-cv--built", "#field"], shown: "all" },
  { key: "pricing", label: "Pricing", selector: [".lp-cv--pricing", "#pricing"], shown: "all" },
  { key: "faq", label: "FAQ", selector: [".lp-cv--faq", "#faq"], shown: "all" },
  { key: "final", label: "Final call to action", selector: ["#final"], shown: "all" },
];

export const LANDING_SECTION_KEYS = LANDING_SECTIONS.map((s) => s.key);
