import { PageHeader } from "@/components/ui/PageHeader";
import { RoofEstimatorForm } from "@/components/estimator/roof/RoofEstimatorForm";
import { isEagleViewEnabled } from "@/lib/eagleview";
import { isOpenAIEnabled } from "@/lib/sdk/openai";

export default function RoofEstimatorPage() {
  return (
    <>
      <PageHeader
        eyebrow="Automation · AI"
        title="Roof estimator"
        description="Contract-grade EagleView measurements — every facet's pitch and area, a labeled 2D/3D model, and a pre-priced breakdown you can send as a proposal."
      />
      <RoofEstimatorForm evEnabled={isEagleViewEnabled()} aiEnabled={isOpenAIEnabled()} />
    </>
  );
}
