"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import type {
  TradeJob,
  OwnPost,
  ChatMessage,
  ViewerStatus,
  JobStatus,
  Urgency,
  TradeInboxDTO,
  TradeNetworkProfileDTO,
} from "@/app/(mobile)/trade-services/trade-data";

const ROUTE = "/trade-services";
const HIDDEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BROADCAST_CAP = 500;

// ─── JSON list helpers (SQLite stores arrays as JSON strings) ──────────────
function parseList(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function hoursSince(d: Date): number {
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 3_600_000));
}
function daysSince(d: Date): number {
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}
const URGENCIES = new Set<Urgency>(["low", "medium", "high", "urgent"]);
function asUrgency(s: string | null | undefined): Urgency | undefined {
  return s && URGENCIES.has(s as Urgency) ? (s as Urgency) : undefined;
}

// ─── Opt-in profile ────────────────────────────────────────────────────────
export async function getTradeNetworkProfile(): Promise<TradeNetworkProfileDTO> {
  const user = await requireUser();
  const p = await db.tradeNetworkProfile.findUnique({ where: { userId: user.id } });
  if (!p) return { optIn: false, tradeTypes: [], specialties: [], serviceArea: null };
  return {
    optIn: p.optIn,
    tradeTypes: parseList(p.tradeTypes),
    specialties: parseList(p.specialties),
    serviceArea: p.serviceArea,
  };
}

const optInInput = z.object({
  optIn: z.boolean(),
  tradeTypes: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
  specialties: z.array(z.string().trim().min(1).max(60)).max(80).default([]),
  serviceArea: z.string().max(120).optional().nullable(),
});

export async function setTradeNetworkOptIn(raw: unknown): Promise<TradeNetworkProfileDTO> {
  const user = await requireUser();
  const data = optInInput.parse(raw);
  const payload = {
    optIn: data.optIn,
    tradeTypes: JSON.stringify(data.tradeTypes),
    specialties: JSON.stringify(data.specialties),
    serviceArea: data.serviceArea ?? null,
  };
  const p = await db.tradeNetworkProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...payload },
    update: payload,
  });
  revalidatePath(ROUTE);
  return {
    optIn: p.optIn,
    tradeTypes: parseList(p.tradeTypes),
    specialties: parseList(p.specialties),
    serviceArea: p.serviceArea,
  };
}

// ─── Inbox (recipient view: New / Engaged / Hidden) ─────────────────────────
type RecipientRow = {
  status: string;
  notInterestedAt: Date | null;
  tradeJob: {
    id: string;
    title: string;
    description: string;
    tradeType: string;
    specialties: string;
    location: string | null;
    budget: string | null;
    timeWindow: string | null;
    urgency: string | null;
    status: string;
    createdAt: Date;
    authorOrgId: string;
    author: { name: string | null };
  };
};

function mapInboxJob(row: RecipientRow, orgNames: Map<string, string>): TradeJob {
  const j = row.tradeJob;
  return {
    id: j.id,
    title: j.title,
    description: j.description,
    tradeType: j.tradeType,
    specialties: parseList(j.specialties),
    location: j.location ?? undefined,
    budget: j.budget ?? undefined,
    timeWindow: j.timeWindow ?? undefined,
    urgency: asUrgency(j.urgency),
    status: j.status as JobStatus,
    // Never surface the poster's account email cross-org; fall back to org name.
    postedByName: j.author.name ?? orgNames.get(j.authorOrgId) ?? "A contractor",
    postedByCompany: orgNames.get(j.authorOrgId) ?? undefined,
    hoursAgo: hoursSince(j.createdAt),
    viewerStatus: row.status as ViewerStatus,
    hiddenDaysAgo: row.notInterestedAt ? daysSince(row.notInterestedAt) : undefined,
  };
}

export async function getTradeInbox(): Promise<TradeInboxDTO> {
  const user = await requireUser();
  const cutoff = new Date(Date.now() - HIDDEN_TTL_MS);

  const rows = await db.tradeJobRecipient.findMany({
    where: {
      recipientId: user.id,
      OR: [
        { status: "NEW" },
        { status: "INTERESTED" },
        { status: "NOT_INTERESTED", notInterestedAt: { gte: cutoff } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: {
      status: true,
      notInterestedAt: true,
      tradeJob: {
        select: {
          id: true,
          title: true,
          description: true,
          tradeType: true,
          specialties: true,
          location: true,
          budget: true,
          timeWindow: true,
          urgency: true,
          status: true,
          createdAt: true,
          authorOrgId: true,
          author: { select: { name: true } },
        },
      },
    },
  });

  // Batch-resolve poster org names (authorOrgId is a provenance scalar, not a FK).
  const orgIds = Array.from(new Set(rows.map((r) => r.tradeJob.authorOrgId)));
  const orgs = orgIds.length
    ? await db.organization.findMany({
        where: { id: { in: orgIds } },
        select: { id: true, name: true },
      })
    : [];
  const orgNames = new Map(orgs.map((o) => [o.id, o.name]));

  const mapped = rows.map((r) => mapInboxJob(r, orgNames));
  return {
    newJobs: mapped.filter((j) => j.viewerStatus === "NEW"),
    engaged: mapped.filter((j) => j.viewerStatus === "INTERESTED"),
    hidden: mapped.filter((j) => j.viewerStatus === "NOT_INTERESTED"),
  };
}

// ─── My Posts (author view) ─────────────────────────────────────────────────
export async function getMyTradeJobs(): Promise<OwnPost[]> {
  const user = await requireUser();
  const jobs = await db.tradeJob.findMany({
    where: { authorId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      tradeType: true,
      specialties: true,
      location: true,
      budget: true,
      timeWindow: true,
      urgency: true,
      status: true,
      createdAt: true,
      _count: { select: { recipients: true } },
      recipients: { where: { status: "INTERESTED" }, select: { id: true } },
    },
  });
  return jobs.map((j) => ({
    id: j.id,
    title: j.title,
    tradeType: j.tradeType,
    specialties: parseList(j.specialties),
    location: j.location ?? undefined,
    budget: j.budget ?? undefined,
    timeWindow: j.timeWindow ?? undefined,
    urgency: asUrgency(j.urgency),
    status: j.status as JobStatus,
    hoursAgo: hoursSince(j.createdAt),
    broadcastCount: j._count.recipients,
    interestedCount: j.recipients.length,
  }));
}

// ─── Matching engine (consent-gated, cross-org, 500 cap) ────────────────────
async function findMatchingRecipients(
  tradeType: string,
  specialties: string[],
  excludeUserId: string,
): Promise<string[]> {
  const orFilters: { tradeTypes?: { contains: string }; specialties?: { contains: string } }[] =
    [{ tradeTypes: { contains: `"${tradeType}"` } }];
  for (const s of specialties) orFilters.push({ specialties: { contains: `"${s}"` } });

  const candidates = await db.tradeNetworkProfile.findMany({
    where: { optIn: true, userId: { not: excludeUserId }, OR: orFilters },
    select: { userId: true, tradeTypes: true, specialties: true },
    take: 2000,
  });

  const wantSpecialties = new Set(specialties);
  const matched: string[] = [];
  for (const c of candidates) {
    const profTrades = new Set(parseList(c.tradeTypes));
    const profSkills = parseList(c.specialties);
    const tradeHit = profTrades.has(tradeType);
    const skillHit = profSkills.some((s) => wantSpecialties.has(s));
    if (tradeHit || skillHit) matched.push(c.userId);
    if (matched.length >= BROADCAST_CAP) break;
  }
  return matched;
}

// ─── Create / broadcast ─────────────────────────────────────────────────────
const createInput = z.object({
  title: z.string().trim().min(5).max(140),
  description: z.string().trim().min(20).max(4000),
  tradeType: z.string().trim().min(1).max(60),
  specialties: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
  location: z.string().trim().max(160).optional().nullable(),
  budget: z.string().trim().max(80).optional().nullable(),
  timeWindow: z.string().trim().max(120).optional().nullable(),
  urgency: z.enum(["low", "medium", "high", "urgent"]).optional().nullable(),
});

export async function createTradeJob(raw: unknown): Promise<{ id: string; broadcastCount: number }> {
  const { user, organizationId } = await requireManager();
  const data = createInput.parse(raw);

  // Lightweight anti-spam: cap broadcasts per author per minute.
  const recent = await db.tradeJob.count({
    where: { authorId: user.id, createdAt: { gte: new Date(Date.now() - 60_000) } },
  });
  if (recent >= 5) {
    throw new Error("You're posting too fast. Give it a minute and try again.");
  }

  const job = await db.tradeJob.create({
    data: {
      authorId: user.id,
      authorOrgId: organizationId,
      title: data.title,
      description: data.description,
      tradeType: data.tradeType,
      specialties: JSON.stringify(data.specialties),
      location: data.location ?? null,
      budget: data.budget ?? null,
      timeWindow: data.timeWindow ?? null,
      urgency: data.urgency ?? null,
      status: "OPEN",
    },
    select: { id: true },
  });

  const recipientIds = await findMatchingRecipients(data.tradeType, data.specialties, user.id);
  if (recipientIds.length) {
    await db.$transaction(
      recipientIds.map((rid) =>
        db.tradeJobRecipient.create({
          data: { tradeJobId: job.id, recipientId: rid, status: "NEW" },
        }),
      ),
    );
  }

  revalidatePath(ROUTE);
  return { id: job.id, broadcastCount: recipientIds.length };
}

// ─── Recipient responses ────────────────────────────────────────────────────
export async function respondToTradeJob(
  jobId: string,
  status: "INTERESTED" | "NOT_INTERESTED",
): Promise<{ ok: true }> {
  const user = await requireUser();
  if (status !== "INTERESTED" && status !== "NOT_INTERESTED") {
    throw new Error("Invalid response");
  }
  // Authz: a user can only act on their OWN recipient row.
  const rec = await db.tradeJobRecipient.findUnique({
    where: { tradeJobId_recipientId: { tradeJobId: jobId, recipientId: user.id } },
    select: { id: true, tradeJob: { select: { authorId: true, status: true } } },
  });
  if (!rec) throw new Error("This job was not sent to you.");
  // Don't let recipients express interest / open chats on closed jobs.
  if (status === "INTERESTED" && rec.tradeJob.status !== "OPEN") {
    throw new Error("This job is no longer open.");
  }

  await db.tradeJobRecipient.update({
    where: { id: rec.id },
    data: {
      status,
      interestedAt: status === "INTERESTED" ? new Date() : null,
      notInterestedAt: status === "NOT_INTERESTED" ? new Date() : null,
    },
  });

  if (status === "INTERESTED") {
    await db.tradeJobConversation.upsert({
      where: { tradeJobId_recipientId: { tradeJobId: jobId, recipientId: user.id } },
      create: { tradeJobId: jobId, authorId: rec.tradeJob.authorId, recipientId: user.id },
      update: { updatedAt: new Date() },
    });
  }
  revalidatePath(ROUTE);
  return { ok: true };
}

export async function restoreTradeJob(jobId: string): Promise<{ ok: true }> {
  const user = await requireUser();
  const rec = await db.tradeJobRecipient.findUnique({
    where: { tradeJobId_recipientId: { tradeJobId: jobId, recipientId: user.id } },
    select: { id: true },
  });
  if (!rec) throw new Error("This job was not sent to you.");
  await db.tradeJobRecipient.update({
    where: { id: rec.id },
    data: { status: "NEW", notInterestedAt: null, interestedAt: null },
  });
  revalidatePath(ROUTE);
  return { ok: true };
}

// ─── Author status changes ──────────────────────────────────────────────────
export async function setTradeJobStatus(
  jobId: string,
  status: "FILLED" | "CANCELLED",
): Promise<{ ok: true }> {
  const user = await requireUser();
  if (status !== "FILLED" && status !== "CANCELLED") throw new Error("Invalid status");
  // Authz: only the author can change a job's status.
  const job = await db.tradeJob.findUnique({
    where: { id: jobId },
    select: { authorId: true },
  });
  if (!job || job.authorId !== user.id) throw new Error("Only the poster can do that.");
  await db.tradeJob.update({ where: { id: jobId }, data: { status } });
  revalidatePath(ROUTE);
  return { ok: true };
}

// ─── Conversation (recipient side) ──────────────────────────────────────────
function mapMessage(
  m: { id: string; body: string; authorId: string; createdAt: Date },
  meId: string,
): ChatMessage {
  const h = hoursSince(m.createdAt);
  return {
    id: m.id,
    body: m.body,
    mine: m.authorId === meId,
    atLabel: h < 1 ? "Just now" : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`,
  };
}

export async function getTradeConversation(jobId: string): Promise<ChatMessage[]> {
  const user = await requireUser();
  // Authz: a recipient may only read the conversation tied to their own row.
  const convo = await db.tradeJobConversation.findUnique({
    where: { tradeJobId_recipientId: { tradeJobId: jobId, recipientId: user.id } },
    select: {
      id: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, body: true, authorId: true, createdAt: true },
      },
    },
  });
  if (!convo) return [];
  return convo.messages.map((m) => mapMessage(m, user.id));
}

export async function sendTradeMessage(jobId: string, body: string): Promise<ChatMessage | null> {
  const user = await requireUser();
  const trimmed = body.trim();
  if (!trimmed) return null;
  // Authz: only a participant (here, the recipient) may post to the thread.
  const convo = await db.tradeJobConversation.findUnique({
    where: { tradeJobId_recipientId: { tradeJobId: jobId, recipientId: user.id } },
    select: { id: true, tradeJob: { select: { status: true } } },
  });
  if (!convo) throw new Error("No conversation for this job.");
  if (convo.tradeJob.status === "CANCELLED") {
    throw new Error("This job was cancelled.");
  }
  const msg = await db.tradeJobMessage.create({
    data: { conversationId: convo.id, authorId: user.id, body: trimmed.slice(0, 4000) },
    select: { id: true, body: true, authorId: true, createdAt: true },
  });
  await db.tradeJobConversation.update({
    where: { id: convo.id },
    data: { updatedAt: new Date() },
  });
  revalidatePath(ROUTE);
  return mapMessage(msg, user.id);
}
