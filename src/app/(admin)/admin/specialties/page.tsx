import { requireUser } from "@/lib/orgContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { db } from "@/lib/db";

export default async function AdminSpecialtiesPage() {
  await requireUser();
  const specialties = await db.specialty.findMany({
    orderBy: { name: "asc" },
    include: { organization: { select: { name: true } } },
    take: 200,
  });
  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Specialties"
        description="Taxonomy used by AI lead categorization and proposal generation."
      />
      <Card>
        <CardHeader>
          <div>
            <CardTitle>All specialties</CardTitle>
            <CardSubtitle>{specialties.length} across all orgs</CardSubtitle>
          </div>
        </CardHeader>
        {specialties.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)]">
            No specialties defined yet. Each org can configure their own under Settings → AI.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {specialties.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-[13px] font-medium text-[color:var(--ink)]">{s.name}</div>
                  <div className="text-[11px] text-[color:var(--ink-muted)]">
                    {s.organization.name}
                  </div>
                  {s.promptPreamble && (
                    <div className="text-[11px] text-[color:var(--ink-muted)] mt-1 max-w-2xl line-clamp-2">
                      {s.promptPreamble}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
