"use client";

// ONE WAY OF PRICING ON THE LEAD PAGE (2026-09-26). The whole card is its
// form's submit button, so the card can say it is working while the hand-off
// (actions/leadEstimate) files the client and redirects — useFormStatus reads
// that from the form this button sits in. The page around it stays a server
// component; the card's icon and words arrive as children.

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function EstimateCardButton({
  className,
  goClassName,
  engine,
  label,
  describedBy,
  children,
}: {
  className: string;
  /** The "Start estimate" plate at the card's end. */
  goClassName: string;
  engine: string;
  /** The card's accessible name — the estimator, not every word on the card. */
  label: string;
  /** The id of the line that says what the estimator does (and needs). */
  describedBy: string;
  children: ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      data-estimator={engine}
      aria-label={label}
      aria-describedby={describedBy}
      aria-busy={pending || undefined}
      disabled={pending}
    >
      {children}
      <span className={goClassName}>{pending ? "Opening…" : "Start estimate"}</span>
    </button>
  );
}
