import type { EmailDoc } from "./doc";

const ORG = { kind: "org" as const, name: "Cedar & Oak Builders", logoUrl: null };
const FOOT = { name: "Cedar & Oak Builders", contact: "(503) 555-0142", ref: "Ref A-2481" };

export const FIXTURES: { id: string; label: string; note?: string; doc: EmailDoc }[] = [
  {
    id: "proposal-sent",
    label: "1 · Proposal sent",
    note: "Anchor: total. Receipt box, tax at label size, condition last.",
    doc: {
      subject: "Your proposal from Cedar & Oak Builders",
      lockup: ORG,
      kicker: { text: "Proposal" },
      headline: "Backyard cedar fence",
      prose: ["Hi Jordan — here's the work we walked through on Tuesday, priced out."],
      box: [
        { type: "item", name: "Cedar pickets & rails", amount: "$2,340" },
        { type: "item", name: "Posts, concrete & hardware", amount: "$960" },
        { type: "item", name: "Labor", amount: "$1,320" },
        { type: "item", name: "Haul-off & disposal", amount: "$200" },
        { type: "rate", label: "Tax", rate: "5%", amount: "$241" },
        { type: "anchor", label: "Total", value: "$5,061" },
        { type: "cond", label: "Price held until", chip: "17 Aug" },
      ],
      cta: { label: "Review & accept", href: "https://example.com/portal/q/demo" },
      after: ["Anything you'd like changed? Just reply — it comes straight to us."],
      footer: FOOT,
    },
  },
  {
    id: "edge-long-names",
    label: "EDGE · 108-char item names",
    note: "Names wrap to 3 lines; the amount column must not move.",
    doc: {
      subject: "Main roof replacement",
      lockup: { kind: "org", name: "Precision Roofing", logoUrl: null },
      kicker: { text: "Proposal" },
      headline: "Main roof replacement",
      prose: ["Hi Dana — here's the full scope from Thursday's inspection, priced out."],
      box: [
        {
          type: "item",
          name: "Tear-off and disposal of existing 3-tab asphalt shingles including underlayment and drip edge",
          amount: "$12,480",
        },
        {
          type: "item",
          name: "Synthetic underlayment with ice & water shield at all valleys and eaves",
          amount: "$2,140",
        },
        { type: "item", name: "Ridge vent", amount: "$640" },
        { type: "rate", label: "Tax", rate: "5%", amount: "$1,007" },
        { type: "anchor", label: "Total", value: "$21,147" },
        { type: "cond", label: "Price held until", chip: "17 Aug", tone: "warn" },
      ],
      cta: { label: "Review & accept", href: "https://example.com/portal/q/demo" },
      footer: { name: "Precision Roofing", contact: "(206) 555-0198" },
    },
  },
  {
    id: "edge-long-total",
    label: "EDGE · 10-digit total",
    note: "fitAnchor must drop 38 → 27px so it stays inside the border at 375px.",
    doc: {
      subject: "Commercial re-roof",
      lockup: { kind: "org", name: "Precision Roofing", logoUrl: null },
      kicker: { text: "Proposal" },
      headline: "Commercial re-roof",
      box: [
        { type: "item", name: "Membrane system", amount: "$1,102,400" },
        { type: "rate", label: "Tax", rate: "5%", amount: "$182,100" },
        { type: "anchor", label: "Total", value: "$1,284,500" },
        { type: "cond", label: "Price held until", chip: "30 Sep" },
      ],
      cta: { label: "Review & accept", href: "https://example.com/portal/q/demo" },
      footer: { name: "Precision Roofing" },
    },
  },
  {
    id: "edge-long-org",
    label: "EDGE · 66-char company name",
    note: "fitOrgName shrinks and wraps — it must never truncate.",
    doc: {
      subject: "Test",
      lockup: {
        kind: "org",
        name: "Precision Roofing & Exterior Restoration of Greater Puget Sound LLC",
        logoUrl: null,
      },
      kicker: { text: "Proposal" },
      headline: "Complete tear-off and replacement of primary residence roof",
      prose: ["Hi Dana — here's the scope, priced out."],
      box: [{ type: "anchor", label: "Total", value: "$21,147" }],
      cta: { label: "Review & accept", href: "https://example.com" },
      footer: { name: "Precision Roofing & Exterior Restoration of Greater Puget Sound LLC" },
    },
  },
  {
    id: "edge-item-cap",
    label: "EDGE · 40 items → capped at 12",
    note: "Rollup row carries its own summed amount so the column still reconciles.",
    doc: {
      subject: "Full renovation",
      lockup: ORG,
      kicker: { text: "Proposal" },
      headline: "Full renovation",
      box: [
        ...Array.from({ length: 12 }, (_, i) => ({
          type: "item" as const,
          name: `Line item ${i + 1}`,
          amount: "$1,200",
        })),
        { type: "item", name: "28 more items", amount: "$33,600" },
        { type: "rate", label: "Tax", rate: "5%", amount: "$2,400" },
        { type: "anchor", label: "Total", value: "$50,400" },
        { type: "cond", label: "Price held until", chip: "17 Aug" },
      ],
      cta: { label: "Review & accept", href: "https://example.com" },
      footer: FOOT,
    },
  },
  {
    id: "edge-zero-tax",
    label: "EDGE · zero tax → row absent",
    note: "Principle 03 — the rate row must not render at all, not render as $0.",
    doc: {
      subject: "Backyard cedar fence",
      lockup: ORG,
      kicker: { text: "Proposal" },
      headline: "Backyard cedar fence",
      box: [
        { type: "item", name: "Cedar pickets & rails", amount: "$2,340" },
        { type: "item", name: "Labor", amount: "$1,320" },
        { type: "anchor", label: "Total", value: "$3,660" },
        { type: "cond", label: "Price held until", chip: "17 Aug" },
      ],
      cta: { label: "Review & accept", href: "https://example.com" },
      footer: FOOT,
    },
  },
  {
    id: "adapter-template",
    label: "ADAPTER · contractor-authored template",
    note: "Free text through wrapEmail(). No box — free text carries no structure. Bare URL becomes the CTA.",
    doc: {
      subject: "Any questions about your Backyard cedar fence quote?",
      lockup: ORG,
      headline: "Any questions about your Backyard cedar fence quote?",
      prose: [
        "Hi Jordan,",
        "Just circling back on the proposal I sent over. Happy to walk you through anything or tweak the scope — no pressure either way.",
      ],
      cta: { label: "Review and accept it here", href: "https://example.com/portal/q/demo" },
      footer: { name: "Cedar & Oak Builders" },
    },
  },
];
