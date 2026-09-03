"use client";

// Settings blueprint — ACCOUNT pane.
//
// Cards, in donor order: Profile · Business · Security.
//
// REAL DATA. Profile is the signed-in User row (name / email / phone) and a
// red "Log out" at the foot of the pane; Business is the Organization row
// (manager-gated). Security: password hands off to /auth/forgot, "Log out
// everywhere" and the page-level "Log out" are the SAME action now (owner's
// call, 2026-09-03): bump the credential epoch so every other device's token
// dies on its next request, then sign this browser out.
//
// GONE (owner's call, 2026-09-03): the Role field (the header badge already
// says it) and the Danger zone card — deleteOrganization stays in
// src/actions/accountSettings.ts, nothing on this page calls it.

import { useState } from "react";

import { updateBusiness, updateProfile } from "@/actions/accountSettings";
import { SignOutButton, logOutEverywhere } from "@/components/v3/blueprint-shell/sign-out";
import type { Badge, CardHead, PaneProps, SecurityKey } from "../settings-data";
import {
  BUSINESS_CARD,
  BUSINESS_LABELS,
  PROFILE_CARD,
  PROFILE_LABELS,
  SECURITY_CARD,
  SECURITY_ITEMS,
  SIGN_OUT_LABEL,
} from "../settings-data";
import { Field, SaveBar } from "../ui";

function Badge2({ badge }: { badge: Badge }) {
  return (
    <span className={`badge2 ${badge.tone}`}>
      <i />
      {badge.label}
    </span>
  );
}

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

export function AccountPane({ data }: PaneProps) {
  const a = data.account;

  const [name, setName] = useState(a.name);
  const [phone, setPhone] = useState(a.phone);

  const [bizName, setBizName] = useState(a.business.name);
  const [bizAddress, setBizAddress] = useState(a.business.address);
  const [bizWebsite, setBizWebsite] = useState(a.business.website);
  const [bizPhone, setBizPhone] = useState(a.business.phone);

  const [signingOutAll, setSigningOutAll] = useState(false);

  const securityDesc: Record<SecurityKey, string> = {
    password: a.security.passwordDesc,
    sessions: a.security.sessionsDesc,
  };

  async function signOutAll() {
    setSigningOutAll(true);
    try {
      await logOutEverywhere("/auth/login");
    } catch {
      setSigningOutAll(false);
    }
  }

  return (
    <>
      {/* ── Profile ── */}
      <section className="sc">
        <CardHeader card={PROFILE_CARD} badge={{ label: a.roleBadge, tone: "bg-live" }} />
        <div className="sc-b">
          <div className="fgrid">
            <Field label={PROFILE_LABELS.name} value={name} onChange={setName} />
            <Field label={PROFILE_LABELS.email} value={a.email} disabled />
            <Field label={PROFILE_LABELS.phone} value={phone} onChange={setPhone} />
          </div>
        </div>
        <SaveBar onSave={() => updateProfile({ name, phone })} />
      </section>

      {/* ── Business ── */}
      <section className="sc">
        <CardHeader card={BUSINESS_CARD} />
        <div className="sc-b">
          <div className="fgrid">
            <Field label={BUSINESS_LABELS.name} value={bizName} onChange={setBizName} disabled={!a.canEditBusiness} />
            <Field label={BUSINESS_LABELS.address} value={bizAddress} onChange={setBizAddress} disabled={!a.canEditBusiness} />
            <Field label={BUSINESS_LABELS.website} value={bizWebsite} onChange={setBizWebsite} disabled={!a.canEditBusiness} />
            <Field label={BUSINESS_LABELS.phone} value={bizPhone} onChange={setBizPhone} disabled={!a.canEditBusiness} />
          </div>
        </div>
        <SaveBar
          disabled={!a.canEditBusiness}
          onSave={() => updateBusiness({ name: bizName, address: bizAddress, website: bizWebsite, phone: bizPhone })}
        />
      </section>

      {/* ── Security ── */}
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
                {item.key === "password" ? (
                  <a className="btn btn-ghost btn-sm seccol-act" href={a.forgotHref}>
                    {item.action}
                  </a>
                ) : (
                  <button
                    className="btn btn-ghost btn-sm seccol-act"
                    type="button"
                    disabled={signingOutAll}
                    onClick={() => void signOutAll()}
                  >
                    {signingOutAll ? "Logging out…" : item.action}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Log out — last thing on the page, red like the other exit. ── */}
      <div className="sactions sactions--logout">
        <SignOutButton className="btn btn-danger" iconClassName="ic" label={SIGN_OUT_LABEL} />
      </div>
    </>
  );
}
