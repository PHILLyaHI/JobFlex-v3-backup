"use client";

// ADMIN · "Custom plan pages" inside the account sheet (owner, 2026-10-06).
//
// The pages the org holds — what its gate opens — beside what Stripe bills
// for them, and the switches to change them. Two ways to apply (the actions'
// header has the rules): "Bill the change" follows the owner's own picker;
// "Access only" moves our record and leaves Stripe as it is. Two presses,
// a reason required, like the rest of the sheet.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toast";
import { getAdminCustomPages, setAdminCustomPages, type AdminCustomPages } from "@/actions/adminCustomPages";
import { CUSTOM_PAGES, customPriceCents } from "@/lib/customPlan";
import shared from "./admin-shared.module.css";
import s from "./admin-users.module.css";
import { makeCx, Field, Note, Select, Toggle, errorMessage } from "./admin-kit";

const cx = makeCx(s, shared);

function money(cents: number): string {
  const d = cents / 100;
  return Number.isInteger(d) ? `$${d}` : `$${d.toFixed(2)}`;
}

export function CustomPagesEditor({ orgId, orgName }: { orgId: string; orgName: string | null }) {
  const router = useRouter();
  const [data, setData] = useState<AdminCustomPages | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [billing, setBilling] = useState<"customer" | "none">("customer");
  const [reason, setReason] = useState("");
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await getAdminCustomPages(orgId);
      setData(d);
      setPicked(d.pages);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(errorMessage(e, "Couldn't read the pages."));
    }
  }, [orgId]);

  useEffect(() => {
    let live = true;
    getAdminCustomPages(orgId)
      .then((d) => {
        if (!live) return;
        setData(d);
        setPicked(d.pages);
      })
      .catch((e) => live && setLoadErr(errorMessage(e, "Couldn't read the pages.")));
    return () => {
      live = false;
    };
  }, [orgId]);

  const adds = useMemo(() => picked.filter((id) => !data?.pages.includes(id)), [picked, data]);
  const removes = useMemo(() => (data?.pages ?? []).filter((id) => !picked.includes(id)), [picked, data]);
  const changed = adds.length + removes.length > 0;
  const reasonOk = reason.trim().length >= 3;

  const apply = useCallback(async () => {
    if (!changed || !reasonOk || busy) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await setAdminCustomPages({ organizationId: orgId, pages: picked, billing, reason });
      if (!r.ok) throw new Error(r.error);
      toast.success(
        "Custom plan pages saved",
        r.chargedCents > 0 ? `${money(r.chargedCents)} charged to the customer.` : `${orgName ?? "The organization"} sees the change now.`,
      );
      setReason("");
      setArmed(false);
      await load();
      router.refresh();
    } catch (e) {
      setErr(errorMessage(e, "Couldn't save the pages."));
      setArmed(false);
    } finally {
      setBusy(false);
    }
  }, [changed, reasonOk, busy, armed, orgId, picked, billing, reason, orgName, load, router]);

  if (data && !data.onCustom) return null;

  const mismatch = data && data.billedCents !== null && data.billedCents !== data.pricedCents;
  return (
    <div className={cx("sec")}>
      <div className={cx("sec-h")}>
        <span className={cx("sec-t")}>Custom plan pages</span>
        {data ? (
          <span className={cx("sec-m")}>
            {data.pages.length} page{data.pages.length === 1 ? "" : "s"} · {money(data.pricedCents)}/mo
            {data.billedCents !== null ? ` · Stripe bills ${money(data.billedCents)}/mo` : ""}
          </span>
        ) : null}
      </div>
      {loadErr ? <Note tone="danger">{loadErr}</Note> : null}
      {mismatch ? (
        <Note tone="danger">
          Stripe bills {money(data!.billedCents!)} for {data!.billedPages ?? 0} page{data!.billedPages === 1 ? "" : "s"}, but the
          organization holds {data!.pages.length} ({money(data!.pricedCents)}). Fix it with &ldquo;Bill the change&rdquo; or
          scripts/billing/custom-plan-migrate.ts.
        </Note>
      ) : null}
      {data?.legacy ? <Note>Still on the one-price subscription — the next change converts it (no charge).</Note> : null}
      {err ? <Note tone="danger">{err}</Note> : null}

      {data ? (
        <>
          <div className={cx("au-us")} role="list" aria-label="Custom plan pages">
            {CUSTOM_PAGES.map((pg) => (
              <div key={pg.id} role="listitem" className={cx("au-us-row")}>
                <Toggle
                  on={picked.includes(pg.id)}
                  onChange={(on) => {
                    setPicked((cur) => (on ? [...cur, pg.id] : cur.filter((x) => x !== pg.id)));
                    setArmed(false);
                  }}
                  label={pg.label}
                  sub={
                    adds.includes(pg.id)
                      ? "Adding"
                      : removes.includes(pg.id)
                        ? "Removing"
                        : data.pages.includes(pg.id)
                          ? "Holds"
                          : pg.note
                  }
                  disabled={busy}
                />
              </div>
            ))}
          </div>

          <Field label="Billing" htmlFor="au-cp-billing" hint={billing === "customer" ? "The owner's rules: added pages are charged now, prorated (nothing in a trial); removed pages close now and the price drops from the next bill." : "Only the access changes. Stripe keeps billing what it bills now."}>
            <Select
              id="au-cp-billing"
              value={billing}
              onChange={(v) => {
                setBilling(v === "none" ? "none" : "customer");
                setArmed(false);
              }}
              options={[
                { value: "customer", label: "Bill the change" },
                { value: "none", label: "Access only — no billing change" },
              ]}
            />
          </Field>

          <Field label="Reason" htmlFor="au-cp-reason" hint="Required — goes on the organization's activity with your email.">
            <textarea
              id="au-cp-reason"
              className={cx("in", "ta")}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setArmed(false);
              }}
              placeholder="e.g. Added Calendar on the call — customer agreed to the prorated charge"
            />
          </Field>

          <div className={cx("au-apply")}>
            <button
              type="button"
              className={cx("btn", armed ? "btn-danger" : "btn-primary")}
              disabled={!changed || !reasonOk || busy}
              title={!changed ? "No change" : !reasonOk ? "Give a reason first" : armed ? "Press again to apply" : undefined}
              onClick={() => void apply()}
            >
              {busy
                ? "Saving…"
                : armed
                  ? `Confirm: ${picked.length} page${picked.length === 1 ? "" : "s"} · ${money(customPriceCents(picked))}/mo`
                  : "Save pages"}
            </button>
          </div>
        </>
      ) : !loadErr ? (
        <div className={cx("au-us-loading")}>Reading the pages…</div>
      ) : null}
    </div>
  );
}
