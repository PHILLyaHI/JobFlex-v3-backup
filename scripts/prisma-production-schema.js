// Derives prisma/schema.production.prisma from prisma/schema.prisma by swapping
// the datasource block from local-dev SQLite to Vercel/Neon Postgres. Run as part
// of the Vercel buildCommand (see vercel.json) — never run or commit locally.
// Single source of truth stays prisma/schema.prisma; this avoids maintaining two
// hand-edited copies of 54+ models that drift out of sync.
const fs = require("fs");
const path = require("path");

const schemaPath = path.join(__dirname, "..", "prisma", "schema.prisma");
const outPath = path.join(__dirname, "..", "prisma", "schema.production.prisma");

const source = fs.readFileSync(schemaPath, "utf8");

const productionDatasource = `datasource db {
  provider  = "postgresql"
  url       = env("POSTGRES_PRISMA_URL")
  directUrl = env("POSTGRES_URL_NON_POOLING")
}`;

const datasourceBlock = /datasource db \{[\s\S]*?\n\}/;
if (!datasourceBlock.test(source)) {
  throw new Error("Could not find datasource block in prisma/schema.prisma");
}

const swapped = source.replace(datasourceBlock, productionDatasource);
fs.writeFileSync(outPath, swapped);
console.log(`Wrote ${outPath} (postgresql datasource for Vercel/Neon)`);
