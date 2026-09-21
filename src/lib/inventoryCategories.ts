// WHAT KIND OF ITEM A STOCK ITEM IS (2026-09-20) — pure.
//
// Owner: the inventory dashboard should be "more organized and
// understandable." Ninety-seven roofing items read better as eight shelves
// than as one list, so each item gets a category from its name: the first
// rule that matches wins, and the rules are ordered so the specific word
// beats the general one ("Eave starter course · slate" is flashing and trim,
// not a covering). An item no rule knows is "Other". Display order is the
// order a warehouse walks: the covering first, then what goes under and
// around it, then the small stuff.

type Rule = [RegExp, string];

const ROOF: Rule[] = [
  [/ridge vent|soffit|intake vent/i, "Ventilation"],
  [/coating|silicone|acrylic|urethane|pmma|liquid|spray foam|power wash|surface prep/i, "Coatings & restoration"],
  [/drip edge|valley|flashing|edge metal|eave|pipe boot|chimney|gravel stop|starter|hip & ridge|ridge \/ hip|fascia|trim/i, "Flashing, edge & trim"],
  [/shingle|shake|slate|\btile\b|standing.seam|metal panel|stone-coated|steel|copper|solar|cedar/i, "Shingles & coverings"],
  [/epdm|tpo|pvc|kee|mod bit|built-up|membrane|cover board|ballast|paver|vegetative|waterproofing|fleece|rolled roofing|cap sheet/i, "Low-slope roofing"],
  [/underlayment|ice & water|high-temp/i, "Underlayment"],
  [/nail|fastener|screw|plate|clip|cement|sealant|caulk|tape|cleaner|collar|reinforcement|adhesive|primer/i, "Fasteners, adhesives & sealants"],
];
const ROOF_ORDER = ["Shingles & coverings", "Underlayment", "Flashing, edge & trim", "Ventilation", "Fasteners, adhesives & sealants", "Low-slope roofing", "Coatings & restoration", "Other"];

const FENCE: Rule[] = [
  [/\brail|stiffener|tension|brace|bracket/i, "Rails & framing"],
  [/picket|board|panel|slat|fabric|mesh/i, "Pickets, panels & fabric"],
  [/post|\bcaps?\b/i, "Posts & caps"],
  [/concrete|gravel|backfill/i, "Concrete & backfill"],
  [/nail|screw|\bties?\b|band/i, "Fasteners & ties"],
  [/gate|hinge|latch/i, "Gates & hardware"],
];
const FENCE_ORDER = ["Posts & caps", "Rails & framing", "Pickets, panels & fabric", "Gates & hardware", "Concrete & backfill", "Fasteners & ties", "Other"];

const HVAC: Rule[] = [
  [/line set|line-hide|refrigerant|a2l/i, "Refrigerant & line sets"],
  [/disconnect|whip|surge|breaker|circuit/i, "Electrical"],
  [/thermostat|alarm|sensor/i, "Controls & safety"],
  [/\bvent|flue|gas flex/i, "Venting & gas"],
  [/condensate|drain|\bpad\b|\bpan\b|expansion tank|flex lines|t&p/i, "Drains, pads & plumbing"],
  [/starter|condenser|furnace|heat pump|air handler|coil|ductless|water heater|heat kit/i, "Equipment"],
];
const HVAC_ORDER = ["Equipment", "Refrigerant & line sets", "Electrical", "Controls & safety", "Venting & gas", "Drains, pads & plumbing", "Other"];

const RULES: Record<string, Rule[]> = { roof: ROOF, fence: FENCE, hvac: HVAC };
const ORDER: Record<string, string[]> = { roof: ROOF_ORDER, fence: FENCE_ORDER, hvac: HVAC_ORDER };

/** The shelf an item sits on, by its name. */
export function itemCategory(trade: string, name: string): string {
  for (const [re, label] of RULES[trade] ?? []) if (re.test(name)) return label;
  return "Other";
}

/** The categories in walking order; "Other" last. */
export function categoryOrder(trade: string): string[] {
  return ORDER[trade] ?? ["Other"];
}

/** Items grouped by category in walking order; empty categories are left out and the items keep their order within a group. */
export function groupByCategory<T>(trade: string, items: readonly T[], nameOf: (t: T) => string): Array<{ label: string; items: T[] }> {
  const by = new Map<string, T[]>();
  for (const it of items) {
    const c = itemCategory(trade, nameOf(it));
    by.set(c, [...(by.get(c) ?? []), it]);
  }
  const order = categoryOrder(trade);
  return [...by.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([label, list]) => ({ label, items: list }));
}
