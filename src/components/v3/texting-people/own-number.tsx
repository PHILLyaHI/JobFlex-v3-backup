"use client";

// THE COMPANY'S OWN TEXTING NUMBER (2026-10-02) — one card for the desk's
// Settings → Texting and the handheld settings page.
//
// Owner: "contractors can use it for their own SMS … JobFlex will pay it".
// A toll-free number bought on JobFlex's Twilio account and registered with
// the carriers in the company's name (lib/sms/registration). The card walks
// the states: get one (paid plans) → the business form → waiting for Twilio →
// approved, or sent back with Twilio's reasons and the form again.

import { useState } from "react";
import { useRouter } from "next/navigation";

import { checkSmsRegistration, releaseSmsNumber, submitSmsRegistration, type SmsActionResult } from "@/actions/sms";
import {
  BUSINESS_TYPES,
  EMPTY_DETAILS,
  isFreeMailbox,
  REGISTRATION_COPY as C,
  registrationProblems,
  type SmsBusinessType,
  type SmsRegistrationDetails,
  type SmsRegistrationView,
} from "@/lib/sms/registrationShared";
import s from "./texting-people.module.css";

type FieldKey = Exclude<keyof SmsRegistrationDetails, "businessType">;
const FIELDS: readonly { key: FieldKey; label: string; wide?: boolean; type?: string; auto?: string; hint?: string }[] = [
  { key: "legalName", label: "Legal business name", wide: true, auto: "organization" },
  { key: "dba", label: "Name your clients know", auto: "organization" },
  { key: "ein", label: "EIN", hint: "12-3456789" },
  { key: "street", label: "Street address", wide: true, auto: "address-line1" },
  { key: "street2", label: "Suite or unit", auto: "address-line2" },
  { key: "city", label: "City", auto: "address-level2" },
  { key: "state", label: "State", auto: "address-level1", hint: "WA" },
  { key: "zip", label: "ZIP", auto: "postal-code" },
  { key: "website", label: "Website", wide: true, type: "url", auto: "url" },
  { key: "contactFirst", label: "Contact first name", auto: "given-name" },
  { key: "contactLast", label: "Contact last name", auto: "family-name" },
  { key: "contactEmail", label: "Contact email", type: "email", auto: "email" },
  { key: "contactPhone", label: "Contact phone", type: "tel", auto: "tel" },
];

const STAGE_TAG: Record<SmsRegistrationView["stage"], string> = {
  none: "",
  pending: "with Twilio",
  approved: "sending",
  rejected: "sent back",
  failed: "not sent",
};

export function OwnNumber({ view, configured }: { view: SmsRegistrationView | null; configured: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<SmsRegistrationDetails>(view?.details ?? EMPTY_DETAILS);
  const [tried, setTried] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  if (!view) return null;

  const run = async (label: string, fn: () => Promise<SmsActionResult>, after?: () => void) => {
    setBusy(label);
    setNote("");
    setErr("");
    try {
      const r = await fn();
      if (r.ok) {
        setNote(r.note ?? "Done.");
        after?.();
        router.refresh();
      } else setErr(r.error);
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : "Couldn't reach JobFlex. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const problems = registrationProblems(d);
  const fresh = view.stage === "none" || view.stage === "failed";
  const formOpen = fresh ? open : view.stage === "rejected" && view.canEdit;
  const set = (k: keyof SmsRegistrationDetails, v: string) => setD((x) => ({ ...x, [k]: v }));
  const send = () => {
    setTried(true);
    if (Object.keys(problems).length) {
      setErr("Fix the marked fields first.");
      return;
    }
    void run("submit", () => submitSmsRegistration(d), () => {
      setOpen(false);
      setTried(false);
    });
  };

  return (
    <div className={`${s.root} ${s.own}`} data-own-number data-stage={view.stage}>
      {!configured ? <p className={s.note}>{C.notConfigured}</p> : null}
      {view.number ? (
        <div className={s.ownHead}>
          <b>{view.number}</b>
          {STAGE_TAG[view.stage] ? <span className={`${s.tag}${view.stage === "rejected" || view.stage === "failed" ? ` ${s.tagWarn}` : ""}`}>{STAGE_TAG[view.stage]}</span> : null}
        </div>
      ) : null}
      {view.stage === "pending" ? <p className={s.note}>{C.pending}</p> : null}
      {view.stage === "approved" ? <p className={s.note}>{C.approved}</p> : null}
      {view.stage === "rejected" ? <p className={`${s.note} ${s.noteErr}`}>{view.canEdit ? C.rejected : C.rejectedClosed}</p> : null}
      {view.stage === "failed" ? <p className={`${s.note} ${s.noteErr}`}>{C.failed}</p> : null}
      {view.legacy ? <p className={`${s.note} ${s.noteErr}`}>{C.legacy}</p> : null}
      {view.stage === "rejected" && view.reasons.length ? (
        <ul className={s.reasons}>
          {view.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
      {view.error && (view.stage === "failed" || view.stage === "rejected") ? <p className={`${s.note} ${s.noteErr}`}>{view.error}</p> : null}

      {fresh && !open && !view.legacy ? (
        view.paying ? (
          <div className={s.acts}>
            <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={!configured || busy !== null} onClick={() => setOpen(true)}>
              {view.stage === "failed" ? C.resubmit : C.get}
            </button>
          </div>
        ) : (
          <p className={s.note}>{C.paidOnly}</p>
        )
      ) : null}

      {formOpen ? (
        <form
          className={s.form}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <p className={`${s.note} ${s.wide}`}>{C.formIntro}</p>
          <label className={problems.businessType && tried ? s.bad : ""}>
            Kind of business
            <select value={d.businessType} onChange={(e) => setD((x) => ({ ...x, businessType: e.target.value as SmsBusinessType }))}>
              {BUSINESS_TYPES.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          {FIELDS.map((f) => (
            <label key={f.key} className={`${f.wide ? s.wide : ""} ${problems[f.key] && tried ? s.bad : ""}`}>
              {f.label}
              {f.key === "ein" && d.businessType === "SOLE_PROPRIETOR" ? " (if you have one)" : ""}
              <input
                type={f.type ?? "text"}
                value={d[f.key]}
                placeholder={f.hint}
                autoComplete={f.auto ?? "off"}
                inputMode={f.key === "zip" || f.key === "ein" ? "numeric" : undefined}
                onChange={(e) => set(f.key, e.target.value)}
              />
              {problems[f.key] && tried ? <span className={s.why}>{problems[f.key]}</span> : null}
              {f.key === "contactEmail" && isFreeMailbox(d.contactEmail) ? <span className={s.hint}>{C.freeMail}</span> : null}
            </label>
          ))}
          <p className={`${s.note} ${s.wide}`}>{C.consent}</p>
          <div className={`${s.acts} ${s.wide}`}>
            <button type="submit" className={`${s.btn} ${s.btnPrimary}`} disabled={busy !== null || !configured}>
              {busy === "submit" ? "Sending to Twilio…" : view.stage === "rejected" ? C.resubmit : C.submit}
            </button>
            {fresh ? (
              <button type="button" className={s.btn} disabled={busy !== null} onClick={() => setOpen(false)}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {view.stage === "pending" || (view.number && (view.stage !== "none" || view.legacy)) ? (
        <div className={s.acts}>
          {view.stage === "pending" ? (
            <button type="button" className={s.btn} disabled={busy !== null} onClick={() => run("check", checkSmsRegistration)}>
              {busy === "check" ? "Asking Twilio…" : C.check}
            </button>
          ) : null}
          {view.number ? (
            confirming ? (
              <>
                <button type="button" className={`${s.btn} ${s.btnDanger}`} disabled={busy !== null} onClick={() => run("release", releaseSmsNumber, () => setConfirming(false))}>
                  Yes, release it
                </button>
                <button type="button" className={s.btn} disabled={busy !== null} onClick={() => setConfirming(false)}>
                  Keep it
                </button>
              </>
            ) : (
              <button type="button" className={s.btn} disabled={busy !== null} onClick={() => setConfirming(true)}>
                {C.release}
              </button>
            )
          ) : null}
        </div>
      ) : null}

      {note ? <p className={s.note} role="status">{note}</p> : null}
      {err ? <p className={`${s.note} ${s.noteErr}`} role="alert">{err}</p> : null}
    </div>
  );
}
