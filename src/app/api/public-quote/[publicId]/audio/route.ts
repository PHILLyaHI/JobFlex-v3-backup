// GET /api/public-quote/[publicId]/audio — "Listen to this proposal".
//
// The spoken summary of a proposal for the client portal's play button and
// the contractor's "Listen" on the proposal line. Answers with the script
// and, when a voice is configured, the URL of the MP3 read from it:
//   { ok, script, seconds, url | null, mode: "audio" | "device", why? }
// A cache hit is one read and no limits. A miss spends real money on a
// public route, so only misses are rate-limited — and a limited or failed
// miss still answers with the script, which the device reads itself, and
// says why there is no file: "no-openai" (no key configured), "limited", or
// "failed" (every voice model refused — see the server log).
//
// A client's play is written to the feed once every twelve hours
// ("Rick listened to the proposal"); the company's own members listening
// from the proposals page are not counted, like their own opens, and
// neither is a `?probe=1` call from a check.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { HOUR, ipFromRequest, rateLimitShared } from "@/lib/rateLimit";
import { canSynthesize, generateProposalAudio, isAudioFresh, lastAudioFailure, loadAudioRow, speechFor, type AudioRow } from "@/lib/proposalAudio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A voice model plus the upload can take a while on a cold miss.
export const maxDuration = 60;

const LISTENED_EVERY_MS = 12 * HOUR;
const GENERATE_TIMEOUT_MS = 40_000;

export async function GET(req: Request, ctx: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await ctx.params;
  if (!publicId || publicId.length < 3) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const probe = new URL(req.url).searchParams.get("probe") === "1";
  const row = await loadAudioRow({ publicId });
  if (!row || row.organization.deletedAt) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  let script: string;
  let hash: string;
  let seconds: number;
  try {
    ({ script, hash, seconds } = speechFor(row));
  } catch (err) {
    console.error(`[proposalAudio] script failed for ${publicId}: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({ ok: false, error: "This proposal can't be read aloud." }, { status: 422 });
  }
  const base = { ok: true as const, script, seconds, hash, title: row.title, org: row.organization.name ?? "" };
  const headers = { "Cache-Control": "no-store" };

  // Cache hit: the file was read from exactly these words.
  if (isAudioFresh(row, hash)) {
    if (!probe) await noteListened(row, req);
    return NextResponse.json({ ...base, url: row.audioUrl, mode: "audio" }, { headers });
  }
  // No voice configured: the device reads the script.
  if (!canSynthesize()) {
    if (!probe) await noteListened(row, req);
    return NextResponse.json({ ...base, url: null, mode: "device", why: "no-openai" }, { headers });
  }
  // Cache miss on a public route — per client and per proposal limits, and
  // a limited play still gets the script.
  const ip = ipFromRequest(req);
  const perIp = await rateLimitShared(`quote-audio:${ip}`, 12, HOUR);
  const perProposal = perIp.ok ? await rateLimitShared(`quote-audio-p:${publicId}`, 6, HOUR) : perIp;
  if (!perIp.ok || !perProposal.ok) {
    if (!probe) await noteListened(row, req);
    return NextResponse.json({ ...base, url: null, mode: "device", why: "limited" }, { headers });
  }
  const url = await Promise.race([
    generateProposalAudio(row, script, hash),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), GENERATE_TIMEOUT_MS)),
  ]);
  if (!probe) await noteListened(row, req);
  // A probe also learns what each voice model answered — the only window
  // into a failure without the server log.
  return NextResponse.json(
    url ? { ...base, url, mode: "audio" } : { ...base, url: null, mode: "device", why: "failed", ...(probe ? { errors: lastAudioFailure() } : {}) },
    { headers },
  );
}

/** The feed line for a client's play — not for the company's own members. */
async function noteListened(row: AudioRow, req: Request): Promise<void> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (userId) {
      const own = await db.membership.findFirst({ where: { userId, organizationId: row.organizationId }, select: { id: true } });
      if (own) return;
    }
    const since = new Date(Date.now() - LISTENED_EVERY_MS);
    const said = await db.activityEvent.findFirst({ where: { proposalId: row.id, kind: "LISTENED", createdAt: { gte: since } }, select: { id: true } });
    if (said) return;
    await db.activityEvent.create({
      data: {
        organizationId: row.organizationId,
        proposalId: row.id,
        clientId: row.clientId,
        kind: "LISTENED",
        summary: `${row.client?.name ?? "The client"} listened to "${row.title}"`,
        meta: JSON.stringify({ ip: ipFromRequest(req) }),
      },
    });
  } catch (err) {
    console.warn(`[proposalAudio] listened note skipped: ${err instanceof Error ? err.message : String(err)}`);
  }
}
