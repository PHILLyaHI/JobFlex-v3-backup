import { PageHeader } from "@/components/ui/PageHeader";
import { FinancialsTabs } from "@/components/financials/FinancialsTabs";

export default function FinancialsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader
        eyebrow="Money"
        title="Financials"
        description="Profit & loss, invoices, expenses, and change orders — every dollar in one place."
      />
      <FinancialsTabs />
      {children}
    </>
  );
}
