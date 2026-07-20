import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { money, longDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PortalActions } from "./portal-actions";
import { PortalSectionReveal } from "./portal-reveal";

export const dynamic = "force-dynamic";

// Editorial document treatment for the public proposal portal. Quiet, flat,
// paper-and-ink. The accent (Pressed Sage) is reserved for the total numeral,
// the primary action, and the accepted state. Nothing else.

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="quiet-caps mb-4 text-[color:var(--ink-muted)]">{children}</h2>
  );
}

function measurementLabel(t: string | null | undefined) {
  if (!t) return null;
  const cleaned = t.replace(/_/g, " ").trim().toLowerCase();
  return cleaned.length ? cleaned : null;
}

export default async function PublicProposalPortal({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const proposal = await db.proposal.findUnique({
    where: { publicId },
    include: {
      lineItems: { orderBy: { position: "asc" } },
      installments: { orderBy: { position: "asc" } },
      client: true,
      organization: {
        select: { name: true, logoUrl: true, phone: true, address: true },
      },
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
  const declined = proposal.status === "DECLINED";
  const org = proposal.organization;
  const monogram = (org.name?.trim()?.[0] ?? "J").toUpperCase();
  const clientName = proposal.client?.name?.trim() || "you";

  const hasLineItems = proposal.lineItems.length > 0;
  const hasInstallments = proposal.installments.length > 0;
  const hasScope = Boolean(proposal.scopeOfWork && proposal.scopeOfWork.trim());
  const telHref = org.phone ? `tel:${org.phone.replace(/\s+/g, "")}` : null;

  return (
    <main className="min-h-screen bg-[color:var(--paper)] text-[color:var(--ink)]">
      <div className="mx-auto w-full max-w-[42rem] px-5 pb-24 pt-8">
        {/* ── Header ───────────────────────────────────── */}
        <header className="flex items-start justify-between gap-4 pb-6">
          <div className="flex min-w-0 items-center gap-3">
            {org.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={org.logoUrl}
                alt={`${org.name} logo`}
                className="h-11 w-11 shrink-0 rounded-[var(--r-md)] object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] bg-[color:var(--paper-deep)] text-[15px] font-semibold text-[color:var(--ink-soft)]"
              >
                {monogram}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold leading-tight text-[color:var(--ink)]">
                {org.name}
              </p>
              <p className="mt-0.5 text-[13px] leading-tight text-[color:var(--ink-muted)] tabular">
                {longDate(proposal.createdAt)}
              </p>
            </div>
          </div>

          <a
            href={`/api/public-quote/${publicId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring shrink-0 rounded-[var(--r-md)] px-3 py-2 text-[13px] font-medium text-[color:var(--ink-soft)] transition-colors hover:bg-black/[0.04]"
          >
            Download PDF
          </a>
        </header>

        <div className="divider-ink" role="presentation" />

        {/* ── Intro ────────────────────────────────────── */}
        <PortalSectionReveal>
          <section className="pt-10">
            <p className="quiet-caps text-[color:var(--ink-muted)]">
              Prepared for {clientName}
            </p>
            <h1 className="font-display mt-3 text-[2rem] font-semibold leading-[1.08] tracking-[-0.02em] text-[color:var(--ink)]">
              {proposal.title}
            </h1>

            {proposal.description ? (
              <p className="mt-4 max-w-[68ch] text-[15px] leading-[1.6] text-[color:var(--ink-soft)]">
                {proposal.description}
              </p>
            ) : null}

            {/* Total + validity — the two facts a homeowner reads first. */}
            <dl className="mt-8 flex flex-wrap items-end gap-x-10 gap-y-5">
              <div>
                <dt className="quiet-caps text-[color:var(--ink-muted)]">
                  Total
                </dt>
                <dd className="stat-numeric mt-1.5 text-[2.25rem] leading-none text-[color:var(--accent)]">
                  {money(proposal.total)}
                </dd>
              </div>
              <div>
                <dt className="quiet-caps text-[color:var(--ink-muted)]">
                  Valid until
                </dt>
                <dd className="mt-1.5 text-[15px] font-medium text-[color:var(--ink)] tabular">
                  {longDate(proposal.validUntil)}
                </dd>
              </div>
            </dl>

            <div className="mt-8">
              <PortalActions
                publicId={publicId}
                status={proposal.status}
                total={proposal.total}
              />
            </div>
          </section>
        </PortalSectionReveal>

        {/* ── Line items ───────────────────────────────── */}
        <PortalSectionReveal delay={0.05}>
          <section className="pt-14">
            <SectionLabel>Estimate detail</SectionLabel>

            {hasLineItems ? (
              <div className="paper-card overflow-hidden">
                <ul className="divide-y divide-[color:var(--ink-line)]">
                  {proposal.lineItems.map((item, i) => {
                    const measure = measurementLabel(item.measurementType);
                    const meta = [
                      measure,
                      item.quantity ? `${item.quantity} × ${money(item.unitPrice)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <li
                        key={i}
                        className="flex items-start justify-between gap-4 px-5 py-4"
                      >
                        <div className="min-w-0">
                          <p className="text-[14px] font-medium leading-snug text-[color:var(--ink)]">
                            {item.name}
                          </p>
                          {item.description ? (
                            <p className="mt-1 text-[13px] leading-snug text-[color:var(--ink-muted)]">
                              {item.description}
                            </p>
                          ) : null}
                          {meta ? (
                            <p className="mt-1.5 text-[12px] text-[color:var(--ink-faint)] tabular">
                              {meta}
                            </p>
                          ) : null}
                        </div>
                        <p className="shrink-0 pt-0.5 text-[14px] font-semibold text-[color:var(--ink)] tabular">
                          {money(item.total)}
                        </p>
                      </li>
                    );
                  })}
                </ul>

                {/* Totals ledger */}
                <div className="border-t border-[color:var(--ink-line)] bg-[color:var(--paper-deep)] px-5 py-4">
                  <dl className="space-y-2 text-[13px]">
                    <div className="flex items-center justify-between">
                      <dt className="text-[color:var(--ink-muted)]">Subtotal</dt>
                      <dd className="font-medium text-[color:var(--ink-soft)] tabular">
                        {money(proposal.subtotal)}
                      </dd>
                    </div>
                    {/* Always show the tax line — at 0% it reads "Tax · 0.0%" / $0. */}
                    <div className="flex items-center justify-between">
                      <dt className="text-[color:var(--ink-muted)]">
                        Tax · {(proposal.taxRate * 100).toFixed(1)}%
                      </dt>
                      <dd className="font-medium text-[color:var(--ink-soft)] tabular">
                        {money(proposal.taxTotal)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between border-t border-[color:var(--ink-line)] pt-3">
                      <dt className="text-[14px] font-semibold text-[color:var(--ink)]">
                        Total due
                      </dt>
                      <dd className="stat-numeric text-[15px] text-[color:var(--ink)]">
                        {money(proposal.total)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            ) : (
              <div className="paper-card px-5 py-6">
                <p className="text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
                  No itemized breakdown was included with this proposal. The
                  total below reflects the full agreed amount.
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-[color:var(--ink-line)] pt-4">
                  <span className="text-[14px] font-semibold text-[color:var(--ink)]">
                    Total due
                  </span>
                  <span className="stat-numeric text-[15px] text-[color:var(--ink)]">
                    {money(proposal.total)}
                  </span>
                </div>
              </div>
            )}
          </section>
        </PortalSectionReveal>

        {/* ── Scope of work ────────────────────────────── */}
        {hasScope ? (
          <PortalSectionReveal delay={0.05}>
            <section className="pt-14">
              <SectionLabel>Scope of work</SectionLabel>
              <p className="max-w-[68ch] whitespace-pre-wrap text-[14px] leading-[1.7] text-[color:var(--ink-soft)]">
                {proposal.scopeOfWork}
              </p>
            </section>
          </PortalSectionReveal>
        ) : null}

        {/* ── Payment schedule ─────────────────────────── */}
        {hasInstallments ? (
          <PortalSectionReveal delay={0.05}>
            <section className="pt-14">
              <SectionLabel>Payment schedule</SectionLabel>
              <div className="paper-card overflow-hidden">
                <ul className="divide-y divide-[color:var(--ink-line)]">
                  {proposal.installments.map((inst, i) => {
                    const computed = proposal.total * (inst.amount / 100);
                    return (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-4 px-5 py-3.5"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            aria-hidden
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[color:var(--paper-deep)] text-[11px] font-semibold text-[color:var(--ink-muted)] tabular"
                          >
                            {i + 1}
                          </span>
                          <span className="truncate text-[14px] font-medium text-[color:var(--ink)]">
                            {inst.label}
                          </span>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="text-[14px] font-semibold text-[color:var(--ink)] tabular">
                            {inst.isPercent
                              ? money(computed)
                              : money(inst.amount)}
                          </span>
                          {inst.isPercent ? (
                            <span className="ml-2 text-[12px] text-[color:var(--ink-faint)] tabular">
                              {inst.amount}%
                            </span>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          </PortalSectionReveal>
        ) : null}

        {/* ── Closing / contact ────────────────────────── */}
        <PortalSectionReveal delay={0.05}>
          <section className="mt-16 rounded-[var(--r-lg)] bg-[color:var(--paper-deep)] px-6 py-7">
            <h2 className="font-display text-[1.25rem] font-semibold tracking-[-0.015em] text-[color:var(--ink)]">
              {accepted
                ? "Thank you. We're on it."
                : declined
                  ? "Thanks for letting us know."
                  : "Ready to move forward?"}
            </h2>
            <p className="mt-2 max-w-[60ch] text-[14px] leading-[1.6] text-[color:var(--ink-soft)]">
              {accepted ? (
                <>
                  This proposal is confirmed. {org.name} has the details and
                  will be in touch about next steps.
                  {telHref ? " Questions in the meantime? Just call." : ""}
                </>
              ) : declined ? (
                <>
                  You&apos;ve declined this proposal. If anything changes or
                  you&apos;d like to revisit it, reach out to {org.name}
                  {telHref ? " — we're happy to talk it through." : "."}
                </>
              ) : (
                <>
                  Review the details above, then accept when you&apos;re ready.
                  {telHref
                    ? " Have a question first? Reach out, we're happy to talk it through."
                    : " Have a question first? Reply to the message that brought you here."}
                </>
              )}
            </p>

            {telHref ? (
              <a
                href={telHref}
                className={cn(
                  "focus-ring mt-4 inline-flex items-center gap-2 rounded-[var(--r-md)] bg-white px-4 py-2.5 text-[14px] font-medium text-[color:var(--ink)] transition-colors hover:bg-[color:var(--paper)]",
                  "hairline",
                )}
              >
                Call {org.name}
                <span className="text-[color:var(--ink-muted)] tabular">
                  {org.phone}
                </span>
              </a>
            ) : null}
          </section>
        </PortalSectionReveal>

        {/* ── Footer ───────────────────────────────────── */}
        <footer className="mt-12 border-t border-[color:var(--ink-line)] pt-6">
          <p className="text-[12px] leading-relaxed text-[color:var(--ink-faint)]">
            Prepared by {org.name}.
            {org.address ? ` ${org.address}.` : ""} Powered by JobFlex.
          </p>
        </footer>
      </div>
    </main>
  );
}
