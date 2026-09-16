// The next bill's itemised lines, worded once for both editions of the
// subscription page (desktop blueprint + handheld build). Pure and client-safe:
// the only import is a type, erased at compile.

import type { NextCharge } from "./subscription-load";

export interface NextChargeLine {
  label: string;
  /** Signed display amount ("−$39.50"), or null for a note without one. */
  amount: string | null;
  /** "credit" reads as money off; "note" is quiet context. */
  tone: "credit" | "note";
}

export const usd = (cents: number) => "$" + (cents / 100).toFixed(2);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function nextChargeLines(nc: NextCharge): NextChargeLine[] {
  const lines: NextChargeLine[] = [];
  for (const note of nc.discountNotes) lines.push({ label: note, amount: null, tone: "credit" });
  if (nc.referralCreditCents > 0) {
    lines.push({
      label: nc.referralCount > 0 ? `Referral credit · ${plural(nc.referralCount, "referral")}` : "Account credit",
      amount: "−" + usd(nc.referralCreditCents),
      tone: "credit",
    });
  }
  if (nc.creditLeftCents > 0) {
    lines.push({ label: "Credit left for the bill after", amount: usd(nc.creditLeftCents), tone: "note" });
  }
  if (nc.perReferralCents > 0) {
    lines.push(
      nc.pendingReferrals > 0
        ? {
            label: `${plural(nc.pendingReferrals, "pending referral")} · ${usd(nc.perReferralCents)} off each once they subscribe`,
            amount: null,
            tone: "note",
          }
        : {
            label: `Every referral who subscribes takes ${usd(nc.perReferralCents)} off`,
            amount: null,
            tone: "note",
          },
    );
  }
  return lines;
}
