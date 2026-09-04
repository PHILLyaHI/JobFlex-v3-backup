// Derives scripts/migrate-v2/pgclient.prisma from prisma/schema.prisma by swapping
// the datasource block to PostgreSQL and pointing the generator at a private output
// directory. The generated client is used by the legacy-import tool for BOTH sides:
//
//   reader -> the old JobFlex Neon DB, via $queryRawUnsafe only (raw SQL is not
//             validated against this schema, so the reader sees the live catalogue
//             exactly as it is — which matters, because the old app patches its DB
//             outside Prisma's migration ledger)
//   writer -> the v3 production Neon DB, typed model writes
//
// The custom `output` makes Prisma copy its runtime + query engine into that folder,
// so this never touches node_modules/.prisma/client and never races `next dev`
// (the Windows EPERM / query_engine .tmp* failure mode).
//
// Single source of truth stays prisma/schema.prisma. Both generated artifacts are
// gitignored. Same trick as scripts/prisma-production-schema.js.
const fs = require("fs");
const path = require("path");

const schemaPath = path.join(__dirname, "..", "..", "prisma", "schema.prisma");
const outPath = path.join(__dirname, "pgclient.prisma");

const source = fs.readFileSync(schemaPath, "utf8");

const datasourceBlock = /datasource db \{[\s\S]*?\n\}/;
const generatorBlock = /generator client \{[\s\S]*?\n\}/;

if (!datasourceBlock.test(source)) {
  throw new Error("Could not find datasource block in prisma/schema.prisma");
}
if (!generatorBlock.test(source)) {
  throw new Error("Could not find generator block in prisma/schema.prisma");
}

// url/directUrl are placeholders: the tool always passes an explicit `datasourceUrl`
// to the PrismaClient constructor, so no env var is read at runtime. They exist only
// because `prisma generate` insists on a syntactically valid datasource.
const pgDatasource = `datasource db {
  provider = "postgresql"
  url      = env("MIGRATE_V2_PLACEHOLDER_URL")
}`;

const pgGenerator = `generator client {
  provider = "prisma-client-js"
  output   = "./.generated/pg-client"
}`;

const swapped = source.replace(datasourceBlock, pgDatasource).replace(generatorBlock, pgGenerator);

fs.writeFileSync(outPath, swapped);
console.log(`Wrote ${outPath} (postgresql datasource, client -> ./.generated/pg-client)`);
