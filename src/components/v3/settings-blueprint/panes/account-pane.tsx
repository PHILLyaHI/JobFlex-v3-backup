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
//
// REAL DATA. Profile is the signed-in User row (name / email / phone / role);
// Business is the Organization row. Two writes:
//   Profile  → updateProfile  (own user only, any role)
//   Business → updateBusiness (manager-gated; the Save button is disabled for
//              a role that may see the org but not edit it)
// Security's three columns are honest: password change hands off to the real
// /auth/forgot flow, two-factor is not built and says so, and "active sessions"
// reports the one session doing the reading. Danger zone stays inert by design.

import { useState } from "react";

import { updateBusiness, updateProfile } from "@/actions/accountSettings";
import type { Badge, CardHead, PaneProps, SecurityKey } from "../settings-data";
import {
  BUSINESS_CARD,
  BUSINESS_LABELS,
  DANGER_CARD,
  DANGER_ZONE,
  PROFILE_CARD,
  PROFILE_LABELS,
  SECURITY_CARD,
  SECURITY_ITEMS,
  dangerZoneDesc,
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
function CardHeader({ card, badge }: { card: CardHead; badge?: Badge }) {
  const shown = badge ?? card.badge;
  return (
    <div className="sc-h">
      <div>
        <div className="sc-t">{card.title}</div>
        <div className="sc-s">{card.sub}</div>
      </div>
      {shown ? <Badge2 badge={shown} /> : null}
    </div>
  );
}

/* ──────────────────────────────── pane ─────────────────────────────── */

export function AccountPane({ data }: PaneProps) {
  const a = data.account;

  const [name, setName] = useState(a.name);
  const [phone, setPhone] = useState(a.phone);

  const [bizName, setBizName] = useState(a.business.name);
  const [bizAddress, setBizAddress] = useState(a.business.address);
  const [bizWebsite, setBizWebsite] = useState(a.business.website);
  const [bizPhone, setBizPhone] = useState(a.business.phone);

  const securityDesc: Record<SecurityKey, string> = {
    password: a.security.passwordDesc,
    twofactor: a.security.twoFactorDesc,
    sessions: a.security.sessionsDesc,
  };

  return (
    <>
      {/* ── Profile ── */}
      <section className="sc">
        <CardHeader
          card={PROFILE_CARD}
          badge={{ label: a.roleBadge, tone: "bg-live" }}
        />
        <div className="sc-b">
          <div className="fgrid">
            <Field label={PROFILE_LABELS.name} value={name} onChange={setName} />
            <Field label={PROFILE_LABELS.email} value={a.email} disabled />
            <Field label={PROFILE_LABELS.phone} value={phone} onChange={setPhone} />
            <Field label={PROFILE_LABELS.role} value={a.role} disabled />
          </div>
        </div>
        <SaveBar onSave={() => updateProfile({ name, phone })} />
      </section>

      {/* ── Business ── */}
      <section className="sc">
        <CardHeader card={BUSINESS_CARD} />
        <div className="sc-b">
          <div className="fgrid">
            <Field
              label={BUSINESS_LABELS.name}
              value={bizName}
              onChange={setBizName}
              disabled={!a.canEditBusiness}
            />
            <Field
              label={BUSINESS_LABELS.address}
              value={bizAddress}
              onChange={setBizAddress}
              disabled={!a.canEditBusiness}
            />
            <Field
              label={BUSINESS_LABELS.website}
              value={bizWebsite}
              onChange={setBizWebsite}
              disabled={!a.canEditBusiness}
            />
            <Field
              label={BUSINESS_LABELS.phone}
              value={bizPhone}
              onChange={setBizPhone}
              disabled={!a.canEditBusiness}
            />
          </div>
        </div>
        <SaveBar
          disabled={!a.canEditBusiness}
          onSave={() =>
            updateBusiness({
              name: bizName,
              address: bizAddress,
              website: bizWebsite,
              phone: bizPhone,
            })
          }
        />
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
              <div className="seccol" key={item.key}>
                <span className="prow-ic">
                  <svg className="ic">
                    <use href={`#${item.icon}`} />
                  </svg>
                </span>
                <span className="prow-n">{item.name}</span>
                <span className="prow-d">{securityDesc[item.key]}</span>
                {item.badge ? <Badge2 badge={item.badge} /> : null}
                {/* Password is the only real one: it hands off to the live
                    reset flow. Two-factor is not built and active sessions has
                    nothing to revoke beyond this one, so both stay inert. */}
                {item.key === "password" ? (
                  <a className="btn btn-ghost btn-sm seccol-act" href={a.forgotHref}>
                    {item.action}
                  </a>
                ) : (
                  <button className="btn btn-ghost btn-sm seccol-act" type="button">
                    {item.action}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Danger zone (F2) ──
          Same reasoning as Security: `.prow--flush` is `padding: 0`, so the
          card body's 18px is the whole frame and `sc-b--rows` would not apply.
          The Delete button is deliberately inert — deleting a workspace is out
          of scope for this page. */}
      <section className="sc">
        <CardHeader card={DANGER_CARD} />
        <div className="sc-b">
          <div className="prow prow--flush">
            <span className="prow-b">
              <span className="prow-n">{DANGER_ZONE.name}</span>
              <span className="prow-d">{dangerZoneDesc(a.business.name)}</span>
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
