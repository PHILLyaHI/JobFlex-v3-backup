// Templates + usage counts for the templates page. Plain server module: this
// used to be an exported server action taking an organizationId argument,
// which let any caller read any org's template pricing book.
import { db } from "@/lib/db";

// Expose a light "usage count" query helper — reused in the templates page.
export async function getTemplatesWithUsage(organizationId: string) {
  const templates = await db.proposalTemplate.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });

  // Count proposals whose activity refers to the template — simple heuristic: match the
  // activity summary string "from template \"<name>\"". For a first pass this is good enough;
  // a dedicated usage column can land in a later pass.
  const usageByName = new Map<string, number>();
  const events = await db.activityEvent.findMany({
    where: { organizationId, summary: { contains: "from template " } },
    select: { summary: true },
    take: 500,
  });
  for (const e of events) {
    const m = e.summary.match(/from template "([^"]+)"/);
    if (m) usageByName.set(m[1], (usageByName.get(m[1]) ?? 0) + 1);
  }

  return templates.map((t) => ({
    ...t,
    usageCount: usageByName.get(t.name) ?? 0,
  }));
}
