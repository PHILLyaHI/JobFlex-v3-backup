// The little guy on the live visitor rows (2026-10-03, admin-traffic/visitor-mood-rules):
// which mood each kind of visit gets, and that his line holds still between polls.
//   npx --no-install tsx --tsconfig tsconfig.json scripts/qa/visitor-mood.check.ts
import { MOOD_LINES, moodLine, moodOf, type MoodFacts } from "../../src/components/v3/admin-traffic/visitor-mood-rules";

let bad = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
};
const v = (p: Partial<MoodFacts>): MoodFacts => ({ stage: "browsing", active: false, views: 1, lockedOut: false, clicks: [], ...p });

check("gone after one page, nothing pressed: furious", moodOf(v({})) === "angry");
check("gone after one page from an ad: furious too", moodOf(v({ views: 1 })) === "angry");
check("gone after one page but pressed a button we track: a shrug, not fury", moodOf(v({ clicks: [{}] })) === "shrug");
check("read three pages, then left: a shrug", moodOf(v({ views: 3 })) === "shrug");
check("just landed, on the site: watching", moodOf(v({ active: true })) === "watch");
check("reading, on the site: reading along", moodOf(v({ active: true, views: 2 })) === "read");
check("on the sign-up form now: cheering", moodOf(v({ stage: "registering", active: true })) === "cheer");
check("at checkout now: cheering", moodOf(v({ stage: "checkout", active: true })) === "cheer");
check("opened the form and left: stuck", moodOf(v({ stage: "registering", active: false })) === "stuck");
check("signed up: dancing, on the site or not", moodOf(v({ stage: "signed-up", active: false })) === "dance" && moodOf(v({ stage: "signed-up", active: true })) === "dance");
check("signing in: waiting", moodOf(v({ stage: "signing-in", active: true })) === "wait");
check("locked out: looking for the keys", moodOf(v({ stage: "signing-in", lockedOut: true })) === "locked");
check("a member in the app: at work", moodOf(v({ stage: "member", active: true })) === "work");

check("the same visitor keeps the same line", moodLine("angry", "abc123") === moodLine("angry", "abc123"));
check("different visitors can get different lines", new Set(["a1", "b2", "c3", "d4", "e5", "f6", "g7"].map((id) => moodLine("angry", id))).size > 1);
const longest = Math.max(...Object.values(MOOD_LINES).flat().map((l) => l.length));
check("every line fits over his head (≤ 10 characters)", longest <= 10, `longest ${longest}`);
check("every mood has at least two lines", Object.values(MOOD_LINES).every((l) => l.length >= 2));

console.log(bad ? `\n${bad} FAILED` : "\nALL PASS");
process.exit(bad ? 1 : 0);
