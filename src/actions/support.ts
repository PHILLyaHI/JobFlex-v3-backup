"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager, requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { sendEmail, isEmailEnabled } from "@/lib/sdk/resend";
import { renderEmail } from "@/lib/email/renderEmail";
import { buildSupportTicket } from "@/lib/email/build/operator";

// Support taxonomy — kept in lockstep with the customer form's chips and the
// admin triage tags. Not exported: a "use server" module may only export async
// functions, and these are used internally by the validators below.
const SUPPORT_CATEGORIES = ["billing", "technical", "account", "feature", "general"] as const;
const SUPPORT_PRIORITIES = ["low", "normal", "high"] as const;

const ticketInput = z.object({
  subject: z.string().min(1, "Add a subject").max(200),
  body: z.string().min(1, "Describe the issue").max(5000),
  category: z.enum(SUPPORT_CATEGORIES).default("general"),
  priority: z.enum(SUPPORT_PRIORITIES).default("normal"),
});

// Manager-facing: raise a support ticket from inside the dashboard. Org-scoped via
// requireManager(), and stamped with the submitting user so admins can follow up.
export async function submitSupportTicket(raw: unknown) {
  const { organizationId, user } = await requireManager();
  const data = ticketInput.parse(raw);

  const ticket = await db.supportTicket.create({
    data: {
      organizationId,
      userId: user.id,
      subject: data.subject,
      body: data.body,
      category: data.category,
      priority: data.priority,
      status: "OPEN",
    },
  });

  // Heads-up to platform admins. Best-effort and fully isolated — a broken mail
  // transport must never fail the customer's submission.
  const [org, submitter] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    db.user.findUnique({ where: { id: user.id }, select: { email: true } }),
  ]);
  await notifyAdminsOfTicket({
    subject: data.subject,
    body: data.body,
    category: data.category,
    priority: data.priority,
    orgName: org?.name ?? "A customer",
    submitterEmail: submitter?.email ?? null,
  });

  revalidatePath("/dashboard/support");
  revalidatePath("/admin/support");
  revalidatePath("/admin");
  return { id: ticket.id };
}

// ── Admin notification feed (platform-admin only) ─────────────────────────────

export interface SupportFeedItem {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  orgName: string;
  submitterEmail: string | null;
  createdAt: Date;
  /** true while the admin hasn't opened the inbox since this ticket arrived. */
  unread: boolean;
}

/** Recent tickets across every org, for the admin header bell + overview feed. */
export async function recentSupportTickets(limit = 8): Promise<SupportFeedItem[]> {
  await requirePlatformAdmin();
  const rows = await db.supportTicket.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      organization: { select: { name: true } },
      user: { select: { email: true } },
    },
  });
  return rows.map((t) => ({
    id: t.id,
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    orgName: t.organization.name,
    submitterEmail: t.user?.email ?? null,
    createdAt: t.createdAt,
    unread: t.adminReadAt === null,
  }));
}

/** Count of tickets the admin hasn't seen yet — drives the nav + bell badges. */
export async function unreadSupportCount(): Promise<number> {
  await requirePlatformAdmin();
  return db.supportTicket.count({ where: { adminReadAt: null } });
}

/** Mark every unread ticket as seen. Called when the admin opens the inbox or
 *  clears the bell. Idempotent — a no-op once nothing is unread. */
export async function markSupportTicketsRead(): Promise<void> {
  await requirePlatformAdmin();
  await db.supportTicket.updateMany({
    where: { adminReadAt: null },
    data: { adminReadAt: new Date() },
  });
  revalidatePath("/admin/support");
  revalidatePath("/admin");
}

// ── internals ─────────────────────────────────────────────────────────────────

// Where new-ticket alerts go: an explicit SUPPORT_NOTIFY_EMAIL (comma-separated)
// if set, otherwise every flagged platform admin's address.
async function platformAdminEmails(): Promise<string[]> {
  const override = process.env.SUPPORT_NOTIFY_EMAIL?.trim();
  if (override) {
    return override.split(",").map((s) => s.trim()).filter(Boolean);
  }
  const admins = await db.user.findMany({
    where: { isPlatformAdmin: true },
    select: { email: true },
  });
  return admins.map((a) => a.email).filter((e): e is string => Boolean(e));
}

async function notifyAdminsOfTicket(t: {
  subject: string;
  body: string;
  category: string;
  priority: string;
  orgName: string;
  submitterEmail: string | null;
}): Promise<void> {
  try {
    if (!isEmailEnabled()) return;
    const to = await platformAdminEmails();
    if (to.length === 0) return;

    const appUrl = await appBaseUrl();
    const { subject: ticketSubject, html: ticketHtml } = renderEmail(
      buildSupportTicket({
        subject: t.subject,
        body: t.body,
        category: t.category,
        priority: t.priority,
        orgName: t.orgName,
        submitterEmail: t.submitterEmail,
        href: `${appUrl}/admin/support`,
      }),
    );
    await sendEmail({ to, subject: ticketSubject, html: ticketHtml });
  } catch {
    // Swallowed by design: support submission succeeds regardless of mail state.
  }
}
