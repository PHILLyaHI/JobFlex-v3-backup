import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const useAccelerate = process.env.DATABASE_URL?.startsWith("prisma://");

// NEON DROPS IDLE CONNECTIONS. On Vercel and on `npm run dev:pg` the first
// query after a pause can fail with `Error in PostgreSQL connection: Error {
// kind: Closed }` — the pooled socket was closed server-side and Prisma only
// notices on use. Everything upstream turned that into a generic failure: the
// login page showed "Auth error: Configuration" (2026-09-12, owner) because
// authorize() threw and Auth.js maps any non-client-safe error to that word.
// One retry on exactly that class of error fixes it; the reconnect is
// automatic on the second attempt. Nothing else is retried — a real query
// error is still a real error.
const CONNECTION_DROPPED = /kind: Closed|P1017|ECONNRESET|Connection terminated|server closed the connection|socket hang up|Connection reset by peer/i;
const droppedConnection = (e: unknown): boolean => CONNECTION_DROPPED.test(e instanceof Error ? e.message : String(e));

async function retryOnce<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (!droppedConnection(e)) throw e;
    console.warn("[db] connection dropped, retrying once:", (e as Error).message.slice(0, 120));
    return run();
  }
}

function withReconnectRetry(client: PrismaClient): PrismaClient {
  return client.$extends({
    query: {
      $allModels: {
        $allOperations({ args, query }) {
          return retryOnce(() => query(args));
        },
      },
      $queryRaw({ args, query }) {
        return retryOnce(() => query(args));
      },
      $queryRawUnsafe({ args, query }) {
        return retryOnce(() => query(args));
      },
      $executeRaw({ args, query }) {
        return retryOnce(() => query(args));
      },
      $executeRawUnsafe({ args, query }) {
        return retryOnce(() => query(args));
      },
    },
  }) as unknown as PrismaClient;
}

export const db =
  globalForPrisma.prisma ??
  (useAccelerate
    ? (new PrismaClient().$extends(withAccelerate()) as unknown as PrismaClient)
    : withReconnectRetry(
        new PrismaClient({
          log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
        }),
      ));

// Cached on globalThis in EVERY environment. In production a warm serverless
// instance re-evaluates modules across invocations; without the global cache
// each one could mint a fresh PrismaClient (and its own connection pool)
// against Neon's connection ceiling.
globalForPrisma.prisma = db;
