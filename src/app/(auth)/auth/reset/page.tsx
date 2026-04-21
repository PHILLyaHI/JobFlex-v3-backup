import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { KeyRound } from "lucide-react";

export default function ResetPage() {
  return (
    <main className="mx-auto max-w-xl p-10">
      <PageHeader eyebrow="Reset" title="Password reset" />
      <EmptyState
        icon={<KeyRound className="h-5 w-5" />}
        title="Coming soon"
        description="Password reset flows land in the next iteration. For demo access, contact the account owner."
      />
    </main>
  );
}
