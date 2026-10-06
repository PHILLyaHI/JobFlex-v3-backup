"use client";

// What a change to a Custom plan's pages costs, in words — the confirm
// dialog's body on both builds (desk and handheld). The amount due now is
// Stripe's own proration preview (actions/billing.previewCustomPagesChange):
// an added page is charged for the rest of the current period at once, a
// removed page closes now and the price drops from the next bill with no
// refund, and nothing at all is charged during a trial (lib/customBilling).

import { useEffect, useState } from "react";
import { previewCustomPagesChange } from "@/actions/billing";
import { CUSTOM_PAGES, customPriceCents } from "@/lib/customPlan";

function names(ids: readonly string[]): string {
  return ids.map((id) => CUSTOM_PAGES.find((p) => p.id === id)?.label ?? id).join(", ");
}

function money(cents: number): string {
  const d = cents / 100;
  return Number.isInteger(d) ? `$${d}` : `$${d.toFixed(2)}`;
}

type Preview = { dueNowCents: number | null; monthlyCents: number; trialing: boolean };

export function CustomChangeNote({
  pages,
  adding,
  removing,
}: {
  /** The whole selection after the change. */
  pages: readonly string[];
  adding: readonly string[];
  removing: readonly string[];
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const key = pages.join(",");
  useEffect(() => {
    let live = true;
    previewCustomPagesChange([...pages])
      .then((p) => {
        if (live) setPreview(p);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // `key` is the selection's identity; the array itself is a new one each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const monthly = preview?.monthlyCents ?? customPriceCents([...pages]);
  return (
    <>
      {adding.length > 0 ? (
        <>
          <b>{names(adding)}</b> open{adding.length === 1 ? "s" : ""} as soon as you confirm.{" "}
          {preview?.trialing ? (
            <>Nothing is charged during your trial.</>
          ) : preview && preview.dueNowCents !== null ? (
            <>
              <b>{money(preview.dueNowCents)}</b> is charged today to the card on file for the rest of this
              billing period.
            </>
          ) : (
            <>The rest of this billing period is charged today to the card on file, prorated.</>
          )}{" "}
        </>
      ) : null}
      {removing.length > 0 ? (
        <>
          <b>{names(removing)}</b> close{removing.length === 1 ? "s" : ""} as soon as you confirm; nothing is
          refunded for the rest of this cycle.{" "}
        </>
      ) : null}
      Your plan is <b>{money(monthly)}/mo</b> from the next bill.
    </>
  );
}
