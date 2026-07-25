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

/* ────────────────────────────────────────────────────────────────────────
 * JobFlex transactional email — blueprint drafting-paper system.
 *
 * Email clients don't support CSS custom properties or web fonts reliably,
 * so the design tokens (globals.css) are inlined as literals below and
 * the body is rendered with a web-safe stack. This is the sanctioned place to
 * hardcode token values — keep these in sync with --paper/--ink/--accent.
 * ──────────────────────────────────────────────────────────────────────── */

// Blueprint drafting-paper palette (mirrors globals.css :root tokens).
const C = {
  canvas: "#ebe8e1", // --paper-deep · tinted, so the white card lifts off it
  card: "#ffffff",
  line: "#e2e2e2", //   --ink-line (rgba(10,10,10,.12) flattened onto white)
  ink: "#0a0a0a", //    --ink
  inkSoft: "#2a2a2a", //--ink-soft
  inkMuted: "#555555", //--ink-muted (AA-safe small print)
  accent: "#1854a0", // --accent (blueprint)
} as const;

const FONT =
  "Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const URL_LINE = /^https?:\/\/\S+$/i;

export function wrapEmail({
  subject,
  body,
  orgName,
}: {
  subject: string;
  body: string;
  orgName: string;
}): WrappedEmail {
  const initial = (orgName.trim()[0] ?? "J").toUpperCase();

  // Hidden inbox-preview text: the body minus any raw URLs, so the long portal
  // link never leaks into the Gmail/Apple Mail snippet.
  const preheader = body
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !URL_LINE.test(l))
    .join(" ")
    .slice(0, 140);

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:${C.canvas};font-family:${FONT};-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(
      preheader,
    )}&#8203;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.canvas};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;background:${C.card};border:1px solid ${C.line};border-radius:14px;box-shadow:0 2px 6px rgba(20,24,31,0.05),0 8px 24px rgba(20,24,31,0.08);overflow:hidden;">

            <!-- Brand lockup: contractor's own initial, JobFlex-square style -->
            <tr>
              <td style="padding:30px 36px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <div style="width:34px;height:34px;border-radius:8px;background:${C.ink};color:${C.canvas};text-align:center;line-height:34px;font-family:${FONT};font-size:16px;font-weight:600;letter-spacing:-0.01em;">${escapeHtml(
                        initial,
                      )}</div>
                    </td>
                    <td style="vertical-align:middle;padding-left:11px;font-family:${FONT};font-size:14px;font-weight:600;letter-spacing:-0.01em;color:${C.ink};">${escapeHtml(
                      orgName,
                    )}</td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Subject as headline -->
            <tr>
              <td style="padding:22px 36px 4px;">
                <h1 style="margin:0;font-family:${FONT};font-size:23px;line-height:1.25;letter-spacing:-0.018em;color:${C.ink};font-weight:600;">${escapeHtml(
                  subject,
                )}</h1>
              </td>
            </tr>

            <!-- Body + auto-promoted CTA button -->
            <tr>
              <td style="padding:14px 36px 30px;">
                ${renderBlocks(body)}
              </td>
            </tr>

            <!-- Footer: quiet platform attribution -->
            <tr>
              <td style="padding:18px 36px;border-top:1px solid ${C.line};">
                <div style="font-family:${FONT};font-size:11px;letter-spacing:0.04em;color:${C.inkMuted};">Sent with JobFlex · ${escapeHtml(
                  orgName,
                )}</div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text: body };
}

/* Render the plain-text body into HTML blocks. A line that is nothing but a URL
 * becomes a Pressed Sage CTA button; if the line just above it is a short label
 * ending in ":" (e.g. "View and accept online:"), that becomes the button text.
 * Everything else renders as editorial paragraphs with inline links auto-linked. */
function renderBlocks(body: string): string {
  const blocks: string[] = [];

  for (const para of body.split(/\n{2,}/)) {
    let buffer: string[] = []; // raw text lines awaiting a <p> flush

    const flush = () => {
      const text = buffer
        .filter((l) => l.trim() !== "")
        .map(linkifyLine)
        .join("<br>");
      buffer = [];
      if (text) {
        blocks.push(
          `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.65;color:${C.inkSoft};">${text}</p>`,
        );
      }
    };

    for (const raw of para.split(/\n/)) {
      const line = raw.trim();
      if (URL_LINE.test(line)) {
        let label = "View online";
        const lead = buffer[buffer.length - 1]?.trim();
        if (lead && lead.endsWith(":") && lead.length <= 40) {
          label = lead.slice(0, -1).trim();
          buffer.pop();
        }
        flush();
        blocks.push(ctaButton(line, label));
      } else {
        buffer.push(raw);
      }
    }
    flush();
  }

  return blocks.join("\n                ");
}

// Bulletproof-ish solid button (bgcolor on the <td> covers clients that drop CSS bg).
function ctaButton(url: string, label: string): string {
  const href = escapeHtml(url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 6px;">
                  <tr>
                    <td align="center" bgcolor="${C.accent}" style="border-radius:8px;box-shadow:0 1px 2px rgba(20,24,31,0.06),inset 0 1px 0 rgba(255,255,255,0.10);">
                      <a href="${href}" target="_blank" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;letter-spacing:-0.005em;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(
                        label,
                      )}&nbsp;&rarr;</a>
                    </td>
                  </tr>
                </table>`;
}

// Escape a text line, then turn any inline URL into an accent-colored link.
function linkifyLine(raw: string): string {
  return escapeHtml(raw).replace(
    /(https?:\/\/[^\s<]+)/g,
    (u) =>
      `<a href="${u}" target="_blank" style="color:${C.accent};text-decoration:underline;text-underline-offset:2px;">${u}</a>`,
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
