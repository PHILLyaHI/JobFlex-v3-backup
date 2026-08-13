"use client";

// JOB DETAIL / BLUEPRINT — the page.
// Route: /dashboard/jobs/[id].
//
// A verbatim port of `jobflex-jobdetail-blueprint (14).html`. It REPLACES the
// classic record page that lived at src/app/(dashboard)/dashboard/jobs/[id]/ —
// it does not stand beside it. Same arrangement as the sibling
// project-detail-blueprint port.
//
// ── CHROME DROPPED ─────────────────────────────────────────────────
// The donor file carries its own sidebar, topbar, SVG sprite, `.layout`,
// `.main` (graph-paper field + scrollbars) and `.content` wrapper. ALL of it is
// discarded here: blueprint-shell already renders that furniture from
// src/app/dashboard/layout.tsx and it persists across navigation. Verified
// value-for-value against the donor before dropping — `--sidebar-w: 264px`,
// `--topbar-h: 62px`, `.content { padding: 40px 96px 80px; gap: 22px;
// display: flex; flex-direction: column; position: relative; z-index: 1 }` —
// all identical. This component returns ONLY the donor's `.content` children,
// as a fragment, so they stay DIRECT children of `.content`: the donor's reveal
// cascade walks `.content > *`.
//
// Also dropped, for the same reason: the donor's 42-symbol sprite (the shell
// sprite's copies of the eight symbols used here — i-file, i-users, i-phone,
// i-msg, i-pin, i-cal, i-userplus, i-plus — are character-identical), the nav
// burger / backdrop (the shell owns the drawer), FLUID SCALE, the sidebar
// cascade and the graph-paper parallax (shell-behavior.ts, same donor numbers).
// The donor's `.banner-close` dismiss IIFE is dropped too: this page renders no
// Lead Center banner, so its `querySelectorAll` matched nothing.
//
// ── THE FIXTURE IS THE CONTENT ─────────────────────────────────────
// UNLIKE the project-detail port, which wired the donor's layout to the real
// record, this page ships the donor's demo content verbatim — the explicit call
// for this port. The "Roof tear-off & reroof — 4812 Maple Ave" job, its crew,
// change orders, photos and expenses all come from ./job-detail-data.ts and no
// Job row is read. The route still resolves `[id]` so every existing link and
// `revalidatePath('/dashboard/jobs/<id>')` keeps working; the id is simply not
// used to select content. See ./job-detail-data.ts.
//
// ── DONOR SCRIPT → REACT ───────────────────────────────────────────
// The donor drives everything through `innerHTML` re-renders (`renderTabs()`,
// `renderView()`, `renderBadge()`) off two module-level variables, `tab` and
// `status`, plus an in-place mutation of `CHANGES[i].st` on Approve. Those are
// three pieces of component state here; the emitted markup, class names and
// ordering are the donor's, element for element.

import { useState } from "react";
import s from "./job-detail.module.css";
import { useJobDetailMotion } from "./job-detail-motion";
import {
  ST,
  INITIAL_STATUS,
  STATUS_BUTTONS,
  EVENTS,
  CREW,
  CHANGES,
  PHOTOS,
  EXPENSES,
  JOB,
  fmt,
  type StatusKey,
} from "./job-detail-data";

/** Hashed module class, or the literal name when the module has none — which is
 *  how the fleet's global `rv` / `rv-in` / `pressed` pass through. */
function cx(...names: Array<string | false | null | undefined>): string {
  return names
    .filter(Boolean)
    .map((n) => (s as Record<string, string>)[n as string] ?? (n as string))
    .join(" ");
}

/** Donor: `const TABS = [...]` — id, label, and a count thunk (null on Overview). */
type TabKey = "overview" | "schedule" | "crew" | "changes" | "photos" | "expenses";
const TABS: Array<[TabKey, string, number | null]> = [
  ["overview", "Overview", null],
  ["schedule", "Schedule", EVENTS.length],
  ["crew", "Crew", CREW.length],
  ["changes", "Changes", CHANGES.length],
  ["photos", "Photos", PHOTOS.length],
  ["expenses", "Expenses", EXPENSES.length],
];

export function JobDetailContent() {
  // Donor: `let tab = 'overview'`, `let status = 'prog'`, and `CHANGES[i].st`
  // mutated in place by the Approve handler.
  const [tab, setTab] = useState<TabKey>("overview");
  const [status, setStatus] = useState<StatusKey>(INITIAL_STATUS);
  const [approved, setApproved] = useState<number[]>([]);

  useJobDetailMotion(s.btn);

  const changes = CHANGES.map((c, i) => (approved.includes(i) ? { ...c, st: "ok" as const } : c));
  const expTotal = EXPENSES.reduce((a, e) => a + e.amt, 0);

  return (
    <>
      {/* PAGE HEAD */}
      <div className={cx("page-head")}>
        <div>
          <div className={cx("kicker", "jd-kick")}>
            Job status ·{" "}
            <span className={cx("jd-st", ST[status].cls)}>{ST[status].l}</span>
          </div>
          <h1 className={cx("page-title")}>{JOB.title}</h1>
          <div className={cx("jd-dates")}>{JOB.dates}</div>
        </div>
      </div>

      {/* ТАБЫ */}
      <div className={cx("jd-tabbar")}>
        <div className={cx("jd-tabs")}>
          {TABS.map(([key, label, count]) => (
            <button
              key={key}
              className={cx("jd-tab", tab === key && "on")}
              type="button"
              onClick={() => setTab(key)}
            >
              {/* The space is the donor's: `t[1] + (t[2] ? ' <i>' + … )`. */}
              {label}
              {count !== null && <> <i>{count}</i></>}
            </button>
          ))}
        </div>
        <button className={cx("btn", "btn-ghost", "jd-vp")} type="button">
          <svg className={cx("ic")}>
            <use href="#i-file" />
          </svg>
          View proposal
        </button>
      </div>

      {/* ВИД */}
      <div>
        {tab === "overview" && (
          <div className={cx("jd-grid")}>
            <section className={cx("card")}>
              <div className={cx("jd-h")}>
                <h2 className={cx("jd-t")}>Overview</h2>
              </div>

              <div className={cx("jd-status")}>
                <div className={cx("jd-sec-l")}>Set up the status</div>
                <div className={cx("jd-status-row")}>
                  {STATUS_BUTTONS.map(([key, label]) => (
                    <button
                      key={key}
                      className={cx("jd-sbtn", `jd-sbtn--${key}`, status === key && "on")}
                      type="button"
                      onClick={() => setStatus(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={cx("jd-fields")}>
                <div className={cx("jd-f")}>
                  <span>Client</span>
                  <b>{JOB.client}</b>
                </div>
                <div className={cx("jd-f")}>
                  <span>Crew</span>
                  <b>{CREW.length} assigned</b>
                </div>
                <div className={cx("jd-f")}>
                  <span>Expenses</span>
                  <b>
                    {fmt(expTotal)} · {EXPENSES.length}
                  </b>
                </div>
                <div className={cx("jd-f")}>
                  <span>Dates</span>
                  <b>{JOB.fieldDates}</b>
                </div>
              </div>

              <div className={cx("jd-sec")}>
                <div className={cx("jd-sec-l")}>Scope of work</div>
                <p>{JOB.scopeOfWork}</p>
              </div>
              <div className={cx("jd-sec")}>
                <div className={cx("jd-sec-l")}>Notes</div>
                <p>{JOB.notes}</p>
              </div>
            </section>

            <section className={cx("card")}>
              <div className={cx("jd-h")}>
                <h2 className={cx("jd-t")}>Client contact</h2>
              </div>
              <div className={cx("jd-c-row")}>
                <svg className={cx("ic")}>
                  <use href="#i-users" />
                </svg>
                {JOB.contact.name}
              </div>
              <div className={cx("jd-c-row", "mono")}>
                <svg className={cx("ic")}>
                  <use href="#i-phone" />
                </svg>
                <a href={JOB.contact.phoneHref}>{JOB.contact.phone}</a>
              </div>
              <div className={cx("jd-c-row", "mono")}>
                <svg className={cx("ic")}>
                  <use href="#i-msg" />
                </svg>
                <a href={`mailto:${JOB.contact.email}`}>{JOB.contact.email}</a>
              </div>
              <div className={cx("jd-c-row")}>
                <svg className={cx("ic")}>
                  <use href="#i-pin" />
                </svg>
                {JOB.contact.address}
              </div>
            </section>
          </div>
        )}

        {tab === "schedule" && (
          <section className={cx("card")}>
            <div className={cx("jd-h")}>
              <h2 className={cx("jd-t")}>Schedule</h2>
              <span className={cx("jd-s")}>{EVENTS.length} on the calendar</span>
            </div>
            {EVENTS.map((e) => (
              <div className={cx("jd-row")} key={e.t}>
                <div>
                  <div className={cx("jd-row-n")}>{e.t}</div>
                  <div className={cx("jd-row-m")}>
                    {e.d} · {e.m}
                  </div>
                </div>
              </div>
            ))}
            <div className={cx("jd-total", "jd-total--foot")}>
              <button className={cx("btn", "btn-ghost")} type="button">
                <svg className={cx("ic")}>
                  <use href="#i-cal" />
                </svg>
                Add to schedule
              </button>
            </div>
          </section>
        )}

        {tab === "crew" && (
          <section className={cx("card")}>
            <div className={cx("jd-h")}>
              <h2 className={cx("jd-t")}>Crew</h2>
              <span className={cx("jd-s")}>confirm via portal link</span>
            </div>
            {CREW.map((w) => (
              <div className={cx("jd-row")} key={w.n}>
                <div>
                  <div className={cx("jd-row-n")}>{w.n}</div>
                  <div className={cx("jd-row-m")}>
                    {w.r} · {w.ph}
                  </div>
                </div>
                <span className={cx("jd-b", w.st === "ok" ? "jd-b--ok" : "jd-b--wait")}>
                  {w.st === "ok" ? "Confirmed" : "Pending"}
                </span>
              </div>
            ))}
            <div className={cx("jd-total", "jd-total--foot")}>
              <button className={cx("btn", "btn-ghost")} type="button">
                <svg className={cx("ic")}>
                  <use href="#i-userplus" />
                </svg>
                Assign worker
              </button>
            </div>
          </section>
        )}

        {tab === "changes" && (
          <section className={cx("card")}>
            <div className={cx("jd-h")}>
              <h2 className={cx("jd-t")}>Change orders</h2>
              <span className={cx("jd-s")}>client-signed extras</span>
            </div>
            {changes.map((c, i) => (
              <div className={cx("jd-corow")} key={c.id}>
                <div>
                  <div className={cx("jd-row-n")}>
                    {c.id} · {c.t}
                  </div>
                  <div className={cx("jd-row-m")}>{c.m}</div>
                </div>
                <span className={cx("jd-amt")}>{fmt(c.amt)}</span>
                {c.st === "ok" ? (
                  <>
                    <span></span>
                    <span className={cx("jd-b", "jd-b--ok")}>Approved</span>
                  </>
                ) : (
                  <>
                    <span className={cx("jd-b", "jd-b--warn")}>Pending</span>
                    <button
                      className={cx("btn", "btn-primary")}
                      type="button"
                      onClick={() => setApproved((a) => (a.includes(i) ? a : [...a, i]))}
                    >
                      Approve
                    </button>
                  </>
                )}
              </div>
            ))}
          </section>
        )}

        {tab === "photos" && (
          <section className={cx("card")}>
            <div className={cx("jd-h")}>
              <h2 className={cx("jd-t")}>Photos</h2>
              <span className={cx("jd-s")}>Before · Progress · After</span>
            </div>
            <div className={cx("jd-photos")}>
              {PHOTOS.map((p) => (
                <div className={cx("jd-ph")} key={p.c}>
                  <div className={cx("jd-ph-img")}>
                    <span className={cx("jd-ph-k")}>{p.k}</span>
                  </div>
                  <div className={cx("jd-ph-c")}>{p.c}</div>
                </div>
              ))}
            </div>
            <div className={cx("jd-total", "jd-total--foot14")}>
              <button className={cx("btn", "btn-ghost")} type="button">
                <svg className={cx("ic")}>
                  <use href="#i-plus" />
                </svg>
                Upload
              </button>
            </div>
          </section>
        )}

        {tab === "expenses" && (
          <section className={cx("card")}>
            <div className={cx("jd-h")}>
              <h2 className={cx("jd-t")}>Expenses</h2>
              <span className={cx("jd-s")}>logged on this job</span>
            </div>
            {EXPENSES.map((e) => (
              <div className={cx("jd-row")} key={e.v}>
                <div>
                  <div className={cx("jd-row-n")}>{e.v}</div>
                  <div className={cx("jd-row-m")}>{e.m}</div>
                </div>
                <span className={cx("jd-amt")}>{fmt(e.amt)}</span>
              </div>
            ))}
            <div className={cx("jd-total")}>
              <span>Total</span>
              <b>{fmt(expTotal)}</b>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
