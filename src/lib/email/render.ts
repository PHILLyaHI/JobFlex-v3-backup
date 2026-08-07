// Tiny {{variable}} template renderer + HTML wrapper used by email sends + live preview.

export type TemplateVars = Record<string, string | number | null | undefined>;

export function renderTemplate(src: string, vars: TemplateVars): string {
  return src.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    if (v === null || v === undefined) return "";
    return String(v);
  });
}

export interface WrappedEmail {
  subject: string;
  html: string;
  text: string;
}

import { renderEmail } from "./renderEmail";
import type { EmailDoc } from "./doc";

const URL_LINE = /^https?:\/\/\S+$/i;

/**
 * Compatibility adapter for free-text sends — user-authored EmailTemplate
 * bodies and anything not yet ported to a doc builder. Splits the body into
 * paragraphs and promotes a bare URL line into the CTA, using the label from
 * the preceding "Label:" line when there is one.
 *
 * New senders should build an EmailDoc and call renderEmail() directly; this
 * exists so contractor-authored templates keep working.
 */
export function wrapEmail({
  subject,
  body,
  orgName,
}: {
  subject: string;
  body: string;
  orgName: string;
}): WrappedEmail {
  const prose: string[] = [];
  let cta: EmailDoc["cta"];

  for (const raw of body.split(/\n{2,}/)) {
    const lines = raw.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const buffer: string[] = [];
    for (const line of lines) {
      if (URL_LINE.test(line) && !cta) {
        let label = "View online";
        const lead = buffer[buffer.length - 1];
        if (lead && lead.endsWith(":") && lead.length <= 40) {
          label = lead.slice(0, -1).trim();
          buffer.pop();
        }
        cta = { label, href: line };
      } else {
        buffer.push(line);
      }
    }
    if (buffer.length) prose.push(buffer.join(" "));
  }

  const { html, text } = renderEmail({
    subject,
    lockup: { kind: "org", name: orgName },
    headline: subject,
    prose,
    cta,
    footer: { name: orgName },
  });

  return { subject, html, text };
}
