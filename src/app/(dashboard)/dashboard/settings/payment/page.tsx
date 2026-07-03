import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { parsePaymentSettings } from "@/lib/settings";
import { PaymentForm } from "./payment-form";

export default async function PaymentSettingsPage() {
  const { organizationId } = await requireOrg();
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { paymentSettingsJson: true },
  });
  return <PaymentForm initial={parsePaymentSettings(org?.paymentSettingsJson)} />;
}
