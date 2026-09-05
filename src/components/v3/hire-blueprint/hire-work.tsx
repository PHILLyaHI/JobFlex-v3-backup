"use client";

// Work side — the COMPOSER (left) and YOUR POSTS (right).
//
// One post is one TradeJob: trade, headline, city, rate, details. Posting
// writes through the result-envelope wrapper (a thrown message is redacted in
// production; a returned one is not) and the parent patches both lists, so the
// new row lands with a short flash and the poster is told how many contractors
// it went out to.
//
// OWNER CALLS, 2026-09-03:
//  · the Specialties chip field is GONE. A trade, a headline and a rate say
//    what a person does; a second taxonomy on top of the trade was a field to
//    fill in, not information anyone read. Posts now carry `specialties: []`,
//    which the broadcast matcher already handles — it falls back to matching on
//    the trade alone.
//  · "Mark filled" is GONE. A post you are done with is deleted.
//  · Delete had to stop feeling slow. It is optimistic now: the row leaves on
//    the click and comes back only if the server refuses, so the wait is the
//    server's problem, not the user's.
//  · Both dropdowns are the page's own drawn control (HireSelect) — the trade
//    one searchable, because twenty-one trades is too many to hunt through.

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { attachPlacesSuggest } from "@/components/v3/blueprint-shell/places-suggest";
import {
  getPostInterest,
  markPostInterestSeen,
  type InterestedPartyDTO,
} from "@/actions/tradeServices";
import { HireSelect } from "./hire-select";
import {
  RATE_UNITS,
  STATUS_LABEL,
  TRADES,
  agoLabel,
  formatPhone,
  parseRate,
  unitShort,
  type HireOwnPost,
  type PostDraft,
  type RateUnit,
} from "./hire-data";

type Result = Promise<string | null>;

/** The unit picker stores "hour" and reads "per hour". */
const UNIT_KEYS: readonly string[] = RATE_UNITS.map((u) => u.key);
const UNIT_LABELS: Record<string, string> = Object.fromEntries(
  RATE_UNITS.map((u) => [u.key, u.label]),
);

export function HireWork({
  mine,
  editing,
  canPost,
  draft,
  onDraft,
  onPost,
  onSave,
  onCancelEdit,
  onEdit,
  onDelete,
  seenPosts,
  onPostSeen,
}: {
  mine: HireOwnPost[];
  editing: HireOwnPost | null;
  canPost: boolean;
  /** The draft lives in the PARENT. This component is keyed on the post being
   *  edited, so holding it here meant a half-typed post died the moment you
   *  pressed Edit on a row or switched sides. */
  draft: PostDraft;
  onDraft: (next: PostDraft) => void;
  onPost: (draft: PostDraft) => Promise<{ error: string | null; broadcastCount: number }>;
  onSave: (id: string, draft: PostDraft) => Result;
  onCancelEdit: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => Result;
  /** Posts whose answers have been opened this visit — owned by the parent,
   *  which draws the unseen total on the Work tab. */
  seenPosts: ReadonlySet<string>;
  onPostSeen: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ count: number } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<string | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [openInterest, setOpenInterest] = useState<string | null>(null);
  const [interest, setInterest] = useState<Record<string, InterestedPartyDTO[] | "loading" | string>>(
    {},
  );

  const cityRef = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((id) => window.clearTimeout(id));
  }, []);

  // City suggestions — the shell's Google Places helper on a plain input
  // (city-only). Without a browser key it just reports what was typed.
  // The picked place has to merge into whatever is on screen NOW, not the
  // draft captured when the field was wired up — hence the mirror, written in
  // an effect rather than during render.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    const el = cityRef.current;
    if (!el) return;
    return attachPlacesSuggest(el, {
      cityOnly: true,
      onPick: (p) => onDraft({ ...draftRef.current, location: p.formatted }),
    });
  }, [canPost, onDraft]);

  // The row that just arrived at the top of Your posts gets the landing flash —
  // including the very first post, which the old guard skipped.
  const prevFirst = useRef<string | null>(mine[0]?.id ?? null);
  const seenOnce = useRef(false);
  useEffect(() => {
    const first = mine[0]?.id ?? null;
    if (seenOnce.current && first && first !== prevFirst.current) {
      setLanded(first);
      later(900, () => setLanded(null));
    }
    prevFirst.current = first;
    seenOnce.current = true;
  }, [mine]);

  const set = <K extends keyof PostDraft>(k: K, v: PostDraft[K]) => onDraft({ ...draft, [k]: v });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!draft.tradeType) return setErr("Pick a trade.");
    if (!draft.title.trim()) return setErr("Give the post a headline.");
    setBusy(true);
    setErr(null);
    if (editing) {
      const msg = await onSave(editing.id, draft);
      setBusy(false);
      if (msg) setErr(msg);
      return;
    }
    const { error, broadcastCount } = await onPost(draft);
    setBusy(false);
    if (error) return setErr(error);
    setDone({ count: broadcastCount });
    later(4000, () => setDone(null));
  };

  /** Delete, optimistically. The row leaves on the click; if the server
   *  refuses, it comes back with the reason. */
  const remove = (id: string) => {
    setConfirmId(null);
    setRowErr(null);
    setLeaving((s) => new Set(s).add(id));
    void onDelete(id).then((msg) => {
      if (!msg) return;
      setLeaving((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      setRowErr(msg);
    });
  };

  const toggleInterest = (id: string) => {
    if (openInterest === id) return setOpenInterest(null);
    setOpenInterest(id);
    // Unfolding IS looking: the post's unseen counter clears here, and the
    // stamp goes to the server without anything on screen waiting for it.
    onPostSeen(id);
    void markPostInterestSeen(id);
    if (interest[id] !== undefined && interest[id] !== "loading") return;
    setInterest((m) => ({ ...m, [id]: "loading" }));
    void getPostInterest(id).then((r) =>
      setInterest((m) => ({ ...m, [id]: r.ok ? r.data : r.message })),
    );
  };

  const visible = mine.filter((p) => !leaving.has(p.id));

  return (
    <div className="hm-split hm-split--work">
      <div className="hm-col hm-rv" style={{ "--i": 1 } as CSSProperties}>
        <section className="card hm-form" aria-label={editing ? "Edit post" : "Post yourself"}>
          <div className="card-head">
            <div className="card-titles">
              <div className="card-title">{editing ? "Edit post" : "Post yourself"}</div>
            </div>
            {editing && (
              <button type="button" className="hm-act" onClick={onCancelEdit}>
                Cancel
              </button>
            )}
          </div>

          {canPost ? (
            <form onSubmit={submit} noValidate>
              <div className="hm-grid2">
                <div className="hm-field">
                  <span className="hm-lbl" id="hm-lbl-trade">
                    Trade
                  </span>
                  <HireSelect
                    value={draft.tradeType}
                    onChange={(v) => set("tradeType", v)}
                    options={TRADES}
                    placeholder="Pick a trade"
                    searchable
                    searchPlaceholder="Type to find a trade"
                    ariaLabel="Trade"
                  />
                </div>
                <label className="hm-field">
                  <span className="hm-lbl">City</span>
                  <input
                    ref={cityRef}
                    className="hm-in"
                    value={draft.location}
                    onChange={(e) => set("location", e.target.value)}
                    placeholder="Snohomish, WA"
                    autoComplete="off"
                    maxLength={160}
                  />
                </label>
              </div>

              <label className="hm-field">
                <span className="hm-lbl">Headline</span>
                <input
                  className="hm-in"
                  value={draft.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="Licensed electrician, 12 years"
                  maxLength={200}
                  required
                />
              </label>

              <div className="hm-field">
                <span className="hm-lbl">Rate</span>
                <div className="hm-rate-row">
                  <span className="hm-money">
                    <span className="hm-cur" aria-hidden="true">
                      $
                    </span>
                    <input
                      inputMode="decimal"
                      value={draft.rateMin}
                      onChange={(e) => set("rateMin", e.target.value.replace(/[^\d.]/g, ""))}
                      placeholder="90"
                      aria-label="Rate from"
                      maxLength={9}
                    />
                  </span>
                  <span className="hm-dash" aria-hidden="true">
                    –
                  </span>
                  <span className="hm-money">
                    <span className="hm-cur" aria-hidden="true">
                      $
                    </span>
                    <input
                      inputMode="decimal"
                      value={draft.rateMax}
                      onChange={(e) => set("rateMax", e.target.value.replace(/[^\d.]/g, ""))}
                      placeholder="150"
                      aria-label="Rate to"
                      maxLength={9}
                    />
                  </span>
                  <HireSelect
                    value={draft.rateUnit}
                    onChange={(v) => set("rateUnit", (v || "hour") as RateUnit)}
                    options={UNIT_KEYS}
                    labels={UNIT_LABELS}
                    placeholder="per hour"
                    ariaLabel="Rate unit"
                    className="hm-unit"
                  />
                </div>
              </div>

              <label className="hm-field">
                <span className="hm-lbl">Details</span>
                <textarea
                  className="hm-in hm-ta"
                  value={draft.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Licenses, years in the trade, availability, what you bring."
                  rows={5}
                  maxLength={20000}
                />
              </label>

              {err && (
                <div className="hm-err" role="alert">
                  {err}
                </div>
              )}

              <p className="hm-note">
                Your name, company, phone and email are shown on the post so people can reach you.
              </p>

              <div className="hm-form-foot">
                <button
                  type="submit"
                  className={"btn btn-primary" + (done ? " is-done" : "")}
                  disabled={busy}
                >
                  <svg className="ic hm-ic" aria-hidden="true">
                    <use href={done ? "#i-check" : "#i-send"} />
                  </svg>
                  {editing
                    ? busy
                      ? "Saving…"
                      : "Save"
                    : done
                      ? "Posted"
                      : busy
                        ? "Posting…"
                        : "Post"}
                </button>
                {editing && (
                  <button type="button" className="btn btn-ghost" onClick={onCancelEdit}>
                    Cancel
                  </button>
                )}
                {done && (
                  <span className="hm-sent" role="status">
                    {done.count > 0
                      ? `Sent to ${done.count} ${done.count === 1 ? "contractor" : "contractors"}`
                      : "Live on the board"}
                  </span>
                )}
              </div>
            </form>
          ) : (
            <div className="hm-empty hm-empty--flush">
              Only owners and managers can post for the company.
            </div>
          )}
        </section>
      </div>

      <div className="hm-col hm-rv" style={{ "--i": 2 } as CSSProperties}>
        <section className="card hm-mine" aria-label="Your posts">
          <div className="card-head">
            <div className="card-titles">
              <div className="card-title">Your posts</div>
            </div>
            {visible.length > 0 && <span className="hm-count">{visible.length}</span>}
          </div>

          {rowErr && (
            <div className="hm-err hm-err--rows" role="alert">
              {rowErr}
            </div>
          )}

          {visible.length ? (
            <div className="hm-mrows">
              {visible.map((p) => {
                const rate = parseRate(p.budget);
                const open = p.status === "OPEN";
                const list = interest[p.id];
                const isOpenList = openInterest === p.id;
                const unseen = seenPosts.has(p.id) ? 0 : p.newInterest;
                return (
                  <div
                    key={p.id}
                    className={
                      "hm-mrow" +
                      (editing?.id === p.id ? " is-editing" : "") +
                      (landed === p.id ? " is-new" : "")
                    }
                  >
                    <div className="hm-mrow-head">
                      <div className="hm-mrow-main">
                        <div className="hm-mrow-top">
                          <b className="hm-name-t" title={p.title}>
                            {p.title}
                          </b>
                          <span className={"chip hm-st hm-st--" + p.status.toLowerCase()}>
                            {STATUS_LABEL[p.status]}
                          </span>
                        </div>
                        <div className="hm-meta">
                          {p.tradeType}
                          {p.location ? ` · ${p.location}` : ""}
                          {rate ? ` · ${rate.amount} ${unitShort(rate.unit)}`.trimEnd() : ""} ·{" "}
                          {agoLabel(p.hoursAgo)}
                        </div>
                      </div>
                      <div className="hm-mrow-side">
                        {p.interestedCount > 0 ? (
                          <button
                            type="button"
                            className={"hm-int" + (unseen > 0 ? " has-new" : "")}
                            aria-expanded={isOpenList}
                            onClick={() => toggleInterest(p.id)}
                          >
                            Interested
                            <b className="hm-int-n">{p.interestedCount}</b>
                            <span className={"hm-int-c" + (isOpenList ? " is-on" : "")} aria-hidden="true" />
                          </button>
                        ) : (
                          <span className="hm-int hm-int--none">No answers yet</span>
                        )}
                        <div className="hm-acts">
                          {open && (
                            <button type="button" className="hm-act" onClick={() => onEdit(p.id)}>
                              Edit
                            </button>
                          )}
                          {confirmId === p.id ? (
                            <>
                              <span className="hm-act-q">Delete?</span>
                              <button
                                type="button"
                                className="hm-act hm-act--danger"
                                onClick={() => remove(p.id)}
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                className="hm-act"
                                onClick={() => setConfirmId(null)}
                              >
                                No
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="hm-act hm-act--danger"
                              onClick={() => setConfirmId(p.id)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {isOpenList && (
                      <div className="hm-ilist">
                        {list === "loading" || list === undefined ? (
                          <div className="hm-ilist-note">Loading…</div>
                        ) : typeof list === "string" ? (
                          <div className="hm-ilist-note hm-ilist-note--bad">{list}</div>
                        ) : list.length === 0 ? (
                          <div className="hm-ilist-note">Nobody has answered yet.</div>
                        ) : (
                          list.map((who) => (
                            <div key={who.id} className="hm-irow">
                              <div className="hm-irow-main">
                                <b className="hm-name-t" title={who.name}>
                                  {who.name}
                                </b>
                                <span className="hm-meta">
                                  {who.company ?? "—"} · {agoLabel(who.agoHours)}
                                </span>
                              </div>
                              <div className="hm-irow-side">
                                <a
                                  className="hm-mono hm-ilink"
                                  href={`mailto:${who.email}?subject=${encodeURIComponent(p.title)}`}
                                >
                                  {who.email}
                                </a>
                                {who.phone && (
                                  <a
                                    className="hm-mono hm-ilink"
                                    href={`tel:${who.phone.replace(/[^\d+]/g, "")}`}
                                  >
                                    {formatPhone(who.phone)}
                                  </a>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="hm-empty">No posts yet.</div>
          )}
        </section>
      </div>
    </div>
  );
}
