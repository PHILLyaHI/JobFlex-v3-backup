// Text messages (2026-09-24): the words, the rules, the preference cell.
// Pure, no Twilio, no DB.
//   npx --no-install tsx --tsconfig tsconfig.json scripts/qa/sms.check.ts
import * as P from "../../src/lib/notificationPrefsShared";
import * as F from "../../src/lib/sms/format";
import * as R from "../../src/lib/sms/textRules";
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
import { clientProposalText, clientReminderText } from "../../src/lib/sms/clients";
import { smsAllowanceFor } from "../../src/lib/entitlements";

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
// JobFlex's shared number (2026-10-02): Twilio rejected it (30474) while it spoke as every contractor.
check("the shared number names JobFlex first and the company after; a JobFlex text stays as it is",
  F.asSharedSender("Ridgeline Roofing", "Ridgeline Roofing: New lead: Jane Doe.") === "JobFlex (Ridgeline Roofing): New lead: Jane Doe." &&
  F.asSharedSender("Ridgeline Roofing", "Ridgeline Roofing — tomorrow (Tue Oct 7): 8 AM Roof.") === "JobFlex (Ridgeline Roofing) — tomorrow (Tue Oct 7): 8 AM Roof." &&
  F.asSharedSender("Ridgeline Roofing", verifyText("482913")) === verifyText("482913") &&
  F.asSharedSender(null, "hello") === "JobFlex: hello" &&
  F.asSharedSender("Ridgeline Roofing", "word ".repeat(100)).length <= SMS_MAX);
check("the shared number texts a code someone asked for and people who set their own mobile; never an office entry, a crew phone, a client or a company's own text",
  F.sharedNumberMay("verify", false) && F.sharedNumberMay("lead-assigned", true) && F.sharedNumberMay("test", true) &&
  !F.sharedNumberMay("lead-assigned", false) && !F.sharedNumberMay("crew-assigned", false) && !F.sharedNumberMay("rule:r1:p1", true));
check("HELP names the alerts the person turned on, and the support address", /turned on in JobFlex/.test(F.helpText()) && F.helpText().includes("support@jobflex.app"));
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

/* ── the client's texts, the allowance ── */
check("the client gets the proposal link with the company name and the STOP line",
  clientProposalText("Ridgeline Roofing", "Roof replacement — architectural shingles", 11306.52, "https://www.jobflex.app/portal/q/abc") === "Ridgeline Roofing: your proposal \"Roof replacement — architectural shingles\" ($11,306.52) is ready — see it and accept here: https://www.jobflex.app/portal/q/abc Reply STOP to opt out.",
  clientProposalText("Ridgeline Roofing", "Roof replacement — architectural shingles", 11306.52, "https://www.jobflex.app/portal/q/abc"));
check("the evening-before reminder names the street and the hours",
  clientReminderText("Ridgeline Roofing", { title: "Roof tear-off", startsAt: oct7, endsAt: oct7end, address: "4567 Rainier Ave S, Seattle, WA" }, TZ) === "Ridgeline Roofing: reminder — we're scheduled at 4567 Rainier Ave S tomorrow, Wed Oct 7, 8 AM–4 PM (Roof tear-off). Reply here with any questions.",
  clientReminderText("Ridgeline Roofing", { title: "Roof tear-off", startsAt: oct7, endsAt: oct7end, address: "4567 Rainier Ave S, Seattle, WA" }, TZ));
check("the monthly allowance grows with the plan and defaults to the free tier",
  smsAllowanceFor("FREE") === 50 && smsAllowanceFor("PROFESSIONAL") === 1000 && smsAllowanceFor(null) === 50 && smsAllowanceFor("weird") === 50);

/* ── who gets texted, person by person (2026-09-29) ── */
{
  const keys = (a: "office" | "sales" | "crew") => P.textEventsFor(a).map((e) => e.key);
  check("each role sits on its roster; a plain member on none",
    P.audienceForRole("OWNER") === "office" && P.audienceForRole("MANAGER") === "office" && P.audienceForRole("ACCOUNTANT") === "office" && P.audienceForRole("SALES") === "sales" && P.audienceForRole("ESTIMATOR") === "sales" && P.audienceForRole("INSTALLER") === "crew" && P.audienceForRole("USER") === null);
  check("the office list: leads, deals, money, visits, install dates, the crew on site",
    ["lead-assigned", "proposal-accepted", "payment-received", "change-order", "appointment-booked", "appointment-moved", "job-scheduled", "job-started", "job-completed", "job-photos"].every((k) => keys("office").includes(k as never)), keys("office"));
  check("the sales list: their leads, deals, visits and install dates — not the crew's day",
    ["lead-assigned", "proposal-accepted", "proposal-declined", "appointment-booked", "appointment-moved", "job-scheduled"].every((k) => keys("sales").includes(k as never)) && !keys("sales").includes("job-started" as never) && !keys("sales").includes("job-photos" as never), keys("sales"));
  check("the crew list is the crew's four texts and nothing else",
    JSON.stringify(keys("crew")) === JSON.stringify(["crew-assigned", "crew-moved", "crew-tomorrow", "crew-today"]), keys("crew"));
  check("every switch on the page shows the text as it will read",
    (["office", "sales", "crew"] as const).every((a) => P.textEventsFor(a).every((e) => typeof e.example === "string" && e.example.length > 20)));
  check("seeds follow the role: a rep hears declines, the office does not",
    P.parseNotificationPrefs(null, "SALES").matrix["proposal-declined"][2] === true && P.parseNotificationPrefs(null, "OWNER").matrix["proposal-declined"][2] === false && P.parseNotificationPrefs(null, "SALES").matrix["payment-received"][2] === false);
  check("the crew is seeded onto all four of its texts",
    ["crew-assigned", "crew-moved", "crew-tomorrow", "crew-today"].every((k) => P.parseNotificationPrefs(null, "INSTALLER").matrix[k as never][2] === true));
  check("the crew's texts stay out of the Notifications matrix",
    !P.PREF_EVENTS.some((e) => e.key.startsWith("crew-")) && P.ALL_PREF_EVENTS.filter((e) => e.key.startsWith("crew-")).length === 4);
  const stored = P.parseNotificationPrefs(JSON.stringify({ matrix: { "crew-tomorrow": [true, false, false] } }), "INSTALLER");
  const merged = P.mergeMatrixSave({ "lead-assigned": [true, true] }, stored);
  check("a save from the Notifications page keeps a crew switch it cannot see", merged["crew-tomorrow"][2] === false && merged["crew-today"][2] === true);
  check("who typed a mobile in survives a round trip", P.parseNotificationPrefs(JSON.stringify({ smsAddedBy: "u_1" })).smsAddedBy === "u_1" && P.parseNotificationPrefs(null).smsAddedBy === null);
  check("an online booking, a move and a cancel map to the visit switches",
    P.prefKeyForEvent({ kind: "BOOKING_NEW" }) === "appointment-booked" && P.prefKeyForEvent({ kind: "BOOKING_MOVED" }) === "appointment-moved" && P.prefKeyForEvent({ kind: "BOOKING_CANCELED" }) === "appointment-moved");
  const booked = F.appointmentBookedLine("Roof inspection", "Sarah Mitchell", F.spanLabel(oct7, oct7end, TZ), "18412 92nd Ave NE, Bothell, WA", "online");
  check("a booked visit: what, who, when, the street, and how", booked === "Booked: Roof inspection · Sarah Mitchell · Wed Oct 7, 8 AM–4 PM · 18412 92nd Ave NE · online.", booked);
  const moved = F.appointmentMovedLine("Roof inspection", "Sarah Mitchell", "Wed Oct 7, 8 AM", "Fri Oct 9, 1 PM–2 PM");
  check("a moved visit says from and to", moved === "Moved: Roof inspection · Sarah Mitchell — was Wed Oct 7, 8 AM, now Fri Oct 9, 1 PM–2 PM.", moved);
  check("a cancelled visit says when, and who cancelled it online",
    F.appointmentCancelledLine("Roof inspection", "Sarah Mitchell", "Wed Oct 7, 8 AM–4 PM", "online") === "Cancelled: Roof inspection · Sarah Mitchell — Wed Oct 7, 8 AM–4 PM, by the client.");
  const sched = F.jobScheduledLine("Standing-seam metal · 18412 92nd Ave NE", "Tue Oct 13, 8 AM–4 PM", "18412 92nd Ave NE, Bothell, WA", null);
  check("an install date: the job, the day and hours, the street", sched === 'Scheduled: "Standing-seam metal · 18412 92nd Ave NE" — Tue Oct 13, 8 AM–4 PM at 18412 92nd Ave NE.', sched);
}

/* ── your own texts (2026-09-29) ── */
{
  check("every ready-made idea only uses fields its moment can fill, and reaches someone it can",
    R.RULE_PRESETS.every((p) => R.unknownFields(p.body, p.trigger).length === 0 && p.to.every((x) => R.triggerOf(p.trigger)!.recipients.includes(x)) && p.body.length <= R.RULE_BODY_MAX),
    R.RULE_PRESETS.filter((p) => R.unknownFields(p.body, p.trigger).length).map((p) => p.id));
  check("every timed moment has a sane default inside its range",
    R.RULE_TRIGGERS.filter((t) => t.timed).every((t) => t.timed!.default >= t.timed!.min && t.timed!.default <= t.timed!.max));
  const filled = R.renderRuleText("Hi {first}, thank you for choosing {company}! Questions: {phone}.", { first: "Sarah", company: "Ridgeline Roofing Co.", phone: "(206) 555-0100" });
  check("the fields fill in", filled === "Hi Sarah, thank you for choosing Ridgeline Roofing Co.! Questions: (206) 555-0100.", filled);
  const tidy = R.renderRuleText("Hi {first}, your job {job} ({total}) is set.", { first: "Sarah", job: "Roof" });
  check("an empty field leaves no double space or empty brackets", tidy === "Hi Sarah, your job Roof is set.", tidy);
  check("a field the moment cannot fill is caught before saving", JSON.stringify(R.unknownFields("{client} paid {amount} on {when}", "proposal.accepted")) === JSON.stringify(["amount", "when"]));
  check("client texts carry the STOP line once", R.withStopLine("Hi Sarah.") === "Hi Sarah. Reply STOP to opt out." && R.withStopLine("Reply STOP to stop.") === "Reply STOP to stop.");
  check("the list says when, with the hours or days", R.whenText("appointment.before", 24) === "Before an appointment — 24 hours before" && R.whenText("job.after", 1) === "After a job is completed — 1 day after" && R.whenText("proposal.accepted", null) === "A proposal is accepted");
  check("the company name leads once, never twice", R.signed("Ridgeline Roofing Co.", "Hi Sarah, a reminder from Ridgeline Roofing Co.") === "Hi Sarah, a reminder from Ridgeline Roofing Co." && R.signed("Ridgeline Roofing Co.", "Hi Sarah.") === "Ridgeline Roofing Co.: Hi Sarah.");
  check("the crew can only be reached where there is a crew", !R.triggerOf("proposal.accepted")!.recipients.includes("crew") && R.triggerOf("job.before")!.recipients.includes("crew"));
}

console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);
