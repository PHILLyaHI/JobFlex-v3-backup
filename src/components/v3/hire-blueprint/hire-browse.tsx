"use client";

// Hire side — the SCHEDULE (left) and the TITLE BLOCK (right).
//
// The schedule is a listbox: one button per post, the selected row carries an
// inset ink frame (the house "selected day" treatment). The title block is the
// selected poster's contact sheet — company / phone / email / JobFlex reviews
// as a boxed grid of labelled cells, the way a drawing's title block names who
// drew it. Two actions at its foot: I'm interested (a bell and an email to the
// poster) and Email (a plain mailto). The viewer's own post shows YOU on the
// row and an Edit button in place of the actions.

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { staggerIn } from "@/components/v3/blueprint-shell/list-motion";
import { HireSelect } from "./hire-select";
import {
  TRADES,
  agoLabel,
  formatPhone,
  initials,
  matchesQuery,
  parseRate,
  unitLabel,
  unitShort,
  type HirePost,
} from "./hire-data";

export function HireBrowse({
  posts,
  onInterest,
  onEdit,
  onGoWork,
}: {
  posts: HirePost[];
  /** Resolves to null on success, or the message to show. */
  onInterest: (id: string) => Promise<string | null>;
  onEdit: (id: string) => void;
  onGoWork: () => void;
}) {
  const [q, setQ] = useState("");
  const [trade, setTrade] = useState("");
  const [selId, setSelId] = useState<string | null>(null);

  const filtered = useMemo(
    () => posts.filter((p) => (!trade || p.tradeType === trade) && matchesQuery(p, q)),
    [posts, q, trade],
  );
  const selected = filtered.find((p) => p.id === selId) ?? filtered[0] ?? null;

  // Rows cascade once, on the first paint of the list — never on a filter
  // keystroke, which would replay the whole list and read as a wipe.
  const rowsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rowsRef.current;
    if (!el) return;
    // Only the rows that can be on screen. The server caps the board at 200,
    // and 200 x 45ms is nine seconds of rows sitting at opacity 0.
    staggerIn(Array.from(el.querySelectorAll<HTMLElement>(".hm-row")).slice(0, 12));
  }, []);

  const focusRow = (id: string) => {
    setSelId(id);
    rowsRef.current?.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!filtered.length) return;
    const i = Math.max(0, filtered.findIndex((p) => p.id === selected?.id));
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : filtered.length - 1;
      focusRow(filtered[(i + step) % filtered.length].id);
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      focusRow((e.key === "Home" ? filtered[0] : filtered[filtered.length - 1]).id);
    }
  };

  const filtering = q.trim() !== "" || trade !== "";

  return (
    <div className={"hm-split" + (selected ? "" : " is-solo")}>
      <div className="hm-col hm-rv" style={{ "--i": 1 } as CSSProperties}>
        <section className="card hm-sheet" aria-label="Open posts">
          <div className="hm-bar">
            <label className="hm-search">
              <svg className="hm-ic" aria-hidden="true">
                <use href="#i-search" />
              </svg>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, company, trade, city"
                aria-label="Search posts"
                autoComplete="off"
              />
            </label>
            <HireSelect
              value={trade}
              onChange={setTrade}
              options={TRADES}
              placeholder="All trades"
              clearLabel="All trades"
              searchable
              searchPlaceholder="Type to find a trade"
              ariaLabel="Filter by trade"
              className="hm-trade"
            />
            {/* Only while filtering. Unfiltered it restated the page kicker
                word for word, which the brief bans outright. */}
            {filtering && (
              <span className="hm-count" aria-live="polite">
                {filtered.length} of {posts.length}
              </span>
            )}
          </div>

          {filtered.length ? (
            <div
              className="hm-rows"
              role="listbox"
              aria-label="Posts"
              ref={rowsRef}
              onKeyDown={onKey}
            >
              {filtered.map((p) => {
                const rate = parseRate(p.budget);
                const isSel = selected?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    data-id={p.id}
                    // Roving tabindex — the listbox pattern wants ONE tabbable
                    // option, not 200 stops between the filter and the detail.
                    tabIndex={isSel ? 0 : -1}
                    className={"hm-row" + (isSel ? " is-sel" : "")}
                    onClick={() => setSelId(p.id)}
                  >
                    <span className="hm-plate" aria-hidden="true">
                      {initials(p.postedBy)}
                    </span>
                    <span className="hm-main">
                      <span className="hm-name">
                        <b className="hm-name-t">{p.postedBy}</b>
                        {p.isOwnPost && <span className="hm-you">You</span>}
                        {p.isMine && !p.isOwnPost && <span className="hm-you hm-you--org">Your company</span>}
                        {!p.isMine && p.viewerStatus === "INTERESTED" && (
                          <span className="chip ok hm-chip-sm">Interested</span>
                        )}
                      </span>
                      <span className="hm-title">{p.title}</span>
                      <span className="hm-meta">
                        {p.tradeType} · {p.location ?? p.company} · {agoLabel(p.hoursAgo)}
                      </span>
                    </span>
                    {rate && (
                      /* An unparsed budget is free text up to 80 characters
                         (the other composer writes it that way). Given the
                         auto track and nowrap it once took the whole row, so
                         only a PARSED figure gets the numeral treatment. */
                      <span className={"hm-rate" + (rate.unit ? "" : " hm-rate--raw")}>
                        <b>{rate.amount}</b>
                        {rate.unit && <span className="hm-rate-unit">{unitShort(rate.unit)}</span>}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : posts.length ? (
            <div className="hm-empty">
              No posts match.
              <button
                type="button"
                className="btn btn-ghost hm-btn-sm"
                onClick={() => {
                  setQ("");
                  setTrade("");
                }}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="hm-empty">
              No one has posted yet.
              <button type="button" className="btn btn-primary" onClick={onGoWork}>
                <svg className="ic hm-ic" aria-hidden="true">
                  <use href="#i-pen" />
                </svg>
                Post yourself
              </button>
            </div>
          )}
        </section>
      </div>

      {selected && (
        <aside
          className="hm-col hm-detail hm-rv"
          style={{ "--i": 2 } as CSSProperties}
          aria-label="Post detail"
        >
          <TitleBlock key={selected.id} post={selected} onInterest={onInterest} onEdit={onEdit} />
        </aside>
      )}
    </div>
  );
}

/** Five drawn squares — the chart-point language, used as a rating scale. */
function Squares({ value }: { value: number }) {
  const on = Math.round(value);
  return (
    <span className="hm-sqs" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={"hm-sq" + (i <= on ? " is-on" : "")} />
      ))}
    </span>
  );
}

function TitleBlock({
  post,
  onInterest,
  onEdit,
}: {
  post: HirePost;
  onInterest: (id: string) => Promise<string | null>;
  onEdit: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rate = parseRate(post.budget);
  const { reviews } = post;
  const mailto = `mailto:${post.email}?subject=${encodeURIComponent(`${post.title} — JobFlex`)}`;

  const interested = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const msg = await onInterest(post.id);
    setBusy(false);
    if (msg) setErr(msg);
  };

  return (
    <article className="card hm-tb">
      <header className="hm-tb-head">
        <div className="hm-tb-who">
          <h2 className="hm-tb-name">{post.postedBy}</h2>
          <div className="hm-tb-meta">
            {post.tradeType}
            {post.location ? ` · ${post.location}` : ""} · posted {agoLabel(post.hoursAgo)}
          </div>
        </div>
        {rate && (
          <div className="hm-tb-rate">
            <b>{rate.amount}</b>
            {rate.unit && <span>{unitLabel(rate.unit)}</span>}
          </div>
        )}
      </header>

      <div className="hm-tb-body">
        <p className="hm-tb-title">{post.title}</p>
        {post.description.trim() && <p className="hm-tb-desc">{post.description.trim()}</p>}
        {post.specialties.length > 0 && (
          <div className="hm-tb-tags">
            {post.specialties.map((s) => (
              <span key={s} className="tag">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>

      <dl className="hm-tb-grid">
        <div className="hm-tb-cell">
          <dt>Company</dt>
          <dd>{post.company}</dd>
        </div>
        <div className="hm-tb-cell">
          <dt>Phone</dt>
          <dd>
            {post.phone ? (
              <a className="hm-mono" href={`tel:${post.phone.replace(/[^\d+]/g, "")}`}>
                {formatPhone(post.phone)}
              </a>
            ) : (
              <span className="hm-dim">Not listed</span>
            )}
          </dd>
        </div>
        <div className="hm-tb-cell">
          <dt>Email</dt>
          <dd>
            <a className="hm-mono" href={mailto}>
              {post.email}
            </a>
          </dd>
        </div>
        <div className="hm-tb-cell">
          <dt>JobFlex reviews</dt>
          <dd>
            {reviews.count > 0 && reviews.avg != null ? (
              <span
                className="hm-rating"
                aria-label={`${reviews.avg.toFixed(1)} out of 5 from ${reviews.count} reviews`}
              >
                <Squares value={reviews.avg} />
                {reviews.avg.toFixed(1)} · {reviews.count} {reviews.count === 1 ? "review" : "reviews"}
              </span>
            ) : (
              <span className="hm-dim">No reviews yet</span>
            )}
          </dd>
        </div>
      </dl>

      {reviews.latest.length > 0 && (
        <div className="hm-tb-reviews">
          {reviews.latest.map((r, i) => (
            <blockquote key={i} className="hm-quote">
              <div className="hm-quote-k">
                <Squares value={r.rating} />
                <span>
                  {r.client ?? "Client"} · {r.when}
                </span>
              </div>
              <p>{r.comment}</p>
            </blockquote>
          ))}
        </div>
      )}

      {err && (
        <div className="hm-err" role="alert">
          {err}
        </div>
      )}

      <footer className="hm-tb-foot">
        {post.isOwnPost ? (
          <>
            <span className="hm-stamp">Your post</span>
            <button type="button" className="btn btn-ghost" onClick={() => onEdit(post.id)}>
              <svg className="ic hm-ic" aria-hidden="true">
                <use href="#i-pen" />
              </svg>
              Edit
            </button>
          </>
        ) : post.isMine ? (
          /* A colleague at your own company wrote this. Only its author may
             edit it, and interest is refused org-internally, so the foot says
             whose it is and offers the one thing that still works. */
          <>
            <span className="hm-stamp hm-stamp--org">Posted by your company</span>
            <a className="btn btn-ghost" href={mailto}>
              <svg className="ic hm-ic" aria-hidden="true">
                <use href="#i-send" />
              </svg>
              Email
            </a>
          </>
        ) : post.viewerStatus === "INTERESTED" ? (
          <>
            <span className="chip ok hm-chip-lg">
              <svg className="hm-ic" aria-hidden="true">
                <use href="#i-check" />
              </svg>
              Interested · they know
            </span>
            <a className="btn btn-ghost" href={mailto}>
              <svg className="ic hm-ic" aria-hidden="true">
                <use href="#i-send" />
              </svg>
              Email
            </a>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={interested}
            >
              <svg className="ic hm-ic" aria-hidden="true">
                <use href="#i-thumb" />
              </svg>
              {busy ? "Sending…" : "I'm interested"}
            </button>
            <a className="btn btn-ghost" href={mailto}>
              <svg className="ic hm-ic" aria-hidden="true">
                <use href="#i-send" />
              </svg>
              Email
            </a>
          </>
        )}
      </footer>
    </article>
  );
}
