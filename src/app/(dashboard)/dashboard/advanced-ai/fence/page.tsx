import { PageHeader } from "@/components/ui/PageHeader";
import { FenceEstimatorForm } from "@/components/estimator/fence/FenceEstimatorForm";

export default function FenceEstimatorPage() {
  return (
    <>
      <PageHeader
        eyebrow="Automation · AI"
        title="Fence estimator"
        description="Linear footage, material, gates, slope. Priced breakdown ready to convert to a proposal."
      />
      <FenceEstimatorForm />
    </>
  );
}
