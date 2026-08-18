// v2 real-UI ad batch — copy, timings and layout config (source of truth).
// Times are in the FINAL composed timeline: hook 1.6s, then main, then end card 3.2s.

export const HOOK_S = 1.6;
export const END_S = 3.2;

// screen-window geometry on the 1080x1920 canvas (shared by assets + compose)
export const WIN = {
  mobile: { x: 210, y: 356, w: 660, h: 1428 },
  desktop: { x: 32, y: 590, w: 1016, h: 635 },
};

export const ADS = [
  {
    slug: "smart-proposal",
    kind: "mobile",
    kicker: "SMART PROPOSAL · AI ESTIMATOR",
    headline: ["TYPE THE JOB.", "GET THE PRICE."],
    hookSub: "Shot in the real app",
    // raw 48.08s · marks: wizard 7.8 · describe 21.4→ · gen 30.2–42.1 · result →48
    segments: [
      { ss: 7.0, to: 30.8, speed: 1.35 },   // wizard + typing  → 17.6s
      { ss: 40.7, to: 48.0, speed: 1.0 },   // spinner tail + result scroll → 7.3s
    ],
    captions: [
      { text: "Pick the trade", from: 1.8, to: 5.6 },
      { text: "Describe it in plain words", from: 8.0, to: 14.5 },
      { text: "AI prices materials + labor", from: 17.0, to: 21.5 },
      { text: "$5,576 — client-ready", from: 21.8, to: 27.2 },
    ],
    primary_text:
      "Describe the job in plain words. JobFlex prices materials and labor, then hands you a client-ready proposal. This is the actual app.",
    fb_headline: "Estimate In Minutes, Not Nights",
    fb_description: "Free 14 days. No card.",
  },
  {
    slug: "materials-prices",
    kind: "desktop",
    kicker: "MATERIALS REQUEST",
    headline: ["REAL STORE PRICES.", "INSIDE THE ESTIMATE."],
    hookSub: "Shot in the real app",
    // raw 23.28s · accepted tab ~9.2 · sheet 16.3 →
    segments: [
      { ss: 5.6, to: 14.8, speed: 1.0 },                    // list → accepted → chip  9.2s
      { ss: 14.8, to: 23.2, speed: 0.8, cropRight: true },  // sheet, right-half crop → 10.5s
    ],
    captions: [
      { text: "Every line is a real product", from: 2.0, to: 7.0 },
      { text: "Home Depot · Lowe's · Ace", from: 11.5, to: 16.0 },
      { text: "One tap to buy — $9,944 list", from: 16.4, to: 21.0 },
    ],
    primary_text:
      "Your estimate becomes a shoppable materials list — real products, live retail prices, buy links at Home Depot, Lowe's and Ace. Straight from the app.",
    fb_headline: "Materials Priced For Real",
    fb_description: "Free 14 days. No card.",
  },
  {
    slug: "fence-studio",
    kind: "desktop",
    kicker: "FENCE STUDIO",
    headline: ["TRACE IT.", "PRICE IT."],
    hookSub: "Shot in the real app",
    // raw 30.56s · map 11.0 · trace 12.5–17 · priced 18.9 · composite 21.6 · 8ft 23 · $15,187
    segments: [{ ss: 9.0, to: 30.4, speed: 1.0 }],
    captions: [
      { text: "Trace the yard from the sky", from: 2.0, to: 8.5 },
      { text: "226 ft measured live", from: 9.0, to: 12.5 },
      { text: "Swap material — price follows", from: 13.0, to: 17.5 },
      { text: "$15,187 → proposal in one tap", from: 18.0, to: 22.5 },
    ],
    primary_text:
      "Draw the fence on a satellite photo of the yard. JobFlex measures every run and prices it live — swap material or height and watch the number move.",
    fb_headline: "Quote A Fence From The Sky",
    fb_description: "Free 14 days. No card.",
  },
  {
    slug: "proposal-pipeline",
    kind: "mobile",
    kicker: "PROPOSALS",
    headline: ["LOOK LIKE THE", "BIGGER SHOP."],
    hookSub: "Shot in the real app",
    // raw 24.40s · masthead 7.4 · sheet 14.5 · detail 18 →24.8
    segments: [{ ss: 6.4, to: 24.3, speed: 0.85 }],
    captions: [
      { text: "Your whole pipeline, one screen", from: 2.0, to: 7.0 },
      { text: "$297,395 in open work", from: 7.4, to: 11.5 },
      { text: "Open, edit, send from the truck", from: 14.0, to: 20.5 },
    ],
    primary_text:
      "Pipeline value, signed contracts, payment schedules and the document itself — all on your phone. Small crew, big-company paperwork.",
    fb_headline: "Proposals That Win Jobs",
    fb_description: "Free 14 days. No card.",
  },
  {
    slug: "crew-calendar",
    kind: "mobile",
    kicker: "SCHEDULING",
    headline: ["YOUR WEEK", "RUNS ITSELF."],
    hookSub: "Shot in the real app",
    // raw 23.96s · month 7.8 · day 13.8 · quickadd 18.1 →23.2
    segments: [{ ss: 6.6, to: 23.9, speed: 0.85 }],
    captions: [
      { text: "Every job on the board", from: 2.0, to: 7.0 },
      { text: "Tap a day — crew, client, scope", from: 8.0, to: 13.5 },
      { text: "Add work in seconds", from: 15.0, to: 20.0 },
    ],
    primary_text:
      "The month, the crew and every job in one calendar. Tap a day to see who's where — add the next job before you leave the site.",
    fb_headline: "Scheduling Without The Chaos",
    fb_description: "Free 14 days. No card.",
  },
];
