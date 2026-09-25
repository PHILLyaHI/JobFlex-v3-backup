// WHO DID IT (2026-09-24) — pure, client-safe.
//
// Owner: "show if the manager did the estimate or the estimator or whatever
// role it is, and show it in colors — marks that it was done by this person
// or that person. Same in financials." One mark for a member everywhere:
// their name, their role, and a color that is theirs for good — picked from
// their id, so the same person is the same color on every page, on the desk
// and on the phone, without anyone choosing it. A system event (the daily
// stock check, a client's own click) is grey and says so.

export const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MANAGER: "Manager",
  SALES: "Sales",
  ESTIMATOR: "Estimator",
  INSTALLER: "Crew",
  ACCOUNTANT: "Accounting",
  USER: "Member",
};

export function roleLabel(role: string | null | undefined): string {
  return role ? (ROLE_LABEL[role] ?? role.charAt(0) + role.slice(1).toLowerCase()) : "";
}

/** Eight marks, each readable on the paper background and apart from its neighbours. */
export const WHO_COLORS = ["#1854a0", "#2f7d4a", "#b06a11", "#a83232", "#6b3fa0", "#0f7c8c", "#c2571d", "#4a5568"] as const;

export function whoColor(id: string | null | undefined): string {
  if (!id) return "#8a8a8a";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return WHO_COLORS[h % WHO_COLORS.length];
}

export function whoInitials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "·";
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export type WhoLike = { id: string | null; name: string | null; role?: string | null };

export const SYSTEM_WHO: WhoLike = { id: null, name: "System", role: null };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/**
 * The mark as an HTML string, for the pages that build their rows by hand
 * (the proposals list, the company sheet, the financials ledger). Styled by
 * components/v3/who/who.css: a colored dot, the name, the role in small caps.
 *   compact — the dot and the name only, for a narrow column.
 */
export function whoHtml(w: WhoLike | null | undefined, opts: { compact?: boolean; by?: boolean } = {}): string {
  const who = w && (w.id || w.name) ? w : SYSTEM_WHO;
  const color = whoColor(who.id);
  const name = who.name?.trim() || "Someone";
  const role = who.id ? roleLabel(who.role) : "";
  return (
    `<span class="who${opts.compact ? " who--compact" : ""}${who.id ? "" : " who--system"}" style="--who:${color}" data-who="${esc(who.id ?? "")}" title="${esc(name + (role ? " · " + role : ""))}">` +
    `<i class="who-dot" aria-hidden="true">${esc(whoInitials(name))}</i>` +
    (opts.by ? `<span class="who-by">by </span>` : "") +
    `<b class="who-name">${esc(name)}</b>` +
    (role && !opts.compact ? `<em class="who-role">${esc(role)}</em>` : "") +
    `</span>`
  );
}
