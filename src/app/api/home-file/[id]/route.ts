import { db } from "@/lib/db";
import { requireOrg } from "@/lib/orgContext";
import { orgMayReadFolder } from "@/lib/home/files";
import { kindOfUrl, presignedGet, readLocal } from "@/lib/media/privateStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ONE FILE FROM A JOB FOLDER (2026-10-03, lib/home/files). The reader is
// checked every time: the homeowner's key (?key=) or the session of a shop
// that has the request. A private blob answers with a redirect to a
// presigned store URL (short-lived); the local fallback streams the file with
// byte ranges, so a video seeks; a data URL (production before the store)
// is sent as bytes.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const file = await db.homeFile.findFirst({ where: { id, deletedAt: null }, include: { home: { select: { accessToken: true } } } });
  if (!file) return text("Not found", 404);
  const key = url.searchParams.get("key");
  let allowed = Boolean(key) && key === file.home.accessToken;
  if (!allowed) {
    try {
      const { organizationId } = await requireOrg();
      allowed = await orgMayReadFolder(organizationId, file.platformLeadId);
    } catch {
      allowed = false;
    }
  }
  if (!allowed) return text("Not found", 404);
  const download = url.searchParams.get("download") ? file.name : null;
  const kind = kindOfUrl(file.url);
  if (kind === "private-blob") {
    try {
      const to = await presignedGet(file.url, 15 * 60_000, Boolean(download));
      return new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "private, no-store" } });
    } catch (err) {
      console.warn("[home-file] presign failed:", err instanceof Error ? err.message : err);
      return text("File storage is not reachable right now.", 503);
    }
  }
  if (kind === "local") {
    const r = await readLocal(file.url, req.headers.get("range"), download);
    if (!r) return text("Not found", 404);
    return new Response(r.body, { status: r.status, headers: r.headers });
  }
  if (kind === "data") {
    const m = /^data:([^;,]+);base64,(.+)$/s.exec(file.url);
    if (!m) return text("Not found", 404);
    const bytes = Buffer.from(m[2], "base64");
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": m[1],
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=300",
        ...(download ? { "Content-Disposition": `attachment; filename="${download.replace(/[^A-Za-z0-9._-]/g, "-")}"` } : {}),
      },
    });
  }
  return text("Not found", 404);
}

function text(body: string, status: number): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
