"use server";
import { IMAGE_DATA_URL, safeFilename } from "@/lib/safeHref";
import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { isOpenAIEnabled } from "@/lib/sdk/openai";
import { runVisionJson } from "@/lib/sdk/openaiVision";
import { isBlobEnabled, uploadBlob } from "@/lib/sdk/blob";
import { enforceRateLimit, HOUR } from "@/lib/rateLimit";

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
await enforceRateLimit(`vision:${organizationId}`, 60, HOUR, "receipt scans");
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
await enforceRateLimit(`vision:${organizationId}`, 60, HOUR, "receipt scans");
  const job = await db.job.findUnique({ where: { id: input.jobId } });
  if (!job || job.organizationId !== organizationId) throw new Error("Not found");

  // Inline image only — the stored URL is rendered as a link + thumbnail in
  // the financials ledger for every manager.
  const match = input.dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match || !IMAGE_DATA_URL.test(input.dataUrl)) throw new Error("Receipt must be an image");
  let receiptUrl = input.dataUrl;
  if (isBlobEnabled()) {
    const buf = Buffer.from(match[2], "base64");
    const res = await uploadBlob(
      `receipts/${input.jobId}/${Date.now()}-${safeFilename(input.filename, "receipt")}`,
      buf,
      { contentType: match[1].toLowerCase() },
    );
    receiptUrl = res.url;
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
