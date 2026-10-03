// THE LITTLE GUY'S RULES (2026-10-03): which mood a visitor row gets, what he
// shouts, and why — plain data and functions, no React, no CSS, so the check
// (scripts/qa/visitor-mood.check.ts) can read them. The drawing is
// ./visitor-mood.tsx.
import type { LiveVisitor } from "@/lib/traffic-live";

export type Mood = "angry" | "cheer" | "dance" | "stuck" | "watch" | "read" | "shrug" | "wait" | "locked" | "work";

export type MoodFacts = Pick<LiveVisitor, "stage" | "active" | "views" | "lockedOut"> & { clicks: ReadonlyArray<unknown> };

/** Which guy a visitor gets. The rules follow lib/traffic-live visitSummary. */
export function moodOf(v: MoodFacts): Mood {
  if (v.stage === "signed-up") return "dance";
  if (v.stage === "member") return "work";
  if (v.stage === "signing-in") return v.lockedOut ? "locked" : "wait";
  if (v.stage === "registering" || v.stage === "checkout") return v.active ? "cheer" : "stuck";
  // Looking around. Gone after one page and no button we track: a bounce,
  // and he takes it personally. Gone after reading: a shrug.
  if (!v.active) return v.views <= 1 && v.clicks.length === 0 ? "angry" : "shrug";
  return v.views <= 1 ? "watch" : "read";
}

/** What he shouts — short, so the bubble stays over his head. */
export const MOOD_LINES: Record<Mood, readonly string[]> = {
  angry: ["COME ON!", "WHY?!", "#@%&!", "ONE PAGE?!", "HEY!!"],
  cheer: ["DO IT!", "GO GO GO!", "FASTER!", "ALMOST!", "YOU CAN!"],
  dance: ["YES!!", "WOOO!", "LET'S GO!", "NEW ONE!", "YESSS!"],
  stuck: ["SO CLOSE…", "NOOO…", "ONE MORE!"],
  watch: ["HELLO?", "SCROLL!", "LOOK…"],
  read: ["READING…", "NICE…", "KEEP ON!"],
  shrug: ["BYE…?", "HMM.", "WELL…"],
  wait: ["TAP TAP", "ANY DAY…", "WELCOME!"],
  locked: ["KEYS?", "HELP!", "LOCKED…"],
  work: ["AT WORK", "BUSY…", "BUILDING"],
};

/** The tooltip: what the mood means, in a sentence. */
export const MOOD_WHY: Record<Mood, string> = {
  angry: "Left after one page without pressing anything — he is furious.",
  cheer: "On the sign-up form right now — he is cheering them on.",
  dance: "Signed up — he is dancing.",
  stuck: "Stopped on the sign-up form and left — so close.",
  watch: "Just landed — he is watching what they do.",
  read: "Reading more pages — he likes that.",
  shrug: "Read a few pages, then left — a shrug.",
  wait: "A customer signing back in — he is waiting.",
  locked: "Locked out of their account — he is looking for the keys.",
  work: "A member working in the app — so is he.",
};

/** A small stable hash: the same visitor keeps the same line between polls. */
function pick<T>(list: readonly T[], seed: string): T {
  let h = 7;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

export function moodLine(mood: Mood, seed: string): string {
  return pick(MOOD_LINES[mood], seed);
}
