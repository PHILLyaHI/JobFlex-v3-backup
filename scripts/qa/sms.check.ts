// Text messages (2026-09-24): the words, the rules, the preference cell.
// Pure, no Twilio, no DB.
//   npx --no-install tsx --tsconfig tsconfig.json scripts/qa/sms.check.ts
import {
  acceptedLine,
  brand,
  changeOrderLine,
  clip,
  crewAssignedText,
  crewCancelledText,
  crewDigestText,
  crewMovedText,
  heldDigestText,
  isStartWord,
  isStopWord,
  leadLine,
  money,
  paymentLine,
  redactLinks,
  SMS_MAX,
  spanLabel,
  unbrand,
  verifyText,
  welcomeText,
  workerRespondedLine,
} from "../../src/lib/sms/format";
import {
  allowsSms,
  defaultNotificationPrefs,
  mergeMatrixSave,
  nextLocalTime,
  nextQuietEnd,
  parseNotificationPrefs,
  PREF_EVENTS,
  smsDecision,
} from "../../src/lib/notificationPrefsShared";
import { toE164 } from "../../src/lib/phone";

let bad = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const TZ = "America/Los_Angeles";
const oct7 = new Date("2026-10-07T15:00:00Z"); // 8:00 AM Pacific
const oct7end = new Date("2026-10-07T23:00:00Z"); // 4:00 PM Pacific

/* ── words ── */
const assigned = crewAssignedText("Ridgeline Roofing", { title: "Roof replacement — Stevens", startsAt: oct7, endsAt: oct7end, address: "4567 Rainier Ave S, Seattle, WA 98118" }, "https://www.jobflex.app/w/abc123", TZ);
console.log("\n" + assigned + "\n");
check("the crew's assignment text: company first, the day and hours, the street, the link",
  assigned === "Ridgeline Roofing: you're on \"Roof replacement — Stevens\" Wed Oct 7, 8 AM–4 PM at 4567 Rainier Ave S. Details + confirm: https://www.jobflex.app/w/abc123", assigned);
check("a move and a cancellation say so",
  crewMovedText("Ridgeline Roofing", { title: "Roof replacement", startsAt: oct7, endsAt: oct7end, address: null }, null, TZ) === "Ridgeline Roofing: \"Roof replacement\" moved to Wed Oct 7, 8 AM–4 PM." &&
  crewCancelledText("Ridgeline Roofing", { title: "Roof replacement", startsAt: oct7 }, TZ) === "Ridgeline Roofing: \"Roof replacement\" on Wed Oct 7 is cancelled — you're not needed for it.");
const digest = crewDigestText("Ridgeline Roofing", "tomorrow", [
  { title: "Gutter repair", startsAt: new Date("2026-10-07T20:00:00Z"), endsAt: null, address: "12 Main St, Everett" },
  { title: "Roof replacement", startsAt: oct7, endsAt: oct7end, address: "4567 Rainier Ave S" },
], "https://www.jobflex.app/w/abc123", TZ);
console.log(digest + "\n");
check("the evening list is sorted by start with street lines and one link",
  digest === "Ridgeline Roofing — tomorrow (Wed Oct 7): 8 AM Roof replacement, 4567 Rainier Ave S · 1 PM Gutter repair, 12 Main St. Details: https://www.jobflex.app/w/abc123", digest);
check("five stops read as three and a count", /· \+2 more\./.test(crewDigestText("R", "today", Array.from({ length: 5 }, (_, i) => ({ title: `Stop ${i + 1}`, startsAt: new Date(oct7.getTime() + i * 3_600_000), endsAt: null, address: null })), null, TZ)));
check("no stops, no text", crewDigestText("R", "today", [], null, TZ) === "");
check("times: whole hours drop the minutes, an end that matches the start is not read",
  spanLabel(oct7, oct7end, TZ) === "Wed Oct 7, 8 AM–4 PM" && spanLabel(new Date("2026-10-07T15:30:00Z"), null, TZ) === "Wed Oct 7, 8:30 AM" && spanLabel(oct7, oct7, TZ) === "Wed Oct 7, 8 AM");

check("the office lines read as one glance each",
  acceptedLine("Rick Stevens", "Roof replacement — architectural shingles", 11306.52, "https://www.jobflex.app/dashboard/proposals/p1") === "Rick Stevens accepted \"Roof replacement — architectural shingles\" — $11,306.52. Schedule it: https://www.jobflex.app/dashboard/proposals/p1" &&
  paymentLine("Rick Stevens", "Roof replacement", 3391.96, 7914.56) === "Rick Stevens paid $3,391.96 on \"Roof replacement\" — $7,914.56 still due." &&
  paymentLine("Rick Stevens", "Roof replacement", 7914.56, 0) === "Rick Stevens paid $7,914.56 on \"Roof replacement\" — paid in full." &&
  leadLine("Pat Homeowner", "Roofing", "Seattle, WA", "(206) 555-0100", null) === "New lead: Pat Homeowner, Roofing in Seattle, WA ((206) 555-0100)." &&
  changeOrderLine("Rick", true, 2, "Plywood", 850, "Roof replacement") === "Rick approved change order #2 \"Plywood\" ($850) on \"Roof replacement\"." &&
  workerRespondedLine("Marcus Bell", false, "Roof replacement", "Wed Oct 7") === "Marcus Bell declined \"Roof replacement\" on Wed Oct 7.",
  acceptedLine("Rick Stevens", "Roof replacement — architectural shingles", 11306.52, "https://www.jobflex.app/dashboard/proposals/p1"));
check("the company leads every text and comes back off for folding",
  brand("Ridgeline Roofing", "hello") === "Ridgeline Roofing: hello" && unbrand("Ridgeline Roofing", "Ridgeline Roofing: hello") === "hello" && brand(null, "hello") === "hello");
check("held texts fold into one overnight line",
  heldDigestText("Ridgeline Roofing", ["Rick accepted \"Roof\" — $11,307.", "Rick paid $3,392 on \"Roof\" — $7,915 still due."]) === "Ridgeline Roofing: overnight — Rick accepted \"Roof\" — $11,307 · Rick paid $3,392 on \"Roof\" — $7,915 still due." &&
  heldDigestText("Ridgeline Roofing", ["one thing."]) === "Ridgeline Roofing: one thing.");
check("welcome, code and STOP words", welcomeText("Ridgeline Roofing").includes("Reply STOP to opt out") && /^JobFlex code: 482913\./.test(verifyText("482913")) &&
  isStopWord("STOP") && isStopWord("  unsubscribe please") && !isStopWord("stopping by at 3") && isStartWord("Start") && !isStartWord("no"));
check("stop words match the keyword, not a sentence that begins with it", isStopWord("stop") && !isStopWord("stopped by the shop") && isStopWord("STOPALL"));
check("nothing longer than two segments; links are redacted for logs; money reads plainly",
  clip("x".repeat(500)).length <= SMS_MAX && clip("a word ".repeat(80)).endsWith("…") && redactLinks("see https://www.jobflex.app/w/abc now") === "see <link> now" && money(12000) === "$12,000" && money(1234.5) === "$1,234.50");
check("phones normalise to E.164", toE164("(206) 555-0100") === "+12065550100" && toE164("1 206 555 0100") === "+12065550100" && toE164("555-0100") === null);

/* ── the preference cell ── */
const d = defaultNotificationPrefs();
check("the Text cell seeds on for the money events and off for the rest",
  d.matrix["lead-assigned"][2] && d.matrix["proposal-accepted"][2] && d.matrix["payment-received"][2] && d.matrix["change-order"][2] && !d.matrix["proposal-declined"][2] && !d.matrix["proposal-viewed"][2] && PREF_EVENTS.every((e) => e.smsAvailable || !d.matrix[e.key][2]));
const legacy = parseNotificationPrefs(JSON.stringify({ matrix: { "proposal-accepted": [true, false], "lead-assigned": [false, false, false], "proposal-viewed": [true, true, true] }, quietFrom: "21:00", quietTo: "06:30" }));
check("a stored pair reads its Text cell as the seed; a triple is kept; an unavailable channel is off",
  legacy.matrix["proposal-accepted"][2] === true && legacy.matrix["lead-assigned"][2] === false && legacy.matrix["proposal-viewed"][1] === false && legacy.matrix["proposal-viewed"][2] === false && legacy.quietFrom === "21:00");
const merged = mergeMatrixSave({ "proposal-accepted": [true, true], "lead-assigned": [true, true, true], "trade-reply": [true, true, true] }, legacy);
check("a save from the handheld page (pairs) keeps the Text cell; the desk page's triple wins; unavailable stays off",
  merged["proposal-accepted"][2] === true && merged["lead-assigned"][2] === true && merged["trade-reply"][2] === false && merged["payment-received"][2] === legacy.matrix["payment-received"][2]);

const night = new Date("2026-10-07T05:30:00Z"); // 10:30 PM Pacific, Oct 6
const day = new Date("2026-10-07T17:00:00Z"); // 10 AM Pacific
check("a text sends by day, waits by night, and a new lead never waits",
  smsDecision(d, "proposal-accepted", day, TZ) === "send" && smsDecision(d, "proposal-accepted", night, TZ) === "hold" && smsDecision(d, "lead-assigned", night, TZ) === "send" && smsDecision(d, "proposal-declined", day, TZ) === "skip" && allowsSms(d, "payment-received"));
const end = nextQuietEnd(d, night, TZ);
check("a held text goes out at 7 AM company time", end.toISOString() === "2026-10-07T14:00:00.000Z", end.toISOString());
check("the next local time rolls to tomorrow once passed", nextLocalTime("07:00", day, TZ).toISOString() === "2026-10-08T14:00:00.000Z" && nextLocalTime("20:00", day, TZ).toISOString() === "2026-10-08T03:00:00.000Z");

console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
