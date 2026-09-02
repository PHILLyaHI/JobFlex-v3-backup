import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const useAccelerate = process.env.DATABASE_URL?.startsWith("prisma://");

export const db =
  globalForPrisma.prisma ??
  (useAccelerate
    ? (new PrismaClient().$extends(withAccelerate()) as unknown as PrismaClient)
    : new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
      }));

// Cached on globalThis in EVERY environment. In production a warm serverless
// instance re-evaluates modules across invocations; without the global cache
// each one could mint a fresh PrismaClient (and its own connection pool)
// against Neon's connection ceiling.
globalForPrisma.prisma = db;
