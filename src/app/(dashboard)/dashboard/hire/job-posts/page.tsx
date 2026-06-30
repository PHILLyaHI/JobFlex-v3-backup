import { ComingSoon } from "@/components/ui/ComingSoon";

export default function HireJobPostsPage() {
  return (
    <ComingSoon
      eyebrow="Marketplace"
      title="Job posts"
      description="Post jobs, review applicants, and manage your listings in one place."
      items={["Create post", "Applicants", "Status"]}
    />
  );
}
