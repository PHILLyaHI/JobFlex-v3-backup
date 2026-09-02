import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { slugify, uniqueOrgSlug } from "@/lib/orgSlug";
import { clientIp, rateLimitShared, MINUTE } from "@/lib/rateLimit";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      activeOrgId?: string | null;
      role?: string | null;
      orgName?: string | null;
      // Discriminates an app USER (org member) from a platform INFLUENCER
      // (separate login, no org). The JWT identifies WHO; server guards
      // re-read the DB to authorize WHAT (defends against the 7-day stale JWT).
      principal?: string | null;
      influencerId?: string | null;
      // Credential epoch stamped at sign-in; requireUser rejects the session when
      // it drifts from the DB (password reset bumps it). Absent on pre-existing
      // JWTs → treated as 0, which matches a never-reset user.
      credentialVersion?: number | null;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/auth/login" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const email = String(raw?.email ?? "").toLowerCase().trim();
        const password = String(raw?.password ?? "");
        if (!email || !password) return null;
        // Cross-instance brake on credential stuffing / bcrypt CPU burn. The
        // same "wrong credentials" answer, so a refused attempt looks like a miss.
        const ip = await clientIp();
        const [byIp, byEmail] = await Promise.all([
          rateLimitShared(`login:ip:${ip}`, 30, MINUTE),
          rateLimitShared(`login:email:${email}`, 8, 15 * MINUTE),
        ]);
        if (!byIp.ok || !byEmail.ok) return null;
        const user = await db.user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, image: true, hashedPassword: true, activeOrgId: true },
        });
        if (!user?.hashedPassword) return null;
        const ok = await bcrypt.compare(password, user.hashedPassword);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
    // The signup hand-off. A User created by completePendingSignup (after a
    // paid Stripe checkout) is signed in with a single-use ticket instead of
    // being sent to the login wall — see lib/signinTicket.ts. No password
    // crosses the wire and no rate-limit bypass exists: a ticket is spent on
    // first presentation and lives five minutes.
    Credentials({
      id: "signup-ticket",
      name: "Signup ticket",
      credentials: { ticket: { label: "Ticket", type: "text" } },
      async authorize(raw) {
        const ticket = String(raw?.ticket ?? "");
        if (!ticket) return null;
        const ip = await clientIp();
        const byIp = await rateLimitShared(`signup-ticket:ip:${ip}`, 20, MINUTE);
        if (!byIp.ok) return null;
        const { consumeSigninTicket } = await import("@/lib/signinTicket");
        const userId = await consumeSigninTicket(ticket);
        if (!userId) return null;
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, name: true, image: true },
        });
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
    // Separate influencer login surface, same NextAuth instance. Authenticates
    // against the Influencer table (not User), so it carries no org/membership.
    Credentials({
      id: "influencer",
      name: "Influencer",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const email = String(raw?.email ?? "").toLowerCase().trim();
        const password = String(raw?.password ?? "");
        if (!email || !password) return null;
        // Cross-instance brake on credential stuffing / bcrypt CPU burn. The
        // same "wrong credentials" answer, so a refused attempt looks like a miss.
        const ip = await clientIp();
        const [byIp, byEmail] = await Promise.all([
          rateLimitShared(`login:ip:${ip}`, 30, MINUTE),
          rateLimitShared(`login:email:${email}`, 8, 15 * MINUTE),
        ]);
        if (!byIp.ok || !byEmail.ok) return null;
        const inf = await db.influencer.findUnique({
          where: { email },
          select: { id: true, email: true, displayName: true, hashedPassword: true, status: true },
        });
        if (!inf?.hashedPassword) return null;
        // Suspended/terminated influencers cannot obtain a session at all
        // (guards also re-check status on every privileged call).
        if (inf.status === "SUSPENDED" || inf.status === "TERMINATED") return null;
        const ok = await bcrypt.compare(password, inf.hashedPassword);
        if (!ok) return null;
        return { id: inf.id, email: inf.email, name: inf.displayName };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!user?.email) return false;
      if (account?.provider === "google") {
        const email = user.email;
        const existing = await db.user.findUnique({
          where: { email },
          select: { id: true, hashedPassword: true },
        });
        if (existing) {
          // A password-based account already owns this email — don't let Google
          // silently adopt it (pre-account-takeover defense). They can sign in
          // with their password; linking Google to a password account is a
          // future feature. A passwordless (Google-created) account is fine.
          if (existing.hashedPassword) return false;
          return true;
        }
        // First Google sign-in → provision a usable workspace so the user isn't
        // an org-less orphan (mirrors registerAccount: Org + OWNER Membership).
        const firstName = user.name?.trim().split(" ")[0];
        const orgName = firstName ? `${firstName}'s workspace` : "My workspace";
        const slug = await uniqueOrgSlug(slugify(user.name ?? email.split("@")[0] ?? "workspace"));
        try {
          const orgId = await db.$transaction(async (tx) => {
            const org = await tx.organization.create({
              data: { name: orgName, slug, billingEmail: email },
              select: { id: true },
            });
            const created = await tx.user.create({
              data: { email, name: user.name, image: user.image, activeOrgId: org.id },
              select: { id: true },
            });
            await tx.membership.create({
              data: { userId: created.id, organizationId: org.id, role: "OWNER" },
            });
            return org.id;
          });
          // Best-effort attribution bind — Google signups never pass through
          // registerAccount, so the ?promo/?ref capture cookie is read here
          // (this callback runs in the auth route handler, where cookies() works).
          try {
            const { bindAttributionToOrg, readAttributionCookie } = await import("@/lib/attribution");
            const captured = await readAttributionCookie();
            if (captured) await bindAttributionToOrg(orgId, email, captured.k, captured.c);
          } catch {
            /* non-fatal — provisioning already succeeded */
          }
        } catch (e) {
          console.error("[auth] Google account provisioning failed:", e);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      // Influencer login (separate Credentials provider) — no org/membership lookup.
      if (account?.provider === "influencer" && user) {
        token.id = user.id;
        token.principal = "INFLUENCER";
        token.influencerId = user.id;
        token.activeOrgId = null;
        token.role = null;
        token.orgName = null;
        return token;
      }
      if (user?.email) {
        const dbUser = await db.user.findUnique({
          where: { email: user.email },
          include: {
            memberships: {
              include: { organization: { select: { id: true, name: true } } },
              orderBy: { createdAt: "asc" },
              take: 1,
            },
          },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.principal = "USER";
          token.influencerId = null;
          token.cv = dbUser.credentialVersion ?? 0;
          const m = dbUser.memberships[0];
          token.activeOrgId = dbUser.activeOrgId ?? m?.organizationId ?? null;
          token.role = m?.role ?? null;
          token.orgName = m?.organization?.name ?? null;
          token.orgCheckedAt = Date.now();
        }
      }

      // Keep the org claims honest between logins. The role/org above were
      // stamped at sign-in and otherwise live for the JWT's 7 days — so a role
      // change (promotion, demotion, org switch) left middleware's route-gate
      // enforcing the OLD role until the user signed out. Server guards always
      // re-read the DB, but the middleware gate bounced every nav click to the
      // stale role's home page. Re-read the membership on a short TTL so the
      // token converges within a minute of any role change.
      if (!user && token.principal !== "INFLUENCER" && token.id) {
        const checkedAt = typeof token.orgCheckedAt === "number" ? token.orgCheckedAt : 0;
        if (Date.now() - checkedAt > 60_000) {
          const dbUser = await db.user.findUnique({
            where: { id: String(token.id) },
            include: {
              memberships: {
                include: { organization: { select: { id: true, name: true } } },
                orderBy: { createdAt: "asc" },
              },
            },
          });
          // Revocation is decided HERE, not healed here. The credential epoch
          // (`cv`) is stamped once at sign-in and must never be rewritten from
          // the DB on refresh — doing so made every stolen token valid again
          // within a minute of a password reset (requireUser compared the DB
          // value against a copy of itself). A drift, or a deleted user, ends
          // the session: returning null clears the cookie on route-handler
          // paths and yields no session in RSC/server actions.
          if (!dbUser) return null;
          const stampedCv = typeof token.cv === "number" ? token.cv : 0;
          if ((dbUser.credentialVersion ?? 0) !== stampedCv) return null;
          const m =
            dbUser.memberships.find((x) => x.organizationId === dbUser.activeOrgId) ??
            dbUser.memberships[0];
          token.activeOrgId = dbUser.activeOrgId ?? m?.organizationId ?? null;
          token.role = m?.role ?? null;
          token.orgName = m?.organization?.name ?? null;
          token.orgCheckedAt = Date.now();
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? "");
        session.user.activeOrgId = (token.activeOrgId as string | null) ?? null;
        session.user.role = (token.role as string | null) ?? null;
        session.user.orgName = (token.orgName as string | null) ?? null;
        // Default to USER so pre-existing JWTs (issued before this field) behave.
        session.user.principal = (token.principal as string | null) ?? "USER";
        session.user.influencerId = (token.influencerId as string | null) ?? null;
        session.user.credentialVersion = (token.cv as number | null) ?? 0;
      }
      return session;
    },
  },
});
