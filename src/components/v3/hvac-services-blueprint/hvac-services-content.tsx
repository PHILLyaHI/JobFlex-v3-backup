// THE HVAC SERVICE MENU (2026-09-23) — the shop's book, readable as a page:
// every task the Service / repair job can price, by group, with the labor
// in this shop's own market, the part and its makers, and what the line
// comes to; the shop's own tasks at the end, and a form to add one. What
// Housecall Pro calls the price book — but priced.

import Link from "next/link";
import type { Route } from "next";
import { addHvacServiceTaskForm } from "@/actions/hvacServices";
import { SERVICE_GROUPS, SERVICE_MENU, indexedLabor, type ServiceTask } from "@/lib/hvac/serviceMenu";
import type { HvacRateCard } from "@/lib/hvac/ledger";
import styles from "./hvac-services.module.css";

const cx = (...names: Array<string | false | null | undefined>) =>
  names.filter(Boolean).map((n) => styles[n as string] ?? n).join(" ");
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function HvacServicesContent({ card, factor, place }: { card: HvacRateCard; factor: number; place: string }) {
  const mk = (c: number) => Math.round(c * (1 + card.materialsMarkupPct / 100));
  const custom = card.serviceMenu ?? [];
  const groups = SERVICE_GROUPS.filter((g) => g.group !== "custom").map((g) => ({ ...g, tasks: SERVICE_MENU.filter((t) => t.group === g.group) })).filter((g) => g.tasks.length);
  const line = (t: ServiceTask) => {
    if (t.unit === "lb") return { labor: `${usd(card.labor.refrigerantPerLb)}/lb`, part: "refrigerant by the pound", total: "per lb" };
    const labor = indexedLabor(t, factor);
    const part = t.part ? mk(t.part.costUsd) : 0;
    return { labor: usd(labor), part: t.part ? `${t.part.name} · ${usd(part)}${t.part.brands?.length ? ` · ${t.part.brands.join(" / ")}` : ""}` : "—", total: usd(labor + part) };
  };
  return (
    <>
      <div className={cx("page-head")}>
        <div>
          <div className={cx("kicker")}>Automation · HVAC estimator</div>
          <h1 className={cx("page-title")}>Service menu</h1>
        </div>
        <div className={cx("page-actions")}>
          <Link className={cx("btn", "btn-primary")} href={"/dashboard/hvac-estimator" as Route}>Price a visit</Link>
          <Link className={cx("btn", "btn-ghost")} href={"/dashboard/hvac-estimator/board" as Route}>HVAC inventory</Link>
        </div>
      </div>

      <div className={cx("kpis")} data-menu-kpis>
        <div className={cx("kpi")}><div className={cx("kpi-lbl")}>Tasks</div><div className={cx("kpi-val")} data-kpi="tasks">{SERVICE_MENU.length + custom.length}</div><div className={cx("kpi-sub")}>{groups.length} groups · {custom.length} of your own</div></div>
        <div className={cx("kpi")}><div className={cx("kpi-lbl")}>Labor in your market</div><div className={cx("kpi-val")} data-kpi="factor">×{factor.toFixed(2)}</div><div className={cx("kpi-sub")}>{place} · from the company address</div></div>
        <div className={cx("kpi")}><div className={cx("kpi-lbl")}>Diagnostic visit</div><div className={cx("kpi-val")}>{usd(card.labor.diagnostic)}</div><div className={cx("kpi-sub")}>on every call a tune-up does not cover</div></div>
        <div className={cx("kpi")}><div className={cx("kpi-lbl")}>Parts markup</div><div className={cx("kpi-val")}>+{card.materialsMarkupPct}%</div><div className={cx("kpi-sub")}>refrigerant {usd(card.labor.refrigerantPerLb)}/lb labor</div></div>
      </div>

      <div className={cx("stack")}>
        <p className={cx("hint")}>
          This is what the estimator&apos;s <strong>Service / repair</strong> job prices from: pick a house, pick the tasks, and every line lands on the estimate at these numbers. Labor is the US-typical shop price moved to your market; the part is the typical cost plus your markup. Edit any line on the estimate itself; save your own tasks below and they join the menu.
        </p>
        {groups.map((g) => (
          <section key={g.group} className={cx("card")} data-menu-group={g.group}>
            <div className={cx("card-h")}><div className={cx("card-t")}>{g.title}</div><div className={cx("card-s")}>{g.tasks.length} task{g.tasks.length === 1 ? "" : "s"}</div></div>
            <div className={cx("tbl-wrap")}>
              <table className={cx("tbl")}>
                <thead><tr><th>Task</th><th>Labor</th><th>Part</th><th>Line</th></tr></thead>
                <tbody>
                  {g.tasks.map((t) => {
                    const l = line(t);
                    return (
                      <tr key={t.id} data-menu-task={t.id}>
                        <td><span className={cx("who")}>{t.title}</span><span className={cx("sub")}>{t.includes}{t.note ? ` — ${t.note}` : ""}</span></td>
                        <td className={cx("mono")}>{l.labor}</td>
                        <td className={cx("mono")} style={{ fontFamily: "inherit" }}>{l.part}</td>
                        <td className={cx("mono")}>{l.total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <section className={cx("card")} data-menu-custom>
          <div className={cx("card-h")}><div className={cx("card-t")}>Your own tasks</div><div className={cx("card-s")}>{custom.length ? `${custom.length} on the menu` : "none yet"} · your numbers as typed, not indexed</div></div>
          {custom.length > 0 && (
            <table className={cx("tbl")} style={{ marginBottom: 12 }}>
              <thead><tr><th>Task</th><th>Labor</th><th>Part</th></tr></thead>
              <tbody>
                {custom.map((t) => (
                  <tr key={t.id}><td><span className={cx("who")}>{t.title}</span><span className={cx("sub")}>{t.includes}</span></td><td className={cx("mono")}>{usd(t.laborUsd)}</td><td className={cx("mono")} style={{ fontFamily: "inherit" }}>{t.part ? `${t.part.name} · ${usd(mk(t.part.costUsd))}` : "—"}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <form action={addHvacServiceTaskForm} className={cx("frm")} data-menu-add>
            <label className={cx("fld")}><span className={cx("lbl")}>Task</span><input name="title" className={cx("in")} required minLength={2} placeholder="Replace the zone damper actuator" /></label>
            <label className={cx("fld")}><span className={cx("lbl")}>Labor $</span><input name="laborUsd" className={cx("in")} type="number" min="0" step="1" required /></label>
            <label className={cx("fld", "wide")}><span className={cx("lbl")}>What it includes (the customer reads this)</span><input name="includes" className={cx("in")} placeholder="Actuator on the existing damper, end switches set" /></label>
            <label className={cx("fld")}><span className={cx("lbl")}>Part (optional)</span><input name="partName" className={cx("in")} placeholder="Damper actuator" /></label>
            <label className={cx("fld")}><span className={cx("lbl")}>Part cost $</span><input name="partCost" className={cx("in")} type="number" min="0" step="1" /></label>
            <label className={cx("fld", "wide")}><span className={cx("lbl")}>Brands, comma-separated (optional)</span><input name="brands" className={cx("in")} placeholder="Honeywell, EWC" /></label>
            <div className={cx("acts", "wide")}><button className={cx("btn", "btn-primary", "btn--sm")} type="submit">Add to my menu</button></div>
          </form>
        </section>
      </div>
    </>
  );
}
