import { ComingSoon } from "@/components/ui/ComingSoon";

export default function HireContractsPage() {
  return (
    <ComingSoon
      eyebrow="Marketplace"
      title="Contracts"
      description="Track active agreements, milestones, and payments between hirers and workers."
      items={["Agreements", "Milestones", "Payments"]}
    />
  );
}
