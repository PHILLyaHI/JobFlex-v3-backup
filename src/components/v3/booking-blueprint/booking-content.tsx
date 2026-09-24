// ONLINE BOOKING — THE OFFICE PAGE (2026-09-23), on the blueprint sheet.
// The link and how to put it everywhere, the numbers, the visits booked,
// the hours and the rules, the services offered (smart defaults from the
// shop's trades, every one editable). Server rendered; every button is a
// form bound to a server action.

import Link from "next/link";
import type { Route } from "next";
import { cancelBookingOffice, markBookingDone, removeBookingService, resetBookingServices, saveBookingService, saveBookingSettings } from "@/actions/booking";
import type { BookingDashboard } from "@/lib/bookingBook";
import styles from "./booking.module.css";

const cx = (...names: Array<string | false | null | undefined>) =>
  names.filter(Boolean).map((n) => styles[n as string] ?? n).join(" ");
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const KIND_LABEL: Record<string, string> = { diagnostic: "Repair / diagnostic", "tune-up": "Tune-up", emergency: "Same-day", estimate: "Estimate", consult: "Consultation", other: "Other" };

export function BookingContent({ data }: { data: BookingDashboard }) {
  const { settings, link, upcoming, stats, timeZone, trades } = data;
  const when = (d: Date) => d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone });
  const embed = `<a href="${link}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 18px;background:#1854a0;color:#fff;border-radius:8px;font:600 14px system-ui;text-decoration:none">Book a visit online</a>`;
  return (
    <>
      <div className={cx("page-head")}>
        <div>
          <div className={cx("kicker")}>Delivery · Online booking</div>
          <h1 className={cx("page-title")}>Book now</h1>
        </div>
        <div className={cx("page-actions")}>
          <a className={cx("btn", "btn-primary")} href={link} target="_blank" rel="noreferrer" data-booking-link>Open the booking page</a>
          <Link className={cx("btn", "btn-ghost")} href={"/dashboard/calendar" as Route}>Calendar</Link>
        </div>
      </div>

      <div className={cx("kpis")} data-booking-kpis>
        <div className={cx("kpi")}><div className={cx("kpi-lbl")}>Booked this week</div><div className={cx("kpi-val")} data-kpi="week">{stats.thisWeek}</div><div className={cx("kpi-sub")}>{stats.next30} in the next 30 days</div></div>
        <div className={cx("kpi")}><div className={cx("kpi-lbl")}>Services offered</div><div className={cx("kpi-val")} data-kpi="services">{stats.services}</div><div className={cx("kpi-sub")}>{trades.length ? `from your trades: ${trades.join(", ")}` : "set your trades in Company"}</div></div>
        <div className={cx("kpi")}><div className={cx("kpi-lbl")}>Booking page</div><div className={cx("kpi-val")} data-kpi="enabled">{settings.enabled ? "On" : "Off"}</div><div className={cx("kpi-sub")}>{settings.crews} crew{settings.crews === 1 ? "" : "s"} · {settings.slotMinutes}-min slots · {settings.leadHours}h notice</div></div>
        <div className={cx("kpi")}><div className={cx("kpi-lbl")}>All time</div><div className={cx("kpi-val")} data-kpi="all">{stats.allTime}</div><div className={cx("kpi-sub")}>visits booked online</div></div>
      </div>

      <div className={cx("stack")}>
        <section className={cx("card")} data-booking-share>
          <div className={cx("card-h")}><div className={cx("card-t")}>Your booking link</div><div className={cx("card-s")}>put it on your website, your Google profile, your email signature, invoices and trucks</div></div>
          <div className={cx("frm")}>
            <label className={cx("fld", "wide")}><span className={cx("lbl")}>Link</span><input className={cx("in")} readOnly value={link} onFocus={undefined} /></label>
            <label className={cx("fld", "wide")}><span className={cx("lbl")}>Button for your website (paste into the page)</span><textarea className={cx("ta")} readOnly value={embed} style={{ minHeight: 70, fontFamily: "var(--font-mono)", fontSize: 11.5 }} /></label>
          </div>
          <p className={cx("hint")} style={{ marginTop: 8 }}>What makes it smart: the services come from your trades with real prices; a customer on a service plan gets their member price by their email; a repair call asks the two questions that matter so the tech arrives knowing the job; a new customer becomes a lead with the visit on your calendar; the reminder goes out the day before; they can move or cancel from their own link.</p>
        </section>

        <section className={cx("card")} data-booking-upcoming>
          <div className={cx("card-h")}><div className={cx("card-t")}>Booked online</div><div className={cx("card-s")}>{upcoming.length} coming up</div></div>
          {upcoming.length === 0 ? (
            <div className={cx("empty")}>Nothing booked yet. Share the link — the first booking lands here and on the calendar.</div>
          ) : (
            <div className={cx("tbl-wrap")}>
              <table className={cx("tbl")}>
                <thead><tr><th>When</th><th>Who</th><th>Service</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {upcoming.map((b) => (
                    <tr key={b.id} data-booking-row={b.status}>
                      <td className={cx("mono")}>{when(b.when)}</td>
                      <td>
                        {b.clientId ? <Link className={cx("who")} href={`/dashboard/client-detail?client=${b.clientId}` as Route}>{b.name}</Link> : b.leadId ? <Link className={cx("who")} href={`/dashboard/leads/${b.leadId}` as Route}>{b.name}</Link> : <span className={cx("who")}>{b.name}</span>}
                        <span className={cx("sub")}>{[b.phone, b.email, b.address].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td>
                        {b.serviceLabel}{b.member ? <span className={cx("plate", "plate--active")} style={{ marginLeft: 6 }}>Member</span> : b.leadId ? <span className={cx("plate", "plate--sent")} style={{ marginLeft: 6 }}>New lead</span> : null}
                        {b.answers.length > 0 && <span className={cx("sub")}>{b.answers.map((a) => `${a.label} ${a.value}`).join(" · ")}</span>}
                        {b.notes && <span className={cx("sub")}>“{b.notes}”</span>}
                      </td>
                      <td><span className={cx("plate", b.status === "CANCELED" ? "plate--canceled" : b.status === "DONE" ? "plate--expired" : "plate--active")}>{b.status.toLowerCase()}</span></td>
                      <td>
                        <div className={cx("acts")}>
                          {b.appointmentId && b.status !== "CANCELED" && <Link className={cx("btn", "btn-primary", "btn--sm")} href={`/dashboard/visits/${b.appointmentId}` as Route}>Visit</Link>}
                          {b.status !== "CANCELED" && b.status !== "DONE" && <form action={markBookingDone.bind(null, b.id)}><button className={cx("btn", "btn-ghost", "btn--sm")} type="submit">Done</button></form>}
                          {b.status !== "CANCELED" && <form action={cancelBookingOffice.bind(null, b.id)}><button className={cx("btn", "btn-ghost", "btn--sm")} type="submit">Cancel</button></form>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className={cx("two")}>
          <section className={cx("card")} data-booking-settings>
            <div className={cx("card-h")}><div className={cx("card-t")}>Hours and rules</div><div className={cx("card-s")}>what the page offers</div></div>
            <form action={saveBookingSettings} className={cx("frm")}>
              <label className={cx("chk", "wide")}><input type="checkbox" name="enabled" defaultChecked={settings.enabled} /> The booking page is on</label>
              <div className={cx("wide")}>
                <div className={cx("sec-h")}>Open hours</div>
                {settings.hours.map((h, i) => (
                  <div key={i} className={cx("row")} style={{ marginBottom: 6 }}>
                    <span style={{ width: 92, fontSize: 13, fontWeight: 800 }}>{DAYS[i]}</span>
                    <label className={cx("chk")}><input type="checkbox" name={`closed_${i}`} defaultChecked={!h} /> closed</label>
                    <input className={cx("in")} name={`open_${i}`} type="time" defaultValue={h?.open ?? "08:00"} style={{ width: 120 }} />
                    <span className={cx("hint")}>to</span>
                    <input className={cx("in")} name={`close_${i}`} type="time" defaultValue={h?.close ?? "17:00"} style={{ width: 120 }} />
                  </div>
                ))}
              </div>
              <label className={cx("fld")}><span className={cx("lbl")}>Slot every (minutes)</span><input className={cx("in")} name="slotMinutes" type="number" min="15" max="240" defaultValue={settings.slotMinutes} /></label>
              <label className={cx("fld")}><span className={cx("lbl")}>Notice needed (hours)</span><input className={cx("in")} name="leadHours" type="number" min="0" max="168" defaultValue={settings.leadHours} /></label>
              <label className={cx("fld")}><span className={cx("lbl")}>Crews that can be out at once</span><input className={cx("in")} name="crews" type="number" min="1" max="20" defaultValue={settings.crews} /></label>
              <label className={cx("fld")}><span className={cx("lbl")}>Arrival window (minutes, 0 = exact time)</span><input className={cx("in")} name="arrivalWindow" type="number" min="0" max="480" defaultValue={settings.arrivalWindow} /></label>
              <label className={cx("fld")}><span className={cx("lbl")}>Days ahead to offer</span><input className={cx("in")} name="horizonDays" type="number" min="3" max="60" defaultValue={settings.horizonDays} /></label>
              <label className={cx("fld", "wide")}><span className={cx("lbl")}>A line at the top of the page (optional)</span><input className={cx("in")} name="intro" defaultValue={settings.intro ?? ""} placeholder="Serving Snohomish County since 2009 — pick a time and we'll be there." /></label>
              <div className={cx("acts", "wide")}><button className={cx("btn", "btn-primary", "btn--sm")} type="submit">Save</button></div>
            </form>
          </section>

          <section className={cx("card")} data-booking-services>
            <div className={cx("card-h")}><div className={cx("card-t")}>Services customers can book</div><div className={cx("card-s")}>{settings.services.length} offered</div></div>
            {settings.services.map((s) => (
              <details key={s.key} style={{ marginBottom: 10 }} data-booking-service={s.key}>
                <summary style={{ cursor: "pointer" }}>
                  <strong>{s.label}</strong> <span className={cx("hint")}>· {KIND_LABEL[s.kind] ?? s.kind} · {s.minutes} min · {s.priceText}{s.memberPriceText ? ` · members: ${s.memberPriceText}` : ""}{s.questions?.length ? ` · ${s.questions.length} question${s.questions.length === 1 ? "" : "s"}` : ""}</span>
                </summary>
                <ServiceForm s={s} />
              </details>
            ))}
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: "pointer" }}><strong>Add a service</strong></summary>
              <ServiceForm />
            </details>
            <form action={resetBookingServices} style={{ marginTop: 12 }}>
              <button className={cx("btn", "btn-ghost", "btn--sm")} type="submit">Reset to the smart defaults for my trades</button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}

function ServiceForm({ s }: { s?: BookingDashboard["settings"]["services"][number] }) {
  return (
    <form action={saveBookingService} className={cx("frm")} style={{ marginTop: 10 }}>
      {s && <input type="hidden" name="key" value={s.key} />}
      {s && <input type="hidden" name="trade" value={s.trade} />}
      <label className={cx("fld", "wide")}><span className={cx("lbl")}>Name</span><input name="label" className={cx("in")} defaultValue={s?.label ?? ""} required minLength={2} /></label>
      <label className={cx("fld")}><span className={cx("lbl")}>Kind</span>
        <select name="kind" className={cx("sel")} defaultValue={s?.kind ?? "diagnostic"}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </label>
      <label className={cx("fld")}><span className={cx("lbl")}>Length (minutes)</span><input name="minutes" className={cx("in")} type="number" min="15" max="480" defaultValue={s?.minutes ?? 60} /></label>
      <label className={cx("fld")}><span className={cx("lbl")}>Price the customer reads</span><input name="priceText" className={cx("in")} defaultValue={s?.priceText ?? ""} placeholder="$129 diagnostic, applied to the repair" /></label>
      <label className={cx("fld")}><span className={cx("lbl")}>Members read instead (optional)</span><input name="memberPriceText" className={cx("in")} defaultValue={s?.memberPriceText ?? ""} placeholder="Diagnostic waived for members" /></label>
      <label className={cx("fld", "wide")}><span className={cx("lbl")}>One line about it</span><input name="description" className={cx("in")} defaultValue={s?.description ?? ""} /></label>
      <label className={cx("fld", "wide")}><span className={cx("lbl")}>Questions, one per line — “Question? | option, option” (options optional)</span><textarea name="questions" className={cx("ta")} defaultValue={(s?.questions ?? []).map((q) => (q.options ? `${q.label} | ${q.options.join(", ")}` : q.label)).join("\n")} /></label>
      <label className={cx("chk")}><input type="checkbox" name="urgent" defaultChecked={s?.urgent ?? false} /> Can start today (skips the notice)</label>
      <div className={cx("acts", "wide")}>
        <button className={cx("btn", "btn-primary", "btn--sm")} type="submit">{s ? "Save" : "Add"}</button>
        {s && <button className={cx("btn", "btn-ghost", "btn--sm")} type="submit" formAction={removeBookingService.bind(null, s.key)}>Remove</button>}
      </div>
    </form>
  );
}
