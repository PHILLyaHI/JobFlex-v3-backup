// Undo one import, driven by the manifest rather than by cascade semantics.
//
// "Delete the organization and let the cascades handle it" is wrong whenever the
// account already existed in v3 before the import — it would take the customer's
// own rows with it. The manifest lists exactly what this tool created, so exactly
// that is what gets removed.
import type { Writer } from "./client";
import { manifestKey, TX } from "./config";
import type { Manifest } from "./phases";

/** Children first: reverse of the order the phases wrote them in. */
const ORDER = [
  "ActivityEvent", "PricingSnapshot", "Installment", "Discount", "LineItem",
  "Message", "ConversationParticipant", "Conversation",
  "Appointment", "JobEvent", "Job", "Proposal", "Lead", "Client",
  "Subscription", "Membership", "Account", "User", "Organization",
] as const;

const DELEGATE: Record<string, string> = {
  ActivityEvent: "activityEvent", PricingSnapshot: "pricingSnapshot", Installment: "installment",
  Discount: "discount", LineItem: "lineItem", Message: "message",
  ConversationParticipant: "conversationParticipant", Conversation: "conversation",
  Appointment: "appointment", JobEvent: "jobEvent", Job: "job", Proposal: "proposal",
  Lead: "lead", Client: "client", Subscription: "subscription", Membership: "membership",
  Account: "account", User: "user", Organization: "organization",
};

export async function rollback(db: Writer, oldUserId: string): Promise<void> {
  const key = manifestKey(oldUserId);
  const row = await db.syncState.findUnique({ where: { key } });
  if (!row) throw new Error(`No manifest at SyncState["${key}"] — nothing to roll back`);
  const manifest = JSON.parse(row.cursor) as Manifest;

  console.log(`\nROLLBACK · ${manifest.email} (${oldUserId}) from ${manifest.target}\n`);
  await db.$transaction(async (tx) => {
    for (const model of ORDER) {
      const ids = manifest.created[model] ?? [];
      if (!ids.length) continue;
      const delegate = (tx as unknown as Record<string, { deleteMany: (a: unknown) => Promise<{ count: number }> }>)[
        DELEGATE[model]
      ];
      const { count } = await delegate.deleteMany({ where: { id: { in: ids } } });
      console.log(`  ${String(count).padStart(4)} ${model}`);
    }
    // A password takeover is not a row we can delete — put the old credential back.
    const takeover = manifest.passwordTakeover;
    if (takeover) {
      await tx.user.update({
        where: { id: takeover.userId },
        data: {
          hashedPassword: takeover.previousHash,
          credentialVersion: takeover.previousCredentialVersion,
        },
      });
      console.log("     1 password restored");
    }
    const up = manifest.subscriptionUpgrade;
    if (up) {
      await tx.subscription.updateMany({
        where: { organizationId: up.organizationId },
        data: {
          plan: up.previousPlan,
          status: up.previousStatus,
          provider: up.previousProvider ?? "STRIPE",
          currentPeriodEnd: up.previousCurrentPeriodEnd ? new Date(up.previousCurrentPeriodEnd) : null,
          externalSubId: up.previousExternalSubId ?? null,
          stripePriceId: up.previousStripePriceId ?? null,
        },
      });
      console.log("     1 subscription restored");
    }
    await tx.syncState.delete({ where: { key } });
  }, TX);
  console.log("\nrolled back\n");
}
