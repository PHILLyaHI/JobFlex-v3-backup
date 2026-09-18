// Who hears about a platform-level problem.
//
// The same rule lib/notify.ts uses for support tickets — an explicit
// SUPPORT_NOTIFY_EMAIL, else every flagged platform admin — kept here as its
// own small module rather than exported from notify.ts, which pulls the whole
// notification tree (templates, Twilio, the digest scheduler) in behind it.
// The health check runs on a cron and must stay cheap to import.

import { db } from "@/lib/db";

/** Addresses that could never receive anything; Resend rejects a batch that
 *  contains one, which would silently lose the alert for everybody else. */
function undeliverable(email: string): boolean {
  return /@[^@]*\.(local|invalid|test)$/i.test(email.trim());
}

export async function platformAlertRecipients(): Promise<string[]> {
  const override = process.env.SUPPORT_NOTIFY_EMAIL?.trim();
  if (override) {
    return override
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((e) => !undeliverable(e));
  }
  const admins = await db.user
    .findMany({ where: { isPlatformAdmin: true }, select: { email: true } })
    .catch(() => []);
  return admins
    .map((a) => a.email)
    .filter((e): e is string => Boolean(e))
    .filter((e) => !undeliverable(e));
}
