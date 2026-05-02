import { PageHeader } from "@/components/ui/PageHeader";
import { isOpenAIEnabled } from "@/lib/sdk/openai";
import { EstimatorStudio } from "./estimator-studio";

export default function AdvancedAiPage() {
  return (
    <>
      <PageHeader
        eyebrow="Automation · AI"
        title="Advanced AI Estimator"
        description="Project-type aware pricing with separate material + labor breakdowns. Tune anything, then convert to a proposal in one click."
      />
      <EstimatorStudio aiEnabled={isOpenAIEnabled()} />
    </>
  );
}
