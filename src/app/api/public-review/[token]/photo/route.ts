import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deleteBlob, isBlobEnabled, uploadBlob } from "@/lib/sdk/blob";
import { IMAGE_DATA_URL, safeFilename } from "@/lib/safeHref";
import { rateLimitShared, ipFromRequest, HOUR } from "@/lib/rateLimit";
import { parsePhotos } from "@/lib/reviews/publicSummary";

// Photos on a client review. The review token is the only credential — the
// same capability the submit route trusts. One photo per request (Vercel caps
// the body at 4.5 MB), appended to `photosJson` as it lands; the form uploads
// sequentially so the read-modify-write below never races itself.
const MAX_REVIEW_PHOTOS = 6;
// Vercel caps request bodies at 4.5 MB; base64 inflates ~4/3, so this is the
// largest decoded image that can arrive anyway.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

async function loadRequest(token: string) {
  return db.reviewRequest.findUnique({
    where: { publicToken: token },
    select: { id: true, organizationId: true, status: true, photosJson: true },
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const gate = await rateLimitShared(`review-photo:${ipFromRequest(req)}`, 30, HOUR);
  if (!gate.ok) return NextResponse.json({ error: "Too many uploads — try again later." }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { dataUrl?: string; filename?: string } | null;
  if (!body?.dataUrl) return NextResponse.json({ error: "Missing photo" }, { status: 400 });

  const rr = await loadRequest(token);
  if (!rr) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // One-shot, like the review itself: nothing changes after it is submitted.
  if (rr.status === "COMPLETED") {
    return NextResponse.json({ error: "This review has already been submitted." }, { status: 409 });
  }
  const photos = parsePhotos(rr.photosJson);
  if (photos.length >= MAX_REVIEW_PHOTOS) {
    return NextResponse.json({ error: `Up to ${MAX_REVIEW_PHOTOS} photos per review.` }, { status: 409 });
  }

  // Only an inline IMAGE is accepted — never a URL the client typed.
  const match = body.dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match || !IMAGE_DATA_URL.test(body.dataUrl)) {
    return NextResponse.json({ error: "Photo must be an image" }, { status: 400 });
  }
  const buf = Buffer.from(match[2], "base64");
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Photo is too large (4 MB max)" }, { status: 413 });
  }

  let url = body.dataUrl;
  if (isBlobEnabled()) {
    const res = await uploadBlob(
      `reviews/${rr.organizationId}/${rr.id}/${Date.now()}-${safeFilename(body.filename, "photo")}`,
      buf,
      { contentType: match[1].toLowerCase() },
    );
    url = res.url;
  }

  await db.reviewRequest.update({
    where: { id: rr.id },
    data: { photosJson: JSON.stringify([...photos, url]) },
  });
  return NextResponse.json({ url, count: photos.length + 1 });
}

/** Remove a photo the client changed their mind about — before submitting. */
export async function DELETE(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { url?: string } | null;
  if (!body?.url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  const rr = await loadRequest(token);
  if (!rr) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (rr.status === "COMPLETED") {
    return NextResponse.json({ error: "This review has already been submitted." }, { status: 409 });
  }
  const photos = parsePhotos(rr.photosJson);
  if (!photos.includes(body.url)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.reviewRequest.update({
    where: { id: rr.id },
    data: { photosJson: JSON.stringify(photos.filter((u) => u !== body.url)) },
  });
  if (/^https?:/i.test(body.url)) {
    await deleteBlob(body.url).catch((err) => console.warn("[review-photo] delete failed:", err));
  }
  return NextResponse.json({ ok: true, count: photos.length - 1 });
}
