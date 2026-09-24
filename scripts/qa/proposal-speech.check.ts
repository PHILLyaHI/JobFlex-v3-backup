// "Listen to this proposal" (2026-09-23, forty-second brief 2026-09-24): the
// words the audio reads, for a roof, a fence, an HVAC and a Smart proposal.
// Pure, no model, no DB.
//   npx --no-install tsx --tsconfig tsconfig.json scripts/qa/proposal-speech.check.ts
import {
  briefSentence,
  buildProposalSpeech,
  MAX_SPEECH_CHARS,
  openingSentences,
  shortName,
  speechHash,
  speechInputFromRow,
  speechSeconds,
  speechSentences,
  spokenMoney,
  spokenPhone,
  spokenText,
  spokenUnit,
  type SpeechInput,
} from "../../src/lib/proposalSpeech";

let bad = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const now = new Date("2026-09-23T12:00:00Z");
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

const roof: SpeechInput = {
  trade: "roofing",
  title: "Roof replacement — architectural shingles",
  status: "SENT",
  clientName: "Rick Stevens",
  orgName: "Ridgeline Roofing",
  orgPhone: "(206) 555-0100",
  address: "4567 Rainier Ave S, Seattle, WA 98118",
  description: null,
  scopeOfWork:
    "Tear off one layer of 3-tab shingles from the 24-square main roof and haul it away. Install synthetic underlayment, ice & water shield at the eaves and valleys, and 30-year architectural shingles. Replace all pipe boots and step flashing. Please note:\n• Rotten decking is replaced at $85 per sheet.",
  showScope: true,
  lineItems: [
    { name: "Tear-off & disposal", quantity: 24, measurementType: "SQUARE", total: 2400 },
    { name: "Architectural shingles · 30-yr", quantity: 24, measurementType: "SQUARE", total: 6480 },
    { name: "Synthetic underlayment", quantity: 2400, measurementType: "SQFT", total: 720 },
    { name: "Ridge vent", quantity: 40, measurementType: "LINEAR_FT", total: 480 },
    { name: "Pipe boots", quantity: 3, measurementType: "UNIT", total: 180 },
  ],
  subtotal: 10260,
  discountTotal: 0,
  taxTotal: 1046.52,
  total: 11306.52,
  validUntil: new Date("2026-10-15T00:00:00Z"),
  installments: [
    { label: "Deposit", amount: 30, isPercent: true, status: "UNPAID" },
    { label: "Final payment", amount: 70, isPercent: true, status: "UNPAID" },
  ],
  now,
};
const s1 = buildProposalSpeech(roof);
console.log("\n--- roof ---\n" + s1 + "\n");
const p1 = s1.split("\n\n");
check("six short paragraphs, a pause between each", p1.length === 6, `${p1.length} paragraphs`);
check("the opener: who it is from and what this is", p1[0] === "Hi Rick, this is Ridgeline Roofing with a quick summary of your roofing proposal.", p1[0]);
check("the job in one breath: the street, the title, one sentence of the scope; the note block stays on the page",
  p1[1] === "It's for 4567 Rainier Ave S: roof replacement, architectural shingles. Tear off one layer of 3-tab shingles from the 24-square main roof and haul it away." && !s1.includes("Rotten decking") && !s1.includes("98118"), p1[1]);
check("the main items are named, biggest first, without prices",
  p1[2] === "It covers 5 items; the main ones are architectural shingles, tear-off and disposal, and synthetic underlayment.", p1[2]);
check("the total exact to the cent, with the tax", p1[3] === "Your total comes to $11,306.52, including $1,046.52 in sales tax.", p1[3]);
check("two stages as dollars, and how long the price holds",
  p1[4] === "Payment is in two steps: deposit, $3,391.96, then final payment, $7,914.56. This price is good through October 15.", p1[4]);
check("the phone in digit groups, then what to do when parked",
  p1[5] === "Questions? Call us at 2 0 6, 5 5 5, 0 1 0 0. When you're parked, open the link to see every line and accept online.", p1[5]);
check("about forty seconds", words(s1) >= 80 && words(s1) <= 125 && speechSeconds(s1) >= 30 && speechSeconds(s1) <= 48, `${words(s1)} words, ${speechSeconds(s1)} s`);
check("no inch marks, ampersands or dashes survive for the voice", !/[&×—–"″]/.test(s1));
check("the same words hash the same; a price change moves the hash",
  speechHash(s1) === speechHash(buildProposalSpeech(roof)) && speechHash(s1) !== speechHash(buildProposalSpeech({ ...roof, total: 11500 })) && /^[0-9a-f]{16}$/.test(speechHash(s1)));

const fence: SpeechInput = {
  trade: "fence",
  title: "Cedar privacy fence — 6' × 120 lf",
  status: "ACCEPTED",
  clientName: "Maria Lopez",
  orgName: "Optima Fence & Deck",
  orgPhone: "425-555-0142",
  address: "8232 195th Pl SW, Edmonds, WA",
  description: null,
  scopeOfWork: "Build 120 lf of 6' cedar privacy fence with 2\"×4\" rails on steel posts. One 4' walk gate. Please note:\n• A 2-ft clear path along the line.",
  showScope: true,
  lineItems: [
    { name: "Fence materials · #1 tight-knot cedar", quantity: 120, measurementType: "LINEAR_FT", total: 4200 },
    { name: "Installation labor", quantity: 120, measurementType: "LINEAR_FT", total: 3000 },
    { name: "Walk gate", quantity: 1, measurementType: "UNIT", total: 450 },
  ],
  subtotal: 7650,
  discountTotal: 300,
  taxTotal: 0,
  total: 7350,
  contractTotal: 7950,
  validUntil: new Date("2026-08-01T00:00:00Z"),
  installments: [
    { label: "Deposit", amount: 2000, isPercent: false, status: "PAID", paidAmount: 2000 },
    { label: "On completion", amount: 5350, isPercent: false, status: "UNPAID" },
  ],
  now,
};
const s2 = buildProposalSpeech(fence);
console.log("--- fence ---\n" + s2 + "\n");
const p2 = s2.split("\n\n");
check("a fence proposal says so, and speaks feet and inches",
  p2[0] === "Hi Maria, this is Optima Fence and Deck with a quick summary of your fence proposal." && p2[1] === "It's for 8232 195th Pl SW: cedar privacy fence, 6 foot by 120 linear feet. Build 120 linear feet of 6 foot cedar privacy fence with 2 by 4 inch rails on steel posts.", p2[1]);
check("three items or fewer are all named, short names only; the fence note stays on the page",
  p2[2] === "It covers fence materials, installation labor, and walk gate." && !s2.includes("clear path"), p2[2]);
check("no tax line at zero; a discount and the approved change orders are both said",
  p2[3] === "Your total comes to $7,350. A $300 discount is already in that price. With the approved change orders, the contract total is $7,950.", p2[3]);
check("what was paid and what is still due, and an expired price asks for a call",
  p2[4] === "Payment is in two steps: deposit, $2,000, then on completion, $5,350. $2,000 has been paid so far; $5,950 is still due. The price was quoted through August 1, so please call to confirm it still stands.", p2[4]);
check("an accepted proposal says thank you", p2[5].endsWith("You've already accepted this proposal. Thank you!"), p2[5]);

const hvac: SpeechInput = {
  trade: "hvac",
  title: "Heat pump replacement",
  status: "PAID",
  clientName: null,
  orgName: "Ridgeline Roofing",
  orgPhone: null,
  address: null,
  description: "Replace the 18-year-old 3-ton split system with a 3-ton 16 SEER2 heat pump and matching air handler, reusing the line set after a pressure test, with a new pad, disconnect and thermostat.",
  scopeOfWork: "hidden scope",
  showScope: false,
  lineItems: [{ name: "3-ton heat pump system, installed", quantity: 1, measurementType: "LUMP_SUM", total: 12800 }],
  subtotal: 12800,
  discountTotal: 0,
  taxTotal: 0,
  total: 12800,
  validUntil: null,
  installments: [{ label: "Full payment", amount: 12800, isPercent: false, status: "PAID", paidAmount: 12800 }],
  now,
};
const s3 = buildProposalSpeech(hvac);
console.log("--- hvac ---\n" + s3 + "\n");
const p3 = s3.split("\n\n");
check("no name, no address, no phone: 'Hi there', the job by title, the description stands in for a hidden scope and is cut at a clause",
  p3[0] === "Hi there, this is Ridgeline Roofing with a quick summary of your HVAC proposal." && p3[1] === "The job: Heat pump replacement. Replace the 18-year-old 3-ton split system with a 3-ton 16 SEER2 heat pump and matching air handler." && !s3.includes("hidden scope") && !s3.includes("Call"), p3[1]);
check("one item, one payment, paid in full",
  p3[2] === "It covers 3-ton heat pump system, installed." && p3[4] === "Payment: full payment, $12,800. It is paid in full. Thank you." && p3[5] === "This proposal is accepted and paid in full. Thank you!", s3);

const smart: SpeechInput = {
  trade: null,
  title: "Hall bathroom remodel",
  status: "DRAFT",
  clientName: "Pat Homeowner",
  orgName: "Acme Remodeling",
  orgPhone: "+1 (206) 555-0199",
  address: "12 Main St",
  description: null,
  scopeOfWork: null,
  showScope: true,
  lineItems: Array.from({ length: 40 }, (_, i) => ({ name: `Step ${i + 1} of the remodel`, quantity: 1, measurementType: "UNIT", total: 500 + i })),
  subtotal: 20780,
  discountTotal: 0,
  taxTotal: 0,
  total: 20780,
  validUntil: null,
  installments: Array.from({ length: 6 }, (_, i) => ({ label: `Stage ${i + 1}`, amount: 3463.33, isPercent: false, status: "UNPAID" })),
  now,
};
const s4 = buildProposalSpeech(smart);
console.log("--- smart ---\n" + s4 + "\n");
const p4 = s4.split("\n\n");
check("a Smart Proposal is just 'your proposal'; forty items read as the three biggest; six stages read as a count; a leading +1 is dropped",
  p4[0].endsWith("summary of your proposal.") && p4[2] === "It covers 40 items; the main ones are step 40 of the remodel, step 39 of the remodel, and step 38 of the remodel." && p4[4] === "Payment is in 6 steps, starting with stage 1, $3,463.33." && s4.includes("Call us at 2 0 6, 5 5 5, 0 1 9 9."), s4);

check("a script past the cap is cut at a sentence",
  buildProposalSpeech({ ...smart, title: ("A very long title without a period " + "x".repeat(200) + ", ").repeat(40) }).length <= MAX_SPEECH_CHARS);

check("the row adapter takes the portal's row: job address first, contract with approved orders, hidden scope honoured",
  (() => {
    const input = speechInputFromRow({
      trade: "roof", title: "T", status: "SENT", address: "1 Job Rd, City", description: "d", scopeOfWork: "s", showScope: false,
      subtotal: 100, discountTotal: 0, taxTotal: 0, total: 100, validUntil: null,
      client: { name: "C", address: "2 Client Rd" }, organization: { name: "O", phone: null },
      lineItems: [], installments: [], changeOrders: [{ status: "APPROVED", total: 25 }, { status: "SENT", total: 999 }, { status: "APPROVED", total: null }],
    });
    return input.address === "1 Job Rd, City" && input.contractTotal === 125 && input.showScope === false;
  })());

check("spoken helpers: money, units, phone, text",
  spokenMoney(1234.5) === "$1,234.50" && spokenMoney(12000) === "$12,000" && spokenMoney(-200) === "minus $200" &&
  spokenUnit("SQFT", 2) === "square feet" && spokenUnit("SQUARE", 1) === "square" && spokenUnit("LINEAR_FT", 40) === "linear feet" && spokenUnit("UNIT", 3) === "" && spokenUnit("HOUR", 1) === "hour" && spokenUnit("pallet", 2) === "pallet" &&
  spokenPhone("(206) 555-0100") === "2 0 6, 5 5 5, 0 1 0 0" && spokenPhone("12065550100") === "2 0 6, 5 5 5, 0 1 0 0" && spokenPhone("555-0100") === "555-0100" &&
  spokenText('2"×4" cedar rails, 6\' tall, 24 sq ft, #2 & better — 15% off') === "2 by 4 inch cedar rails, 6 foot tall, 24 square feet, number 2 and better, 15 percent off",
  spokenText('2"×4" cedar rails, 6\' tall, 24 sq ft, #2 & better — 15% off'));
check("the opening of a scope stops at whole sentences and drops bullets; a brief is one sentence cut at a clause; short names stop at the dot",
  openingSentences("First sentence here. Second one is here too. Third sentence is long enough to push past the limit when it is added to the first two sentences of the text, so it stays out of the summary. Fourth.", 90) === "First sentence here. Second one is here too." &&
  openingSentences("- bullet one.\n- bullet two.") === "bullet one. bullet two." &&
  briefSentence("Tear off the old roof, install new underlayment and ice and water shield at every eave and valley, then lay thirty-year architectural shingles with new flashing at the chimney and the walls, and haul everything away. Second sentence.", 100) === "Tear off the old roof, install new underlayment and ice and water shield at every eave and valley." &&
  shortName("Fence materials · #1 tight-knot cedar") === "Fence materials" && shortName("Ridge vent") === "Ridge vent",
  briefSentence("Tear off the old roof, install new underlayment and ice and water shield at every eave and valley, then lay thirty-year architectural shingles with new flashing at the chimney and the walls, and haul everything away. Second sentence.", 100));
check("the device voice gets whole sentences, never a paragraph break inside one", speechSentences(s1).length >= 8 && speechSentences(s1).every((x) => !x.includes("\n")));

console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
