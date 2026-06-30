import { ComingSoon } from "@/components/ui/ComingSoon";

export default function HireProfilePage() {
  return (
    <ComingSoon
      eyebrow="Marketplace"
      title="Your worker profile"
      description="Showcase your skills and past work, then get discovered by companies looking to hire."
      items={["Skills", "Portfolio", "Rates", "Reviews"]}
    />
  );
}
