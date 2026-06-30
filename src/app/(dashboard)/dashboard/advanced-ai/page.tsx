import { PageHeader } from "@/components/ui/PageHeader";
import { isOpenAIEnabled } from "@/lib/sdk/openai";
import { EstimatorStudio } from "./estimator-studio";

export default function AdvancedAiPage() {
  return (
    <>
      <PageHeader
        eyebrow="Sales · AI"
        title="Smart Proposal"
        description="Describe the job and AI prices real materials (live retail links), labor, and scope — separate material and labor breakdowns. Tune anything, then convert to a proposal in one click."
      />
      <EstimatorStudio aiEnabled={isOpenAIEnabled()} />
    </>
  );
}
