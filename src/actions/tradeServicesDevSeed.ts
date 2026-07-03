"use server";
import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import {
  SEED_JOBS,
  SEED_OWN_POSTS,
  SEED_CONVERSATIONS,
} from "@/app/(mobile)/trade-services/trade-data";

// Dev-only: builds a realistic cross-org dataset for the logged-in user so the
// live feature is demonstrable without manual multi-account setup. Idempotent via
// deterministic job ids (`demo-<meId>-<seedId>`); safe to run repeatedly.

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function hoursAgoDate(hours: number): Date {
  return new Date(Date.now() - hours * 3_600_000);
}

async function upsertPeer(
  name: string,
  company: string,
  tradeType: string,
  specialties: string[],
): Promise<{ userId: string; orgId: string }> {
  const slug = slugify(company || name);
  const email = `peer-${slug}@tradedemo.local`;

  const user = await db.user.upsert({
    where: { email },
    create: { email, name },
    update: { name },
    select: { id: true },
  });

  const org = await db.organization.upsert({
    where: { slug: `demo-${slug}` },
    create: { name: company || name, slug: `demo-${slug}` },
    update: {},
    select: { id: true },
  });

  await db.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    create: { userId: user.id, organizationId: org.id, role: "OWNER" },
    update: {},
  });

  await db.tradeNetworkProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      optIn: true,
      tradeTypes: JSON.stringify([tradeType]),
      specialties: JSON.stringify(specialties),
    },
    update: {
      optIn: true,
      tradeTypes: JSON.stringify([tradeType]),
      specialties: JSON.stringify(specialties),
    },
  });

  return { userId: user.id, orgId: org.id };
}

export async function devSeedTradeNetwork(): Promise<{ ok: true; jobs: number }> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo seed is disabled in production.");
  }
  const { user, organizationId } = await requireManager();
  const meId = user.id;

  // Opt the current user into the network so they can receive and be matched.
  await db.tradeNetworkProfile.upsert({
    where: { userId: meId },
    create: {
      userId: meId,
      optIn: true,
      tradeTypes: JSON.stringify(["Tile", "Concrete", "Carpentry"]),
      specialties: JSON.stringify(["Backsplash", "Excavation", "Built-ins"]),
    },
    update: { optIn: true },
  });

  // Idempotency: clear this user's prior demo jobs (cascade clears recipients,
  // conversations and messages) before recreating.
  await db.tradeJob.deleteMany({ where: { id: { startsWith: `demo-${meId}-` } } });

  let count = 0;

  // Peer-authored jobs broadcast TO me (New / My Trades / Hidden).
  for (const seed of SEED_JOBS) {
    const peer = await upsertPeer(
      seed.postedByName,
      seed.postedByCompany ?? seed.postedByName,
      seed.tradeType,
      seed.specialties,
    );
    const jobId = `demo-${meId}-${seed.id}`;
    await db.tradeJob.create({
      data: {
        id: jobId,
        authorId: peer.userId,
        authorOrgId: peer.orgId,
        title: seed.title,
        description: seed.description,
        tradeType: seed.tradeType,
        specialties: JSON.stringify(seed.specialties),
        location: seed.location ?? null,
        budget: seed.budget ?? null,
        timeWindow: seed.timeWindow ?? null,
        urgency: seed.urgency ?? null,
        status: seed.status,
        createdAt: hoursAgoDate(seed.hoursAgo),
      },
    });

    await db.tradeJobRecipient.create({
      data: {
        tradeJobId: jobId,
        recipientId: meId,
        status: seed.viewerStatus,
        interestedAt: seed.viewerStatus === "INTERESTED" ? new Date() : null,
        notInterestedAt:
          seed.viewerStatus === "NOT_INTERESTED"
            ? new Date(Date.now() - (seed.hiddenDaysAgo ?? 0) * 86_400_000)
            : null,
      },
    });

    // Seed a conversation for engaged jobs.
    if (seed.viewerStatus === "INTERESTED") {
      const convo = await db.tradeJobConversation.create({
        data: { tradeJobId: jobId, authorId: peer.userId, recipientId: meId },
        select: { id: true },
      });
      const msgs = SEED_CONVERSATIONS[seed.id] ?? [];
      for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        await db.tradeJobMessage.create({
          data: {
            conversationId: convo.id,
            authorId: m.mine ? meId : peer.userId,
            body: m.body,
            createdAt: new Date(Date.now() - (msgs.length - i) * 60_000),
          },
        });
      }
    }
    count++;
  }

  // My own broadcasts (My Posts): authored by me, sent to peers.
  // Scope strictly to the synthetic demo cohort so a shared dev DB never enrolls
  // real opted-in users as recipients of demo broadcasts.
  const peerIds = (
    await db.tradeNetworkProfile.findMany({
      where: {
        optIn: true,
        userId: { not: meId },
        user: { email: { endsWith: "@tradedemo.local" } },
      },
      select: { userId: true },
      take: 8,
    })
  ).map((p) => p.userId);

  for (const op of SEED_OWN_POSTS) {
    const jobId = `demo-${meId}-${op.id}`;
    await db.tradeJob.create({
      data: {
        id: jobId,
        authorId: meId,
        authorOrgId: organizationId,
        title: op.title,
        description: `Demo broadcast for ${op.title}.`,
        tradeType: op.tradeType,
        specialties: JSON.stringify(op.specialties),
        location: op.location ?? null,
        budget: op.budget ?? null,
        timeWindow: op.timeWindow ?? null,
        urgency: op.urgency ?? null,
        status: op.status,
        createdAt: hoursAgoDate(op.hoursAgo),
      },
    });
    // A few peer recipients; mark the first two interested for a realistic count.
    for (let i = 0; i < peerIds.length; i++) {
      await db.tradeJobRecipient.create({
        data: {
          tradeJobId: jobId,
          recipientId: peerIds[i],
          status: i < 2 ? "INTERESTED" : "NEW",
          interestedAt: i < 2 ? new Date() : null,
        },
      });
    }
    count++;
  }

  revalidatePath("/trade-services");
  return { ok: true, jobs: count };
}
