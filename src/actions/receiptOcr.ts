"use server";
import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { isOpenAIEnabled } from "@/lib/sdk/openai";
import { runVisionJson } from "@/lib/sdk/openaiVision";
import { isBlobEnabled, uploadBlob } from "@/lib/sdk/blob";

export interface OcrResult {
  vendor?: string;
  total?: number;
  category?: string;
  note?: string;
  lineItems?: { name: string; amount: number }[];
}

const STUB: OcrResult = {
  vendor: "Home Depot",
  total: 248.5,
  category: "Materials",
  note: "Invoice stub — add OPENAI_API_KEY for real OCR.",
  lineItems: [
    { name: "2x4x8 stud (pack)", amount: 68 },
    { name: "Deck screws 3\"", amount: 24 },
    { name: "Joist hangers", amount: 42.5 },
  ],
};

export async function scanReceipt(input: {
  jobId: string;
  dataUrl: string;
}): Promise<
  | { ok: true; ocr: OcrResult; disabled?: false }
  | { ok: true; ocr: OcrResult; disabled: true }
  | { ok: false; error: string }
> {
  const { organizationId } = await requireManager();
  const job = await db.job.findUnique({ where: { id: input.jobId } });
  if (!job || job.organizationId !== organizationId) return { ok: false, error: "Not found" };

  if (!isOpenAIEnabled()) return { ok: true, ocr: STUB, disabled: true };

  try {
    const result = await runVisionJson<OcrResult>({
      systemPrompt:
        'You are an expense clerk reading a receipt photo. Return strictly JSON: {vendor: string, total: number, category: one of [Materials, Labor, Fuel, Tools, Subcontractor, Other], note: string, lineItems: [{name: string, amount: number}] (up to 10)}. Do your best to infer the total even if torn or faded. If it is not a receipt, return {vendor: "", total: 0, category: "Other", note: "not a receipt", lineItems: []}.',
      userPrompt: "Extract the fields from this receipt.",
      imageUrl: input.dataUrl,
    });
    if (!result) return { ok: false, error: "No OCR result" };
    return { ok: true, ocr: result };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "OCR failed" };
  }
}

export async function saveReceiptExpense(input: {
  jobId: string;
  dataUrl: string;
  filename: string;
  vendor: string;
  total: number;
  category: string;
  note: string | null;
  ocrJson: OcrResult | null;
}) {
  const { organizationId } = await requireManager();
  const job = await db.job.findUnique({ where: { id: input.jobId } });
  if (!job || job.organizationId !== organizationId) throw new Error("Not found");

  let receiptUrl = input.dataUrl;
  if (isBlobEnabled()) {
    try {
      const match = input.dataUrl.match(/^data:(.+?);base64,(.+)$/);
      if (match) {
        const buf = Buffer.from(match[2], "base64");
        const res = await uploadBlob(
          `receipts/${input.jobId}/${Date.now()}-${input.filename}`,
          buf,
        );
        receiptUrl = res.url;
      }
    } catch {
      // fallback to data URL
    }
  }

  // The id and the resolved receipt URL come back so a caller that keeps its
  // own on-screen copy of the book can append the REAL row — one that its
  // delete button can then address — instead of a placeholder.
  const created = await db.jobExpense.create({
    data: {
      jobId: input.jobId,
      category: input.category,
      amount: input.total,
      note:
        input.note ||
        (input.vendor ? `Vendor: ${input.vendor}` : null),
      receiptUrl,
      ocrJson: input.ocrJson ? JSON.stringify(input.ocrJson) : null,
    },
  });
  revalidatePath(`/dashboard/jobs/${input.jobId}`);
  revalidatePath("/dashboard/financials");
  revalidatePath("/dashboard/financials/expenses");
  return { ok: true, id: created.id, receiptUrl };
}
