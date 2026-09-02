// Scheme allow-list for URLs that came from a database row and are about to be
// rendered as `href` / `src`. Stored URLs originate from uploads (worker portal,
// managers) and are not trusted at render time: `javascript:` and `data:text/
// html` links in a receipt or photo field would execute in the viewer's
// session when clicked.
const ALLOWED = /^(https?:\/\/|\/(?!\/)|data:image\/(png|jpe?g|webp|gif|heic);base64,)/i;

/** The URL if it is http(s), a same-site path, or an inline image; else null. */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  const v = url.trim();
  // Control characters (tab/newline/etc.) never belong in a URL and are the
  // classic way to smuggle a scheme past a prefix check.
  for (let i = 0; i < v.length; i++) if (v.charCodeAt(i) < 32) return null;
  return ALLOWED.test(v) ? v : null;
}

/** Stricter form for user-supplied upload payloads: inline image data URLs only. */
export const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp|gif|heic|heif);base64,[A-Za-z0-9+/=]+$/;

/** Basename-only, ASCII-safe filename for blob keys (no traversal, no HTML). */
export function safeFilename(name: string | null | undefined, fallback = "file"): string {
  const base = (name ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^\.+/, "").slice(0, 80);
  return cleaned || fallback;
}
