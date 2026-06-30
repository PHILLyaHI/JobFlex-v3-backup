"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";

const payoutInput = z.object({
  influencerName: z.string().min(1),
  amount: z.number().min(0),
  period: z.string().min(1),
});

export async function recordPayout(raw: unknown) {
  const { organizationId } = await requireManager();
  const data = payoutInput.parse(raw);
  const p = await db.influencerPayout.create({
    data: {
      organizationId,
      influencerName: data.influencerName,
      amount: data.amount,
      period: data.period,
      status: "PENDING",
    },
  });
  revalidatePath("/dashboard/trade");
  return { id: p.id };
}

export async function markPayoutPaid(id: string) {
  const { organizationId } = await requireManager();
  const p = await db.influencerPayout.findUnique({ where: { id } });
  if (!p || p.organizationId !== organizationId) throw new Error("Not found");
  await db.influencerPayout.update({
    where: { id },
    data: { status: "PAID", paidAt: new Date() },
  });
  revalidatePath("/dashboard/trade");
}
