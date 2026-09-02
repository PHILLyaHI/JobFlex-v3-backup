"use client";

// Settings blueprint — Notifications pane.
//
// Faithful port of donor `jobflex-settings-blueprint (6).html` lines 2102-2127,
// with the contract's owner fixes applied on top:
//   F10 — the three donor <select class="fin"> controls (quiet hours from,
//         quiet hours to, daily digest) are the custom `Sel` dropdown.
//   F12 — every `.tg` is the `Toggle` primitive, which renders no child svg.
//   F16 — each matrix event row leads with a `.nev-ic` icon box.
//   F17 — the per-column `.colt` "All" badge is a real control (`.colw`) that
//         drives its whole column and reflects whether the column is full;
//         it is the same square `Cbx` as the cells beneath it.
//   F13 — deliberately NOT applied here: neither `.sc-b` on this pane has a
//         bare `.prow`/`.trow`/`.dlv` list as its direct children (the matrix
//         card holds `.nwrap` + `.nfoot`, Delivery holds `.fgrid` + wrappers
//         carrying the donor's own margin-top values).
//
// The pane wrapper (`.pane`) and its `.pane-h` header belong to
// settings-content.tsx; this file starts at the first `<section class="sc">`.
// Class names are plain global strings — the stylesheet is applied upstream.
//
// REAL DATA. The whole pane is one blob on the signed-in user's own row —
// `User.notificationPrefsJson` — hydrated by `parseNotificationPrefs` on the
// server and written back by `updateNotificationPrefs`. A user who has never
// saved sees the donor's seed matrix; from then on it is theirs. The SMS number
// lives in the same blob (`User.phone` is the Profile card's field, and is a
// contact number rather than a notification route).
//
// "Send test notification" is the one footer button with nothing behind it —
// no test-notification path exists — so it stays inert.

import { useState } from "react";

import { updateNotificationPrefs } from "@/actions/accountSettings";
import { Cbx, Field, SaveBar, Sel, Toggle } from "../ui";
import type { DeliveryToggleKey, MatrixAction, PaneProps } from "../settings-data";
import {
  DELIVERY_CARD,
  DELIVERY_TOGGLES,
  DIGEST_SELECT,
  EMAIL_COLUMN_INDEX,
  NOTIFICATIONS_CARD,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_COLUMN_LABEL,
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_COLUMN,
  NOTIFICATION_FOOTER_ACTIONS,
  QUIET_FROM_SELECT,
  QUIET_TO_SELECT,
  SMS_NUMBER_LABEL,
  notificationCountBadge,
} from "../settings-data";

/** Donor inline sizing on the three `.nfoot` buttons (line 2111-2115). */
const NFOOT_BTN_STYLE = { height: "38px", padding: "0 14px" } as const;

type Triple = [boolean, boolean, boolean];

export function NotificationsPane({ data }: PaneProps) {
  const prefs = data.notifications;

  /* ── matrix: one boolean row per event, one column per channel ── */
  const [matrix, setMatrix] = useState<Triple[]>(() =>
    NOTIFICATION_EVENTS.map((event) => {
      const stored = prefs.matrix[event.key];
      return stored ? ([...stored] as Triple) : ([...event.channels] as Triple);
    }),
  );

  const mapRow = (cells: Triple, fn: (on: boolean, ci: number) => boolean): Triple =>
    [fn(cells[0], 0), fn(cells[1], 1), fn(cells[2], 2)] as Triple;

  const setCell = (row: number, col: number, next: boolean) => {
    setMatrix((prev) =>
      prev.map((cells, ri) =>
        ri === row ? mapRow(cells, (on, ci) => (ci === col ? next : on)) : cells,
      ),
    );
  };

  /** F17 — a column toggle drives every checkbox beneath it. */
  const setColumn = (col: number, next: boolean) => {
    setMatrix((prev) =>
      prev.map((cells) => mapRow(cells, (on, ci) => (ci === col ? next : on))),
    );
  };

  const columnAllOn = (col: number) => matrix.every((cells) => cells[col] === true);

  /** Donor `data-nall="1"`. */
  const enableAll = () => setMatrix((prev) => prev.map((cells) => mapRow(cells, () => true)));

  /** Donor `data-nall="0"` — only the Email column survives. */
  const emailOnly = () =>
    setMatrix((prev) => prev.map((cells) => mapRow(cells, (_, ci) => ci === EMAIL_COLUMN_INDEX)));

  /** "Send test notification" has no path behind it, so it gets no handler. */
  const footerHandler = (action: MatrixAction): (() => void) | undefined => {
    if (action === "enable-all") return enableAll;
    if (action === "email-only") return emailOnly;
    return undefined;
  };

  /* ── delivery ── */
  const [quietFrom, setQuietFrom] = useState(prefs.quietFrom);
  const [quietTo, setQuietTo] = useState(prefs.quietTo);
  const [digest, setDigest] = useState(prefs.digest);
  const [sms, setSms] = useState(prefs.sms);
  const [delivery, setDelivery] = useState<Record<DeliveryToggleKey, boolean>>({
    muteWeekends: prefs.muteWeekends,
    desktopPush: prefs.desktopPush,
    soundOnLead: prefs.soundOnLead,
  });

  const save = () => {
    const next: Record<string, Triple> = {};
    NOTIFICATION_EVENTS.forEach((event, ri) => {
      next[event.key] = matrix[ri] ?? ([...event.channels] as Triple);
    });
    return updateNotificationPrefs({
      matrix: next,
      quietFrom,
      quietTo,
      digest,
      sms,
      ...delivery,
    });
  };

  return (
    <>
      <section className="sc">
        <div className="sc-h">
          <div>
            <div className="sc-t">{NOTIFICATIONS_CARD.title}</div>
            <div className="sc-s">{NOTIFICATIONS_CARD.sub}</div>
          </div>
          {/* Counted from the event list, never typed. */}
          <span className={`badge2 ${notificationCountBadge(NOTIFICATION_EVENTS.length).tone}`}>
            <i />
            {notificationCountBadge(NOTIFICATION_EVENTS.length).label}
          </span>
        </div>

        <div className="sc-b">
          <div className="nwrap">
            <table className="ntab" id="nmatrix">
              <colgroup>
                <col />
                {NOTIFICATION_CHANNELS.map((channel) => (
                  <col className="nc" key={channel} />
                ))}
              </colgroup>

              <thead>
                <tr>
                  <th>{NOTIFICATION_EVENT_COLUMN}</th>
                  {NOTIFICATION_CHANNELS.map((channel, ci) => (
                    <th key={channel}>
                      <span className="nhead">{channel}</span>
                      {/* F17 — the "All" badge is a real control now: the same
                          square checkbox as the column's cells. */}
                      <span className="colw">
                        <Cbx
                          checked={columnAllOn(ci)}
                          onChange={(next) => setColumn(ci, next)}
                          ariaLabel={`${NOTIFICATION_COLUMN_LABEL} ${channel}`}
                        />
                        <span className="colw-l">{NOTIFICATION_COLUMN_LABEL}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {NOTIFICATION_EVENTS.map((event, ri) => (
                  <tr key={event.key}>
                    <td>
                      {/* F16 — icon box before the event text. */}
                      <span className="nrow">
                        <span className="nev-ic">
                          <svg className="ic">
                            <use href={`#${event.icon}`} />
                          </svg>
                        </span>
                        <span className="nrow-t">
                          <span className="nev">{event.name}</span>
                          <span className="nsub">{event.sub}</span>
                        </span>
                      </span>
                    </td>
                    {NOTIFICATION_CHANNELS.map((channel, ci) => (
                      <td key={channel}>
                        <Cbx
                          checked={matrix[ri]?.[ci] ?? false}
                          onChange={(next) => setCell(ri, ci, next)}
                          ariaLabel={`${channel} — ${event.name}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="nfoot">
            {NOTIFICATION_FOOTER_ACTIONS.map((action) => (
              <button
                key={action.action}
                className="btn btn-ghost"
                type="button"
                style={NFOOT_BTN_STYLE}
                onClick={footerHandler(action.action)}
              >
                <svg className="ic">
                  <use href={`#${action.icon}`} />
                </svg>
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="sc">
        <div className="sc-h">
          <div>
            <div className="sc-t">{DELIVERY_CARD.title}</div>
            <div className="sc-s">{DELIVERY_CARD.sub}</div>
          </div>
        </div>

        <div className="sc-b">
          <div className="fgrid">
            {/* F10 — donor <select class="fin"> becomes the custom Sel. */}
            <Sel
              label={QUIET_FROM_SELECT.label}
              value={quietFrom}
              options={QUIET_FROM_SELECT.options}
              onChange={setQuietFrom}
            />
            <Sel
              label={QUIET_TO_SELECT.label}
              value={quietTo}
              options={QUIET_TO_SELECT.options}
              onChange={setQuietTo}
            />
          </div>

          <div style={{ marginTop: "14px" }}>
            <div className="fgrid">
              <Sel
                label={DIGEST_SELECT.label}
                value={digest}
                options={DIGEST_SELECT.options}
                onChange={setDigest}
              />
              <Field label={SMS_NUMBER_LABEL} value={sms} onChange={setSms} />
            </div>
          </div>

          <div style={{ marginTop: "6px" }}>
            {DELIVERY_TOGGLES.map((row) => (
              <div className="trow" key={row.key}>
                <span className="trow-b">
                  <span className="trow-n">{row.name}</span>
                  <span className="trow-d">{row.desc}</span>
                </span>
                <Toggle
                  checked={delivery[row.key]}
                  onChange={(next) =>
                    setDelivery((prev) => ({ ...prev, [row.key]: next }))
                  }
                  ariaLabel={row.name}
                />
              </div>
            ))}
          </div>
        </div>

        {/* One blob, one Save bar — it writes the matrix and the delivery rules
            together, so the matrix card above needs none of its own. */}
        <SaveBar onSave={save} />
      </section>
    </>
  );
}
