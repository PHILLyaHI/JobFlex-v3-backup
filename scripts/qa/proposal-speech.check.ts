// "Listen to this proposal" (2026-09-23): the words the audio reads, for a
// roof, a fence, an HVAC and a Smart proposal. Pure, no model, no DB.
//   npx --no-install tsx --tsconfig tsconfig.json scripts/qa/proposal-speech.check.ts
import {
  buildProposalSpeech,
  MAX_SPEECH_CHARS,
  openingSentences,
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
    { name: 'Architectural shingles · 30-yr', quantity: 24, measurementType: "SQUARE", total: 6480 },
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
check("the opener names the client, the trade and the company, and promises a length",
  s1.startsWith("Hi Rick. Here's your roofing proposal from Ridgeline Roofing, in about"), s1.slice(0, 90));
check("the street line is read, the ZIP is not", s1.includes("It's for 4567 Rainier Ave S.") && !s1.includes("98118"));
check("the title is read with its dash spoken as a pause", s1.includes("The job: Roof replacement, architectural shingles."));
check("the scope's opening is read, the 'Please note' block is not",
  s1.includes("Tear off one layer of 3-tab shingles from the 24-square main roof") && !s1.includes("Rotten decking"));
check("the three biggest items are read with quantity, unit and price, biggest first",
  s1.includes("It's priced in 5 items. The biggest are: Architectural shingles, 30-yr, 24 squares, at $6,480; Tear-off and disposal, 24 squares, at $2,400; and Synthetic underlayment, 2,400 square feet, at $720."), s1);
check("the total is exact to the cent, and the tax is named", s1.includes("Your total comes to $11,306.52.") && s1.includes("That includes $1,046.52 in sales tax."));
check("percent stages are read as dollars of the total", s1.includes("Payment is in 2 steps: Deposit, $3,391.96; and Final payment, $7,914.56."), s1);
check("the price holds until the date, and the phone is dictated in groups",
  s1.includes("This price holds until October 15.") && s1.includes("Call Ridgeline Roofing at 2 0 6, 5 5 5, 0 1 0 0."));
check("an open proposal ends with what to do when parked", s1.endsWith("When you're parked, open the link to see every line, and accept online."));
check("no inch marks, ampersands or dashes survive for the voice", !/[&×—–"″]/.test(s1));
check("well under the model's input cap, and about a minute long", s1.length < MAX_SPEECH_CHARS && speechSeconds(s1) >= 40 && speechSeconds(s1) <= 100, `${s1.length} chars, ${speechSeconds(s1)} s`);
check("the same words hash the same; a price change moves the hash",
  speechHash(s1) === speechHash(buildProposalSpeech(roof)) && speechHash(s1) !== speechHash(buildProposalSpeech({ ...roof, total: 11500 })) && /^[0-9a-f]{16}$/.test(speechHash(s1)));

const fence: SpeechInput = {
  trade: "fence",
  title: 'Cedar privacy fence — 6\' × 120 lf',
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
check("a fence proposal says so, and speaks feet, inches and grades",
  s2.includes("your fence proposal from Optima Fence and Deck") && s2.includes("The job: Cedar privacy fence, 6 foot by 120 linear feet.") && s2.includes("2 by 4 inch rails on steel posts") && s2.includes("number 1 tight-knot cedar"), s2);
check("three items or fewer are all read, and the fence note stays on the page", s2.includes("The work is priced in 3 items: Fence materials, number 1 tight-knot cedar, 120 linear feet, at $4,200;") && !s2.includes("clear path"));
check("a discount and the approved change orders are both said",
  s2.includes("A $300 discount is already in that price.") && s2.includes("With the approved change orders, the contract total is $7,950."));
check("what was paid and what is still due, against the contract total", s2.includes("$2,000 has been paid so far; $5,950 is still due."), s2);
check("an expired price asks for a call; an accepted proposal says thank you",
  s2.includes("The price was quoted through August 1, so please call to confirm it still stands.") && s2.includes("You've already accepted this proposal. Thank you."));

const hvac: SpeechInput = {
  trade: "hvac",
  title: "Heat pump replacement",
  status: "PAID",
  clientName: null,
  orgName: "Ridgeline Roofing",
  orgPhone: null,
  address: null,
  description: "Replace the 18-year-old 3-ton split system with a 3-ton 16 SEER2 heat pump and matching air handler.",
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
check("no name, no address, no phone: 'Hi there', the description stands in for a hidden scope",
  s3.startsWith("Hi there. Here's your HVAC proposal from Ridgeline Roofing") && s3.includes("Replace the 18-year-old 3-ton split system") && !s3.includes("hidden scope") && !s3.includes("Call"), s3);
check("one item, one payment, paid in full", s3.includes("The work is priced in one item: 3-ton heat pump system, installed at $12,800.") && s3.includes("Payment: Full payment, $12,800.") && s3.includes("It is paid in full. Thank you.") && s3.endsWith("This proposal is accepted and paid in full. Thank you."));

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
  lineItems: Array.from({ length: 40 }, (_, i) => ({ name: `Step ${i + 1} of the remodel with a fairly long description of the work involved`, quantity: 1, measurementType: "UNIT", total: 500 + i })),
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
check("a Smart Proposal is just 'your proposal'; forty items read as the three biggest; six stages read as a count",
  s4.includes("Here's your proposal from Acme Remodeling") && s4.includes("It's priced in 40 items. The biggest are: Step 40") && s4.includes("Payment is in 6 steps, starting with Stage 1, $3,463.33."), s4);
check("a leading +1 is dropped from the phone", s4.includes("at 2 0 6, 5 5 5, 0 1 9 9."));

check("a script past the cap is cut at a sentence",
  buildProposalSpeech({ ...smart, scopeOfWork: ("A very long sentence without a period " + "x".repeat(200) + ", ").repeat(40) }).length <= MAX_SPEECH_CHARS);

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
check("the opening of a scope stops at whole sentences, drops bullets",
  openingSentences("First sentence here. Second one is here too. Third sentence is long enough to push past the limit when it is added to the first two sentences of the text, so it stays out of the summary. Fourth.", 90) === "First sentence here. Second one is here too." &&
  openingSentences("- bullet one.\n- bullet two.") === "bullet one. bullet two.");
check("the device voice gets whole sentences", speechSentences(s1).length >= 10 && speechSentences(s1).every((x) => x.length < 400));

console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
