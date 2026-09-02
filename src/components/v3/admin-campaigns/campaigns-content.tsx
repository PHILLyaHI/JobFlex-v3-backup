"use client";

// ADMIN CAMPAIGNS — BLUEPRINT
// /admin/campaigns
//
// WHAT THIS ACTUALLY DOES. sendPlatformCampaign writes ONE Announcement row
// with scope="PLATFORM"; every tenant's dashboard banner reads it. No mail is
// sent, no recipient list exists, nothing is rendered through renderEmail — so
// this page shows no email preview rather than a mock of one, and the composer
// says in one line what the send really is.
//
// THE NUMBERS. The only recorded figures are the announcement rows themselves
// and `organizations` (db.organization.count()), which the page passes in. A
// platform announcement carries no per-campaign recipient count, so the reach
// is stated once, live, for the set of announcements that are currently
// showing — never faked per row.
//
// Furniture comes from admin-influencers/admin-ui (the console's shared kit):
// the row list, chips, the `.mdl pmdl` dialog on blueprint-shell/mdl-motion,
// compact buttons, the dashed empty state. Only the composer's fields and this
// list's column widths are local.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toast";
import { longDate } from "@/lib/format";
import { deletePlatformCampaign, sendPlatformCampaign } from "@/actions/admin";
import {
  Chip,
  Empty,
  Ic,
  Meta,
  Sheet,
  actionError,
  cx,
  useMdl,
  useReveal,
} from "@/components/v3/admin-influencers/admin-ui";
import ui from "@/components/v3/admin-influencers/admin-ui.module.css";
import styles from "./campaigns.module.css";

export interface CampaignDTO {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  expiresAt: string | null;
  /** Resolved on the server against one clock, so the badge cannot mismatch
   *  between the rendered HTML and hydration. */
  live: boolean;
}

/** Everything the action accepts: an optional 1–365 day window, or none. */
const EXPIRY = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
  { value: "", label: "No expiry" },
];

function workspaces(n: number): string {
  return `${n} workspace${n === 1 ? "" : "s"}`;
}

type DeleteHandle = { open: (c: CampaignDTO) => void };

export function AdminCampaignsContent({
  campaigns,
  total,
  organizations,
}: {
  campaigns: CampaignDTO[];
  /** Every platform announcement on record; `campaigns` is the latest page. */
  total: number;
  organizations: number;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  useReveal(rootRef);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expiry, setExpiry] = useState("14");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deleteRef = useRef<DeleteHandle | null>(null);

  const liveCount = useMemo(() => campaigns.filter((c) => c.live).length, [campaigns]);
  const ready = title.trim().length > 0 && body.trim().length > 0;

  async function post() {
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const days = expiry ? Number(expiry) : undefined;
      const res = await sendPlatformCampaign({
        title: title.trim(),
        body: body.trim(),
        ...(days ? { expiresInDays: days } : {}),
      });
      toast.success("Posted", `Showing on ${workspaces(res.organizations)}.`);
      setTitle("");
      setBody("");
      router.refresh();
    } catch (err) {
      setError(actionError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className={styles.root}>
      <div className="page-head rv">
        <div>
          <div className="kicker">Platform</div>
          <h1 className="page-title">Campaigns</h1>
        </div>
      </div>

      <section className="card rv">
        <div className="card-head">
          <div className="card-titles">
            <div className="card-title">New announcement</div>
            <div className="card-sub">Dashboard banner — no email.</div>
          </div>
        </div>

        <div className={styles.form}>
          <div className={styles.row}>
            <div className={styles.fld}>
              <label className={styles.lbl} htmlFor="campTitle">
                Title
              </label>
              <input
                id="campTitle"
                className={styles.in}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className={styles.fld}>
              <label className={styles.lbl} htmlFor="campExpiry">
                Expiry
              </label>
              {/* The console's one dropdown treatment, published in
                  blueprint-global.css: the shared `.bp-sel` wrapper draws the
                  caret, `.bp-sel--admin` carries the admin metrics. */}
              <span className="bp-sel bp-sel--admin">
                <select
                  id="campExpiry"
                  className="bp-sel-in"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                >
                  {EXPIRY.map((o) => (
                    <option key={o.label} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </span>
            </div>
          </div>

          <div className={styles.fld}>
            <label className={styles.lbl} htmlFor="campBody">
              Body
            </label>
            <textarea
              id="campBody"
              className={styles.area}
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          {error ? (
            <div className={ui.bannerErr} role="alert">
              <span>{error}</span>
            </div>
          ) : null}

          <div className={styles.foot}>
            <button
              type="button"
              className={cx("btn btn-primary", busy && ui.btnBusy)}
              disabled={!ready || busy}
              onClick={() => post()}
            >
              <Ic name="megaphone" />
              {busy ? "Posting…" : `Post to ${workspaces(organizations)}`}
            </button>
          </div>
        </div>
      </section>

      <section className="card rv">
        <div className={cx("card-head", ui.cardHead)}>
          <div className="card-titles">
            <div className="card-title">Announcements</div>
            {campaigns.length > 0 ? (
              <div className="card-sub">
                {liveCount === 0
                  ? "None are showing right now."
                  : `${liveCount} showing on all ${workspaces(organizations)}.`}
              </div>
            ) : null}
          </div>
          <div className={ui.cardCount}>{total}</div>
        </div>

        {campaigns.length === 0 ? (
          <Empty>No announcements yet.</Empty>
        ) : (
          <>
            <div className={ui.tbl} role="table" aria-label="Platform announcements">
              <div className={cx(ui.tr, ui.th, styles.cols)} role="row">
                <span>Announcement</span>
                <span>State</span>
                <span>Posted</span>
                <span>Ends</span>
                <span />
              </div>
              {campaigns.map((c) => (
                <div key={c.id} className={cx(ui.tr, styles.cols)} role="row">
                  <div className={ui.tdWide}>
                    <div className={styles.name}>{c.title}</div>
                    <div className={styles.body}>{c.body}</div>
                  </div>
                  <div>
                    <span className={ui.tdLbl}>State</span>
                    <Chip tone={c.live ? "ok" : "mute"}>{c.live ? "Live" : "Ended"}</Chip>
                  </div>
                  <div className={styles.dt}>
                    <span className={ui.tdLbl}>Posted</span>
                    {longDate(c.createdAt)}
                  </div>
                  <div className={cx(styles.dt, !c.expiresAt && styles.dtMute)}>
                    <span className={ui.tdLbl}>Ends</span>
                    {c.expiresAt ? longDate(c.expiresAt) : "No expiry"}
                  </div>
                  <div className={ui.tdAct}>
                    <button
                      type="button"
                      className={cx("btn", ui.btnBad, ui.btnSm)}
                      onClick={() => deleteRef.current?.open(c)}
                    >
                      <Ic name="trash" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {total > campaigns.length ? (
              <Meta className={styles.more}>
                Latest {campaigns.length} of {total}.
              </Meta>
            ) : null}
          </>
        )}
      </section>

      <DeleteSheet handleRef={deleteRef} />
    </div>
  );
}

/* ============================================================
   DELETE — the confirmation, on the house dialog contract
   ============================================================ */

function DeleteSheet({ handleRef }: { handleRef: React.RefObject<DeleteHandle | null> }) {
  const router = useRouter();
  const [target, setTarget] = useState<CampaignDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { ref: mdlRef, open: openDialog, close } = useMdl();
  const open = useCallback(
    (c: CampaignDTO) => {
      setTarget(c);
      setError(null);
      setBusy(false);
      openDialog();
    },
    [openDialog],
  );
  useEffect(() => {
    handleRef.current = { open };
  }, [handleRef, open]);

  async function submit() {
    if (busy || !target) return;
    setBusy(true);
    setError(null);
    try {
      await deletePlatformCampaign(target.id);
      toast.success("Deleted");
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
      title="Delete announcement"
      titleId="campDeleteTitle"
      onClose={close}
      error={error}
      foot={
        <>
          <button className="btn btn-ghost" type="button" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button
            className={cx("btn", ui.btnBad, busy && ui.btnBusy)}
            type="button"
            onClick={() => submit()}
            disabled={busy || !target}
          >
            <Ic name="trash" />
            {busy ? "Deleting…" : "Delete"}
          </button>
        </>
      }
    >
      <div className={styles.delName}>{target?.title}</div>
      {target?.live ? (
        <div className={styles.delLine}>It disappears from every dashboard.</div>
      ) : null}
    </Sheet>
  );
}
