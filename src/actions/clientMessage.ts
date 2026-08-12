"use server";

// Reaching a CLIENT from the client record — one message, two channels.
//
// WHY THIS IS NOT src/actions/messages.ts. That module is the crew's inbox:
// `Conversation` has `ConversationParticipant` rows pointing at Users, its
// kinds are DIRECT / GROUP / JOB, and nothing in it links a thread to a Client.
// A contractor messaging a homeowner is a different act with a different
// audience, and modelling it as a crew thread would put a customer's words in
// the staff inbox. Until a client-thread model exists, "message the client"
// means the two channels the app can already reach them on.
//
// Both channels go through the transports the rest of the app uses —
// `sendOrgEmail` (the org's connected Gmail when opted in, otherwise the
// platform transport with the contractor as reply-to) and `sendSMS` — so a
// message sent from here carries the same identity as a follow-up sent from
// anywhere else.
//
// EVERY SEND IS LOGGED as an ActivityEvent against the client. That is what
// closes the loop for the record page: the Activity card these actions are
// invoked from is reading the same table, so a sent message appears in it on
// the next render instead of vanishing into a provider.

import { db } from "@/lib/db";
import { requireSalesOrManager } from "@/lib/orgContext";
import { sendOrgEmail } from "@/lib/email/orgSend";
import { isTwilioEnabled, sendSMS } from "@/lib/sdk/twilio";

export type ClientChannel = "email" | "sms";

/** What the dialog needs to know before it offers a channel: an address it can
 *  actually reach, and — for SMS — a configured Twilio line. Asked once when
 *  the sheet opens so a channel is disabled with a reason rather than failing
 *  after the user has typed a message. */
export async function clientChannels(clientId: string): Promise<{
  email: string | null;
  phone: string | null;
  smsConfigured: boolean;
}> {
  const { organizationId } = await requireSalesOrManager();
  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { organizationId: true, deletedAt: true, email: true, phone: true },
  });
  if (!client || client.organizationId !== organizationId || client.deletedAt) {
    throw new Error("Client not found");
  }
  return {
    email: client.email,
    phone: client.phone,
    smsConfigured: isTwilioEnabled(),
  };
}

/** Escapes a contractor's plain-text message into the HTML body of an email.
 *  The composer is a textarea, so everything in it is literal — an ampersand in
 *  "Deck & fence" must not open an entity, and a stray `<` must not eat the
 *  rest of the paragraph. Newlines become <br> because that is what the typist
 *  meant by pressing return. */
function textToHtml(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 14px">${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Send one message to a client on one channel, and record it on their file.
 *
 * @param clientId  the record the message belongs to; also the org-scoping key.
 * @param channel   "email" or "sms" — the composer picks, this validates.
 * @param subject   email only, ignored for SMS (a text has no subject line).
 * @param body      the typed message, plain text.
 */
export async function messageClient(input: {
  clientId: string;
  channel: ClientChannel;
  subject?: string;
  body: string;
}): Promise<{ channel: ClientChannel; to: string; delivered: boolean }> {
  const { organizationId, user } = await requireSalesOrManager();

  const body = input.body.trim();
  if (!body) throw new Error("Write a message first");

  const client = await db.client.findUnique({
    where: { id: input.clientId },
    select: { id: true, organizationId: true, deletedAt: true, name: true, email: true, phone: true },
  });
  if (!client || client.organizationId !== organizationId || client.deletedAt) {
    throw new Error("Client not found");
  }

  let to: string;
  // `delivered` is false when the transport is switched off in this
  // environment. sendSMS() logs and returns `skipped` rather than throwing, so
  // without this the UI would report a send that only happened in a console.
  let delivered = true;

  if (input.channel === "email") {
    if (!client.email) throw new Error(`${client.name} has no email on file`);
    to = client.email;
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, gmailSettingsJson: true, gmailTokensJson: true, billingEmail: true },
    });
    if (!org) throw new Error("Organization not found");
    const subject = (input.subject ?? "").trim() || `A message from ${org.name ?? "your contractor"}`;
    await sendOrgEmail(org, { to, subject, html: textToHtml(body) });
  } else {
    if (!client.phone) throw new Error(`${client.name} has no phone number on file`);
    if (!isTwilioEnabled()) throw new Error("Texting needs a Twilio number — set one up on the Phone page");
    to = client.phone;
    const res = await sendSMS(to, body);
    delivered = !res.skipped;
  }

  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      clientId: client.id,
      kind: input.channel === "email" ? "EMAIL" : "TEXT",
      // First line only, capped. The Activity card gives each signal one line
      // and clamps at 62ch; a three-paragraph email pasted in whole would push
      // every other signal out of the card's fixed scroll height.
      summary:
        input.channel === "email"
          ? `Emailed ${to} — ${firstLine(input.subject?.trim() || body)}`
          : `Texted ${to} — ${firstLine(body)}`,
    },
  });

  return { channel: input.channel, to, delivered };
}

function firstLine(s: string): string {
  const line = s.split("\n")[0].trim();
  return line.length > 90 ? `${line.slice(0, 89)}…` : line;
}
