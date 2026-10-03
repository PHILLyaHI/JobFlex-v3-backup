// PLAN REMINDERS (2026-10-03) — server only. The month (or day) a homeowner
// planned a project for has come: one email, "ready? submit it", with the
// intake prefilled from the plan. Once per plan (remindedAt), from the daily
// cron (/api/cron/home-plans); a moved plan is reminded about again.
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { sendEmail } from "@/lib/sdk/resend";
import { renderEmail } from "@/lib/email/renderEmail";
import { buildHomePlanReminder } from "@/lib/email/build/platform";
import { homeUrl } from "./portal";
import { planWhen } from "./dates";

export async function sendPlanReminders(now = new Date()): Promise<{ reminded: number; failed: number }> {
  const due = await db.homePlan.findMany({
    where: { status: "PLANNED", remindedAt: null, remindAt: { lte: now } },
    orderBy: { remindAt: "asc" },
    take: 200,
    include: { home: { select: { name: true, email: true, accessToken: true } } },
  });
  let reminded = 0;
  let failed = 0;
  const appUrl = await appBaseUrl();
  for (const plan of due) {
    // Claimed first: an overlapping run never sends the same reminder twice.
    const claimed = await db.homePlan.updateMany({ where: { id: plan.id, remindedAt: null }, data: { remindedAt: now } });
    if (claimed.count === 0) continue;
    try {
      const url = await homeUrl(plan.home.accessToken);
      const { subject, html } = renderEmail(
        buildHomePlanReminder({
          name: plan.home.name,
          title: plan.title,
          when: planWhen(plan.plannedFor, plan.wholeMonth),
          notes: plan.notes,
          submitUrl: `${appUrl}/homeowner?home=${encodeURIComponent(plan.home.accessToken)}&plan=${encodeURIComponent(plan.id)}`,
          homeUrl: url,
        }),
      );
      await sendEmail({ to: plan.home.email, subject, html });
      reminded += 1;
    } catch (err) {
      failed += 1;
      console.error(`[home] plan reminder ${plan.id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return { reminded, failed };
}
