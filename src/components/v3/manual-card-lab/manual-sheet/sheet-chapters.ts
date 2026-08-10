// CHAPTERS — the regrouping itself, as data.
//
// Route: /dashboard/manual-sheet.
//
// The whole variant is this table. The brief's ten sections are not ten cards
// here; they are five chapters of two sections each, and the pairing is by
// AUDIENCE rather than by data model:
//
//   1 THE JOB        01 job + 02 client   — who and what. Answered once, early.
//   2 THE MONEY      03 lines + 04 markup — the only arithmetic on the page.
//   3 THE WORDS      05 scope + 07 terms  — every free-typed paragraph, together.
//   4 THE DEAL       08 payments + 09 files — the commercial attachments.
//   5 WHAT THEY GET  06 prints + 10 copy  — the switches and the thing they change.
//
// Chapter 5 is the pairing that earns the regrouping outright: four print
// toggles sitting three cards away from the preview they alter is a scroll
// between cause and effect, and putting them in one card removes it.
//
// The original section numbers survive as the sub-block ordinals inside each
// chapter (the `sections` field), so "card 07 is the terms" is still true and
// the order still matches the printed document — the brief's findable-by-number
// rule, kept without paying for ten card headers.
//
// The rail label is NOT the chapter title. "What they get" is right on the card
// and too long for a 60px bar with four siblings and a total in it, so the bar
// says "Copy". Short beats consistent when the bar is the navigation.

/** Stable anchor ids. Also the rail's key — one list, no second source. */
export type ChapterId = "job" | "money" | "words" | "deal" | "copy";

export type Chapter = {
  id: ChapterId;
  /** "1".."5" — the drawing-annotation numeral in the card head and the rail. */
  num: string;
  /** Card head. Uppercased by CSS, written here in sentence case. */
  title: string;
  /** Rail label. Short on purpose — see the file header. */
  short: string;
  /** The original brief sections this chapter carries, for the sub-block heads. */
  sections: string[];
};

export const CHAPTERS: Chapter[] = [
  { id: "job", num: "1", title: "The job", short: "Job", sections: ["01", "02"] },
  { id: "money", num: "2", title: "The money", short: "Money", sections: ["03", "04"] },
  { id: "words", num: "3", title: "The words", short: "Words", sections: ["05", "07"] },
  { id: "deal", num: "4", title: "The deal", short: "Deal", sections: ["08", "09"] },
  { id: "copy", num: "5", title: "What they get", short: "Copy", sections: ["06", "10"] },
];
