// Local formatters for the worker job detail. Future-aware day labels (lib/
// format's relative() is past-only) plus map / calendar deep links. Kept beside
// the page so the token portal doesn't reach into the dashboard preview module.

export function whenLabel(date: Date): string {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((start.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1) return `In ${days} days`;
  return `${Math.abs(days)} days ago`;
}

export function timeRange(start: Date, end: Date | null): string {
  const t = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(d));
  return end ? `${t(start)} – ${t(end)}` : t(start);
}

export function directionsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function gcalUrl(
  title: string,
  start: Date,
  end: Date | null,
  location: string | null,
): string {
  const stamp = (d: Date) =>
    new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const finish = end ?? new Date(new Date(start).getTime() + 4 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${stamp(start)}/${stamp(finish)}`,
    ...(location ? { location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Membership roles → a friendly crew label. Everyone defaults to Installer.
export function prettyRole(role: string): string {
  const map: Record<string, string> = {
    OWNER: "Owner",
    ADMIN: "Manager",
    MANAGER: "Manager",
    INSTALLER: "Installer",
    STAFF: "Staff",
  };
  return map[role] ?? role.charAt(0) + role.slice(1).toLowerCase();
}
