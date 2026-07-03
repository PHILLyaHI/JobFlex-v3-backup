// Shared view-model + helpers for the two worker job-detail design variants.
// Pure data/formatters so both V1 (frontend-design) and V2 (impeccable) render
// from the exact same job, making the two directions a fair comparison.

export interface WorkerJobEvent {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
}

export interface WorkerJobCrew {
  id: string;
  name: string;
  role: string;
  isMe: boolean;
}

export interface WorkerJobPhoto {
  id: string;
  url: string;
  kind: string | null;
}

export interface WorkerJobVM {
  id: string;
  title: string;
  status: string; // SCHEDULED | IN_PROGRESS | COMPLETED | CANCELED
  assignmentStatus: string; // PENDING | ACCEPTED | DECLINED | COMPLETED
  clientName: string | null;
  address: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  scope: string | null;
  events: WorkerJobEvent[];
  crew: WorkerJobCrew[];
  photos: WorkerJobPhoto[];
}

// Future-aware day label. lib/format's relative() is past-only (a future date
// wrongly reads "just now"), so schedules get forward-looking copy here.
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

export function longDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(d));
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
  const stamp = (d: Date) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const finish = end ?? new Date(new Date(start).getTime() + 4 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${stamp(start)}/${stamp(finish)}`,
    ...(location ? { location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
