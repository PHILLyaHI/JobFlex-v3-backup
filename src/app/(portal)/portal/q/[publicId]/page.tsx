// PUBLIC PROPOSAL PORTAL — the page a homeowner opens from a proposal link.
// Route: /portal/q/[publicId].
//
// A verbatim port of the approved mockup
// `jobflex-proposal-client-blueprint (3).html`. The editorial sage-era
// treatment that lived here before is REPLACED IN PLACE — same route, same
// three files — not forked into a parallel `-blueprint` route. (That reverses
// the side-by-side convention some earlier ports recorded in their headers,
// e.g. /dashboard/subscription-blueprint. Replacement is the instruction now.)
//
// THE CHROME IS THE DONOR'S OWN, ALL OF IT. This surface is standalone by
// definition — the reader is a homeowner, not a signed-in contractor — and the
// `(portal)` route group has no layout.tsx, so the only thing above this page
// is the root layout's <html>/<body>. Nothing is doubled: there is no
// blueprint-shell here, no sidebar, no topbar. What the donor draws as its
// whole document (`div.pv` and its seven blocks) is what ships, wrapped in one
// `.jf-proposal-portal` div that carries the donor's token block and universal
// reset. See the header of ./proposal-portal.css for why that wrapper exists
// and how the donor's <body> rule was split across it and <body>.
//
// THIS FILE STAYS A SERVER COMPONENT so the proposal read, the VIEWED
// side-effect and the donor's <title> all run on the server. The two client
// pieces are surgical: ./portal-actions.tsx (the accept/decline block) and
// ./portal-reveal.tsx (the entrance observer).
//
// NO DATA-LAYER CHANGE. Same Prisma read, same includes, same view-tracking
// write, same /api/public-quote/[publicId]/{accept,decline,pdf} and
// /api/checkout/[provider] contracts as the page this replaces.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { money, longDate } from "@/lib/format";
import { parseProposalSettings } from "@/lib/settings";
import { buildPortalView } from "@/components/v3/mobile-proposal-client/portal-view";
import { buildPortalPayModel } from "@/lib/payments/portalModel";
import { PortalActions } from "./portal-actions";
import { PortalPayment } from "./portal-payment";
import { PortalReveal } from "./portal-reveal";
import { PortalViewport } from "./portal-viewport";
import "./proposal-portal.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicId: string }>;
}): Promise<Metadata> {
  const { publicId } = await params;
  const proposal = await db.proposal.findUnique({
    where: { publicId },
    select: { organization: { select: { name: true } } },
  });
  // The donor's own <title>: "Reyes & Sons Roofing · Proposal".
  return { title: proposal ? `${proposal.organization.name} · Proposal` : "Proposal" };
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
        // paymentSettingsJson decides WHICH pay buttons this client is offered:
        // the portal used to print Stripe, Square and PayPal to everyone and
        // only admit that two of them were switched off after the click, in a
        // toast written for the contractor ("add the keys to .env") and shown
        // to their customer.
        select: {
          name: true,
          logoUrl: true,
          phone: true,
          address: true,
          deletedAt: true,
          paymentSettingsJson: true,
          proposalSettingsJson: true,
          paymentConnections: true,
        },
      },
    },
  });

  // A soft-deleted org's proposals are gone from the outside world too.
  if (!proposal || proposal.organization.deletedAt) return notFound();

  // Track view. EVERY open counts and stamps `viewedAt` — a declined or
  // accepted proposal being re-read is still a fact the office wants (owner,
  // 2026-09-02: the count sat frozen once a proposal settled). Only the STATUS
  // is guarded: SENT becomes VIEWED on the first open, and nothing else moves —
  // a decline stays a decline however many times the page is reloaded.
  await db.proposal.update({
    where: { id: proposal.id },
    data: {
      viewCount: { increment: 1 },
      viewedAt: new Date(),
      ...(proposal.status === "SENT" ? { status: "VIEWED" as const } : {}),
    },
  });
  // The activity line is for the FIRST reading, not every reload — a feed
  // entry per refresh would bury the events that matter.
  if (proposal.status === "SENT" || proposal.status === "DRAFT") {
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

  const org = proposal.organization;
  // What the client can pay, and how — resolved once, shared by both trees.
  const payModel = await buildPortalPayModel(publicId, proposal, org, { money, longDate });
  const orgTerms = parseProposalSettings(org.proposalSettingsJson).terms?.trim() || "";
  const monogram = (org.name?.trim()?.[0] ?? "J").toUpperCase();
  const clientName = proposal.client?.name?.trim() || "you";

  // The donor stamps "Proposal № 2851". There is NO proposal-number column on
  // the Proposal model and adding one is a schema change, which is out of
  // scope — so this is the last four characters of the row's publicId (a v4
  // UUID), uppercased. Stable, unique in practice, and a real reference the
  // contractor can search on. Flagged in the port report.
  const refCode = publicId.replace(/-/g, "").slice(-4).toUpperCase();

  const hasScope = Boolean(proposal.scopeOfWork && proposal.scopeOfWork.trim());
  const hasDescription = Boolean(proposal.description && proposal.description.trim());
  const telHref = org.phone ? `tel:${org.phone.replace(/\s+/g, "")}` : null;

  // ── HANDHELD ────────────────────────────────────────────────────────────
  // At ≤768px this URL serves the handheld rebuild instead of the tree below;
  // above it, nothing changes. The switch is a media query inside
  // ./portal-viewport.tsx and exactly one of the two trees is ever mounted.
  //
  // The read, the VIEWED write and generateMetadata all stay here, on the
  // server — this page is opened from an email link and is the PayPal/Square
  // return_url, so it does not become a client-side fetch. `view` is the same
  // row, already formatted, in a plain serialisable shape. No data-layer
  // change: same query, same includes, same endpoints.
  const view = buildPortalView(publicId, proposal, { money, longDate }, {
    pay: payModel,
    terms: orgTerms,
  });

  return (
    <PortalViewport view={view}>
    <div className="jf-proposal-portal">
      <div className="pv">

        {/* ШАПКА */}
        {/* (RU: "Header") */}
        <header className="pv-head rv">
          <span className="pv-mono">{monogram}</span>
          <div className="pv-org">
            <b>{org.name}</b>
            <span>{`Proposal № ${refCode} · ${longDate(proposal.createdAt)}`}</span>
          </div>
          <a
            className="pv-pdf"
            href={`/api/public-quote/${publicId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Download PDF
          </a>
        </header>

        {/* ИНТРО */}
        {/* (RU: "Intro") */}
        <section className="pv-intro rv">
          <div className="pv-intro-card">
            <div className="pv-kicker">{`Prepared for ${clientName}`}</div>
            <h1 className="pv-h1">{proposal.title}</h1>
            <div className="pv-facts">
              <div className="total"><span>Total</span><b>{money(proposal.total)}</b></div>
              <div><span>Valid until</span><b>{longDate(proposal.validUntil)}</b></div>
            </div>

            <PortalActions
              publicId={publicId}
              status={proposal.status}
            />
          </div>

        </section>

        {/* OVERVIEW — not a donor section. `proposal.description` is
            contractor-authored copy that the page this replaces rendered under
            the H1; the mockup's intro card has no slot for it. Rather than
            drop customer content or invent a treatment, it reuses the donor's
            own `.pv-sec` / `.pv-scope` pair. Flagged in the port report. */}
        {hasDescription ? (
          <section className="pv-sec rv">
            <h2 className="pv-sec-h">Overview</h2>
            <p className="pv-scope">{proposal.description}</p>
          </section>
        ) : null}

        {/* ESTIMATE DETAIL */}
        <section className="pv-sec rv">
          <h2 className="pv-sec-h">Estimate detail</h2>
          <div className="pv-ledger">
            {proposal.lineItems.map((item) => {
              const measure = measurementLabel(item.measurementType);
              // The donor's meta line reads "24 sq · 24 × $310" — the quantity
              // leads the measurement, then repeats against the unit price.
              const meta = [
                measure ? (item.quantity ? `${item.quantity} ${measure}` : measure) : null,
                item.quantity ? `${item.quantity} × ${money(item.unitPrice)}` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div className="pv-li" key={item.id}>
                  <div>
                    <div className="pv-li-n">{item.name}</div>
                    {item.description ? (
                      <div className="pv-li-d">{item.description}</div>
                    ) : null}
                    {meta ? <div className="pv-li-m">{meta}</div> : null}
                  </div>
                  <div className="pv-li-v">{money(item.total)}</div>
                </div>
              );
            })}
            <div className="pv-tot">
              <div className="pv-tot-r"><span>Subtotal</span><b>{money(proposal.subtotal)}</b></div>
              {/* Always show the tax line — at 0% it reads "Tax · 0.0%" / $0. */}
              <div className="pv-tot-r">
                <span>{`Tax · ${(proposal.taxRate * 100).toFixed(1)}%`}</span>
                <b>{money(proposal.taxTotal)}</b>
              </div>
              <div className="pv-tot-due"><span>Total due</span><b>{money(proposal.total)}</b></div>
            </div>
          </div>
        </section>

        {/* SCOPE */}
        {hasScope ? (
          <section className="pv-sec rv">
            <h2 className="pv-sec-h">Scope of work</h2>
            <p className="pv-scope">{proposal.scopeOfWork}</p>
          </section>
        ) : null}

        {/* PAYMENT SCHEDULE — the stages, their state, and the pay buttons
            on the next one. Always rendered: a proposal with no stages is one
            "Full payment" stage, and that is exactly what the client pays. */}
        <PortalPayment model={payModel} />

        {/* TERMS & CONDITIONS — a disclosure, closed by default.
            Source is the ORG's terms (settings/proposals). The manual builder
            has a per-proposal terms box, but nothing persists it: the bridge
            writes `terms: ""` in both directions and the Proposal model has no
            column for it, so the org default is the only terms text that
            actually survives a save. Flagged for the owner — storing them per
            proposal is a schema change. */}
        {orgTerms ? (
          <section className="pv-sec rv">
            <details className="pv-terms">
              <summary>Terms &amp; conditions</summary>
              <div className="pv-terms-body">{orgTerms}</div>
            </details>
          </section>
        ) : null}

        {/* ВОПРОСЫ */}
        {/* (RU: "Questions") — the donor's call-out is entirely about phoning
            the contractor, so it stands down when the org has no phone on
            file. Flagged in the port report. */}
        {telHref ? (
          <section className="pv-call rv">
            <div className="pv-call-t">Questions in the meantime? Just call.</div>
            <div className="pv-call-p"><a href={telHref}>{org.phone}</a></div>
          </section>
        ) : null}

        <footer className="pv-foot rv">
          <i>JF</i>{`Prepared by ${org.name} on JobFlex`}
        </footer>

      </div>

      <PortalReveal />
      {/* The donor's own <noscript> fallback, verbatim. */}
      <noscript
        dangerouslySetInnerHTML={{
          __html: "<style>.rv{opacity:1!important;transform:none!important}</style>",
        }}
      />
    </div>
    </PortalViewport>
  );
}
