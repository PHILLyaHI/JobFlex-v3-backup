import { NextResponse } from "next/server";
import { scanReceipt, saveReceiptExpense } from "@/actions/receiptOcr";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    jobId?: string;
    dataUrl?: string;
    filename?: string;
    preview?: boolean;
    override?: {
      vendor?: string;
      total?: number;
      category?: string;
      note?: string | null;
    };
    ocrJson?: any;
  };
  if (!body.jobId || !body.dataUrl) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (body.preview) {
    const res = await scanReceipt({ jobId: body.jobId, dataUrl: body.dataUrl });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ocr: res.ocr, disabled: res.disabled ?? false });
  }

  if (!body.override) {
    return NextResponse.json({ error: "Missing override for save" }, { status: 400 });
  }

  await saveReceiptExpense({
    jobId: body.jobId,
    dataUrl: body.dataUrl,
    filename: body.filename ?? "receipt.jpg",
    vendor: body.override.vendor ?? "",
    total: body.override.total ?? 0,
    category: body.override.category ?? "Materials",
    note: body.override.note ?? null,
    ocrJson: body.ocrJson ?? null,
  });
  return NextResponse.json({ ok: true });
}
