import { ComingSoon } from "@/components/ui/ComingSoon";

export default function HireTalentPage() {
  return (
    <ComingSoon
      eyebrow="Marketplace"
      title="Discover talent"
      description="Browse worker profiles, view portfolios, and find the right contractor for your next project."
      items={["Profile search", "Portfolios", "Specialties", "Availability"]}
    />
  );
}
