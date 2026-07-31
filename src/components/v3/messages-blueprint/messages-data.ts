// Messages blueprint — the shapes the page's server component reads out of the
// database and hands to the behavior module.
//
// This file USED to carry the donor's demo fixture (a TEAM array and five seeded
// conversations that were mutated in memory, so every sent message vanished on
// navigation). The page now reads real conversations, real participants and real
// messages in src/app/dashboard/messages/page.tsx and writes through the server
// actions in src/actions/messages.ts, so only the types survive.
//
// The mobile port keeps its own copy of the old fixture at
// src/app/(mobile)/mobile-messages-v2/messages-data.ts — it is not affected.

/** A teammate who can be added to a new conversation. `id` is a User id, which
 *  is what `createConversation` validates against this org's membership. */
export type Member = {
  id: string;
  name: string;
  /** Human label ("Installer", "Estimator") — already passed through roleLabel. */
  role: string;
};

export type Msg = {
  /** Message row id, or a `tmp-*` id while an optimistic send is on the wire. */
  id: string;
  /** Author's display name; used for the group-thread run header. */
  who: string;
  /** Written by the viewer. */
  me: boolean;
  /** createdAt, epoch ms. The "Today" divider and the "7:42 AM" stamp are
   *  formatted from this on the client, so a message sent right now is labelled
   *  by exactly the same rules as one read back from the database. */
  ts: number;
  body: string;
};

export type Conv = {
  /** Conversation row id — the argument every server action on this page takes. */
  id: string;
  /** Prisma stores DIRECT | GROUP | JOB; JOB is folded into GROUP for display. */
  kind: "DIRECT" | "GROUP";
  /** Already resolved per-viewer: a 1:1 thread is named after the OTHER person. */
  title: string;
  /** Linked job's title, or null. */
  job: string | null;
  /** Unread-for-this-viewer count, from getUnreadByConversation. */
  unread: number;
  /**
   * Last activity, epoch ms (falls back to the thread's createdAt when it has no
   * messages yet). The rail sorts on this and nothing else.
   *
   * Unread used to be the primary sort key, which made the list reorder itself
   * as a direct result of reading it: opening a thread cleared its unread count,
   * so the row just clicked slid down past everything still unread. Recency has
   * no such feedback loop — reading a message does not change when it arrived.
   */
  ts: number;
  msgs: Msg[];
};

export type MessagesSeed = {
  conversations: Conv[];
  team: Member[];
  /** The viewer's display name — stamped on messages they send. */
  meName: string;
  /** Conversation to open on arrival (`?c=` or the newest thread), or null. */
  activeId: string | null;
};
