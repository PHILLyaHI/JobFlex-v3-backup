// THE VISIT (2026-09-23) — the crew's page for one appointment on the
// blueprint sheet: who and where, the units on file with their age advice,
// and the tune-up report form — readings by the side of the system, the
// findings the readings raise on their own, the tech's own lines, the
// client-facing summary — saved, then sent to the client.

import Link from "next/link";
import type { Route } from "next";
import { saveVisitReportForm } from "@/actions/equipment";
import { readingFieldsFor, type VisitKind } from "@/lib/equipment";
import type { VisitView } from "@/lib/visitBook";
import styles from "./visit.module.css";

const cx = (...names: Array<string | false | null | undefined>) =>
  names.filter(Boolean).map((n) => styles[n as string] ?? n).join(" ");

const SEV: Record<string, string> = { urgent: "Now", fix: "Repair", watch: "Watch", info: "Note" };

export function VisitContent({ v, appUrl }: { v: VisitView; appUrl: string }) {
  const when = v.appointment.startsAt.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: v.timeZone });
  const kind: VisitKind = v.report?.kind ?? v.kind;
  const fields = readingFieldsFor(kind);
  const r = v.report;
  return (
    <>
      <div className={cx("page-head")}>
        <div>
          <div className={cx("kicker")}>Visit · {when}</div>
          <h1 className={cx("page-title")}>{v.appointment.title}</h1>
        </div>
        <div className={cx("page-actions")}>
          {v.client?.id && <Link className={cx("btn", "btn-primary")} href={`/dashboard/hvac-estimator?client=${v.client.id}` as Route}>Price the repair</Link>}
          {v.client?.id && <Link className={cx("btn", "btn-ghost")} href={`/dashboard/client-detail?client=${v.client.id}` as Route}>Client</Link>}
          <Link className={cx("btn", "btn-ghost")} href={"/dashboard/calendar" as Route}>Calendar</Link>
        </div>
      </div>

      <div className={cx("two")}>
        <section className={cx("card")} data-visit-who>
          <div className={cx("card-h")}><div className={cx("card-t")}>{v.client?.name ?? "No client on the visit"}</div><div className={cx("card-s")}>{v.appointment.status.toLowerCase()}</div></div>
          {v.client && (
            <div className={cx("hint")} style={{ fontSize: 13, color: "var(--ink)" }}>
              {v.client.address || "no address on file"}
              <br />
              {[v.client.phone, v.client.email].filter(Boolean).join(" · ") || "no phone or email"}
            </div>
          )}
          {v.planVisit && <div className={cx("hint")} style={{ marginTop: 8 }}>{v.planVisit.label} · {v.planVisit.planName} · {v.planVisit.status.toLowerCase()}</div>}
          <div className={cx("sec-h")} style={{ marginTop: 14 }}>Equipment on file</div>
          {v.equipment.length === 0 ? (
            <div className={cx("hint")}>Nothing on file — photograph the nameplate on the client page, or note the unit in the findings.</div>
          ) : (
            v.equipment.map((e) => (
              <div key={e.id} style={{ marginBottom: 8 }} data-visit-unit>
                <div style={{ fontWeight: 800, fontSize: 13 }}>{e.line}</div>
                {e.filterSize && <div className={cx("hint")}>filter {e.filterSize}</div>}
                {e.advice && <div className={cx("hint")} style={{ color: "var(--warning, #b88420)" }}>{e.advice}</div>}
              </div>
            ))
          )}
          {v.appointment.notes && (
            <>
              <div className={cx("sec-h")} style={{ marginTop: 14 }}>The checklist</div>
              <pre className={cx("hint")} style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>{v.appointment.notes.replace(/^Report form: \S+\n\n/, "")}</pre>
            </>
          )}
        </section>

        <section className={cx("card")} data-visit-report>
          <div className={cx("card-h")}>
            <div className={cx("card-t")}>The report</div>
            <div className={cx("card-s")}>{r?.sentAt ? `sent ${r.sentAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: v.timeZone })}` : r ? "saved, not sent" : "not written yet"}</div>
          </div>
          <form action={saveVisitReportForm} className={cx("frm")}>
            <input type="hidden" name="appointmentId" value={v.appointment.id} />
            <label className={cx("fld")}><span className={cx("lbl")}>Technician</span><input name="techName" className={cx("in")} defaultValue={r?.techName ?? ""} /></label>
            <label className={cx("fld")}><span className={cx("lbl")}>Side of the system</span>
              <select name="kind" className={cx("sel")} defaultValue={kind}><option value="cooling">Cooling</option><option value="heating">Heating</option><option value="both">Both</option><option value="other">Repair / other</option></select>
            </label>
            <div className={cx("wide")}>
              <div className={cx("sec-h")}>Readings</div>
              <div className={cx("frm")}>
                {fields.map((f) => (
                  <label key={f.key} className={cx("fld")}>
                    <span className={cx("lbl")}>{f.label}{f.unit ? ` (${f.unit})` : ""}</span>
                    <input name={`r_${f.key}`} className={cx("in")} defaultValue={r?.readings[f.key] ?? ""} placeholder={f.ok ? `${f.ok[0] === f.ok[1] ? f.ok[0] : `${f.ok[0]}–${f.ok[1]}`}${f.hint ? ` · ${f.hint}` : ""}` : f.hint ?? ""} />
                  </label>
                ))}
              </div>
            </div>
            {r && r.findings.length > 0 && (
              <div className={cx("wide")} data-visit-findings>
                <div className={cx("sec-h")}>Findings on file</div>
                <ul className={cx("benefits")}>
                  {r.findings.map((f, i) => <li key={i}><span className={cx("plate", f.severity === "urgent" ? "plate--lapsed" : f.severity === "fix" ? "plate--expiring" : "plate--sent")}>{SEV[f.severity]}</span> {f.text}</li>)}
                </ul>
              </div>
            )}
            <label className={cx("fld", "wide")}><span className={cx("lbl")}>Your findings — one per line (!! now, ! repair, ? watch)</span><textarea name="findings" className={cx("ta")} placeholder={"! Run capacitor at 84% — replace\n? Slight oil at the service valve — watch"} defaultValue={r ? r.findings.filter((f) => !/is high|outside|reads|Flame sensor at|monoxide|in the flue|Manifold gas/.test(f.text)).map((f) => `${f.severity === "urgent" ? "!! " : f.severity === "fix" ? "! " : f.severity === "watch" ? "? " : ""}${f.text}`).join("\n") : ""} /></label>
            <label className={cx("fld", "wide")}><span className={cx("lbl")}>Recommendations for the client</span><textarea name="recommendations" className={cx("ta")} defaultValue={r?.recommendations ?? ""} placeholder="Replace the run capacitor ($185 at your member price). Plan the replacement of the 2008 condenser before next summer." /></label>
            <label className={cx("fld", "wide")}><span className={cx("lbl")}>Summary the client reads (blank = written from the readings)</span><textarea name="summary" className={cx("ta")} defaultValue={r?.summary ?? ""} /></label>
            <div className={cx("acts", "wide")}>
              <button className={cx("btn", "btn-ghost", "btn--sm")} type="submit" name="then" value="save" data-visit-save>Save</button>
              <button className={cx("btn", "btn-primary", "btn--sm")} type="submit" name="then" value="send" data-visit-send disabled={!v.client?.email && !r}>{v.client?.email ? "Save and send to the client" : "Save and mark done"}</button>
              {r && <a className={cx("btn", "btn-ghost", "btn--sm")} href={`${appUrl}/report/${r.publicToken}`} target="_blank" rel="noreferrer">Client&apos;s page</a>}
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
