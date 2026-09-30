import { NextResponse } from "next/server";
import { crewCaller, jsonBody } from "@/lib/crewActor";
import { deleteJobMediaFor, editJobMediaCaption } from "@/lib/jobMedia";

export const runtime = "nodejs";

// ONE PHOTO OR VIDEO: A NEW CAPTION, OR GONE (stage C, 2026-09-30). The
// office any file; a crew member their own. A caption edit leaves the
// "edited" mark; a delete takes the stored file with it (lib/jobMedia).
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await jsonBody<{ token: string; caption: string | null }>(req);
  const caller = await crewCaller(body.token ?? null);
  if (!caller) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  try {
    const row = await editJobMediaCaption({ organizationId: caller.organizationId, userId: caller.userId, role: caller.role }, id, typeof body.caption === "string" ? body.caption : null);
    return NextResponse.json({ id: row.id, caption: row.caption, editedAt: row.editedAt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not save that.";
    return NextResponse.json({ error: msg }, { status: msg === "Not found" ? 404 : 403 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await jsonBody<{ token: string }>(req);
  const caller = await crewCaller(body.token ?? null);
  if (!caller) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  try {
    await deleteJobMediaFor({ organizationId: caller.organizationId, userId: caller.userId, role: caller.role }, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not delete that.";
    return NextResponse.json({ error: msg }, { status: msg === "Not found" ? 404 : 403 });
  }
}
