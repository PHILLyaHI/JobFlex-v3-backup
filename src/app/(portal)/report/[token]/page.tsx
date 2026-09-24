import type { Metadata } from "next";
import { loadPublicReport } from "@/lib/visitBook";

// THE CLIENT'S VISIT REPORT (2026-09-23) — public, by the report's token
// (the link in the email): what was measured, what was found, what to do.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your visit report", description: "What the technician measured and found." };

const CHIP: Record<string, { text: string; bg: string }> = { urgent: { text: "Needs attention now", bg: "#f6d5d5" }, fix: { text: "Repair recommended", bg: "#f7e6c4" }, watch: { text: "Keep an eye on it", bg: "#e6ecf7" }, info: { text: "Note", bg: "#ececec" } };

export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await loadPublicReport(token);
  return (
    <main className="min-h-screen bg-[color:var(--paper,#f4f2ec)] px-4 py-10">
      <div className="mx-auto w-full max-w-2xl rounded-[14px] border border-[color:var(--ink-line,#ddd)] bg-white overflow-hidden">
        {!r ? (
          <div className="p-6">
            <div className="quiet-caps mb-2">Visit report</div>
            <h1 className="text-[20px] font-semibold">This link is not active</h1>
          </div>
        ) : (
          <>
            <div className="p-6 border-b border-[color:var(--ink-line,#ddd)]">
              <div className="quiet-caps mb-2">{r.orgName} · visit report</div>
              <h1 className="text-[24px] font-semibold leading-tight">{r.title}</h1>
              <p className="mt-1 text-[13px] text-[color:var(--ink-muted,#666)]">{r.date}{r.techName ? ` · ${r.techName}` : ""}{r.clientName ? ` · for ${r.clientName}` : ""}</p>
            </div>
            <div className="p-6 text-[14px] leading-relaxed" data-public-report>
              {r.summary && <p className="text-[15px]">{r.summary}</p>}
              {r.findings.length > 0 && (
                <>
                  <div className="quiet-caps mt-6 mb-2">What we found</div>
                  <ul className="space-y-2">
                    {r.findings.map((f, i) => (
                      <li key={i} className="flex gap-3 items-start">
                        <span className="shrink-0 rounded-[8px] px-2 py-0.5 text-[11px] font-semibold" style={{ background: CHIP[f.severity]?.bg ?? "#eee" }}>{CHIP[f.severity]?.text ?? f.severity}</span>
                        <span>{f.text}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {r.recommendations && (
                <>
                  <div className="quiet-caps mt-6 mb-2">Our recommendation</div>
                  <p className="whitespace-pre-wrap">{r.recommendations}</p>
                </>
              )}
              {r.readings.length > 0 && (
                <>
                  <div className="quiet-caps mt-6 mb-2">What we measured</div>
                  <table className="w-full text-[13px]">
                    <tbody>
                      {r.readings.map((x) => (
                        <tr key={x.label} className="border-b border-[color:var(--ink-line,#eee)]">
                          <td className="py-1.5 pr-3">{x.label}</td>
                          <td className="py-1.5 pr-3 font-medium" style={{ color: x.off ? "#a83232" : undefined }}>{x.value}{x.unit && !x.value.includes(x.unit) ? ` ${x.unit}` : ""}</td>
                          <td className="py-1.5 text-[color:var(--ink-muted,#666)]">{x.ok ? `normal ${x.ok[0] === x.ok[1] ? x.ok[0] : `${x.ok[0]}–${x.ok[1]}`}${x.unit ? ` ${x.unit}` : ""}` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              {r.equipment.length > 0 && (
                <>
                  <div className="quiet-caps mt-6 mb-2">Your equipment</div>
                  <ul className="space-y-1">
                    {r.equipment.map((e, i) => <li key={i}>{e.line}{e.advice ? <span className="block text-[13px] text-[color:var(--ink-muted,#666)]">{e.advice}</span> : null}</li>)}
                  </ul>
                </>
              )}
              <div className="mt-8 rounded-[10px] border border-[color:var(--ink,#111)] p-4">
                <div className="quiet-caps mb-1">Next step</div>
                <p>
                  {r.findings.some((f) => f.severity === "fix" || f.severity === "urgent") ? "Reply to the email or call us to schedule the repair — members are billed at their plan discount." : "Nothing to do until the next visit. Questions? Reply to the email or call us."}
                  {r.bookingEnabled && <> Or <a className="underline underline-offset-2" href={`/book/${r.orgSlug}`}>book a visit online</a>.</>}
                </p>
                <p className="mt-2 text-[12px] text-[color:var(--ink-muted,#666)]">{r.orgName}{r.orgPhone ? ` · ${r.orgPhone}` : ""}{r.orgEmail ? ` · ${r.orgEmail}` : ""}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
