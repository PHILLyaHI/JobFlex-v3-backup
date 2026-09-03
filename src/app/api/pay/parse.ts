import { z } from "zod";
import type { PayTarget } from "@/lib/paymentSchedule";

const schema = z.object({
  publicId: z.string().min(8).max(64),
  target: z.union([z.literal("remaining"), z.object({ installmentId: z.string().min(1).max(64) })]),
});

export async function parsePayBody(
  req: Request,
): Promise<{ ok: true; publicId: string; target: PayTarget } | { ok: false; error: string }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, error: "Bad request" };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Bad request" };
  return { ok: true, publicId: parsed.data.publicId, target: parsed.data.target };
}
