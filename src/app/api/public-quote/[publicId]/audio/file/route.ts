// GET /api/public-quote/[publicId]/audio/file?v=<hash> — the spoken
// summary's MP3, served from the database (ProposalAudio). The hash in the
// URL is the script's, so a file is immutable at its address and cached for
// a year; a stale address answers 404 and the player asks the audio route
// again. Byte ranges are honoured — iPhones ask for them before they play.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await ctx.params;
  const v = new URL(req.url).searchParams.get("v") ?? "";
  if (!publicId || !/^[0-9a-f]{16}$/.test(v)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const row = await db.proposal.findUnique({
    where: { publicId },
    select: { organization: { select: { deletedAt: true } }, audio: { select: { hash: true, bytes: true } } },
  });
  if (!row || row.organization.deletedAt || !row.audio || row.audio.hash !== v) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const bytes = Buffer.from(row.audio.bytes);
  const headers: Record<string, string> = {
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, bytes.length - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
    if (!Number.isFinite(start) || start < 0 || start > end || start >= bytes.length) {
      return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${bytes.length}` } });
    }
    const slice = bytes.subarray(start, end + 1);
    return new Response(new Uint8Array(slice), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${bytes.length}`, "Content-Length": String(slice.length) },
    });
  }
  return new Response(new Uint8Array(bytes), { status: 200, headers: { ...headers, "Content-Length": String(bytes.length) } });
}
