// The daily traffic digest for the email gallery (/dev/emails, 2026-10-04):
// made-up sessions read by the real analyst, so the gallery shows what the
// cron sends — the funnel box, what changed since yesterday, the Markdown.
import { analyse, type LandingSession } from "@/lib/traffic-analyst";
import { analystToMarkdown } from "@/lib/traffic-export";
import { changesBetween, type AnalystSnapshot } from "@/lib/traffic-history";
import { adMoney } from "@/lib/traffic-money";
import type { EmailDoc } from "./doc";
import { buildTrafficDigest } from "./build/traffic";

const NOW = Date.parse("2026-10-04T08:00:00-07:00");
const BASE: LandingSession = {
  id: "", person: "", startedAt: NOW, endedAt: NOW, industry: "roofing", utmSource: "fb", utmMedium: "paid", utmCampaign: "C1", utmContent: "A1", referrer: "l.facebook.com", fbclid: true,
  device: "Mobile", browser: "Facebook Mobile", os: "iOS", inApp: true, views: 1, landingViews: 1, dwell: 20, scroll: 0.2, sections: ["hero"],
  cta: 0, placements: [], registerViews: 0, step: 0, flow: "", attempts: 0, cardless: 0, opened: 0, errors: [], completed: false, outcome: "", plan: "",
  heroMs: 1200, paintMs: 1100, readyMs: 1900, trackedMs: 2600, kb: 1400, connection: "4g", leftUnshown: 0, formReadyMs: null, typedEarly: 0, submittedEarly: 0, step1Errors: [], step1Passed: 0,
  lcpMs: 1800, leftMs: null, downlink: 3.2, rttMs: 150, typedMs: null, submitMs: null, sectionAfter: ["hero:0"], ctaLabels: [], ctaHrefs: [], ctaSpots: [],
  hvacSteps: 0, hvacStepKeys: [], hvacTaps: 0, hvacTierPicks: 0, hvacTiers: [], country: "United States", region: "Texas", city: "Austin",
};
const sessions = (n: number, p: (i: number) => Partial<LandingSession>) => Array.from({ length: n }, (_, i) => ({ ...BASE, id: `s${i}`, person: `p${i}`, startedAt: NOW - (i + 1) * 3_000_000, ...p(i) }));

export function trafficDigestFixture(): EmailDoc {
  const names = { A1: "Roofing · 40 s v1", A2: "Fence · crew photo" };
  const today = analyse([
    ...sessions(90, (i) => ({ utmContent: i % 3 ? "A1" : "A2", dwell: i % 4 ? 4 : 45, scroll: i % 4 ? 0.02 : 0.6, sections: i % 4 ? ["hero"] : ["hero", "compare", "showcase"] })),
    ...sessions(30, (i) => ({ views: 3, cta: 1, placements: ["hero"], registerViews: 1, step: i < 12 ? 2 : 1, attempts: i < 6 ? 1 : 0, completed: i < 4, sections: ["hero", "compare"] })),
  ], { now: NOW, adNames: names });
  const yesterday = analyse(sessions(60, (i) => ({ views: i % 2 ? 1 : 2, cta: i % 2 ? 0 : 1, registerViews: i % 2 ? 0 : 1, step: i % 2 ? 0 : 1 })), { now: NOW - 86_400_000, adNames: names });
  const result = { status: "ok" as const, fetchedAt: new Date(NOW).toISOString(), window: { from: new Date(today.windowFrom).toISOString(), to: new Date(NOW).toISOString() }, report: today,
    money: adMoney([{ campaign: "C1", content: "A1", state: "paying" }, { campaign: "C1", content: "A1", state: "trial" }, { campaign: "C1", content: "A2", state: "trial" }], { since: "2026-09-30T07:00:00.000Z", adNames: names }) };
  const snapshot: AnalystSnapshot = { day: "2026-10-04", savedAt: result.fetchedAt, fetchedAt: result.fetchedAt, window: result.window, report: today, money: result.money };
  const prev: AnalystSnapshot = { day: "2026-10-03", savedAt: result.fetchedAt, fetchedAt: result.fetchedAt, report: yesterday };
  return buildTrafficDigest({ snapshot, changes: changesBetween(prev, snapshot), markdown: analystToMarkdown(result, { timezone: "America/Los_Angeles" }), href: "https://example.com/admin/traffic", timezone: "America/Los_Angeles" });
}
