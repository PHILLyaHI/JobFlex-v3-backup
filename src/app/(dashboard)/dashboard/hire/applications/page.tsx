import { ComingSoon } from "@/components/ui/ComingSoon";

export default function HireApplicationsPage() {
  return (
    <ComingSoon
      eyebrow="Marketplace"
      title="Applications"
      description="Track the jobs you've applied to and where each one stands."
      items={["Sent", "Under review", "Offers"]}
    />
  );
}
