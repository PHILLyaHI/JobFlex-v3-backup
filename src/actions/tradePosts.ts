"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";

const postInput = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  category: z.string().optional().nullable(),
});

export async function createTradePost(raw: unknown) {
  const { organizationId, user } = await requireOrg();
  const data = postInput.parse(raw);
  const post = await db.tradePost.create({
    data: {
      organizationId,
      authorId: user.id,
      title: data.title,
      body: data.body,
      category: data.category ?? null,
    },
  });
  revalidatePath("/dashboard/trade");
  return { id: post.id };
}

export async function closeTradePost(id: string) {
  const { organizationId, user } = await requireOrg();
  const post = await db.tradePost.findUnique({ where: { id } });
  if (!post || post.organizationId !== organizationId) throw new Error("Not found");
  if (post.authorId !== user.id) throw new Error("Only the author can close this post.");
  await db.tradePost.update({ where: { id }, data: { status: "CLOSED" } });
  revalidatePath("/dashboard/trade");
  revalidatePath(`/dashboard/trade/${id}`);
}

export async function deleteTradePost(id: string) {
  const { organizationId, user } = await requireOrg();
  const post = await db.tradePost.findUnique({ where: { id } });
  if (!post || post.organizationId !== organizationId) throw new Error("Not found");
  if (post.authorId !== user.id) throw new Error("Only the author can delete this post.");
  await db.tradePost.delete({ where: { id } });
  revalidatePath("/dashboard/trade");
}

export async function replyToTradePost(postId: string, body: string) {
  const { organizationId, user } = await requireOrg();
  const post = await db.tradePost.findUnique({ where: { id: postId } });
  if (!post || post.organizationId !== organizationId) throw new Error("Not found");
  if (post.status === "CLOSED") throw new Error("This thread is closed.");
  const trimmed = body.trim();
  if (!trimmed) return;
  await db.tradeReply.create({
    data: {
      postId,
      authorId: user.id,
      body: trimmed,
    },
  });
  revalidatePath(`/dashboard/trade/${postId}`);
}
