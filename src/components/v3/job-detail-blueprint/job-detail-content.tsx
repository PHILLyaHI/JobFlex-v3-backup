"use client";

// JOB DETAIL / BLUEPRINT — the page.
// Route: /dashboard/jobs/[id].
//
// A port of `jobflex-jobdetail-blueprint (14).html`. It REPLACES the classic
// record page that lived at src/app/(dashboard)/dashboard/jobs/[id]/ — it does
// not stand beside it. Same arrangement as the sibling project-detail port.
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
// ── THE FIXTURE IS GONE — THIS IS THE REAL JOB ─────────────────────
// The port shipped with the donor's demo content ("Roof tear-off & reroof —
// 4812 Maple Ave") rendering for every id. It now renders the Job row behind
// `[id]`: title, client, address, span, status, crew, calendar events, change
// orders, photos and expenses, read by ../job-detail-blueprint/job-detail-load.ts
// and handed down as one `record`. The handheld build reads the same record, so
// the two editions cannot describe different jobs.
//
// Every control writes through an action that already existed — see the header
// of ./use-job-detail-actions.ts for the mapping. Nothing on this page is a
// decoration that pretends to work: a section with no rows draws a dashed
// drawing-note instead, and a role that `requireManager` would reject
// (SALES / ESTIMATOR) gets the record with the write controls withheld.
//
// ── DONOR SCRIPT → REACT ───────────────────────────────────────────
// The donor drives everything through `innerHTML` re-renders (`renderTabs()`,
// `renderView()`, `renderBadge()`) off two module-level variables, `tab` and
// `status`. `tab` is component state here; `status` is the record's, flipped
// optimistically by the picker and then re-read from the database.

import { useRef, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import s from "./job-detail.module.css";
import { useJobDetailMotion } from "./job-detail-motion";
import { useJobDetailActions, type PhotoKind } from "./use-job-detail-actions";
import { ST, STATUS_BUTTONS, fmt, type JobDetailRecord } from "./job-detail-data";

/** Hashed module class, or the literal name when the module has none — which is
 *  how the fleet's global `rv` / `rv-in` / `pressed` pass through. */
function cx(...names: Array<string | false | null | undefined>): string {
  return names
    .filter(Boolean)
    .map((n) => (s as Record<string, string>)[n as string] ?? (n as string))
    .join(" ");
}

type TabKey = "overview" | "schedule" | "crew" | "changes" | "photos" | "expenses";

const PHOTO_KINDS: Array<[PhotoKind, string]> = [
  ["BEFORE", "Before"],
  ["PROGRESS", "Progress"],
  ["AFTER", "After"],
];

function Ic({ id }: { id: string }) {
  return (
    <svg className={cx("ic")} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

/** DESIGN.md's empty state: a note on the drawing, 1.5px dashed. */
function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className={cx("jd-empty")}>{children}</div>;
}

export function JobDetailContent({ record }: { record: JobDetailRecord }) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [rosterOpen, setRosterOpen] = useState(false);
  const [photoKind, setPhotoKind] = useState<PhotoKind>("BEFORE");
  const fileRef = useRef<HTMLInputElement>(null);

  const a = useJobDetailActions(record.id, record.booking, record.status);

  useJobDetailMotion(s.btn);

  const expTotal = record.expenses.reduce((sum, e) => sum + e.amount, 0);
  const scheduled = record.events.length > 0;

  // Donor: `const TABS = [...]` — id, label, and a count thunk (null on Overview).
  const TABS: Array<[TabKey, string, number | null]> = [
    ["overview", "Overview", null],
    ["schedule", "Schedule", record.events.length],
    ["crew", "Crew", record.crew.length],
    ["changes", "Changes", record.changes.length],
    ["photos", "Photos", record.photos.length],
    ["expenses", "Expenses", record.expenses.length],
  ];

  return (
    <>
      {/* PAGE HEAD */}
      <div className={cx("page-head")}>
        <div>
          <div className={cx("kicker", "jd-kick")}>
            Job status ·{" "}
            <span className={cx("jd-st", ST[a.status].cls)}>{ST[a.status].l}</span>
          </div>
          <h1 className={cx("page-title")}>{record.title}</h1>
          <div className={cx("jd-dates")}>{record.dates}</div>
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
        {/* THE PROPOSAL SECTION IS THE LINK, and it exists only when
            `Job.proposalId` resolved. No proposal — no button, not a disabled
            one: there is nothing to open. */}
        {record.proposal && (
          <Link
            className={cx("btn", "btn-ghost", "jd-vp")}
            href={`/dashboard/proposals/${record.proposal.id}` as Route}
          >
            <Ic id="i-file" />
            View proposal · {fmt(record.proposal.total)}
          </Link>
        )}
      </div>

      {/* Write failures land here rather than in an alert() — one line, in the
          page's own voice, dismissible. */}
      {a.error && (
        <div className={cx("jd-err")} role="alert">
          <span>{a.error}</span>
          <button type="button" onClick={a.dismissError} aria-label="Dismiss">
            <Ic id="i-x" />
          </button>
        </div>
      )}

      {/* ВИД */}
      <div>
        {tab === "overview" && (
          <div className={cx("jd-grid")}>
            <section className={cx("card")}>
              <div className={cx("jd-h")}>
                <h2 className={cx("jd-t")}>Overview</h2>
              </div>

              {record.canWrite && (
                <div className={cx("jd-status")}>
                  <div className={cx("jd-sec-l")}>Set up the status</div>
                  <div className={cx("jd-status-row")}>
                    {STATUS_BUTTONS.map(([key, label]) => (
                      <button
                        key={key}
                        className={cx("jd-sbtn", `jd-sbtn--${key}`, a.status === key && "on")}
                        type="button"
                        aria-pressed={a.status === key}
                        disabled={a.busy?.kind === "status"}
                        onClick={() => a.pickStatus(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className={cx("jd-fields")}>
                <div className={cx("jd-f")}>
                  <span>Client</span>
                  <b>{record.clientName ?? "—"}</b>
                </div>
                <div className={cx("jd-f")}>
                  <span>Crew</span>
                  <b>{record.crew.length} assigned</b>
                </div>
                <div className={cx("jd-f")}>
                  <span>Expenses</span>
                  <b>
                    {fmt(expTotal)} · {record.expenses.length}
                  </b>
                </div>
                <div className={cx("jd-f")}>
                  <span>Dates</span>
                  <b>{record.fieldDates}</b>
                </div>
              </div>

              <div className={cx("jd-sec")}>
                <div className={cx("jd-sec-l")}>Scope of work</div>
                {record.scopeOfWork ? (
                  <p>{record.scopeOfWork}</p>
                ) : (
                  <EmptyNote>No scope recorded on this job.</EmptyNote>
                )}
              </div>
              <div className={cx("jd-sec")}>
                <div className={cx("jd-sec-l")}>Notes</div>
                {record.notes ? <p>{record.notes}</p> : <EmptyNote>No notes yet.</EmptyNote>}
              </div>
            </section>

            <section className={cx("card")}>
              <div className={cx("jd-h")}>
                <h2 className={cx("jd-t")}>Client contact</h2>
              </div>
              {record.contact ? (
                <>
                  <div className={cx("jd-c-row")}>
                    <Ic id="i-users" />
                    {record.contact.name}
                  </div>
                  {record.contact.phone && (
                    <div className={cx("jd-c-row", "mono")}>
                      <Ic id="i-phone" />
                      {record.contact.phoneHref ? (
                        <a href={record.contact.phoneHref}>{record.contact.phone}</a>
                      ) : (
                        record.contact.phone
                      )}
                    </div>
                  )}
                  {record.contact.email && (
                    <div className={cx("jd-c-row", "mono")}>
                      <Ic id="i-msg" />
                      <a href={`mailto:${record.contact.email}`}>{record.contact.email}</a>
                    </div>
                  )}
                  {record.contact.address && (
                    <div className={cx("jd-c-row")}>
                      <Ic id="i-pin" />
                      {record.contact.address}
                    </div>
                  )}
                </>
              ) : (
                <EmptyNote>No client linked to this job.</EmptyNote>
              )}
            </section>
          </div>
        )}

        {tab === "schedule" && (
          <section className={cx("card")}>
            <div className={cx("jd-h")}>
              <h2 className={cx("jd-t")}>Schedule</h2>
              <span className={cx("jd-s")}>
                {record.events.length} on the calendar
              </span>
            </div>
            {record.events.length === 0 ? (
              <EmptyNote>Nothing on the calendar for this job yet.</EmptyNote>
            ) : (
              record.events.map((e) => (
                <div className={cx("jd-row")} key={e.id}>
                  <div>
                    <div className={cx("jd-row-n")}>{e.title}</div>
                    <div className={cx("jd-row-m")}>
                      {e.when}
                      {e.meta ? ` · ${e.meta}` : ""}
                    </div>
                  </div>
                </div>
              ))
            )}
            {record.canWrite && (
              <div className={cx("jd-total", "jd-total--foot")}>
                {/* A div, not a span: `.jd-total span` is the "TOTAL" label. */}
                <div className={cx("jd-note")}>
                  {scheduled ? "Already booked" : `Books ${record.booking.label}`}
                </div>
                {scheduled ? (
                  <Link className={cx("btn", "btn-ghost")} href="/dashboard/calendar">
                    <Ic id="i-cal" />
                    On the schedule
                  </Link>
                ) : (
                  <button
                    className={cx("btn", "btn-ghost")}
                    type="button"
                    disabled={a.busy?.kind === "schedule"}
                    onClick={() => a.addToSchedule(record.title)}
                  >
                    <Ic id="i-cal" />
                    {a.busy?.kind === "schedule" ? "Adding…" : "Add to schedule"}
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {tab === "crew" && (
          <section className={cx("card")}>
            <div className={cx("jd-h")}>
              <h2 className={cx("jd-t")}>Crew</h2>
              <span className={cx("jd-s")}>confirm via portal link</span>
            </div>
            {record.crew.length === 0 ? (
              <EmptyNote>Nobody is on this job yet.</EmptyNote>
            ) : (
              record.crew.map((w) => (
                <div className={cx("jd-row")} key={w.assignmentId}>
                  <div>
                    <div className={cx("jd-row-n")}>{w.name}</div>
                    <div className={cx("jd-row-m")}>{w.meta}</div>
                  </div>
                  <div className={cx("jd-row-act")}>
                    <span
                      className={cx(
                        "jd-b",
                        w.state === "ok" ? "jd-b--ok" : w.state === "no" ? "jd-b--no" : "jd-b--wait",
                      )}
                    >
                      {w.state === "ok" ? "Confirmed" : w.state === "no" ? "Declined" : "Pending"}
                    </span>
                    {record.canWrite && (
                      <button
                        className={cx("btn", "btn-ghost", "jd-x")}
                        type="button"
                        aria-label={`Take ${w.name} off this job`}
                        disabled={
                          a.busy?.kind === "unassign" && a.busy.id === w.assignmentId
                        }
                        onClick={() => a.unassign(w.assignmentId)}
                      >
                        <Ic id="i-trash" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
            {record.canWrite && (
              <>
                <div className={cx("jd-total", "jd-total--foot")}>
                  <div className={cx("jd-note")}>
                    {record.roster.length} on the roster
                  </div>
                  <button
                    className={cx("btn", "btn-ghost")}
                    type="button"
                    aria-expanded={rosterOpen}
                    onClick={() => setRosterOpen((o) => !o)}
                  >
                    <Ic id={rosterOpen ? "i-x" : "i-userplus"} />
                    {rosterOpen ? "Close" : "Assign worker"}
                  </button>
                </div>
                {rosterOpen &&
                  (record.roster.length === 0 ? (
                    <EmptyNote>
                      Everyone on the roster is already on this job.{" "}
                      <Link className={cx("jd-link")} href="/dashboard/workers">
                        Add a worker
                      </Link>
                      .
                    </EmptyNote>
                  ) : (
                    <div className={cx("jd-pick")} role="list">
                      {record.roster.map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          role="listitem"
                          className={cx("jd-pick-row")}
                          disabled={a.busy?.kind === "assign" && a.busy.id === w.id}
                          onClick={async () => {
                            const ok = await a.assign(w.id);
                            if (ok) setRosterOpen(false);
                          }}
                        >
                          <span className={cx("jd-row-n")}>{w.name}</span>
                          {w.meta && <span className={cx("jd-row-m")}>{w.meta}</span>}
                          <Ic id="i-plus" />
                        </button>
                      ))}
                    </div>
                  ))}
              </>
            )}
          </section>
        )}

        {tab === "changes" && (
          <section className={cx("card")}>
            <div className={cx("jd-h")}>
              <h2 className={cx("jd-t")}>Change orders</h2>
              <span className={cx("jd-s")}>client-signed extras</span>
            </div>
            {record.changes.length === 0 ? (
              <EmptyNote>
                No change orders on this job. They are raised from the proposal or the
                job, then signed by the client.
              </EmptyNote>
            ) : (
              record.changes.map((c) => {
                const working = a.busy?.kind === "change" && a.busy.id === c.id;
                return (
                  <div className={cx("jd-corow")} key={c.id}>
                    <div>
                      <div className={cx("jd-row-n")}>
                        {c.ref} · {c.title}
                      </div>
                      <div className={cx("jd-row-m")}>{c.meta}</div>
                    </div>
                    <span className={cx("jd-amt")}>{fmt(c.amount)}</span>
                    <span
                      className={cx(
                        "jd-b",
                        c.state === "ok"
                          ? "jd-b--ok"
                          : c.state === "no"
                            ? "jd-b--no"
                            : c.state === "sent"
                              ? "jd-b--warn"
                              : "jd-b--wait",
                      )}
                    >
                      {c.state === "ok"
                        ? "Approved"
                        : c.state === "no"
                          ? "Declined"
                          : c.state === "sent"
                            ? "Pending"
                            : "Draft"}
                    </span>
                    {record.canWrite && c.state === "draft" && (
                      <button
                        className={cx("btn", "btn-primary")}
                        type="button"
                        disabled={working}
                        onClick={() => a.sendChange(c.id)}
                      >
                        {working ? "Sending…" : "Send"}
                      </button>
                    )}
                    {record.canWrite && c.state === "sent" && (
                      <button
                        className={cx("btn", "btn-primary")}
                        type="button"
                        disabled={working}
                        onClick={() => a.approveChange(c.id, c.publicToken)}
                      >
                        {working ? "Saving…" : "Mark approved"}
                      </button>
                    )}
                    {(!record.canWrite || c.state === "ok" || c.state === "no") && <span />}
                  </div>
                );
              })
            )}
          </section>
        )}

        {tab === "photos" && (
          <section className={cx("card")}>
            <div className={cx("jd-h")}>
              <h2 className={cx("jd-t")}>Photos</h2>
              <span className={cx("jd-s")}>Before · Progress · After</span>
            </div>
            {record.photos.length === 0 ? (
              <EmptyNote>No photos on this job yet.</EmptyNote>
            ) : (
              <div className={cx("jd-photos")}>
                {record.photos.map((p) => (
                  <div className={cx("jd-ph")} key={p.id}>
                    <div className={cx("jd-ph-img")}>
                      {/* A JobPhoto url is a data: URL whenever Vercel Blob is
                          not configured (uploadJobPhoto's fallback), which
                          next/image cannot take — so a plain img. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={p.caption} />
                      <span className={cx("jd-ph-k")}>{p.kind}</span>
                    </div>
                    <div className={cx("jd-ph-c")}>{p.caption}</div>
                  </div>
                ))}
              </div>
            )}
            {record.canWrite && (
              <div className={cx("jd-total", "jd-total--foot14")}>
                <div className={cx("jd-status-row")}>
                  {PHOTO_KINDS.map(([key, label]) => (
                    <button
                      key={key}
                      className={cx("jd-sbtn", photoKind === key && "on", "jd-sbtn--sch")}
                      type="button"
                      aria-pressed={photoKind === key}
                      onClick={() => setPhotoKind(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input
                  ref={fileRef}
                  className={cx("jd-file")}
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    // Cleared before the await: the same file picked twice in a
                    // row fires no change event otherwise.
                    e.target.value = "";
                    if (file) await a.upload(file, photoKind);
                  }}
                />
                <button
                  className={cx("btn", "btn-ghost")}
                  type="button"
                  disabled={a.busy?.kind === "upload"}
                  onClick={() => fileRef.current?.click()}
                >
                  <Ic id="i-plus" />
                  {a.busy?.kind === "upload" ? "Uploading…" : "Upload"}
                </button>
              </div>
            )}
          </section>
        )}

        {tab === "expenses" && (
          <section className={cx("card")}>
            <div className={cx("jd-h")}>
              <h2 className={cx("jd-t")}>Expenses</h2>
              <span className={cx("jd-s")}>logged on this job</span>
            </div>
            {record.expenses.length === 0 ? (
              <EmptyNote>Nothing logged against this job yet.</EmptyNote>
            ) : (
              <>
                {record.expenses.map((e) => (
                  <div className={cx("jd-row")} key={e.id}>
                    <div>
                      <div className={cx("jd-row-n")}>{e.vendor}</div>
                      <div className={cx("jd-row-m")}>{e.meta}</div>
                    </div>
                    <span className={cx("jd-amt")}>{fmt(e.amount)}</span>
                  </div>
                ))}
                <div className={cx("jd-total")}>
                  <span>Total</span>
                  <b>{fmt(expTotal)}</b>
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </>
  );
}
