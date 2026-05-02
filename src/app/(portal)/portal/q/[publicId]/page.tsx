import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { money, longDate } from "@/lib/format";
import { PortalActions } from "./portal-actions";
import { PortalSectionReveal } from "./portal-reveal";

export default async function PublicProposalPortal({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const proposal = await db.proposal.findUnique({
    where: { publicId },
    include: {
      lineItems: { orderBy: { position: "asc" } },
      installments: { orderBy: { position: "asc" } },
      client: true,
      organization: { select: { name: true, logoUrl: true, phone: true, address: true } },
    },
  });
  if (!proposal) return notFound();

  // Track view
  if (proposal.status === "SENT" || proposal.status === "DRAFT") {
    await db.proposal.update({
      where: { id: proposal.id },
      data: {
        viewCount: { increment: 1 },
        viewedAt: new Date(),
        status: proposal.status === "SENT" ? "VIEWED" : proposal.status,
      },
    });
    await db.activityEvent.create({
      data: {
        organizationId: proposal.organizationId,
        proposalId: proposal.id,
        clientId: proposal.clientId,
        kind: "VIEWED",
        summary: `${proposal.client?.name ?? "Client"} opened the proposal`,
      },
    });
  }

  const accepted = proposal.status === "ACCEPTED" || proposal.status === "PAID";

  return (
    <main className="min-h-dvh">
      <header className="border-b border-[color:var(--ink-line)] bg-[color:var(--paper)]/70 backdrop-blur sticky top-0 z-20">
        <div className="max-w-[1100px] mx-auto px-6 md:px-10 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-[6px] bg-[color:var(--ink)] text-[color:var(--paper)] grid place-items-center font-display text-[13px]">
              J
            </div>
            <span className="font-display text-[17px] tracking-[-0.015em]">{proposal.organization.name}</span>
          </Link>
          <div className="flex items-center gap-4">
            <a
              href={`/api/public-quote/${publicId}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] inline-flex items-center gap-1.5 transition-colors"
            >
              Download PDF
            </a>
            <div className="text-[11px] text-[color:var(--ink-muted)]">
              Proposal · {longDate(proposal.createdAt)}
            </div>
          </div>
        </div>
      </header>

      <section className="max-w-[1100px] mx-auto px-6 md:px-10 pt-16 pb-10">
        <PortalSectionReveal>
          <div className="quiet-caps mb-4">Prepared for {proposal.client?.name ?? "you"}</div>
          <h1 className="font-display text-[52px] md:text-[68px] leading-[0.98] tracking-[-0.03em] max-w-3xl">
            {proposal.title}
          </h1>
          {proposal.description && (
            <p className="mt-6 text-[16px] leading-relaxed text-[color:var(--ink-soft)] max-w-2xl">
              {proposal.description}
            </p>
          )}
          <div className="mt-10 flex items-baseline gap-6">
            <div>
              <div className="quiet-caps">Total</div>
              <div className="stat-numeric text-[56px] leading-none">{money(proposal.total)}</div>
            </div>
            <div className="pl-6 border-l border-[color:var(--ink-line)]">
              <div className="quiet-caps">Valid until</div>
              <div className="font-display text-[20px] mt-1">{longDate(proposal.validUntil)}</div>
            </div>
          </div>
          <div className="mt-8">
            <PortalActions publicId={publicId} status={proposal.status} total={proposal.total} />
          </div>
        </PortalSectionReveal>
      </section>

      <section className="max-w-[1100px] mx-auto px-6 md:px-10 py-10">
        <PortalSectionReveal delay={0.1}>
          <div className="quiet-caps mb-3">Line items</div>
          <div className="paper-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[color:var(--ink-line)]">
                  <th className="quiet-caps text-left px-6 py-4">Item</th>
                  <th className="quiet-caps text-right px-6 py-4 w-[100px]">Qty</th>
                  <th className="quiet-caps text-right px-6 py-4 w-[120px]">Unit</th>
                  <th className="quiet-caps text-right px-6 py-4 w-[140px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {proposal.lineItems.map((l) => (
                  <tr key={l.id} className="border-b border-[color:var(--ink-line)]/60 last:border-0">
                    <td className="px-6 py-4">
                      <div className="font-display text-[16px] text-[color:var(--ink)]">{l.name}</div>
                      {l.description && (
                        <div className="text-[12px] text-[color:var(--ink-muted)] mt-1 max-w-lg leading-relaxed">
                          {l.description}
                        </div>
                      )}
                      <div className="text-[10px] text-[color:var(--ink-faint)] mt-1.5 tracking-[0.12em] uppercase">
                        {l.measurementType.replace("_", " ")}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right tabular">{l.quantity}</td>
                    <td className="px-6 py-4 text-right tabular">{money(l.unitPrice)}</td>
                    <td className="px-6 py-4 text-right font-display tabular text-[16px]">{money(l.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="px-6 py-3 text-right text-[color:var(--ink-muted)]">Subtotal</td>
                  <td className="px-6 py-3 text-right tabular">{money(proposal.subtotal)}</td>
                </tr>
                {proposal.taxTotal > 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-3 text-right text-[color:var(--ink-muted)]">
                      Tax · {(proposal.taxRate * 100).toFixed(1)}%
                    </td>
                    <td className="px-6 py-3 text-right tabular">{money(proposal.taxTotal)}</td>
                  </tr>
                )}
                <tr className="border-t border-[color:var(--ink-line)]">
                  <td colSpan={3} className="px-6 py-4 text-right quiet-caps">Total due</td>
                  <td className="px-6 py-4 text-right font-display text-[22px] tabular">{money(proposal.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </PortalSectionReveal>
      </section>

      {proposal.scopeOfWork && (
        <section className="max-w-[1100px] mx-auto px-6 md:px-10 py-10">
          <PortalSectionReveal delay={0.15}>
            <div className="quiet-caps mb-3">Scope of work</div>
            <div className="paper-card p-10 md:p-14 prose-editorial">
              <p className="text-[15px] leading-[1.8] text-[color:var(--ink-soft)] whitespace-pre-wrap">
                {proposal.scopeOfWork}
              </p>
            </div>
          </PortalSectionReveal>
        </section>
      )}

      {proposal.installments.length > 0 && (
        <section className="max-w-[1100px] mx-auto px-6 md:px-10 py-10">
          <PortalSectionReveal delay={0.2}>
            <div className="quiet-caps mb-3">Payment schedule</div>
            <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {proposal.installments.map((i, idx) => (
                <li key={i.id} className="paper-card p-6 flex flex-col gap-3">
                  <span className="quiet-caps">#{idx + 1}</span>
                  <span className="font-display text-[20px] tracking-[-0.015em]">{i.label}</span>
                  <span className="font-display tabular text-[28px]">
                    {i.isPercent
                      ? `${i.amount}%`
                      : money(i.amount)}
                  </span>
                  {i.isPercent && (
                    <span className="text-[11px] text-[color:var(--ink-muted)] tabular">
                      ≈ {money(proposal.total * (i.amount / 100))}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </PortalSectionReveal>
        </section>
      )}

      <section className="max-w-[1100px] mx-auto px-6 md:px-10 pt-10 pb-20">
        <PortalSectionReveal delay={0.25}>
          <div className="paper-card p-10 md:p-14 flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
            <div>
              <div className="quiet-caps mb-3">Ready to move forward?</div>
              <h2 className="font-display text-[28px] md:text-[34px] tracking-[-0.02em]">
                {accepted ? "Accepted · thank you." : "Accept online or reach out with questions."}
              </h2>
              {proposal.organization.phone && (
                <p className="mt-3 text-[13px] text-[color:var(--ink-muted)]">
                  Questions? Call {proposal.organization.name} at{" "}
                  <a href={`tel:${proposal.organization.phone}`} className="text-[color:var(--accent)]">
                    {proposal.organization.phone}
                  </a>
                  .
                </p>
              )}
            </div>
            {!accepted && (
              <PortalActions publicId={publicId} status={proposal.status} total={proposal.total} />
            )}
          </div>
        </PortalSectionReveal>
        <div className="mt-8 text-[11px] text-[color:var(--ink-muted)] text-center">
          Prepared by {proposal.organization.name}. Powered by JobFlex.
        </div>
      </section>
    </main>
  );
}
