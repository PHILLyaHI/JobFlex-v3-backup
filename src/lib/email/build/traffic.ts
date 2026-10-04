// The analyst's daily digest (2026-10-04): the day's reading for the owner —
// the headline, the funnel in a box, what changed since the last reading,
// and the whole reading as Markdown below, block by block, so it can be read
// in the inbox or pasted on as it is. Operator altitude: no greeting, no
// sign-off. Pure (snapshot → EmailDoc), so the gallery renders it from a fixture.
import type { BoxRow, EmailDoc, Tone } from "../doc";
import type { AnalystSnapshot, TrendChanges } from "@/lib/traffic-history";

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

export interface TrafficDigestInput {
  snapshot: AnalystSnapshot;
  /** Against the last reading before it; null on the first day. */
  changes: TrendChanges | null;
  /** The reading as Markdown (lib/traffic-export analystToMarkdown). */
  markdown: string;
  href: string;
  timezone: string;
}

export function buildTrafficDigest(x: TrafficDigestInput): EmailDoc {
  const r = x.snapshot.report;
  const fix = r.findings.filter((f) => f.tone === "bad").length;
  const watch = r.findings.filter((f) => f.tone === "warn").length;
  const tone: Tone = fix ? "bad" : watch ? "warn" : "ok";
  let day = x.snapshot.day;
  try { day = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", weekday: "short" }).format(new Date(`${x.snapshot.day}T12:00:00Z`)); } catch { /* the ISO day */ }
  const f = (key: string) => r.funnel.find((s) => s.key === key);
  const box: BoxRow[] = [
    { type: "field", label: r.sample.basis === "ads" ? "Landed from ads" : "Landed", value: String(f("landed")?.n ?? 0) },
    { type: "field", label: "Pressed a button", value: `${f("pressed")?.n ?? 0} · ${pct(f("pressed")?.pct ?? null)}` },
    { type: "field", label: "Opened the form", value: `${f("form")?.n ?? 0} · ${pct(f("form")?.pct ?? null)}` },
    { type: "field", label: "Signed up", value: String(f("done")?.n ?? 0) },
    { type: "field", label: "Left at once", value: pct(r.stats.bounce) },
  ];
  const c = x.changes;
  if (c) box.push({ type: "cond", label: `Since ${c.against}`, chip: `${c.appeared.length} new · ${c.gone.length} gone${c.toneChanged.length ? ` · ${c.toneChanged.length} changed` : ""}`, tone: c.appeared.some((a) => a.tone === "bad") ? "bad" : c.appeared.length ? "warn" : "ok" });
  const change = c
    ? [c.appeared.length ? `New since ${c.against}: ${c.appeared.map((a) => a.title).join("; ")}.` : "", c.gone.length ? `Gone since ${c.against}: ${c.gone.map((a) => a.title).join("; ")}.` : "", ...c.toneChanged.map((t) => `${t.title}: ${t.from} → ${t.tone}.`)].filter(Boolean)
    : ["The first saved reading: tomorrow's digest says what changed."];
  // The Markdown, block by block (a paragraph each; line breaks kept).
  const blocks = x.markdown.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return {
    subject: `Traffic ${x.snapshot.day}: ${fix ? `${fix} to fix` : watch ? `${watch} to watch` : "nothing broken"} · ${f("done")?.n ?? 0} signed up`,
    lockup: { kind: "platform" },
    kicker: { text: `The analyst · ${fix} fix · ${watch} watch`, tone },
    headline: `Traffic, ${day}`,
    prose: [r.headline, ...change],
    box,
    cta: { label: "Open Traffic", href: x.href },
    after: blocks,
    fine: `Saved as analyst:${x.snapshot.day} · ${r.period} · read from PostHog ${x.snapshot.fetchedAt.slice(0, 16).replace("T", " ")} UTC. Switch the email off under Measurement notes on the Traffic page.`,
    footer: { name: "JobFlex traffic", ref: x.snapshot.day },
  };
}
