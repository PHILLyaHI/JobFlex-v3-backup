import { PageHeader } from "@/components/ui/PageHeader";
import { CompanyTabs } from "@/components/company/CompanyTabs";

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Company"
        description="Branding, public landing, team, and subscription — your business face inside JobFlex."
      />
      <CompanyTabs />
      {children}
    </>
  );
}
