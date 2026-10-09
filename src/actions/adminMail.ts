"use server";
// THE CONTRACTOR EMAIL — the admin's three moves (2026-10-08): open an
// account's composer, have the AI write the dictated words up, send. Every
// one is platform-admin only; the recipient is always the account's owner
// as the database has it. The words and the topics are lib/adminMail/compose,
// the reading and the send lib/adminMail/server.
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { fromLine, readContractor, senderName, sendToContractor, type SendResult } from "@/lib/adminMail/server";
import { TOPICS, parseWritten, suggestedTopics, topicAvailability, topicDraft, writePrompt, WRITE_LIMITS, type ContractorProfile, type Draft, type TopicKey } from "@/lib/adminMail/compose";

const TOPIC_KEYS = TOPICS.map((t) => t.key) as [TopicKey, ...TopicKey[]];
const OrgId = z.string().trim().min(1).max(64);
const DraftIn = z.object({
  subject: z.string().trim().min(1, "Write a subject.").max(WRITE_LIMITS.subject),
  body: z.string().trim().min(1, "Write the message.").max(WRITE_LIMITS.body + 400),
  cta: z.object({ label: z.string().trim().min(1).max(40), path: z.string().trim().regex(/^\/dashboard(\/[\w-]+)*$/) }).nullable(),
});

export interface ContractorMailView {
  profile: ContractorProfile;
  sender: string;
  /** The From line as the contractor sees it. */
  from: string;
  replyTo: string;
  ai: boolean;
  /** Emails really leave this deployment (false: a dev outbox or no transport). */
  live: boolean;
  topics: Array<{ key: TopicKey; label: string; hint: string; ok: boolean; reason: string | null }>;
  suggested: TopicKey[];
}

export async function getContractorMail(orgId: string): Promise<{ ok: true; view: ContractorMailView } | { ok: false; error: string }> {
  const admin = await requirePlatformAdmin();
  const id = OrgId.safeParse(orgId);
  if (!id.success) return { ok: false, error: "No account given." };
  try {
    const acc = await readContractor(id.data);
    if (!acc) return { ok: false, error: "That account no longer exists." };
    const { isOpenAIEnabled } = await import("@/lib/sdk/openai");
    const { isEmailEnabled } = await import("@/lib/sdk/resend");
    const now = Date.now();
    return {
      ok: true,
      view: {
        profile: acc.profile,
        sender: senderName(admin),
        from: fromLine(senderName(admin)),
        replyTo: admin.email,
        ai: isOpenAIEnabled(),
        live: isEmailEnabled() && !(process.env.NODE_ENV !== "production" && process.env.EMAIL_DEV_OUTBOX?.trim()),
        topics: TOPICS.map((t) => { const a = topicAvailability(t.key, acc.profile, now); return { ...t, ok: a.ok, reason: a.ok ? null : a.reason }; }),
        suggested: suggestedTopics(acc.profile, now),
      },
    };
  } catch (err) {
    console.error("[adminMail] read failed:", err);
    return { ok: false, error: "Couldn't read that account. Try again." };
  }
}

/** The admin's spoken or typed words → a professional email, on the account's facts. */
export async function writeContractorMail(input: { orgId: string; notes: string; topic?: TopicKey | null; offer?: boolean }): Promise<{ ok: true; draft: Omit<Draft, "cta"> } | { ok: false; error: string }> {
  const admin = await requirePlatformAdmin();
  const parsed = z.object({ orgId: OrgId, notes: z.string().trim().min(3, "Say or type what the email should say.").max(WRITE_LIMITS.notes), topic: z.enum(TOPIC_KEYS).nullish(), offer: z.boolean().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Nothing to write from." };
  const { getOpenAI, isOpenAIEnabled, resolveOpenAIModel, samplingOptions, friendlyAIError } = await import("@/lib/sdk/openai");
  if (!isOpenAIEnabled()) return { ok: false, error: "AI writing is not configured here (OPENAI_API_KEY). Pick a topic or type the email instead." };
  const acc = await readContractor(parsed.data.orgId).catch(() => null);
  if (!acc) return { ok: false, error: "That account no longer exists." };
  const topic = parsed.data.topic ? topicDraft(parsed.data.topic, acc.profile) : null;
  const { system, user } = writePrompt({ p: acc.profile, notes: parsed.data.notes, sender: senderName(admin), topic, offer: !!parsed.data.offer && acc.profile.offer.can });
  try {
    const model = await resolveOpenAIModel();
    const res = await getOpenAI().chat.completions.create({
      model,
      ...(await samplingOptions(0.5)),
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    });
    const out = parseWritten(res.choices[0]?.message?.content ?? "");
    return out.ok ? { ok: true, draft: out.draft } : { ok: false, error: out.error };
  } catch (err) {
    return { ok: false, error: friendlyAIError(err, "adminMail.write") };
  }
}

/** Send it — the offer applied first when attached; nothing goes out if it cannot be. */
export async function sendContractorMail(input: { orgId: string; topic: TopicKey | "custom"; draft: Draft; offer: boolean }): Promise<SendResult> {
  const admin = await requirePlatformAdmin();
  const parsed = z.object({ orgId: OrgId, topic: z.union([z.enum(TOPIC_KEYS), z.literal("custom")]), draft: DraftIn, offer: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "The email is not complete." };
  try {
    return await sendToContractor({ ...parsed.data, admin: { email: admin.email, name: admin.name } });
  } catch (err) {
    console.error("[adminMail] send failed:", err);
    return { ok: false, error: "The email could not be sent. Try again." };
  }
}
