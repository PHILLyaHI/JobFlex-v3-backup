// HOW EACH STATE VOTED FOR PRESIDENT IN 2024 (2026-10-03) — pure.
//
// Owner, on the live map: "paint states in the democratic state and
// republican states, but pins should be visual very good on red states".
// The statewide winner of the 2024 presidential election; Maine and Nebraska
// split their district votes, and the statewide winner is what is painted.
// The District of Columbia voted Democratic; the territories have no
// electoral vote and stay unpainted.

export type Party = "D" | "R";

export const PRESIDENTIAL_2024: Readonly<Record<string, Party>> = {
  CA: "D", CO: "D", CT: "D", DC: "D", DE: "D", HI: "D", IL: "D", MA: "D", MD: "D", ME: "D",
  MN: "D", NH: "D", NJ: "D", NM: "D", NY: "D", OR: "D", RI: "D", VA: "D", VT: "D", WA: "D",
  AK: "R", AL: "R", AR: "R", AZ: "R", FL: "R", GA: "R", IA: "R", ID: "R", IN: "R", KS: "R",
  KY: "R", LA: "R", MI: "R", MO: "R", MS: "R", MT: "R", NC: "R", ND: "R", NE: "R", NV: "R",
  OH: "R", OK: "R", PA: "R", SC: "R", SD: "R", TN: "R", TX: "R", UT: "R", WI: "R", WV: "R", WY: "R",
};

export const PARTY_LABEL: Record<Party, string> = { D: "Democratic", R: "Republican" };

/** "D", "R", or null for a territory or an unknown code. */
export function partyOf(stateCode: string | null | undefined): Party | null {
  return PRESIDENTIAL_2024[(stateCode ?? "").toUpperCase()] ?? null;
}
