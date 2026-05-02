import { NextResponse } from "next/server";
import { analyzeJobPhoto } from "@/actions/photoAnalysis";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ photoId: string }> },
) {
  const { photoId } = await ctx.params;
  try {
    const res = await analyzeJobPhoto(photoId);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ analysis: res.analysis, disabled: res.disabled ?? false });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed" }, { status: 500 });
  }
}
