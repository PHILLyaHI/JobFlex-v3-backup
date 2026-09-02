import { requireOrg } from "@/lib/orgContext";
import { getTemplatesWithUsage } from "@/lib/templatesUsage";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileText } from "lucide-react";
import { TemplateCard, type TemplateCardData } from "@/components/proposal/TemplateCard";

interface RawTemplateBody {
  lineItems?: Array<{ name: string; quantity: number; unitPrice: number }>;
  taxRate?: number;
}

function hydrate(raw: string): RawTemplateBody {
  try {
    const v = JSON.parse(raw);
    return typeof v === "object" && v ? v : {};
  } catch {
    return {};
  }
}

export default async function TemplatesPage() {
  const { organizationId } = await requireOrg();
  const templates = await getTemplatesWithUsage(organizationId);

  const cards: TemplateCardData[] = templates.map((t) => {
    const body = hydrate(t.body);
    const items = body.lineItems ?? [];
    const subtotal = items.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
    const total = subtotal * (1 + (body.taxRate ?? 0));
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      usageCount: t.usageCount,
      lineItemTeasers: items.map((l) => l.name).filter(Boolean),
      approxTotal: total,
      createdAt: t.createdAt,
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="Proposals"
        title="Templates"
        description="Reusable starting points. Save any proposal as a template, then spin up the next one in one click."
      />
      {cards.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="No templates yet"
          description='Open any proposal and choose "Save as template" to build your library.'
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {cards.map((c) => (
            <TemplateCard key={c.id} t={c} />
          ))}
        </div>
      )}
    </>
  );
}
