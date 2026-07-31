"use client";

// Settings blueprint — ACCOUNT pane (donor lines 2014-2034).
//
// Cards, in donor order: Profile · Business · Security · Danger zone.
//
// The pane wrapper (`.pane`) and its `.pane-h` header belong to
// settings-content.tsx; this file starts at the first `<section class="sc">`.
// Class names are plain global strings — the stylesheet scopes every rule as
// `.bp :global(.content SEL)`, so the module is never imported here.
//
// Owner fixes applied in this file:
//   F1  — Security's three stacked `.prow` rows became one `.seccols` row of
//         three `.seccol` columns, each ending in a `.seccol-act` button.
//   F2  — Danger zone's Delete button sits at the right end of the
//         title + description row via `.prow--flush` + `.prow-act`.
//   F7  — inherited: `.btn-sm` centres its own label (CSS-side).
//   F13 — deliberately NOT applied here; see the note above the Security card.

import type { Badge, CardHead } from "../settings-data";
import {
  BUSINESS_CARD,
  BUSINESS_FIELDS,
  DANGER_CARD,
  DANGER_ZONE,
  PROFILE_CARD,
  PROFILE_FIELDS,
  SECURITY_CARD,
  SECURITY_ITEMS,
} from "../settings-data";
import { Field, SaveBar } from "../ui";

/* ─────────────────────────── local helpers ─────────────────────────── */

/** Donor `<span class="badge2 bg-…"><i></i>LABEL</span>`. */
function Badge2({ badge }: { badge: Badge }) {
  return (
    <span className={`badge2 ${badge.tone}`}>
      <i />
      {badge.label}
    </span>
  );
}

/** Donor `.sc-h`: title + sub in one `<div>`, optional badge pushed right. */
function CardHeader({ card }: { card: CardHead }) {
  return (
    <div className="sc-h">
      <div>
        <div className="sc-t">{card.title}</div>
        <div className="sc-s">{card.sub}</div>
      </div>
      {card.badge ? <Badge2 badge={card.badge} /> : null}
    </div>
  );
}

/* ──────────────────────────────── pane ─────────────────────────────── */

export function AccountPane() {
  return (
    <>
      {/* ── Profile ── */}
      <section className="sc">
        <CardHeader card={PROFILE_CARD} />
        <div className="sc-b">
          <div className="fgrid">
            {PROFILE_FIELDS.map((f) => (
              <Field key={f.label} label={f.label} value={f.value} disabled={f.disabled} />
            ))}
          </div>
        </div>
        <SaveBar />
      </section>

      {/* ── Business ── */}
      <section className="sc">
        <CardHeader card={BUSINESS_CARD} />
        <div className="sc-b">
          <div className="fgrid">
            {BUSINESS_FIELDS.map((f) => (
              <Field key={f.label} label={f.label} value={f.value} disabled={f.disabled} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Security (F1) ──
          No `sc-b--rows` here: F13 exists because `.sc-b`'s 18px stacked on top
          of `.prow`'s 14px. `.seccol` carries no vertical padding of its own,
          so the card body's 18px is already the only vertical space and the
          4px modifier would crush the columns against the card edge. */}
      <section className="sc">
        <CardHeader card={SECURITY_CARD} />
        <div className="sc-b">
          <div className="seccols">
            {SECURITY_ITEMS.map((item) => (
              <div className="seccol" key={item.name}>
                <span className="prow-ic">
                  <svg className="ic">
                    <use href={`#${item.icon}`} />
                  </svg>
                </span>
                <span className="prow-n">{item.name}</span>
                <span className="prow-d">{item.desc}</span>
                {item.badge ? <Badge2 badge={item.badge} /> : null}
                <button className="btn btn-ghost btn-sm seccol-act" type="button">
                  {item.action}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Danger zone (F2) ──
          Same reasoning as Security: `.prow--flush` is `padding: 0`, so the
          card body's 18px is the whole frame and `sc-b--rows` would not apply. */}
      <section className="sc">
        <CardHeader card={DANGER_CARD} />
        <div className="sc-b">
          <div className="prow prow--flush">
            <span className="prow-b">
              <span className="prow-n">{DANGER_ZONE.name}</span>
              <span className="prow-d">{DANGER_ZONE.desc}</span>
            </span>
            <span className="prow-act">
              <button className="btn btn-danger btn-sm" type="button">
                {DANGER_ZONE.action.icon ? (
                  <svg className="ic">
                    <use href={`#${DANGER_ZONE.action.icon}`} />
                  </svg>
                ) : null}
                {DANGER_ZONE.action.label}
              </button>
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
