import crypto from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { safeEqual, metaId } from "@/lib/meta/graph";
import { disconnectMetaPage } from "@/lib/meta/connections";

// Meta sends a signed_request when a person removes the Business Integration.
export async function POST(req: Request) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });
  const raw = await req.text();
  if (raw.length > 16000) return new Response("Too large", { status: 413 });
  try {
    const signed = new URLSearchParams(raw).get("signed_request") || "";
    const [signature, payload, extra] = signed.split(".");
    if (!signature || !payload || extra || !safeEqual(signature, crypto.createHmac("sha256", secret).update(payload).digest("base64url"))) return new Response("Invalid signature", { status: 403 });
    const data = z.object({ algorithm: z.literal("HMAC-SHA256"), user_id: metaId }).parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    const rows = await db.syncState.findMany({ where: { key: { startsWith: "meta:page:" } } });
    for (const row of rows) {
      const connection = z.object({ userId: z.string(), organizationId: z.string() }).parse(JSON.parse(row.cursor));
      if (connection.userId === data.user_id) await disconnectMetaPage(connection.organizationId, data.user_id);
    }
    return Response.json({ success: true });
  } catch { return new Response("Could not process deauthorization", { status: 500 }); }
}
