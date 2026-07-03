import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Construction } from "lucide-react";

export function ComingSoon({
  eyebrow,
  title,
  description,
  body,
  items,
}: {
  eyebrow?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  body?: string;
  items?: string[];
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
        action={
          items && items.length > 0 ? (
            <ul className="flex flex-wrap items-center justify-center gap-2">
              {items.map((it) => (
                <li
                  key={it}
                  className="inline-flex items-center rounded-full bg-black/[0.05] px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--ink-soft)]"
                >
                  {it}
                </li>
              ))}
            </ul>
          ) : undefined
        }
      />
    </>
  );
}
