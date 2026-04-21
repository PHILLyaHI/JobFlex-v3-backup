import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Construction } from "lucide-react";

export function ComingSoon({
  eyebrow,
  title,
  description,
  body,
}: {
  eyebrow?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  body?: string;
}) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <EmptyState
        icon={<Construction className="h-5 w-5" />}
        title="Coming in the next session"
        description={
          body ??
          "The schema, API, and nav for this page are scaffolded. The interactive view lands next — the rest of the app already works."
        }
      />
    </>
  );
}
