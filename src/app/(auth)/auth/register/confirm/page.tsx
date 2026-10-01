// /auth/register/confirm?t=… — the link in the card-less trial's confirmation
// email (owner, 2026-10-01: the address is confirmed before the dashboard).
// Opening it creates the shop and its 7-day trial (confirmCardlessTrial),
// signs the shop in and sends it to the dashboard. The page is the
// register's own blueprint scope, one framed card, the same at every width.
import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmTrial } from "./confirm-trial";

export const metadata: Metadata = {
  title: "JobFlex · Confirm your email",
  description: "Confirm your email to start your free trial.",
  robots: { index: false },
};

export default function ConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmTrial />
    </Suspense>
  );
}
