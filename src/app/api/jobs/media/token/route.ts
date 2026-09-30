import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isBlobEnabled } from "@/lib/sdk/blob";
import { authorizeJobMedia } from "@/lib/jobMedia";
import { IMAGE_TYPES, MAX_FILE_BYTES, VIDEO_TYPES } from "@/lib/jobMediaShared";

export const runtime = "nodejs";

// STRAIGHT FROM THE PHONE TO THE FILE STORE (2026-09-27). A video does not
// fit through a JSON body (Vercel caps a request at 4.5 MB), so the browser
// asks here for a short-lived upload token, sends the file to Vercel Blob
// itself, then records the result at /api/jobs/media. This route only ever
// hands out a token for a job the caller may add to — a worker's token
// (the portal) or the session (the dashboard), in `clientPayload` — and
// only for a picture or a video up to 100 MB, under the job's own folder.
export async function POST(req: Request) {
  if (!isBlobEnabled()) return NextResponse.json({ error: "File storage is not set up on this server." }, { status: 503 });
  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload: { jobId?: string; token?: string | null; contentType?: string; bytes?: number } = {};
        try {
          payload = JSON.parse(clientPayload ?? "{}") as typeof payload;
        } catch {
          payload = {};
        }
        if (!payload.jobId) throw new Error("Which job?");
        const caller = await authorizeJobMedia(payload.jobId, payload.token ?? null);
        if (!caller) throw new Error("Not authorized");
        if (!pathname.startsWith(`jobs/${payload.jobId}/`)) throw new Error("Wrong folder");
        // Any file as it is, photo or video, up to 100 MB (owner, 2026-09-30) —
        // the store enforces it on the upload itself.
        return {
          allowedContentTypes: [...IMAGE_TYPES, ...VIDEO_TYPES],
          maximumSizeInBytes: MAX_FILE_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ jobId: payload.jobId, userId: caller.userId }),
        };
      },
      // The browser records the file at /api/jobs/media the moment its upload
      // completes; this callback (a webhook from the store) is not relied on.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload refused";
    return NextResponse.json({ error: message }, { status: message === "Not authorized" ? 403 : 400 });
  }
}
