import { PageHeader } from "@/components/ui/PageHeader";
import { CrmTabs } from "@/components/crm/CrmTabs";

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader
        eyebrow="Pipeline"
        title="CRM"
        description="The macro view across leads, customers, workflows, and the follow-up queue."
      />
      <CrmTabs />
      {children}
    </>
  );
}
