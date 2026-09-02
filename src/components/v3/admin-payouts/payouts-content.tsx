"use client";

// ADMIN PAYOUTS — BLUEPRINT
// /admin/payouts
//
// The approval queue for partner payout requests, and the transfer history
// the cron writes. Approve is one press; Reject opens a sheet for the reason,
// because a rejection with no reason is a partner writing in to ask why.
// Writes go to approvePayoutRequest / rejectPayoutRequest (existing); the
// page is a server component, so `router.refresh()` is the update.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toast";
import { money, relative, shortDate } from "@/lib/format";
import { approvePayoutRequest, rejectPayoutRequest } from "@/actions/influencers";
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
import styles from "./payouts.module.css";

export interface PayoutRequestDTO {
  id: string;
  influencerName: string;
  influencerEmail: string;
  payoutsEnabled: boolean;
  amountCents: number;
  status: string;
  rejectedReason: string | null;
  createdAt: string;
  approvedAt: string | null;
}
export interface TransferDTO {
  id: string;
  influencerName: string;
  amountCents: number;
  status: string;
  stripeTransferId: string | null;
  failureReason: string | null;
  createdAt: string;
  paidAt: string | null;
}

const REQUEST_TONE: Record<string, Tone> = {
  PENDING: "wait",
  APPROVED: "bp",
  PROCESSING: "mute",
  PAID: "ok",
  REJECTED: "bad",
  FAILED: "bad",
};
const REQUEST_LABEL: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  PROCESSING: "Processing",
  PAID: "Paid",
  REJECTED: "Rejected",
  FAILED: "Failed",
};
const TRANSFER_TONE: Record<string, Tone> = {
  PENDING: "wait",
  PAID: "ok",
  FAILED: "bad",
  REVERSED: "bad",
};

type Filter = "ALL" | "PENDING" | "APPROVED" | "PAID" | "REJECTED" | "FAILED";
const FILTERS: { key: Filter; label: string; match: (s: string) => boolean }[] = [
  { key: "ALL", label: "All", match: () => true },
  { key: "PENDING", label: "Pending", match: (s) => s === "PENDING" },
  { key: "APPROVED", label: "Approved", match: (s) => s === "APPROVED" || s === "PROCESSING" },
  { key: "PAID", label: "Paid", match: (s) => s === "PAID" },
  { key: "REJECTED", label: "Rejected", match: (s) => s === "REJECTED" },
  { key: "FAILED", label: "Failed", match: (s) => s === "FAILED" },
];

type RejectHandle = { open: (req: PayoutRequestDTO) => void };

export function AdminPayoutsContent({
  requests,
  transfers,
}: {
  requests: PayoutRequestDTO[];
  transfers: TransferDTO[];
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  useReveal(rootRef);

  const [filter, setFilter] = useState<Filter>("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rejectRef = useRef<RejectHandle | null>(null);

  const counts = useMemo(() => {
    const c = {} as Record<Filter, number>;
    for (const f of FILTERS) c[f.key] = requests.filter((r) => f.match(r.status)).length;
    return c;
  }, [requests]);
  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
    return requests.filter((r) => f.match(r.status));
  }, [requests, filter]);

  const pendingCents = useMemo(
    () => requests.filter((r) => r.status === "PENDING").reduce((n, r) => n + r.amountCents, 0),
    [requests],
  );
  const paidCents = useMemo(
    () => transfers.filter((t) => t.status === "PAID").reduce((n, t) => n + t.amountCents, 0),
    [transfers],
  );
  const failed = useMemo(() => transfers.filter((t) => t.status === "FAILED" || t.status === "REVERSED").length, [transfers]);

  async function approve(r: PayoutRequestDTO) {
    if (busyId) return;
    setBusyId(r.id);
    setError(null);
    try {
      await approvePayoutRequest(r.id);
      toast.success("Approved", `${money(r.amountCents / 100)} to ${r.influencerName} is queued for transfer.`);
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
          <div className="kicker">Platform · Partners</div>
          <h1 className="page-title">Payouts</h1>
        </div>
      </div>

      <KpiStrip
        cells={[
          { label: "Pending requests", value: String(counts.PENDING), tone: counts.PENDING > 0 ? "warn" : undefined },
          { label: "Awaiting approval", value: money(pendingCents / 100), accent: true },
          { label: "Paid out", value: money(paidCents / 100), tone: "ok" },
          { label: "Failed transfers", value: String(failed), tone: failed > 0 ? "bad" : undefined },
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
            <div className="card-title">Requests</div>
            <div className="card-sub">Approved requests transfer to Stripe Connect on the daily run.</div>
          </div>
          <div className={ui.filters} role="group" aria-label="Filter requests">
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
            {requests.length === 0
              ? "No payout requests."
              : `No ${filter.toLowerCase()} requests.`}
          </Empty>
        ) : (
          <div className={ui.tbl} role="table" aria-label="Payout requests">
            <div className={cx(ui.tr, ui.th, styles.reqCols)} role="row">
              <span>Partner</span>
              <span className={ui.thR}>Amount</span>
              <span>Requested</span>
              <span>Status</span>
              <span />
            </div>
            {rows.map((r) => (
              <div key={r.id} className={cx(ui.tr, styles.reqCols)} role="row">
                <div className={ui.tdWide}>
                  <div className={ui.tdName} title={r.influencerName}>
                    {r.influencerName}
                  </div>
                  <div className={ui.tdSub} title={r.influencerEmail}>
                    {r.influencerEmail}
                    {!r.payoutsEnabled ? " · Stripe Connect not enabled" : ""}
                  </div>
                </div>
                <div className={cx(ui.tdAmt, r.status === "PENDING" && ui.tdAmtBp)}>
                  <span className={ui.tdLbl}>Amount</span>
                  {money(r.amountCents / 100)}
                </div>
                <div className={ui.tdNum}>
                  <span className={ui.tdLbl}>Requested</span>
                  <span title={shortDate(r.createdAt)}>{relative(r.createdAt)}</span>
                </div>
                <div>
                  <span className={ui.tdLbl}>Status</span>
                  <Chip tone={REQUEST_TONE[r.status] ?? "mute"}>{REQUEST_LABEL[r.status] ?? r.status}</Chip>
                  {r.status === "REJECTED" && r.rejectedReason ? (
                    <Meta className={styles.reason}>{r.rejectedReason}</Meta>
                  ) : null}
                  {r.status === "APPROVED" && r.approvedAt ? (
                    <Meta className={styles.reason}>approved {relative(r.approvedAt)}</Meta>
                  ) : null}
                </div>
                <div className={ui.tdAct}>
                  {r.status === "PENDING" ? (
                    <>
                      <button
                        className={cx("btn", ui.btnBad, ui.btnSm)}
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => rejectRef.current?.open(r)}
                      >
                        <Ic name="ban" />
                        Reject
                      </button>
                      <button
                        className={cx("btn", ui.btnOk, ui.btnSm, busyId === r.id && ui.btnBusy)}
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => approve(r)}
                      >
                        <Ic name="check" />
                        {busyId === r.id ? "Approving…" : "Approve"}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card rv">
        <div className="card-head">
          <div className="card-titles">
            <div className="card-title">Transfers</div>
          </div>
          <span className={cx("card-link", styles.count)}>{transfers.length} recent</span>
        </div>
        {transfers.length === 0 ? (
          <Empty>No transfers yet.</Empty>
        ) : (
          <div className={ui.tbl} role="table" aria-label="Transfers">
            <div className={cx(ui.tr, ui.th, styles.trCols)} role="row">
              <span>Partner</span>
              <span>When</span>
              <span>Reference</span>
              <span className={ui.thR}>Amount</span>
              <span>Status</span>
            </div>
            {transfers.map((t) => (
              <div key={t.id} className={cx(ui.tr, styles.trCols)} role="row">
                <div className={ui.tdWide}>
                  <div className={ui.tdName} title={t.influencerName}>
                    {t.influencerName}
                  </div>
                </div>
                <div className={ui.tdNum}>
                  <span className={ui.tdLbl}>When</span>
                  <span title={shortDate(t.paidAt ?? t.createdAt)}>{relative(t.paidAt ?? t.createdAt)}</span>
                </div>
                <div className={ui.tdWide}>
                  <span className={ui.tdLbl}>Reference</span>
                  <Meta>
                    {t.stripeTransferId ?? "—"}
                    {t.failureReason ? ` · ${t.failureReason}` : ""}
                  </Meta>
                </div>
                <div className={cx(ui.tdAmt, t.status === "PAID" && styles.amtOk)}>
                  <span className={ui.tdLbl}>Amount</span>
                  {money(t.amountCents / 100)}
                </div>
                <div>
                  <span className={ui.tdLbl}>Status</span>
                  <Chip tone={TRANSFER_TONE[t.status] ?? "mute"}>{t.status.charAt(0) + t.status.slice(1).toLowerCase()}</Chip>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <RejectSheet handleRef={rejectRef} />
    </div>
  );
}

/* ============================================================
   REJECT — the reason travels with the request
   ============================================================ */

function RejectSheet({ handleRef }: { handleRef: React.RefObject<RejectHandle | null> }) {
  const router = useRouter();
  const [req, setReq] = useState<PayoutRequestDTO | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const { ref: mdlRef, open: openMdlDialog, close } = useMdl();
  const open = useCallback(
    (r: PayoutRequestDTO) => {
      setReq(r);
      setReason("");
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
    if (busy || !req) return;
    setBusy(true);
    setError(null);
    try {
      await rejectPayoutRequest(req.id, reason.trim() || undefined);
      toast.success("Request rejected", reason.trim() ? "The reason is on the request." : undefined);
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
      title="Reject request"
      titleId="payRejectTitle"
      onClose={close}
      error={error}
      foot={
        <>
          <button className="btn btn-ghost" type="button" onClick={close} disabled={busy}>
            Keep it
          </button>
          <button
            className={cx("btn", ui.btnBad, busy && ui.btnBusy)}
            type="button"
            onClick={() => submit()}
            disabled={busy || !req}
          >
            <Ic name="ban" />
            {busy ? "Rejecting…" : "Reject"}
          </button>
        </>
      }
    >
      {!req ? null : (
        <form onSubmit={submit} noValidate>
          <div className={styles.rejectWho}>
            <b>{money(req.amountCents / 100)}</b> requested by {req.influencerName} · {relative(req.createdAt)}
          </div>
          <div className="mf">
            <label className="mf-lbl" htmlFor="payReason">
              Reason (the partner sees this)
            </label>
            <textarea
              className={cx("mf-in", ui.area)}
              id="payReason"
              ref={areaRef}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Balance includes a refunded charge still inside the hold window."
            />
          </div>
        </form>
      )}
    </Sheet>
  );
}
