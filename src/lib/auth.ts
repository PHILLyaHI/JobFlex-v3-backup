import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      activeOrgId?: string | null;
      role?: string | null;
      orgName?: string | null;
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
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!user?.email) return false;
      if (account?.provider === "google") {
        const existing = await db.user.findUnique({ where: { email: user.email } });
        if (!existing) {
          await db.user.create({
            data: {
              email: user.email,
              name: user.name,
              image: user.image,
            },
          });
        }
      }
      return true;
    },
    async jwt({ token, user }) {
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
          const m = dbUser.memberships[0];
          token.activeOrgId = dbUser.activeOrgId ?? m?.organizationId ?? null;
          token.role = m?.role ?? null;
          token.orgName = m?.organization?.name ?? null;
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
      }
      return session;
    },
  },
});
