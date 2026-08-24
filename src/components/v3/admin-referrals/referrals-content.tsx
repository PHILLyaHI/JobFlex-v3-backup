"use client";

// ADMIN REFERRALS — BLUEPRINT
// /admin/referrals
//
// Member-to-member referrals: the conversion ledger and the two manual
// levers — retry the automated Stripe credit, or mark a conversion credited
// when the reward was settled out of band (that one asks for a note, since
// it records nothing on Stripe and the note IS the audit). Writes go to
// adminRetryReferralCredit / adminMarkReferralPaid (existing).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toast";
import { money, relative, shortDate } from "@/lib/format";
import { adminMarkReferralPaid, adminRetryReferralCredit } from "@/actions/referrals";
import {
  Chip,
  Empty,
  Ic,
  KpiStrip,
  Meta,
  Sheet,
  type Tone,
  actionError,
  cx,
  useMdl,
  useReveal,
} from "@/components/v3/admin-influencers/admin-ui";
import ui from "@/components/v3/admin-influencers/admin-ui.module.css";
import styles from "./referrals.module.css";

export interface ConversionDTO {
  id: string;
  signupEmail: string;
  signupOrgName: string | null;
  referrerName: string;
  referrerOrgName: string;
  code: string;
  status: string;
  rewardCents: number | null;
  rewardAppliedAt: string | null;
  createdAt: string;
  convertedAt: string | null;
  note: string | null;
}

const STATUS_TONE: Record<string, Tone> = {
  PENDING: "mute",
  CONVERTED: "wait",
  PAID: "ok",
};
function statusLabel(s: string): string {
  return s === "PAID" ? "Credited" : s === "CONVERTED" ? "Credit owed" : "Pending";
}

// applyReferralReward's skip reasons, translated for the admin.
const SKIP_REASON: Record<string, string> = {
  "not-converted": "The referred workspace hasn't paid yet.",
  "already-applied": "This credit was already applied.",
  "no-stripe-customer": "The referrer has no Stripe customer yet — it will apply when they subscribe.",
  "stripe-disabled": "Stripe isn't configured in this environment.",
  "stripe-writes-disabled": "Stripe live writes are disabled (STRIPE_ALLOW_LIVE_WRITES).",
  "no-priced-plan": "The referrer's plan has no price to base the credit on.",
};

type Filter = "ALL" | "PENDING" | "CONVERTED" | "PAID";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "PENDING", label: "Pending" },
  { key: "CONVERTED", label: "Credit owed" },
  { key: "PAID", label: "Credited" },
];

type MarkHandle = { open: (c: ConversionDTO) => void };

export function AdminReferralsContent({ conversions }: { conversions: ConversionDTO[] }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  useReveal(rootRef);

  const [filter, setFilter] = useState<Filter>("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const markRef = useRef<MarkHandle | null>(null);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { ALL: conversions.length, PENDING: 0, CONVERTED: 0, PAID: 0 };
    for (const x of conversions) if (x.status in c) c[x.status as Filter] += 1;
    return c;
  }, [conversions]);
  const rows = useMemo(
    () => (filter === "ALL" ? conversions : conversions.filter((c) => c.status === filter)),
    [conversions, filter],
  );
  const owed = useMemo(
    () => conversions.filter((c) => c.status === "CONVERTED" && !c.rewardAppliedAt).length,
    [conversions],
  );
  const creditedCents = useMemo(
    () => conversions.filter((c) => c.status === "PAID").reduce((n, c) => n + (c.rewardCents ?? 0), 0),
    [conversions],
  );

  async function retry(c: ConversionDTO) {
    if (busyId) return;
    setBusyId(c.id);
    setError(null);
    try {
      const res = await adminRetryReferralCredit(c.id);
      if (res.applied) {
        toast.success("Credit applied", `${c.referrerName}'s Stripe balance was credited.`);
      } else {
        setError(`Not applied: ${SKIP_REASON[res.reason ?? ""] ?? res.reason ?? "unknown reason."}`);
      }
      router.refresh();
    } catch (err) {
      setError(actionError(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div ref={rootRef} className={styles.root}>
      <div className="page-head rv">
        <div>
          <div className="kicker">Platform · Members</div>
          <h1 className="page-title">Referrals</h1>
        </div>
      </div>

      <KpiStrip
        cells={[
          { label: "Pending signups", value: String(counts.PENDING) },
          { label: "Credits owed", value: String(owed), tone: owed > 0 ? "warn" : undefined },
          { label: "Credited to date", value: money(creditedCents / 100), tone: "ok" },
          { label: "Conversions", value: String(counts.CONVERTED + counts.PAID), accent: true },
        ]}
      />

      {error ? (
        <div className={cx(ui.bannerErr, "rv")} role="alert">
          <span>{error}</span>
          <button type="button" className={styles.bannerX} onClick={() => setError(null)} aria-label="Dismiss">
            <Ic name="x" />
          </button>
        </div>
      ) : null}

      <section className="card rv">
        <div className={cx("card-head", ui.cardHead)}>
          <div className="card-titles">
            <div className="card-title">Conversions</div>
            <div className="card-sub">
              A conversion advances when the referred workspace first pays; the referrer&apos;s 50%-of-a-month credit then
              lands on their Stripe balance.
            </div>
          </div>
          <div className={ui.filters} role="group" aria-label="Filter conversions">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={cx(ui.filter, filter === f.key && ui.filterOn)}
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                <i>{counts[f.key]}</i>
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <Empty>
            {conversions.length === 0
              ? "No referrals yet."
              : `Nothing under ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()}.`}
          </Empty>
        ) : (
          <div className={ui.tbl} role="table" aria-label="Referral conversions">
            <div className={cx(ui.tr, ui.th, styles.cols)} role="row">
              <span>Referred signup</span>
              <span>Referrer</span>
              <span>Status</span>
              <span className={ui.thR}>Credit</span>
              <span />
            </div>
            {rows.map((c) => {
              const owedNow = c.status === "CONVERTED" && !c.rewardAppliedAt;
              return (
                <div key={c.id} className={cx(ui.tr, styles.cols)} role="row">
                  <div className={ui.tdWide}>
                    <div className={ui.tdName} title={c.signupEmail}>
                      {c.signupEmail}
                    </div>
                    <div className={ui.tdSub} title={c.signupOrgName ?? undefined}>
                      {c.signupOrgName ?? "no workspace yet"} · {relative(c.createdAt)}
                    </div>
                  </div>
                  <div className={ui.tdWide}>
                    <span className={ui.tdLbl}>Referrer</span>
                    <div className={ui.tdName} title={c.referrerName}>
                      {c.referrerName}
                    </div>
                    <div className={cx(ui.tdSub, styles.refSub)} title={c.referrerOrgName}>
                      <span className={styles.refOrg}>{c.referrerOrgName}</span>
                      <span className={ui.tag}>{c.code}</span>
                    </div>
                  </div>
                  <div>
                    <span className={ui.tdLbl}>Status</span>
                    <Chip tone={STATUS_TONE[c.status] ?? "mute"}>{statusLabel(c.status)}</Chip>
                    {c.status === "PAID" && c.rewardAppliedAt ? (
                      <Meta className={styles.when}>credited {shortDate(c.rewardAppliedAt)}</Meta>
                    ) : c.convertedAt ? (
                      <Meta className={styles.when}>converted {shortDate(c.convertedAt)}</Meta>
                    ) : null}
                    {c.note ? <Meta className={styles.when}>{c.note}</Meta> : null}
                  </div>
                  <div className={cx(ui.tdAmt, c.status === "PAID" && styles.amtOk)}>
                    <span className={ui.tdLbl}>Credit</span>
                    {c.rewardCents != null ? money(c.rewardCents / 100) : "—"}
                  </div>
                  <div className={ui.tdAct}>
                    {owedNow ? (
                      <>
                        <button
                          className={cx("btn", ui.btnGhost, ui.btnSm)}
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => markRef.current?.open(c)}
                        >
                          <Ic name="pen" />
                          Mark credited
                        </button>
                        <button
                          className={cx("btn btn-primary", ui.btnSm, busyId === c.id && ui.btnBusy)}
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => retry(c)}
                        >
                          <Ic name="send" />
                          {busyId === c.id ? "Applying…" : "Apply credit"}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <MarkSheet handleRef={markRef} />
    </div>
  );
}

/* ============================================================
   MARK CREDITED — settled out of band; the note is the audit
   ============================================================ */

function MarkSheet({ handleRef }: { handleRef: React.RefObject<MarkHandle | null> }) {
  const router = useRouter();
  const [conv, setConv] = useState<ConversionDTO | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const { ref: mdlRef, open: openMdlDialog, close } = useMdl();
  const open = useCallback(
    (c: ConversionDTO) => {
      setConv(c);
      setNote("Settled manually by admin");
      setError(null);
      setBusy(false);
      openMdlDialog();
      requestAnimationFrame(() => requestAnimationFrame(() => areaRef.current?.focus()));
    },
    [openMdlDialog],
  );
  useEffect(() => {
    handleRef.current = { open };
  }, [handleRef, open]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy || !conv) return;
    setBusy(true);
    setError(null);
    try {
      await adminMarkReferralPaid(conv.id, note.trim() || undefined);
      toast.success("Marked credited", "Nothing was sent to Stripe — the note is the record.");
      close();
      router.refresh();
    } catch (err) {
      setError(actionError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      mdlRef={mdlRef}
      title="Mark credited"
      titleId="refMarkTitle"
      onClose={close}
      error={error}
      foot={
        <>
          <button className="btn btn-ghost" type="button" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button
            className={cx("btn btn-primary", busy && ui.btnBusy)}
            type="button"
            onClick={() => submit()}
            disabled={busy || !conv}
          >
            <Ic name="check" />
            {busy ? "Saving…" : "Mark credited"}
          </button>
        </>
      }
    >
      {!conv ? null : (
        <form onSubmit={submit} noValidate>
          <div className={styles.markWho}>
            {conv.rewardCents != null ? <b>{money(conv.rewardCents / 100)}</b> : <b>Credit</b>} owed to {conv.referrerName}{" "}
            for {conv.signupEmail}. This records the reward as settled without touching Stripe.
          </div>
          <div className="mf">
            <label className="mf-lbl" htmlFor="refNote">
              Note
            </label>
            <textarea
              className={cx("mf-in", ui.area)}
              id="refNote"
              ref={areaRef}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Credited by hand in Stripe on Aug 20."
            />
          </div>
        </form>
      )}
    </Sheet>
  );
}
