import { NextResponse } from "next/server";
import { readUploadTicket } from "@/lib/media/signedLink";
import { storageMode, writeLocalStream } from "@/lib/media/privateStore";

export const runtime = "nodejs";

// THE LOCAL FALLBACK'S UPLOAD (stage B, 2026-09-30) — development only. The
// ticket was minted by /api/crew/upload-ticket after it checked the caller
// against the job; it names the path, the type and the ceiling, signed and
// good for 30 minutes. The body is streamed to disk and cut off past the
// ceiling. On Vercel, or with the private store configured, this route is off.
export async function PUT(req: Request) {
  if (storageMode() !== "local") return NextResponse.json({ error: "Not available." }, { status: 404 });
  const ticket = readUploadTicket(new URL(req.url).searchParams.get("ticket") ?? "");
  if (!ticket) return NextResponse.json({ error: "The upload link has expired — try again." }, { status: 403 });
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== ticket.contentType) return NextResponse.json({ error: "That kind of file is not accepted here." }, { status: 415 });
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > ticket.maxBytes) return NextResponse.json({ error: "That file is over the 100 MB limit." }, { status: 413 });
  if (!req.body) return NextResponse.json({ error: "The file is empty." }, { status: 400 });
  try {
    const r = await writeLocalStream(ticket.pathname, req.body, ticket.contentType, ticket.maxBytes);
    return NextResponse.json({ url: r.url, bytes: r.bytes });
  } catch (err) {
    const tooBig = err instanceof Error && err.message === "too-large";
    return NextResponse.json({ error: tooBig ? "That file is over the 100 MB limit." : "The upload failed." }, { status: tooBig ? 413 : 500 });
  }
}
