// Connection factory for the legacy-import tool.
//
// reader — the OLD JobFlex Neon Postgres. Used ONLY through $queryRawUnsafe: raw
//   SQL is not validated against the schema this client was generated from, so the
//   reader sees the live catalogue exactly as it is. The old app patches its own DB
//   on every deploy (scripts/ensure-missing-tables.js) outside Prisma's ledger, so
//   its schema.prisma is not a description of the live database.
//
// writer — the target. `--target prod` is the v3 Neon DB (use the NON-POOLING url:
//   PgBouncer plus Prisma interactive transactions is a known failure pair);
//   `--target local` is the repo's own SQLite dev.db through @prisma/client.
//
// Neither URL is ever read from a file. Both are passed inline via env at the
// command line and handed to the constructor as `datasourceUrl`.
import { PrismaClient as PgPrismaClient } from "./.generated/pg-client";

export type Reader = PgPrismaClient;
/** The writer exposes the same models on both providers; the pg client types them. */
export type Writer = PgPrismaClient;

let reader: PgPrismaClient | null = null;
let writer: Writer | null = null;

export function oldUrl(): string {
  const url = process.env.OLD_DATABASE_URL;
  if (!url) throw new Error("OLD_DATABASE_URL is required (pass it inline on the command line)");
  if (!/^postgres(ql)?:\/\//.test(url)) throw new Error("OLD_DATABASE_URL must be a postgres:// url");
  return url;
}

export function getReader(): PgPrismaClient {
  if (!reader) reader = new PgPrismaClient({ datasourceUrl: oldUrl(), log: ["error"] });
  return reader;
}

/**
 * The target. `prod` is the v3 Neon DB through the Postgres client generated here;
 * `local` is the repo's own SQLite dev.db through the app's @prisma/client. Both
 * expose the same models, so every phase is written once.
 */
export async function getWriter(target: "local" | "prod"): Promise<Writer> {
  if (writer) return writer;
  const url = process.env.TARGET_DATABASE_URL;
  if (!url) throw new Error("TARGET_DATABASE_URL is required (pass it inline on the command line)");
  if (target === "prod") {
    if (!/^postgres(ql)?:\/\//.test(url)) throw new Error("--target prod needs a postgres:// TARGET_DATABASE_URL");
    if (/-pooler\./.test(url)) {
      throw new Error("Use the NON-POOLING url: PgBouncer breaks Prisma interactive transactions");
    }
    writer = new PgPrismaClient({ datasourceUrl: url, log: ["error"] });
    return writer;
  }
  if (!url.startsWith("file:")) throw new Error("--target local needs a file: TARGET_DATABASE_URL");
  const { PrismaClient } = await import("@prisma/client");
  writer = new PrismaClient({ datasourceUrl: url, log: ["error"] }) as unknown as Writer;
  return writer;
}

export async function disconnectAll(): Promise<void> {
  if (reader) await reader.$disconnect();
  if (writer) await writer.$disconnect();
  reader = null;
  writer = null;
}

/** JSON.stringify replacer: raw Postgres counts come back as BigInt. */
export function jsonSafe(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? Number(value) : value;
}
