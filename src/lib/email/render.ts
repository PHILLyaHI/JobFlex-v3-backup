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

export function wrapEmail({
  subject,
  body,
  orgName,
}: {
  subject: string;
  body: string;
  orgName: string;
}): WrappedEmail {
  const paragraphs = body
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;line-height:1.65;color:#2a2a2e;font-size:15px;white-space:pre-wrap;">${escapeHtml(
          p,
        )}</p>`,
    )
    .join("");

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#FAFAF7;font-family:Geist,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:0.5px solid #E8E6DE;border-radius:16px;max-width:560px;">
            <tr>
              <td style="padding:28px 32px 12px;">
                <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#6B6A64;">${escapeHtml(orgName)}</div>
                <h1 style="margin:6px 0 0;font-size:22px;line-height:1.2;letter-spacing:-0.01em;color:#111113;font-weight:600;">${escapeHtml(subject)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 28px;">
                ${paragraphs}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;border-top:0.5px solid #E8E6DE;">
                <div style="font-size:11px;color:#6B6A64;">Sent via JobFlex · ${escapeHtml(orgName)}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = body;
  return { subject, html, text };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
