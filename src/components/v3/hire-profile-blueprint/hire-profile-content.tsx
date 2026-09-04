"use client";

// MANAGE YOUR PROFILE / BLUEPRINT — the desktop page.
// Route: /dashboard/hire/profile.
//
// WHAT THIS PAGE IS FOR
// The Hire & Work hub used to carry the "open for work" listing form inside a
// panel. That panel became the Post-a-job composer (owner, 2026-08-23) and the
// listing lost its home — the hub's "Manage your profile" row has pointed here
// ever since. This is the page it opens: the caller's TradeNetworkProfile, the
// record that decides whether they appear in other companies' talent
// directories and whether matching trade jobs are broadcast to them.
//
// ── THE ARGUMENT FOR THE PREVIEW ───────────────────────────────────────────
// "Listed" is an abstraction; a ROW is not. The right-hand column draws the
// contractor's own directory row in the talent directory's exact visual
// language — icon tile, name, who, `trades · … — specialties`, the mono
// service area on the right and the hirer's "I'm interested" button — from the
// SAME composition the directory itself uses (`directorySubline`, mirroring
// hire-behavior.ts's `renderTalent`). Switch the toggle off and the row is
// struck through with the dashed "not in the directory" plate, because that is
// literally what the other company sees: nothing.
//
// ── CHROME DROPPED ─────────────────────────────────────────────────────────
// The sidebar, topbar, sprite and graph-paper field come from blueprint-shell,
// mounted in src/app/dashboard/layout.tsx, so this component returns ONLY the
// `.content` children as a fragment — they must stay DIRECT children, because
// the reveal cascade walks `.content > *`.
//
// ── STATE, NOT innerHTML ───────────────────────────────────────────────────
// This is a React tree, not one of the ported behavior modules: rebuilding a
// container's markup would steal focus from the specialty field mid-word.
//
// The whole state machine — including the save — lives in ./use-hire-profile.ts
// and is shared with the handheld build, so the two editions cannot drift.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TRADE_TYPES } from "@/lib/tradeTypes";
import { attachPlacesSuggest } from "@/components/v3/blueprint-shell/places-suggest";
import type { TradeNetworkProfileDTO } from "@/app/(mobile)/trade-services/trade-data";
import { useHireProfileMotion } from "./hire-profile-motion";
import { LIMITS, directorySubline, useHireProfile } from "./use-hire-profile";
import s from "./hire-profile.module.css";
import "./hire-profile-global.css";

/** Hashed module class, or the literal name when the module has none — which is
 *  how the fleet's global `rv` / `rv-in` / `pressed` and the shared blueprint
 *  control `bp-sel` / `bp-sel-in` (blueprint-global.css) pass through. */
function cx(...names: Array<string | false | null | undefined>): string {
  return names
    .filter(Boolean)
    .map((n) => (s as Record<string, string>)[n as string] ?? (n as string))
    .join(" ");
}

export function HireProfileContent({
  profile,
  displayName,
  company,
}: {
  /** The caller's TradeNetworkProfile, read on the server. */
  profile: TradeNetworkProfileDTO;
  /** The name the directory prints — `user.name ?? org.name`, the same
   *  fallback discoverTradeProfiles applies. */
  displayName: string;
  /** The org name the directory prints as the row's headline. */
  company: string | null;
}) {
  useHireProfileMotion(s.btn);
  const hp = useHireProfile(profile);
  const { form, saved } = hp;

  // ── SERVICE AREA — Google Places, city-only ───────────────────────────────
  // The input is UNCONTROLLED on purpose. `attachPlacesSuggest` writes the
  // field itself on a pick, and with no browser key its whole implementation is
  // an `input` listener that reports what was typed — so a controlled value
  // would mean two writers fighting over one field. One writer: the module's
  // `onPick`, which fires on both paths.
  const areaRef = useRef<HTMLInputElement>(null);
  const onArea = useRef(hp.setServiceArea);
  useEffect(() => {
    onArea.current = hp.setServiceArea;
  }, [hp.setServiceArea]);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    return attachPlacesSuggest(el, {
      cityOnly: true,
      onPick: (p) => {
        // A picked city resolves to "Bothell, WA"; free typing reports itself.
        const city = p.city && p.state ? `${p.city}, ${p.state}` : p.formatted || p.address;
        onArea.current(city);
      },
    });
  }, []);
  // A revert has to reach a field React does not control.
  useEffect(() => {
    const el = areaRef.current;
    if (el && el.value !== form.serviceArea) el.value = form.serviceArea;
    // Only on a server-confirmed re-seed / revert, never per keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  // ── SPECIALTIES — a tag field, not a comma-separated string ───────────────
  const [draft, setDraft] = useState("");
  const commitDraft = useCallback(() => {
    if (hp.addSpecialty(draft)) setDraft("");
  }, [draft, hp]);

  const previewSub = directorySubline(form.trades, form.specialties);
  const headline = company || displayName;
  const listed = saved.optIn;

  return (
    <>
      <div className={cx("page-head", "rv")}>
        <div>
          <div className={cx("kicker")}>Hire &amp; Work</div>
          <h1 className={cx("page-title")}>Your listing</h1>
        </div>
        <Link className={cx("btn", "btn-ghost")} href="/dashboard/hire">
          <svg className={cx("ic")}>
            <use href="#i-arrow" />
          </svg>
          Back to Hire
        </Link>
      </div>

      {/* ═══ THE STATE BAND — listed / not listed, and what that buys ═══ */}
      <section className={cx("hp-band", form.optIn && "is-on")} aria-labelledby="hpState">
        <div className={cx("hp-band-main")}>
          <div className={cx("hp-stamp", listed ? "is-listed" : "is-off")}>
            {listed ? "Listed" : "Not listed"}
          </div>
          <div>
            <h2 className={cx("hp-band-t")} id="hpState">
              {listed
                ? "You are in other companies' talent directories"
                : "Nobody can find you yet"}
            </h2>
            <p className={cx("hp-band-m")}>
              <b>Matching trade jobs reach you.</b> When another company posts work in a
              trade you list, the post is broadcast. They see your name, company, trades
              and service area &mdash; never your email &mdash; and their interest arrives
              as a notification.
            </p>
          </div>
        </div>

        <div className={cx("hp-band-side")}>
          <button
            className={cx("hp-sw", form.optIn && "is-on")}
            type="button"
            role="switch"
            aria-checked={form.optIn}
            aria-label="List me in the talent directory"
            onClick={() => hp.setOptIn(!form.optIn)}
            disabled={hp.busy}
          >
            <span className={cx("hp-sw-track")}>
              <span className={cx("hp-sw-knob")} />
            </span>
            <span className={cx("hp-sw-lbl")}>{form.optIn ? "Open for work" : "Off"}</span>
          </button>
          {hp.optInPending ? (
            <span className={cx("hp-pending")}>
              {form.optIn ? "Goes live when you save" : "Comes down when you save"}
            </span>
          ) : null}
        </div>

      </section>

      {/* ═══ THE FORM + THE MIRROR ═══ */}
      <div className={cx("hp-grid")}>
        {/* ── LEFT: what you edit ─────────────────────────────────────────── */}
        <section className={cx("card", "hp-form")}>
          <header className={cx("hp-head")}>
            <h2 className={cx("hp-title")}>Your details</h2>
            <span className={cx("hp-note")}>Everything here is public to other companies</span>
          </header>

          {/* TRADES — a real picker. Every canonical trade is drawn as a
              toggle; nothing is typed, so nothing can be misspelled out of
              the matcher's closed vocabulary (lib/tradeTypes.ts). */}
          <div className={cx("hp-field")}>
            <div className={cx("hp-lbl-row")}>
              <span className={cx("hp-lbl")}>Trades</span>
              <span className={cx("hp-count")}>
                {form.trades.length} / {LIMITS.trades}
              </span>
            </div>
            <div className={cx("hp-chips")} role="group" aria-label="Trades you work in">
              {TRADE_TYPES.map((t) => {
                const on = form.trades.includes(t);
                return (
                  <button
                    className={cx("hp-chip", on && "is-on")}
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => hp.toggleTrade(t)}
                    disabled={hp.busy}
                  >
                    <span className={cx("hp-chip-box")} aria-hidden="true">
                      <svg className={cx("ic")}>
                        <use href="#i-check" />
                      </svg>
                    </span>
                    {t}
                  </button>
                );
              })}
            </div>
            {form.trades.length === 0 ? (
              <p className={cx("hp-hint", "is-warn")}>
                Pick at least one — a listing with no trade matches nothing.
              </p>
            ) : null}
          </div>

          {/* PRIMARY TRADE — not a new column: the directory prints
              `tradeTypes.join(" · ")`, so this rotates index 0. The shared
              blueprint select (blueprint-global.css) draws it — the `.bp-sel`
              wrapper carries the chevron a <select> cannot. */}
          {form.trades.length > 1 ? (
            <label className={cx("hp-field")}>
              <span className={cx("hp-lbl")}>Leads with</span>
              <span className={cx("bp-sel", "hp-sel")}>
                <select
                  className={cx("bp-sel-in")}
                  value={form.trades[0]}
                  onChange={(e) => hp.setPrimaryTrade(e.target.value)}
                  disabled={hp.busy}
                >
                  {form.trades.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </span>
              <span className={cx("hp-hint")}>The trade printed first on your row.</span>
            </label>
          ) : null}

          {/* SPECIALTIES — chips, committed on Enter or comma. */}
          <div className={cx("hp-field")}>
            <div className={cx("hp-lbl-row")}>
              <span className={cx("hp-lbl")}>Specialties</span>
              <span className={cx("hp-count")}>
                {form.specialties.length} / {LIMITS.specialties}
              </span>
            </div>
            <div className={cx("hp-tagbox")}>
              {form.specialties.map((sp) => (
                <span className={cx("hp-tag")} key={sp}>
                  {sp}
                  <button
                    className={cx("hp-tag-x")}
                    type="button"
                    aria-label={`Remove ${sp}`}
                    onClick={() => hp.removeSpecialty(sp)}
                    disabled={hp.busy}
                  >
                    <svg className={cx("ic")}>
                      <use href="#i-x" />
                    </svg>
                  </button>
                </span>
              ))}
              <input
                className={cx("hp-tag-in")}
                value={draft}
                maxLength={LIMITS.entry}
                placeholder={form.specialties.length ? "Add another…" : "Metal roofs, cedar fences, decks…"}
                aria-label="Add a specialty"
                disabled={hp.busy}
                onChange={(e) => {
                  // A typed comma is how people list things — treat it as Enter.
                  if (e.target.value.includes(",")) {
                    const parts = e.target.value.split(",");
                    parts.slice(0, -1).forEach((p) => hp.addSpecialty(p));
                    setDraft(parts[parts.length - 1].trimStart());
                    return;
                  }
                  setDraft(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitDraft();
                  } else if (e.key === "Backspace" && !draft && form.specialties.length) {
                    hp.removeSpecialty(form.specialties[form.specialties.length - 1]);
                  }
                }}
                onBlur={commitDraft}
              />
            </div>
            <span className={cx("hp-hint")}>
              Enter or a comma adds one. These are the words a hirer scans for.
            </span>
          </div>

          {/* SERVICE AREA — Google Places, cities only. With no browser key
              the field degrades to a plain text input that still saves. */}
          <label className={cx("hp-field")}>
            <span className={cx("hp-lbl")}>Service area</span>
            <input
              className={cx("hp-in")}
              ref={areaRef}
              defaultValue={form.serviceArea}
              maxLength={LIMITS.serviceArea}
              placeholder="King County, WA"
              autoComplete="off"
              disabled={hp.busy}
            />
            <span className={cx("hp-hint")}>
              Where you will travel. Printed on your row.
            </span>
          </label>

          {/* ── SAVE ────────────────────────────────────────────────────── */}
          <div className={cx("hp-actions")}>
            <button
              className={cx("btn", "btn-primary", "hp-save")}
              type="button"
              onClick={() => void hp.save()}
              disabled={hp.busy || !hp.dirty}
            >
              {hp.busy ? (
                <span className={cx("hp-save-dot")} aria-hidden="true" />
              ) : (
                <svg className={cx("ic")}>
                  <use href="#i-check" />
                </svg>
              )}
              {hp.busy ? "Saving…" : hp.dirty ? "Save listing" : "Saved"}
            </button>
            {hp.dirty && !hp.busy ? (
              <button className={cx("btn", "btn-ghost")} type="button" onClick={hp.revert}>
                Discard changes
              </button>
            ) : null}
            {hp.saveState === "saved" ? (
              <span className={cx("hp-ok")} role="status">
                <svg className={cx("ic")}>
                  <use href="#i-check" />
                </svg>
                Saved — the directory has it
              </span>
            ) : null}
          </div>
          {hp.error ? (
            <p className={cx("hp-err")} role="alert">
              {hp.error}
            </p>
          ) : null}
        </section>

        {/* ── RIGHT: what everybody else sees ─────────────────────────────── */}
        <aside className={cx("card", "card--flush", "hp-mirror")}>
          <header className={cx("hp-mirror-head")}>
            <span>What hirers see</span>
            <span className={cx("hp-mirror-no")}>DIRECTORY ROW</span>
          </header>

          <div className={cx("hp-mirror-body")}>
            <ul className={cx("hp-tal-list")}>
              <li className={cx("hp-tal-row", !form.optIn && "is-off")}>
                <span className={cx("hp-tal-ic")}>
                  <svg className={cx("ic")}>
                    <use href="#i-hardhat" />
                  </svg>
                </span>
                <span className={cx("hp-tal-main")}>
                  <span className={cx("hp-tal-name")}>{headline}</span>
                  {company && displayName !== company ? (
                    <span className={cx("hp-tal-who")}>{displayName}</span>
                  ) : null}
                  {previewSub ? (
                    <span className={cx("hp-tal-sub")}>{previewSub}</span>
                  ) : (
                    <span className={cx("hp-tal-sub", "is-empty")}>
                      No trades or specialties yet
                    </span>
                  )}
                  {form.serviceArea.trim() ? (
                    <span className={cx("hp-tal-area")}>{form.serviceArea.trim()}</span>
                  ) : null}
                </span>
                <span className={cx("hp-tal-btn")} aria-hidden="true">
                  <svg className={cx("ic")}>
                    <use href="#i-send" />
                  </svg>
                  I&rsquo;m interested
                </span>
              </li>
            </ul>

            {form.optIn ? null : (
              <div className={cx("hp-off-plate")}>
                <b>Not in the directory</b>
                Switch &ldquo;Open for work&rdquo; on and save, and this row appears for
                every other company.
              </div>
            )}
          </div>

          <footer className={cx("hp-mirror-foot")}>
            <div className={cx("hp-mirror-cell")}>
              <span className={cx("hp-mirror-l")}>Trades</span>
              <span className={cx("hp-mirror-v")}>{form.trades.length || "—"}</span>
            </div>
            <div className={cx("hp-mirror-cell")}>
              <span className={cx("hp-mirror-l")}>Specialties</span>
              <span className={cx("hp-mirror-v")}>{form.specialties.length || "—"}</span>
            </div>
            <div className={cx("hp-mirror-cell", "hp-mirror-cell--full")}>
              <span className={cx("hp-mirror-l")}>Service area</span>
              <span className={cx("hp-mirror-v")}>{form.serviceArea.trim() || "Anywhere"}</span>
            </div>
          </footer>
        </aside>
      </div>
    </>
  );
}
