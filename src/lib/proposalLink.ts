// THE CLIENT'S LINK, TO COPY OR TEXT (2026-09-24) — pure, client-safe.
//
// Owner: "when a proposal is done I need to copy the client's proposal link
// to send it via text." The link is the public portal page; the text is one
// short line with the link at the end so it stays a tappable link in
// Messages. An `sms:` href opens the phone's own messaging app with the
// recipient (when the client has a number) and the body filled in; the
// `?&body=` form is the one both iOS and Android read.

export function clientProposalUrl(publicId: string, origin?: string | null): string {
  const base = (origin ?? (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  return `${base}/portal/q/${encodeURIComponent(publicId)}`;
}

/** "Hi Dima, here's your proposal from Ridgeline Roofing — Roof replacement: https://…" */
export function proposalTextMessage(input: { org?: string | null; clientName?: string | null; title?: string | null; link: string }): string {
  const first = (input.clientName ?? "").trim().split(/\s+/)[0];
  const hi = first ? `Hi ${first}, ` : "";
  const from = input.org?.trim() ? ` from ${input.org.trim()}` : "";
  const what = input.title?.trim() ? ` — ${input.title.trim()}` : "";
  return `${hi}here's your proposal${from}${what}: ${input.link}`;
}

/** Digits only, with a leading + kept; null when there is nothing dialable. */
export function smsNumber(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  const plus = digits.startsWith("+") ? "+" : "";
  const n = digits.replace(/\D/g, "");
  return n.length >= 7 ? plus + n : null;
}

export function smsHref(phone: string | null | undefined, body: string): string {
  return `sms:${smsNumber(phone) ?? ""}?&body=${encodeURIComponent(body)}`;
}
