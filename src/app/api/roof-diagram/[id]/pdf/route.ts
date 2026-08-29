// GET /api/roof-diagram/[id]/pdf — the 5-page roof diagram PDF for one saved
// measurement, rendered on the server from the same DiagramLayout the app
// draws. Org-scoped through requireEstimatorOrManager + getRoofMeasurement;
// streamed inline so the browser opens it in a tab (Share / Export PDF on
// the roof estimator link straight here).
import { createElement } from "react";
import { NextResponse } from "next/server";
import { renderToStream } from "@react-pdf/renderer";
import { db } from "@/lib/db";
import { NoOrgError, UnauthorizedError, requireEstimatorOrManager } from "@/lib/orgContext";
import { getRoofMeasurement } from "@/actions/roofMeasurement";
import { layoutFromMeasurement } from "@/lib/roofDiagram/layout";
import { RoofDiagramPdfDocument } from "@/lib/pdf/RoofDiagramPdf";

export const runtime = "nodejs";

type PdfElement = Parameters<typeof renderToStream>[0];

/** No session → 401; a session without the estimator/manager role (or no org) → 403. */
function authFailure(err: unknown): NextResponse | null {
  if (err instanceof UnauthorizedError) {
    const unauthenticated = err.message === "Unauthorized" || /sign in/i.test(err.message);
    return NextResponse.json({ error: err.message }, { status: unauthenticated ? 401 : 403 });
  }
  if (err instanceof NoOrgError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  return null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  let organizationId: string;
  try {
    ({ organizationId } = await requireEstimatorOrManager());
  } catch (err) {
    const res = authFailure(err);
    if (res) return res;
    throw err;
  }

  // Org-scoped read: a foreign or unknown id is simply null.
  const measurement = await getRoofMeasurement(id);
  if (!measurement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, logoUrl: true },
  });
  const layout = layoutFromMeasurement(measurement, {
    company: org ? { name: org.name, logoUrl: org.logoUrl } : undefined,
  });

  // The logo <Image> is fetched by react-pdf on the server; the document only
  // draws it from Vercel Blob or the configured app origin (SSRF guard). The
  // origin comes from env, never from the request — a Host header is attacker
  // controlled.
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || undefined;

  let stream: Awaited<ReturnType<typeof renderToStream>>;
  try {
    const doc = createElement(RoofDiagramPdfDocument, { layout, appOrigin }) as unknown as PdfElement;
    stream = await renderToStream(doc);
  } catch (err) {
    console.error("[roof-diagram/pdf] render failed for %s:", id, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't render the roof diagram PDF" }, { status: 500 });
  }

  const filename = `roof-diagram-${id.slice(-6).toLowerCase()}.pdf`;
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
