"use server";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { slugify, uniqueOrgSlug } from "@/lib/orgSlug";

// Public, unauthenticated auth actions: self-serve registration and the
// forgot/reset-password flow. These run BEFORE the caller has a session, so they
// authenticate only by what's in the request (email + password, or a reset
// token) — never by session/role.
//
// Security posture mirrors the hardened worker-invite flow:
//   • reset tokens are stored HASHED (sha256) — a DB leak yields no usable links
//   • tokens are single-use and expire after 1 hour
//   • requestPasswordReset never reveals whether an email exists (anti-enumeration)
//   • resetPassword returns ONE generic message for missing/expired/unknown so a
//     token can't be probed for its state

const RESET_TTL_MS = 1000 * 60 * 60; // 1 hour

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

// ── Register ─────────────────────────────────────────────────────────────────
const registerSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  businessName: z.string().trim().min(1, "Enter your business name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

/**
 * Create a brand-new workspace: Organization + owner User (hashed password) +
 * OWNER Membership, atomically. Does NOT sign the user in — the client calls
 * next-auth's signIn afterward so redirect/error handling stays on the client.
 */
export async function registerAccount(raw: unknown): Promise<{ ok: true }> {
  const data = registerSchema.parse(raw);

  // Registration legitimately can't hide that an email is taken (you can't make a
  // duplicate), so steer them to sign in rather than fail opaquely.
  const existing = await db.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existing) {
    throw new Error("That email is already registered. Try signing in instead.");
  }

  const slug = await uniqueOrgSlug(slugify(data.businessName));
  const hashedPassword = await bcrypt.hash(data.password, 10);

  let userId: string;
  let orgId: string;
  try {
    const created = await db.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: data.businessName, slug, billingEmail: data.email },
        select: { id: true },
      });
      const user = await tx.user.create({
        data: {
          email: data.email,
          name: data.name,
          hashedPassword,
          activeOrgId: org.id,
        },
        select: { id: true },
      });
      await tx.membership.create({
        data: { userId: user.id, organizationId: org.id, role: "OWNER" },
      });
      return { orgId: org.id, userId: user.id };
    });
    orgId = created.orgId;
    userId = created.userId;
  } catch (e: unknown) {
    // Unique-constraint race (e.g. the email was taken between the check above
    // and the insert). Map the email collision to the friendly message.
    const code = (e as { code?: string })?.code;
    const target = String((e as { meta?: { target?: unknown } })?.meta?.target ?? "");
    if (code === "P2002" && (target.includes("email") || target.toLowerCase().includes("user"))) {
      throw new Error("That email is already registered. Try signing in instead.");
    }
    if (code === "P2002") {
      throw new Error("Couldn't create your workspace — please try again.");
    }
    throw e;
  }

  // Best-effort activity stamp — never block account creation on the feed.
  try {
    await db.activityEvent.create({
      data: {
        organizationId: orgId,
        actorId: userId,
        kind: "CREATED",
        summary: `${data.name} created the ${data.businessName} workspace`,
      },
    });
  } catch {
    /* non-fatal */
  }

  return { ok: true };
}

// ── Forgot password (request a reset link) ───────────────────────────────────
const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

/**
 * Mint a single-use reset token and email it. ALWAYS resolves the same way
 * whether or not the email maps to an account, so this endpoint can't be used to
 * enumerate which emails are registered.
 */
export async function requestPasswordReset(raw: unknown): Promise<{ ok: true }> {
  const parsed = forgotSchema.safeParse(raw);
  if (!parsed.success) return { ok: true }; // bad input → same generic success
  const email = parsed.data.email;

  const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (user) {
    // Invalidate any prior links for this email, then mint one fresh token.
    // Only the sha256 hash is stored; the raw token lives only in the email.
    await db.verificationToken.deleteMany({ where: { identifier: email } });
    const rawToken = randomBytes(32).toString("hex");
    await db.verificationToken.create({
      data: {
        identifier: email,
        token: sha256(rawToken),
        expires: new Date(Date.now() + RESET_TTL_MS),
      },
    });

    try {
      const { sendEmail } = await import("@/lib/sdk/resend");
      const { wrapEmail } = await import("@/lib/email/render");
      const link = `${appUrl()}/auth/reset?token=${rawToken}`;
      const first = user.name?.split(" ")[0] ?? "there";
      const wrapped = wrapEmail({
        subject: "Reset your JobFlex password",
        // The "Label:" line + URL line render as a Pressed-Sage CTA button.
        body: `Hi ${first},

We received a request to reset the password for your JobFlex account.

Reset your password:
${link}

This link expires in 1 hour. If you didn't request it, you can safely ignore this email — your password won't change.

— JobFlex`,
        orgName: "JobFlex",
      });
      await sendEmail({ to: email, subject: wrapped.subject, html: wrapped.html });
    } catch (err) {
      // Don't leak send failures to the caller — log and still resolve generic.
      console.warn("[requestPasswordReset] email failed:", err);
    }
  }

  return { ok: true };
}

// ── Reset password (consume the token) ───────────────────────────────────────
const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

const INVALID_LINK = "This reset link is invalid or has expired. Request a new one.";

/**
 * Validate a reset token and set a new password. One generic error for every
 * failure mode (missing / expired / no matching user) so a token can't be probed.
 * The token is single-use: it and any siblings for the email are deleted on use.
 */
export async function resetPassword(raw: unknown): Promise<{ ok: true }> {
  const data = resetSchema.parse(raw);
  const tokenHash = sha256(data.token);
  // Hash the new password BEFORE the transaction so the bcrypt cost (slow, CPU)
  // never holds the DB transaction open.
  const hashedPassword = await bcrypt.hash(data.password, 10);

  // Validate the token, write the new password, and burn the token atomically so
  // a concurrent reset/request can't interleave (no partial state, no replay).
  const actor = await db.$transaction(async (tx) => {
    const record = await tx.verificationToken.findUnique({ where: { token: tokenHash } });
    if (!record || record.expires < new Date()) throw new Error(INVALID_LINK);

    const user = await tx.user.findUnique({
      where: { email: record.identifier },
      select: { id: true, activeOrgId: true },
    });
    if (!user) throw new Error(INVALID_LINK);

    await tx.user.update({ where: { id: user.id }, data: { hashedPassword } });
    // Single-use: burn this token and any other live links for the same email.
    await tx.verificationToken.deleteMany({ where: { identifier: record.identifier } });
    return { userId: user.id, activeOrgId: user.activeOrgId };
  });

  // Best-effort audit trail so a password reset is never silent (org-scoped).
  if (actor.activeOrgId) {
    try {
      await db.activityEvent.create({
        data: {
          organizationId: actor.activeOrgId,
          actorId: actor.userId,
          kind: "PASSWORD_RESET",
          summary: "Password was reset via email link",
        },
      });
    } catch {
      /* non-fatal */
    }
  }

  return { ok: true };
}
