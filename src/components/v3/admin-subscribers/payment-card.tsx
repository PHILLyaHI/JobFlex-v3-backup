// How a subscriber pays, as /admin/subscribers and /admin/trials print it
// (lib/paymentCard): the brand or method name in the table's sans, the card's
// last four in mono, "No card" quieter. null = unknown (Stripe was not read,
// or did not return the subscription), which is not "No card"; `why` says which.
import type { PaymentCard } from "@/lib/paymentCard";
import c from "./payment-card.module.css";

export function PaymentCardLabel({ card, why = "Stripe was not read" }: { card: PaymentCard | null; why?: string }) {
  if (!card) {
    return (
      <span className={c.unknown} title={why} aria-label={`Card unknown: ${why}`} data-card-kind="unknown">
        —
      </span>
    );
  }
  if (card.kind === "none") {
    return (
      <span className={c.none} data-card-kind="none">
        {card.label}
      </span>
    );
  }
  return (
    <span className={c.method} data-card-kind={card.kind} title={card.label}>
      {card.brand}
      {card.last4 && <> <span className={c.digits}>···· {card.last4}</span></>}
    </span>
  );
}
