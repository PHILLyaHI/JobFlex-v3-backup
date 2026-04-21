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

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
