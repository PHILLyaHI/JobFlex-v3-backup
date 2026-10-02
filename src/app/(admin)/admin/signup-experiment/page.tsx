import { requirePlatformAdmin } from "@/lib/orgContext";
import { signupExperimentReport } from "@/lib/signupExperimentReport";
import { readSignupAllocation } from "@/lib/signupExperiment";
import { AllocationControl } from "./allocation-control";
import { SimulationButton } from "./simulation-button";
import s from "./signup-experiment.module.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Signup experiment — JobFlex" };
const percent = (v:number) => (100*v).toFixed(1)+"%";
export default async function SignupExperimentPage() {
  await requirePlatformAdmin();
  const [report, mode] = await Promise.all([signupExperimentReport(), readSignupAllocation()]);
  return <main className={s.page}>
    <header><p className={s.kicker}>Registration · A/B experiment</p><h1>Which signup brings paying customers?</h1><p>{mode === "split" ? "Both variants are running. Each new browser has an independent 50% chance of A or B." : `Only variant ${mode.toUpperCase()} is running for new browsers.`} Assignments stay fixed across visits and Google sign-in.</p></header>
    <AllocationControl mode={mode} />
    <section className={s.result}><strong>{report.winner ? "Variant "+report.winner+" has the higher paid conversion rate" : "No reliable winner yet"}</strong><p>Primary metric: browsers that become paying customers within 14 days. Only browsers assigned during 50/50 allocation at least 14 days ago enter that comparison.</p></section>
    <div className={s.grid}>{report.cohorts.map(c=><section className={s.card} key={c.variant}>
      <p className={s.kicker}>Variant {c.variant.toUpperCase()} · {mode === "split" ? "50% allocation" : mode === c.variant ? "100% allocation" : "Off for new browsers"}</p><h2>{c.variant==="a"?"Try the software first":"Start a trial with a card"}</h2>
      <p>{c.variant==="a"?"Verify email, complete company setup, choose a plan, and try it for 7 days without a card.":"Complete company setup, choose a plan, and start a 7-day Stripe trial with a card."}</p>
      <dl><div><dt>Browsers assigned</dt><dd>{c.assigned}</dd></div><div><dt>Assigned during 50/50 test</dt><dd>{c.randomized}</dd></div><div><dt>Assigned during single-variant mode</dt><dd>{c.singleVariant}</dd></div><div><dt>Completed registrations</dt><dd>{c.registered}</dd></div><div><dt>Registration conversion</dt><dd>{percent(c.registrationRate)}</dd></div><div><dt>People who actually paid</dt><dd>{c.paid}</dd></div><div><dt>Browsers ready for A/B comparison</dt><dd>{c.mature}</dd></div><div><dt>Paid within 14 days · A/B test</dt><dd>{c.converted} · {percent(c.paidRate)}</dd></div></dl>
    </section>)}</div>
    <section className={s.card}><h2>Test the actual expiry experience</h2><p>Open a dedicated test account in the real JobFlex app. Its trial expires after 15 seconds, including after a reload. Try opening another page, then select Pay now to see the plan picker. Return here and reset to repeat.</p><p>This switches the contractor session to the test account. The admin login remains available. Test accounts and sandbox invoices are excluded from this report. Checkout is restricted to Stripe test mode and requires a test key.</p><SimulationButton /></section>
    <details className={s.card}><summary>How these numbers are counted</summary><p>Counts come from server-created registrations and confirmed, positive Stripe paid invoices. Zero-dollar trials, repeat webhook deliveries, development browsers, and sandbox payments do not count as paid customers. A browser counts once in each conversion rate, even if it creates more than one account. Payments after day 14 are shown in total paying people but not the primary rate.</p><p>Planning target: 5,400 mature browsers per variant, at least 28 days of data, and a two-sided 95% comparison. This assumes a 5% baseline and 25% relative lift at 80% power; it is a planning assumption, not an observed baseline. The report does not backfill or assign older accounts to this experiment.</p><p>Updated {new Date(report.updatedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} Pacific. Refresh for the latest confirmed events.</p></details>
  </main>;
}
