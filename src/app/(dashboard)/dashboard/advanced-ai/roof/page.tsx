import { PageHeader } from "@/components/ui/PageHeader";
import { RoofEstimatorForm } from "@/components/estimator/roof/RoofEstimatorForm";
import { isMapsEnabled } from "@/lib/maps";
import { isOpenAIEnabled } from "@/lib/sdk/openai";

export default function RoofEstimatorPage() {
  return (
    <>
      <PageHeader
        eyebrow="Automation · AI"
        title="Roof estimator"
        description="Satellite preview from an address, pitch + waste factor, and a pre-priced breakdown you can send as a proposal."
      />
      <RoofEstimatorForm
        mapsEnabled={isMapsEnabled()}
        aiEnabled={isOpenAIEnabled()}
      />
    </>
  );
}
