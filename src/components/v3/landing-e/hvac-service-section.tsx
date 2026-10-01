import type { Route } from "next";
import Link from "next/link";
import { Reveal } from "./reveal";

/* THE SERVICE BOOK — the HVAC page's own section under the showcase
   (2026-10-01). The roof and the fence pages argue with one estimate; an HVAC
   shop lives on what comes after the install, so this is that half of the
   app on one sheet: the plans a shop sells, the seasonal visits they put on
   the calendar, the report a tune-up writes, the units on file, the service
   menu and the tech's phone on site. Every figure is the app's own starter
   number (lib/servicePlans STARTER_PLANS, lib/hvac/serviceMenu, lib/equipment)
   and is marked "example" or "typical — edit" where it is one. No vendor
   names anywhere: the units are kinds and tons, the parts are parts.

   Layout: six white cards on a 2 px ink frame, two columns from 768 px and one
   under it, each card a small mock of the surface it names; then the year
   with one member as a ledger strip; then "the usual way / JobFlex" in the
   shop's own terms, and the close. Static — the only motion is the page's
   Reveal, so nothing here can be mid-animation at a crop. */

const PLANS = [
  { name: "Essential", price: "$149", per: "/yr", visits: "1 tune-up a year", off: "10% off repairs", extra: "Priority scheduling" },
  { name: "Comfort", price: "$21", per: "/mo", visits: "2 seasonal tune-ups", off: "15% off repairs", extra: "Diagnostic fee waived", picked: true },
  { name: "Premium", price: "$29", per: "/mo", visits: "2 seasonal tune-ups", off: "20% off repairs", extra: "Same-day when it's down" },
] as const;

const MENU: Array<[string, string, string]> = [
  ["Heat pump tune-up", "$169", "diagnostic included"],
  ["Run capacitor", "$95", "+ part $28"],
  ["Condensate drain clear", "$129", "+ pan tablets $8"],
  ["Leak repair, evacuate & recharge", "$650", "+ filter drier $35"],
  ["Smart thermostat", "$140", "+ stat $190"],
  ["Compressor", "$1,400", "+ part $900 · replacement quoted beside it"],
];

/* The spring tune-up's readings, as the tech writes them, and what the
   report says about them on its own (lib/equipment readingFindings). */
const READINGS: Array<{ k: string; v: string; ok: boolean }> = [
  { k: "Static pressure", v: "0.9 in wc", ok: false },
  { k: "Split across the coil", v: "18 °F", ok: true },
  { k: "Run capacitor", v: "38 / 45 µF", ok: false },
  { k: "Subcooling", v: "11 °F", ok: true },
  { k: "Compressor amps", v: "12.4 A", ok: true },
];
const FINDINGS: Array<{ sev: "Now" | "Repair" | "Watch"; text: string }> = [
  { sev: "Repair", text: "Static pressure 0.9 in wc is high — a restricted filter, an undersized return or a dirty coil." },
  { sev: "Watch", text: "Capacitor reads 84% of its rating; replace at the fall visit." },
];

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <div className="font-mono text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted">{children}</div>
);

const Card = ({ eyebrow, title, body, children, tag }: { eyebrow: string; title: string; body: string; children: React.ReactNode; tag?: string }) => (
  <div className="lp-hv-card flex min-w-0 flex-col rounded-[2px] border-2 border-ink bg-white">
    <div className="px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>{eyebrow}</Eyebrow>
        {tag && <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">{tag}</span>}
      </div>
      <h3 className="mt-2 text-[19px] font-extrabold leading-[1.1] tracking-[-0.01em] text-ink sm:text-[21px]">{title}</h3>
      <p className="mt-2 text-[14px] leading-[1.5] text-[color:var(--ink-soft)] sm:text-[15px]">{body}</p>
    </div>
    <div className="lp-hv-mock mt-auto border-t border-ink px-4 py-4 sm:px-5">{children}</div>
  </div>
);

const Stamp = ({ sev }: { sev: "Now" | "Repair" | "Watch" }) => (
  <span
    className={
      "inline-block shrink-0 rounded-[2px] border px-1.5 py-[2px] font-mono text-[11px] font-extrabold uppercase tracking-[0.1em] " +
      (sev === "Now" ? "border-[#8a2a1c] bg-[#8a2a1c]/[0.07] text-[#8a2a1c]" : sev === "Repair" ? "border-[#1854A0] bg-[#1854A0]/[0.07] text-[#1854A0]" : "border-black/40 text-ink-muted")
    }
  >
    {sev}
  </span>
);

export function HvacServiceSection({ registerHref, cta }: { registerHref: string; cta: string }) {
  return (
    <section id="service" className="relative overflow-hidden bg-lp-paper px-5 py-[8vmin] sm:px-6">
      <div className="mx-auto lp-wrap">
        <Reveal>
          <h2 className="lp-sec-title">After the install, the service book.</h2>
          <p className="lp-sec-lede">
            The plans a shop sells, the visits they put on the calendar, the units on file and the menu the tech prices from — the half of an HVAC business that bills every month, in the same app as the estimate.
          </p>
        </Reveal>

        <Reveal delay={120} className="mt-9 grid grid-cols-1 gap-4 sm:mt-11 sm:gap-5 md:grid-cols-2">
          {/* 1 · plans */}
          <Card eyebrow="Service plans" title="Three plans, sold once, that run themselves." body="The visits land on the calendar, the invoice goes out on schedule, the member's discount rides on every proposal, and the office hears before the plan expires." tag="starter plans · edit any number">
            <div className="grid grid-cols-3 gap-2">
              {PLANS.map((p) => (
                <div key={p.name} className={"min-w-0 rounded-[2px] border-2 px-2 py-2 sm:px-2.5 " + ("picked" in p && p.picked ? "border-[#1854A0]" : "border-black/15")}>
                  <div className="truncate text-[12px] font-extrabold text-ink sm:text-[13px]">{p.name}</div>
                  <div className="mt-1 text-[17px] font-black leading-none tracking-[-0.01em] text-ink sm:text-[20px]">
                    {p.price}
                    <span className="font-mono text-[11px] font-bold text-ink-muted">{p.per}</span>
                  </div>
                  <ul className="mt-2 space-y-1 text-[11.5px] leading-[1.3] text-[color:var(--ink-soft)] sm:text-[11.5px]">
                    <li>{p.visits}</li>
                    <li>{p.off}</li>
                    <li>{p.extra}</li>
                  </ul>
                </div>
              ))}
            </div>
          </Card>

          {/* 2 · the seasonal schedule */}
          <Card eyebrow="Seasonal visits" title="Spring for cooling, fall for heating — on the calendar the day the plan is sold." body="Two visits a year fall on April 15 and October 1; one a year takes the next season. The office moves a date; the plan keeps the rest." tag="12 months">
            <div className="relative pt-5">
              <div className="grid grid-cols-12 gap-px">
                {["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].map((m, i) => (
                  <div key={i} className={"h-7 rounded-[1px] " + (i === 3 || i === 9 ? "bg-[#1854A0]" : i >= 5 && i <= 8 ? "bg-[#1854A0]/15" : i <= 1 || i === 11 ? "bg-black/10" : "bg-black/[0.05]")} />
                ))}
              </div>
              <div className="mt-1 grid grid-cols-12 gap-px font-mono text-[11px] font-bold text-ink-muted">
                {["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].map((m, i) => (
                  <div key={i} className="text-center">{m}</div>
                ))}
              </div>
              <div className="pointer-events-none absolute left-[25%] top-0 -translate-x-1/2 whitespace-nowrap font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[#1854A0]">Apr 15 · cooling</div>
              <div className="pointer-events-none absolute left-[79%] top-0 -translate-x-1/2 whitespace-nowrap font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[#1854A0]">Oct 1 · heating</div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink-muted">
                <span><i className="mr-1 inline-block h-2 w-2 bg-[#1854A0] align-middle" />tune-up visit</span>
                <span><i className="mr-1 inline-block h-2 w-2 bg-[#1854A0]/15 align-middle" />cooling season</span>
                <span><i className="mr-1 inline-block h-2 w-2 bg-black/10 align-middle" />heating season</span>
              </div>
            </div>
          </Card>

          {/* 3 · the visit report */}
          <Card eyebrow="Visit report" title="The readings by the side of the system, and what they mean." body="The tech writes the numbers; the report raises the findings on its own, the tech adds a line, and the client gets the summary the same afternoon." tag="spring tune-up · example">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.1fr] sm:gap-4">
              <div className="divide-y divide-black/[0.08]">
                {READINGS.map((r) => (
                  <div key={r.k} className="flex items-baseline justify-between gap-3 py-1.5">
                    <span className="truncate text-[12px] text-[color:var(--ink-soft)]">{r.k}</span>
                    <span className={"shrink-0 font-mono text-[11.5px] font-bold " + (r.ok ? "text-ink" : "text-[#8a2a1c]")}>{r.v}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {FINDINGS.map((f) => (
                  <div key={f.text} className="flex items-start gap-2">
                    <Stamp sev={f.sev} />
                    <p className="text-[12px] leading-[1.4] text-ink">{f.text}</p>
                  </div>
                ))}
                <p className="border-t border-black/[0.08] pt-2 font-mono text-[11px] leading-[1.4] text-ink-muted">To the client: “Cooling side checked and running. Airflow is restricted — we recommend a return-duct fix; the capacitor is weak and is scheduled for the fall visit.”</p>
              </div>
            </div>
          </Card>

          {/* 4 · the units on file */}
          <Card eyebrow="Equipment on file" title="Every unit at the address, with its age and what the age says." body="Nameplate photos from the estimate become the record; the next visit, the next repair and the replacement quote all start from it." tag="2 units">
            <div className="space-y-2.5">
              {[
                { line: "Heat pump + air handler · 3 ton · R-410A · 2012 (14 years)", advice: "14 years old: a major repair is money into a unit near the end of its life — quote the replacement next to any big repair." },
                { line: "Water heater · 50 gal gas · 2019 (7 years)", advice: null },
              ].map((u) => (
                <div key={u.line} className="rounded-[2px] border border-black/15 px-3 py-2">
                  <div className="text-[12.5px] font-bold text-ink">{u.line}</div>
                  {u.advice ? (
                    <div className="mt-1 text-[11.5px] leading-[1.4] text-[#8a2a1c]">{u.advice}</div>
                  ) : (
                    <div className="mt-1 font-mono text-[11px] text-ink-muted">on tune-ups · no advice yet</div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* 5 · the service menu */}
          <Card eyebrow="Service menu" title="Every repair a shop quotes every week, priced by the task." body="Labor and the part on the line, at a typical shop price the office edits once; a task applies only to the systems it fits, so a gas valve never shows on a heat pump." tag="typical — edit">
            <div className="divide-y divide-black/[0.08]">
              {MENU.map(([name, labor, note]) => (
                <div key={name} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-semibold text-ink">{name}</span>
                    <span className="block truncate font-mono text-[11px] text-ink-muted">{note}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[12px] font-bold text-ink">{labor}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* 6 · the tech's phone */}
          <Card eyebrow="On site" title="The tech's phone: today's visit, the unit, the readings, the repair priced." body="No install. The crew opens the visit from the calendar, writes the readings on the phone, and prices the repair from the menu before leaving the driveway." tag="390 px">
            <div className="mx-auto w-full max-w-[250px] rounded-[10px] border-2 border-ink bg-white p-2.5">
              <div className="flex items-center justify-between font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                <span>Visit · Tue 9:00</span>
                <span>Kirkland</span>
              </div>
              <div className="mt-1 text-[13px] font-extrabold leading-tight text-ink">Reyes — spring cooling tune-up</div>
              <div className="mt-2 rounded-[2px] border border-black/15 px-2 py-1.5 text-[11.5px] text-ink">Heat pump + air handler · 3 ton · 2012</div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {[["Static", "0.9 in wc"], ["Split", "18 °F"], ["Cap", "38 / 45 µF"], ["Subcool", "11 °F"]].map(([k, v]) => (
                  <div key={k} className="rounded-[2px] border border-black/15 px-2 py-1.5">
                    <div className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink-muted">{k}</div>
                    <div className="font-mono text-[11px] font-bold text-ink">{v}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between rounded-[2px] bg-ink px-2.5 py-2 text-[11px] font-bold text-white">
                <span>Price the repair</span>
                <span className="font-mono text-[11px] text-white/70">capacitor · $123 → $105</span>
              </div>
            </div>
          </Card>
        </Reveal>

        {/* The year with one member: what the plan bills on its own. */}
        <Reveal delay={160} className="mt-5 sm:mt-6">
          <div className="rounded-[2px] border-2 border-ink bg-ink px-5 py-5 text-white sm:px-6 sm:py-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-mono text-[11px] font-black uppercase tracking-[0.18em] text-white/55">One member, one year · example</div>
              <div className="font-mono text-[11px] text-white/55">Comfort plan · the figures above</div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
              {[
                ["Plan, 12 months", "$252", "$21 × 12, billed monthly"],
                ["Spring tune-up", "$0", "in the plan"],
                ["Fall tune-up", "$0", "in the plan"],
                ["Capacitor, fall", "$105", "$123 less 15%"],
                ["Diagnostic fees", "$0", "waived on the plan"],
              ].map(([k, v, n]) => (
                <div key={k} className="min-w-0">
                  <div className="truncate text-[12px] text-white/70">{k}</div>
                  <div className="mt-0.5 font-mono text-[20px] font-black leading-none tracking-[-0.01em] sm:text-[22px]">{v}</div>
                  <div className="mt-1 truncate font-mono text-[11px] text-white/50">{n}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-white/15 pt-3">
              <span className="text-[13px] text-white/80">Billed by the plan, with no reminder call and no missed season</span>
              <span className="font-mono text-[15px] font-black">$357 the year</span>
            </div>
          </div>
        </Reveal>

        {/* In the shop's own terms: how it is usually done, and here. */}
        <Reveal delay={120} className="mt-10 sm:mt-14">
          <h3 className="text-[clamp(24px,2.6vw,34px)] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink">What an HVAC shop asks, and the two answers.</h3>
          <div className="lp-hv-vs mt-5 rounded-[2px] border-2 border-ink bg-white">
            <div className="lp-hv-vs-head grid grid-cols-[1.2fr_1fr_1fr] border-b border-ink font-mono text-[11px] font-black uppercase tracking-[0.14em] text-ink-muted">
              <div className="px-3 py-2 sm:px-4">The question</div>
              <div className="px-3 py-2 sm:px-4">The usual way</div>
              <div className="px-3 py-2 text-ink sm:px-4">JobFlex</div>
            </div>
            {[
              ["Is it sized right?", "A rule of thumb, or a load calc in another app", "Block load from the address; the heat pump sized to the Manual S window on the estimate"],
              ["Which rebates apply?", "A rep looks them up; the proposal quotes one that closed", "The state's rules with their open and close dates, on the estimate"],
              ["Good, Better or Best?", "Three PDFs; the client calls back", "One proposal; the client picks the tier and signs in the portal"],
              ["Who renews the plans?", "A spreadsheet of expiry dates and a phone list", "The plan bills itself; the visits are on the calendar; the office hears before it lapses"],
              ["What's at the house?", "Nameplate photos in a camera roll", "The unit record: kind, tons, refrigerant, age — and what the age says"],
            ].map(([q, a, b]) => (
              <div key={q} className="lp-hv-vs-row grid grid-cols-[1.2fr_1fr_1fr] border-b border-black/[0.08] last:border-0">
                <div className="px-3 py-3 text-[13px] font-bold text-ink sm:px-4 sm:text-[14px]">{q}</div>
                <div className="px-3 py-3 text-[12.5px] leading-[1.4] text-ink-muted sm:px-4 sm:text-[13.5px]">{a}</div>
                <div className="px-3 py-3 text-[12.5px] leading-[1.4] text-ink sm:px-4 sm:text-[13.5px]">{b}</div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={120} className="mt-9 flex flex-col items-start gap-3 sm:mt-11 sm:flex-row sm:items-center sm:gap-5">
          {/* The section CTA every other section carries: the blue primary
              with its ink line and arrow (landing pass, 2026-09-26). */}
          <Link href={registerHref as Route} className="lp-btn-lime w-full sm:w-auto" data-cta="hvac-service">
            {cta}
            <span aria-hidden>→</span>
          </Link>
          <p className="text-[14px] text-[color:var(--ink-soft)]">
            All of it is in every plan — the estimator, the plans, the visits and the menu.{" "}
            <a href="#pricing" className="font-semibold text-ink underline underline-offset-4">See the prices.</a>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
