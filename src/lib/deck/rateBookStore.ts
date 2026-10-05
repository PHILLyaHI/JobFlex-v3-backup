import "server-only";
// The shop's deck price book, where it is kept (2026-10-04): SyncState under
// `deckbook:<orgId>` — no table of its own, so nothing has to be pushed to
// production by hand. Server only, and NOT in the "use server" actions file:
// an export there is callable from any browser with any organization id.
import { db } from "@/lib/db";
import { sanitizeDeckRateBook, type DeckRateBook } from "./rates";

export const deckBookKey = (organizationId: string) => `deckbook:${organizationId}`;

/** The shop's deck prices, as saved — an empty book when none is, never an error. */
export async function readDeckRateBook(organizationId: string): Promise<DeckRateBook> {
  try {
    const row = await db.syncState.findUnique({ where: { key: deckBookKey(organizationId) }, select: { cursor: true } });
    return row?.cursor ? sanitizeDeckRateBook(JSON.parse(row.cursor)) : {};
  } catch {
    return {};
  }
}
