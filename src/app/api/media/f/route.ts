import { verifyMediaLink } from "@/lib/media/signedLink";
import { kindOfUrl, presignedGet, readLocal } from "@/lib/media/privateStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A PRIVATE FILE, BY ITS SHORT LINK (stage B, 2026-09-30).
// The link was minted by a page that had already checked the reader
// (lib/media/signedLink): here only its signature and its 15 minutes are
// checked. A private blob answers with a redirect to a presigned store URL
// (short-lived too — the bytes come from the store's CDN, never through this
// function); the local fallback streams the file with byte ranges, so a
// video seeks. An expired link says so, in words, with 410.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const v = verifyMediaLink(params);
  if (!v.ok) {
    return new Response(v.reason === "expired" ? "This link has expired — reload the page for a fresh one." : "Not found", {
      status: v.reason === "expired" ? 410 : 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const kind = kindOfUrl(v.url);
  if (kind === "private-blob") {
    try {
      const to = await presignedGet(v.url, 15 * 60_000, !!v.download);
      return new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "private, no-store" } });
    } catch (err) {
      console.warn("[media] presign failed:", err instanceof Error ? err.message : err);
      return new Response("File storage is not reachable right now.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  }
  const r = await readLocal(v.url, req.headers.get("range"), v.download);
  if (!r) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(r.body, { status: r.status, headers: r.headers });
}
