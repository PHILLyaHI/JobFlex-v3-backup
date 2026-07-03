import { ExternalLink } from "lucide-react";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { money } from "@/lib/format";
import { merchantUrl } from "@/lib/merchantLinks";
import { MaterialThumb } from "./MaterialThumb";

/** Quantity reads as a whole number when it is one, else trimmed to 2 decimals. */
function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Materials Request — the shoppable view of an estimate's purchasable products.
 * Server component: fetches the proposal's material line items that carry a real
 * product link (materialCost > 0 AND productUrl set), org-scoped. Renders nothing
 * when there's nothing to buy, so it can drop into any detail page safely.
 */
export async function MaterialPurchasingList({ proposalId }: { proposalId: string }) {
  const { organizationId } = await requireOrg();

  const items = await db.lineItem.findMany({
    where: {
      proposalId,
      materialCost: { gt: 0 },
      productUrl: { not: null },
      proposal: { organizationId }, // tenant scope via the parent proposal
    },
    orderBy: { position: "asc" },
    select: {
      id: true,
      name: true,
      dimensions: true,
      store: true,
      productUrl: true,
      imageUrl: true,
      quantity: true,
      materialCost: true,
    },
  });

  if (items.length === 0) return null;

  const totalMaterial = items.reduce((a, i) => a + i.quantity * i.materialCost, 0);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Materials request</CardTitle>
          <CardSubtitle>Live-priced products from the AI estimate — review and buy.</CardSubtitle>
        </div>
        <Badge tone="neutral">
          {items.length} item{items.length === 1 ? "" : "s"}
        </Badge>
      </CardHeader>

      <ul className="divide-y divide-[color:var(--ink-line)]">
        {items.map((i) => {
          const lineTotal = i.quantity * i.materialCost;
          // Render-time link fix: a real merchant link is trusted, a Google
          // Shopping / missing link becomes a direct on-site search at the store.
          // merchantUrl only ever returns a safe http(s) URL or null, so it also
          // serves as the XSS guard the old safeHttpUrl provided.
          const href = merchantUrl(i.store, i.name, i.productUrl);
          return (
            <li key={i.id} className="flex items-center gap-4 py-4">
              <MaterialThumb src={i.imageUrl} alt={i.name} />

              <div className="min-w-0 flex-1">
                <div className="font-medium text-[color:var(--ink)] truncate">{i.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-[color:var(--ink-muted)]">
                  {i.dimensions && <span>{i.dimensions}</span>}
                  <span className="tabular">Qty {formatQty(i.quantity)}</span>
                  {i.store && <Badge tone="neutral">{i.store}</Badge>}
                </div>
              </div>

              <div className="shrink-0 text-right leading-tight">
                <div className="font-display tabular text-[15px] text-[color:var(--ink)]">
                  {money(lineTotal)}
                </div>
                <div className="mt-0.5 text-[10.5px] tabular text-[color:var(--ink-faint)]">
                  {money(i.materialCost)} / unit
                </div>
              </div>

              {href && (
                <a href={href} target="_blank" rel="noopener noreferrer" className="shrink-0">
                  <Button size="sm" variant="outline" icon={<ExternalLink className="h-3.5 w-3.5" />}>
                    {i.store ? `Buy at ${i.store}` : "View store"}
                  </Button>
                </a>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex items-center justify-between border-t border-[color:var(--ink-line)] pt-4">
        <span className="quiet-caps">Total material cost</span>
        <span className="font-display tabular text-[22px] tracking-[-0.015em] text-[color:var(--ink)]">
          {money(totalMaterial)}
        </span>
      </div>
    </Card>
  );
}
