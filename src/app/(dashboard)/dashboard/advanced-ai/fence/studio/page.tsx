import { PageHeader } from "@/components/ui/PageHeader";
import { FenceStudio } from "@/components/estimator/fence/FenceStudio";
import { customPageGate } from "@/components/v3/upgrade-gate/custom-page-gate";

export default async function FenceStudioPage() {
  const gate = await customPageGate("fence-estimator");
  if (gate) return gate;
  return (
    <>
      <PageHeader
        eyebrow="Automation · AI"
        title="Fence studio"
        description="Swap materials, heights, and gates and watch the estimate update live in 3D."
      />
      <FenceStudio />
    </>
  );
}
