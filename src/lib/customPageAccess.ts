// THE CUSTOM PLAN'S PAGE GATE — the server half.
//
// A custom-plan org paid for the base workspace plus the add-on pages it
// picked (lib/customPlan). The selection lives in SyncState
// `orgPages:<orgId>` and is the source of truth: Stripe's page quantity and
// metadata follow it (lib/customBilling), never the other way round.
//
// THREE DOORS, ONE ANSWER (owner, 2026-10-06 — the audit found the layouts
// were the only door that asked):
//   · the layouts (src/app/dashboard/layout.tsx, src/app/(dashboard)/layout.tsx,
//     src/app/(mobile)/layout.tsx) draw the offer at a blocked URL and hand
//     the list to the nav (getBlockedCustomPages — courtesy, fail-open once);
//   · every page server component of an add-on calls customPageGate
//     (components/v3/upgrade-gate/custom-page-gate) BEFORE it loads anything,
//     so a client-side navigation, which skips the layout, still loads no data;
//   · every server action and API route of an add-on calls requirePage — the
//     boundary. It fails CLOSED: an unreadable plan is a refusal.
// The middleware takes no part: it is edge-runtime and cannot read the DB.

import { db } from "@/lib/db";
import {
  CUSTOM_PAGES,
  blockedCustomHrefs,
  normalizeCustomPages,
  type CustomPageId,
} from "@/lib/customPlan";

/** The error an add-on's server code throws for an org that did not buy it. */
export class CustomPageLockedError extends Error {
  readonly code = "CUSTOM_PAGE_LOCKED";
  constructor(readonly page: CustomPageId) {
    const label = CUSTOM_PAGES.find((p) => p.id === page)?.label ?? "This page";
    super(`${label} isn't in your plan.`);
    this.name = "CustomPageLockedError";
  }
}

export function isCustomPageLockedError(err: unknown): err is CustomPageLockedError {
  return err instanceof Error && (err as { code?: string }).code === "CUSTOM_PAGE_LOCKED";
}

/** The org's pages: null when the org is not on the custom plan, else the
 *  pages it holds. Throws when the plan cannot be read — callers that must
 *  fail closed (requirePage) let it propagate. */
export async function readCustomPages(organizationId: string): Promise<string[] | null> {
  const sub = await db.subscription.findUnique({ where: { organizationId }, select: { plan: true } });
  if ((sub?.plan ?? "").toUpperCase() !== "CUSTOM") return null;
  const row = await db.syncState.findUnique({ where: { key: `orgPages:${organizationId}` } });
  if (!row) return [];
  try {
    return normalizeCustomPages(JSON.parse(row.cursor) as string[]);
  } catch {
    return [];
  }
}

/**
 * The hrefs this org may NOT open, or null when the org is not on the custom
 * plan — null, not [], so callers can tell "unrestricted" from "bought
 * everything" without a second read. For the layouts and the nav.
 *
 * One retry: dev SQLite throws transient "database is locked" under a
 * dashboard's burst of parallel reads. Two misses in a row read as
 * unrestricted HERE — a layout that bricks every org on a flaky DB is worse —
 * because the page gate and requirePage below fail closed behind it.
 */
export async function getBlockedCustomPages(
  organizationId: string | null | undefined,
): Promise<string[] | null> {
  if (!organizationId) return null;
  const pages = await readCustomPages(organizationId).catch(() =>
    readCustomPages(organizationId).catch(() => null),
  );
  return pages === null ? null : blockedCustomHrefs(pages);
}

/** True when the org is on the custom plan and holds NONE of `pages`.
 *  Fails closed: an unreadable plan counts as locked (one retry first). */
export async function isPageLocked(
  organizationId: string,
  pages: CustomPageId | readonly CustomPageId[],
): Promise<boolean> {
  const wanted = typeof pages === "string" ? [pages] : pages;
  let owned: string[] | null;
  try {
    owned = await readCustomPages(organizationId).catch(() => readCustomPages(organizationId));
  } catch {
    return true;
  }
  if (owned === null) return false;
  return !wanted.some((p) => owned!.includes(p));
}

/**
 * THE SERVER BOUNDARY. Throws CustomPageLockedError when the org is on the
 * custom plan and holds none of `pages` (an array is "any of" — the HVAC
 * estimator reads the fence's lot lookup, the video estimator runs Smart
 * Proposal's engine). Every server action and API route of an add-on calls
 * this right after it resolves the org.
 */
export async function requirePage(
  organizationId: string,
  pages: CustomPageId | readonly CustomPageId[],
): Promise<void> {
  if (await isPageLocked(organizationId, pages)) {
    throw new CustomPageLockedError(typeof pages === "string" ? pages : pages[0]);
  }
}

/** For API routes: the 403 a locked add-on answers with, or null to go on. */
export async function pageLockedResponse(
  organizationId: string,
  pages: CustomPageId | readonly CustomPageId[],
): Promise<Response | null> {
  if (!(await isPageLocked(organizationId, pages))) return null;
  const err = new CustomPageLockedError(typeof pages === "string" ? pages : pages[0]);
  return Response.json({ ok: false, error: err.message, code: err.code }, { status: 403 });
}
