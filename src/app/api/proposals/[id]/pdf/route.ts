import { createElement } from "react";
import { NextResponse } from "next/server";
import { renderToStream } from "@react-pdf/renderer";
import { db } from "@/lib/db";
import { requireProposalStaff } from "@/lib/orgContext";
import { ProposalPdfDocument, type ProposalPdfData } from "@/lib/pdf/ProposalPdf";
import { satellitePhotoPng } from "@/lib/staticMapPhoto";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  // Sales reps / estimators can only render PDFs for proposals they own.
  const { organizationId, proposalScope } = await requireProposalStaff();
  const proposal = await db.proposal.findFirst({
    where: { id, organizationId, ...proposalScope },
    include: {
      lineItems: { orderBy: { position: "asc" } },
      installments: { orderBy: { position: "asc" } },
      client: true,
      organization: { select: { name: true } },
    },
  });
  if (!proposal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let previewImageUrl: string | undefined;
  try {
    const arr = JSON.parse(proposal.beforePhotos ?? "[]");
    // Only trust https Vercel Blob URLs for server-side <Image> fetch (SSRF guard).
    if (
      Array.isArray(arr) &&
      typeof arr[0] === "string" &&
      /^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i.test(arr[0])
    ) {
      previewImageUrl = arr[0];
    }
  } catch {
    /* beforePhotos may be malformed; skip the preview */
  }
  // No uploaded photo: the measurement's satellite photo, when the proposal
  // was converted from a roof measurement (ProposalSitePhoto). Rendered from
  // bytes we fetched ourselves, so the SSRF guard above does not apply.
  if (!previewImageUrl) {
    try {
      const link = await db.proposalSitePhoto.findUnique({ where: { proposalId: proposal.id }, select: { roofMeasurementId: true } });
      const row = link
        ? await db.roofMeasurement.findUnique({
            where: { id: link.roofMeasurementId },
            select: { address: true, city: true, state: true, zip: true, lat: true, lng: true, instantJson: true },
          })
        : null;
      if (row) {
        const photo = await satellitePhotoPng(row);
        if (photo.ok) previewImageUrl = "data:image/png;base64," + photo.bytes.toString("base64");
      }
    } catch {
      /* link table not pushed yet, or the photo is unavailable — no preview */
    }
  }

  const data: ProposalPdfData = {
    title: proposal.title,
    description: proposal.description,
    scopeOfWork: proposal.scopeOfWork,
    notes: proposal.notes,
    subtotal: proposal.subtotal,
    discountTotal: proposal.discountTotal,
    taxRate: proposal.taxRate,
    taxTotal: proposal.taxTotal,
    total: proposal.total,
    currency: proposal.currency,
    createdAt: proposal.createdAt,
    validUntil: proposal.validUntil,
    publicId: proposal.publicId,
    orgName: proposal.organization.name,
    clientName: proposal.client?.name,
    clientAddress: proposal.client?.address,
    previewImageUrl,
    lineItems: proposal.lineItems.map((l) => ({
      name: l.name,
      description: l.description,
      measurementType: l.measurementType,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      total: l.total,
    })),
    installments: proposal.installments.map((i) => ({
      label: i.label,
      amount: i.amount,
      isPercent: i.isPercent,
    })),
  };

  const stream = await renderToStream(
    createElement(ProposalPdfDocument, { data }) as any,
  );
  const filename = `${proposal.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;

  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
