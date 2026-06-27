import { PageHeader } from "@/components/ui/PageHeader";
import { FenceStudio } from "@/components/estimator/fence/FenceStudio";

export default function FenceStudioPage() {
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
