// SHORT READ LINKS FOR PRIVATE FILES (stage B, 2026-09-30) — server only.
//
// A page that has already checked who is reading (the office, or a crew
// member on the job) mints a link to /api/media/f for each private file it
// shows: the stored URL, an expiry 15 minutes out and an HMAC over both with
// the app's own secret. The route checks the HMAC and the clock and nothing
// else — the rights were checked by whoever minted it — so a link copied out
// of the page dies in 15 minutes and cannot be edited to name another file.
// Older public files (data URLs, the public store) are returned as they are.

import { createHmac, timingSafeEqual } from "node:crypto";
import { kindOfUrl } from "@/lib/media/privateStore";

export const MEDIA_LINK_TTL_MS = 15 * 60_000;

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET is not set");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(`media:${payload}`).digest("base64url");
}

export interface MediaLinkOptions {
  /** Ask the browser to save the file under this name instead of showing it. */
  download?: string | null;
  now?: number;
}

/** The link a page puts in <img src> / <video src> / <a href>. */
export function mediaHref(url: string | null | undefined, opts: MediaLinkOptions = {}): string | null {
  if (!url) return null;
  const kind = kindOfUrl(url);
  if (kind !== "private-blob" && kind !== "local") return url;
  const exp = (opts.now ?? Date.now()) + MEDIA_LINK_TTL_MS;
  const u = Buffer.from(url, "utf8").toString("base64url");
  const dl = opts.download ? opts.download.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80) : "";
  const sig = sign(`${u}.${exp}.${dl}`);
  return `/api/media/f?u=${u}&e=${exp}${dl ? `&d=${encodeURIComponent(dl)}` : ""}&s=${sig}`;
}

export type VerifiedLink = { ok: true; url: string; download: string | null } | { ok: false; reason: "bad" | "expired" };

export function verifyMediaLink(params: URLSearchParams, now = Date.now()): VerifiedLink {
  const u = params.get("u") ?? "";
  const e = Number(params.get("e"));
  const dl = params.get("d") ?? "";
  const s = params.get("s") ?? "";
  if (!u || !Number.isFinite(e) || !s) return { ok: false, reason: "bad" };
  const expect = Buffer.from(sign(`${u}.${e}.${dl}`));
  const got = Buffer.from(s);
  if (expect.length !== got.length || !timingSafeEqual(expect, got)) return { ok: false, reason: "bad" };
  if (e < now) return { ok: false, reason: "expired" };
  const url = Buffer.from(u, "base64url").toString("utf8");
  const kind = kindOfUrl(url);
  if (kind !== "private-blob" && kind !== "local") return { ok: false, reason: "bad" };
  return { ok: true, url, download: dl || null };
}

/** An upload ticket for the local fallback: the path and the ceiling, signed. */
export function uploadTicket(pathname: string, contentType: string, maxBytes: number, now = Date.now()): string {
  const exp = now + 30 * 60_000;
  const body = Buffer.from(JSON.stringify({ p: pathname, t: contentType, m: maxBytes, e: exp }), "utf8").toString("base64url");
  return `${body}.${sign(`upload.${body}`)}`;
}

export function readUploadTicket(ticket: string, now = Date.now()): { pathname: string; contentType: string; maxBytes: number } | null {
  const [body, sig] = ticket.split(".");
  if (!body || !sig) return null;
  const expect = Buffer.from(sign(`upload.${body}`));
  const got = Buffer.from(sig);
  if (expect.length !== got.length || !timingSafeEqual(expect, got)) return null;
  try {
    const j = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { p: string; t: string; m: number; e: number };
    if (j.e < now) return null;
    return { pathname: j.p, contentType: j.t, maxBytes: j.m };
  } catch {
    return null;
  }
}
