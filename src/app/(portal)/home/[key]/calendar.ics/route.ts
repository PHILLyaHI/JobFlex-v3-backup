// The home dashboard's calendar as an .ics file (2026-10-03): the planned
// projects as all-day entries, the contractors' visits with their times — so
// a phone's own calendar can carry them. Reached only through the home key.
import { loadHomeDashboard } from "@/lib/home/portal";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const day = (ymd: string) => ymd.replace(/-/g, "");

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const home = await loadHomeDashboard(key);
  if (!home) return new Response("Not found", { status: 404 });
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//JobFlex//Home dashboard//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(`${home.firstName}'s home — JobFlex`)}`];
  const now = stamp(new Date());
  for (const p of home.plans) {
    if (p.status !== "PLANNED") continue;
    const start = day(p.date);
    const end = new Date(Date.UTC(Number(p.date.slice(0, 4)), Number(p.date.slice(5, 7)) - 1, Number(p.date.slice(8, 10)) + 1)).toISOString().slice(0, 10);
    lines.push("BEGIN:VEVENT", `UID:plan-${p.id}@jobflex.app`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${day(end)}`, `SUMMARY:${esc(`Planned: ${p.title}`)}`, ...(p.notes ? [`DESCRIPTION:${esc(p.notes)}`] : []), "END:VEVENT");
  }
  for (const project of home.projects) {
    for (const v of project.visits) {
      lines.push("BEGIN:VEVENT", `UID:visit-${project.token}-${v.startsAt}@jobflex.app`, `DTSTAMP:${now}`, `DTSTART:${stamp(new Date(v.startsAt))}`, `DTEND:${stamp(new Date(v.endsAt))}`, `SUMMARY:${esc(`${v.orgName}: ${v.title}`)}`, "END:VEVENT");
    }
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="jobflex-home.ics"', "Cache-Control": "no-store" },
  });
}
