// The one reminder: a client who was mailed a review link seven days ago and
// has not used it gets a second, softer email. Once. `remindedAt` is stamped
// BEFORE the send is attempted, so a dead address or a transport outage can
// never turn into a daily nag — the row is simply skipped from then on.
import { db } from "@/lib/db";
import { DAY } from "@/lib/rateLimit";
import { sendReviewRequestEmail } from "./email";

export const REVIEW_REMINDER_AFTER_MS = 7 * DAY;
const BATCH = 200;

export async function runReviewReminderSweep(now = new Date()) {
  const cutoff = new Date(now.getTime() - REVIEW_REMINDER_AFTER_MS);
  const due = await db.reviewRequest.findMany({
    where: {
      status: "SENT",
      remindedAt: null,
      sentAt: { lte: cutoff },
      client: { is: { email: { not: null } } },
      organization: { deletedAt: null },
    },
    orderBy: { sentAt: "asc" },
    take: BATCH,
    select: { id: true },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of due) {
    await db.reviewRequest.update({ where: { id: row.id }, data: { remindedAt: now } });
    try {
      if (await sendReviewRequestEmail(row.id, "reminder")) sent += 1;
      else skipped += 1;
    } catch (err) {
      failed += 1;
      console.warn("[review-reminders] send failed:", row.id, err);
    }
  }
  return { scanned: due.length, sent, skipped, failed };
}
