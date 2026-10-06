import { PageHeader } from "@/components/ui/PageHeader";
import { RoofEstimatorForm } from "@/components/estimator/roof/RoofEstimatorForm";
import { isEagleViewEnabled } from "@/lib/eagleview";
import { isOpenAIEnabled } from "@/lib/sdk/openai";
import { customPageGate } from "@/components/v3/upgrade-gate/custom-page-gate";

export default async function RoofEstimatorPage() {
  const gate = await customPageGate("roof-estimator");
  if (gate) return gate;
  return (
    <>
      <PageHeader
        eyebrow="Automation · AI"
        title="Roof estimator"
        description="Contract-grade aerial measurements — every facet's pitch and area, a labeled 2D/3D model, and a pre-priced breakdown you can send as a proposal."
      />
      <RoofEstimatorForm evEnabled={isEagleViewEnabled()} aiEnabled={isOpenAIEnabled()} />
    </>
  );
}
