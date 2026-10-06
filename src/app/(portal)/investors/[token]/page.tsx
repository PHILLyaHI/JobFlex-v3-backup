// THE INVESTORS' PAGE — /investors/<token> (2026-10-06): the live figures the
// owner shares, with no admin around them. Open to anyone holding the link
// while the link is switched on (lib/investors); a stale or switched-off
// link gets a plain "not active" page. Search engines are told to stay out.
import type { Metadata } from "next";
import { investorLinkOpen, investorReport } from "@/lib/investors";
import { InvestorReportView } from "@/components/v3/admin-investors/investor-report";
import { longDate } from "@/lib/investorModel";
import s from "./investors-public.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "JobFlex · Investor figures", robots: { index: false, follow: false } };

export default async function InvestorsPublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const open = /^[A-Za-z0-9_-]{16,64}$/.test(token) && (await investorLinkOpen(token));
  if (!open) {
    return (
      <main className={s.page}>
        <div className={s.frame}>
          <div className={s.kicker}>JobFlex · Investors</div>
          <h1 className={s.h1}>This link is not active</h1>
          <p className={s.sub}>Ask for a current one.</p>
        </div>
      </main>
    );
  }
  const report = await investorReport();
  return (
    <main className={s.page}>
      <div className={s.frame}>
        <header className={s.head}>
          <div>
            <div className={s.kicker}>JobFlex · Investors</div>
            <h1 className={s.h1}>Ads, trials and payback</h1>
            <p className={s.sub}>Live figures since {longDate(report.figures.since)}, the day the first campaign went live. Read {new Date(report.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.</p>
          </div>
          <a className={s.pdf} href={`/api/investors/${token}/pdf`}>Download PDF</a>
        </header>
        <InvestorReportView report={report} shared />
      </div>
    </main>
  );
}
