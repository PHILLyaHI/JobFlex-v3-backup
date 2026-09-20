// ONE-OFF (2026-09-20): reseal Gmail grants stored as plain JSON.
//
// Organization.gmailTokensJson used to be written as JSON.stringify(tokens);
// since 2026-09-20 it is sealed with TOKEN_ENCRYPTION_KEY (lib/crypto/secretBox),
// the box that already keeps Stripe and Square secrets. This walks every org,
// reports the ones still in plain JSON, and with --fix reseals them in place.
// A row that cannot be parsed is reported and left alone.
//
//   npx tsx --tsconfig tsconfig.json scripts/gmail-tokens-encrypt.ts          # dry run
//   npx tsx --tsconfig tsconfig.json scripts/gmail-tokens-encrypt.ts --fix    # reseal
//
// Needs DATABASE_URL of the target database and its TOKEN_ENCRYPTION_KEY in
// the environment. Prints org ids and a masked address, never a token.
import { db } from "../src/lib/db";
import { isSecretBoxConfigured } from "../src/lib/crypto/secretBox";
import { isLegacyPlainTokens, openGmailTokens, sealGmailTokens } from "../src/lib/sdk/gmail";

const fix = process.argv.includes("--fix");
const mask = (email: string) => {
  const [u, d] = email.split("@");
  return `${(u ?? "").slice(0, 2)}…@${d ?? ""}`;
};

async function main() {
  const rows = await db.organization.findMany({
    where: { gmailTokensJson: { not: null } },
    select: { id: true, name: true, gmailTokensJson: true },
  });
  const plain = rows.filter((r) => isLegacyPlainTokens(r.gmailTokensJson));
  console.log(`${rows.length} org(s) hold a Gmail grant; ${plain.length} still in plain JSON.`);
  if (plain.length === 0) return;
  if (!isSecretBoxConfigured()) {
    console.log("TOKEN_ENCRYPTION_KEY is not set (or not 32 bytes) — nothing can be sealed.");
    process.exitCode = 1;
    return;
  }
  let sealed = 0;
  for (const r of plain) {
    const tokens = openGmailTokens(r.gmailTokensJson);
    if (!tokens) {
      console.log(`  ${r.id}  ${r.name}  — unreadable, left as is`);
      continue;
    }
    console.log(`  ${r.id}  ${r.name}  ${mask(tokens.email)}  ${fix ? "→ sealing" : "(plain)"}`);
    if (fix) {
      await db.organization.update({ where: { id: r.id }, data: { gmailTokensJson: sealGmailTokens(tokens) } });
      sealed++;
    }
  }
  console.log(fix ? `Sealed ${sealed} row(s).` : "Dry run — pass --fix to reseal.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
