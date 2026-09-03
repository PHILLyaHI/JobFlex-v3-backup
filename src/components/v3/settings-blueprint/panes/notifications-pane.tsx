"use client";

// Settings blueprint — Notifications pane.
//
// The matrix is REAL: two channels per event (In-app · Email). The in-app
// column filters the bell feed (recentNotifications); the email column gates
// every office email to this member. The event list is the one the app can
// actually produce — src/lib/notificationPrefsShared.ts — and an event nobody
// emails carries an "In-app only" tag in its Email cell rather than a ghost
// checkbox that looks unticked.
//
// GONE (owner's call, 2026-09-03): the Delivery card. Quiet hours and the
// weekend mute no longer exist — an Email cell that is on always sends.
//
// "Send test notification" writes a TEST row only this user's bell shows,
// and mails them if the saved prefs allow it.

import { useState } from "react";
import { useRouter } from "next/navigation";

import { updateNotificationPrefs } from "@/actions/accountSettings";
import { sendTestNotification } from "@/actions/notifications";
import { Cbx, SaveBar, actionError } from "../ui";
import type { MatrixAction, PaneProps, PrefKey } from "../settings-data";
import {
  EMAIL_COLUMN_INDEX,
  EMAIL_UNAVAILABLE_TAG,
  EMAIL_UNAVAILABLE_TITLE,
  NOTIFICATIONS_CARD,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_COLUMN_LABEL,
  NOTIFICATION_EVENT_COLUMN,
  NOTIFICATION_FOOTER_ACTIONS,
  NOTIFICATION_ICONS,
  PREF_EVENTS,
  TEST_RESULT_COPY,
} from "../settings-data";

type Pair = [boolean, boolean];

export function NotificationsPane({ data }: PaneProps) {
  const { prefs } = data.notifications;
  const router = useRouter();

  const [matrix, setMatrix] = useState<Pair[]>(() =>
    PREF_EVENTS.map((event) => {
      const stored = prefs.matrix[event.key];
      return stored ? ([stored[0], stored[1]] as Pair) : ([event.seed[0], event.seed[1]] as Pair);
    }),
  );

  const available = (ri: number, ci: number) => ci !== EMAIL_COLUMN_INDEX || PREF_EVENTS[ri].emailAvailable;

  const setCell = (row: number, col: number, next: boolean) => {
    if (!available(row, col)) return;
    setMatrix((prev) => prev.map((cells, ri) => (ri === row ? (cells.map((on, ci) => (ci === col ? next : on)) as Pair) : cells)));
  };
  const setColumn = (col: number, next: boolean) => {
    setMatrix((prev) =>
      prev.map((cells, ri) => cells.map((on, ci) => (ci === col ? (available(ri, ci) ? next : false) : on)) as Pair),
    );
  };
  const columnAllOn = (col: number) =>
    matrix.every((cells, ri) => !available(ri, col) || cells[col] === true);

  const enableAll = () =>
    setMatrix((prev) => prev.map((cells, ri) => cells.map((_, ci) => available(ri, ci)) as Pair));
  const emailOnly = () =>
    setMatrix((prev) =>
      prev.map((cells, ri) => cells.map((_, ci) => ci === EMAIL_COLUMN_INDEX && available(ri, ci)) as Pair),
    );

  const [testNote, setTestNote] = useState("");
  const [testing, setTesting] = useState(false);
  async function test() {
    setTesting(true);
    setTestNote("");
    try {
      const res = await sendTestNotification();
      setTestNote(TEST_RESULT_COPY[res.email]);
      router.refresh();
    } catch (e) {
      setTestNote(actionError(e));
    } finally {
      setTesting(false);
    }
  }

  const footerHandler = (action: MatrixAction): (() => void) => {
    if (action === "enable-all") return enableAll;
    if (action === "email-only") return emailOnly;
    return () => void test();
  };

  const save = () => {
    const next: Record<string, Pair> = {};
    PREF_EVENTS.forEach((event, ri) => {
      next[event.key] = matrix[ri] ?? ([event.seed[0], event.seed[1]] as Pair);
    });
    return updateNotificationPrefs({ matrix: next });
  };

  return (
    <section className="sc">
      <div className="sc-h">
        <div>
          <div className="sc-t">{NOTIFICATIONS_CARD.title}</div>
          <div className="sc-s">{NOTIFICATIONS_CARD.sub}</div>
        </div>
      </div>

      {/* The matrix runs wall to wall: every row rule and the header band
          meet the card frame, like a ledger. */}
      <div className="sc-b sc-b--matrix">
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
                <th>
                  <span className="nhead">{NOTIFICATION_EVENT_COLUMN}</span>
                </th>
                {NOTIFICATION_CHANNELS.map((channel, ci) => (
                  <th key={channel}>
                    <span className="nhead">{channel}</span>
                    {/* The column master is a framed chip, not a bare box —
                        a bare box in the header read as one more data cell. */}
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
              {PREF_EVENTS.map((event, ri) => (
                <tr key={event.key}>
                  <td>
                    <span className="nrow">
                      <span className="nev-ic">
                        <svg className="ic">
                          <use href={`#${NOTIFICATION_ICONS[event.key as PrefKey]}`} />
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
                      {available(ri, ci) ? (
                        <Cbx
                          checked={matrix[ri]?.[ci] ?? false}
                          onChange={(next) => setCell(ri, ci, next)}
                          ariaLabel={`${channel} — ${event.name}`}
                        />
                      ) : (
                        <span className="ncell-off" title={EMAIL_UNAVAILABLE_TITLE}>
                          {EMAIL_UNAVAILABLE_TAG}
                        </span>
                      )}
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
              className="btn btn-ghost btn-sm nfoot-b"
              type="button"
              disabled={action.action === "test" && testing}
              onClick={footerHandler(action.action)}
            >
              <svg className="ic">
                <use href={`#${action.icon}`} />
              </svg>
              {action.label}
            </button>
          ))}
          {testNote ? (
            <span className="nfoot-note" role="status">
              {testNote}
            </span>
          ) : null}
        </div>
      </div>
      <SaveBar onSave={save} />
    </section>
  );
}
